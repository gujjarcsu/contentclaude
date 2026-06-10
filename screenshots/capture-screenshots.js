/**
 * ContentClaude – App Store Screenshot Generator
 * Run: node capture-screenshots.js
 * Requires: npm install puppeteer  (one-time)
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENS = [
  { file: '01-dashboard.html',      out: '01-dashboard.png',      label: 'Dashboard' },
  { file: '02-products.html',       out: '02-products.png',       label: 'Products List' },
  { file: '03-product-editor.html', out: '03-product-editor.png', label: 'Product Editor' },
  { file: '04-brand-voice.html',    out: '04-brand-voice.png',    label: 'Brand Voice Settings' },
  { file: '05-plans.html',          out: '05-plans.png',          label: 'Plans & Billing' },
  { file: '06-bulk-jobs.html',      out: '06-bulk-jobs.png',      label: 'Bulk Jobs' },
];

const VIEWPORT = { width: 1280, height: 800, deviceScaleFactor: 2 }; // @2x for retina quality

(async () => {
  console.log('🚀 Launching Chrome...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  const dir = __dirname;

  for (const screen of SCREENS) {
    const filePath = path.join(dir, screen.file);
    const outPath  = path.join(dir, screen.out);

    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠️  Missing: ${screen.file}`);
      continue;
    }

    const url = 'file:///' + filePath.replace(/\\/g, '/');
    console.log(`  📸 Capturing: ${screen.label}...`);
    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.waitForTimeout(300); // let CSS animations settle
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`     ✅ Saved → ${screen.out}`);
  }

  await browser.close();
  console.log('\n✨ Done! 6 screenshots ready in the screenshots/ folder.');
  console.log('   Upload them to your Shopify Partner Dashboard → App listing → Screenshots.\n');
})();
