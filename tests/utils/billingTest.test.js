/**
 * resolveBillingTest — per-shop billing test mode.
 *
 * Dev stores can only approve TEST charges (Shopify requires a payment method
 * they cannot have), and the App Store review team works from a partner
 * development store. So dev stores must always get test:true, real merchants
 * real charges, and any lookup failure must fail CLOSED (real charge).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../app/shopify.server", () => ({ BILLING_TEST: false }));

const { resolveBillingTest } = await import("../../app/utils/billingTest.server.js");

const adminFor = (partnerDevelopment) => ({
  graphql: vi.fn(async () => ({
    json: async () => ({ data: { shop: { plan: { partnerDevelopment } } } }),
  })),
});

describe("resolveBillingTest", () => {
  it("returns true when global test billing is forced on", async () => {
    expect(await resolveBillingTest(undefined, "any.myshopify.com", true)).toBe(true);
  });

  it("returns true for a partner development store", async () => {
    expect(await resolveBillingTest(adminFor(true), "dev-a.myshopify.com")).toBe(true);
  });

  it("returns false for a regular store (real charge)", async () => {
    expect(await resolveBillingTest(adminFor(false), "real-a.myshopify.com")).toBe(false);
  });

  it("fails closed (real charge) when the plan lookup throws", async () => {
    const admin = { graphql: vi.fn(async () => { throw new Error("boom"); }) };
    expect(await resolveBillingTest(admin, "err-a.myshopify.com")).toBe(false);
  });

  it("caches per shop — the second call does not re-query", async () => {
    const admin = adminFor(true);
    await resolveBillingTest(admin, "cache-a.myshopify.com");
    await resolveBillingTest(admin, "cache-a.myshopify.com");
    expect(admin.graphql).toHaveBeenCalledTimes(1);
  });
});
