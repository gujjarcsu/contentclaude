// Lightweight endpoint polled by the layout to show live job progress
// without forcing a full layout reload.
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Benign empty payload — shape-compatible with the ticker, shows no jobs.
const EMPTY = { count: 0, totalProducts: 0, completedProducts: 0, pct: 0, jobs: [] };

export const loader = async ({ request }) => {
  // This endpoint is polled in the background every few seconds by the layout's
  // JobProgressTicker. authenticate.admin THROWS A REDIRECT (to /auth/login) on
  // any transient auth miss — and because the poll is a fetcher.load, React Router
  // follows that redirect and yanks the whole embedded app to the login form.
  // A background poll must never do that: swallow auth failures and return empty.
  // The next real navigation re-authenticates normally.
  let session;
  try {
    ({ session } = await authenticate.admin(request));
  } catch {
    return Response.json(EMPTY);
  }
  const shop = session.shop;

  const active = await prisma.generationJob.findMany({
    where: { shop, status: { in: ["queued", "processing"] } },
    select: {
      id: true,
      status: true,
      totalProducts: true,
      completedProducts: true,
      contentTypes: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const totalProducts = active.reduce((s, j) => s + j.totalProducts, 0);
  const completedProducts = active.reduce((s, j) => s + j.completedProducts, 0);
  const pct = totalProducts > 0 ? Math.round((completedProducts / totalProducts) * 100) : 0;

  return Response.json({
    count: active.length,
    totalProducts,
    completedProducts,
    pct,
    jobs: active,
  });
};
