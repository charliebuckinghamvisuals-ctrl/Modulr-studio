const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://localhost:3000');
  await new Promise(r => setTimeout(r, 4000));
  
  await page.screenshot({ path: 'screenshot.png' });
  
  // Also get the outerHTML of the body to see if React mounted
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('HTML Length:', html.length);
  
  await browser.close();
})();
