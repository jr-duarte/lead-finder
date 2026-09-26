import { expect, test } from "@playwright/test"

/** Reads how many cards each column reports in its badge. */
async function columnCounts(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-slot='badge']"))
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /^\d+$/.test(t))
  )
}

test("arrasta um card entre colunas com o mouse", async ({ page }) => {
  await page.goto("/pipeline")

  const handle = page.getByRole("button", { name: /^Mover / }).first()
  await expect(handle).toBeVisible({ timeout: 15_000 })

  const before = await columnCounts(page)

  // Drag the first card onto a different column.
  const target = page.getByText("Reunião", { exact: true }).first()
  const from = await handle.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error("elementos não encontrados")

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // Several small steps so dnd-kit registers the movement.
  await page.mouse.move(to.x + 40, to.y + 120, { steps: 12 })
  await page.mouse.up()

  await page.waitForTimeout(2500)
  const after = await columnCounts(page)

  expect(after.join(",")).not.toBe(before.join(","))
})

test("arrasta por toque em viewport mobile", async ({ browser }) => {
  // The whole point of migrating to dnd-kit: HTML5 drag ignores touch.
  const context = await browser.newContext({
    viewport: { width: 420, height: 860 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()

  await page.goto("/pipeline")

  const handle = page.getByRole("button", { name: /^Mover / }).first()
  await expect(handle).toBeVisible({ timeout: 15_000 })

  const box = await handle.boundingBox()
  if (!box) throw new Error("handle sem posição")

  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.touchscreen.tap(x, y)

  // A touch drag requires holding past the activation delay first.
  await page.evaluate(
    async ({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return
      const touch = (cx: number, cy: number) =>
        new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })

      el.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [touch(x, y)],
          targetTouches: [touch(x, y)],
          changedTouches: [touch(x, y)],
        })
      )
      await new Promise((r) => setTimeout(r, 260))
      el.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          touches: [touch(x, y + 140)],
          targetTouches: [touch(x, y + 140)],
          changedTouches: [touch(x, y + 140)],
        })
      )
      await new Promise((r) => setTimeout(r, 120))
      el.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          targetTouches: [],
          changedTouches: [touch(x, y + 140)],
        })
      )
    },
    { x, y }
  )

  await page.waitForTimeout(1500)
  // The page must survive the touch interaction without errors.
  await expect(
    page
      .getByText("Funil de prospecção")
      .or(page.getByRole("heading", { name: "Funil" }))
  ).toBeVisible()

  await context.close()
})

test("mostra o overlay durante o arraste e o remove ao soltar", async ({
  page,
}) => {
  await page.goto("/pipeline")

  const handle = page.getByRole("button", { name: /^Mover / }).first()
  await expect(handle).toBeVisible({ timeout: 15_000 })

  // The handle's label carries the card name, which is more reliable than
  // guessing from the DOM.
  const label = await handle.getAttribute("aria-label")
  const nome = label?.replace(/^Mover /, "") ?? ""

  const box = await handle.boundingBox()
  if (!box) throw new Error("handle sem posição")

  await page.mouse.move(box.x + 5, box.y + 5)
  await page.mouse.down()
  await page.mouse.move(box.x + 200, box.y + 60, { steps: 10 })
  await page.waitForTimeout(250)

  // While dragging, the card name appears twice: the dimmed original and the
  // overlay that follows the cursor.
  const durante = await page.getByText(nome, { exact: true }).count()
  expect(durante).toBeGreaterThan(1)

  await page.mouse.up()
  await page.waitForTimeout(800)

  // Once dropped, the duplicate is gone.
  const depois = await page.getByText(nome, { exact: true }).count()
  expect(depois).toBe(1)
})

test("respeita prefers-reduced-motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" })
  const page = await context.newPage()

  await page.goto("/pipeline")
  await expect(
    page.getByRole("button", { name: /^Mover / }).first()
  ).toBeVisible({ timeout: 15_000 })

  const duration = await page.evaluate(() => {
    const el = document.querySelector("[class*='transition']")
    return el ? getComputedStyle(el).transitionDuration : null
  })

  // The override collapses transitions to ~0; browsers report it as 1e-05s.
  expect(duration).not.toBeNull()
  expect(Number.parseFloat(duration!)).toBeLessThan(0.01)

  await context.close()
})

test("arrasta um card para uma coluna vazia", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto("/pipeline")

  await expect(
    page.getByRole("button", { name: /^Mover / }).first()
  ).toBeVisible({ timeout: 15_000 })
  await page.waitForTimeout(1200)

  const placeholder = page.getByText("Arraste leads para cá").first()
  const hasEmptyColumn = (await placeholder.count()) > 0
  test.skip(!hasEmptyColumn, "Nenhuma coluna vazia no board")

  // An empty column has no cards, so a corner-based collision strategy would
  // never pick it — this guards that regression.
  await expect(placeholder).toBeInViewport()

  const countsBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-slot='badge']"))
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /^\d+$/.test(t))
      .join(",")
  )

  const to = await placeholder.boundingBox()
  const handle = page.getByRole("button", { name: /^Mover / }).first()
  const from = await handle.boundingBox()
  if (!from || !to) throw new Error("elementos sem posição")

  await page.mouse.move(from.x + 5, from.y + 5)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y, { steps: 20 })
  await page.waitForTimeout(400)
  await page.mouse.up()
  await page.waitForTimeout(2500)

  const countsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-slot='badge']"))
      .map((el) => el.textContent?.trim())
      .filter((t) => t && /^\d+$/.test(t))
      .join(",")
  )

  expect(countsAfter).not.toBe(countsBefore)
})
