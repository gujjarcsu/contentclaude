import { useState } from "react";
import { BlockStack, InlineStack, Text, Button, Badge, Collapsible, Divider } from "@shopify/polaris";
import { GEO_RUBRIC } from "../utils/geoRubric.js";

/**
 * P1.3 — the rubric, published where the score is shown.
 *
 * `09-DOCTRINE.md` §3: a score is defensible "only if it scores things that are
 * documented to matter", and the action is to "publish the rubric in-app so a
 * merchant can check our working".
 *
 * RENDERED FROM `GEO_RUBRIC`, the same table `calculateGeoScore` adds up. The
 * previous explanation was a hand-written sentence listing the six things
 * scored — accurate when written, and false the moment P1.3 removed structured
 * data from the rubric. A hand-maintained description of a calculation goes
 * stale the first time the calculation changes; one generated from the
 * calculation cannot.
 *
 * IT LIVES IN BOTH PLACES THE SCORE APPEARS. On the first-run screen, and on the
 * dashboard's Store SEO score card — because `StartState` only renders while
 * `Shop.firstDraftSeenAt` is null, so publishing it only there would mean every
 * merchant past their first run could never reach it. A rubric a merchant
 * cannot open is not published (L15).
 *
 * The disclosure state lives HERE rather than in either caller, so neither has
 * to add a hook above its own early return.
 */
export function GeoRubric() {
  const [open, setOpen] = useState(false);

  return (
    <BlockStack gap="200">
      <Button
        variant="plain"
        disclosure={open ? "up" : "down"}
        onClick={() => setOpen((v) => !v)}
        ariaExpanded={open}
        ariaControls="geo-rubric"
      >
        {open ? "Hide how this is scored" : "How is this scored?"}
      </Button>
      <Collapsible open={open} id="geo-rubric" transition={{ duration: "150ms" }}>
        <BlockStack gap="300">
          <Divider />
          {GEO_RUBRIC.map((d) => (
            <BlockStack gap="100" key={d.key}>
              <InlineStack gap="200" blockAlign="center">
                <Text as="h3" variant="headingSm">
                  {d.label}
                </Text>
                <Badge tone="info">{`${d.max} points`}</Badge>
                {d.optional ? <Badge>Only when known</Badge> : null}
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                {d.why}
              </Text>
            </BlockStack>
          ))}
          <Divider />
          <Text as="p" variant="bodySm" tone="subdued">
            Anything we cannot measure is left out of the total rather than counted against you, so the
            score is always out of what we could actually check.
          </Text>
        </BlockStack>
      </Collapsible>
    </BlockStack>
  );
}
