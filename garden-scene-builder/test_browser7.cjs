const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/builder');
  await new Promise(r => setTimeout(r, 7000));
  
  const loadingScreenStyle = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find(el => el.textContent.includes('MODULR 3D') && el.textContent.includes('Loading Studio') && el.style.opacity !== undefined);
    return el ? { opacity: el.style.opacity, pointerEvents: el.style.pointerEvents, isNull: false } : { isNull: true };
  });
  console.log('Loading screen style:', loadingScreenStyle);
  
  await browser.close();
})();
