#!/usr/bin/env node
/**
 * Phase 12 Part D (D0) — the string extraction. LOCAL ONLY; touches no
 * store, no database.
 *
 *   node scripts/i18n-extract.mjs            # report: what would change, per file
 *   node scripts/i18n-extract.mjs --apply    # rewrite the JSX and write locales/en.json
 *   node scripts/i18n-extract.mjs --check    # exit 1 if any merchant-visible literal is not wrapped
 *
 * gettext style: the English string stays in the source as the key of a
 * t("…") call, so every source-reading guard in the suite keeps matching and
 * English behaviour is unchanged by construction. What counts as
 * merchant-visible, and is therefore wrapped:
 *
 *   - JSX text with letters, outside <code>/<pre>, including runs that mix
 *     text with simple expressions ("Welcome, {name}!") → one key with
 *     placeholders
 *   - string props from the allow-list (title, content, label, heading,
 *     helpText, placeholder, alt, accessibilityLabel, …), as literals,
 *     template literals or ternaries of strings
 *   - object-literal values for the same names (Polaris actions, options)
 *   - string / template / ternary expressions used directly as JSX children
 *
 * What is left alone, on purpose: paths, URLs, GIDs, identifiers, GraphQL,
 * code-only props (name, value, id, url, variant, tone, …), and everything
 * outside a function (reported, converted by hand). --check is the scanner
 * the test runs.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import MagicString from "magic-string";

const traverse = _traverse.default ?? _traverse;
const APPLY = process.argv.includes("--apply");
const CHECK = process.argv.includes("--check");

const PROP_ALLOW = new Set(["title", "content", "label", "heading", "helpText", "placeholder", "alt", "accessibilityLabel", "aria-label", "subtitle", "description", "message", "error", "emptyStateMessage", "confirmText", "cancelText", "summary", "term", "loadingText", "desc", "tagline", "period", "details", "note", "hint", "caption"]);
const PROP_DENY = new Set(["name", "value", "id", "key", "url", "href", "src", "target", "type", "variant", "tone", "size", "as", "className", "style", "role", "method", "action", "actionType", "encType", "rel", "lang", "dir", "align", "gap", "padding", "blockAlign", "inlineAlign", "background", "borderRadius", "width", "height", "image", "icon", "sortKey", "selected", "status", "data-testid"]);
const SKIP_PARENT = new Set(["code", "pre", "script", "style"]);
const ROOTS = ["app/routes", "app/components"];
// D1 — pure modules whose merchant sentences are keys already (T() / t(…)):
// their keys are catalogued, but the codemod's JSX rules do not apply to a
// data module, so nothing in them is rewritten or flagged.
const CATALOGUE_ONLY = [
  "app/utils/legal.js",
  "app/utils/catalogueWatch.js",
  "app/utils/indexability.js",
  "app/utils/firstRun.js",
  "app/utils/startCopy.js",
  "app/utils/crawlHoldout.js",
  "app/utils/proofCard.js",
  "app/utils/homeCopy.js",
  "app/utils/aiReports.js",
  "app/utils/gscAiControl.js",
  "app/utils/crawlerAccess.js",
  "app/utils/remediation.js",
  "app/utils/publishVerify.js",
  "app/utils/credits.js",
  "app/utils/altText.js",
  "app/utils/catalogueContent.js",
  "app/utils/support.js",
  "app/utils/jobMessages.js",
  "app/utils/geoRubric.js",
  "app/utils/productState.js",
  "app/utils/language.js",
  "app/utils/weeklyReport.server.js",
  "app/utils/support.server.js",
  "app/utils/legalPage.server.js",
];

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx$/.test(name)) out.push(p);
  }
  return out;
};

const hasWords = (s) => /\p{L}{3,}/u.test(s);
const looksLikeCode = (s) => /^(\/|https?:|mailto:|gid:\/\/|#|shopify:\/\/|[a-z0-9_.-]+$|\d+%?$|[A-Z_]{2,}$)/.test(s.trim()) || /^[\w.-]+@[\w.-]+$/.test(s.trim());
const collapse = (s) => s.replace(/\s+/g, " ");

/** placeholder name for an expression: identifier → its name, a.b.c → c, else vN */
function placeholderName(expr, src, used) {
  let base = "v";
  if (expr.type === "Identifier") base = expr.name;
  else if (expr.type === "MemberExpression" && expr.property?.type === "Identifier") base = expr.property.name;
  else if (expr.type === "CallExpression" && expr.callee?.type === "Identifier") base = expr.callee.name;
  let name = base;
  let i = 1;
  while (used.has(name)) name = `${base}${i++}`;
  used.add(name);
  return name;
}

