import { chromium } from "@playwright/test";
import fs from "node:fs";
const b = await chromium.launch({
  headless: false,
  channel: "chrome",
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--start-maximized", "--no-first-run", "--no-default-browser-check"],
});
const c = await b.newContext({ viewport: null });
const p = await c.newPage();
await p.goto("data:text/html,<h1 style='font:48px sans-serif;padding:40px'>REC TEST — blank</h1>");
fs.writeFileSync("/tmp/rectest_ready", "1");
console.log("READY");
// wait up to 120s for stop signal
for (let i = 0; i < 240; i++) {
  if (fs.existsSync("/tmp/rectest_stop")) break;
  await new Promise((r) => setTimeout(r, 500));
}
await c.close();
await b.close();
console.log("CLOSED");
