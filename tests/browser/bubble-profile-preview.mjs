// Run: node tests/browser/bubble-profile-preview.mjs
import assert from "node:assert/strict";
import { withBubbleFixture } from "./bubble-fixture.mjs";

await withBubbleFixture(async ({ page, browser, base }) => {
  const ana = page.getByRole("button", { name: "Ana Silva (@pessoa0)", exact: true });
  const other = page.getByRole("button", { name: "Pessoa 2 (@pessoa2)", exact: true });
  const tooltip = page.getByRole("tooltip");
  const leave = async () => { await page.mouse.move(10, 10); };

  await ana.hover();
  await page.waitForTimeout(200);
  await leave();
  await page.waitForTimeout(550);
  assert.equal(await tooltip.count(), 0, "brief hover never opens a card");

  await ana.hover();
  await page.waitForTimeout(350);
  assert.equal(await tooltip.count(), 0, "card waits before opening");
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Ana Silva/);
  assert.match(await tooltip.innerText(), /@pessoa0/);
  assert.match(await tooltip.innerText(), /Time Vermelho/, "profile keeps the existing side information");
  assert.match(await tooltip.innerText(), /Mútuo/, "profile keeps the existing relationship information");
  assert.equal(await ana.getAttribute("aria-describedby"), await tooltip.getAttribute("id"), "node describes its preview");
  await tooltip.hover();
  await page.waitForTimeout(250);
  assert.equal(await tooltip.count(), 1, "card stays open while hovered");
  await leave();
  await page.waitForTimeout(200);
  assert.equal(await tooltip.count(), 0, "card closes after leaving");

  await ana.hover();
  await page.waitForTimeout(200);
  await other.hover();
  await page.waitForTimeout(350);
  assert.equal(await tooltip.count(), 0, "switching people restarts the delay");
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /@pessoa2/);
  assert.doesNotMatch(await tooltip.innerText(), /Ana Silva/);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(550);
  assert.equal(await tooltip.count(), 0, "Escape dismisses without immediately reopening");

  await ana.hover();
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, -10);
  await page.waitForTimeout(550);
  assert.equal(await tooltip.count(), 0, "wheel cancels a pending preview");
  await leave();
  await ana.hover();
  await tooltip.waitFor();
  await page.getByRole("button", { name: "Aumentar zoom" }).click();
  assert.equal(await tooltip.count(), 0, "zoom buttons dismiss stale previews");
  await page.locator('svg[aria-label="Sua bolha"]').focus();
  await page.keyboard.press("0");

  await ana.hover();
  await tooltip.waitFor();
  await page.getByRole("button", { name: "Já no app", exact: true }).click();
  assert.equal(await tooltip.count(), 0, "filter changes dismiss the preview");
  await page.locator('svg[aria-label="Sua bolha"]').focus();
  await page.keyboard.press("Tab");
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Dona da bolha/, "the owner also has a profile preview");
  await page.keyboard.press("Tab");
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Ana Silva/, "keyboard focus opens the preview");
  assert.notEqual(await ana.evaluate((el) => getComputedStyle(el).outlineStyle), "none", "keyboard focus is visible");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "Ver no X", exact: true }).waitFor();
  assert.equal(await tooltip.count(), 0, "keyboard selection still opens the existing detail card");

  await page.getByRole("button", { name: "Todos", exact: true }).click();
  const anonymous = page.getByRole("button", { name: "Conta do X", exact: true });
  await anonymous.hover();
  await tooltip.waitFor();
  assert.match(await tooltip.innerText(), /Conta do X/, "missing profile fields have a readable fallback");
  await page.setViewportSize({ width: 390, height: 844 });
  await leave();
  await ana.hover();
  await tooltip.waitFor();
  const card = await tooltip.boundingBox();
  assert(card.x >= 0 && card.x + card.width <= 390, "card stays within a narrow viewport");
  assert(card.y >= 0 && card.y + card.height <= 844, "card stays within viewport height");

  const touchPage = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  await touchPage.route("**/api/live", (route) => route.fulfill({ json: { watching: 0, online: [], people: [] } }));
  await touchPage.goto(base, { waitUntil: "networkidle" });
  await touchPage.getByRole("button", { name: "Ana Silva (@pessoa0)", exact: true }).tap();
  await touchPage.getByRole("link", { name: "Ver no X", exact: true }).waitFor();
  await touchPage.waitForTimeout(600);
  assert.equal(await touchPage.getByRole("tooltip").count(), 0, "touch taps keep selection without opening hover cards");
  await touchPage.close();
  console.log("Profile previews: delayed/cancelled hover, switching, hoverable card, Escape, viewport changes, keyboard, missing fields, and touch checks passed.");
});
