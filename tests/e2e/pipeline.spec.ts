import { expect, test } from "@playwright/test"

test("cadastra uma empresa manualmente e ela entra no funil", async ({
  page,
}) => {
  const nome = `Teste Manual ${Date.now().toString().slice(-6)}`

  await page.goto("/businesses")
  await page.getByRole("button", { name: "Nova empresa" }).click()

  await expect(page.getByRole("dialog")).toBeVisible()
  await page.getByLabel("Nome").fill(nome)
  await page.getByLabel("Categoria").fill("Padaria")
  await page.getByRole("button", { name: "Cadastrar empresa" }).click()

  await expect(page.getByText("Empresa cadastrada.")).toBeVisible({
    timeout: 15_000,
  })

  // The switch defaults to on, so the lead lands on the board.
  await page.goto("/pipeline")
  await expect(page.getByText(nome)).toBeVisible({ timeout: 15_000 })
})

test("exige o nome ao cadastrar", async ({ page }) => {
  await page.goto("/businesses")
  await page.getByRole("button", { name: "Nova empresa" }).click()
  await page.getByRole("button", { name: "Cadastrar empresa" }).click()

  await expect(page.getByText("Informe o nome da empresa")).toBeVisible()
})

test("envia empresas da tabela para o funil", async ({ page }) => {
  await page.goto("/businesses")

  const boxes = page.getByRole("checkbox")
  await expect(boxes.nth(1)).toBeVisible({ timeout: 15_000 })
  await boxes.nth(1).click()

  await expect(page.getByText("1 empresa selecionada")).toBeVisible()
  await page.getByRole("button", { name: "Enviar para o funil" }).click()

  // Either it was added, or it was already there — both are valid outcomes.
  await expect(
    page
      .getByText(/adicionada ao funil|Nenhuma empresa nova adicionada/)
      .first()
  ).toBeVisible({ timeout: 15_000 })
})

test("o funil mostra as sete colunas de prospecção", async ({ page }) => {
  await page.goto("/pipeline")

  for (const coluna of [
    "Novo",
    "Contatado",
    "Respondeu",
    "Reunião",
    "Proposta",
    "Ganho",
    "Perdido",
  ]) {
    await expect(page.getByText(coluna, { exact: true })).toBeVisible({
      timeout: 15_000,
    })
  }
})
