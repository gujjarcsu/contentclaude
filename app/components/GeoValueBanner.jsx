import { Text, InlineStack, BlockStack, Button } from "@shopify/polaris";
import { Sparkles, Search, Bot, FileCode2 } from "lucide-react";

/**
 * The core value message: this app writes content optimized for BOTH classic
 * Google search AND generative AI answer engines (GEO / AEO). Placed at strategic
 * points so merchants always understand what they're getting.
 *
 * Props:
 *   variant   — "full" (hero card) | "compact" (slim strip). Default "full".
 *   onLearnMore — optional click handler for a "See how it works" button.
 */

const ENGINES = "ChatGPT, Perplexity, Gemini & Google AI Overviews";

const POINTS = [
  { icon: Bot, title: "Answer-first writing", desc: "Structured the way AI models quote and cite sources." },
  { icon: FileCode2, title: "FAQPage schema (JSON-LD)", desc: "Structured FAQ markup machines read to quote you in AI answers." },
  { icon: Search, title: "llms.txt catalog feed", desc: "A clean map of your store so AI crawlers can discover every product." },
];

export function GeoValueBanner({ variant = "full", onLearnMore }) {
  if (variant === "compact") {
    return (
      <div style={{
        borderRadius: 12,
        background: "linear-gradient(100deg, #12233f 0%, #1f4c8a 55%, #14664b 100%)",
        padding: "14px 18px",
      }}>
        <InlineStack gap="300" blockAlign="center" wrap>
          <Sparkles aria-hidden="true" size={20} color="#8fd3ff" />
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <Text as="p" variant="bodyMd" fontWeight="semibold">
              <span style={{ color: "#ffffff" }}>Optimized for Google + AI search.</span>{" "}
              <span style={{ color: "rgba(255,255,255,0.82)" }}>
                Written to rank on Google and get cited by {ENGINES}.
              </span>
            </Text>
          </div>
        </InlineStack>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: 16,
      background: "linear-gradient(120deg, #101f38 0%, #1f4c8a 52%, #14664b 100%)",
      padding: "24px 24px 26px",
      boxShadow: "0 6px 24px rgba(16,31,56,0.28)",
    }}>
      <BlockStack gap="400">
        <BlockStack gap="150">
          <InlineStack gap="200" blockAlign="center">
            <Sparkles aria-hidden="true" size={22} color="#8fd3ff" />
            <Text as="span" variant="headingSm">
              <span style={{ color: "#8fd3ff", letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 12, fontWeight: 700 }}>
                GEO · Generative Engine Optimization
              </span>
            </Text>
          </InlineStack>
          <Text as="h2" variant="headingLg">
            <span style={{ color: "#ffffff" }}>Optimized for Google search — and AI answer engines</span>
          </Text>
          <Text as="p" variant="bodyMd">
            <span style={{ color: "rgba(255,255,255,0.85)" }}>
              Every description, blog, and meta tag is written <strong>answer-first</strong> and marked up with schema —
              so your products can rank in Google <strong>and</strong> get cited by {ENGINES}. That's where more and
              more shoppers now start.
            </span>
          </Text>
        </BlockStack>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 12,
                padding: "12px 14px",
              }}>
                <InlineStack gap="200" blockAlign="center">
                  <Icon aria-hidden="true" size={18} color="#8fd3ff" />
                  <Text as="span" variant="bodyMd" fontWeight="semibold">
                    <span style={{ color: "#ffffff" }}>{p.title}</span>
                  </Text>
                </InlineStack>
                <div style={{ marginTop: 4 }}>
                  <Text as="p" variant="bodySm">
                    <span style={{ color: "rgba(255,255,255,0.72)" }}>{p.desc}</span>
                  </Text>
                </div>
              </div>
            );
          })}
        </div>

        {onLearnMore && (
          <div>
            <Button onClick={onLearnMore}>See how it works</Button>
          </div>
        )}
      </BlockStack>
    </div>
  );
}
