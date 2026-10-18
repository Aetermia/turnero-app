/*
 * Drives the receipt upload in Chromium (Playwright): real file picker, real
 * canvas compression, and a connection that drops on the first try.
 * Usage: node receipt-browser.cjs <base> <tokenPhoto> <tokenPdf> <photo> <pdf>
 * Prints a JSON summary for tests/verify-receipt.php.
 */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");

(async () => {
  const [base, tokenPhoto, tokenPdf, photo, pdf] = process.argv.slice(2);
  const browser = await chromium.launch();
  const result = {};
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(base + "/reservas/" + tokenPhoto);
    await page.setInputFiles("[data-file]", photo);
    // The button stays disabled ("Preparando...") until compression ends.
    result.disabledWhilePreparing = await page.isDisabled("[data-upload-button]");
    await page.waitForSelector("[data-preview]:not([hidden])");
    await page.waitForSelector("[data-upload-button]:not([disabled])");

    // First attempt: the network drops.
    let dropped = false;
    await page.route("**/comprobante", (route) => {
      if (!dropped) {
        dropped = true;
        return route.abort("internetdisconnected");
      }
      return route.continue();
    });
    await page.click("[data-upload-button]");
    await page.waitForSelector("[data-upload-error]:not([hidden])");
    result.retryMessage = await page.textContent("[data-upload-error]");
    result.retryShown = (await page.textContent("[data-upload-button]")).trim() === "Reintentar"
      && await page.isVisible("[data-upload-button]");

    // Second attempt: back online.
    await Promise.all([page.waitForEvent("load"), page.click("[data-upload-button]")]);
    result.afterRetry = await page.isVisible("text=Confirmar reserva");

    const pdfPage = await browser.newPage();
    await pdfPage.goto(base + "/reservas/" + tokenPdf);
    await pdfPage.setInputFiles("[data-file]", pdf);
    await pdfPage.waitForSelector("[data-pdf-name]:not([hidden])");
    await Promise.all([pdfPage.waitForEvent("load"), pdfPage.click("[data-upload-button]")]);
    result.pdfUploaded = await pdfPage.isVisible("text=Comprobante cargado");
  } catch (error) {
    result.error = String(error);
  }
  await browser.close();
  console.log(JSON.stringify(result));
})();
