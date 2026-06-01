# ⚡ CONTENTPILOT AI — ULTIMATE PRE-DEPLOYMENT COMPLETE FIX
## Everything you need to fix BEFORE production deployment. One prompt. Everything included.

---

## MISSION CRITICAL
You are preparing ContentPilot AI for production deployment to Fly.io. This prompt covers:
1. Database migration (SQLite → PostgreSQL)
2. Performance optimization
3. Security hardening (token limits, free tier protection)
4. SEO blogs feature (with visibility)
5. Help system (tooltips, guides, contextual help)
6. All bugs and glitches fixed
7. Production-ready reliability

**Nothing should be left incomplete. No shortcuts. Deploy when done.**

---

# PART 1: DATABASE MIGRATION (CRITICAL)

## Step 1.1: Update Prisma Schema for PostgreSQL

**File:** `prisma/schema.prisma`

Find this section:
```
datasource db {
  provider = "sqlite"
  url      = "file:./dev.sqlite"
}
```

Replace with:
```
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Save the file.

## Step 1.2: Verify Database Indexes

In the same `prisma/schema.prisma` file, verify these indexes exist on the tables. If missing, add them:

**On GeneratedContent table:**
```prisma
@@index([shop, productId, contentType])
@@index([shop, status])
@@index([shop, createdAt])
@@unique([shop, productId, contentType])
```

**On UsageRecord table:**
```prisma
@@index([shop, month])
@@index([shop, createdAt])
```

**On GenerationJob table:**
```prisma
@@index([shop, status])
@@index([shop, createdAt])
```

## Step 1.3: Run Migration

In your terminal:
```bash
npx prisma db push
```

This will update your local database connection. For production, Fly.io will provide DATABASE_URL automatically.

---

# PART 2: SECURITY & TOKEN LIMITS (BLOCKING VULNERABILITY)

## Step 2.1: Create Usage Management Utility

**Create new file:** `app/utils/usage.server.js`

```javascript
import prisma from './db.server.js';

/**
 * Check if a merchant can generate content
 * Returns true/false and remaining quota
 */
export async function canGenerate(shop, plan, contentType = 'product') {
  if (!shop || !plan) {
    throw new Error('shop and plan required');
  }

  const month = new Date().getFullYear() + '-' + 
    String(new Date().getMonth() + 1).padStart(2, '0');

  const monthlyUsage = await prisma.usageRecord.findUnique({
    where: { shop_month: { shop, month } },
    select: { generationsUsed: true, blogsGenerated: true }
  });

  const usage = monthlyUsage || { generationsUsed: 0, blogsGenerated: 0 };

  // Plan limits
  const limits = {
    Starter: { products: 5, blogs: 2, tokens: 5000 },
    Growth: { products: 100, blogs: 10, tokens: 50000 },
    Professional: { products: 500, blogs: 50, tokens: 250000 },
    Enterprise: { products: 5000, blogs: 999, tokens: 999999 }
  };

  const planLimits = limits[plan] || limits.Starter;
  
  let currentUsage = 0;
  let limit = 0;
  
  if (contentType === 'product') {
    currentUsage = usage.generationsUsed || 0;
    limit = planLimits.products;
  } else if (contentType === 'blog') {
    currentUsage = usage.blogsGenerated || 0;
    limit = planLimits.blogs;
  }

  if (currentUsage >= limit) {
    return {
      allowed: false,
      used: currentUsage,
      limit: limit,
      remaining: 0,
      message: `You've used ${currentUsage}/${limit} ${contentType === 'blog' ? 'blogs' : 'product generations'} this month. Upgrade to continue.`,
      contentType
    };
  }

  return {
    allowed: true,
    used: currentUsage,
    limit: limit,
    remaining: limit - currentUsage,
    contentType
  };
}

/**
 * Increment usage after successful generation
 */
