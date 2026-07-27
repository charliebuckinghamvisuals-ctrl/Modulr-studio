const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('requestfailed', request => {
        console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });

    await page.goto('http://localhost:3000/3d-config/index.html', { waitUntil: 'networkidle0' });
    
    // Check if body has content or canvas
    const html = await page.content();
    console.log('HTML Length:', html.length);
    const canvasExists = await page.evaluate(() => !!document.querySelector('canvas'));
    console.log('Canvas exists:', canvasExists);

    await browser.close();
})();
