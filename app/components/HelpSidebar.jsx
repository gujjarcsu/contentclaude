import { useState } from "react";
import { Card, Text, BlockStack, InlineStack, Box, Divider, Button, Collapsible } from "@shopify/polaris";
import { HelpCircle, ChevronDown, ChevronUp, BookOpen, Zap, MessageSquare } from "lucide-react";

/**
 * Contextual help sidebar panel.
 *
 * Props:
 *   title       — panel heading (default "Help & Tips")
 *   sections    — array of { heading, items: string[] } for tip groups
 *   faqs        — array of { question, answer } for accordion FAQ
 *   docsUrl     — optional external docs link
 *   supportUrl  — optional support link
 *
 * Usage:
 *   <HelpSidebar
 *     title="Blog Generator Help"
 *     sections={[{ heading: "Getting started", items: ["Enter a topic...", "Add keywords..."] }]}
 *     faqs={[{ question: "How long does it take?", answer: "Under 30 seconds." }]}
 *   />
 */
export function HelpSidebar({ title = "Help & Tips", sections = [], faqs = [], docsUrl, supportUrl }) {
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (idx) => setOpenFaq((prev) => (prev === idx ? null : idx));

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack gap="200" blockAlign="center">
          <HelpCircle aria-hidden="true" size={18} color="#2C6ECB" />
          <Text as="h2" variant="headingMd">{title}</Text>
        </InlineStack>

        {sections.map((section) => (
          <BlockStack key={section.heading} gap="200">
            <Divider />
            <InlineStack gap="150" blockAlign="center">
              <Zap aria-hidden="true" size={14} color="#2C6ECB" />
              <Text as="p" variant="bodySm" fontWeight="semibold">{section.heading}</Text>
            </InlineStack>
            <BlockStack gap="150">
              {section.items.map((item) => (
                <InlineStack key={item} gap="200" blockAlign="start">
                  <Text as="span" variant="bodySm" tone="success">✓</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{item}</Text>
                </InlineStack>
              ))}
            </BlockStack>
          </BlockStack>
        ))}

        {faqs.length > 0 && (
          <BlockStack gap="200">
            <Divider />
            <InlineStack gap="150" blockAlign="center">
              <MessageSquare aria-hidden="true" size={14} color="#2C6ECB" />
              <Text as="p" variant="bodySm" fontWeight="semibold">Frequently Asked</Text>
            </InlineStack>
            <BlockStack gap="100">
              {faqs.map((faq, idx) => (
                <Box key={idx} borderRadius="200" background="bg-surface-secondary">
                  <button
                    type="button"
                    onClick={() => toggleFaq(idx)}
                    style={{
                      width: "100%",
                      background: "none",
                      border: "none",
                      padding: "10px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text as="span" variant="bodySm" fontWeight="semibold">{faq.question}</Text>
                    {openFaq === idx ? (
                      <ChevronUp aria-hidden="true" size={14} color="#6D7175" style={{ flexShrink: 0 }} />
                    ) : (
                      <ChevronDown aria-hidden="true" size={14} color="#6D7175" style={{ flexShrink: 0 }} />
                    )}
                  </button>
                  <Collapsible open={openFaq === idx} id={`faq-${idx}`} transition={{ duration: "150ms" }}>
                    <Box padding="300" paddingBlockStart="000">
                      <Text as="p" variant="bodySm" tone="subdued">{faq.answer}</Text>
                    </Box>
                  </Collapsible>
                </Box>
              ))}
            </BlockStack>
          </BlockStack>
        )}

        {(docsUrl || supportUrl) && (
          <BlockStack gap="200">
            <Divider />
            <InlineStack gap="150" blockAlign="center">
              <BookOpen aria-hidden="true" size={14} color="#2C6ECB" />
              <Text as="p" variant="bodySm" fontWeight="semibold">Resources</Text>
            </InlineStack>
            <BlockStack gap="100">
              {docsUrl && (
                <Button
                  variant="plain"
                  url={docsUrl}
                  external
                  icon={<BookOpen aria-hidden="true" size={14} />}
                >
                  View Documentation →
                </Button>
              )}
              {supportUrl && (
                <Button
                  variant="plain"
                  url={supportUrl}
                  external
                  icon={<MessageSquare aria-hidden="true" size={14} />}
                >
                  Contact Support →
                </Button>
              )}
            </BlockStack>
          </BlockStack>
        )}

      </BlockStack>
    </Card>
  );
}
