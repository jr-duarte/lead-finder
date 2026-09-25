import { expect, test } from "@playwright/test"

/**
 * Exercises the enrichment buttons through the UI. A regression here would
 * otherwise only show up at runtime, since the views call the API by URL
 * string and a removed route still type-checks.
 */
test("enriquecer pela página de detalhes inicia uma execução", async ({
  page,
}) => {
  await page.goto("/businesses")

  // Any lead with a website can be enriched.
  await page
    .getByRole("combobox")
    .filter({ hasText: /website/i })
    .click()
  await page.getByRole("option", { name: "Com website" }).click()

  const firstRow = page.locator("tbody tr").first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.getByRole("link").first().click()

  await expect(page).toHaveURL(/\/businesses\/[0-9a-f]{24}/)

  const enrich = page.getByRole("button", { name: "Enriquecer" }).first()
  await expect(enrich).toBeEnabled()
  await enrich.click()

  // The job is accepted and the toast confirms it, rather than a 404.
  await expect(page.getByText("Enriquecimento iniciado.")).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/Falha na requisição/)).toHaveCount(0)
})

test("enriquecer em massa pela tabela inicia uma execução", async ({
  page,
}) => {
  await page.goto("/businesses")

  const checkboxes = page.getByRole("checkbox")
  await expect(checkboxes.nth(1)).toBeVisible({ timeout: 15_000 })

  await checkboxes.nth(1).click()
  await checkboxes.nth(2).click()

  await expect(page.getByText("2 empresas selecionadas")).toBeVisible()

  await page.getByRole("button", { name: "Enriquecer" }).click()

  await expect(page.getByText("Enriquecimento iniciado.")).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText(/Falha na requisição/)).toHaveCount(0)
})