function templateToKey(node, src) {
  const used = new Set();
  let key = "";
  const vars = [];
  node.quasis.forEach((q, i) => {
    key += q.value.cooked ?? q.value.raw;
    if (i < node.expressions.length) {
      const e = node.expressions[i];
      const name = placeholderName(e, src, used);
      vars.push([name, src.slice(e.start, e.end)]);
      key += `{${name}}`;
    }
  });
  return { key, vars };
}

const tCall = (key, vars = []) => {
  const k = JSON.stringify(key);
  if (vars.length === 0) return `t(${k})`;
  return `t(${k}, { ${vars.map(([n, e]) => (n === e ? n : `${n}: ${e}`)).join(", ")} })`;
};

/** A pure module: catalogue every t("…") / T("…") key, rewrite nothing, flag nothing. */
function catalogueFile(file, catalogue) {
  const src = readFileSync(file, "utf8");
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
  let n = 0;
  traverse(ast, {
    CallExpression(path) {
      const c = path.node.callee;
      if (c.type === "Identifier" && (c.name === "t" || c.name === "T") && path.node.arguments[0]?.type === "StringLiteral") {
        catalogue.set(path.node.arguments[0].value, path.node.arguments[0].value);
        n += 1;
      }
    },
  });
  return { file, wrapped: 0, unwrapped: [], moduleLevel: 0, catalogued: n };
}

