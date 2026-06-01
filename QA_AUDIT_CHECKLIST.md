# CONTENTCLAUDE QA AUDIT SYSTEM
## Quick Start Guide for Claude Code

**This is your pre-launch quality assurance checklist.**

Copy this entire file into your project at: `qa-audit/QA_SYSTEM.md`

---

# PHASE 1: CODE AUDIT (Start Here)

## Step 1: Navigate to Your Project in Claude Code
```bash
cd ~/contentpilot-ai
# or
cd C:\Users\PC4\contentpilot-ai
```

## Step 2: Run Security Scan
```bash
# Check for exposed secrets
grep -r "ANTHROPIC_API_KEY\|SHOPIFY_API_SECRET\|DATABASE_URL" app/routes/
# Expected: No results (or only in comments)

# Check for hardcoded secrets in utils
grep -r "ANTHROPIC_API_KEY\|SHOPIFY_API_SECRET" app/utils/ | grep -v "process.env"
# Expected: No results
```

## Step 3: Verify Free Tier Enforcement
```bash
# Check that canGenerate is exported
grep "export.*canGenerate" app/utils/usage.server.js

# Check it's called in routes
grep -r "canGenerate" app/routes/ | wc -l
# Expected: At least 3 calls (blog, product, bulk)
```

## Step 4: Validate Database Schema
```bash
npx prisma validate
# Expected: ✓ Your schema is valid
```

## Step 5: Check Dependencies
```bash
npm audit
# Expected: 0 high, 0 critical vulnerabilities

npm outdated
# Check key packages are recent (react 19+, polaris 13.9+, prisma 5+)
```

---

# PHASE 2: MERCHANT TESTING

## Persona 1: New Store Owner (5 products)
- [ ] Install app on dev store
- [ ] App loads and shows welcome screen
- [ ] Click "Sync Products" → 5 products appear in <5 seconds
- [ ] Click first product → "Generate Description"
- [ ] After 15-30 seconds, generated content appears
- [ ] Click "Publish" → Toast shows success
- [ ] Verify on Shopify storefront that description updated
- [ ] Open on iPhone (375px) → Layout adapts, buttons are tappable
- [ ] Try to generate 6th product → Error message shows upgrade path

**Pass/Fail:** ___________

## Persona 2: Established Store (500 products)
- [ ] Sync 500 products → Shows progress "Synced X of 500"
- [ ] App remains responsive (no lag when scrolling)
- [ ] Search works (type product name, filters in real-time)
- [ ] Select 50 products → Bulk generate → Progress shows percentage
- [ ] After 3-5 minutes, bulk job completes
- [ ] Sync 500 again → Instant (no duplicates in database)

**Pass/Fail:** ___________

## Persona 3: Brand Perfectionist
- [ ] Set brand voice in Settings (all 7 fields)
- [ ] Click Save → Toast shows "Brand voice saved"
- [ ] Refresh page → Settings persist
- [ ] Generate for 1 product → Content respects brand voice
- [ ] Click "Regenerate" → Choose different tone
- [ ] New content is noticeably different
- [ ] Click "History" → See all 3 versions
- [ ] Click "Restore" → Go back to version 2

**Pass/Fail:** ___________

## Persona 4: Free Tier Tester
- [ ] Install app → Shows "Free Plan — 5 generations/month"
- [ ] Generate 5 products → Counter shows "5 of 5 used"
- [ ] Try 6th → Error: "You've reached your 5 free generations"
- [ ] Error includes upgrade CTA button
- [ ] Click upgrade → Shopify billing page
- [ ] Complete purchase → Counter now shows "0 of 100 used"

**Pass/Fail:** ___________

## Persona 5: Mobile User
- [ ] Open on iPhone (375px width)
- [ ] Dashboard loads in <3 seconds
- [ ] All buttons are tappable (44x44px minimum)
- [ ] Product list stacks vertically (no horizontal scroll)
- [ ] Generate works on mobile
- [ ] Can edit and save content
- [ ] Open on iPad (768px) → Layout scales properly

