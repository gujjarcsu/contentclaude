// app/utils/ai.server.js
// ContentPilot AI - Claude API Integration
// This file handles all AI content generation

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Generate product content using Claude AI
 */
export async function generateProductContent(product, brandVoice, contentTypes = ["description", "metaTitle", "metaDescription"]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");
  }

  console.log("[AI] generateProductContent called");
  const prompt = buildPrompt(product, brandVoice, contentTypes);
  console.log("[AI] PROMPT LENGTH:", prompt.length);

  console.log("[ContentPilot] Generating content for:", product.title);
  console.log("[ContentPilot] Content types:", contentTypes);
  console.log("[ContentPilot] Brand voice:", brandVoice?.storeName || "(none)", "/ Tone:", brandVoice?.brandTone || "(none)");
  console.log("[ContentPilot] Full prompt:\n---\n" + prompt + "\n---");

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  console.log("[AI] API RESPONSE STATUS:", response.status);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error("[ContentPilot] Claude API error:", response.status, errorBody);
    throw new Error(`Claude API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const rawText = data.content[0]?.text || "";

  console.log("[ContentPilot] Raw Claude response:\n---\n" + rawText + "\n---");

  const parsed = parseGeneratedContent(rawText);
  console.log("[ContentPilot] Parsed fields:", {
    description: parsed.description ? `${parsed.description.length} chars` : "EMPTY",
    metaTitle: parsed.metaTitle || "EMPTY",
    metaDescription: parsed.metaDescription ? `${parsed.metaDescription.length} chars` : "EMPTY",
    faq: parsed.faq ? `${parsed.faq.length} chars` : "EMPTY",
  });

  return parsed;
}

/**
 * Build the AI prompt with full context
 */
function buildPrompt(product, brandVoice, contentTypes) {
  const sections = [];

  // Brand context
  sections.push(`=== BRAND CONTEXT ===
Store Name: ${brandVoice?.storeName || "Shopify Store"}
Brand Tone: ${brandVoice?.brandTone || "professional and helpful"}
Target Audience: ${brandVoice?.targetAudience || "general consumers"}
Key Differentiators: ${brandVoice?.keyDifferentiators || "quality products, great service"}
Phrases/Styles to Avoid: ${brandVoice?.avoidPhrases || "generic AI-sounding language, excessive hype"}
Additional Guidelines: ${brandVoice?.additionalNotes || "none"}`);

  // Product data
  sections.push(`=== PRODUCT DATA ===
Title: ${product.title}
Product Type: ${product.productType || "N/A"}
Vendor: ${product.vendor || "N/A"}
Tags: ${product.tags?.join(", ") || "none"}
Price: ${product.variants?.[0]?.price || "N/A"} ${product.variants?.[0]?.currencyCode || ""}
Variants: ${product.variants?.map(v => v.title).join(", ") || "Default"}
Current Description: ${product.descriptionHtml || product.description || "No existing description"}`);

  // Generation instructions
  const typeInstructions = [];

  if (contentTypes.includes("description")) {
    typeInstructions.push(`
PRODUCT DESCRIPTION:
- Write a DETAILED, compelling product description of at least 200 words (aim for 200-300 words)
- Structure it in three parts: (1) a compelling hook, (2) detailed body with specific benefits AND features, (3) a call to action
- The hook must address a real customer pain point or desire — make it specific and emotionally resonant, not generic
- The body must include specific use cases, tangible benefits, and what makes this product worth buying over alternatives
- Include emotional appeal — help the customer visualise owning and using this product
- Use the brand tone consistently throughout every sentence
- Include natural keyword usage for SEO without stuffing
- End with a motivating, brand-appropriate call to action
- Use HTML formatting: <p> tags for paragraphs, <strong> for key benefit highlights, <ul><li> for feature lists where appropriate
- DO NOT write a single short paragraph — this must be substantial, multi-paragraph marketing copy
- MINIMUM 200 words. If your draft is under 200 words, expand it before outputting.
- Format your output as: <DESCRIPTION>your HTML description here</DESCRIPTION>`);
  }

  if (contentTypes.includes("metaTitle")) {
    typeInstructions.push(`
META TITLE:
- Write an SEO-optimized meta title
- Maximum 60 characters
- Include the product name and one key benefit or keyword
- Make it compelling for search results
- Format your output as: <META_TITLE>your meta title here</META_TITLE>`);
  }

  if (contentTypes.includes("metaDescription")) {
    typeInstructions.push(`
META DESCRIPTION:
- Write an SEO-optimized meta description
- Maximum 155 characters
- Include a clear value proposition and subtle call-to-action
- Make it compelling enough to improve click-through rate from search results
- Format your output as: <META_DESCRIPTION>your meta description here</META_DESCRIPTION>`);
  }

  if (contentTypes.includes("faq")) {
    typeInstructions.push(`
FAQ CONTENT:
- Generate 4-5 relevant frequently asked questions and answers about this product
- Questions should be ones real customers would actually ask
- Answers should be helpful, accurate, and 2-3 sentences each
- Include questions about usage, benefits, ingredients/materials, shipping, and suitability
- Format your output as: <FAQ>
Q: Question here?
A: Answer here.

Q: Question here?
A: Answer here.
</FAQ>`);
  }

  sections.push(`=== CONTENT TO GENERATE ===${typeInstructions.join("\n")}`);

  sections.push(`=== IMPORTANT RULES ===
- Write as if you ARE the brand, not describing it from outside
- Never mention AI, automation, or that this content was generated
- Never invent specific claims, certifications, or statistics unless provided in the product data
- Sound natural and human — avoid generic AI patterns like "Whether you're looking for..." or "Say goodbye to..."
- Every sentence must earn its place — no filler
- Match the brand tone exactly`);

  return sections.join("\n\n");
}

/**
 * Parse Claude's structured response into content fields
 */
function parseGeneratedContent(rawText) {
  const result = {
    description: extractBetweenTags(rawText, "DESCRIPTION"),
    metaTitle: extractBetweenTags(rawText, "META_TITLE"),
    metaDescription: extractBetweenTags(rawText, "META_DESCRIPTION"),
    faq: extractBetweenTags(rawText, "FAQ"),
    raw: rawText,
  };

  return result;
}

/**
 * Extract content between XML-style tags
 */
function extractBetweenTags(text, tagName) {
  const regex = new RegExp(`<${tagName}>(.*?)</${tagName}>`, "s");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Generate alt text for a product image using Claude's vision
 */
export async function generateAltText(imageUrl, productTitle, brandVoice) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "url",
                url: imageUrl,
              },
            },
            {
              type: "text",
              text: `Write a concise, descriptive alt text for this product image. The product is "${productTitle}". The alt text should be:
- Under 125 characters
- Descriptive of what's visually shown
- Include the product name naturally
- Helpful for accessibility and SEO
- NOT start with "Image of" or "Photo of"

Return ONLY the alt text, nothing else.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  return data.content[0]?.text?.trim() || "";
}
