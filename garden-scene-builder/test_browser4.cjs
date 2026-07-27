const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/builder');
  await new Promise(r => setTimeout(r, 4000));
  
  const canvasExists = await page.evaluate(() => !!document.querySelector('canvas'));
  console.log('Canvas exists:', canvasExists);
  
  await browser.close();
})();
