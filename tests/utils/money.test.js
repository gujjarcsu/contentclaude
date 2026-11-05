/**
 * formatMoney: a price in the shop's own currency, in the merchant's locale.
 * The product editor printed "$" for every shop (redesign v2, owner decision).
 */
import { describe, it, expect } from "vitest";
import { formatMoney } from "../../app/utils/money.js";
import { createT } from "../../app/i18n/index.js";

describe("formatMoney", () => {
  const en = createT("en");
  it("uses the shop's currency symbol", () => {
    expect(formatMoney("79.00", "EUR", en)).toBe("€79.00");
    expect(formatMoney("79", "GBP", en)).toBe("£79.00");
    expect(formatMoney("79", "AUD", en)).toBe("A$79.00");
    expect(formatMoney("79", "USD", en)).toBe("$79.00");
  });
  it("follows the merchant's locale", () => {
    expect(formatMoney("1234.5", "EUR", createT("de"))).toMatch(/^1\.234,50\s€$/);
  });
  it("never guesses a symbol when the currency is unknown", () => {
    expect(formatMoney("79", null, en)).toBe("79.00");
    expect(formatMoney("79", "nope", en)).toBe("79.00");
  });
  it("prints nothing for a missing amount", () => {
    expect(formatMoney("", "EUR", en)).toBe("");
    expect(formatMoney(undefined, "EUR", en)).toBe("");
    expect(formatMoney("abc", "EUR", en)).toBe("");
  });
});
