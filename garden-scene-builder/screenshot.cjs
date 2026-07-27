const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000/');
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'screenshot_landing.png' });
  
  await page.goto('http://localhost:3000/builder');
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: 'screenshot_builder.png' });
  
  await browser.close();
})();