**Pass/Fail:** ___________

---

# PHASE 3: EDGE CASES

Run each test. Mark PASS or FAIL.

```
[ ] PASS/FAIL — Empty store (0 products)
    Install app on store with no products → Shows empty state, not crash

[ ] PASS/FAIL — Single product
    Add 1 product → Generate works exactly like with 100 products

[ ] PASS/FAIL — Long product title (5000 chars)
    Create product with very long title → Generate handles it gracefully

[ ] PASS/FAIL — Special characters
    Create product: "iPhone 15 Pro Max™ 📱 (2024) — Limited Edition"
    → Generate doesn't break on special chars

[ ] PASS/FAIL — Many variants (100 variants)
    Create product with 100 size/color combos
    → Generates 1 description (not 100)

[ ] PASS/FAIL — Out of stock product
    Sync out-of-stock product → Generate works same as in-stock

[ ] PASS/FAIL — Draft product
    Create product, leave in draft → Can generate and publish

[ ] PASS/FAIL — Rapid button clicks (click Generate 5 times)
    Click "Generate" 5 times in quick succession
    → Button disables, only 1 API call made, not 5

[ ] PASS/FAIL — Refresh during generation
    Click Generate → After 5 seconds, refresh page
    → Data doesn't get lost, generation continues or shows status

[ ] PASS/FAIL — Browser back during publish
    Click "Publish" → Immediately click browser back
    → Publish completes server-side, data saved correctly
```

**All Edge Cases Must Be PASS Before Launch**

---

# PHASE 4: DESIGN & UX

## Spacing Consistency
- [ ] Page padding: 24px on all sides
- [ ] Card padding: 16px
- [ ] Section gap: 24px
- [ ] Button height: 40px
- [ ] Input height: 40px
- No inconsistent spacing (one card 20px, another 15px)

## Typography
- [ ] Page titles: 32px, weight 700, color #1A1A1A
- [ ] Section titles: 24px, weight 600
- [ ] Body text: 16px, weight 400
- [ ] Captions: 12px, weight 400, color #666666

