/**
 * ProductEditorPieces — the parts of the product editor that the category's
 * editors share (Tapita 083/084/086, Smart SEO 111/112), composed from the
 * kit. Display and editing affordances only: every write still goes through
 * the editor route's existing action.
 */
import { Suspense, useState } from "react";
import { Await, useNavigate } from "react-router";
import { BlockStack, InlineStack, Box, Text, Button, ButtonGroup, Collapsible, Card, Divider, Link, Badge, SkeletonBodyText, Icon } from "@shopify/polaris";
import { TextBoldIcon, TextItalicIcon, TextTitleIcon, ListBulletedIcon, ListNumberedIcon, LinkIcon, ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { useT } from "../i18n/react.jsx";
import { T } from "../i18n/index.js";
import { StatusIcon, CountChip, CharBar } from "./Kit.jsx";
import { ProductThumb } from "./ProductThumb.jsx";

/**
 * A formatting toolbar over the description's HTML text area. Each button
 * wraps the current selection (or a placeholder) in the tag it names, so the
 * merchant can format without writing tags — and what is published is still
 * exactly the HTML in the field.
 */
export function DescriptionToolbar({ textareaId, value, onChange }) {
  const t = useT();
  const apply = (make) => {
    const el = typeof document !== "undefined" ? document.getElementById(textareaId) : null;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? value.length;
    const selected = value.slice(s, e);
    const { text, selectFrom, selectTo } = make(selected);
    onChange(value.slice(0, s) + text + value.slice(e));
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(s + selectFrom, s + selectTo);
      });
    }
  };
  const wrap = (open, close, placeholder) => (sel) => {
    const inner = sel || placeholder;
    return { text: `${open}${inner}${close}`, selectFrom: open.length, selectTo: open.length + inner.length };
  };
  const list = (tag, placeholder) => (sel) => {
    const lines = (sel || placeholder).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // Markup, not words: built by concatenation so it is never mistaken for copy.
    const items = lines.map((l) => "  <li>" + l + "</li>");
    const text = ["<" + tag + ">", ...items, "</" + tag + ">"].join("\n");
    return { text, selectFrom: 0, selectTo: text.length };
  };
  const link = (sel) => {
    const label = sel || t("link text");
    const open = '<a href="https://';
    return { text: `${open}">${label}</a>`, selectFrom: open.length - "https://".length, selectTo: open.length };
  };
  const buttons = [
    { icon: TextBoldIcon, label: t("Bold"), run: wrap("<strong>", "</strong>", t("bold text")) },
    { icon: TextItalicIcon, label: t("Italic"), run: wrap("<em>", "</em>", t("italic text")) },
    { icon: TextTitleIcon, label: t("Heading"), run: wrap("<h3>", "</h3>", t("Heading")) },
    { icon: ListBulletedIcon, label: t("Bulleted list"), run: list("ul", t("List item")) },
    { icon: ListNumberedIcon, label: t("Numbered list"), run: list("ol", t("List item")) },
    { icon: LinkIcon, label: t("Link"), run: link },
  ];
  return (
    <div role="toolbar" aria-label={t("Format the description")} aria-controls={textareaId}>
      <ButtonGroup variant="segmented">
        {buttons.map((b) => (
          <Button key={b.label} icon={b.icon} accessibilityLabel={b.label} size="slim" onClick={() => apply(b.run)} />
        ))}
      </ButtonGroup>
    </div>
  );
}

/** Words against the rubric's 50-word floor, on the same bar as the character limits. */
export function WordBar({ words, chars, min = 50 }) {
  const t = useT();
  const band = words >= min ? "good" : "fair";
  const pct = Math.min(100, Math.round((words / min) * 100));
  return (
    <BlockStack gap="100">
      <div className={`nv-charbar nv-charbar--${band}`} role="meter" aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(words, min)} aria-label={t("Words against the 50-word minimum")}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <InlineStack align="end">
        <Text as="span" variant="bodySm" tone="subdued" numeric>
          {t("{words, plural, one {# word} other {# words}} · {chars} characters", { words, chars })}
        </Text>
      </InlineStack>
    </BlockStack>
  );
}

const GROUPS = [
  { id: "critical", status: "critical", label: T("Critical"), tone: "critical" },
  { id: "warning", status: "warning", label: T("Need improvement"), tone: "caution" },
  { id: "good", status: "good", label: T("Good"), tone: undefined },
];

/**
 * The checklist as Tapita's three expandable rows: Critical (n) · Need
 * improvement (n) · Good (n). A failing check that keeps the product out of a
 * feed is critical; any other failing check needs improvement. Open by
 * default, so every reason is readable without a click.
 */
