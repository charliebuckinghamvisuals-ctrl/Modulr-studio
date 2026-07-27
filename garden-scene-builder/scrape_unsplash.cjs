const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
  
  await page.goto('https://unsplash.com/s/photos/modern-shed');
  await new Promise(r => setTimeout(r, 3000));
  
  const urls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img[src*="images.unsplash.com/photo"]'))
      .map(img => img.src.split('?')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 10);
  });
  
  console.log("MODERN SHED:");
  urls.forEach(u => console.log(u));
  
  await page.goto('https://unsplash.com/s/photos/garden-office');
  await new Promise(r => setTimeout(r, 3000));
  
  const urls2 = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img[src*="images.unsplash.com/photo"]'))
      .map(img => img.src.split('?')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 10);
  });
  
  console.log("GARDEN OFFICE:");
  urls2.forEach(u => console.log(u));

  await browser.close();
})();
