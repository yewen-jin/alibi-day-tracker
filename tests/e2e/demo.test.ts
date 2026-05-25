import { expect, test, type Page } from "@playwright/test"

async function enterDemo(page: Page, name = "Mina") {
  await page.goto("/demo")
  await page.getByLabel(/your name/i).fill(name)
  await page.getByRole("button", { name: /start demo/i }).click()
  await expect(page.getByText(`local session for ${name}`)).toBeVisible()
}

async function chooseDeepWork(page: Page) {
  await page.getByRole("button", { name: /choose or add a category/i }).click()
  await page.getByRole("button", { name: /^deep work$/i }).click()
}

async function saveCurrentEditor(page: Page, taskName: string, notes: string) {
  await page.getByLabel(/task name/i).fill(taskName)
  await chooseDeepWork(page)
  await page.getByLabel(/notes/i).fill(notes)
  await page.getByRole("button", { name: /^save$/i }).click()
  await expect(page.getByText(taskName).first()).toBeVisible()
}

test.describe("/demo product workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo")
    await page.evaluate(() => window.localStorage.clear())
  })

  test("tracks, mirrors, inspects calendar blocks, persists, and clears locally", async ({ page }) => {
    await enterDemo(page)

    await page.getByRole("button", { name: /^start$/i }).click()
    await expect(page.getByRole("button", { name: /^stop$/i })).toBeVisible()
    await page.getByRole("button", { name: /^stop$/i }).click()
    await saveCurrentEditor(page, "timer parity block", "stopped timer and saved a real local block")

    await page.getByRole("button", { name: /add completed block/i }).click()
    await saveCurrentEditor(page, "manual parity block", "manual local block evidence")

    await page.getByRole("button", { name: /^dashboard$/i }).click()
    await expect(page.getByText(/manual local block evidence/i)).toBeVisible()

    await page.getByRole("button", { name: /^calendar$/i }).click()
    await expect(page.getByText(/^calendar$/i).first()).toBeVisible()
    await page.getByRole("button", { name: /manual parity block/i }).click()
    await expect(page.getByRole("button", { name: /edit block/i })).toBeVisible()

    await page.getByRole("button", { name: /edit block/i }).click()
    await page.getByLabel(/notes/i).fill("edited from the demo calendar")
    await page.getByRole("button", { name: /^save$/i }).click()
    await expect(page.getByText(/edited from the demo calendar/i)).toBeVisible()

    await page.getByRole("button", { name: /chat about this block/i }).click()
    await expect(page.getByRole("button", { name: /record voice message/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /play voice replies/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /main chat/i })).toBeVisible()

    await page.reload()
    await expect(page.getByText("local session for Mina")).toBeVisible()
    await page.getByRole("button", { name: /^calendar$/i }).click()
    await page.getByRole("button", { name: /manual parity block/i }).click()
    await expect(page.getByText(/edited from the demo calendar/i)).toBeVisible()

    await page.getByRole("button", { name: /clear demo/i }).click()
    await expect(page.getByRole("button", { name: /start demo/i })).toBeVisible()
  })

  test("deletes a selected block from the demo calendar", async ({ page }) => {
    await enterDemo(page, "Ira")
    await page.getByRole("button", { name: /add completed block/i }).click()
    await saveCurrentEditor(page, "calendar delete block", "delete this from calendar")

    await page.getByRole("button", { name: /^calendar$/i }).click()
    await page.getByRole("button", { name: /calendar delete block/i }).click()
    await page.getByRole("button", { name: /^delete block$/i }).click()

    await expect(page.getByText(/calendar delete block/i)).toHaveCount(0)
  })
})