export function CheckGroups({ checklist }) {
  const t = useT();
  const groups = {
    critical: checklist.filter((c) => !c.pass && c.blocks),
    warning: checklist.filter((c) => !c.pass && !c.blocks),
    good: checklist.filter((c) => c.pass),
  };
  const [open, setOpen] = useState({ critical: true, warning: true, good: true });
  return (
    <BlockStack gap="0">
      {GROUPS.map((g, gi) => {
        const items = groups[g.id];
        const id = `checks-${g.id}`;
        return (
          <Box key={g.id}>
            {gi > 0 ? <Divider /> : null}
            <Box paddingBlock="200">
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))}
                aria-expanded={open[g.id]}
                aria-controls={id}
                disabled={items.length === 0}
                style={{ all: "unset", cursor: items.length ? "pointer" : "default", display: "block", width: "100%" }}
              >
                <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
                  <InlineStack gap="200" blockAlign="center" wrap={false}>
                    <StatusIcon status={g.status} />
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {t(g.label)}
                    </Text>
                    <CountChip n={items.length} tone={items.length ? g.tone : undefined} />
                  </InlineStack>
                  {items.length ? <Icon source={open[g.id] ? ChevronUpIcon : ChevronDownIcon} tone="subdued" /> : null}
                </InlineStack>
              </button>
            </Box>
            <Collapsible open={open[g.id] && items.length > 0} id={id}>
              <Box paddingBlockEnd="200" paddingInlineStart="600">
                <BlockStack gap="200">
                  {items.map((c) => (
                    <BlockStack key={c.id} gap="025">
                      <Text as="p" variant="bodySm" fontWeight="medium">
                        {c.label}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {c.detail}
                      </Text>
                    </BlockStack>
                  ))}
                </BlockStack>
              </Box>
            </Collapsible>
          </Box>
        );
      })}
    </BlockStack>
  );
}

/**
 * How the page reads in a Google result, with the title and description
 * measured against their limits under each line (Tapita 083 content preview).
 */
export function SnippetPreview({ urlText, storeUrl, title, description, titleLength, descriptionLength, fromDraft, titleMax, descriptionMax }) {
  const t = useT();
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="h2" variant="headingMd">
            {t("Google listing preview")}
          </Text>
          {fromDraft ? <Badge tone="info">{t("From your draft")}</Badge> : null}
        </InlineStack>
        <Box padding="300" background="bg-surface" borderWidth="025" borderColor="border" borderRadius="200">
          <BlockStack gap="100">
            <Text as="p" variant="bodySm" tone="subdued" truncate>
              {urlText}
            </Text>
            <Text as="p" variant="bodyLg" fontWeight="medium">
              {storeUrl ? (
                <Link url={storeUrl} external removeUnderline>
                  {title}
                </Link>
              ) : (
                title
              )}
            </Text>
            <CharBar count={titleLength} max={titleMax} min={30} id="snippet-title-chars" />
            <Text as="p" variant="bodySm" tone="subdued">
              {description || t("No description yet — nothing is on your store for this product.")}
            </Text>
            <CharBar count={descriptionLength} max={descriptionMax} min={70} id="snippet-desc-chars" />
          </BlockStack>
        </Box>
      </BlockStack>
    </Card>
  );
}

/**
 * "Next products to optimize" (Tapita 083 right rail): products from the
 * most recently updated active ones that Navaal has not written for yet.
 * Collapsed by default; the list streams in and never blocks the editor.
 */
export function NextProducts({ promise }) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <BlockStack gap="200">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="next-products" style={{ all: "unset", cursor: "pointer", display: "block" }}>
          <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
            <Text as="h2" variant="headingMd">
              {t("Next products to optimize")}
            </Text>
            <Box>
              <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
            </Box>
          </InlineStack>
        </button>
        <Collapsible open={open} id="next-products">
          <Suspense fallback={<SkeletonBodyText lines={3} />}>
            <Await resolve={promise} errorElement={null}>
              {(items) =>
                Array.isArray(items) && items.length > 0 ? (
                  <BlockStack gap="0">
                    {items.map((p, i) => (
                      <Box key={p.id}>
                        {i > 0 ? <Divider /> : null}
                        <Box paddingBlock="200">
                          <InlineStack gap="300" blockAlign="center" wrap={false}>
                            <ProductThumb url={p.imageUrl} size="small" />
                            <Box width="100%">
                              <Text as="p" variant="bodySm" fontWeight="medium" truncate>
                                {p.title}
                              </Text>
                            </Box>
                            <Button size="slim" variant="plain" onClick={() => navigate(`/app/products/${p.id}`)} accessibilityLabel={t("Open {title}", { title: p.title })}>
                              {t("Open")}
                            </Button>
                          </InlineStack>
                        </Box>
                      </Box>
                    ))}
                    <Text as="p" variant="bodySm" tone="subdued">
                      {t("From your most recently updated active products")}
                    </Text>
                  </BlockStack>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {t("Every recently updated product already has a draft or published content.")}
                  </Text>
                )
              }
            </Await>
          </Suspense>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}

