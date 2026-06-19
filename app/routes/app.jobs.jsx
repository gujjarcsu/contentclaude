import { useLoaderData, useNavigate, useRevalidator, useFetcher, useNavigation } from "react-router";
import {
  Page,
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
  SkeletonPage,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { useEffect, useRef } from "react";
import { Clock, CheckCircle2, XCircle, Loader } from "lucide-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { enqueueGenerationJob } from "../queues/generationQueue.server";

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

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const jobId = formData.get("jobId");
  const actionType = formData.get("actionType") || "resume";

  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.shop !== shop) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  let retryIds = [];

  if (actionType === "cancel") {
    if (!["queued", "processing"].includes(job.status)) {
      return Response.json({ error: "Only queued or processing jobs can be cancelled." }, { status: 400 });
    }
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        completedAt: new Date(),
        errorLog: JSON.stringify([{ productId: "N/A", error: "Cancelled by merchant." }]),
      },
    });
    return Response.json({ success: true });
  }

  if (actionType === "retryFailed") {
    const errorLog = job.errorLog ? JSON.parse(job.errorLog) : [];
    retryIds = errorLog.map((e) => e.productId).filter((id) => id && id !== "N/A");
  } else {
    const allIds = JSON.parse(job.productIds || "[]");
    retryIds = allIds.slice(job.completedProducts);
  }

  if (retryIds.length === 0) {
    return Response.json({ error: "No products to retry." }, { status: 400 });
  }

  const newJob = await prisma.generationJob.create({
    data: {
      shop,
      status: "queued",
      totalProducts: retryIds.length,
      productIds: JSON.stringify(retryIds),
      contentTypes: job.contentTypes,
      autoPublish: job.autoPublish,
    },
  });

  await enqueueGenerationJob(newJob.id);
  return Response.json({ success: true, newJobId: newJob.id });
};

function statusBadge(status) {
  switch (status) {
    case "queued":     return <Badge tone="attention">Queued</Badge>;
    case "processing": return <Badge tone="info" progress="incomplete">Processing...</Badge>;
    case "complete":   return <Badge tone="success">Complete</Badge>;
    case "failed":     return <Badge tone="critical">Failed</Badge>;
    default:           return <Badge>{status}</Badge>;
  }
}

function statusIcon(status) {
  switch (status) {
    case "queued":     return <Clock aria-hidden="true" size={16} color="#916A00" />;
    case "processing": return <Loader aria-hidden="true" size={16} color="#1656AC" />;
    case "complete":   return <CheckCircle2 aria-hidden="true" size={16} color="#00A047" />;
    case "failed":     return <XCircle aria-hidden="true" size={16} color="#E51C00" />;
    default:           return null;
  }
}

