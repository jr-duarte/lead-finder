# Lead Finder

Sistema local de prospecção B2B: coleta estabelecimentos por região, enriquece
os dados a partir do site de cada empresa e acompanha as negociações em um
funil kanban.

Roda inteiramente na sua máquina. Os dados são seus, ficam no seu MongoDB, e
não há serviço intermediário.

> **Status:** funcional e testado, porém em evolução. Feito para uso local e
> single-user — não há autenticação nem multi-tenancy.

---

## Índice

- [O problema que resolve](#o-problema-que-resolve)
- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Fontes de coleta](#fontes-de-coleta)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Arquitetura](#arquitetura)
- [Testes](#testes)
- [Limitações conhecidas](#limitações-conhecidas)
- [Contribuindo](#contribuindo)
- [Licença](#licença)

---

## O problema que resolve

Prospecção local costuma ser feita à mão: buscar no Google Maps, abrir cada
site, procurar o e-mail, anotar numa planilha. Para algumas dezenas de leads é
viável; para centenas, não.

O Lead Finder automatiza as três etapas:

```
1. COLETA          Google Places / OpenStreetMap
                   → nome, endereço, telefone, site, rating, avaliações

2. ENRIQUECIMENTO  o site da própria empresa
                   → e-mails, Instagram, Facebook, WhatsApp, LinkedIn,
                     tecnologias usadas (WordPress, Shopify, Meta Pixel…)

3. PROSPECÇÃO      funil kanban com anotações por lead
```

Um ponto central do produto: **empresas sem website são armazenadas do mesmo
jeito**. Elas costumam ser o público mais receptivo, então existe filtro
dedicado para isolá-las.

---

## Funcionalidades

### Coleta

- Busca por categoria e localização, com fontes plugáveis
- Coordenadas opcionais (o Google localiza pelo texto; o OSM exige o ponto)
- Execução em background com barra de progresso e cancelamento
- Deduplicação por `(fonte, id externo)`: recoletar **atualiza** em vez de
  duplicar, mantendo a base fresca sem inflar
- Detecção de empresas encerradas (`CLOSED_PERMANENTLY`), ocultadas por padrão

### Enriquecimento

- Lê o HTML do site e extrai e-mails, redes sociais e tecnologias
- Segue links de "Contato" e "Sobre" quando a home não traz e-mail
- Renderização opcional de JavaScript via Playwright, acionada **somente**
  quando a página chega vazia (sites React/Vue e perfis de rede social)
- Jobs em background: fecha a aba e continua rodando; dá para cancelar e retomar
- Erros traduzidos para algo acionável ("o site está fora do ar", "bloqueou
  acesso automatizado") em vez de códigos HTTP crus

### Gestão

- Tabela com filtros combináveis: categoria, cidade, estado, rating, avaliações,
  presença de site/telefone/Instagram, data da coleta, etapa do funil
- Filtros vivem na URL, então uma visão filtrada é compartilhável
- Funil kanban com 7 etapas, drag and drop com suporte a mouse, toque e teclado
- Anotações por lead, que registram a etapa do funil no momento da escrita
- Cadastro manual de empresas
- Exportação CSV com 30 colunas, protegida contra injeção de fórmula
- Dashboard com métricas do funil em destaque e taxa de conversão
- Dark mode

---

## Stack

| Camada          | Tecnologia                         |
| --------------- | ---------------------------------- |
| Framework       | Next.js 16 (App Router) + React 19 |
| Linguagem       | TypeScript                         |
| Banco           | MongoDB + Mongoose 9               |
| Estilo          | Tailwind CSS 4 + shadcn/ui         |
| Validação       | Zod 4                              |
| Formulários     | React Hook Form                    |
| Estado servidor | TanStack Query                     |
| Drag and drop   | dnd-kit                            |
| Testes          | Vitest + Playwright                |
| Qualidade       | ESLint + Prettier                  |

---

## Como rodar

### Requisitos

- Node.js 20 ou superior
- MongoDB (local, Docker ou Atlas)

### Instalação

```bash
git clone <url-do-repositorio>
cd lead-finder
npm install
cp .env.example .env.local
```

### Banco de dados

Se você já tem um MongoDB, ajuste `MONGODB_URI` no `.env.local`.

Se não tem, o projeto inclui um banco em memória para começar sem instalar
nada:

```bash
npm run dev:db     # sobe um MongoDB na porta 27017
```

> O banco em memória **perde os dados ao encerrar**. Serve para experimentar;
> para uso real, instale um MongoDB de verdade ou use o Atlas.

### Rodando

```bash
npm run seed       # opcional: popula com dados de exemplo (fonte mock)
npm run dev
```

Acesse http://localhost:3000

### Primeira busca

1. Vá em **Buscas → Nova busca**
2. Informe categoria (ex.: `Restaurante`) e localização (ex.: `Santana, São Paulo, SP`)
3. Clique em **Iniciar busca**

Com a fonte padrão (`mock`) os dados são fictícios e funcionam offline. Para
dados reais, veja a seção a seguir.

---

## Fontes de coleta

A fonte é definida por `PLACES_SOURCE` no `.env.local`.

| Fonte    | Dados reais | Rating | Chave de API | Limite por busca |
| -------- | ----------- | ------ | ------------ | ---------------- |
| `mock`   | ❌ gerados  | ✅     | —            | 500              |
| `osm`    | ✅          | ❌     | —            | 500              |
| `google` | ✅          | ✅     | obrigatória  | 60               |

### `mock` (padrão)

Gerador determinístico, sem rede. Cerca de 40% das empresas nascem sem website,
o que reproduz o cenário real. Útil para desenvolver e testar.

### `osm` — OpenStreetMap

Dados reais via [Overpass API](https://overpass-api.de/), pública e gratuita.
O OSM **não tem sistema de avaliação**, então rating e número de avaliações
ficam vazios, e os filtros correspondentes não funcionam. A cobertura depende
de voluntários: centros de capitais são bem mapeados, cidades pequenas nem
tanto.

Exige latitude e longitude, já que a busca é por raio em torno de um ponto.

### `google` — Google Places API

Dados completos, incluindo rating, avaliações e situação do negócio.

**Como obter a chave:**

1. Acesse o [Google Cloud Console](https://console.cloud.google.com) e crie um projeto
2. Ative o faturamento (obrigatório mesmo para usar o crédito gratuito)
3. Em **APIs e serviços → Biblioteca**, ative a **Places API (New)** — atenção:
   não é a "Places API" legada
4. Em **Credenciais**, crie uma **Chave de API**
5. Restrinja a chave à Places API (New)
6. Configure um **orçamento com alerta** em Faturamento → Orçamentos

**Sobre custo:** o Google oferece US$ 200 de crédito mensal. Cada requisição
retorna até 20 lugares, então uma busca de 60 consome 3 requisições. Na
prática, o crédito cobre algo em torno de 6.000 requisições por mês.

Os limites eficientes são **20, 40 e 60** — pedir 25 custa o mesmo que pedir 40.

**Estratégia:** variar a **categoria** rende mais que variar o bairro.
"Restaurante em Santana" esgota em 60 resultados; somando Pizzaria, Cantina,
Japonês e Churrascaria no mesmo bairro, chega-se a 200+ leads únicos.

---

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e ajuste.

| Variável                    | Padrão                                  | Descrição                                                                  |
| --------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `MONGODB_URI`               | `mongodb://127.0.0.1:27017/lead-finder` | Conexão do MongoDB.                                                        |
| `PLACES_SOURCE`             | `mock`                                  | `mock`, `osm` ou `google`.                                                 |
| `GOOGLE_MAPS_API_KEY`       | —                                       | Obrigatória quando a fonte é `google`.                                     |
| `GOOGLE_PLACES_ENDPOINT`    | endpoint oficial                        | Raramente precisa mudar.                                                   |
| `OVERPASS_ENDPOINT`         | endpoint público                        | Usado pela fonte `osm`.                                                    |
| `CRAWLER_CONCURRENCY`       | `2`                                     | Sites acessados em paralelo no enriquecimento.                             |
| `CRAWLER_REQUEST_DELAY_MS`  | `1200`                                  | Intervalo mínimo entre requisições.                                        |
| `CRAWLER_TIMEOUT_MS`        | `15000`                                 | Tempo limite por requisição.                                               |
| `CRAWLER_MAX_CONTACT_PAGES` | `2`                                     | Páginas de contato visitadas quando a home não traz e-mail (`0` desativa). |
| `CRAWLER_USER_AGENT`        | `LeadFinder/1.0 …`                      | Identificação do crawler.                                                  |

> **Nunca versione o `.env.local`.** Ele está no `.gitignore`, junto com
> variantes como `.env*.bak`.

---

## Scripts

```bash
npm run dev          # servidor de desenvolvimento
npm run dev:db       # MongoDB em memória (porta 27017)
npm run build        # build de produção
npm run start        # servidor de produção

npm run seed         # popula a base com buscas de exemplo
npm run crawler      # executa uma coleta pela linha de comando

npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run test         # testes unitários e de integração
npm run test:watch   # testes em modo watch
npm run test:e2e     # testes end-to-end
npm run format       # Prettier
```

### Crawler pela CLI

O crawler é independente do Next.js e roda sozinho:

```bash
npm run crawler -- --category "Restaurante" --location "Santana, São Paulo, SP" \
  --lat -23.5020 --lng -46.6250 --radius 3000 --limit 60
```

---

## Arquitetura

Camadas com responsabilidade única, do mais externo ao mais interno:

```
src/
├── app/              rotas (App Router) e endpoints de API
├── views/            composição de tela
├── components/       UI, sem regra de negócio
│   ├── ui/           primitivos do shadcn/ui
│   ├── businesses/   tabela, diálogos, badges
│   ├── pipeline/     board kanban e cards
│   ├── notes/        área de anotações
│   ├── filters/      barra de filtros
│   └── dashboard/    KPIs e gráficos
├── viewmodels/       estado de interface + data fetching (TanStack Query)
├── services/         regras de negócio
├── repositories/     persistência e tradução de filtros para MongoDB
├── models/           schemas Mongoose
├── domain/           tipos e regras puras, sem I/O
├── schemas/          validação Zod (API e formulários)
└── lib/              utilitários (conexão, formatação, cliente HTTP)
```

O **crawler** vive fora do Next.js e pode rodar pela CLI:

```
crawler/
├── sources/          adaptadores de coleta (mock, osm, google)
├── parsers/          normalização de lugares e extração de HTML
├── queue/            fila com concorrência limitada
└── workers/          coleta, enriquecimento e renderização
```

### Decisões de design

**Identidade de um estabelecimento é `(source, externalId)`**, com índice
único. O `externalId` do Google (`ChIJ...`) é estável, então recoletar a mesma
região atualiza os registros em vez de duplicá-los.

**Todo estabelecimento é armazenado**, com ou sem website. O filtro "sem
website" é aplicado apenas na consulta — os dados nunca são descartados na
coleta.

**Filtros vivem na URL.** Uma visão filtrada é compartilhável e sobrevive a um
refresh.

**Trabalho longo roda em background.** Buscas e enriquecimentos criam um job
persistido no MongoDB e respondem imediatamente; a interface acompanha por
polling. O progresso é gravado item a item, de forma atômica, então um crash
perde no máximo o item em voo. Jobs interrompidos por reinício do servidor são
detectados por heartbeat e podem ser retomados.

**Renderização de JavaScript é condicional.** O navegador headless só é
acionado quando o HTML simples chega vazio — em sites tradicionais, o custo é
zero. Se o Playwright não estiver instalado, o sistema degrada para o modo
simples sem falhar.

**Validação é exclusivamente Zod.** Os formulários usam `noValidate` para que
as mensagens em português apareçam no lugar dos tooltips nativos do navegador.

**Anotações congelam a etapa do funil.** Cada anotação guarda em que etapa a
empresa estava quando foi escrita, preservando o contexto histórico depois que
o lead avança.

---

## Testes

```bash
npm run test       # 171 testes: parsers, filas, filtros, persistência, funil
npm run test:e2e   #  24 testes: navegação, formulários, coleta, funil, anotações
```

Os testes de persistência sobem um MongoDB em memória e exercitam deduplicação,
filtros e agregações contra um banco real — não contra mocks.

Os E2E rodam com Playwright contra o build de produção. O teste de coleta é
pulado automaticamente quando a fonte configurada não tem credencial.

---

## Limitações conhecidas

**Não roda em serverless.** Jobs em background dependem de um processo
persistente. Em Lambda (Vercel, Amplify), o processo congela após a resposta
HTTP e os jobs ficam travados. Para hospedar, use um ambiente com contêiner
(Railway, Render, Fly.io, VPS) ou separe o crawler em um worker próprio.

**Playwright é pesado.** O Chromium não cabe no limite de deploy do Lambda. Em
ambientes sem ele, a renderização de JavaScript degrada silenciosamente para o
modo simples.

**Sem autenticação.** O sistema assume uso local single-user. Expor na internet
sem colocar autenticação na frente dá acesso irrestrito aos dados.

**Google Places entrega no máximo 60 resultados por consulta.** É limite da
API, não do sistema. Contorna-se com buscas mais específicas.

**Alguns sites bloqueiam o crawler.** Respostas 403 são comuns em sites com
proteção anti-bot. O sistema registra o motivo e segue adiante.

---

## Contribuindo

Contribuições são bem-vindas. Antes de abrir um PR:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Os quatro precisam passar. Se a mudança afeta a interface, rode também
`npm run test:e2e`.

### Convenções

- Comentários e nomes de código em inglês; textos de interface em português
- Comentários explicam **por que**, não o que o código faz
- shadcn/ui é a primeira opção para componentes visuais
- Regra de negócio fica em `services/`, persistência em `repositories/`,
  componentes de UI não contêm lógica de domínio
- Toda entrada é validada com Zod

### Ideias de contribuição

- Novos adaptadores de fonte em `crawler/sources/` (basta implementar `PlaceSource`)
- Worker separado consumindo a coleção `enrichment_jobs`
- Autenticação para permitir deploy compartilhado
- Mais sinais de detecção de tecnologia em `website.parser.ts`

---

## Licença

MIT — veja [LICENSE](LICENSE).

---

## Aviso de uso

Esta ferramenta acessa sites públicos para extrair informações de contato
publicadas abertamente. Ao usá-la:

- Respeite os Termos de Serviço das fontes de dados
- Mantenha os intervalos entre requisições (`CRAWLER_REQUEST_DELAY_MS`)
- Ao abordar os leads coletados, siga a legislação aplicável de proteção de
  dados e de comunicação comercial — no Brasil, a LGPD
