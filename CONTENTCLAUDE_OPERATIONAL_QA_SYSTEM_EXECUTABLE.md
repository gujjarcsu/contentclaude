# CONTENTCLAUDE OPERATIONAL QA SYSTEM
## Executable Pre-Launch Audit — Code → Merchants → Revenue → Sign-Off

**Build Date:** 2026-06-01  
**Status:** [READY FOR AUDIT]  
**QA Engineer:** [Your Name]  
**Sign-Off Authority:** This audit is your legal responsibility to ship clean code.

---

# TABLE OF CONTENTS

1. Executive Summary & Risk Dashboard
2. Phase 1: Automated Code Audit (Executable Checklists + Scripts)
3. Phase 2: Merchant Simulation (Data-Driven Test Cases)
4. Phase 3: Design System Verification (Pixel-Perfect Standards)
5. Phase 4: Performance Profiling (Measurable Metrics)
6. Phase 5: Security Audit (OWASP Top 10 + Shopify-Specific)
7. Phase 6: App Store Listing (Tested Copy)
8. Phase 7: Revenue Protection (Bug Impact Analysis)
9. Phase 8: Launch Day Runbook
10. Final Rating & Sign-Off

---

# PART 0: EXECUTIVE SUMMARY & RISK DASHBOARD

## What This App Does (In Merchant Terms)

**For:** Shopify store owners (500-person team focus)  
**Problem:** Writing product descriptions, alt text, meta tags, FAQs takes 2-4 hours per product  
**Solution:** AI generates them in seconds, trained on your brand voice  
**Outcome:** 10x faster catalog updates, consistent tone, better SEO  
**Business Model:** Free (5/month) → Growth ($29, 100/month) → Pro ($79, 500/month) → Enterprise ($199, unlimited)  
**Target:** 1,000 merchants → $5.2M ARR across 5-app ecosystem  
**Competitive Win:** Only Claude-branded app vs ChatGPT commodities

---

## Pre-Launch Risk Assessment

| Risk | Severity | Trigger | Impact | Mitigation |
|------|----------|---------|--------|-----------|
| Free tier abuse (users gaming the system) | CRITICAL | Unlimited free generations | $50k/month API costs | Usage enforcement + rate limiting |
| Data isolation breach (Store A sees Store B data) | CRITICAL | Cross-shop query leakage | Legal liability, churn | Shop filtering on every query |
| Silent publish failures | HIGH | User thinks content went live, it didn't | Merchant sees blank product | Verify Shopify API response + show error |
| Claude API outages (Claude returns 503) | HIGH | Service down 2-4 hours | Users can't generate | Graceful error + retry queue |
| Mobile UX breaks at 375px | HIGH | 40% of users on mobile | Uninstalls, bad reviews | Full responsive test at 375/768/1024 |
| Long product sync (1000+ products hangs UI) | MEDIUM | Store with 5000 products | Timeout, looks like app is broken | Pagination + cursor-based fetch + progress bar |
| Bulk generation runs out of API credits mid-batch | MEDIUM | User starts 500-item bulk with only 100 remaining | Partial success, confusion | Pre-check usage before bulk operation |
| Typos in error messages | MEDIUM | "Genration failed" or raw error codes | Looks unprofessional, increases support | Standardized error message library |
| Performance regression (takes 60s to generate) | MEDIUM | Unoptimized Claude prompt or API call | User refreshes mid-operation | Load testing + timeout handling |

**Go/No-Go Decision Point:** If any CRITICAL or HIGH item is unfixed, DO NOT LAUNCH.

---

---

# PHASE 1: AUTOMATED CODE AUDIT

## 1.1 SETUP — RUN THESE COMMANDS FIRST

```bash
# Navigate to project
cd C:\Users\PC4\contentpilot-ai

# Install audit tools
npm install --save-dev eslint prettier eslint-plugin-security eslint-plugin-react

# Check Node/NPM versions (must be recent)
node --version  # Expected: v24+
npm --version   # Expected: v10+

# Ensure all dependencies are current
npm audit
# If vulnerabilities: npm audit fix

# List all files in project for review
find app -type f -name "*.jsx" -o -name "*.js" > /tmp/files-to-audit.txt
wc -l /tmp/files-to-audit.txt  # Should match your file count
```

---

## 1.2 CRITICAL PATH FILES (AUDIT THESE FIRST)

These files directly affect security, revenue, and data integrity. Read line-by-line.

### 1.2.1 FILE: `app/utils/usage.server.js`
**Purpose:** Enforce free tier limits (5/month), record all generation usage  
**Risk Level:** CRITICAL (controls revenue)

**Audit Checklist:**

```javascript
// ✅ MUST EXIST: canGenerate() function
export async function canGenerate(shop, plan) {
  // [Your code here]
  // MUST verify:
  // 1. Is 'shop' passed as parameter? (not session.shop directly)
  // 2. Does it check current month? (Not cumulative since install)
  // 3. Does it enforce correct limits?
  //    - Starter (free): 5/month
  //    - Growth: 100/month
  //    - Professional: 500/month
  // 4. Does it return {allowed: true/false, remaining: X}?
  // 5. Is error handling synchronous, no race conditions?
}

// TEST: Run this in Node REPL
// const usage = await canGenerate('test-shop.myshopify.com', 'starter');
// console.log(usage); // Should show {allowed: true, remaining: 5}
```

**Verification Script:**

```bash
# Check that canGenerate is exported
grep -n "export.*canGenerate" app/utils/usage.server.js

# Check that it's called before EVERY generation
grep -r "canGenerate" app/routes/
# Should see at least 3 calls: blog, product, bulk generation

# If canGenerate is NOT called somewhere, CRITICAL BUG
```

**Database Integrity Check:**

```sql
-- Run in your PostgreSQL database
-- This checks for duplicate usages or inconsistent records

SELECT shop, COUNT(*) as count
FROM "UsageRecord"
GROUP BY shop
HAVING COUNT(*) > 12;  -- Should be max 12/year per shop (1 per month)
-- If results appear, investigate duplicates

SELECT shop, month, COUNT(*) as count
FROM "UsageRecord"
GROUP BY shop, month
HAVING COUNT(*) > 1;  -- Should be exactly 1 per shop per month
-- If results appear, investigate duplicates
```

---

### 1.2.2 FILE: `app/utils/shopify.server.js`
**Purpose:** All Shopify API calls (fetch products, publish descriptions, webhooks)  
**Risk Level:** CRITICAL (data isolation, API efficiency)

**Audit Checklist:**

```javascript
// ✅ MUST EXIST: Every productUpdate() call MUST:
// 1. Verify product exists (don't silently fail)
// 2. Check Shopify response for userErrors
// 3. Log failures for debugging (but never log API key)
// 4. Handle 429 (rate limit) with exponential backoff
// 5. Timeout after 30 seconds

// ❌ RED FLAG CODE:
const result = await shopify.graphql(query, variables);
// ^ No error check, no retry, no timeout

// ✅ CORRECT CODE:
const result = await shopify.graphql(query, variables);
if (result.errors) {
  throw new Error(`Shopify API error: ${result.errors[0].message}`);
}
if (result.data?.productUpdate?.userErrors?.length > 0) {
  throw new Error(`Product update failed: ${result.data.productUpdate.userErrors[0].message}`);
}
return result.data.productUpdate.product;

// ✅ MUST EXIST: All queries filter by shop
// ❌ RED FLAG: await db.product.findMany()
// ✅ CORRECT: await db.product.findMany({where: {shop: session.shop}})
```

**Verification Script:**

```bash
# Check all Shopify queries for shop filtering
grep -n "findMany\|findUnique\|update\|create" app/utils/shopify.server.js | grep -v "where.*shop"
# If results appear, CRITICAL BUG: cross-shop data leak risk

# Check for rate limit handling
grep -n "429\|rate limit" app/utils/shopify.server.js
# If empty, MISSING: app will crash under load

# Check for error logging without exposing secrets
grep -n "SHOPIFY_API_KEY\|SHOPIFY_API_SECRET" app/utils/shopify.server.js
# If anything appears, CRITICAL BUG: secret exposure
```

---

### 1.2.3 FILE: `app/utils/ai.server.js`
**Purpose:** Claude API calls (generate descriptions, titles, meta)  
**Risk Level:** CRITICAL (cost control, data safety)

**Audit Checklist:**

```javascript
// ✅ MUST EXIST: API key is ONLY used server-side
// ❌ RED FLAG: Passed to client or logged
// Check: grep "ANTHROPIC_API_KEY" app/routes/*.jsx
// Should return NOTHING (if it returns anything, CRITICAL BUG)

// ✅ MUST EXIST: Retry logic for 429 errors
// ❌ RED FLAG: No retry = customer hits limit and generates fail
// Expected behavior:
// 1st call: fails with 429
// Wait 2 seconds (exponential backoff)
// 2nd call: succeeds

// ✅ MUST EXIST: Timeout handler
// If Claude takes >60 seconds, abort and show user error
// ❌ RED FLAG: No timeout = user waits forever

// ✅ MUST EXIST: Token counting before API call
// Estimate tokens to predict cost
// ❌ RED FLAG: Generating without knowing cost = runaway bills

// ✅ MUST EXIST: Response validation
// Is response valid JSON? Is it reasonable length?
// ❌ RED FLAG: Saving junk/hallucinated content
```

**Verification Script:**

```bash
# Verify API key is never sent to client
grep -r "ANTHROPIC_API_KEY" app/routes/
# Result should be EMPTY. If anything appears, CRITICAL BUG.

# Verify retry logic exists
grep -A 10 "generateContent\|callClaude" app/utils/ai.server.js | grep -E "retry|setTimeout|backoff"
# If empty, add retry logic before launch

# Verify timeout exists
grep -n "timeout\|AbortController" app/utils/ai.server.js
# If empty, add timeout handler

# Check that responses are validated
grep -n "JSON.parse\|if.*response\|validate" app/utils/ai.server.js
# Should show validation logic
```

---

### 1.2.4 FILE: `prisma/schema.prisma`
**Purpose:** Data model (GeneratedContent, BlogPost, UsageRecord, etc.)  
**Risk Level:** CRITICAL (data integrity, performance)

**Audit Checklist:**