export async function recordGeneration(shop, contentType = 'product') {
  if (!shop) {
    throw new Error('shop required');
  }

  const month = new Date().getFullYear() + '-' + 
    String(new Date().getMonth() + 1).padStart(2, '0');

  const field = contentType === 'blog' ? 'blogsGenerated' : 'generationsUsed';

  await prisma.usageRecord.upsert({
    where: { shop_month: { shop, month } },
    create: {
      shop,
      month,
      [field]: 1,
      generationsUsed: contentType === 'product' ? 1 : 0,
      blogsGenerated: contentType === 'blog' ? 1 : 0
    },
    update: {
      [field]: { increment: 1 }
    }
  });
}

/**
 * Get current month usage summary
 */
export async function getMonthlyUsage(shop) {
  if (!shop) {
    throw new Error('shop required');
  }

  const month = new Date().getFullYear() + '-' + 
    String(new Date().getMonth() + 1).padStart(2, '0');

  const usage = await prisma.usageRecord.findUnique({
    where: { shop_month: { shop, month } }
  });

  return usage || { 
    shop, 
    month, 
    generationsUsed: 0, 
    blogsGenerated: 0 
  };
}
```

## Step 2.2: Add Generation Limit Check to ALL Generation Actions

**File:** `app/routes/app.products.$id.jsx` (Find the action function)

At the very start of the action function, add:
```javascript
import { canGenerate, recordGeneration } from '~/utils/usage.server';

export async function action({request, params}) {
  const {admin, session} = await authenticate.admin(request);
  const shop = session.shop;
  const plan = await getPlan(shop); // Your existing function

  // CHECK GENERATION LIMIT BEFORE GENERATING
  const usage = await canGenerate(shop, plan, 'product');
  if (!usage.allowed) {
    return json({
      error: usage.message,
      remaining: usage.remaining,
      limit: usage.limit,
      errorType: 'LIMIT_EXCEEDED'
    }, {status: 429});
  }

  // ... rest of your generation code ...

  // After successful generation, record it:
  await recordGeneration(shop, 'product');

  return json({success: true, remaining: usage.remaining - 1});
}
```

**File:** `app/routes/app.products.jsx` (Find the bulk generation action)

Add the same check before starting bulk generation:
```javascript
const usage = await canGenerate(shop, plan, 'product');
if (!usage.allowed) {
  return json({error: usage.message}, {status: 429});
}
```

## Step 2.3: Add Usage Display to UI

**File:** `app/routes/app.products.jsx` (In the loader or component)

```javascript
import { getMonthlyUsage } from '~/utils/usage.server';

export async function loader({request}) {
  // ... existing code ...
  const monthlyUsage = await getMonthlyUsage(shop);
  
  return json({
    products,
    plan,
    monthlyUsage
  });
}
```

In the component, display usage:
```javascript
export default function ProductsPage() {
  const {products, plan, monthlyUsage} = useLoaderData();
  
  const limits = {
    Starter: 5,
    Growth: 100,
    Professional: 500,
    Enterprise: 5000
  };
  
  const limit = limits[plan];
  const used = monthlyUsage.generationsUsed;
  const remaining = limit - used;
  
  return (
    <>
      {remaining < 5 && (
        <Banner title="Low on generations" tone={remaining === 0 ? "critical" : "warning"}>
          You've used {used} of {limit} generations this month.
          {remaining === 0 ? (
            <> <Link to="/app/plans">Upgrade your plan</Link> to generate more.</>
          ) : (
            <> {remaining} remaining.</>
          )}
        </Banner>
      )}
      
      {/* rest of page */}
    </>
  );
}
```

## Step 2.4: Protect Free Tier Users

Free tier should only allow 5 generations per month. Verify your `getPlan()` function returns "Starter" for free users, and never allow them to exceed 5.

Add this check everywhere:
```javascript
const plan = await getPlan(shop);
// Starter = free = 5 generations max
// Anything else = paid
```

---

# PART 3: PERFORMANCE OPTIMIZATION

## Step 3.1: Database Query Optimization

**File:** `app/utils/db.server.js` (or wherever you initialize Prisma)

Verify you have singleton pattern:
```javascript
import { PrismaClient } from '@prisma/client';

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient();
  }
  prisma = global.prisma;
}

