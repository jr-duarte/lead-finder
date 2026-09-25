import { expect, test } from "@playwright/test"

/**
 * Full collection flow against the real API and database: create a search,
 * watch it finish, and confirm the results reach the businesses table.
 *
 * Requires a source that can actually collect: "mock" always works, while
 * "google" needs a billed API key. The test is skipped otherwise so a missing
 * key does not look like a product failure.
 */
const source = process.env.PLACES_SOURCE ?? "mock"
const canCollect =
  source === "mock" ||
  (source === "google" && Boolean(process.env.GOOGLE_MAPS_API_KEY)) ||
  source === "osm"

test.skip(
  !canCollect,
  `Fonte "${source}" não está configurada para coletar (falta GOOGLE_MAPS_API_KEY).`
)

test("executa uma busca e exibe as empresas coletadas", async ({ page }) => {
  await page.goto("/searches/new")

  // A real category, so the assertion holds for any source (a made-up one
  // returns nothing from Google or OSM).
  await page.getByLabel("Categoria").fill("Restaurante")
  await page.getByLabel("Localização").fill("Santana, São Paulo, SP")
  await page.getByLabel("Quantidade").fill("5")
  await page.getByRole("button", { name: "Iniciar busca" }).click()

  // The progress panel replaces the form once the search is created.
  await expect(page.getByText("Progresso")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("Concluída")).toBeVisible({ timeout: 45_000 })

  // The run must have actually collected something.
  await expect(page.getByText("Encontradas")).toBeVisible()
  const found = await page
    .locator("div", { hasText: /^Encontradas/ })
    .last()
    .innerText()
  expect(Number(found.replace(/\D/g, ""))).toBeGreaterThan(0)

  await page.getByRole("link", { name: "Ver empresas coletadas" }).click()
  await expect(page).toHaveURL(/\/businesses/)

  // Collected rows must be reachable through the table.
  await expect(page.locator("tbody tr").first()).toBeVisible({
    timeout: 15_000,
  })
})

test("filtra empresas sem website", async ({ page }) => {
  await page.goto("/businesses")

  await expect(
    page.getByRole("heading", { name: "Empresas", level: 1 })
  ).toBeVisible()

  // Select the "Sem website" option from the website filter.
  await page
    .getByRole("combobox")
    .filter({ hasText: /website/i })
    .click()
  await page.getByRole("option", { name: "Sem website" }).click()

  await expect(page).toHaveURL(/website=no/)
  await expect(page.getByText("1 filtro ativo")).toBeVisible()
})