```prisma
// ✅ MUST HAVE: Unique constraints to prevent duplicates
model GeneratedContent {
  id          String   @id @default(cuid())
  shop        String   // Which store this belongs to
  productId   String   // Shopify product ID
  contentType String   // description, meta, faq, alt_text, title
  
  // MUST have this index to prevent duplicates:
  @@unique([shop, productId, contentType])  // Exactly one of each per product
  @@index([shop])  // For fast lookups
  @@index([createdAt])  // For pagination
}

// ✅ MUST HAVE: Proper foreign keys
model BlogPost {
  id        String   @id @default(cuid())
  shop      String   // Which store
  topicId   String
  topic     BlogTopic @relation(fields: [topicId], references: [id], onDelete: Cascade)
}

// ❌ RED FLAG: Orphaned records (blog posts with deleted topics)
// If BlogTopic is deleted, all BlogPosts should auto-delete
// Check: onDelete: Cascade (not Set null or nothing)
```

**Verification Script:**

```bash
# List all models and their indexes
grep -n "@@unique\|@@index" prisma/schema.prisma
# Should see indexes on: shop, createdAt, productId

# Count total models
grep -n "^model " prisma/schema.prisma | wc -l
# Should match: Session, BrandVoice, GeneratedContent, GenerationJob, BlogPost, BlogTopic, UsageRecord, GDPRRequest (8 models)

# Validate schema syntax
npx prisma validate
# Should return: ✓ Your schema is valid

# Check for missing indexes (performance red flags)
# Look for large tables (GeneratedContent, BlogPost) without @@index on query fields
# At minimum should have:
# - shop (every query filters by shop)
# - createdAt (for pagination)
# - status (for filtering published/draft)
```

---

## 1.3 SECURITY AUDIT

### 1.3.1 Secret Exposure Scan

```bash
# CRITICAL: Find any exposed secrets
grep -r "ANTHROPIC_API_KEY\|SHOPIFY_API_SECRET\|DATABASE_URL\|SESSION_SECRET" app/
# Result must be EMPTY (except in .env.example or .env)
# If anything appears in /routes or /utils that's client-side, CRITICAL BUG

# Check .env file exists and is in .gitignore
cat .gitignore | grep ".env"
# Should show: .env (not .env.example)

# Verify .env.example exists (for documentation)
ls -la .env.example
# Should exist, with placeholder values, no real secrets
```

### 1.3.2 Input Validation Scan

```bash
# Check all form submissions
grep -r "JSON.parse\|request.formData\|request.json" app/routes/*.jsx
# For each result, verify there's validation:

// ✅ CORRECT PATTERN:
const data = await request.json();
if (!data.productId) throw new Error('productId required');
if (typeof data.productId !== 'string') throw new Error('Invalid productId');

// ❌ RED FLAG PATTERN:
const data = await request.json();
// Immediately use data without checking
```

### 1.3.3 CORS & Origin Verification

```bash
# Check that Shopify webhook requests verify HMAC signature
grep -n "hmac\|crypto.verify\|HMAC" app/routes/webhooks/*.jsx
# Should see HMAC verification on every webhook

# Verify origin check (app should only run in Shopify admin)
grep -n "X-Shopify-Shop-Api-Access-Token\|authorize.admin" app/routes/
# Every protected route should check this header
```

### 1.3.4 SQL Injection Prevention

```bash
# Check all Prisma queries (Prisma prevents SQL injection by design)
# But verify no raw SQL is being used:
grep -n "raw\|SQL\|\$raw" prisma/schema.prisma app/utils/*.js
# Result must be EMPTY or properly parameterized

# If raw SQL exists, verify it's parameterized:
// ❌ WRONG: db.$queryRaw`SELECT * FROM users WHERE id = ${userId}`
// ✅ RIGHT: db.$queryRaw`SELECT * FROM users WHERE id = ?`, [userId]
```

---

## 1.4 PERFORMANCE AUDIT (Static Code Analysis)

### 1.4.1 N+1 Query Detection

```bash
# Look for loops that query database
grep -B 2 -A 2 "for\|map\|forEach" app/routes/*.jsx | grep -A 2 "findUnique\|findMany\|db\."
# Each result should be investigated:

// ❌ RED FLAG (N+1):
products.map(product => {
  return db.generatedContent.findMany({where: {productId: product.id}})
})
// ^ Makes 1 query per product (N+1)

// ✅ CORRECT:
const allContent = await db.generatedContent.findMany({
  where: {productId: {in: products.map(p => p.id)}}
})
// ^ 1 query for all products
```

### 1.4.2 Unhandled Promise Detection

```bash
# Find async operations that aren't awaited
grep -rn "\.catch\|\.then" app/routes/*.jsx | grep -v "=>.*{" | head -20
# Review each - should have proper error handling

# Find async functions without try/catch
grep -B 1 "async function\|async (.*) =>" app/routes/*.jsx | grep -v "try" | head -20
# Each async function should have try/catch wrapper
```

### 1.4.3 Memory Leak Detection

```bash
# Look for event listeners/intervals that might not be cleaned up
grep -rn "addEventListener\|setInterval\|setTimeout" app/components/*.jsx
# For each result, verify cleanup in useEffect return:

// ❌ WRONG (memory leak):
useEffect(() => {
  window.addEventListener('click', handleClick);
}, [])
// Missing cleanup!

// ✅ CORRECT:
useEffect(() => {
  window.addEventListener('click', handleClick);
  return () => window.removeEventListener('click', handleClick);
}, [])
```

---

## 1.5 DEPENDENCY AUDIT

```bash
# Check for known vulnerabilities
npm audit
# If vulnerabilities exist with "high" or "critical" severity, fix before launch

# List all dependencies
npm list --depth=0
# Cross-reference against production needs
# Remove any unused dependencies

# Check for outdated packages
npm outdated
# Latest versions of key packages (React, Shopify Polaris, Prisma):
# - react: 19+
# - @shopify/polaris: 13.9.5+
# - prisma: 5+
```

---

## 1.6 CODE AUDIT SIGN-OFF

**QA Engineer Checklist:**

- [ ] Read `usage.server.js` line-by-line, understand free tier enforcement
- [ ] Read `shopify.server.js` line-by-line, understand API integration
- [ ] Read `ai.server.js` line-by-line, understand Claude integration
- [ ] Read `prisma/schema.prisma`, understand data model
- [ ] Ran secret exposure scan: **0 results** ✓
- [ ] Ran input validation scan: **all forms validated** ✓
- [ ] Ran CORS/origin verification: **all webhooks protected** ✓
- [ ] Ran SQL injection scan: **no raw SQL or all parameterized** ✓
- [ ] Ran N+1 detection: **no N+1 queries found** ✓
- [ ] Ran promise/async check: **all promises handled** ✓
- [ ] Ran memory leak check: **all listeners cleaned up** ✓
- [ ] Ran `npm audit`: **0 high/critical vulnerabilities** ✓
- [ ] All dependencies are recent versions ✓

**Code Quality Score: ___/100**

(If any item is unchecked, score cannot exceed 70)

---

---

# PHASE 2: MERCHANT SIMULATION

## 2.1 TEST DATA GENERATOR

Before simulating users, create realistic test data.

```bash
# Create a test data seed file
# File: prisma/seed.test.js

// This script creates test data without touching production
// Run with: npx prisma db seed --preview-mode

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Clear test data
  await prisma.generatedContent.deleteMany({where: {shop: "test-store.myshopify.com"}});
  
  // Create test brand voice
  await prisma.brandVoice.create({
    data: {
      shop: "test-store.myshopify.com",
      tone: "friendly",
      keywords: ["natural", "eco-friendly"],
      targetAudience: "millennial parents",
      uniqueVoice: "We're a small family business",
      productHighlights: "sustainability",
      callToAction: "Join our community"
    }
  });
  
  // Create test generated content (5 items to test free tier)
  for (let i = 1; i <= 5; i++) {
    await prisma.generatedContent.create({
      data: {
        shop: "test-store.myshopify.com",
        productId: `gid://shopify/Product/${i}`,
        contentType: "description",
        originalContent: `Original description ${i}`,
        generatedContent: `Generated description ${i}`,
        status: "published"
      }
    });
  }
  
  // Create usage record (test free tier enforcement)
  await prisma.usageRecord.create({
    data: {
      shop: "test-store.myshopify.com",
      month: new Date(),
      plan: "starter",
      generationCount: 5
    }
  });
}

main();
```

**Run it:**

```bash
npx prisma db seed
```

---

## 2.2 MERCHANT PERSONA TESTING

You are not the user. A Shopify merchant is. Test as them.

### PERSONA 1: "The Starters" — New Store (5 products)

**User Profile:**
- First Shopify store (opened this month)
- 5 products across 1 category
- No variants
- Never used AI before
- Skeptical but willing to try
- 15 minutes to test the app

**Test Script:**

```
1. Install app on dev store
   [ ] App loads without errors
   [ ] Welcome screen shows (is it clear what the app does?)
   [ ] Can see "Get Started" or similar CTA

2. First time opening app
   [ ] Dashboard shows empty state (not blank space)
   [ ] Empty state suggests next action ("Sync your products")
   [ ] Click "Sync Products"
   [ ] After 3-5 seconds, 5 products appear
   [ ] Can see product images, names, brief descriptions

3. Generate description for first product
   [ ] Click product → "Generate Description"
   [ ] Loading state shows (spinner, not blank)
   [ ] After 15-30 seconds, generated content appears
   [ ] New content is different from original (AI worked)
   [ ] Tone matches what they expect (is it good?)

4. Publish to store
   [ ] Click "Publish"
   [ ] Toast notification shows "Published successfully"
   [ ] Go to Shopify admin → product → verify description updated
   [ ] Go to storefront → product page → verify customer sees new description

5. Mobile check (open on iPhone simulator)
   [ ] App layout adapts to 375px
   [ ] All buttons are tappable (tap-target >44x44px)
   [ ] No horizontal scrolling
   [ ] Forms are easy to fill
   [ ] Text is readable (not tiny)

6. Try free tier limit (generate 5 more = 6th total)
   [ ] After 5th generation, try 6th
   [ ] Error message appears (not crash)
   [ ] Message is clear: "You've used 5 of 5 free generations this month"
   [ ] Message includes upgrade path: "Upgrade to Growth plan" CTA
   [ ] Clicking upgrade takes them to billing page

7. Exit app
   [ ] No errors in browser console (DevTools → Console)
   [ ] No 500 errors in Network tab
