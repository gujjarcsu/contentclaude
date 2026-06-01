# FIX THE 3 KILL LIST ITEMS — NO EXCUSES

These are the last 3 show-stopping issues before production. Each one has the exact file, exact logic, and exact fix. Do them in order. Run `npx react-router build` after each. Run `npx vitest run` after all three.

---

## 1. POSTGRESQL MIGRATION

**File: `prisma/schema.prisma`**

Change:
```
provider = "sqlite"
```
To:
```
provider = "postgresql"
```

**File: `.env`**

Change the DATABASE_URL from the SQLite file path to a PostgreSQL connection string. If no PostgreSQL instance is available for local dev, use this format as a placeholder that the developer will fill in:

```
DATABASE_URL="postgresql://user:password@localhost:5432/contentpilot"
```

**Important Prisma migration step:**

Since we're switching database providers entirely (SQLite → PostgreSQL), the existing SQLite migration history is incompatible. Delete the old migrations folder and create a fresh baseline:

```bash
rm -rf prisma/migrations
npx prisma migrate dev --name "initial_postgresql"
```

If `npx prisma migrate dev` fails because there's no PostgreSQL server running locally, that's expected. The schema change is still correct. Just make sure `npx prisma generate` succeeds (it generates the client without needing a running DB).

Run: `npx prisma generate`

**File: `DEPLOYMENT.md`**

Update to reflect that PostgreSQL is now the DEFAULT (not a future migration). Add:

```markdown
## Local Development with SQLite (optional)

If you don't have PostgreSQL locally, you can temporarily switch back to SQLite for development:
1. Change `provider = "postgresql"` to `provider = "sqlite"` in `prisma/schema.prisma`
2. Set `DATABASE_URL="file:dev.sqlite"` in `.env`
3. Run `npx prisma migrate dev`

**Do NOT deploy to production with SQLite.** Switch back to PostgreSQL before deploying.
```

**Verification:** `npx prisma generate` succeeds. Schema shows `provider = "postgresql"`.

---

## 2. CROSS-PRODUCT DIFFERENTIATION IN SINGLE-PRODUCT MODE

**File: `app/routes/app.products_.$id.jsx`**

In the `action` function, inside the block where `actionType === "generate"` (the single-product generation flow), BEFORE calling `generateProductContent()`, add this query:

```javascript
// Fetch recent similar product titles for differentiation context
const { default: prismaDb } = await import("../db.server.js");
const recentContent = await prismaDb.generatedContent.findMany({
  where: {
    shop,
    contentType: "description",
    status: { in: ["draft", "published"] },
    productTitle: { not: product.title },
  },
  select: { productTitle: true },
  orderBy: { updatedAt: "desc" },
  take: 10,
});
const recentSimilarTitles = recentContent
  .map(r => r.productTitle)
  .filter(Boolean);
```

Then pass `recentSimilarTitles` to the `generateProductContent()` call. The function already accepts this parameter (it's used in bulkProcessor). Just add it:

```javascript
const result = await generateProductContent(
  productData,
  brandVoice,
  {
    contentTypes,
    keywords: targetKeywords,
    length: contentLength,
    recentSimilarTitles,  // <-- ADD THIS
  }
);
```

Make sure `generateProductContent` in `ai.server.js` already uses this parameter to add the DIFFERENTIATION section to the prompt. It should — verify that the `recentSimilarTitles` parameter is destructured from `options` and included in `buildPrompt()`.

**Verification:** Build succeeds. When generating content for a single product, the prompt now includes differentiation context from the last 10 generated products.

---

## 3. CAP FREE RE-GENERATIONS AT 3 PER PRODUCT PER 24 HOURS

**File: `app/utils/plans.server.js`**

Find the free re-generation check in `tryConsumeGeneration()`. Currently it does a `findFirst` to check if ANY usage record exists for this productId within 24 hours. Change it to `count()` and cap at 3:

Replace the existing free re-generation block:

```javascript
// OLD CODE (find if any recent generation exists):
const recentGeneration = await prisma.usageRecord.findFirst({
  where: {
    shop,
    productId,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
});

if (recentGeneration) {
  return { allowed: true, isFreeRegeneration: true, ... };
}
```

With:

```javascript
// NEW CODE (count recent generations, cap at 3 free re-gens):
const MAX_FREE_REGENS = 3;
const recentCount = await prisma.usageRecord.count({
  where: {
    shop,
    productId,
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
});

if (recentCount > 0 && recentCount <= MAX_FREE_REGENS) {
  // Free re-generation: same product, within 24h, under the cap
  return { allowed: true, isFreeRegeneration: true, planName: plan.planName, monthlyLimit: plan.monthlyLimit, remaining: plan.monthlyLimit - monthlyCount };
}
// If recentCount > MAX_FREE_REGENS, fall through to normal credit consumption
```

This means:
- 1st generation of a product: costs 1 credit (normal)
- 2nd, 3rd, 4th re-generation within 24h: FREE (re-gen grace period)
- 5th+ re-generation within 24h: costs 1 credit (cap reached)

**Update the test file: `tests/utils/plans.test.js`**

Add a test that verifies the cap:

```javascript
it("allows free re-generation up to 3 times within 24h", async () => {
  // Mock: 2 recent usage records for the same productId
  prisma.usageRecord.count.mockResolvedValue(2);
  prisma.plan.findUnique.mockResolvedValue({ planName: "free", monthlyLimit: 25, status: "active" });
  
  const result = await tryConsumeGeneration("shop.myshopify.com", "gid://shopify/Product/123");
  expect(result.allowed).toBe(true);
  expect(result.isFreeRegeneration).toBe(true);
});

it("charges a credit after 3 free re-generations", async () => {
  // Mock: 4 recent usage records (past the cap)
  prisma.usageRecord.count.mockResolvedValue(4);
  prisma.plan.findUnique.mockResolvedValue({ planName: "free", monthlyLimit: 25, status: "active" });
  // ... rest of the normal credit consumption mock
});
```

**Verification:** Build succeeds. Tests pass. A product re-generated 4+ times within 24 hours consumes a credit on the 5th attempt.

---

## FINAL CHECK

```bash
npx prisma generate
npx react-router build
npx vitest run
```

All three must succeed. Confirm:
- [ ] `prisma/schema.prisma` has `provider = "postgresql"`
- [ ] Single-product generation includes `recentSimilarTitles` in the AI call
- [ ] `tryConsumeGeneration()` uses `count()` with a cap of 3 free re-gens
- [ ] New tests exist for the re-generation cap
- [ ] Build is clean
- [ ] All tests pass
