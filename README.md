# Lead Finder

Sistema local de coleta, enriquecimento e qualificação de empresas para prospecção B2B.

Coleta estabelecimentos por categoria e região, armazena **todos** no MongoDB
(com ou sem website), enriquece os que possuem site em busca de e-mails, redes
sociais e tecnologias, e disponibiliza filtros combináveis em um painel
administrativo.

## Stack

Next.js 16 (App Router) · TypeScript · MongoDB + Mongoose 9 · Tailwind CSS 4 ·
shadcn/ui · Zod 4 · React Hook Form · TanStack Query · Vitest · Playwright ·
ESLint · Prettier

## Requisitos

- Node.js 20+
- MongoDB acessível (local, Docker ou Atlas)

Sem MongoDB instalado? O projeto inclui um banco em memória descartável:

```bash
npm run dev:db
```

## Como executar

```bash
npm install
cp .env.example .env.local

npm run dev:db     # opcional: MongoDB em memória na porta 27017
npm run seed       # opcional: popula a base com dados de exemplo
npm run dev
```

A aplicação sobe em http://localhost:3000

## Variáveis de ambiente

| Variável                   | Padrão                                    | Descrição                                                   |
| -------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `MONGODB_URI`              | `mongodb://127.0.0.1:27017/lead-finder`   | String de conexão do MongoDB.                               |
| `PLACES_SOURCE`            | `mock`                                    | Fonte de coleta: `mock` (offline) ou `osm` (OpenStreetMap). |
| `OVERPASS_ENDPOINT`        | `https://overpass-api.de/api/interpreter` | Endpoint usado pela fonte `osm`.                            |
| `CRAWLER_CONCURRENCY`      | `2`                                       | Requisições simultâneas no enriquecimento.                  |
| `CRAWLER_REQUEST_DELAY_MS` | `1200`                                    | Intervalo mínimo entre requisições.                         |
| `CRAWLER_TIMEOUT_MS`       | `15000`                                   | Timeout de cada requisição.                                 |
| `CRAWLER_USER_AGENT`       | `LeadFinder/1.0 (+local research tool)`   | User-Agent do crawler.                                      |

### Fontes de coleta

- **`mock`** (padrão): gerador determinístico, sem rede e sem chave de API.
  Cerca de 40% dos estabelecimentos são gerados sem website — justamente o
  segmento-alvo da prospecção.
- **`osm`**: OpenStreetMap via Overpass API. Dados reais, sem chave de API. O
  OSM não possui rating/avaliações, então esses campos ficam vazios.

## Scripts

```bash
npm run dev          # servidor de desenvolvimento
npm run dev:db       # MongoDB em memória (porta 27017)
npm run build        # build de produção
npm run start        # servidor de produção
npm run seed         # popula a base com buscas de exemplo
npm run crawler      # executa uma coleta pela CLI
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run test         # testes unitários e de integração (Vitest)
npm run test:e2e     # testes end-to-end (Playwright)
npm run format       # Prettier
```

### Crawler pela CLI

```bash
npm run crawler -- --category "Restaurante" --location "São Paulo, SP" \
  --lat -23.5505 --lng -46.6333 --radius 3000 --limit 50
```

## Arquitetura

Camadas com responsabilidade única, do mais externo ao mais interno:

```
views/         composição de tela (Client Components)
components/    UI pura, sem regra de negócio
viewmodels/    estado de interface + data fetching (TanStack Query)
services/      regras de negócio
repositories/  persistência e tradução de filtros para MongoDB
models/        schemas Mongoose
domain/        tipos e regras puras, sem I/O
schemas/       validação Zod (entrada de API e formulários)
```

O **crawler** é independente do Next.js e roda também pela CLI:

```
crawler/
├── sources/   adaptadores de coleta (mock, OSM)
├── parsers/   normalização de lugares e extração de HTML
├── queue/     fila com concorrência limitada
└── workers/   coleta e enriquecimento
```

### Decisões relevantes

- **Identidade de um estabelecimento** é `(source, externalId)`, com índice
  único. Recoletar atualiza em vez de duplicar.
- **Todo estabelecimento é armazenado**, com ou sem website. O filtro "sem
  website" é aplicado apenas na consulta.
- **Filtros vivem na URL**, então uma visão filtrada é compartilhável e
  sobrevive a um refresh.
- **Buscas rodam em background**: a API responde imediatamente e a interface
  acompanha o progresso por polling, encerrando em status terminal.
- **Validação é exclusivamente Zod**. Os formulários usam `noValidate` para que
  as mensagens em português apareçam no lugar dos tooltips nativos do browser.

## Testes

```bash
npm run test       # 61 testes: parsers, fila, filtros, persistência
npm run test:e2e   #  9 testes: navegação, validação, fluxo de coleta
```

Os testes de persistência sobem um MongoDB em memória e exercitam a
deduplicação, os filtros e as agregações contra um banco real.