export default prisma;
```

## Step 3.2: Optimize Product Fetching

**File:** `app/routes/app.products.jsx`

Find where you fetch products. Change to batch fetch with proper pagination:

```javascript
export async function loader({request}) {
  const {admin} = await authenticate.admin(request);
  const shop = session.shop;

  // GOOD: Fetch in batches
  const query = `
    query {
      products(first: 100, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            featuredImage {
              url
            }
            tags
            status
            variants(first: 5) {
              edges {
                node {
                  id
                  price
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const response = await admin.graphql(query);
  const data = await response.json();
  
  return json({products: data.data.products.edges});
}
```

## Step 3.3: Add Timeouts to AI Generation

**File:** `app/utils/ai.server.js`

Find your Claude API call. Wrap it with timeout:

```javascript
const GENERATION_TIMEOUT = 45000; // 45 seconds

export async function generateContent(prompt) {
  try {
    const result = await Promise.race([
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{role: 'user', content: prompt}]
        })
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Generation timeout')), GENERATION_TIMEOUT)
      )
    ]);
    
    return await result.json();
  } catch (error) {
    if (error.message === 'Generation timeout') {
      return {error: 'Generation took too long. Please try again.'};
    }
    throw error;
  }
}
```

## Step 3.4: Add Retry Logic with Exponential Backoff

In same file:

```javascript
async function retryWithBackoff(fn, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Only retry on rate limit or server errors
      if (error.status === 429 || error.status >= 500) {
        const delayMs = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delayMs));
      } else {
        throw error;
      }
    }
  }
  
  throw lastError;
}
```

---

# PART 4: SEO BLOGS FEATURE

## Step 4.1: Create Database Tables for Blogs

**File:** `prisma/schema.prisma`

Add these models:

```prisma
model BlogTopic {
  id              String   @id @default(cuid())
  shop            String
  title           String
  keywords        String   // comma-separated
  searchVolume    Int?
  difficulty      String   // "easy", "medium", "hard"
  relatedProducts String[] // product IDs
  status          String   @default("suggested") // suggested, generated, published
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([shop, status])
  @@index([shop, createdAt])
}

model BlogPost {
  id              String   @id @default(cuid())
  shop            String
  topicId         String
  title           String
  content         String   @db.Text
  wordCount       Int
  status          String   @default("draft") // draft, published
  relatedProducts String[] // product IDs
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  publishedAt     DateTime?

  @@index([shop, status])
  @@index([shop, topicId])
  @@index([shop, createdAt])
}
```

Then run: `npx prisma db push`

## Step 4.2: Create Blog Topics Route

**Create new file:** `app/routes/app.blogs.topics.jsx`

```javascript
import { json } from '@shopify/remix-oxygen';
import { useLoaderData } from '@remix-run/react';
import { authenticate } from '~/shopify.server';
import { Page, Layout, Card, ResourceList, ResourceItem, Button, Badge, Text } from '@shopify/polaris';
import prisma from '~/utils/db.server';

export async function loader({request}) {
  const {session} = await authenticate.admin(request);
  const shop = session.shop;

  const topics = await prisma.blogTopic.findMany({
    where: {shop},
    orderBy: {createdAt: 'desc'}
  });

  return json({topics});
}

export default function BlogTopicsPage() {
  const {topics} = useLoaderData();

  return (
    <Page title="📝 Blog Topics">
      <Layout>
        <Layout.Section>
          <Card>
            <Text variant="headingMd">Blog Opportunities</Text>
            <Text tone="subdued">
              ContentPilot identified {topics.length} blog topics from your products 
              that could drive traffic to your store.
            </Text>
            
            <ResourceList
              resourceName={{singular: 'topic', plural: 'topics'}}
              items={topics}
              renderItem={(topic) => (
                <ResourceItem id={topic.id}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                      <Text fontWeight="bold">{topic.title}</Text>
                      <Text tone="subdued">
                        Keywords: {topic.keywords} • 
                        Volume: ~{topic.searchVolume}/mo • 
                        Difficulty: {topic.difficulty}
                      </Text>
                    </div>
                    <Button url={`/app/blogs/${topic.id}`}>Generate Blog</Button>
                  </div>
                </ResourceItem>
              )}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Step 4.3: Create Generate Blog Route

**Create new file:** `app/routes/app.blogs.$topicId.jsx`

```javascript
import { json } from '@shopify/remix-oxygen';
import { useLoaderData, useActionData, useFetcher } from '@remix-run/react';
import { authenticate } from '~/shopify.server';
import { Page, Layout, Card, TextField, Select, Checkbox, Button, Banner, Text, Spinner } from '@shopify/polaris';
import { canGenerate, recordGeneration } from '~/utils/usage.server';
import { generateBlogContent } from '~/utils/ai.server';
import prisma from '~/utils/db.server';

export async function loader({request, params}) {
  const {session} = await authenticate.admin(request);
  const shop = session.shop;

  const topic = await prisma.blogTopic.findUnique({
    where: {id: params.topicId}
  });

  return json({topic});
}

export async function action({request, params}) {
  const {session, admin} = await authenticate.admin(request);
  const shop = session.shop;
  const plan = await getPlan(shop);

  // CHECK BLOG LIMIT
  const usage = await canGenerate(shop, plan, 'blog');
  if (!usage.allowed) {
    return json({error: usage.message}, {status: 429});
  }

  const formData = await request.formData();
  const topic = formData.get('topic');
  const length = formData.get('length');
  const includeTOC = formData.get('includeTOC') === 'on';
  const includeFAQ = formData.get('includeFAQ') === 'on';

  // Generate blog with Claude
  const blogContent = await generateBlogContent({
    topic,
    length,
    includeTOC,
    includeFAQ
  });

  // Save to database
  const blogPost = await prisma.blogPost.create({
    data: {
      shop,
      topicId: params.topicId,
      title: blogContent.title,
      content: blogContent.content,
      wordCount: blogContent.wordCount,
      status: 'draft'
    }
  });

  // Record usage
  await recordGeneration(shop, 'blog');

  return json({success: true, blogId: blogPost.id});
}

export default function GenerateBlogPage() {
  const {topic} = useLoaderData();
  const actionData = useActionData();
  const fetcher = useFetcher();
  const isLoading = fetcher.state === 'submitting';

  if (actionData?.success) {
    return <Page title="✅ Blog Generated" />;
  }

  return (
    <Page title={`Generate Blog: ${topic?.title}`}>
      <Layout>
        <Layout.Section>
          <Card>
            {actionData?.error && (
              <Banner tone="critical" title="Error">
                {actionData.error}
              </Banner>
            )}

            <fetcher.Form method="post">
              <div style={{padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px'}}>
                <Select
                  label="Blog Length"
                  options={[
                    {label: 'Full Blog (2000 words)', value: 'full'},
                    {label: 'Medium Blog (1000 words)', value: 'medium'},
                    {label: 'Short Blog (500 words)', value: 'short'}
                  ]}
                  name="length"
                  defaultValue="medium"
                />

                <Checkbox
                  label="Include Table of Contents"
                  name="includeTOC"
                  defaultChecked={true}
                />

                <Checkbox
                  label="Include FAQ Section"
                  name="includeFAQ"
                  defaultChecked={true}
                />

                <Text tone="subdued">
                  💡 This uses 1 blog credit. Check your plan for monthly limits.
                </Text>

                <Button submit primary fullWidth disabled={isLoading}>
                  {isLoading ? '⏳ Generating...' : 'Generate Blog'}
                </Button>
              </div>
            </fetcher.Form>

            {isLoading && (
              <div style={{padding: '20px', textAlign: 'center'}}>
                <Spinner />
                <Text>Claude is writing your blog post...</Text>
              </div>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Step 4.4: Create Generated Blogs Route

**Create new file:** `app/routes/app.blogs.generated.jsx`

```javascript
import { json } from '@shopify/remix-oxygen';
import { useLoaderData } from '@remix-run/react';
import { authenticate } from '~/shopify.server';
import { Page, Layout, Card, ResourceList, ResourceItem, Button, Badge } from '@shopify/polaris';
import prisma from '~/utils/db.server';

export async function loader({request}) {
  const {session} = await authenticate.admin(request);
  const shop = session.shop;

  const blogs = await prisma.blogPost.findMany({
    where: {shop},
    orderBy: {createdAt: 'desc'}
  });

  return json({blogs});
}

export default function GeneratedBlogsPage() {
  const {blogs} = useLoaderData();

  return (
    <Page title="📰 My Blog Posts">
      <Layout>
        <Layout.Section>
          <Card>
            <ResourceList
              resourceName={{singular: 'blog', plural: 'blogs'}}
              items={blogs}
              renderItem={(blog) => (
                <ResourceItem id={blog.id}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div>
                      <p><strong>{blog.title}</strong></p>
                      <p style={{fontSize: '12px', color: '#666'}}>
                        {blog.wordCount} words • 
                        {blog.status === 'published' ? ' ✅ Published' : ' 📝 Draft'}
                      </p>
                    </div>
                    <Button>View</Button>
                  </div>
                </ResourceItem>
              )}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
```

## Step 4.5: Add Blog Navigation to Sidebar

**File:** `app/routes/app.jsx` (Find the sidebar/navigation section)

Add links to:
```javascript
<Link to="/app/blogs/topics">📝 Blog Topics</Link>
<Link to="/app/blogs/generated">📰 Generated Blogs</Link>
```

---

# PART 5: COMPREHENSIVE HELP SYSTEM

## Step 5.1: Create Help Tooltip Component

**Create new file:** `app/components/HelpTooltip.jsx`

```javascript
import {Popover, Text} from '@shopify/polaris';
import {useState} from 'react';

export function HelpTooltip({label, children}) {
  const [active, setActive] = useState(false);

  return (
    <div style={{display: 'inline'}}>
      <span 
        onClick={() => setActive(!active)}
        style={{
          cursor: 'pointer',
          color: '#0073E6',
          marginLeft: '8px',
          fontWeight: 'bold',
          fontSize: '14px'
        }}
      >
        ?
      </span>
      {active && (
        <Popover
          active={active}
          onClose={() => setActive(false)}
          preferredPosition="above"
        >
          <Popover.Content>
            <div style={{padding: '12px', maxWidth: '250px'}}>
              <Text tone="subdued">{children}</Text>
            </div>
          </Popover.Content>
        </Popover>
      )}
    </div>
  );
}
```

## Step 5.2: Add Help Tooltips Throughout

Use the component everywhere:

```javascript
<Text>
  Monthly Generations
  <HelpTooltip>
    How many product descriptions you can generate this month. 
    Free tier: 5/month. Upgrade for more.
  </HelpTooltip>
</Text>
```

## Step 5.3: Add Help Sidebar Component

**Create new file:** `app/components/HelpSidebar.jsx`

```javascript
import {Card, Text} from '@shopify/polaris';

export function HelpSidebar({tips}) {
  return (
    <Card>
      <div style={{padding: '16px'}}>
        <Text variant="headingMd">💡 Tips</Text>
        <div style={{marginTop: '12px'}}>
          {tips.map((tip, i) => (
            <div key={i} style={{marginBottom: '12px'}}>
              <Text tone="subdued">✓ {tip}</Text>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
```

Use it on pages:
```javascript
<HelpSidebar tips={[
  "Start with product descriptions first",
  "Add brand voice for better results",
  "Publish and watch your sales improve"
]} />
```

## Step 5.4: Add Loading State Messages

In any long-running operation, show helpful text:

```javascript
{isLoading && (
  <div style={{padding: '20px', textAlign: 'center'}}>
    <Spinner />
    <Text variant="bodyMd" tone="subdued">
      ⏳ Claude is analyzing your products and crafting descriptions...
      This usually takes 20-30 seconds.
    </Text>
  </div>
)}
```

---

# PART 6: DASHBOARD ENHANCEMENTS

## Step 6.1: Update Dashboard to Show All Stats

**File:** `app/routes/app._index.jsx`

Add blogs stats to dashboard:

```javascript
export async function loader({request}) {
  const {session} = await authenticate.admin(request);
  const shop = session.shop;

  // Get product stats
  const products = await prisma.generatedContent.findMany({where: {shop}});
  const published = products.filter(p => p.status === 'published').length;

  // Get blog stats
  const blogs = await prisma.blogPost.findMany({where: {shop}});
  const blogsPublished = blogs.filter(b => b.status === 'published').length;

  // Get usage
  const usage = await getMonthlyUsage(shop);

  return json({published, blogsPublished, usage, products, blogs});
}
```

Display stats on dashboard:

```javascript
<div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
  <Card>
    <Text>📦 Products Optimized: {published}</Text>
  </Card>
  <Card>
    <Text>📰 Blogs Published: {blogsPublished}</Text>
  </Card>
</div>
```

---

# PART 7: TESTING & VERIFICATION

## Step 7.1: Test Free Tier Limit

1. Create a free tier account
2. Try to generate 6 product descriptions
3. Should fail with message: "You've used 5/5 generations this month. Upgrade to continue."

## Step 7.2: Test Blog Generation

1. Navigate to Blog Topics
2. Click "Generate Blog"
3. Should show loading state with helpful text
4. Should save to database
5. Should appear in "Generated Blogs" page

## Step 7.3: Test Usage Tracking

1. Check database: `SELECT * FROM UsageRecord`
2. Verify generationsUsed increments after each product generation
3. Verify blogsGenerated increments after each blog generation

## Step 7.4: Test Database

1. Stop the app: `Ctrl+C`
2. Verify database is PostgreSQL: Check that `schema.prisma` has `provider = "postgresql"`
3. Start again: `npm run dev`
4. Should work without SQLite errors

---

# PART 8: PRODUCTION DEPLOYMENT

## Step 8.1: Set Environment Variables

In Fly.io dashboard, set:
```
DATABASE_URL=postgresql://[user]:[pass]@[host]:[port]/[db]
ANTHROPIC_API_KEY=sk-ant-...
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SESSION_SECRET=random-secret-key
NODE_ENV=production
```

## Step 8.2: Deploy

```bash
fly deploy
```

## Step 8.3: Verify Production

1. Check logs: `fly logs`
2. Navigate to your admin: https://yourstore.myshopify.com/admin/apps/contentpilot-ai
3. Test generation on live store
4. Monitor: `fly logs -f`

---

# FINAL CHECKLIST

Before you run this:

- [ ] You have all 3 files (this one + the 2 referenced prompts) ready
- [ ] Your database is currently SQLite (in dev)
- [ ] You want PostgreSQL for production
- [ ] You want free tier limited to 5 generations/month
- [ ] You want SEO blogs feature visible and working
- [ ] You want help tooltips and guides everywhere
- [ ] You're ready to deploy to Fly.io

---

# EXECUTION INSTRUCTIONS

1. **Copy everything above** (from "# PART 1" to "FINAL CHECKLIST")
2. **Open Claude Code** in VS Code
3. **Paste the entire prompt** into the chat
4. **Send message:**

> "Execute all steps in order. When you're done, run `npm run dev` and confirm the app starts with PostgreSQL. Then tell me what was changed."

5. **Wait** for Claude Code to execute (30-60 minutes)
6. **Test locally** — navigate through app, test generation
7. **Deploy** — follow Step 8 in the prompt
8. **Monitor** — watch Fly.io logs

---

**You're ready. Send this to Claude Code. It will fix EVERYTHING.**
