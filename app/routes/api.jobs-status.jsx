// Lightweight endpoint polled by the layout to show live job progress
// without forcing a full layout reload.
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
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