function processFile(file, catalogue) {
  const src = readFileSync(file, "utf8");
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
  const ms = new MagicString(src);
  const edits = [];
  const report = { file, wrapped: 0, unwrapped: [], moduleLevel: 0 };
  const functionsNeedingT = new Set();
  const needsMarker = { value: false };

  const enclosingFunction = (path) => {
    let p = path;
    let component = null;
    while (p) {
      if (p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression()) {
        // the OUTERMOST function that is a component or a loader/action gets the hook/tFor
        component = p;
      }
      p = p.parentPath;
    }
    return component;
  };

  /** A finding the codemod will not rewrite: counted as unwrapped so --check fails, and reported with the reason. */
  const byHand = (path, r) => {
    if (!r?.byHand) return false;
    report.wrapped += 1;
    report.unwrapped.push({ line: path.node.loc?.start.line, key: r.key.slice(0, 60), why: r.byHand });
    return true;
  };

  const alreadyWrapped = (path) => {
    // inside t("…") already, or inside a JSX element we skip
    let p = path.parentPath;
    while (p) {
      if (p.isCallExpression() && p.node.callee.type === "Identifier" && (p.node.callee.name === "t" || p.node.callee.name === "T")) return true;
      if (p.isJSXElement()) {
        const n = p.node.openingElement.name;
        if (n.type === "JSXIdentifier" && SKIP_PARENT.has(n.name)) return true;
      }
      p = p.parentPath;
    }
    return false;
  };

  const record = (path, key, replacement, start, end) => {
    if (replacement === null) return; // a by-hand finding is reported by its caller
    const fn = enclosingFunction(path);
    if (!fn) {
      // outside any function: mark with T() so the key is catalogued; the use
      // site translates at render time (by hand, reported)
      report.moduleLevel += 1;
      report.unwrapped.push({ line: path.node.loc?.start.line, key: key.slice(0, 60), why: "module level — marked T(); translate at the use site" });
      catalogue.set(key, key);
      edits.push({ start, end, replacement: replacement.replace(/^\{t\(/, "{T(").replace(/^t\(/, "T(") });
      needsMarker.value = true;
      report.wrapped += 1;
      return;
    }
    functionsNeedingT.add(fn);
    catalogue.set(key, key);
    edits.push({ start, end, replacement });
    report.wrapped += 1;
  };

  /** A string-valued expression (literal / template / ternary of those) → the t() source, or null. */
  const stringExpr = (node) => {
    if (node.type === "StringLiteral") {
      const v = node.value;
      if (!hasWords(v) || looksLikeCode(v)) return null;
      return { key: v, code: tCall(v), keys: [v] };
    }
    if (node.type === "TemplateLiteral") {
      const { key, vars } = templateToKey(node, src);
      if (!hasWords(key) || looksLikeCode(key)) return null;
      return { key, code: tCall(key, vars), keys: [key] };
    }
    if (node.type === "BinaryExpression" && node.operator === "+") {
      // "text " + x + " more text" — merchant text built by concatenation
      // cannot be translated as one sentence; it is flagged, never rewritten
      const parts = [];
      const collect = (n) => {
        if (n.type === "BinaryExpression" && n.operator === "+") {
          collect(n.left);
          collect(n.right);
        } else if (n.type === "StringLiteral") parts.push(n.value);
        else if (n.type === "TemplateLiteral") parts.push(templateToKey(n, src).key);
      };
      collect(node);
      // placeholders are not words: `${a}${b}` glued to a sentence carries no text of its own
      const joined = parts.join("").replace(/\{\w+\}/g, "");
      if (!hasWords(joined) || looksLikeCode(joined)) return null;
      return { key: joined, code: null, keys: [], byHand: "string concatenation — one t() key with {placeholders}" };
    }
    if (node.type === "LogicalExpression" && node.operator === "&&") {
      // {cond && "Merchant text"} — the right side is merchant-visible text
      const b = stringExpr(node.right);
      if (!b) return null;
      if (b.byHand) return b;
      const left = src.slice(node.left.start, node.left.end);
      return { key: b.key, code: `${left} && ${b.code}`, keys: b.keys };
    }
    if (node.type === "LogicalExpression" && (node.operator === "||" || node.operator === "??")) {
      // {title || "Untitled product"} — the fallback is merchant-visible text
      const b = stringExpr(node.right);
      if (!b) return null;
      const left = src.slice(node.left.start, node.left.end);
      return { key: b.key, code: `${left} ${node.operator} ${b.code}`, keys: b.keys };
    }
    if (node.type === "ConditionalExpression") {
      const a = stringExpr(node.consequent);
      const b = stringExpr(node.alternate);
      if (!a && !b) return null;
      const test = src.slice(node.test.start, node.test.end);
      const cs = a ? a.code : src.slice(node.consequent.start, node.consequent.end);
      const al = b ? b.code : src.slice(node.alternate.start, node.alternate.end);
      return { key: (a ?? b).key, code: `${test} ? ${cs} : ${al}`, keys: [...(a?.keys ?? []), ...(b?.keys ?? [])] };
    }
    return null;
  };

  traverse(ast, {
    // keys already wrapped — so a re-run regenerates the catalogue from the source as it is
    CallExpression(path) {
      const c = path.node.callee;
      if (c.type === "Identifier" && (c.name === "t" || c.name === "T") && path.node.arguments[0]?.type === "StringLiteral") {
        catalogue.set(path.node.arguments[0].value, path.node.arguments[0].value);
      }
    },
    JSXAttribute(path) {
      const name = path.node.name.name;
      if (typeof name !== "string" || PROP_DENY.has(name) || !PROP_ALLOW.has(name)) return;
      const v = path.node.value;
      if (!v) return;
      if (v.type === "StringLiteral") {
        const r = stringExpr(v);
        if (!r || alreadyWrapped(path)) return;
        if (byHand(path, r)) return;
        for (const k of r.keys) catalogue.set(k, k);
        record(path, r.key, `{${r.code}}`, v.start, v.end);
      } else if (v.type === "JSXExpressionContainer") {
        const r = stringExpr(v.expression);
        if (!r || alreadyWrapped(path)) return;
        if (byHand(path, r)) return;
        for (const k of r.keys) catalogue.set(k, k);
        record(path, r.key, `{${r.code}}`, v.start, v.end);
      }
    },
    ObjectProperty(path) {
      const k = path.node.key;
      const name = k.type === "Identifier" ? k.name : k.type === "StringLiteral" ? k.value : null;
      if (!name || !PROP_ALLOW.has(name)) return;
      const r = stringExpr(path.node.value);
      if (!r || alreadyWrapped(path)) return;
      if (byHand(path, r)) return;
      for (const kk of r.keys) catalogue.set(kk, kk);
      record(path, r.key, r.code, path.node.value.start, path.node.value.end);
    },
    JSXElement(path) {
      const n = path.node.openingElement.name;
      if (n.type === "JSXIdentifier" && SKIP_PARENT.has(n.name)) return;
      handleChildren(path, path.node.children);
    },
    JSXFragment(path) {
      handleChildren(path, path.node.children);
    },
  });

  function handleChildren(path, children) {
    if (alreadyWrapped(path)) return;
    // split children into runs separated by JSX elements / complex expressions
    let run = [];
    const flush = () => {
      if (run.length) processRun(path, run);
      run = [];
    };
    for (const c of children) {
      if (c.type === "JSXText") run.push(c);
      else if (c.type === "JSXExpressionContainer") {
        const e = c.expression;
        if (e.type === "JSXEmptyExpression") {
          flush();
          continue;
        }
        const simple = e.type === "Identifier" || e.type === "MemberExpression" || (e.type === "CallExpression" && e.callee.type === "Identifier" && e.callee.name !== "t");
        const stringy = e.type === "StringLiteral" || e.type === "TemplateLiteral" || e.type === "ConditionalExpression" || (e.type === "LogicalExpression" && e.operator === "&&") || (e.type === "BinaryExpression" && e.operator === "+");
        if (simple || stringy) run.push(c);
        else flush();
      } else flush();
    }
    flush();
  }

  function processRun(path, run) {
    const texts = run.filter((c) => c.type === "JSXText");
    const joinedText = texts.map((c) => c.value).join("");
    const onlyExpr = run.every((c) => c.type !== "JSXText" || !c.value.trim());
    if (onlyExpr) {
      // {"literal"} / {`template`} / {cond ? "a" : "b"} as a child
      for (const c of run) {
        if (c.type !== "JSXExpressionContainer") continue;
        const r = stringExpr(c.expression);
        if (!r) continue;
        if (byHand(path, r)) continue;
        for (const k of r.keys) catalogue.set(k, k);
        record(path, r.key, `{${r.code}}`, c.start, c.end);
      }
      return;
    }
    if (!hasWords(joinedText)) return;
    // one key for the run: text as-is (collapsed), expressions as placeholders
    const used = new Set();
    let key = "";
    const vars = [];
    const first = run[0];
    const last = run[run.length - 1];
    for (const c of run) {
      if (c.type === "JSXText") key += c.value;
      else {
        const e = c.expression;
        const r = stringExpr(e);
        if (r && e.type === "StringLiteral") {
          key += e.value; // a quoted literal in the middle of text is text
        } else {
          const name = placeholderName(e, src, used);
          vars.push([name, src.slice(e.start, e.end)]);
          key += `{${name}}`;
        }
      }
    }
    // keep the run's own leading/trailing whitespace outside the call, so
    // spacing next to sibling elements is unchanged
    const lead = key.match(/^\s*/)[0];
    const trail = key.match(/\s*$/)[0];
    key = collapse(key.trim());
    if (!hasWords(key) || looksLikeCode(key)) return;
    const start = first.start + (first.type === "JSXText" ? lead.length : 0);
    const end = last.end - (last.type === "JSXText" ? trail.length : 0);
    if (end <= start) return;
    record(path, key, `{${tCall(key, vars)}}`, start, end);
  }

  // apply edits (non-overlapping; skip any that overlap an earlier one)
  edits.sort((a, b) => a.start - b.start);
  let lastEnd = -1;
  const applied = [];
  for (const e of edits) {
    if (e.start < lastEnd) continue;
    applied.push(e);
    lastEnd = e.end;
  }
  if (APPLY && applied.length) {
    for (const e of applied) ms.overwrite(e.start, e.end, e.replacement);
    // the hook / tFor in every function that now calls t
    const inserts = [];
    for (const fn of functionsNeedingT) {
      const body = fn.node.body;
      if (body.type !== "BlockStatement") continue; // expression-bodied arrow: reported
      const isAsync = fn.node.async;
      const params = fn.node.params.map((p) => src.slice(p.start, p.end)).join(",");
      const hasRequest = /\brequest\b/.test(params);
      const line = isAsync ? (hasRequest ? "  const t = tForRequest(request);\n" : null) : "  const t = useT();\n";
      if (!line) {
        report.unwrapped.push({ line: fn.node.loc?.start.line, key: "(async function without request)", why: "no way to resolve a locale here" });
        continue;
      }
      // skip if the function already declares t
      const bodySrc = src.slice(body.start, body.end);
      if (/\bconst t = (useT|tForRequest|tFor)\(/.test(bodySrc)) continue;
      inserts.push({ at: body.start + 1, line });
    }
    for (const ins of inserts) ms.appendRight(ins.at, "\n" + ins.line.replace(/\n$/, ""));
    // imports
    const needsHook = [...functionsNeedingT].some((fn) => !fn.node.async);
    const needsServer = [...functionsNeedingT].some((fn) => fn.node.async);
    const depth = file.split(/[\\/]/).length - 2; // app/routes/x.jsx → 1 → ../i18n; app/routes/a/x.jsx → 2 → ../../i18n
    const rel = "../".repeat(depth) + "i18n";
    const importLines = [];
    if (needsHook && !/from "[./]*i18n\/react\.jsx"/.test(src)) importLines.push(`import { useT } from "${rel}/react.jsx";`);
    const serverNames = [needsServer ? "tForRequest" : null, needsMarker.value ? "T" : null].filter(Boolean);
    if (serverNames.length && !/from "[./]*i18n\/index\.js"/.test(src)) importLines.push(`import { ${serverNames.join(", ")} } from "${rel}/index.js";`);
    if (importLines.length) {
      const firstImport = ast.program.body.find((n) => n.type === "ImportDeclaration");
      const at = firstImport ? firstImport.end : 0;
      ms.appendRight(at, "\n" + importLines.join("\n"));
    }
    writeFileSync(file, ms.toString());
  }
  report.applied = applied.length;
  return report;
}

const catalogue = new Map();
const reports = [];
for (const root of ROOTS) for (const f of walk(root)) reports.push(processFile(f, catalogue));
for (const f of CATALOGUE_ONLY) reports.push(catalogueFile(f, catalogue));

const totalWrapped = reports.reduce((n, r) => n + r.wrapped, 0);
const totalModule = reports.reduce((n, r) => n + r.moduleLevel, 0);
if (CHECK) {
  // In --check mode nothing was rewritten; every "wrapped" is a literal that
  // would still be wrapped — i.e. a hard-coded merchant-visible string.
  const offenders = reports.filter((r) => r.wrapped + r.moduleLevel > 0);
  for (const r of offenders) console.log(`${r.file}: ${r.wrapped + r.moduleLevel} unwrapped`);
  console.log(offenders.length ? `FAIL: ${totalWrapped + totalModule} merchant-visible literal(s) not wrapped in t()` : "ok: every merchant-visible literal is wrapped");
  process.exit(offenders.length ? 1 : 0);
}
for (const r of reports) if (r.wrapped || r.moduleLevel) console.log(`${r.file}: ${APPLY ? "wrapped" : "would wrap"} ${r.applied ?? r.wrapped}${r.moduleLevel ? `, ${r.moduleLevel} at module level (by hand)` : ""}`);
console.log(`total: ${totalWrapped} strings, ${catalogue.size} distinct keys, ${totalModule} module-level`);
for (const r of reports) for (const u of r.unwrapped) console.log(`  by hand: ${r.file}:${u.line} ${u.why} — ${u.key}`);
if (APPLY) {
  mkdirSync("app/i18n/locales", { recursive: true });
  // exactly the keys the source uses today — a key that left the source
  // leaves the catalogue (tests/utils/i18nCatalogue.test.js holds the two equal)
  const sorted = Object.fromEntries([...catalogue.keys()].sort((a, b) => a.localeCompare(b)).map((k) => [k, k]));
  writeFileSync("app/i18n/locales/en.json", JSON.stringify(sorted, null, 2) + "\n");
  console.log(`app/i18n/locales/en.json: ${Object.keys(sorted).length} keys`);
}
