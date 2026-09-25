import { expect, test } from "@playwright/test"

/**
 * Smoke coverage: every route renders its shell and the sidebar navigates.
 * These run against a build with no database requirement for the shell, so
 * data areas may legitimately show an error state.
 */
test.describe("navegação", () => {
  test("o dashboard carrega com a sidebar", async ({ page }) => {
    await page.goto("/")

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 })
    ).toBeVisible()
    await expect(
      page.getByRole("link", { name: "Empresas", exact: true })
    ).toBeVisible()
  })

  test("navega para empresas pela sidebar", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: "Empresas", exact: true }).click()

    await expect(page).toHaveURL(/\/businesses/)
    await expect(
      page.getByRole("heading", { name: "Empresas", level: 1 })
    ).toBeVisible()
    await expect(
      page.getByPlaceholder("Buscar empresa, categoria ou cidade...")
    ).toBeVisible()
  })

  test("navega para buscas e enriquecimento", async ({ page }) => {
    await page.goto("/")

    await page.getByRole("link", { name: "Buscas", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "Buscas", level: 1 })
    ).toBeVisible()

    await page.getByRole("link", { name: "Enriquecimento" }).click()
    await expect(
      page.getByRole("heading", { name: "Enriquecimento", level: 1 })
    ).toBeVisible()
  })

  test("a página de configurações permite trocar o tema", async ({ page }) => {
    await page.goto("/settings")

    await expect(
      page.getByRole("heading", { name: "Configurações", level: 1 })
    ).toBeVisible()

    await page.getByLabel("Escuro").click()
    await expect(page.locator("html")).toHaveClass(/dark/)

    await page.getByLabel("Claro").click()
    await expect(page.locator("html")).not.toHaveClass(/dark/)
  })
})
