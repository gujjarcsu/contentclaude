/**
 * P2.6 — bulk remediation, with review.
 *
 * One page, one section per fix the app can make, each with the products it
 * applies to, what will be written, what it costs, and a tick per row. Nothing
 * is written until the merchant presses the section's button; generated
 * content goes to the Review page, not to Shopify. The fixes the brief names
 * that this app cannot make are listed at the bottom with the exact reason.
 *
 * Not in the sidebar (five items). Reached from the attention page.
 */
import { useState } from "react";
import { useT } from "../i18n/react.jsx";
import { tForRequest } from "../i18n/index.js";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { Page, Card, Text, BlockStack, InlineStack, Button, Checkbox, TextField, Banner, Badge, Link } from "@shopify/polaris";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { greetingName } from "../utils/shopName.js";
import { FIX, FIX_LABEL, SKIPPED, proposeVendor } from "../utils/remediation.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const { remediationCandidates, proposeOptionNames, firstVariants, isRemediationLocked } = await import("../utils/remediation.server.js");
  const { remainingGenerations } = await import("../utils/plans.server.js");
  const [candidates, bv, remaining] = await Promise.all([
    remediationCandidates(shop),
    prisma.brandVoice.findUnique({ where: { shop }, select: { storeName: true } }),
    remainingGenerations(shop),
  ]);
  const [options, variants] = await Promise.all([
    proposeOptionNames(admin.graphql, shop, candidates[FIX.OPTION_NAME].map((c) => c.productId)),
    firstVariants(admin.graphql, shop, candidates[FIX.BARCODE].map((c) => c.productId)),
  ]);
  return Response.json({
    shopDomain: shop,
    locked: isRemediationLocked(shop),
    remaining,
    vendorProposal: proposeVendor({ brandStoreName: bv?.storeName, shopName: greetingName(shop, null) }),
    candidates,
    options,
    variants,
  });
};

export const action = async ({ request }) => {
  const t = tForRequest(request);
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");
  let items = [];
  try {
    items = JSON.parse(String(fd.get("items") ?? "[]"));
    if (!Array.isArray(items)) items = [];
  } catch {
    items = [];
  }
  const r = await import("../utils/remediation.server.js");
  try {
    if (intent === "apply_vendor") return Response.json({ intent, ...(await r.applyVendor(admin.graphql, shop, items, fd.get("vendor"))) });
    if (intent === "apply_options") return Response.json({ intent, ...(await r.applyOptionNames(admin.graphql, shop, items)) });
    if (intent === "apply_barcodes") return Response.json({ intent, ...(await r.applyBarcodes(admin.graphql, shop, items)) });
    if (intent === "gtin_exempt") return Response.json({ intent, ...(await r.setGtinExempt(shop, items.map((i) => i.productId), true)) });
    if (intent === "start_alt_text") return Response.json({ intent, ...(await r.startContentJob(shop, items.map((i) => i.productId), FIX.ALT_TEXT)) });
    if (intent === "start_descriptions") return Response.json({ intent, ...(await r.startContentJob(shop, items.map((i) => i.productId), FIX.DESCRIPTION)) });
  } catch (err) {
    if (err?.name === "RemediationLocked") return Response.json({ intent, locked: true, error: err.message }, { status: 403 });
    return Response.json({ intent, error: err?.message?.startsWith("You already have jobs") ? err.message : t("Could not apply that. Please try again.") }, { status: 500 });
  }
  return Response.json({ error: t("Unknown action.") }, { status: 400 });
};

function ResultBanner({ data }) {
  const t = useT();
  if (!data) return null;
  if (data.error) return <Banner tone="critical" title={data.error} />;
  if (data.jobId || data.queued !== undefined) {
    return (
      <Banner tone="success" title={t("{queued} queued for review{v}.", { queued: data.queued, v: data.quotaSkipped ? ` — ${data.quotaSkipped} left out, past this month's credits` : "" })}>
        <Text as="p" variant="bodySm">
          {t("Drafts appear on the Review page as they are written. Nothing is published until you approve it.")}
        </Text>
      </Banner>
    );
  }
  const failed = data.failed ?? [];
  return (
    <Banner tone={failed.length ? "warning" : "success"} title={t("{v} applied{v1}.", { v: data.applied ?? 0, v1: failed.length ? `, ${failed.length} not` : "" })}>
      {failed.slice(0, 5).map((f) => (
        <Text key={f.productId} as="p" variant="bodySm">
          {f.error}
        </Text>
      ))}
    </Banner>
  );
}

