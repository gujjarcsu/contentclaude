import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  ProgressBar,
  EmptyState,
  Box,
  Banner,
  Divider,
} from "@shopify/polaris";
import { useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const jobs = await prisma.generationJob.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return Response.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      totalProducts: j.totalProducts,
      completedProducts: j.completedProducts,
      failedProducts: j.failedProducts,
      contentTypes: j.contentTypes,
      errorLog: j.errorLog ? JSON.parse(j.errorLog) : [],
      startedAt: j.startedAt?.toISOString() ?? null,
      completedAt: j.completedAt?.toISOString() ?? null,
      createdAt: j.createdAt.toISOString(),
    })),
  });
};

function statusBadge(status) {
  switch (status) {
    case "queued":     return <Badge tone="attention">Queued</Badge>;
    case "processing": return <Badge tone="info" progress="incomplete">Processing…</Badge>;
    case "complete":   return <Badge tone="success">Complete</Badge>;
    case "failed":     return <Badge tone="critical">Failed</Badge>;
    default:           return <Badge>{status}</Badge>;
  }
}

function elapsed(startedAt, completedAt) {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt) : new Date();
  const secs = Math.round((end - new Date(startedAt)) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function JobsPage() {
  const { jobs } = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  const hasActiveJobs = jobs.some((j) =>
    j.status === "queued" || j.status === "processing"
  );

  // Exponential back-off polling while jobs are active.
  // Starts at 5 s, doubles each empty poll (no progress), caps at 30 s.
  // Resets to 5 s as soon as a job makes progress.
  const pollIntervalRef = useRef(5000);
  const prevProgressRef = useRef(null);

  useEffect(() => {
    if (!hasActiveJobs) {
      pollIntervalRef.current = 5000;
      return;
    }

    const currentProgress = jobs
      .map((j) => j.completedProducts + j.failedProducts)
      .join(",");

    if (currentProgress !== prevProgressRef.current) {
      // Progress detected — reset to fast polling
      pollIntervalRef.current = 5000;
      prevProgressRef.current = currentProgress;
    } else {
      // No progress — back off, cap at 30 s
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, 30_000);
    }

    const interval = pollIntervalRef.current;
    const timer = setTimeout(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, interval);
    return () => clearTimeout(timer);
  }, [hasActiveJobs, jobs, revalidator]);

  return (
    <Page
      title="Bulk Generation Jobs"
      subtitle="Track the progress of all your bulk generation runs"
      backAction={{ content: "Products", onAction: () => navigate("/app/products") }}
      primaryAction={{
        content: "Generate More",
        onAction: () => navigate("/app/products"),
      }}
    >
      <BlockStack gap="500">
        {hasActiveJobs && (
          <Banner tone="info" title="Jobs are running">
            <p>This page refreshes automatically every 5 seconds. You can navigate away — jobs continue in the background.</p>
          </Banner>
        )}

        {jobs.length === 0 ? (
          <Card>
            <EmptyState
              heading="No bulk jobs yet"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              action={{
                content: "Select products to generate",
                onAction: () => navigate("/app/products"),
              }}
            >
              <p>
                Go to the Products page, select multiple products using the
                checkboxes, and click "Generate Selected" to run a bulk job.
              </p>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="400">
            {jobs.map((job) => {
              const progress =
                job.totalProducts > 0
                  ? Math.round(
                      ((job.completedProducts + job.failedProducts) /
                        job.totalProducts) *
                        100
                    )
                  : 0;
              const elapsedTime = elapsed(job.startedAt, job.completedAt);
              const contentTypesList = job.contentTypes
                .split(",")
                .map((t) =>
                  t === "description"
                    ? "Description"
                    : t === "metaTitle"
                    ? "Meta Title"
                    : t === "metaDescription"
                    ? "Meta Description"
                    : t === "faq"
                    ? "FAQ"
                    : t
                )
                .join(", ");

              return (
                <Card key={job.id}>
                  <BlockStack gap="400">
                    {/* Header row */}
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="100">
                        <InlineStack gap="300" blockAlign="center">
                          {statusBadge(job.status)}
                          <Text as="p" variant="bodySm" tone="subdued">
                            Started {formatDate(job.createdAt)}
                          </Text>
                          {elapsedTime && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              · {elapsedTime} elapsed
                            </Text>
                          )}
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Generating: {contentTypesList}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100" inlineAlign="end">
                        <Text as="p" variant="headingMd" fontWeight="bold">
                          {job.completedProducts}/{job.totalProducts}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          products done
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    {/* Progress bar */}
                    {job.totalProducts > 0 && (
                      <BlockStack gap="100">
                        <ProgressBar
                          progress={progress}
                          tone={
                            job.status === "failed"
                              ? "critical"
                              : job.status === "complete"
                              ? "success"
                              : "highlight"
                          }
                          size="medium"
                        />
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {progress}% complete
                          </Text>
                          {job.failedProducts > 0 && (
                            <Text as="p" variant="bodySm" tone="critical">
                              {job.failedProducts} failed
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    )}

                    {/* Error log */}
                    {job.errorLog.length > 0 && (
                      <>
                        <Divider />
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" fontWeight="bold" tone="critical">
                            Errors ({job.errorLog.length})
                          </Text>
                          {job.errorLog.map((err, i) => (
                            <Box
                              key={i}
                              padding="200"
                              background="bg-surface-critical-subdued"
                              borderRadius="100"
                            >
                              <Text as="p" variant="bodySm">
                                <strong>
                                  {err.productId.replace("gid://shopify/Product/", "Product #")}
                                </strong>{" "}
                                — {err.error}
                              </Text>
                            </Box>
                          ))}
                        </BlockStack>
                      </>
                    )}

                    {/* Completion CTA */}
                    {job.status === "complete" && (
                      <>
                        <Divider />
                        <InlineStack gap="300">
                          <Button
                            variant="primary"
                            onClick={() => navigate("/app/products")}
                          >
                            Review & Publish Content
                          </Button>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {job.completedProducts} product
                            {job.completedProducts !== 1 ? "s" : ""} have draft
                            content ready to review
                          </Text>
                        </InlineStack>
                      </>
                    )}
                  </BlockStack>
                </Card>
              );
            })}
          </BlockStack>
        )}
      </BlockStack>
    </Page>
  );
}