function elapsed(startedAt, completedAt) {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt) : new Date();
  const secs = Math.round((end - new Date(startedAt)) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function getEta(job) {
  if (job.status !== "processing" || !job.startedAt) return null;
  const done = job.completedProducts + job.failedProducts;
  const remaining = job.totalProducts - done;
  if (done === 0 || remaining <= 0) return null;

  const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
  const msPerProduct = elapsedMs / done;
  const etaMs = msPerProduct * remaining;
  const etaSecs = Math.round(etaMs / 1000);

  if (etaSecs < 60) return `~${etaSecs}s remaining`;
  const mins = Math.floor(etaSecs / 60);
  return `~${mins}m remaining`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

export default function JobsPage() {
  const { jobs } = useLoaderData();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const retryFetcher = useFetcher();
  const cancelFetcher = useFetcher();
  const navigation = useNavigation();

  // Hooks must all be called before any conditional return
  const hasActiveJobs = jobs.some((j) => j.status === "queued" || j.status === "processing");

  const pollIntervalRef = useRef(5000);
  const prevProgressRef = useRef(null);
  const prevRetryData = useRef(null);
  const prevCancelData = useRef(null);

  useEffect(() => {
    if (retryFetcher.data && retryFetcher.data !== prevRetryData.current) {
      prevRetryData.current = retryFetcher.data;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (retryFetcher.data.success) {
          window.shopify.toast.show("Job re-queued successfully.", { duration: 4000 });
        } else if (retryFetcher.data.error) {
          window.shopify.toast.show(retryFetcher.data.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [retryFetcher.data]);

  useEffect(() => {
    if (cancelFetcher.data && cancelFetcher.data !== prevCancelData.current) {
      prevCancelData.current = cancelFetcher.data;
      if (typeof window !== "undefined" && window.shopify?.toast) {
        if (cancelFetcher.data.success) {
          window.shopify.toast.show("Job cancelled.", { duration: 3000 });
        } else if (cancelFetcher.data.error) {
          window.shopify.toast.show(cancelFetcher.data.error, { duration: 5000, isError: true });
        }
      }
    }
  }, [cancelFetcher.data]);

  useEffect(() => {
    if (!hasActiveJobs) {
      pollIntervalRef.current = 5000;
      return;
    }

    const currentProgress = jobs.map((j) => j.completedProducts + j.failedProducts).join(",");

    if (currentProgress !== prevProgressRef.current) {
      pollIntervalRef.current = 5000;
      prevProgressRef.current = currentProgress;
    } else {
      pollIntervalRef.current = Math.min(pollIntervalRef.current * 2, 30_000);
    }

    const interval = pollIntervalRef.current;
    const timer = setTimeout(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, interval);
    return () => clearTimeout(timer);
  }, [hasActiveJobs, jobs, revalidator]);

  const activeJobs = jobs.filter((j) => j.status === "queued" || j.status === "processing");
  const completedJobs = jobs.filter((j) => j.status === "complete" || j.status === "failed");

  // Skeleton while navigating to this page — no blank flash
  if (navigation.state === "loading") {
    return (
      <SkeletonPage title="Bulk Generation Jobs" primaryAction>
        <BlockStack gap="400">
          <Card><SkeletonDisplayText size="small" /><Box paddingBlockStart="400"><SkeletonBodyText lines={3} /></Box></Card>
          <Card><SkeletonDisplayText size="small" /><Box paddingBlockStart="400"><SkeletonBodyText lines={5} /></Box></Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

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
            <p>This page refreshes automatically. You can navigate away — jobs continue in the background.</p>
          </Banner>
        )}

        {jobs.length === 0 ? (
          <Card>
            <EmptyState
              heading="No generation jobs yet"
              image="/empty-jobs.svg"
              action={{
                content: "Go to Products →",
                onAction: () => navigate("/app/products"),
              }}
              secondaryAction={{
                content: "Learn how bulk generation works →",
                onAction: () => navigate("/app/optimize"),
              }}
            >
              <p>Generate content for multiple products at once — jobs run in the background so you can keep working.</p>
            </EmptyState>
          </Card>
        ) : (
          <BlockStack gap="400">

            {/* Active jobs */}
            {activeJobs.map((job) => {
              const done = job.completedProducts + job.failedProducts;
              const progress = job.totalProducts > 0 ? Math.round((done / job.totalProducts) * 100) : 0;
              const elapsedTime = elapsed(job.startedAt, job.completedAt);
              const eta = getEta(job);
              const contentTypesList = job.contentTypes
                .split(",")
                .map((t) =>
                  t === "description" ? "Description" :
                  t === "metaTitle" ? "Meta Title" :
                  t === "metaDescription" ? "Meta Description" :
                  t === "faq" ? "FAQ" : t
                )
                .join(", ");

              return (
                <Card key={job.id}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          {statusIcon(job.status)}
                          {statusBadge(job.status)}
                          <Text as="p" variant="bodySm" tone="subdued">
                            Started {formatDate(job.createdAt)}
                          </Text>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Generating: {contentTypesList}
                        </Text>
                        <InlineStack gap="300">
                          {elapsedTime && (
                            <Text as="p" variant="bodySm" tone="subdued">{elapsedTime} elapsed</Text>
                          )}
                          {eta && (
                            <Text as="p" variant="bodySm" fontWeight="semibold" tone="info">{eta}</Text>
                          )}
                        </InlineStack>
                      </BlockStack>

                      <BlockStack gap="100" inlineAlign="end">
                        <Text as="p" variant="headingMd" fontWeight="bold">
                          {done}/{job.totalProducts}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">products done</Text>
                        <cancelFetcher.Form method="post">
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="actionType" value="cancel" />
                          <Button
                            tone="critical"
                            variant="plain"
                            size="slim"
                            submit
                            loading={
                              cancelFetcher.state !== "idle" &&
                              cancelFetcher.formData?.get("jobId") === job.id
                            }
                          >
                            Cancel job
                          </Button>
                        </cancelFetcher.Form>
                      </BlockStack>
                    </InlineStack>

                    {job.totalProducts > 0 && (
                      <BlockStack gap="100">
                        <ProgressBar
                          progress={progress}
                          tone="highlight"
                          size="medium"
                          animated
                        />
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone="subdued">{progress}% complete</Text>
                          {job.failedProducts > 0 && (
                            <Text as="p" variant="bodySm" tone="critical">
                              {job.failedProducts} failed
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              );
            })}

            {/* Completed / failed jobs */}
            {completedJobs.map((job) => {
              const done = job.completedProducts + job.failedProducts;
              const progress = job.totalProducts > 0 ? Math.round((done / job.totalProducts) * 100) : 0;
              const elapsedTime = elapsed(job.startedAt, job.completedAt);
              const contentTypesList = job.contentTypes
                .split(",")
                .map((t) =>
                  t === "description" ? "Description" :
                  t === "metaTitle" ? "Meta Title" :
                  t === "metaDescription" ? "Meta Description" :
                  t === "faq" ? "FAQ" : t
                )
                .join(", ");

              return (
                <Card key={job.id}>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start">
                      <BlockStack gap="200">
                        <InlineStack gap="200" blockAlign="center">
                          {statusIcon(job.status)}
                          {statusBadge(job.status)}
                          <Text as="p" variant="bodySm" tone="subdued">
                            {formatDate(job.createdAt)}
                          </Text>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {contentTypesList}
                          {elapsedTime ? ` · ${elapsedTime}` : ""}
                        </Text>
                      </BlockStack>

                      <BlockStack gap="100" inlineAlign="end">
                        <Text as="p" variant="headingMd" fontWeight="bold">
                          {done}/{job.totalProducts}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">products done</Text>
                      </BlockStack>
                    </InlineStack>

                    {job.totalProducts > 0 && (
                      <BlockStack gap="100">
                        <ProgressBar
                          progress={progress}
                          tone={job.status === "failed" ? "critical" : "success"}
                          size="small"
                        />
                        <InlineStack align="space-between">
                          <Text as="p" variant="bodySm" tone="subdued">{progress}% complete</Text>
                          {job.failedProducts > 0 && (
                            <Text as="p" variant="bodySm" tone="critical">
                              {job.failedProducts} failed
                            </Text>
                          )}
                        </InlineStack>
                      </BlockStack>
                    )}

                    {job.errorLog.length > 0 && (
                      <>
                        <Divider />
                        <BlockStack gap="200">
                          <Text as="p" variant="bodySm" fontWeight="bold" tone="critical">
                            Errors ({job.errorLog.length})
                          </Text>
                          {job.errorLog.slice(0, 10).map((err, i) => { // show first 10
                            const numericId = err.productId?.replace("gid://shopify/Product/", "");
                            const isValidId = numericId && /^\d+$/.test(numericId);
                            return (
                              <Box key={i} padding="200" background="bg-surface-critical-subdued" borderRadius="100">
                                <InlineStack align="space-between" blockAlign="start" gap="200">
                                  <Text as="p" variant="bodySm">
                                    {isValidId ? (
                                      <Button
                                        variant="plain"
                                        size="slim"
                                        onClick={() => navigate(`/app/products/${numericId}`)}
                                      >
                                        Product #{numericId}
                                      </Button>
                                    ) : (
                                      <strong>{err.productId || "Unknown"}</strong>
                                    )}
                                    {" — "}
                                    {err.error}
                                  </Text>
                                </InlineStack>
                              </Box>
                            );
                          })}
                          {job.errorLog.length > 10 && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              ...and {job.errorLog.length - 10} more errors
                            </Text>
                          )}
                        </BlockStack>
                      </>
                    )}

                    {job.status === "complete" && (
                      <>
                        <Divider />
                        <InlineStack gap="300" blockAlign="center">
                          <Button variant="primary" onClick={() => navigate("/app/review")}>
                            Review & Publish Content
                          </Button>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {job.completedProducts} product{job.completedProducts !== 1 ? "s" : ""} ready
                          </Text>
                          {job.failedProducts > 0 && (
                            <retryFetcher.Form method="post">
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="actionType" value="retryFailed" />
                              <Button
                                tone="critical"
                                submit
                                loading={
                                  retryFetcher.state !== "idle" &&
                                  retryFetcher.formData?.get("jobId") === job.id
                                }
                              >
                                Retry Failed ({job.failedProducts})
                              </Button>
                            </retryFetcher.Form>
                          )}
                        </InlineStack>
                      </>
                    )}

                    {job.status === "failed" && (
                      <>
                        <Divider />
                        <InlineStack gap="300" blockAlign="center">
                          <retryFetcher.Form method="post">
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="actionType" value="resume" />
                            <Button
                              variant="primary"
                              tone="critical"
                              submit
                              loading={
                                retryFetcher.state !== "idle" &&
                                retryFetcher.formData?.get("jobId") === job.id
                              }
                            >
                              Resume Job
                            </Button>
                          </retryFetcher.Form>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Re-queues unprocessed products from where the job crashed
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

export { RouteError as ErrorBoundary } from "../components/RouteError";