## Colors
- [ ] Primary orange used consistently: #FF6B35
- [ ] All text on white: readable (check contrast with https://www.tpgi.com/color-contrast-checker/)
- [ ] All buttons have same orange
- [ ] No other colors for buttons (no red, blue, green)

## Empty States
- [ ] Dashboard (no products): Icon + "No products yet" + CTA
- [ ] Products page (no results): Icon + "No products found" + CTA
- [ ] Generated content (empty): Icon + message + CTA
- [ ] Free tier maxed: Clear message + upgrade button

## Loading States
- [ ] Dashboard loading: Skeleton cards (not "Loading...")
- [ ] Generation loading: "✨ Generating..." + spinner + "15-30 seconds"
- [ ] Bulk generation: Progress bar "25 of 100 ▓▓▓▓░░"

## Error Messages
- [ ] No raw error codes visible to user
- [ ] All errors are human-readable
- [ ] All errors suggest next action
- Example: ❌ "Error: validation_failed" → ✅ "Please add a product description before generating"

## Success Feedback
- [ ] Generate: Green checkmark + toast "Description generated successfully"
- [ ] Publish: Checkmark + toast "Published to your store ✓"
- [ ] Save: Checkmark + toast "Settings saved ✓"

## Responsive
- [ ] 375px (iPhone SE): Works perfectly
- [ ] 768px (iPad): Works perfectly
- [ ] 1024px (iPad landscape): Works perfectly
- [ ] 1440px (Desktop): Works perfectly

**Design Quality Score: ___/100**

---

# PHASE 5: PERFORMANCE

## Load Times
- [ ] Dashboard: <2 seconds (measure: DevTools Network tab)
- [ ] Product sync (100 items): <3 seconds
- [ ] Generation: 15-30 seconds (expected)
- [ ] Publish: <2 seconds

## API Optimization
- [ ] No N+1 queries (loops with DB calls inside)
- [ ] All queries filter by `shop` (no cross-shop leakage)
- [ ] Shopify GraphQL batches products (first: 100, not first: 1 looped)

## Bundle Size
- [ ] Main bundle: <200KB (gzipped)
- [ ] No huge uncompressed JS files

## Lighthouse Score
Run in DevTools → Lighthouse tab

- [ ] Mobile score: ≥85
- [ ] Desktop score: ≥90

**Performance Score: ___/100**

---

# PHASE 6: SECURITY

## Secrets
- [ ] grep "ANTHROPIC_API_KEY" app/routes/ → No results
- [ ] grep "SHOPIFY_API_SECRET" app/routes/ → No results
- [ ] grep "DATABASE_URL" app/routes/ → No results
- [ ] .env file exists (not in git)
- [ ] .env.example exists (with placeholder values only)

## Input Validation
- [ ] All forms validate on client-side
- [ ] All forms validate on server-side
- [ ] No data accepted without checking type/length

## Data Isolation
- [ ] Multi-store test: Login as Store A, generate content
- [ ] Logout, login as Store B
- [ ] Can you see Store A's content? 
  - YES → CRITICAL BUG
  - NO → PASS ✓

## Webhooks
- [ ] grep "HMAC\|crypto.verify" app/routes/webhooks/ → Should find verification
- [ ] Fake webhook (no HMAC) should be rejected

## GDPR
- [ ] shop/redact webhook exists
- [ ] When store is deleted, all its data is deleted
- [ ] (Optional) customers/redact webhook exists

## Dependencies
- [ ] npm audit → 0 high/critical vulnerabilities

**Security Score: ___/100**

---

# PHASE 7: APP STORE LISTING

## Name: ContentClaude ✓

## Tagline (max 10 words)
"Generate product descriptions with Claude AI"

## Short Description (160 chars)
"Create product descriptions, alt text, and meta tags in seconds using Claude AI. Trained on your brand voice."

## Key Features
- [ ] One-Click Generation
- [ ] Brand Voice Training
- [ ] Bulk Operations
- [ ] Easy Editing & Version History
- [ ] Direct Publishing
- [ ] Free Trial - No Credit Card

## Pricing
- Starter: Free (5 generations/month)
- Growth: $29/month (100 generations/month)
- Professional: $79/month (500 generations/month)
- Enterprise: $199/month (unlimited)

## FAQ (minimum 4 questions answered)
- [ ] "Will descriptions sound like my brand?" — YES, you train it
- [ ] "Can I edit generated content?" — YES, it's a draft
- [ ] "How long does it take?" — 15-30 seconds typical
- [ ] "What if I don't like it?" — Regenerate with different settings

**App Store Listing Score: ___/100**

---

# FINAL SIGN-OFF

## Scores Summary
- Code Quality & Architecture: ___/100
- Bug-Free Reliability: ___/100
- UI Design & Visual Polish: ___/100
- UX & User Flow: ___/100
- Error Handling & Edge Cases: ___/100
- Mobile Responsiveness: ___/100
- Performance & Efficiency: ___/100
- Security: ___/100
- App Store Listing: ___/100

## Decision
- [ ] **APPROVED FOR LAUNCH** (All categories ≥70, no critical gaps)
- [ ] **APPROVED WITH CONDITIONS** (Minor fixes acceptable during launch)
- [ ] **NOT APPROVED** (Critical gaps, fix before launch)

If NOT APPROVED, list gaps:
```
Gap 1: ________________________________
Gap 2: ________________________________
Gap 3: ________________________________

Total fix time: _____ hours
Revised launch date: ______________
```

---

## Sign-Off
**QA Engineer:** _________________________ **Date:** _________

**Manager (Waqas):** _____________________ **Date:** _________

---

**This is the standard. Nothing ships without passing all phases.**

