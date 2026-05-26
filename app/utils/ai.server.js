import logger from "./logger.server.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

export async function generateProductContent(
  product,
  brandVoice,
  contentTypes = ["description", "metaTitle", "metaDescription"]
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const prompt = buildPrompt(product, brandVoice, contentTypes);

  // Use vision (image + text) when a product image is available
  const messageContent = product.imageUrl
    ? [
        { type: "image", source: { type: "url", url: product.imageUrl } },
        { type: "text", text: prompt },
      ]
    : prompt;

  const rawText = await callClaude(apiKey, {
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: messageContent }],
  });

  return parseGeneratedContent(rawText);
}

export async function generateAltText(imageUrl, productTitle) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const rawText = await callClaude(apiKey, {
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `Write concise alt text for this product image. Product: "${productTitle}". Rules: under 125 chars, describe what is visually shown, include the product name naturally, helpful for accessibility and SEO, do NOT start with "Image of" or "Photo of". Return ONLY the alt text.`,
          },
        ],
      },
    ],
  });

  return rawText.trim();
}

// ─── Internal helpers ────────────────────────────────────────────────────────

async function callClaude(apiKey, body, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const t0 = Date.now();

  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      logger.error({ model: body.model, attempt }, "Claude API request timed out");
      throw new Error("Claude API timed out after 45 seconds.");
    }
    logger.error({ err, model: body.model, attempt }, "Claude API fetch error");
    throw err;
  }
  clearTimeout(timer);

  if (response.ok) {
    const data = await response.json();
    logger.debug({ model: body.model, attempt, ms: Date.now() - t0 }, "Claude API call succeeded");
    return data.content[0]?.text ?? "";
  }

  if (response.status >= 500 && attempt < MAX_RETRIES) {
    logger.warn({ model: body.model, status: response.status, attempt }, "Claude API 5xx — retrying");
    await new Promise((r) => setTimeout(r, (attempt + 1) * 1000));
    return callClaude(apiKey, body, attempt + 1);
  }

  const errorBody = await response.text();
  logger.error({ model: body.model, status: response.status, attempt, body: errorBody }, "Claude API error");
  throw new Error(`Claude API error ${response.status}: ${errorBody}`);
}

