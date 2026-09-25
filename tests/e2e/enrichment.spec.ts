import { expect, test } from "@playwright/test"

/**
 * Exercises the enrichment buttons through the UI. A regression here would
 * otherwise only show up at runtime, since the views call the API by URL
 * string and a removed route still type-checks.
 *
 * The website filter is applied up front: only leads with a site can be
 * enriched, so it keeps the selection meaningful regardless of table order.
 */
test("enriquecer pela página de detalhes inicia uma execução", async ({
  page,
}) => {
  await page.goto("/businesses?website=yes")

  const firstRow = page.locator("tbody tr").first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.getByRole("link").first().click()

  await expect(page).toHaveURL(/\/businesses\/[0-9a-f]{24}/)

  const enrich = page.getByRole("button", { name: "Enriquecer" }).first()
  await expect(enrich).toBeEnabled()
  await enrich.click()

  await expect(page.getByText("Enriquecimento iniciado.")).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/Falha na requisição/)).toHaveCount(0)
})

test("enriquecer em massa pela tabela inicia uma execução", async ({
  page,
}) => {
  await page.goto("/businesses?website=yes")

  const checkboxes = page.getByRole("checkbox")
  await expect(checkboxes.nth(1)).toBeVisible({ timeout: 15_000 })

  await checkboxes.nth(1).click()
  await checkboxes.nth(2).click()

  await expect(page.getByText("2 empresas selecionadas")).toBeVisible()

  await page.getByRole("button", { name: "Enriquecer", exact: true }).click()

  await expect(page.getByText("Enriquecimento iniciado.")).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/Falha na requisição/)).toHaveCount(0)
})

test("avisa ao enriquecer empresas sem website", async ({ page }) => {
  await page.goto("/businesses?website=no")

  const checkboxes = page.getByRole("checkbox")
  await expect(checkboxes.nth(1)).toBeVisible({ timeout: 15_000 })
  await checkboxes.nth(1).click()

  await page.getByRole("button", { name: "Enriquecer", exact: true }).click()

  // No request is sent: there is no site to read.
  await expect(
    page.getByText("Nenhuma das empresas selecionadas possui website.")
  ).toBeVisible({ timeout: 15_000 })
})
