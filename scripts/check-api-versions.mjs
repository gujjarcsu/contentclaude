#!/usr/bin/env node
/**
 * P0.3 — fail the build BEFORE a Shopify API version can sunset under us.
 *
 * Why this exists
 * ---------------
 * An app calling an unsupported API version is delisted from the App Store and
 * its installs are blocked for at least seven days. Nothing in this repo watched
 * for that: the version was pinned in three places, agreed by luck, and the only
 * way to learn it had aged out would have been the delisting notice.
 *
 * It also exists because of a FALSE ALARM, which is the more instructive half.
 * 11-MASTERPLAN.md carried P0.1: "the theme extension declares no api_version at
 * all — pin it to 2025-10 before 1 Oct 2026 or we are frozen out of our own
 * storefront code." That was wrong, and acting on it would have added a key that
 * does not exist to a file that was already correct:
 *
 *   - A theme app extension's shopify.extension.toml has exactly three
 *     properties: name (required), type (required), handle (optional). There is
 *     no api_version. Theme extensions are versioned as part of the APP version.
 *   - The 1 Oct 2026 deadline is the React -> Polaris web components cutover.
 *     2025-07 is the last version supporting React-based UI components, and
 *     after 1 Oct 2026 you are blocked from UPDATING an extension still on it.
 *     It binds ui_extension-family extensions. We ship none.
 *
 * So this check is deliberately shaped to answer BOTH questions mechanically,
 * and never again from memory:
 *
 *   1. Every API version we pin is more than SUNSET_WARNING_DAYS from sunset.
 *   2. Every extension that TAKES an api_version declares one, and it is at
 *      least MIN_UI_EXTENSION_VERSION (the React cutover floor).
 *   3. An extension type that takes NO api_version must not declare one.
 *
 * Rule 2 is the important one. The day somebody adds an admin/checkout/customer
 * -account UI extension, this fails until they pin it correctly. That is what
 * turns P0.1 from a recurring scare into an invariant.
 *
 * Fail-safe, not fail-open
 * ------------------------
 * Two ways a checker like this rots into decoration: it finds nothing and calls
 * that "ok", or it meets something new and shrugs. Both are errors here. If a
 * pin cannot be located, or an extension has a type this script does not know,
 * the build FAILS and names what it could not decide. Over-asking is cheap; a
 * seven-day install block is not.
 *
 * Usage: node scripts/check-api-versions.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Shopify supports each stable version for a minimum of 12 months. */
const SUPPORT_MONTHS = 12;

/** Fail while there is still a quarter of runway, not on the day it dies. */
const SUNSET_WARNING_DAYS = 90;

/**
 * The React -> Polaris web components floor. 2025-07 is the last version with
 * React-based UI components; from 1 Oct 2026 an extension still on it cannot be
 * updated. Any extension that takes an api_version must be at or past this.
 */
const MIN_UI_EXTENSION_VERSION = "2025-10";

/**
 * Extension types that do NOT take an api_version. Everything not listed here
 * is REQUIRED to declare one — an unknown type fails loudly rather than being
 * waved through, because "I have not heard of it" is not evidence it is safe.
 */
const TYPES_WITHOUT_API_VERSION = new Set(["theme"]);

const errors = [];
const notes = [];

/** ApiVersion.April26 -> "2026-04". Shopify releases on the quarter. */
const MONTH_TO_QUARTER = { January: "01", April: "04", July: "07", October: "10" };

function parseEnumMember(member) {
  const m = /^([A-Z][a-z]+)(\d{2})$/.exec(member);
  if (!m) return null;
  const quarter = MONTH_TO_QUARTER[m[1]];
  if (!quarter) return null;
  return `20${m[2]}-${quarter}`;
}

/** "2026-04" -> the Date it stops being supported (release + 12 months). */
function sunsetOf(version) {
  const m = /^(\d{4})-(\d{2})$/.exec(version);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  // Released on the 1st of that month; supported a minimum of SUPPORT_MONTHS.
  return new Date(Date.UTC(year, month - 1 + SUPPORT_MONTHS, 1));
}

function isCalendarVersion(v) {
  return /^\d{4}-(01|04|07|10)$/.test(v);
}

/** Collected as {where, version} so every failure can name its own file. */
const pins = [];

