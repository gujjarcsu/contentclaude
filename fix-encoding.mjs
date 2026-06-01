import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Windows-1252 code page: byte values 0x80-0x9F mapped to their Unicode codepoints.
const W1252 = {
  0x80:0x20AC, 0x82:0x201A, 0x83:0x0192, 0x84:0x201E, 0x85:0x2026,
  0x86:0x2020, 0x87:0x2021, 0x88:0x02C6, 0x89:0x2030, 0x8A:0x0160,
  0x8B:0x2039, 0x8C:0x0152, 0x8E:0x017D, 0x91:0x2018, 0x92:0x2019,
  0x93:0x201C, 0x94:0x201D, 0x95:0x2022, 0x96:0x2013, 0x97:0x2014,
  0x99:0x2122, 0x9A:0x0161, 0x9B:0x203A, 0x9C:0x0153, 0x9E:0x017E, 0x9F:0x0178
};

// Reverse: Unicode codepoint → Win-1252 byte
const ENCODE = {};
for (const [b, cp] of Object.entries(W1252)) ENCODE[cp] = parseInt(b);
for (let i = 0xA0; i <= 0xFF; i++) ENCODE[i] = i;

function cpToW1252(cp) {
  if (cp < 0x80) return cp;
  return (cp in ENCODE) ? ENCODE[cp] : null;
}

// Un-mojibake: original UTF-8 bytes → decoded as Win-1252 → re-stored as UTF-8.
// Reversal: take the Win-1252 string → encode to bytes → decode as UTF-8.
function fixMojibake(str) {
  const cps = [...str].map(c => c.codePointAt(0));
  const out = [];
  let i = 0;

  while (i < cps.length) {
    const cp = cps[i];
    if (cp > 0x7F && cpToW1252(cp) !== null) {
      let fixed = false;
      for (let len = 4; len >= 2; len--) {
        if (i + len > cps.length) continue;
        const bytes = [];
        let ok = true;
        for (let k = 0; k < len; k++) {
          const b = cpToW1252(cps[i + k]);
          if (b === null) { ok = false; break; }
          bytes.push(b);
        }
        if (!ok) continue;
        const buf = Buffer.from(bytes);
        const decoded = buf.toString('utf8');
        if (!decoded.includes('�') && decoded.length > 0) {
          const dcp = decoded.codePointAt(0);
          // Accept if decoded char is outside Latin-1 range — it's a "real" Unicode char
          // (arrows, typographic chars, emoji etc.)
          if (dcp > 0xFF) {
            out.push(decoded);
            i += len;
            fixed = true;
            break;
          }
        }
      }
      if (!fixed) { out.push(String.fromCodePoint(cp)); i++; }
    } else {
      out.push(String.fromCodePoint(cp)); i++;
    }
  }
  return out.join('');
}

// Replace smart/curly quotes with straight ASCII quotes.
// These break esbuild's JSX attribute parsing.
function fixSmartQuotes(str) {
  return str
    .replace(/“/g, '"')  // " LEFT DOUBLE QUOTATION MARK
    .replace(/”/g, '"')  // " RIGHT DOUBLE QUOTATION MARK
    .replace(/‘/g, "'")  // ' LEFT SINGLE QUOTATION MARK
    .replace(/’/g, "'"); // ' RIGHT SINGLE QUOTATION MARK
}

function processFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  const original = content;
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // strip BOM
  content = fixMojibake(content);
  content = fixSmartQuotes(content);
  if (content !== original) {
    writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !['node_modules', '.git', 'build'].includes(entry)) {
      results.push(...walkDir(full));
    } else if (stat.isFile() && /\.(jsx?|ts)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

const base = process.cwd();
const files = walkDir(join(base, 'app'));
let fixed = 0, unchanged = 0;

for (const f of files) {
  if (processFile(f)) {
    fixed++;
    console.log('FIXED:', f.replace(base + '\\', '').replace(base + '/', ''));
  } else {
    unchanged++;
  }
}

// Verify: check for remaining smart quotes (build-breaking)
let remaining = 0;
for (const f of files) {
  const c = readFileSync(f, 'utf8');
  const badLines = c.split('\n').filter(l => {
    const t = l.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
    return /[“”‘’]/.test(l);
  });
  if (badLines.length > 0) {
    remaining++;
    console.log('STILL BAD:', f.replace(base + '\\', '').replace(base + '/', ''));
    badLines.slice(0, 2).forEach(l => console.log('  ', JSON.stringify(l.trim().substring(0, 100))));
  }
}

console.log(`\nDone: ${fixed} files fixed, ${unchanged} unchanged, ${remaining} still have issues.`);