function buildPrompt(product, brandVoice, contentTypes) {
  const sections = [];

  // ── Anti-hallucination anchor ─────────────────────────────────────────────
  sections.push(`=== CRITICAL RULES — READ FIRST ===
FACTUAL ACCURACY: Only state factual claims that appear verbatim in the PRODUCT DATA or BRAND CONTEXT sections below. Never invent certifications, manufacturing origins, testing claims, awards, country of origin, or specific statistics. If a claim is not explicitly provided in the data, do not include it. Generic benefits ("great gift", "long-lasting") are acceptable; specific claims ("made in Australia", "lab tested", "certified organic") are NOT unless explicitly provided.
VOICE: Write as the brand, not about it. First or second person where natural.
AUTHENTICITY: Do not mention AI, automation, or content generation.`);

  // ── Brand context ─────────────────────────────────────────────────────────
  sections.push(`=== BRAND CONTEXT ===
Store Name: ${brandVoice?.storeName || "the store"}
Brand Tone: ${brandVoice?.brandTone || "professional and helpful"}
Target Audience: ${brandVoice?.targetAudience || "general consumers"}
Key Differentiators: ${brandVoice?.keyDifferentiators || "quality products, great service"}
Phrases/Styles to Avoid: ${brandVoice?.avoidPhrases || "generic AI-sounding language, excessive hype"}
Additional Guidelines: ${brandVoice?.additionalNotes || "none"}${brandVoice?.sampleContent ? `\n\nSAMPLE CONTENT IN OUR VOICE (match this writing style exactly):\n${brandVoice.sampleContent}` : ""}`);

  // ── Product data ──────────────────────────────────────────────────────────
  sections.push(`=== PRODUCT DATA ===
Title: ${product.title}
Product Type: ${product.productType || "N/A"}
Vendor: ${product.vendor || "N/A"}
Tags: ${product.tags?.join(", ") || "none"}
Price: ${product.variants?.[0]?.price || "N/A"}
Variants: ${product.variants?.map((v) => v.title).filter((t) => t !== "Default Title").join(", ") || "Single option"}
Current Description: ${product.descriptionHtml || product.description || "No existing description"}${product.imageUrl ? "\n\nPRODUCT IMAGE: Provided above. Use visual details you observe (colors, materials, form, packaging, context) to enrich the description with specific visual language. Only describe what is visibly present." : ""}`);

  // ── Content type instructions ─────────────────────────────────────────────
  const typeInstructions = [];

  if (contentTypes.includes("description")) {
    typeInstructions.push(`
PRODUCT DESCRIPTION:
- Write a compelling, detailed product description of at least 200 words
- Structure: (1) hook that addresses a real customer pain point or desire, (2) body with specific features and tangible benefits, (3) clear call to action
- Include emotional appeal — help the customer visualise owning and using this product
- Consistent brand tone throughout; natural keyword usage for SEO
- HTML formatting: <p> tags for paragraphs, <strong> for key highlights, <ul><li> for feature lists
- MINIMUM 200 words — expand if under that before outputting
- Format: <DESCRIPTION>your HTML content here</DESCRIPTION>`);
  }

  if (contentTypes.includes("metaTitle")) {
    typeInstructions.push(`
META TITLE:
- SEO-optimised, maximum 60 characters (strictly enforce)
- Format: Brand Name Product Name | Key Benefit or Category
- CAPITALISATION: Use Title Case — capitalise the first letter of each significant word (brand name, product name, key descriptors). Articles (a, an, the), prepositions (in, of, for), and conjunctions (and, or, but) are lowercase unless they start the title.
- Example good format: "Gujjar Skateboard Gift Card | Choose Your Gear"
- Make it compelling and relevant to search intent
- Format: <META_TITLE>Your Title Here</META_TITLE>`);
  }

  if (contentTypes.includes("metaDescription")) {
    typeInstructions.push(`
META DESCRIPTION:
- SEO-optimised, maximum 155 characters (strictly enforce)
- Clear value proposition with a subtle call to action
- CAPITALISATION: Use sentence case — capitalise only the first word and proper nouns (brand name, product names, place names). Do not capitalise common nouns mid-sentence.
- Example: "Give the perfect gift with a Gujjar Skateboard gift card. Available in $10, $25 & $50 — perfect for skaters and beach lovers."
- Format: <META_DESCRIPTION>Your meta description here.</META_DESCRIPTION>`);
  }

  if (contentTypes.includes("faq")) {
    typeInstructions.push(`
FAQ CONTENT:
- 4–5 questions real customers would ask about usage, benefits, materials, shipping, compatibility, or suitability
- Each answer 2–3 sentences — helpful, specific, and grounded in the product data
- Do NOT invent claims not supported by the product data
- Format:
<FAQ>
Q: Question here?
A: Answer here.

Q: Question here?
A: Answer here.
</FAQ>`);
  }

  sections.push(`=== CONTENT TO GENERATE ===${typeInstructions.join("\n")}`);

  sections.push(`=== OUTPUT RULES ===
- Match the brand tone exactly in every sentence — read the SAMPLE CONTENT above and mirror that rhythm and register
- No filler openers: never start with "Whether you're looking for...", "Say goodbye to...", "Introducing...", "Are you tired of..."
- Every sentence must earn its place — no padding
- Re-read the CRITICAL RULES at the top before finalising your output`);

  return sections.join("\n\n");
}

function parseGeneratedContent(rawText) {
  return {
    description: extractTag(rawText, "DESCRIPTION"),
    metaTitle: extractTag(rawText, "META_TITLE"),
    metaDescription: extractTag(rawText, "META_DESCRIPTION"),
    faq: extractTag(rawText, "FAQ"),
  };
}

function extractTag(text, tagName) {
  const match = text.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? sanitizeHtml(match[1].trim()) : "";
}

// Strip elements and attributes that can execute JS.
// This is a defence-in-depth layer; Claude output should never contain these,
// but a prompt-injection attack on product data could attempt it.
function sanitizeHtml(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/\s(on\w+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    .replace(/javascript\s*:/gi, "blocked:")
    .replace(/data\s*:\s*text\/html/gi, "blocked:");
}