```

**Pass Criteria:**
- [ ] Can complete full flow in <15 minutes
- [ ] Understands what the app does after first screen
- [ ] Generated content is relevant and good quality
- [ ] Mobile experience is smooth
- [ ] Free tier limit is clear
- All actions show success feedback (toast/checkmark)

---

### PERSONA 2: "The Veterans" — Established Store (500 products)

**User Profile:**
- Running store for 3+ years
- 500 products across 10 categories
- Mix of variants (size, color, material)
- Some products out of stock
- 20 minutes to test

**Test Script:**

```
1. Install app
   [ ] App loads quickly (measure: <2 seconds)
   [ ] Dashboard shows
   [ ] "Sync Products" button visible

2. Sync 500 products
   [ ] Click "Sync Products"
   [ ] Progress bar appears (don't leave them guessing)
   [ ] After 10-15 seconds, shows "Synced 500 products"
   [ ] Can scroll through product list smoothly (no lag)
   [ ] Search works (type product name, filters in real-time)
   [ ] Can filter by status (published/draft)

3. Bulk generate (50 products at once)
   [ ] Select 50 products (checkbox)
   [ ] Click "Generate Descriptions" for all
   [ ] Dialog asks confirmation: "Generate descriptions for 50 products?"
   [ ] Bulk job starts
   [ ] Progress indicator shows: "Generated 5 of 50 (10%)"
   [ ] After 3-5 minutes, completes
   [ ] Can see results in list (all marked as published or pending)
   [ ] No crashes, app remains responsive

4. Check database didn't create duplicates
   [ ] Sync 500 again
   [ ] Should be instant (already in database)
   [ ] Not 1000 records, still 500
   [ ] This tests: @@unique constraint working

5. Mobile (iPad orientation test)
   [ ] Rotate iPad: portrait → landscape
   [ ] Layout adapts properly
   [ ] Product list shows more items in landscape (better use of space)
   [ ] No content shifts unexpectedly

6. Rate limiting (advanced)
   [ ] Set brand voice with very specific tone
   [ ] Generate for 20 products with same settings
   [ ] All generations complete (Claude API handles rate limits)
   [ ] No "429 Too Many Requests" errors visible to user
```

**Pass Criteria:**
- [ ] App handles 500 products without lag
- [ ] Bulk generation works smoothly
- [ ] Progress is visible (no mystery waits)
- [ ] No data duplication on re-sync
- [ ] Mobile/tablet experience scales well
- [ ] Can complete in <20 minutes

---

### PERSONA 3: "The Perfectionists" — High Customization

**User Profile:**
- Careful about brand voice
- Wants full control
- Will compare versions
- 30 minutes exploring

**Test Script:**

```
1. Set detailed brand voice
   [ ] Go to Settings
   [ ] Fill in all 7 fields:
       - Tone: "premium, inspirational"
       - Keywords: "luxury, craftsmanship, sustainability"
       - Target audience: "high-income professionals age 30-55"
       - Unique voice: "We're a 50-year-old family business..."
       - Product highlights: "handmade, limited edition"
       - Call to action: "Join the club"
       - Anything else: "Avoid jargon, use storytelling"
   [ ] Click Save
   [ ] Toast shows "Brand voice saved"
   [ ] Refresh page, settings are still there (persisted)

2. Generate for 1 product
   [ ] Choose premium leather product
   [ ] Click "Generate Description"
   [ ] After 20 seconds, content appears
   [ ] Read it: does it reflect the brand voice you set?
   [ ] Does it sound premium? Mention sustainability? Use storytelling?
   [ ] If yes → AI is working ✓

3. Edit the generated content
   [ ] Click "Edit"
   [ ] Text becomes editable
   [ ] Change a few words
   [ ] Click "Save"
   [ ] Toast shows "Content updated"

4. Regenerate with different settings
   [ ] Click "Regenerate"
   [ ] Ask: "Use current brand voice or customize?"
   [ ] Choose "Customize"
   [ ] Temporarily change tone to "casual, fun"
   [ ] Click "Regenerate"
   [ ] After 20 seconds, new content appears
   [ ] Compare: is it noticeably more casual?
   [ ] If yes, AI respects brand voice ✓

5. View version history
   [ ] Click "History" or version icon
   [ ] See 3 versions:
       1. Original (from Shopify)
       2. First generation (premium tone)
       3. Second generation (casual tone)
   [ ] Can click each to preview
   [ ] Can click "Restore" to revert to any version
   [ ] Should be clear which version is current

6. Publish final version
   [ ] Choose the version you like best
   [ ] Click "Publish"
   [ ] Verify on your Shopify storefront
```

**Pass Criteria:**
- [ ] Brand voice settings are saved and respected
- [ ] Generated content reflects the configured tone
- [ ] Can regenerate with different settings
- [ ] Version history shows all previous generations
- [ ] Can restore old versions without confusion
- [ ] Final publish works correctly

---

### PERSONA 4: "The Tester" — Free Tier Trial

**User Profile:**
- Just installed, wants to evaluate before paying
- 5 minutes, wants to decide quickly
- Price-sensitive

**Test Script:**

```
1. Install app (free tier)
   [ ] App loads
   [ ] Dashboard shows "Free Plan — 5 generations/month"

2. Generate 5 products
   [ ] Generate description for product 1 ✓
   [ ] Generate for product 2 ✓
   [ ] Generate for product 3 ✓
   [ ] Generate for product 4 ✓
   [ ] Generate for product 5 ✓
   [ ] Counter shows "5 of 5 used"

3. Try to generate 6th (should fail)
   [ ] Click generate for product 6
   [ ] Instead of loading, immediately shows error:
       "You've reached your 5 free generations this month"
   [ ] Includes CTA button: "Upgrade to Growth Plan — $29/month"

4. Click upgrade
   [ ] Button takes to pricing/billing page
   [ ] Shows 3 tiers:
       - Growth: $29 (100/month)
       - Professional: $79 (500/month + features)
       - Enterprise: $199 (unlimited)
   [ ] Click "Choose Growth"
   [ ] Shopify billing flow starts (standard Shopify experience)

5. Complete billing
   [ ] Confirm subscription in Shopify admin
   [ ] Return to app
   [ ] Counter now shows "0 of 100 used"
   [ ] Can generate 100 products this month ✓

6. Evaluate decision point
   [ ] Did the free tier give enough value to try?
   [ ] Was the upgrade path clear and easy?
   [ ] Would you pay $29/month for 100 generations?
   [ ] Is the price competitive vs ChatGPT tools ($29 for unlimited)?
```

**Pass Criteria:**
- [ ] Free tier limit is enforced after exactly 5 generations
- [ ] Error message is friendly and includes upgrade CTA
- [ ] Upgrade process is smooth (no friction)
- [ ] After upgrade, app immediately allows more generations
- [ ] Free tier is valuable enough to demonstrate value
- [ ] Pricing is clear and fair

---

### PERSONA 5: "The Mobile Manager" — iPhone/Android

**User Profile:**
- Managing store on the go
- iPhone 14 or Galaxy S23 (modern phone)
- Limited time, interrupted work
- Expects full app functionality on mobile

**Test Script:**

```
1. Install app, open on iPhone (Simulator: iPhone 14, 393x852px)
   [ ] Load time: <3 seconds (measure with DevTools)
   [ ] No visual overflow/distortion
   [ ] Safe area respected (doesn't hide content under notch)

2. Dashboard on mobile
   [ ] Header is readable
   [ ] Dashboard stats are visible without side-scroll
   [ ] Buttons are tappable (44x44px minimum)
   [ ] All buttons are finger-friendly, not cramped

3. Product list on mobile
   [ ] Product cards stack vertically (not horizontally)
   [ ] Can scroll through products smoothly
   [ ] Search box is at top, easy to access
   [ ] No lag when scrolling (60fps target)

4. Generate on mobile
   [ ] Tap product → "Generate"
   [ ] Form is mobile-friendly:
       - Inputs are large enough
       - Dropdown menus work with touch
       - Can see full content generation UI
   [ ] Tap "Generate"
   [ ] Loading spinner shows (not frozen screen)
   [ ] After 20-30 seconds, result appears
   [ ] Can read generated content on small screen (text not too small)

5. Edit on mobile
   [ ] Tap "Edit"
   [ ] Text input is large enough to type in
   [ ] Keyboard doesn't cover save button
   [ ] Can see save button when keyboard is open
   [ ] Tap "Save"
   [ ] Toast notification confirms save

6. Settings on mobile
   [ ] Settings page loads
   [ ] Each input is mobile-friendly
   [ ] Can scroll through all settings
   [ ] Save button is always visible or easily reachable

7. Extreme mobile test: iPhone SE (375x667px - smallest iPhone)
   [ ] Everything above still works at 375px width
   [ ] No text truncation (except where intentional)
   [ ] No buttons get cut off
   [ ] All functionality remains

8. Tablet test: iPad (768px width in portrait)
   [ ] Layout doesn't look stretched
   [ ] Uses more screen real estate than mobile
   [ ] Product cards could be 2-column layout for efficiency
   [ ] All touch targets remain 44x44px

9. Network interruption (advanced)
   [ ] Throttle to "Slow 3G" in DevTools
   [ ] Generate content
   [ ] Should show loading state, not hang
   [ ] Timeout after 45 seconds with clear error message
   [ ] "Your connection is slow. Try again in a moment."
```

**Pass Criteria:**
- [ ] Fully functional on iPhone (375px+)
- [ ] Fully functional on iPad (768px)
- [ ] All touch targets are 44x44px minimum
- [ ] No text is unreadably small
- [ ] Handles slow networks gracefully (timeout, not freeze)
- [ ] No horizontal scrolling required
- [ ] Load time on 3G is <5 seconds for dashboard

---

## 2.3 EDGE CASE TESTING

### 2.3.1 Boundary Cases

Run each test, verify graceful handling:

```javascript
// Test 1: Empty Store
// What happens if store has 0 products?
Step 1: Create new dev store with no products
Step 2: Install app
Step 3: Go to Products page
Expected: Shows empty state, not crash
  "No products synced yet"
  "Add products to your Shopify store to get started"
  No error messages

// Test 2: Single Product
// Does app handle 1 product correctly?
Step 1: Add 1 product to Shopify
Step 2: Sync in app
Step 3: Generate description
Expected: Works exactly like with 100 products
  No special handling, no bugs at boundary

// Test 3: Maximum Title Length
// What if product title is 5000 characters?
Step 1: Create product with title: "A" * 5000
Step 2: Sync to app
Step 3: Try to generate description
Expected (option A): Prompt is truncated to reasonable length (first 200 chars)
Expected (option B): Error message: "Product title too long, please edit"
NOT: Silent failure or corrupted output

// Test 4: Special Characters
// What if product title has emoji, unicode, symbols?
Step 1: Create product: "iPhone 15 Pro Max™ 📱 (2024) — Limited Edition"
Step 2: Generate description
Expected: AI generates valid content, doesn't break on special chars
NOT: "Error: Invalid character" or mojibake

// Test 5: Very Long Description (10,000 characters)
// What if original description is extremely long?
Step 1: Create product with 10,000-char description
Step 2: Generate new description
Expected: App handles it (truncates intelligently or errors clearly)
NOT: Timeout or database error

// Test 6: Many Variants
// What if product has 100 variants (size, color combinations)?
Step 1: Create product with 100 variants
Step 2: Generate description
Expected: Generates 1 description for product (not per variant)
NOT: Tries to generate 100 times (would be expensive)

// Test 7: Out of Stock Product
// What if product status is out of stock?
Step 1: Sync out-of-stock product
Step 2: Try to generate description
Expected: Works same as in-stock
NOT: Skipped or generates different content

// Test 8: Draft Product
// What if product is in draft (not published)?
Step 1: Create product, leave in draft
Step 2: Sync to app
Step 3: Generate and publish
Expected: Works, generates content for draft product
NOT: Only works for published products

// Test 9: Missing Required Field
// What if product has no description at all (null)?
Step 1: Create product without description
Step 2: Sync and generate
Expected: Generates new description from scratch
NOT: Crash or error about missing field

// Test 10: Rapid Button Clicks
// What if user clicks "Generate" 5 times in a row?
Step 1: Click "Generate"
Step 2: Immediately click "Generate" again 4 more times
Expected: 
  - First click initiates generation
  - Next 4 clicks are prevented (button disabled during loading)
  - User sees: "Generation in progress..."
  - Only 1 API call is made, not 5
NOT: 5 API calls = 5x cost, bad for business

// Test 11: Refresh During Generation
// What if user refreshes page while generating?
Step 1: Click generate
Step 2: After 5 seconds (mid-generation), refresh page
Expected:
  - Generation continues in background
  - Page reloads
  - If generation finished, result is saved and shown on reload
  - If still generating, shows "Generating..." state
NOT: Data loss, incomplete record in database

// Test 12: Browser Back Button During Save
// What if user clicks browser back while publishing?
Step 1: Click "Publish"
Step 2: Immediately click browser back
Expected:
  - Publish completes (request continues server-side)
  - Browser goes back to previous page
  - Data is saved correctly (no partial save)
NOT: Corrupted content, only half-published
```

**Test Tracking Sheet:**

```markdown
| Test | Status | Notes |
|------|--------|-------|
| Empty Store | PASS/FAIL | [notes] |
| Single Product | PASS/FAIL | [notes] |
| Max Title Length | PASS/FAIL | [notes] |
| Special Characters | PASS/FAIL | [notes] |
| Long Description | PASS/FAIL | [notes] |
| Many Variants | PASS/FAIL | [notes] |
| Out of Stock | PASS/FAIL | [notes] |
| Draft Product | PASS/FAIL | [notes] |
| Missing Fields | PASS/FAIL | [notes] |
| Rapid Clicks | PASS/FAIL | [notes] |
| Refresh During Gen | PASS/FAIL | [notes] |
| Back During Save | PASS/FAIL | [notes] |
```

**Requirement:** All tests must be PASS before launch.

---

## 2.4 MERCHANT SIMULATION SIGN-OFF

- [ ] Persona 1 (Starters): Completed successfully
- [ ] Persona 2 (Veterans): Completed successfully
- [ ] Persona 3 (Perfectionists): Completed successfully
- [ ] Persona 4 (Testers): Completed successfully
- [ ] Persona 5 (Mobile): Completed successfully
- [ ] All 12 edge cases: PASS

**Merchant Readiness Score: ___/100**

(Cannot exceed 70 if any persona test failed)

---

---

# PHASE 3: DESIGN SYSTEM VERIFICATION

## 3.1 VISUAL CONSISTENCY AUDIT

Open the app and check pixel-perfect consistency.

### 3.1.1 Spacing System (Consistent Padding/Margins)

**Standard:**
- Page padding: 24px
- Card padding: 16px
- Section gap: 24px
- List item gap: 12px
- Button height: 40px
- Input height: 40px

**Audit:**

```
Dashboard Page:
  [ ] Page has 24px padding on all sides (use DevTools inspect)
  [ ] Main section has 24px gap from other sections
  [ ] Cards have exactly 16px padding
  [ ] Button at bottom of form: 40px height, full width on mobile

Products Page:
  [ ] Product cards have consistent padding (16px)
  [ ] Gap between cards: consistent (12px or 16px, not varying)
  [ ] Search box: 40px height, matches form inputs
  [ ] No weird margins (e.g., one item has 20px, another has 15px)

Settings Page:
  [ ] Form inputs: 40px height
  [ ] Label-to-input spacing: consistent
  [ ] Section spacing: 24px between settings groups
  [ ] Save button: full width, 40px height

Blog Page:
  [ ] Same spacing rules applied
  [ ] Visual consistency with other pages
```

**Verify with DevTools:**

```
1. Open DevTools (F12)
2. Click inspect element
3. Hover over each element, check computed padding/margin
4. Document any inconsistencies
5. Fix before launch
```

---

### 3.1.2 Typography System

**Standard:**
- H1 (Page title): 32px, weight 700, color #1A1A1A
- H2 (Section title): 24px, weight 600, color #1A1A1A
- H3 (Card title): 18px, weight 600, color #1A1A1A
- Body text: 16px, weight 400, color #1A1A1A
- Caption: 12px, weight 400, color #666666
- Button text: 16px, weight 600, color white/orange

**Audit:**

Use DevTools to measure each:
```
Dashboard
  [ ] Main title "Dashboard" is 32px, weight 700
  [ ] Stat cards have H3 (18px, 600)
  [ ] Stat values are body text (16px, 400)
  [ ] Helper text under stats is caption (12px, 400, #666)

Products Page
  [ ] "Products" title is 32px, 700
  [ ] Product card titles are 18px, 600
  [ ] Product descriptions are 16px, 400
  [ ] All captions (product count, etc) are 12px, 400, #666

Settings Page
  [ ] "Settings" title is 32px, 700
  [ ] Section titles are 24px, 600
  [ ] Form labels are 14px, 500, #1A1A1A (medium weight)
  [ ] All inputs use 16px body text font
```

**Font Pair Check:**

Should use system fonts for performance:
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

If using custom fonts (e.g., Sohne, Sofia Pro), ensure:
- [ ] Fonts are loaded via font-face (not external CDN)
- [ ] Subset to needed character sets (Latin only)
- [ ] Load time impact <200ms (measure with DevTools)
- [ ] Fallback fonts are similar weight/metrics

---

### 3.1.3 Color System

**Approved colors:**
- Primary Orange: #FF6B35
- Orange Light: #FF8C42
- Orange Gradient: linear-gradient(#FF6B35, #FF8C42)
- Primary Text: #1A1A1A
- Secondary Text: #666666
- Tertiary Text: #999999
- Border: #E0E0E0
- Background: #FFFFFF
- Background Light: #F5F5F5
- Success: #10B981
- Error: #EF4444
- Warning: #F59E0B

**Audit:**

```
Every button, link, text, border should use only these colors.

Buttons:
  [ ] Primary button: background #FF6B35, text white, hover #FF5520
  [ ] Secondary button: border #FF6B35, text #FF6B35, hover background #FFF3EE
  [ ] Disabled button: background #E0E0E0, text #999999, cursor not-allowed

Text:
  [ ] Page titles: #1A1A1A
  [ ] Body text: #1A1A1A
  [ ] Secondary text: #666666
  [ ] Tertiary text: #999999
  [ ] Links: #FF6B35, underline on hover

Borders:
  [ ] All borders: #E0E0E0
  [ ] No other colors used for borders
  [ ] Consistent border-width: 1px

Forms:
  [ ] Input focus: blue border (#FF6B35) or outline
  [ ] Input placeholder: #999999
  [ ] Labels: #1A1A1A

Cards:
  [ ] Background: white (#FFFFFF)
  [ ] Border: #E0E0E0
  [ ] Shadow: subtle (rgba(0, 0, 0, 0.05))

Badges/Pills:
  [ ] Success badge: green background (#10B981), white text
  [ ] Error badge: red background (#EF4444), white text
  [ ] Neutral badge: gray background (#F5F5F5), text #1A1A1A
```

**WCAG AA Contrast Check:**

For every text element, verify contrast ratio ≥ 4.5:1 (normal text), ≥ 3:1 (large text).

```
High priority checks:
  [ ] #1A1A1A text on #FFFFFF: 13.5:1 ✓ (excellent)
  [ ] #FF6B35 (orange) on white: ~3.2:1 ⚠️ (barely meets 3:1 for large)
  [ ] #FF6B35 button text (white on orange): 7.2:1 ✓ (excellent)
  [ ] #666666 secondary text on white: 6.3:1 ✓ (excellent)
  [ ] #999999 tertiary text on white: 5.7:1 ✓ (excellent)
```

If any ratio <3:1, darken text or lighten background before launch.

Use tool: https://www.tpgi.com/color-contrast-checker/

---

### 3.1.4 Border Radius Consistency

**Standard:**
- Buttons: 6px border-radius
- Cards: 8px border-radius
- Inputs: 6px border-radius
- Pills/Badges: 9999px (full rounded)

**Audit:**

```
Buttons: [ ] All have 6px, none have 4px or 8px
Cards: [ ] All have 8px, none rounded or 6px
Inputs: [ ] All have 6px, none sharp (0px) or 8px
Pills: [ ] All have 9999px (fully rounded)
Toggles/Switches: [ ] 9999px (fully rounded)
Avatar: [ ] 9999px (fully circular)
```

---

### 3.1.5 Shadow System

**Standard (Polaris):**
- Light shadow: `box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08)`
- Medium shadow: `box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12)`
- Dark shadow: `box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15)`

**Audit:**

```
Cards: [ ] Use light or medium shadow, not dark
Modals: [ ] Use medium shadow on backdrop
Floating buttons: [ ] Use medium shadow
Inputs (focus): [ ] Use light shadow on focus, not outline
Dropdowns: [ ] Use medium shadow

No hardcoded shadows like "0 2px 5px black" — use consistent system only.
```

---

## 3.2 EMPTY STATE DESIGN

**Every empty state should:**
1. Show an icon or illustration
2. Explain the situation
3. Suggest next action

**Required Empty States:**

```
1. Dashboard (no products synced)
   Icon: 📦 or package image
   Text: "No products yet"
   Subtext: "Sync your first product from Shopify to start generating content"
   CTA: "Sync Products" button

2. Products Page (after sync, no products match filter)
   Icon: 🔍
   Text: "No products found"
   Subtext: "Try adjusting your filters or search terms"
   CTA: "Clear filters" button

3. Generated Content (no content generated)
   Icon: ✨
   Text: "No content generated yet"
   Subtext: "Choose a product and click Generate to create your first description"
   CTA: "Generate Now" button

4. Blog Topics (no topics identified)
   Icon: 📝
   Text: "No blog topics found"
   Subtext: "Your product descriptions will be analyzed to suggest blog topics"
   CTA: "Generate some products first" link

5. Free Tier Maxed Out
   Icon: 🎯
   Text: "You've used all your free generations"
   Subtext: "You have 0 of 5 generations left this month"
   CTA: "Upgrade Plan" button → pricing page
```

**Verify each empty state:**
```
[ ] Icon is visible (not broken image)
[ ] Text is centered and readable
[ ] Subtext explains the situation
[ ] CTA button is prominent
[ ] Empty state looks intentional, not broken
[ ] Matches brand colors (orange accent button)
```

---

## 3.3 LOADING & SKELETON STATES

**For every async operation (>500ms latency):**

### 3.3.1 Dashboard Loading

When dashboard first loads:

```
Before:
  Loading... (spinner, vague)

After (improved):
  [Skeleton Card 1 - pulsing gray box]
  [Skeleton Card 2 - pulsing gray box]
  [Skeleton Card 3 - pulsing gray box]
  
  Then real content slides in.
```

---

### 3.3.2 Product List Loading

When syncing products:

```
Before:
  Syncing... (spinner, could take 5 seconds or 5 minutes?)

After (improved):
  ▓▓░░░░░░░░ Synced 50 of 500 products
  
  Real progress indicator shows percentage.
  User knows it'll take ~10 more seconds.
```

---

### 3.3.3 Generation Loading

When generating content:

```
Before:
  Loading... (blank space, user doesn't know what's happening)

After (improved):
  ✨ Generating your description...
  Claude AI is analyzing your product.
  This usually takes 15-30 seconds.
  
  [Spinner]
  
  [Cancel] button (if it takes >30 seconds)
```

**Implementation:**

```jsx
// For simple action (show spinner):
{isLoading && (
  <div style={{textAlign: 'center', padding: '24px'}}>
    <Spinner />
    <p>Generating your description...</p>
    <p style={{fontSize: '12px', color: '#999'}}>
      This usually takes 15-30 seconds.
    </p>
  </div>
)}

// For long operation (show progress bar):
{isBulkGenerating && (
  <div style={{padding: '24px'}}>
    <p>Processing products...</p>
    <ProgressBar progress={(current / total) * 100} />
    <p>{current} of {total} completed</p>
  </div>
)}
```

---

## 3.4 ERROR STATE DESIGN

**Every error needs a human message.**

### 3.4.1 Form Validation Errors

```
❌ BAD:
  API error: validation_failed

✅ GOOD:
  Product description cannot be empty.
  Please add content before generating.
  [Try Again button]
```

---

### 3.4.2 API Errors

```
❌ BAD:
  Error 500: Internal Server Error

✅ GOOD:
  Something went wrong while generating.
  Please try again in a moment, or contact support if this persists.
  [Try Again button] [Contact Support link]
```

---

### 3.4.3 Rate Limit / Free Tier Exceeded

```
❌ BAD:
  Error: limit_exceeded

✅ GOOD:
  You've reached your 5 free generations this month.
  Upgrade to Growth plan ($29/month) for 100 generations.
  [Upgrade] [Cancel]
```

---

### 3.4.4 Network Error

```
❌ BAD:
  Network error

✅ GOOD:
  Your connection was interrupted.
  Please check your internet and try again.
  [Retry] [Go Back]
```

---

### 3.4.5 Shopify API Error

```
❌ BAD:
  Product not found

✅ GOOD:
  We couldn't find this product on your store.
  It may have been deleted. Refresh to reload products.
  [Refresh] [Back to Products]
```

---

**Error State Library (All Possible Errors):**

Create a document listing every error that can happen, and the user-facing message for each:

```markdown
| Error Code | User Message | Action |
|------------|--------------|--------|
| USAGE_LIMIT_EXCEEDED | You've used all your generations | Show upgrade CTA |
| PRODUCT_NOT_FOUND | Product no longer exists | Show refresh button |
| SHOPIFY_API_ERROR | Failed to publish to store | Show retry button |
| CLAUDE_API_DOWN | Service temporarily unavailable | Show retry with delay |
| NETWORK_ERROR | Connection interrupted | Show retry button |
| INVALID_INPUT | [Field-specific message] | Show input validation |
| DB_WRITE_FAILED | Failed to save changes | Show retry button |
| UNAUTHORIZED | Your session expired | Show login button |
```

Before launch, every error code must have a matching user message. No raw error codes shown to users.

---

## 3.5 SUCCESS FEEDBACK

**Every completed action should feel rewarding.**

### 3.5.1 Toast Notifications

```jsx
// After generating description:
shopify.toast.show('Description generated successfully', {
  duration: 3000,
  isError: false,
});

// After publishing:
shopify.toast.show('Published to your store ✓', {
  duration: 3000,
});

// After saving settings:
shopify.toast.show('Settings saved ✓', {
  duration: 3000,
});
```

**Requirements:**
- [ ] Toast appears top-right (not intrusive)
- [ ] Green checkmark or success icon
- [ ] Closes automatically after 3 seconds
- [ ] Not blocking (user can keep working)

---

### 3.5.2 Inline Success Indicators

For immediate actions (like clicking "Favorite"):

```jsx
{hasLiked ? (
  <Heart fill="#FF6B35" size={24} /> // Filled red heart
) : (
  <Heart outline size={24} /> // Empty heart
)}
```

---

### 3.5.3 Page-Level Success

After major action (publishing all products):

```
✓ All 50 products published
  They're now live on your store.
  View products →
```

---

## 3.6 TRANSITIONS & MICRO-ANIMATIONS

All should be smooth, subtle, never distracting.

### 3.6.1 Page Transitions

```css
/* Fade in smoothly when page loads */
.page {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

### 3.6.2 Button Hover

```css
button {
  transition: background-color 0.15s ease, transform 0.1s ease;
}

button:hover {
  background-color: #FF5520; /* Slightly darker orange */
  transform: translateY(-1px); /* Tiny lift */
}

button:active {
  transform: translateY(0); /* Returns to baseline */
}
```

---

### 3.6.3 Loading Spinner

```css
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  animation: spin 1s linear infinite;
}
```

---

### 3.6.4 Success Checkmark

```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.8);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.success-icon {
  animation: scaleIn 0.3s ease;
}
```

**Performance Check:**

```bash
# Open DevTools → Performance tab
# Click "Record"
# Perform action (e.g., generate, publish)
# Stop recording
# Check: FPS should be >60 (no jank)
# If <60fps, simplify animation
```

---

## 3.7 RESPONSIVE DESIGN AUDIT

Test at these breakpoints:

### 3.7.1 iPhone SE (375px)

```
[ ] Dashboard loads at 375px width
[ ] Navigation doesn't overflow
[ ] Cards are full width (with margin)
[ ] Buttons are tappable (44x44px minimum)
[ ] Product list is single column
[ ] No text is smaller than 14px (unreadable on mobile)
[ ] No horizontal scrolling needed

Test in: DevTools > Responsive Design Mode > iPhone SE (375x667)
```

---

### 3.7.2 iPhone 14 (390px)

```
[ ] Same as above
[ ] Can load 5-6 items per screen
[ ] Smooth scroll performance
```

---

### 3.7.3 iPad (768px in portrait)

```
[ ] Content doesn't look stretched
[ ] Product list could be 2-column for efficiency
[ ] Touch targets remain 44x44px
[ ] All features accessible
```

---

### 3.7.4 iPad Landscape (1024px)

```
[ ] Product list is 2-3 columns
[ ] Efficient use of horizontal space
[ ] All content visible without scrolling (where possible)
```

---

### 3.7.5 Desktop (1440px)

```
[ ] Maximum 4-column layout (don't stretch beyond readability)
[ ] Content has max-width (e.g., 1200px) for readability
[ ] Sidebar layout works well
[ ] All features visible and accessible
```

---

**Responsive Test Checklist:**

```bash
# Test in Chrome DevTools
# View → Developer Tools → Toggle Device Toolbar (Ctrl+Shift+M)

For each breakpoint:
  [ ] No horizontal scrolling
  [ ] All buttons tappable
  [ ] Text readable (14px+ for body, 18px+ for headings)
  [ ] Images scale properly (don't overflow)
  [ ] Forms work without keyboard covering submit button
  [ ] Layout switches at breakpoints appropriately

Run Lighthouse on mobile:
  [ ] Mobile score ≥ 85
  [ ] Desktop score ≥ 90
```

---

## 3.8 DESIGN SYSTEM VERIFICATION SIGN-OFF

- [ ] Spacing system: 100% consistent
- [ ] Typography system: 100% consistent
- [ ] Color system: 100% consistent, WCAG AA contrast verified
- [ ] Border radius: 100% consistent
- [ ] Shadow system: 100% consistent
- [ ] All empty states designed and implemented
- [ ] All loading states have UX feedback
- [ ] All error messages are human-readable
- [ ] All success actions get feedback
- [ ] All transitions are smooth and performant
- [ ] Responsive at 375px, 768px, 1024px, 1440px
- [ ] Lighthouse score: Mobile ≥85, Desktop ≥90

**Design Quality Score: ___/100**

(If any item is unchecked, cannot exceed 70)

---

---

# PHASE 4: PERFORMANCE PROFILING

## 4.1 LOAD TIME BENCHMARKS

**Targets:**
- Dashboard: <2 seconds
- Product sync (100 items): <3 seconds
- Generation: 15-30 seconds (expected)
- Publish: <2 seconds

**Measure:**

```bash
# Chrome DevTools → Network tab
# Filter to XHR/Fetch requests
# Measure response time + render time

Expected waterfall:
  1. HTML loads (<500ms)
  2. CSS loads (<200ms)
  3. JavaScript loads (<500ms)
  4. React renders (<300ms)
  5. Total: <2 seconds (first contentful paint)
```

---

## 4.2 API EFFICIENCY

### 4.2.1 GraphQL Query Optimization

**BAD (inefficient):**

```graphql
# Fetches 100 products, but returns ALL fields
query {
  products(first: 100) {
    edges {
      node {
        id
        title
        description
        images {
          url
          altText
        }
        variants {
          id
          title
          price
        }
        # ... 20 more fields
      }
    }
  }
}
```

**GOOD (efficient):**

```graphql
# Fetches only needed fields
query {
  products(first: 100) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      node {
        id
        title
        description
        featuredImage {
          url
          altText
        }
      }
    }
  }
}
```

**Savings:** 50% API payload reduction = 50% faster network transfer.

**Check all queries:**

```bash
grep -r "query.*{" app/utils/shopify.server.js
# For each query:
#   1. Is it fetching only needed fields?
#   2. Is pagination implemented (first: 100, not first: 1000)?
#   3. Are images limited? (Only featured, not all variants?)
#   4. Are variants only fetched if needed?
```

---

### 4.2.2 Rate Limiting Compliance

**Shopify limits:**
- REST API: 2 calls/second (4 requests/second bursts)
- GraphQL: 4 calls/second (higher throughput)

**ContentClaude uses GraphQL, so 4 calls/second = good.**

**Check:**

```bash
# Load test: Sync 500 products (should batch efficiently)
# DevTools → Network tab
# Timeline should show:
#   - First batch: 50 products (1 API call)
#   - Second batch: 50 products (1 API call)
#   - etc.
# NOT 500 individual calls (one per product)
```

---

### 4.2.3 API Call Batching

**Implementation:**

```javascript
// BAD (N+1):
products.forEach(product => {
  const content = await db.generatedContent.findMany({
    where: {productId: product.id}
  });
  // Makes 100 database calls for 100 products
});

// GOOD (batch):
const allContent = await db.generatedContent.findMany({
  where: {
    productId: {in: products.map(p => p.id)}
  }
});
// Makes 1 database call for all products
```

**Audit:**

```bash
grep -B 3 "db\." app/routes/*.jsx | grep -E "forEach|map.*async|for.*const"
# If you see loops with database calls inside, REFACTOR to batch
```

---

## 4.3 DATABASE PERFORMANCE

### 4.3.1 Query Execution Time

```sql
-- Check slow queries (those taking >100ms)
SELECT * FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- Or run EXPLAIN ANALYZE on queries:
EXPLAIN ANALYZE
SELECT * FROM "GeneratedContent"
WHERE shop = 'test-store.myshopify.com'
ORDER BY "createdAt" DESC
LIMIT 20;

-- Look for "Seq Scan" (bad) vs "Index Scan" (good)
-- If Seq Scan appears, add an index
```

---

### 4.3.2 Index Verification

```bash
# Check indexes exist on critical fields
psql -U [user] -d [database] -c "
  SELECT schemaname, tablename, indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename;"

# Should see indexes on:
# - GeneratedContent(shop)
# - GeneratedContent(createdAt)
# - GeneratedContent(productId)
# - BlogPost(shop)
# - UsageRecord(shop, month)
# - BrandVoice(shop)
```

---

### 4.3.3 Connection Pooling

```javascript
// Ensure Prisma has connection pooling configured
// File: .env
DATABASE_URL="postgresql://user:pass@host/db?schema=public"

// For production (Fly.io PostgreSQL):
DATABASE_URL="postgresql://user:pass@host/db?schema=public&connection_limit=10"
// ^Adjust connection_limit based on worker count
```

---

## 4.4 JAVASCRIPT BUNDLE SIZE

```bash
# Analyze bundle
npm install --save-dev webpack-bundle-analyzer

# Build and analyze
npm run build
# Should show bundle breakdown

# Target sizes:
# - Main bundle: <200KB (gzipped)
# - Polaris: ~80KB (already included)
# - React: ~40KB
# - Other: <80KB

# If >300KB:
#   1. Remove unused dependencies
#   2. Lazy-load route components
#   3. Tree-shake dead code
```

---

## 4.5 LIGHTHOUSE AUDIT

```bash
# Chrome DevTools → Lighthouse
# Click "Analyze page load"
# Check scores:

Performance: ≥85
  - Largest Contentful Paint: <2.5s
  - Cumulative Layout Shift: <0.1
  - First Input Delay: <100ms

Accessibility: ≥95
  - All images have alt text
  - Color contrast ≥4.5:1
  - Button size ≥44x44px

Best Practices: ≥95
  - HTTPS enabled
  - No console errors
  - No unminified JS/CSS

SEO: ≥90
  - Meta tags present
  - Responsive design detected
  - Mobile-friendly
```

**Before launch:**
- [ ] Mobile Lighthouse: ≥85
- [ ] Desktop Lighthouse: ≥90

---

## 4.6 STRESS TESTING (Simulated Load)

```bash
# Install: npm install --save-dev artillery

# Create test: artillery.yml
config:
  target: 'https://contentclaude-app.fly.dev'
  phases:
    - duration: 60
      arrivalRate: 10  # 10 requests/sec

scenarios:
  - name: 'Dashboard'
    flow:
      - get:
          url: '/app'

# Run test:
npx artillery quick --count 100 --num 10 https://contentclaude-app.fly.dev/app

# Check results:
# - P50 latency: <1s
# - P95 latency: <3s
# - P99 latency: <5s
# - Error rate: <1%
# - Throughput: >50 req/sec
```

---

## 4.7 CHROME DevTools PROFILING

### 4.7.1 React Rendering

```bash
# DevTools → Profiler tab
# Click "Record"
# Perform action (e.g., generate)
# Stop recording

# Check:
# - Render time <100ms for most components
# - No unnecessary re-renders (components rendering twice in a row)
# - No "wasted renders" (component rendered but props didn't change)
```

---

### 4.7.2 Network Waterfall

```bash
# DevTools → Network tab
# Reload page

# Expected waterfall (no long red bars):
✓ HTML (green) — loaded first
✓ CSS (green) — loads while HTML parsing
✓ JS (green) — doesn't block rendering
✓ Fonts (green) — loaded in parallel
✓ API calls (blue) — after page interactive

❌ Issues to fix:
✗ Large JS file (red bar) — code-split or minify
✗ Synchronous API calls — make async
✗ Render-blocking resources — defer loading
```

---

## 4.8 PERFORMANCE SIGN-OFF

- [ ] Dashboard loads: <2 seconds
- [ ] Product sync (100): <3 seconds
- [ ] Generation: 15-30 seconds (expected)
- [ ] Publish: <2 seconds
- [ ] API queries optimized (batched, not N+1)
- [ ] Indexes exist on critical fields
- [ ] Bundle size: <300KB (gzipped)
- [ ] Lighthouse Mobile: ≥85
- [ ] Lighthouse Desktop: ≥90
- [ ] Stress test passes (>50 req/sec, <1% errors)
- [ ] Chrome DevTools: No performance red flags

**Performance Score: ___/100**

(Each unchecked item = -10 points)

---

---

# PHASE 5: SECURITY AUDIT (OWASP + Shopify-Specific)

## 5.1 OWASP TOP 10 (2023)

### 5.1.1 Broken Access Control

**Risk:** User A can see/edit User B's data

**Audit:**

```javascript
// ✅ CORRECT: Every route checks session.shop
export async function loader({request}) {
  const {admin, session} = await authenticate.admin(request);
  
  const products = await db.product.findMany({
    where: {shop: session.shop}  // <-- CRITICAL: Filter by shop
  });
  
  return {products};
}

// ❌ WRONG: No session.shop check
const products = await db.product.findMany();
// This returns products from ALL shops!
```

**Test:**

```bash
# Multi-store test:
1. Log in as Store A (dev store A)
2. Generate content for product X
3. Log in as Store B (dev store B)
4. Can you see Store A's content?
   YES → CRITICAL BUG (data leak)
   NO → PASS ✓
```

---

### 5.1.2 Cryptographic Failures

**Risk:** Secrets exposed, passwords stored insecurely

**Audit:**

```bash
# Check all secrets are in .env (not hardcoded)
grep -r "sk-ant-\|shopify_.*key\|password" app/
# Should return EMPTY (or only in .env.example with placeholder)

# Check secrets never logged
grep -r "ANTHROPIC_API_KEY\|SECRET" app/routes/*.jsx
# Should return EMPTY

# Check SSL/TLS enabled (Fly.io auto-enables)
# Should see "https://" in all API calls, never "http://"
```

---

### 5.1.3 Injection (SQL, XSS, Command)

**Risk:** Attacker injects malicious code

**SQL Injection Audit:**

```bash
# Prisma uses parameterized queries (safe by default)
# But check for any raw SQL:
grep -n "\$raw\|raw{" prisma/schema.prisma app/utils/*.js
# If anything, verify it's parameterized:
// ❌ WRONG:
db.$raw`SELECT * FROM users WHERE id = ${id}`
// ✅ CORRECT:
db.$raw`SELECT * FROM users WHERE id = ?`, [id]
```

**XSS Injection Audit:**

```bash
# Check all user input is escaped
grep -r "dangerouslySetInnerHTML" app/
# If anything appears, CRITICAL BUG (unless sanitized)

# Test: Create product with title containing:
# <script>alert('xss')</script>
# Expected: No alert, script tag is visible as text
# If alert fires: XSS VULNERABILITY
```

---

### 5.1.4 Insecure Design

**Risk:** App lacks fundamental security controls (e.g., rate limiting, free tier enforcement)

**Audit:**

```javascript
// ✅ MUST EXIST: Rate limiting on generation
async function handleGenerate(request, session) {
  const canGen = await canGenerate(session.shop, session.plan);
  if (!canGen.allowed) {
    return {error: 'Limit exceeded'};  // Prevents abuse
  }
  
  // ... generate ...
  
  await recordGeneration(session.shop);  // Track usage
}

// ✅ MUST EXIST: Webhook verification
function handleShopifyWebhook(req) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const verified = crypto.timingSafeEqual(
    Buffer.from(hmac, 'base64'),
    Buffer.from(calculateHmac(req.rawBody), 'base64')
  );
  
  if (!verified) {
    return {error: 'Webhook verification failed'};  // Prevents fake webhooks
  }
}
```

---

### 5.1.5 Broken Authentication

**Risk:** Session tokens invalid, passwords weak, login fails

**Audit:**

```javascript
// ✅ MUST EXIST: Proper session validation
export async function loader({request}) {
  const {admin, session} = await authenticate.admin(request);
  
  // Session is validated by Shopify App Bridge (not manual)
  // If token invalid, authenticate.admin() throws error
  // No need to manually validate JWT
  
  return {shop: session.shop};
}

// ✅ MUST EXIST: Timeout for inactive sessions
// Shopify handles this automatically (24-hour timeout)
// No manual implementation needed
```

---

### 5.1.6 Software & Data Integrity Failures

**Risk:** Using outdated/vulnerable dependencies, unverified updates

**Audit:**

```bash
npm audit
# Check for vulnerabilities

npm outdated
# Check for outdated packages

# Fix vulnerabilities:
npm audit fix

# Approve all:
npm audit fix --audit-level=moderate
```

---

### 5.1.7 Identification & Authentication Failures

**Risk:** Attacker guesses/brute-forces user credentials

**Audit:**

```javascript
// ✅ ContentClaude uses OAuth (delegated to Shopify)
// Not vulnerable to brute-force because:
// 1. No passwords stored
// 2. Shopify handles rate limiting on login
// 3. No account enumeration (OAuth doesn't confirm account exists)
```

---

### 5.1.8 Software Composition Vulnerabilities

**Risk:** Using vulnerable open-source libraries

**Audit:**

```bash
npm audit
# Check for HIGH/CRITICAL vulnerabilities

# Current expected state:
# 0 high, 0 critical vulnerabilities

# If vulnerabilities exist:
npm audit fix
# OR manually update the vulnerable package
npm install [package-name]@latest
```

---

### 5.1.9 Logging & Monitoring Failures

**Risk:** No visibility into attacks or errors

**Audit:**

```javascript
// ✅ MUST EXIST: Structured logging
import pino from 'pino';
const log = pino({
  level: process.env.LOG_LEVEL || 'info'
});

log.info('User generated content', {shop, productId, status: 'success'});
log.error('API call failed', {shop, error: error.message});

// ✅ MUST EXIST: Error tracking (Sentry optional for MVP)
// At minimum: console.error() calls for all failures

// ❌ MUST NOT: Log secrets
log.info('API Key:', process.env.ANTHROPIC_API_KEY);  // WRONG
log.info('Generation completed');  // RIGHT
```

---

### 5.1.10 Server-Side Request Forgery (SSRF)

**Risk:** App makes requests to attacker-specified URLs

**Audit:**

```javascript
// ✅ SAFE: All API calls are to known endpoints
await shopify.graphql(query);  // Hard-coded endpoint
await anthropic.messages.create();  // Hard-coded endpoint

// ❌ UNSAFE: Would be vulnerable if doing this:
fetch(req.body.url);  // User-provided URL — SSRF risk
```

---

## 5.2 SHOPIFY-SPECIFIC SECURITY

### 5.2.1 HMAC Webhook Verification

```javascript
import crypto from 'crypto';

export async function handleWebhook(request) {
  const topic = request.headers['x-shopify-topic'];
  const hmac = request.headers['x-shopify-hmac-sha256'];
  const rawBody = await request.text();
  
  // Calculate expected HMAC
  const expectedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  // Time-safe comparison (prevents timing attacks)
  const verified = crypto.timingSafeEqual(
    Buffer.from(hmac),
    Buffer.from(expectedHmac)
  );
  
  if (!verified) {
    throw new Error('Webhook verification failed');
  }
  
  // Process webhook safely
  const data = JSON.parse(rawBody);
  // ...
}
```

**Test:**

```bash
# Simulate a fake webhook (no HMAC):
curl -X POST https://contentclaude.fly.dev/webhooks/shop/update \
  -H "Content-Type: application/json" \
  -d '{"fake": "data"}'

# Expected: 401 Unauthorized or error
# If accepted: CRITICAL BUG (no verification)
```

---

### 5.2.2 OAuth Token Validation

```javascript
// ✅ CORRECT: Shopify App Bridge validates tokens automatically
export async function loader({request}) {
  const {session} = await authenticate.admin(request);
  // If token invalid or expired, throws error automatically
  // No manual validation needed
}

// ❌ WRONG: Manually validating JWT
const decoded = jwt.verify(token, secret);  // Don't do this
// Shopify's middleware handles it
```

---

### 5.2.3 Scopes

**Check app scopes are defined:**

```javascript
// File: shopify.app.js
export default shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecret: process.env.SHOPIFY_API_SECRET,
  scopes: [
    'write_products',      // Publish descriptions
    'read_products',       // Sync products
    'read_orders',         // (if future feature)
  ],
  // ...
});
```

**Scopes represent permissions. Only request what you need.**

---

### 5.2.4 API Access Token Rotation

```javascript
// ✅ DONE AUTOMATICALLY: Shopify rotates access tokens
// App doesn't need to handle token rotation
// Middleware handles it transparently
```

---

## 5.3 DATA PRIVACY (GDPR/CCPA)

### 5.3.1 Shop Deletion Webhook

```javascript
// ✅ MUST EXIST: Listen for shop/redact
export async function handleWebhook(request, {queryApi}) {
  const topic = request.headers['x-shopify-topic'];
  
  if (topic === 'shop/redact') {
    const {shop_id, shop_name} = await request.json();
    
    // Delete all customer data for this shop
    await db.generatedContent.deleteMany({
      where: {shop: shop_name}
    });
    
    await db.brandVoice.deleteMany({
      where: {shop: shop_name}
    });
    
    // All other shop data automatically deleted due to CASCADE
    
    console.log(`Redacted all data for ${shop_name}`);
  }
}
```

---

### 5.3.2 Customer Data Requests

```javascript
// ✅ MUST EXIST: Listen for customers/redact (if storing customer email)
export async function handleWebhook(request) {
  const topic = request.headers['x-shopify-topic'];
  
  if (topic === 'customers/redact') {
    const {shop_id, customer} = await request.json();
    const shop = ... // Convert shop_id to shop name
    
    // Delete customer-specific data
    // (ContentClaude doesn't store customer email, so might not apply)
    
    console.log(`Redacted customer ${customer.id} for ${shop}`);
  }
}
```

---

## 5.4 SECURITY AUDIT CHECKLIST

- [ ] Secret exposure scan: 0 results
- [ ] All form inputs validated (client + server)
- [ ] All database queries filter by shop (no cross-shop data leak)
- [ ] All API calls are HTTPS
- [ ] HMAC verification on all Shopify webhooks
- [ ] Rate limiting on generation (free tier protection)
- [ ] No hardcoded credentials
- [ ] No SQL injection risks (Prisma safe by default)
- [ ] No XSS risks (React escapes by default)
- [ ] npm audit: 0 high/critical vulnerabilities
- [ ] GDPR shop/redact webhook implemented
- [ ] Session timeout: 24 hours (Shopify default)
- [ ] Error messages don't expose stack traces

**Security Score: ___/100**

(Each unchecked item = -10 points)

---

---

# PHASE 6: APP STORE LISTING

## 6.1 APP NAME

**Current:** ContentClaude  
**Evaluation:**
- ✅ Clear what it does (content generation)
- ✅ Brand tie-in (Claude AI)
- ✅ Unique vs competitors (ChatGPT alternatives)
- ✅ Pronounceable
- ✅ Memorable

**Verdict:** KEEP "ContentClaude"

---

## 6.2 TAGLINE (max 10 words)

**Current:** [Need to write]

**Options:**
1. "AI content generation powered by Claude"
2. "Generate product descriptions with Claude AI"
3. "Description writing in seconds, powered by Claude"
4. "AI descriptions, meta, alt text — powered by Claude"

**Best:** #2 (clear, specific, mentions Claude)

**Tagline:** "Generate product descriptions with Claude AI"

---

## 6.3 SHORT DESCRIPTION (160 characters for app card)

```
"Create product descriptions, alt text, and meta tags in seconds using Claude AI. Trained on your brand voice."
```

Length: 110 characters ✓

---

## 6.4 FULL APP STORE LISTING

```
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

CONTENTCLAUDE — AI Product Content in Seconds

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

WHAT IT DOES

Your store deserves product descriptions that sell. ContentClaude generates professional descriptions, meta tags, alt text, and FAQs in seconds — all powered by Claude AI and trained on your brand voice.

Instead of spending 2-4 hours per product, you'll have polished content in minutes. Publish directly to your store. A/B test variations. Keep your catalog fresh without the writing fatigue.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

WHO USES THIS

- Store owners managing 50+ products who need content written faster
- Brands that care about consistent tone across their catalog
- Teams that want to refresh descriptions but don't have a copywriter
- Anyone who's tired of writing the same product descriptions

You don't need to be a writer. ContentClaude does the writing.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

KEY FEATURES

✓ One-Click Generation
  Generate descriptions, meta titles, alt text, and FAQs for any product in seconds.

✓ Brand Voice Training
  Teach ContentClaude your tone, values, and style once. Every generation respects your brand.

✓ Bulk Operations
  Generate content for 100 products at once. Track progress. Review before publishing.

✓ Easy Editing & Version History
  Edit generated content inline. Compare versions. Restore old versions anytime.

✓ Direct Publishing
  Publish to your store with one click. See changes live immediately.

✓ Free Trial - No Credit Card
  Try 5 free generations. See if it works for your brand before committing.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

PRICING

Starter: Free (5 generations/month)
Growth: $29/month (100 generations/month)
Professional: $79/month (500 generations/month + advanced features)
Enterprise: $199/month (unlimited + API access)

All plans include a 14-day free trial.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

FAQ

Q: Will the descriptions sound like my brand?
A: Yes. You train ContentClaude on your tone, values, and style in the app settings. Every generation respects what you taught it. You can also regenerate with different settings to compare versions.

Q: Can I edit the generated content?
A: Absolutely. Generated content is a draft. Edit it however you want, then publish. ContentClaude is a starting point, not final copy.

Q: How long does generation take?
A: Most descriptions generate in 15-30 seconds. Bulk operations (100+ products) take a few minutes depending on batch size.

Q: What if I don't like the result?
A: Regenerate it. You can adjust brand voice settings and try again. ContentClaude learns from your feedback.

Q: Do I keep my data if I cancel?
A: Yes. Your generated content stays in your store. Only the app removes access is ContentClaude features. All previously published content remains on your store.

Q: What makes this different from ChatGPT or other AI writing tools?
A: ContentClaude uses Claude, an AI that excels at brand-consistent content. It's also Shopify-native — no copy-pasting between apps. Plus, you train it on your brand voice once, not every time.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

GETTING STARTED

1. Install ContentClaude (takes <1 minute)
2. Sync your products from your store
3. Train ContentClaude on your brand voice (optional but recommended)
4. Click "Generate" on any product
5. Review, edit, and publish to your store

First 5 generations are free. No credit card required.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

SUPPORT

Questions? Email support@askebs.com.au or visit our help center.

═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
```

---

## 6.5 APP STORE LISTING REVIEW CHECKLIST

- [ ] Name is clear and memorable
- [ ] Tagline explains benefit in 10 words
- [ ] Short description works as app card preview
- [ ] Full listing has clear structure with headings
- [ ] Benefit-first language (what merchant gets, not how it works)
- [ ] No buzzwords or jargon
- [ ] FAQ addresses real merchant concerns
- [ ] Pricing is clear and simple
- [ ] Call-to-action is obvious ("Install" or "Free Trial")
- [ ] No false claims (e.g., "100% accuracy" — don't say it)
- [ ] Tone is confident but not pushy
- [ ] Support contact information provided

**App Store Listing Score: ___/100**

---

---

# PHASE 7: REVENUE PROTECTION

## 7.1 BUG IMPACT ANALYSIS

For every bug found, estimate financial impact:

```
HIGH IMPACT (fixes required):
  Bug: Free tier enforcement doesn't work
  Impact: Users generate unlimited content free
  Cost per user: $29/month (average)
  Affected users: 10-50 (estimate)
  Monthly loss: $290-1,450/month
  Action: CRITICAL — must fix before launch

HIGH IMPACT:
  Bug: Silent publish failure (user thinks content went live, it doesn't)
  Impact: Merchant confusion, bad reviews, support tickets
  Cost: 1-2 hours support per incident × $50/hour = $50-100
  Affected users: 5-10 per month (estimate)
  Monthly loss: $250-1,000/month in support time
  Action: CRITICAL — must fix before launch

MEDIUM IMPACT:
  Bug: Mobile app breaks at 375px width
  Impact: Mobile users can't use app, uninstall/bad review
  Cost: 1-2 uninstalls per week, repeat churn = -$58/month revenue
  Affected users: 40% of user base
  Monthly loss: $200-400/month (churn)
  Action: HIGH — must fix before launch

MEDIUM IMPACT:
  Bug: Bulk generation times out (>60 seconds)
  Impact: Users think app is broken, retry, generate duplicates
  Cost: Duplicate content published, refund request ($29)
  Affected users: 1-2 per month (estimate)
  Monthly loss: $29-58/month
  Action: HIGH — must fix before launch

LOW IMPACT:
  Bug: Typo in error message ("Genration failed")
  Impact: Looks unprofessional
  Cost: Harder to quantify (brand/trust loss)
  Affected users: 100% who see this error
  Action: FIX — low effort, high ROI
```

---

## 7.2 CONVERSION FUNNEL OPTIMIZATION

**Expected funnel:**

```
100 installs
└─ 80 try free tier (80%)
   └─ 40 upgrade (50% of trial users)
   │  └─ 36 stay paid for 3 months (90% retention)
   └─ 40 don't upgrade (churn)

Revenue:
- 36 paid customers × $29/month (avg tier) = $1,044/month
- After 3 months: 32 still paying (90% retention) = $928/month
```

**Optimize each step:**

1. **Increase trial takers (80%):**
   - Better onboarding? Show results faster?
   - Simplify first generation?
   - Currently at 80% — good baseline

2. **Increase conversion (50%):**
   - Limit is hitting at right time (5th generation)?
   - Upgrade prompt is compelling?
   - Test: "Unlock unlimited descriptions" vs "Upgrade to Growth"
   - Target: 60% conversion with better messaging

3. **Improve retention (90%):**
   - Are paid users getting value?
   - Are they generating regularly?
   - Target: 95% retention

---

---

# PHASE 8: LAUNCH DAY RUNBOOK

## 8.1 PRE-LAUNCH (24 hours before)

```
[ ] Final code review complete
[ ] All audit phases signed off
[ ] App listing approved (text, screenshots, descriptions)
[ ] Pricing configured in Shopify
[ ] Database backups enabled
[ ] Error logging (Pino) configured
[ ] Monitoring alerts set up (if using Sentry)
[ ] Support email monitored (support@askebs.com.au)
[ ] Status page bookmarked (fly.io dashboard)
[ ] Rollback plan documented (how to revert if critical bug)
```

---

## 8.2 LAUNCH (Go Live)

```
[ ] Deploy app to production (fly deploy)
[ ] Verify app loads (visit https://[app-name].fly.dev)
[ ] Test full flow on dev store (generate → publish)
[ ] Submit app to Shopify App Store
[ ] Announce on website/social media
```

---

## 8.3 POST-LAUNCH (First 24 hours)

```
[ ] Monitor app performance (Fly.io logs)
[ ] Check for errors (Pino logs, Sentry if enabled)
[ ] Monitor API usage (Claude, Shopify)
[ ] Respond to support emails immediately
[ ] Watch for churn (users uninstalling)
[ ] Track conversion metrics (installs → paid)
```

---

## 8.4 CRITICAL ISSUES (If bugs appear)

**Decision tree:**

```
User reports bug

Is it critical? (data loss, security, revenue impact >$1k/month)
  YES → Rollback immediately
    [ ] Run: fly releases --app [app-name]
    [ ] Run: fly releases rollback --app [app-name]
    [ ] Notify users (email blast)
    [ ] Fix bug on branch
    [ ] Test thoroughly
    [ ] Redeploy

  NO → Create bug ticket
    [ ] Reproduce
    [ ] Document
    [ ] Fix on next release (24-48 hours)
    [ ] Deploy
    [ ] Notify affected users
```

---

---

# PHASE 9: FINAL RATING & SIGN-OFF

After all phases complete, rate honestly in each category:

```
SCALE:
90-100:   Launch-ready (minor tweaks okay)
80-89:    Small gaps (fix in <4 hours)
70-79:    Medium gaps (fix in <8 hours)
60-69:    Large gaps (fix in 1-2 days)
<60:      Critical issues (delay launch)

RULE:
If any category <70, document the gaps and fix before launch.
If any category <60, DO NOT LAUNCH.
```

---

## 9.1 CODE QUALITY & ARCHITECTURE: ___/100

**Criteria:**
- Is code clean, readable, and well-organized?
- Are there obvious bugs or edge cases unhandled?
- Is error handling comprehensive?
- Are there memory leaks or performance issues?
- Is the architecture sound (no technical debt)?

**If <70:** What needs fixing?

---

## 9.2 BUG-FREE RELIABILITY: ___/100

**Criteria:**
- Have all 12 edge case tests passed?
- Have all 5 merchant personas completed successfully?
- Are there any crashes or unhandled errors?
- Does the app handle failures gracefully?
- Are there any data loss scenarios?

**If <70:** What scenarios still break?

---

## 9.3 UI DESIGN & VISUAL POLISH: ___/100

**Criteria:**
- Is the design 100% consistent (spacing, typography, colors)?
- Are all empty states designed?
- Are all loading states visible?
- Are all error states user-friendly?
- Do animations feel smooth and professional?
- Is the brand (orange, ContentClaude logo) visible and polished?

**If <70:** Which screens need work?

---

## 9.4 UX & USER FLOW: ___/100

**Criteria:**
- Can a new merchant complete the flow in <5 minutes?
- Is the happy path obvious?
- Are error messages helpful?
- Are success confirmations clear?
- Would a merchant understand the value in 30 seconds?
- Is mobile experience smooth?

**If <70:** Which flows confuse users?

---

## 9.5 ERROR HANDLING & EDGE CASES: ___/100

**Criteria:**
- Are all error paths handled (no crashes)?
- Are edge cases tested (empty store, max variants, etc.)?
- Do race conditions not exist (double-click protection)?
- Does the app handle timeouts gracefully?
- Is invalid input rejected safely?

**If <70:** Which edge cases still fail?

---

## 9.6 MOBILE RESPONSIVENESS: ___/100

**Criteria:**
- Does app work on 375px (iPhone SE)?
- Are touch targets 44x44px minimum?
- Is there no horizontal scrolling?
- Are forms mobile-friendly?
- Is typography readable?
- Does performance remain good on 3G?

**If <70:** Which breakpoints break?

---

## 9.7 PERFORMANCE & EFFICIENCY: ___/100

**Criteria:**
- Dashboard: <2 seconds load time?
- Product sync (100): <3 seconds?
- API calls optimized (no N+1)?
- Database queries efficient?
- Bundle size acceptable?
- Lighthouse mobile: ≥85?

**If <70:** Which operations are slow?

---

## 9.8 SECURITY: ___/100

**Criteria:**
- No secret exposure?
- All inputs validated?
- Cross-shop data leak prevented?
- HMAC verification on webhooks?
- Rate limiting functional?
- npm audit: 0 high/critical?
- GDPR compliance (shop/redact)?

**If <70:** Which security gaps exist?

---

## 9.9 APP STORE LISTING QUALITY: ___/100

**Criteria:**
- Name is clear?
- Tagline is punchy (10 words)?
- Listing copy is benefit-first?
- FAQ addresses real merchant concerns?
- Pricing is clear?
- No false claims?
- Professional tone?

**If <70:** Rewrite which sections?

---

## 9.10 OVERALL LAUNCH READINESS: ___/100

**Criteria:**
- Are all 9 categories 70+?
- No critical bugs?
- Merchants will understand value?
- Support burden is manageable?
- Revenue model works?
- Competitive advantage is clear?
- Team is ready?

---

## 9.11 FINAL SIGN-OFF

**QA Engineer Name:** _________________________

**Date:** _________________________

**Status:**

[ ] **APPROVED FOR LAUNCH** — All categories 70+, no critical gaps

[ ] **APPROVED WITH CONDITIONS** — Categories 70+, minor fixes acceptable during/after launch

[ ] **NOT APPROVED** — Critical gaps (fix before launching), detail below:

```
Gap 1: [Category] - [Specific issue] - [Fix time]
Gap 2: [Category] - [Specific issue] - [Fix time]
Gap 3: [Category] - [Specific issue] - [Fix time]

Total fix time: _____ hours
Revised launch date: ______________
```

---

**Manager Approval (Waqas):**

[ ] I've reviewed the audit and agree with the sign-off

Signature: _________________________ Date: _____________

---

## END OF OPERATIONAL QA SYSTEM

---

**This is the standard. Nothing ships without passing every phase.**

**Questions? Run all audits again. Re-read the phases. If you still have questions, the app isn't ready.**

