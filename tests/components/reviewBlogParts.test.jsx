/**
 * Redesign v2 — Review and Blog pieces: lengths are measured from the text
 * shown, the empty states draw their feature and offer one next step, the
 * Posts tab counts every saved post, and the Review route keeps its guards.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "@shopify/polaris";
import en from "@shopify/polaris/locales/en.json";
import { readFileSync } from "node:fs";
import { FieldLength, lengthOf, ReviewEmpty, FIELD_LIMITS } from "../../app/components/ReviewParts.jsx";
import { BlogTabs, BlogEmpty } from "../../app/components/BlogParts.jsx";

const html = (node) => renderToStaticMarkup(<AppProvider i18n={en}>{node}</AppProvider>);

describe("ReviewParts", () => {
  it("lengthOf counts what is shown, and an empty value is zero, not one word", () => {
    expect(lengthOf("A wool throw blanket")).toEqual({ chars: 20, words: 4 });
    expect(lengthOf("")).toEqual({ chars: 0, words: 0 });
    expect(lengthOf("   ")).toEqual({ chars: 0, words: 0 });
  });

  it("page title and search description get a bar against the same limits the editor uses", () => {
    expect(FIELD_LIMITS).toEqual({ metaTitle: 60, metaDescription: 155 });
    const over = html(<FieldLength type="metaTitle" text={"x".repeat(61)} id="a" />);
    expect(over).toContain("nv-charbar--poor");
    expect(over).toContain("61/60 characters");
    const ok = html(<FieldLength type="metaDescription" text={"x".repeat(120)} id="b" />);
    expect(ok).toContain("nv-charbar--good");
  });

  it("the description and the answers get words and characters, no bar", () => {
    const out = html(<FieldLength type="description" text="Cast iron skillet for searing" id="c" />);
    expect(out).toContain("5 words · 29 characters");
    expect(out).not.toContain("nv-charbar");
  });

  it("the empty state draws the Review card and offers Products and Home", () => {
    const calls = [];
    const out = html(<ReviewEmpty heading="Nothing to review — you're all caught up" onProducts={() => calls.push("p")} onHome={() => calls.push("h")} />);
    expect(out).toContain("nv-illu");
    expect(out).toContain("Go to Products");
    expect(out).toContain("Back to Home");
    expect(out).toContain("No drafts are waiting.");
  });
});

describe("BlogParts", () => {
  it("the Posts tab carries the total it is given", () => {
    // Polaris renders a tab badge after it measures the tabs in the browser;
    // the server pass shows the labels, and the source passes the count.
    const out = html(<BlogTabs selected="posts" postCount={12} navigate={() => {}} />);
    expect(out).toContain(">Write<");
    expect(out).toContain(">Posts<");
    expect(readFileSync("app/components/BlogParts.jsx", "utf8")).toMatch(/content: t\("Posts"\), badge: t\.number\(postCount \?\? 0\)/);
  });

  it("the empty state draws a post and offers one action", () => {
    const out = html(<BlogEmpty heading="No blog posts yet" body="Body" actionLabel="Write your first post" onAction={() => {}} />);
    expect(out).toContain("nv-illu");
    expect(out).toContain("Write your first post");
  });
});

describe("Review and Blog routes keep their contracts", () => {
  const src = (f) => readFileSync(f, "utf8");

  it("Review: one sticky action bar, the quality ring on a tint, current beside proposed with lengths", () => {
    const r = src("app/routes/app.review.jsx");
    expect(r).toMatch(/<Box position="sticky" insetBlockStart="0"/);
    expect(r).toMatch(/<ScoreRing value=\{product\.qualityScore\} size="small" tint/);
    expect(r).toMatch(/<FieldLength type=\{type\} text=\{plainText\(type, currentValue \|\| ""\)\}/);
    expect(r).toMatch(/<FieldLength type=\{type\} text=\{plainText\(type, editedValue\)\}/);
    expect(r).toMatch(/<ReviewEmpty/);
    // the guards that matter are untouched
    expect(r).toMatch(/useState\(\(\)\s*=>\s*new Set\(\)\)/);
    expect(r).toMatch(/approvedCount > 0 &&/);
    expect(r).not.toMatch(/style=\{\{/);
  });

  it("Blog: the Posts tab counts every saved post, not the five recent ones", () => {
    const b = src("app/routes/app.blog.jsx");
    expect(b).toMatch(/prisma\.blogPost\.count\(\{ where: \{ shop \} \}\)/);
    expect(b).toMatch(/<BlogTabs selected="write" postCount=\{postCount\}/);
    expect(b).not.toMatch(/Posts \(\{length\}\)/);
  });

  it("Blog: the lock is the real composer blurred under a lock card, and the price stays on the button", () => {
    const b = src("app/routes/app.blog.jsx");
    expect(b).toMatch(/<LockedPreview title=\{t\("Blog posts"\)\} sentence=\{lockSentence\}/);
    expect(b).toMatch(/<AiButton type="submit" solid size="large" loading=\{isGenerating\} disabled=\{isGenerating\}>/);
    expect(b).toMatch(/Costs \{credits\} credits/);
  });

  it("Blog: no invented progress or timing", () => {
    const b = src("app/routes/app.blog.jsx");
    expect(b).not.toMatch(/LOADING_MESSAGES/);
    expect(b).not.toMatch(/Takes 20–40 seconds/);
    expect(b).not.toMatch(/Researching the topic/);
  });

  it("Blog posts: delete asks first, every string is translated, and no timing claim", () => {
    const p = src("app/routes/app.blog.posts.jsx");
    expect(p).toMatch(/title=\{t\("Delete this post\?"\)\}/);
    expect(p).toMatch(/destructive: true/);
    expect(p).not.toMatch(/return "just now"|`\$\{Math\.floor\(secs \/ 60\)\}m ago`/);
    expect(p).toMatch(/return t\("just now"\)/);
    expect(p).not.toMatch(/under 60 seconds/);
    expect(p).not.toMatch(/Untitled Post/);
  });
});

void vi;
