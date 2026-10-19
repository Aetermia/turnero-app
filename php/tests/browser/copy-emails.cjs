/*
 * Clicks "Copiar mails" in a real Chromium and prints what landed on the
 * clipboard. Usage: node copy-emails.cjs <base> <cookieValue> <query>
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
(async () => {
  const [base, cookie, query] = process.argv.slice(2);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  const url = new URL(base);
  await context.addCookies([{ name: "casa_session", value: cookie, domain: url.hostname, path: "/" }]);
  const page = await context.newPage();
  await page.goto(base + "/admin/clientes" + query);
  const button = page.locator("[data-copy-emails]");
  const before = page.url();
  await button.click();
  await page.waitForTimeout(300);
  const label = await button.textContent();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  console.log(JSON.stringify({ label, clipboard, stayed: page.url() === before }));
  await browser.close();
})().catch((e) => {
  console.log(JSON.stringify({ error: String(e) }));
  process.exit(1);
});