/**
 * One fix. Rows carry a tick and, when `field` is set, a text box whose value
 * goes with the row. `shared` is one text box for the whole section.
 */
function FixSection({ fix, rows, field, shared, sharedDefault, submit, busy, locked, credits, remaining, storeHandle }) {
  const t = useT();
  const meta = FIX_LABEL[fix];
  const [ticked, setTicked] = useState(() => new Set(rows.filter((r) => !r.disabled).map((r) => r.key)));
  const [values, setValues] = useState(() => Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""])));
  const [sharedValue, setSharedValue] = useState(sharedDefault ?? "");
  if (rows.length === 0) return null;
  const selected = rows.filter((r) => ticked.has(r.key) && !r.disabled);
  const cost = credits * selected.length;
  const overQuota = credits > 0 && remaining !== null && cost > remaining;
  const toggle = (k) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const allOn = selected.length === rows.filter((r) => !r.disabled).length;
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <Text as="h2" variant="headingSm">
            {meta.title} · {rows.length}
          </Text>
          <Badge tone={credits === 0 ? "success" : "info"}>{credits === 0 ? t("no credits") : t("{credits} credit each", { credits })}</Badge>
        </InlineStack>
        <Text as="p" variant="bodySm">
          {meta.how}
        </Text>
        {shared && <TextField label={shared} value={sharedValue} onChange={setSharedValue} autoComplete="off" />}
        <InlineStack gap="200">
          <Button size="slim" onClick={() => setTicked(allOn ? new Set() : new Set(rows.filter((r) => !r.disabled).map((r) => r.key)))}>
            {allOn ? t("Untick all") : t("Tick all")}
          </Button>
        </InlineStack>
        <BlockStack gap="200">
          {rows.map((r) => (
            <InlineStack key={r.key} gap="300" blockAlign="center" wrap>
              <Checkbox label={r.title || r.handle || r.key} checked={ticked.has(r.key)} disabled={!!r.disabled} onChange={() => toggle(r.key)} />
              {r.hint && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {r.hint}
                </Text>
              )}
              {field && !r.disabled && (
                <div style={{ minWidth: 220 }}>
                  <TextField label={field} labelHidden value={values[r.key] ?? ""} onChange={(v) => setValues((m) => ({ ...m, [r.key]: v }))} autoComplete="off" placeholder={field} />
                </div>
              )}
              <Link url={`https://admin.shopify.com/store/${storeHandle}/products/${String(r.productId).split("/").pop()}`} target="_blank">
                {t("Shopify admin")}
              </Link>
            </InlineStack>
          ))}
        </BlockStack>
        {overQuota && (
          <Text as="p" variant="bodySm" tone="critical">
            {t("{cost} credits for {length} products; {remaining} left this month. The first {remaining1} will run and the rest are disclosed, not silently dropped.", { cost, length: selected.length, remaining, remaining1: remaining })}
          </Text>
        )}
        <InlineStack gap="200" blockAlign="center">
          <Button
            variant="primary"
            disabled={locked || selected.length === 0 || busy}
            loading={busy}
            onClick={() =>
              submit(
                selected.map((r) => ({ ...r.payload, ...(field ? { [r.valueKey ?? "value"]: values[r.key] ?? "" } : {}) })),
                shared ? sharedValue : undefined,
              )
            }
          >
            {t("{title} for {length} {v}", { title: meta.title, length: selected.length, v: credits > 0 ? ` (${cost} credit${cost === 1 ? "" : "s"})` : "" })}
          </Button>
          {locked && (
            <Text as="span" variant="bodySm" tone="subdued">
              {t("This store is monitored only; nothing is written from here.")}
            </Text>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default function FixPage() {
  const t = useT();
  const { shopDomain, locked, remaining, vendorProposal, candidates, options, variants } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) return <AppSkeleton />;
  const busy = fetcher.state !== "idle";
  const storeHandle = String(shopDomain).split(".")[0];
  const post = (intent) => (items, shared) => {
    const fd = new FormData();
    fd.append("intent", intent);
    fd.append("items", JSON.stringify(items));
    if (shared !== undefined) fd.append("vendor", shared);
    fetcher.submit(fd, { method: "post" });
  };
  const simple = (list) => list.map((c) => ({ key: c.productId, productId: c.productId, title: c.title, handle: c.handle, payload: { productId: c.productId } }));
  const optionRows = options.map((o) => ({
    key: o.optionId,
    productId: o.productId,
    title: o.title,
    hint: t("values: {v}{v1}", { v: (o.values ?? []).slice(0, 4).join(", "), v1: (o.values ?? []).length > 4 ? "…" : "" }),
    value: o.proposed ?? "",
    valueKey: "name",
    payload: { productId: o.productId, optionId: o.optionId },
  }));
  const barcodeRows = variants.map((v) => ({
    key: v.productId,
    productId: v.productId,
    title: v.title,
    disabled: !v.singleVariant || !v.variantId,
    hint: v.singleVariant ? undefined : t("several variants: add barcodes in Shopify admin"),
    value: "",
    valueKey: "barcode",
    payload: { productId: v.productId, variantId: v.variantId },
  }));
  const total = Object.values(candidates).reduce((n, l) => n + l.length, 0);

  return (
    <Page title={t("Fix in bulk")} subtitle={t("Each fix is reviewed before it is written; generated content waits on the Review page.")} backAction={{ content: t("Needs attention"), onAction: () => navigate("/app/attention") }}>
      <BlockStack gap="400">
        <ResultBanner data={fetcher.data} />
        {total === 0 && (
          <Card>
            <Text as="p">{t("Nothing to fix from here right now. The daily check keeps looking.")}</Text>
          </Card>
        )}
        <FixSection fix={FIX.VENDOR} rows={simple(candidates[FIX.VENDOR])} shared="Brand name to apply" sharedDefault={vendorProposal} submit={post("apply_vendor")} busy={busy} locked={locked} credits={0} remaining={remaining} storeHandle={storeHandle} />
        <FixSection fix={FIX.OPTION_NAME} rows={optionRows} field="Option name" submit={post("apply_options")} busy={busy} locked={locked} credits={0} remaining={remaining} storeHandle={storeHandle} />
        <FixSection fix={FIX.ALT_TEXT} rows={simple(candidates[FIX.ALT_TEXT])} submit={post("start_alt_text")} busy={busy} locked={locked} credits={0} remaining={remaining} storeHandle={storeHandle} />
        <FixSection fix={FIX.DESCRIPTION} rows={simple(candidates[FIX.DESCRIPTION])} submit={post("start_descriptions")} busy={busy} locked={locked} credits={1} remaining={remaining} storeHandle={storeHandle} />
        <FixSection fix={FIX.GTIN_EXEMPT} rows={simple(candidates[FIX.GTIN_EXEMPT])} submit={post("gtin_exempt")} busy={busy} locked={locked} credits={0} remaining={remaining} storeHandle={storeHandle} />
        <FixSection fix={FIX.BARCODE} rows={barcodeRows} field="GTIN" submit={post("apply_barcodes")} busy={busy} locked={locked} credits={0} remaining={remaining} storeHandle={storeHandle} />

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingSm">
              {t("Not fixable from here, and why")}
            </Text>
            {SKIPPED.map((s) => (
              <BlockStack key={s.what} gap="050">
                <Text as="h3" variant="headingXs">
                  {s.what}
                </Text>
                <Text as="p" variant="bodySm">
                  {s.why}
                </Text>
              </BlockStack>
            ))}
          </BlockStack>
        </Card>

        <Text as="p" variant="bodySm" tone="subdued">
          {t("Method: every change is sent to Shopify one product at a time and checked against the value Shopify returns; a mismatch is reported, never assumed. Generated content is never published from this page. Findings update the moment a fix is confirmed.")}
        </Text>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
