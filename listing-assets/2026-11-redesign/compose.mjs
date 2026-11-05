// App Store listing images, v2: exactly 1600x900.
// Composition taken from the five competitors' galleries (Avada, Tapita, SEOWILL,
// Smart SEO, StoreSEO): a brand-colour field with one soft shape, a bold 2-5 word
// headline and one line, the real screen on a clean panel (no browser window —
// Shopify requirement 4.4.4), floating cards lifted from the real UI with a soft
// shadow, and 1-3 dotted callouts pointing at real elements.
// Listing rules: no statistics, superlatives, prices, reviews, Shopify marks or
// Sidekick (4.2.2, 4.3.4, 4.3.6, 4.4.3).
//   node compose.mjs specs.json outDir
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
const require = createRequire("C:/Users/PC4/contentclaude/package.json");
const { chromium } = require("playwright");

const [specFile, outDir] = process.argv.slice(2);
const specs = JSON.parse(readFileSync(specFile, "utf8"));
mkdirSync(outDir, { recursive: true });
const uri = (p) => "data:image/png;base64," + readFileSync(p).toString("base64");
const logo = "data:image/svg+xml;base64," + readFileSync("C:/Users/PC4/contentclaude-redesign/public/logos/contentclaude-icon-square.svg").toString("base64");

// spec: { file, head, line, side: "left"|"right",
//   screen: { src, crop: {x,y,w,h} (source px), x, y, w (display px) },
//   cards: [{ src, x, y, w }], callouts: [{ from:[x,y], to:[x,y], label, labelAt: "start"|"end" }] }
const html = (s) => {
  const sc = s.screen;
  const scale = sc.w / sc.crop.w;
  const screenH = Math.round(sc.crop.h * scale);
  const copyLeft = s.side === "right" ? 1600 - 96 - 460 : 96;
  const callouts = (s.callouts ?? []).map((c) => {
    // Highlight outline around a real element (screen source px), and a short
    // dashed line from a label that sits OUTSIDE the screen, so nothing covers
    // the element being pointed at.
    const pad = 7;
    const bx = Math.round(sc.x + (c.boxSrc.x - sc.crop.x) * scale) - pad, by = Math.round(sc.y + (c.boxSrc.y - sc.crop.y) * scale) - pad;
    const bw = Math.round(c.boxSrc.w * scale) + pad * 2, bh = Math.round(c.boxSrc.h * scale) + pad * 2;
    const [lx, ly] = c.labelAt; const lw = Math.round(c.label.length * 9.6 + 30), lh = 38;
    const lcx = lx + lw / 2, lcy = ly + lh / 2;
    // label anchor: the label edge facing the box; box anchor: nearest point on the box
    const ax = lcx < bx ? lx + lw : lcx > bx + bw ? lx : lcx, ay = lcy < by ? ly + lh : lcy > by + bh ? ly : lcy;
    const tx = Math.max(bx, Math.min(ax, bx + bw)), ty = Math.max(by, Math.min(ay, by + bh));
    return `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="none" stroke="#ffffff" stroke-width="3.5" filter="url(#glow)"/>
      <path d="M${ax} ${ay} L ${tx} ${ty}" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="6 6" stroke-linecap="round"/>
      <circle cx="${tx}" cy="${ty}" r="5" fill="#ffffff"/>
      <foreignObject x="${lx}" y="${ly}" width="${lw + 20}" height="${lh + 20}"><div xmlns="http://www.w3.org/1999/xhtml" class="tag">${c.label}</div></foreignObject>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;600;700;800&display=swap">
<style>
  :root { --brand: #1f45c9; --brand-deep: #16308f; --shape: #2d55d8; --soft: rgba(255,255,255,.88); }
  * { box-sizing: border-box; margin: 0; }
  body { width: 1600px; height: 900px; overflow: hidden; position: relative; background: var(--brand-deep); font-family: "Figtree", system-ui, sans-serif; color: #fff; }
  .shape { position: absolute; border-radius: 50%; background: var(--brand); }
  .shape.a { width: 980px; height: 980px; ${s.side === "right" ? "left: -260px" : "right: -260px"}; top: -240px; }
  .shape.b { width: 300px; height: 300px; background: var(--shape); opacity: .55; ${s.side === "right" ? "right: 120px" : "left: 40px"}; bottom: -150px; }
  .copy { position: absolute; left: ${copyLeft}px; top: 0; bottom: 0; width: 460px; display: flex; flex-direction: column; justify-content: center; gap: 26px; z-index: 5; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 24px; }
  .brand img { width: 40px; height: 40px; border-radius: 10px; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
  h1 { font-size: 62px; line-height: 1.02; font-weight: 800; letter-spacing: -.025em; text-wrap: balance; }
  p.line { font-size: 24px; line-height: 1.42; font-weight: 500; color: var(--soft); max-width: 22ch; }
  .panel { position: absolute; left: ${sc.x}px; top: ${sc.y}px; width: ${sc.w}px; height: ${Math.min(screenH, 900 - sc.y + 40)}px; border-radius: 18px; overflow: hidden; background: #f1f1f1;
           box-shadow: 0 30px 80px rgba(3,14,48,.45), 0 0 0 1px rgba(255,255,255,.18); z-index: 2; }
  .panel img { position: absolute; max-width: none; left: ${-sc.crop.x * scale}px; top: ${-sc.crop.y * scale}px; width: ${Math.round((sc.srcW ?? 2000) * scale)}px; height: auto; }
  .card { position: absolute; z-index: 4; border-radius: 14px; overflow: hidden; background: #fff; box-shadow: 0 22px 50px rgba(3,14,48,.38), 0 2px 6px rgba(3,14,48,.18); }
  .card img { display: block; width: 100%; height: auto; }
  svg.over { position: absolute; inset: 0; z-index: 6; pointer-events: none; overflow: visible; }
  .tag { display: inline-block; background: #fff; color: var(--brand-deep); font: 700 17px/1 "Figtree", sans-serif; padding: 10px 14px; border-radius: 10px; box-shadow: 0 8px 22px rgba(3,14,48,.3); white-space: nowrap; }
</style></head><body>
  <div class="shape a"></div><div class="shape b"></div>
  <div class="copy"><div class="brand"><img src="${logo}" alt="">Navaal</div><h1>${s.head}</h1><p class="line">${s.line}</p></div>
  <div class="panel"><img src="${uri(sc.src)}" alt=""></div>
  ${(s.cards ?? []).map((c) => c.crop ? `<div class="card" style="left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${Math.round(c.crop.h * c.w / c.crop.w)}px;position:absolute"><img src="${uri(c.src)}" alt="" style="position:absolute;max-width:none;left:${-c.crop.x * c.w / c.crop.w}px;top:${-c.crop.y * c.w / c.crop.w}px;width:${Math.round((c.srcW ?? 1952) * c.w / c.crop.w)}px"></div>` : `<div class="card" style="left:${c.x}px;top:${c.y}px;width:${c.w}px"><img src="${uri(c.src)}" alt=""></div>`).join("")}
  <svg class="over" width="1600" height="900" viewBox="0 0 1600 900"><defs><filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#030e30" flood-opacity=".45"/></filter></defs>${callouts}</svg>
</body></html>`;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
for (const s of specs) {
  await page.setContent(html(s), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${outDir}/${s.file}.png` });
  console.log("composed", s.file);
}
await browser.close();
