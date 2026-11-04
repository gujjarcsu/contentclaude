// App Store listing frames: exactly 1600x900, a headline and one line beside a
// crop of the real redesigned screen. Listing rules (09-DOCTRINE §2): no
// statistics, no superlatives, no reviews, no prices, no Shopify marks, no purple.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire("C:/Users/PC4/contentclaude/package.json");
const { chromium } = require("playwright");

const DIR = "C:/Users/PC4/AppData/Local/Temp/claude/4e5917b6adbb432b/e195fb20-bc9a-4625-9139-72bd7a513229/scratchpad/marketing";
mkdirSync(`${DIR}/out`, { recursive: true });
const logo = "data:image/svg+xml;base64," + readFileSync("C:/Users/PC4/contentclaude-redesign/public/logos/contentclaude-icon-square.svg").toString("base64");
const img = (n) => "data:image/png;base64," + readFileSync(`${DIR}/raw/${n}.png`).toString("base64");

const frames = [
  { file: "01-home", shot: "home", head: "Know what to fix first", line: "Navaal scores your catalog for search and AI shopping, then lists what holds your products back." },
  { file: "02-audit", shot: "audit", head: "Every gap, product by product", line: "See which products are missing a description, an image or alt text, and open each one to fix it." },
  { file: "03-editor", shot: "editor", head: "Your copy beside the draft", line: "Each field shows what is on your store now, the proposed text, and how close it is to its limit." },
  { file: "04-review", shot: "review", head: "You approve it before it goes live", line: "Read every draft next to your current copy, then publish only the ones you approve." },
  { file: "05-products", shot: "products", head: "Every product and where it stands", line: "Photos, scores and status for your whole catalog, with one next step for each product." },
  { file: "06-settings", shot: "settings", head: "Written in your brand voice", line: "Set your tone, your audience and what makes you different once. Every draft follows it." },
];

const html = (f) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;700;800&display=swap">
<style>
  :root { --field: #0a5cc2; --ink: #ffffff; --soft: rgba(255,255,255,.86); --edge: rgba(8,28,58,.18); }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1600px; height: 900px; overflow: hidden; background: var(--field); font-family: "Figtree", system-ui, sans-serif; color: var(--ink); }
  .copy { position: absolute; left: 96px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
  .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 26px; letter-spacing: -.01em; }
  .brand img { width: 44px; height: 44px; border-radius: 10px; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
  h1 { font-size: 54px; line-height: 1.05; font-weight: 800; letter-spacing: -.025em; text-wrap: balance; }
  p { font-size: 25px; line-height: 1.42; font-weight: 500; color: var(--soft); max-width: 25ch; }
  /* The whole app width shows (976px capture, flush to the right edge); its
     foot is cropped, which also keeps the admin's Sidekick bar out of frame. */
  .screen { position: absolute; left: 624px; top: 96px; width: 976px; height: 804px; border-radius: 14px 0 0 0; overflow: hidden;
            background: #f1f1f1; box-shadow: 0 0 0 1px var(--edge), 0 24px 60px rgba(4,20,48,.28); }
  .screen img { display: block; width: 976px; height: auto; }
</style></head><body>
  <div class="copy">
    <div class="brand"><img src="${logo}" alt="">Navaal</div>
    <h1>${f.head}</h1>
    <p>${f.line}</p>
  </div>
  <div class="screen"><img src="${img(f.shot)}" alt=""></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
for (const f of frames) {
  await page.setContent(html(f), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${DIR}/out/${f.file}-1600x900.png` });
  console.log("rendered", f.file);
}
await browser.close();
