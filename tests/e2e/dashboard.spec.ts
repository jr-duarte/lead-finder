import { expect, test } from "@playwright/test"

test("destaca os números do funil no topo do dashboard", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByText("Funil de prospecção")).toBeVisible({
    timeout: 15_000,
  })

  for (const metrica of ["Ganhos", "Perdidos", "Em andamento"]) {
    await expect(page.getByText(metrica, { exact: true })).toBeVisible()
  }

  // The collection counters stay below, as secondary information.
  await expect(page.getByText("Base coletada")).toBeVisible()
})

test("os cartões do funil levam à listagem filtrada", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByText("Ganhos", { exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await page.getByText("Ganhos", { exact: true }).click()

  await expect(page).toHaveURL(/pipelineStage=WON/)
})
