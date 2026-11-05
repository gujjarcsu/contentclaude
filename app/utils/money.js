/**
 * A price in the shop's own currency, in the merchant's locale.
 *
 * The product editor printed every price as `$${price}`, so a EUR or GBP
 * shop saw a dollar sign on its own products. The loader now reads
 * `shop { currencyCode }` and the screen formats with Intl through the
 * locale-aware `t.number`. Pure and client-safe (L10).
 *
 * @param {string|number} amount   Shopify's decimal string ("79.00")
 * @param {string|null} currencyCode ISO 4217 ("EUR"); null when unknown
 * @param {Function} t             the i18n translator (carries t.number)
 * @returns {string} "" when the amount is not a number
 */
export function formatMoney(amount, currencyCode, t) {
  const n = Number(amount);
  if (amount === null || amount === undefined || amount === "" || !Number.isFinite(n)) return "";
  const fmt = (opts) =>
    typeof t?.number === "function" ? t.number(n, opts) : new Intl.NumberFormat("en", opts).format(n);
  if (typeof currencyCode === "string" && /^[A-Z]{3}$/.test(currencyCode)) {
    try {
      return fmt({ style: "currency", currency: currencyCode });
    } catch {
      /* an unknown code falls through to a plain amount — never a wrong symbol */
    }
  }
  // Unknown currency: the amount without a symbol, rather than a guessed one.
  return fmt({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
