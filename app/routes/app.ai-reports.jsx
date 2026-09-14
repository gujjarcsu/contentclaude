/**
 * P3.3 (Phase 8) — the two AI-visibility reports that have no API, taught
 * in-app. We teach it; we never scrape it. What the merchant reads they may
 * type in, and it is shown back as their reading with its date.
 *
 * Not in the sidebar (five items). Reached from Proof and from the attention
 * page's Search Console card.
 */
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { Page, Card, Text, BlockStack, InlineStack, Button, TextField, Link, Banner, List } from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { AI_REPORTS, parseReadings, validateReading, withReading, readingSentence } from "../utils/aiReports.js";
import { useRouteLoading } from "../utils/useRouteLoading.js";
import { AppSkeleton } from "../components/AppSkeleton.jsx";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const gs = await prisma.growthState.findUnique({ where: { shop }, select: { aiReportReadings: true } }).catch(() => null);
  return Response.json({ readings: parseReadings(gs?.aiReportReadings) });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const fd = await request.formData();
  const reportKey = String(fd.get("report") ?? "");
  const raw = Object.fromEntries([...fd.entries()].filter(([k]) => k.startsWith("f_")).map(([k, v]) => [k.slice(2), v]));
  const v = validateReading(reportKey, raw);
  if (!v.ok) return Response.json({ error: v.reason, report: reportKey }, { status: 400 });
  const gs = await prisma.growthState.findUnique({ where: { shop }, select: { aiReportReadings: true } }).catch(() => null);
  const next = withReading(parseReadings(gs?.aiReportReadings), reportKey, v.values);
  await prisma.growthState.upsert({
    where: { shop },
    update: { aiReportReadings: JSON.stringify(next) },
    create: { shop, aiReportReadings: JSON.stringify(next) },
  });
  return Response.json({ ok: true, report: reportKey });
};

function ReportCard({ report, readings }) {
  const fetcher = useFetcher();
  const [values, setValues] = useState(() => Object.fromEntries(report.fields.map((f) => [f.key, ""])));
  const busy = fetcher.state !== "idle";
  const sentence = readingSentence(report.key, readings);
  const err = fetcher.data?.error && fetcher.data?.report === report.key ? fetcher.data.error : null;
  return (
    <Card>
      <BlockStack gap="300">
        <Text as="h2" variant="headingMd">
          {report.title}
        </Text>
        <Text as="p" variant="bodySm">
          <b>Where:</b> {report.where}
        </Text>
        <List type="number">
          {report.steps.map((s) => (
            <List.Item key={s}>{s}</List.Item>
          ))}
        </List>
        <Link url={report.url} target="_blank">
          Open it in a new tab
        </Link>
        <Text as="p" variant="bodySm" tone="subdued">
          {report.caveat}
        </Text>
        {sentence && (
          <Banner tone="info" title="What you read last time">
            <Text as="p" variant="bodySm">
              {sentence}
            </Text>
          </Banner>
        )}
        {err && <Banner tone="critical" title={err} />}
        <fetcher.Form method="post">
          <input type="hidden" name="report" value={report.key} />
          <BlockStack gap="200">
            <InlineStack gap="300" wrap>
              {report.fields.map((f) => (
                <div key={f.key} style={{ minWidth: 220 }}>
                  <TextField
                    label={f.label}
                    name={`f_${f.key}`}
                    value={values[f.key]}
                    onChange={(v) => setValues((m) => ({ ...m, [f.key]: v }))}
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </div>
              ))}
            </InlineStack>
            <InlineStack>
              <Button submit loading={busy}>
                Save what I read
              </Button>
            </InlineStack>
          </BlockStack>
        </fetcher.Form>
      </BlockStack>
    </Card>
  );
}

export default function AiReportsPage() {
  const { readings } = useLoaderData();
  const navigate = useNavigate();
  const loadingThisRoute = useRouteLoading();
  if (loadingThisRoute) return <AppSkeleton />;
  return (
    <Page title="The two AI reports you read yourself" subtitle="Neither has an API. We show you where they are and what they mean; what you read is yours." backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
      <BlockStack gap="400">
        {AI_REPORTS.map((r) => (
          <ReportCard key={r.key} report={r} readings={readings} />
        ))}
        <Text as="p" variant="bodySm" tone="subdued">
          Method: none of ours. These two reports are read in Google's and Microsoft's own consoles, by you; no app can read
          them, and this one does not try. A number you type here is stored with its date and shown back as your reading.
          It is never combined with anything, never trended, and never leaves the app.
        </Text>
      </BlockStack>
    </Page>
  );
}

export { RouteError as ErrorBoundary } from "../components/RouteError.jsx";
