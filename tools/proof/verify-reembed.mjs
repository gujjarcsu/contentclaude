// Verify the rejection #4 fix at the exact door, on PRODUCTION. Sends the
// reviewer's request shape: an iframe document load with NO session and (for the
// dead-end case) NO shop/host. The fixed app must answer with the App Bridge
// re-embed page (loads app-bridge.js, navigates to /app) — never the login form.
// A genuine top-level visit must still get the form.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const iframeHeaders = { "User-Agent": UA, "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "cross-site" };
const topHeaders = { "User-Agent": UA, "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none" };

async function trace(label, url, headers) {
  const chain = [];
  let cur = url, body = "", status = 0, csp = "";
  for (let i = 0; i < 6; i++) {
    const res = await fetch(cur, { headers, redirect: "manual" });
    status = res.status;
    const loc = res.headers.get("location");
    chain.push(`${status}${loc ? " -> " + loc : ""}`);
    if (status >= 300 && status < 400 && loc) { cur = new URL(loc, cur).toString(); continue; }
    csp = res.headers.get("content-security-policy") || "";
    body = await res.text().catch(() => "");
    break;
  }
  const form = /Shop domain|name="shop"|>Log in<|heading="Log in"/i.test(body);
  const reembed = /app-bridge\.js/.test(body) && /window\.open/.test(body);
  const openTarget = (body.match(/adminDest\s*=\s*"([^"]*)"/) || [])[1] || (body.match(/https?:\/\/[^"'\s]+/) || [])[0] || "(client-derived from App Bridge)";
  const framable = /frame-ancestors[^;]*admin\.shopify\.com/i.test(csp);
  console.log(`\n### ${label}`);
  console.log(`   chain: ${chain.join("  |  ")}`);
  console.log(`   final status: ${status}`);
  console.log(`   FORM: ${form ? "YES" : "no"}   RE-EMBED(App Bridge): ${reembed ? "YES" : "no"}   admin-framable: ${framable ? "yes" : "NO"}`);
  if (reembed) console.log(`   → window.open: ${openTarget}`);
  return { form, reembed, status, framable };
}

const B64 = Buffer.from("q491r2-si.myshopify.com/admin").toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const R = {};
R.a = await trace("A) /auth/login  iframe, NO params (validateShopAndHostParams dead-end)", "https://app.navaal.ai/auth/login", iframeHeaders);
R.b = await trace("B) /auth/login  TOP-LEVEL document, no params (genuine external)", "https://app.navaal.ai/auth/login", topHeaders);
R.c = await trace("C) /  iframe, NO params", "https://app.navaal.ai/", iframeHeaders);
R.d = await trace("D) /auth/login  iframe WITH host", `https://app.navaal.ai/auth/login?host=${B64}&embedded=1`, iframeHeaders);
R.e = await trace("E) /app  iframe, no session/params -> should end at re-embed (via /auth/login)", "https://app.navaal.ai/app", iframeHeaders);

console.log("\n===== VERDICT =====");
const pass =
  R.a.reembed && !R.a.form && R.a.framable &&  // iframe dead-end recovers + embeddable
  R.b.form &&                                   // external still gets the form
  R.c.reembed && R.c.framable &&                // root iframe recovers + embeddable
  R.d.reembed &&                                // /auth/login with host recovers
  !R.e.form;                                    // /app cold iframe never shows the form
console.log(`iframe /auth/login recovers (no form): ${R.a.reembed && !R.a.form}`);
console.log(`external /auth/login shows form:        ${R.b.form}`);
console.log(`iframe / recovers:                      ${R.c.reembed}`);
console.log(`/auth/login?host recovers:              ${R.d.reembed}`);
console.log(`/app cold iframe never shows form:      ${!R.e.form}`);
console.log(`OVERALL: ${pass ? "PASS ✅" : "FAIL ❌"}`);
process.exit(pass ? 0 : 1);
