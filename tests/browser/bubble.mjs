// Run: node tests/browser/bubble.mjs (needs Playwright's Chromium, or PLAYWRIGHT_EXECUTABLE_PATH)
// Hover cards, keyboard access, wheel/middle-button navigation and the fullscreen dialog, in a real browser.
import assert from "node:assert/strict";
import { withBubbleFixture } from "./bubble-fixture.mjs";

await withBubbleFixture(async ({ page }) => {
  const ana = page.getByRole("button", { name: "Ana Silva (@pessoa0)", exact: true });
  const other = page.getByRole("button", { name: "Pessoa 2 (@pessoa2)", exact: true });
  const tooltip = page.getByRole("tooltip");
  const svg = page.getByRole("group", { name: "Sua bolha" });
  const stage = page.locator(".bubble-zoom");
  const camera = () => stage.evaluate((el) => el.style.transform);
  const away = async () => page.mouse.move(5, 5);
  // Let the layout settle so dots don't move under the mouse.
  await page.waitForTimeout(800);

  // Hover card: waits before opening, a quick pass never opens it.
  await ana.hover();
  await page.waitForTimeout(200);
  await away();
  await page.waitForTimeout(600);
  assert.equal(await tooltip.count(), 0, "a quick pass never opens a card");
  await ana.hover();
  await page.waitForTimeout(300);
  assert.equal(await tooltip.count(), 0, "the card waits before opening");
  await tooltip.waitFor({ timeout: 1000 });
  const text = await tooltip.innerText();
  assert.match(text, /Ana Silva/);
  assert.match(text, /@pessoa0/);
  assert.match(text, /Time Vermelho/);
  assert.match(text, /Mútuo/);
  assert.equal(await ana.getAttribute("aria-describedby"), await tooltip.getAttribute("id"));
  // Moving to a neighbor swaps the card right away.
  await other.hover();
  await page.waitForTimeout(100);
  assert.match(await tooltip.innerText(), /@pessoa2/, "an open card swaps to the next person without waiting");
  await away();
  await page.waitForTimeout(300);
  assert.equal(await tooltip.count(), 0, "the card closes after leaving");
  // Esc dismisses it.
  await ana.hover();
  await tooltip.waitFor({ timeout: 1000 });
  await page.keyboard.press("Escape");
  assert.equal(await tooltip.count(), 0, "Esc dismisses the card");
  await away();

  // Keyboard: Tab reaches people, focus shows the card at once, Enter selects.
  await svg.focus();
  await page.keyboard.press("Tab");
  await tooltip.waitFor({ timeout: 300 });
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  assert.ok(focused, "Tab lands on a person");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Ver no X" }).waitFor({ timeout: 1000 });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Voltar ao início" }).click();
  await page.waitForTimeout(800);

  // Wheel: plain wheel scrolls the page (no zoom) in the card; ctrl zooms; shift pans.
  const home = await camera();
  const box = (await svg.boundingBox());
  await page.mouse.move(box.x + 30, box.y + 30);
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(200);
  assert.equal(await camera(), home, "plain wheel doesn't zoom in the card");
  assert.ok((await page.evaluate(() => scrollY)) > y0, "plain wheel scrolls the page");
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await page.waitForTimeout(100);
  const zoomed = await camera();
  assert.notEqual(zoomed, home, "ctrl + wheel zooms");
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 100);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(100);
  assert.notEqual(await camera(), zoomed, "shift + wheel pans");
  assert.equal(await page.evaluate(() => scrollY), 0, "shift + wheel doesn't scroll the page");

  // Middle-button drag pans, and doesn't count as a tap.
  const before = await camera();
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 4 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(100);
  assert.notEqual(await camera(), before, "middle-button drag pans");

  // Fullscreen: a modal dialog; focus stays inside; Esc closes and focus returns to the toggle.
  await page.getByRole("button", { name: "Tela cheia" }).click();
  const dialog = page.getByRole("dialog", { name: "Sua bolha" });
  await dialog.waitFor();
  assert.equal(await page.getByLabel("Outside input").evaluate((el) => el.closest("[inert]") !== null), true, "the page behind is inert");
  for (let i = 0; i < 60; i++) await page.keyboard.press("Tab");
  assert.ok(await dialog.evaluate((el) => el.contains(document.activeElement)), "Tab stays inside fullscreen");
  // Esc with a card open closes only the card.
  await page.mouse.move(5, 5);
  await ana.hover();
  await tooltip.waitFor({ timeout: 1000 });
  await page.keyboard.press("Escape");
  assert.equal(await tooltip.count(), 0);
  assert.equal(await dialog.count(), 1, "Esc on a card doesn't leave fullscreen");
  await page.keyboard.press("Escape");
  assert.equal(await dialog.count(), 0, "Esc leaves fullscreen");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Tela cheia", "focus returns to the toggle");
  assert.equal(await page.getByLabel("Outside input").evaluate((el) => el.closest("[inert]") === null), true, "the page is usable again");
});
console.log("bubble browser checks passed");
