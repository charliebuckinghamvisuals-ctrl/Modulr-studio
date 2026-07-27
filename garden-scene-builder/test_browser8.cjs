const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/builder');
  await new Promise(r => setTimeout(r, 7000));
  
  const loadingScreenText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find(el => el.textContent.includes('MODULR 3D') && el.textContent.includes('Loading Studio'));
    return el ? el.textContent : 'null';
  });
  console.log('Loading screen text:', loadingScreenText);
  
  await browser.close();
})();