// ---------------------------------------------------------------------------
// 1. The Admin API pin, in app/shopify.server.js
// ---------------------------------------------------------------------------
{
  const file = "app/shopify.server.js";
  const src = readFileSync(file, "utf8");
  const found = [...src.matchAll(/ApiVersion\.([A-Za-z0-9]+)/g)].map((m) => m[1]);

  if (found.length === 0) {
    errors.push(
      `${file}: no ApiVersion.<Version> found. The Admin API pin is supposed to live here; ` +
        `either it moved or this check is looking in the wrong place. Refusing to pass without finding it.`,
    );
  } else {
    for (const member of new Set(found)) {
      const version = parseEnumMember(member);
      if (!version) {
        errors.push(
          `${file}: ApiVersion.${member} is not a dated release. Unstable/Unversioned must never ship to production.`,
        );
      } else {
        pins.push({ where: `${file} (ApiVersion.${member})`, version });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. The webhooks API version, in shopify.app.toml
// ---------------------------------------------------------------------------
{
  const file = "shopify.app.toml";
  const src = readFileSync(file, "utf8");
  const m = /^\s*api_version\s*=\s*"([^"]+)"/m.exec(src);
  if (!m) {
    errors.push(`${file}: no api_version found. [webhooks] must pin one.`);
  } else {
    pins.push({ where: `${file} ([webhooks] api_version)`, version: m[1] });
  }
}

// ---------------------------------------------------------------------------
// 3. Every extension, by type
// ---------------------------------------------------------------------------
{
  const dir = "extensions";
  if (!existsSync(dir)) {
    notes.push("no extensions/ directory — nothing to check");
  } else {
    const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (entries.length === 0) notes.push("extensions/ is empty");

    for (const entry of entries) {
      const file = join(dir, entry.name, "shopify.extension.toml");
      if (!existsSync(file)) {
        errors.push(`${file}: missing. An extension directory without a config is not deployable.`);
        continue;
      }
      const src = readFileSync(file, "utf8");

      const typeMatch = /^\s*type\s*=\s*"([^"]+)"/m.exec(src);
      if (!typeMatch) {
        errors.push(`${file}: no type declared. Cannot decide whether it needs an api_version.`);
        continue;
      }
      const type = typeMatch[1];
      const versionMatch = /^\s*api_version\s*=\s*"([^"]+)"/m.exec(src);

      if (TYPES_WITHOUT_API_VERSION.has(type)) {
        // The P0.1 case, asserted in the direction that is actually true.
        if (versionMatch) {
          errors.push(
            `${file}: type="${type}" does not take an api_version, but declares api_version="${versionMatch[1]}". ` +
              `A theme app extension's config has only name, type and handle; it is versioned as part of the app version. ` +
              `Remove the key.`,
          );
        } else {
          notes.push(
            `${file}: type="${type}" — correctly declares no api_version (theme extensions are versioned with the app version)`,
          );
        }
        continue;
      }

      // Everything else must pin, and must be at or past the React cutover floor.
      if (!versionMatch) {
        errors.push(
          `${file}: type="${type}" requires an api_version and declares none. ` +
            `Pin it to ${MIN_UI_EXTENSION_VERSION} or later. (If this type genuinely takes no api_version, ` +
            `add it to TYPES_WITHOUT_API_VERSION in this script, with a link to the doc that says so.)`,
        );
        continue;
      }

      const version = versionMatch[1];
      if (!isCalendarVersion(version)) {
        errors.push(`${file}: api_version="${version}" is not a dated quarterly release.`);
        continue;
      }
      if (version < MIN_UI_EXTENSION_VERSION) {
        errors.push(
          `${file}: api_version="${version}" is below ${MIN_UI_EXTENSION_VERSION}. ` +
            `2025-07 is the last version supporting React-based UI components; from 1 Oct 2026 an extension ` +
            `still on it cannot be UPDATED. Upgrade to Polaris web components.`,
        );
        continue;
      }
      pins.push({ where: `${file} (type="${type}")`, version });
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Sunset runway, for every pin found
// ---------------------------------------------------------------------------
const now = new Date();
console.log(`API version check — ${now.toISOString().slice(0, 10)}\n`);

for (const pin of pins) {
  if (!isCalendarVersion(pin.version)) {
    errors.push(`${pin.where}: "${pin.version}" is not a dated quarterly release.`);
    continue;
  }
  const sunset = sunsetOf(pin.version);
  const daysLeft = Math.floor((sunset - now) / 86_400_000);
  const stamp = sunset.toISOString().slice(0, 10);

  if (daysLeft < 0) {
    errors.push(
      `${pin.where}: ${pin.version} SUNSET on ${stamp}, ${-daysLeft} days ago. ` +
        `An app on an unsupported version is delisted and installs are blocked for at least seven days.`,
    );
  } else if (daysLeft < SUNSET_WARNING_DAYS) {
    errors.push(
      `${pin.where}: ${pin.version} sunsets ${stamp} — only ${daysLeft} days left ` +
        `(threshold ${SUNSET_WARNING_DAYS}). Upgrade now, while it is a choice rather than an incident.`,
    );
  } else {
    console.log(`  ok  ${pin.where}\n      ${pin.version} — ${daysLeft} days of support left (sunsets ${stamp})`);
  }
}

for (const note of notes) console.log(`  --  ${note}`);

// A check that passes by finding nothing is decoration. It must have found the
// pins it exists to watch.
if (pins.length === 0 && errors.length === 0) {
  errors.push("found no API version pins at all. This check cannot pass by finding nothing.");
}

// Disagreeing pins are not automatically wrong — an extension can legitimately
// sit on a different version from the Admin client — but the Admin pin and the
// webhook pin drifting apart has bitten real apps, so say it out loud.
const appLevel = pins.filter((p) => !p.where.startsWith("extensions"));
const distinct = new Set(appLevel.map((p) => p.version));
if (distinct.size > 1) {
  errors.push(
    `the app-level API versions disagree: ${appLevel.map((p) => `${p.version} (${p.where})`).join(", ")}. ` +
      `The Admin client and the webhook subscriptions should be on the same version.`,
  );
}

if (errors.length > 0) {
  console.error(`\nAPI VERSION CHECK FAILED — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}\n`);
  process.exit(1);
}

console.log(`\nok — ${pins.length} pin(s) checked, all more than ${SUNSET_WARNING_DAYS} days from sunset.`);
