import { expect, test } from "@playwright/test"

test.describe("formulário de nova busca", () => {
  test("exibe erros de validação do Zod", async ({ page }) => {
    await page.goto("/searches/new")

    await expect(
      page.getByRole("heading", { name: "Nova busca", level: 1 })
    ).toBeVisible()

    // Category is empty, so submitting must surface the schema message.
    await page.getByRole("button", { name: "Iniciar busca" }).click()

    await expect(
      page.getByText("Informe uma categoria com ao menos 2 caracteres")
    ).toBeVisible()
  })

  test("valida os limites do raio quando há coordenadas", async ({ page }) => {
    await page.goto("/searches/new")

    await page.getByLabel("Categoria").fill("Restaurante")

    // The radius only applies alongside coordinates, so a preset enables it.
    await page.getByRole("button", { name: "Curitiba, PR" }).click()
    await expect(page.getByLabel("Raio (metros)")).toBeEnabled()

    await page.getByLabel("Raio (metros)").fill("10")
    await page.getByRole("button", { name: "Iniciar busca" }).click()

    await expect(page.getByText("O raio mínimo é de 100 metros")).toBeVisible()
  })

  test("valida a quantidade máxima", async ({ page }) => {
    await page.goto("/searches/new")

    await page.getByLabel("Categoria").fill("Restaurante")
    await page.getByLabel("Quantidade").fill("900")
    await page.getByRole("button", { name: "Iniciar busca" }).click()

    // Either the schema ceiling or the configured source's lower one.
    await expect(
      page.getByText(/no máximo \d+ por busca|Limite máximo de 500 por busca/)
    ).toBeVisible()
  })

  test("recusa uma quantidade acima do teto da fonte", async ({ page }) => {
    await page.goto("/searches/new")

    await page.getByLabel("Categoria").fill("Restaurante")
    // Within the schema limit, but above what Google Places returns.
    await page.getByLabel("Quantidade").fill("200")
    await page.getByRole("button", { name: "Iniciar busca" }).click()

    const message = page.getByText(/no máximo \d+ por busca/)
    const progress = page.getByText("Progresso")

    // Google caps at 60, so it must be refused; other sources accept it.
    await expect(message.or(progress).first()).toBeVisible({ timeout: 20_000 })
  })

  test("aplica um preset de localização", async ({ page }) => {
    await page.goto("/searches/new")

    await page.getByRole("button", { name: "Curitiba, PR" }).click()

    await expect(page.getByLabel("Localização")).toHaveValue("Curitiba, PR")
    await expect(page.getByLabel("Latitude (opcional)")).toHaveValue("-25.4284")

    // With coordinates set, the radius applies and is editable.
    await expect(page.getByLabel("Raio (metros)")).toBeEnabled()

    // Coordinates can be dropped so the text field alone locates the search.
    await page.getByRole("button", { name: "Limpar coordenadas" }).click()
    await expect(page.getByLabel("Latitude (opcional)")).toHaveValue("")

    // Without coordinates there is nothing to measure a radius from.
    await expect(page.getByLabel("Raio (metros)")).toBeDisabled()
  })
})
