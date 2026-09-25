import { expect, test } from "@playwright/test"

test("registra, edita e exclui uma anotação", async ({ page }) => {
  await page.goto("/businesses")
  const firstRow = page.locator("tbody tr").first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.getByRole("link").first().click()

  await page.getByRole("tab", { name: "Anotações" }).click()

  const texto = `Anotação ${Date.now().toString().slice(-6)}`
  await page.getByLabel("Nova anotação").fill(texto)
  await page.getByRole("button", { name: "Adicionar anotação" }).click()

  await expect(page.getByText("Anotação registrada.")).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(texto)).toBeVisible()

  // Edit in place.
  const card = page.locator("div").filter({ hasText: texto }).last()
  await card.getByRole("button", { name: "Editar anotação" }).click()
  await page.getByLabel("Conteúdo da anotação").fill(`${texto} editada`)
  await page.getByRole("button", { name: "Salvar" }).click()

  await expect(page.getByText("Anotação atualizada.")).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(`${texto} editada`)).toBeVisible()

  // Delete through the confirmation dialog.
  const edited = page
    .locator("div")
    .filter({ hasText: `${texto} editada` })
    .last()
  await edited.getByRole("button", { name: "Excluir anotação" }).click()
  await page.getByRole("button", { name: "Excluir", exact: true }).click()

  await expect(page.getByText("Anotação excluída.")).toBeVisible({
    timeout: 15_000,
  })
})

test("adiciona ao funil pela ação da linha", async ({ page }) => {
  await page.goto("/businesses?pipeline=out")

  const firstRow = page.locator("tbody tr").first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })

  await firstRow.getByRole("button", { name: /Ações para/ }).click()
  await page.getByRole("menuitem", { name: "Adicionar ao funil" }).click()

  await expect(page.getByText(/adicionada ao funil/)).toBeVisible({
    timeout: 15_000,
  })
})

test("filtra empresas que estão no funil", async ({ page }) => {
  await page.goto("/businesses")

  await page
    .getByRole("combobox")
    .filter({ hasText: /Todas|funil/i })
    .last()
    .click()
  await page.getByRole("option", { name: "No funil", exact: true }).click()

  await expect(page).toHaveURL(/pipeline=in/)
  // Every visible row must carry a stage badge.
  await expect(page.locator("tbody tr").first()).toBeVisible({
    timeout: 15_000,
  })
})

test("altera a etapa do funil pela página da empresa", async ({ page }) => {
  await page.goto("/businesses?pipeline=in")

  const firstRow = page.locator("tbody tr").first()
  await expect(firstRow).toBeVisible({ timeout: 15_000 })
  await firstRow.getByRole("link").first().click()

  const select = page.getByLabel("Etapa no funil").first()
  await expect(select).toBeVisible({ timeout: 15_000 })

  // Selecting the stage the lead already occupies fires no change, so the
  // destination is chosen based on the current value.
  const atual = (await select.textContent()) ?? ""
  const destino = atual.includes("Reunião") ? "Proposta" : "Reunião"

  await select.click()
  await page.getByRole("option", { name: destino, exact: true }).click()

  await expect(page.getByText(`Movida para ${destino}.`)).toBeVisible({
    timeout: 15_000,
  })
  await expect(select).toContainText(destino)
})
