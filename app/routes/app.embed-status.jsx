import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// Resource route: persists whether the merchant has confirmed the
// "AI-search FAQ schema" theme app embed is enabled. Posted to by
// EmbedSetupCard. No UI.
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  if (actionType === "confirm") {
    await prisma.growthState.upsert({
      where: { shop },
      update: { embedConfirmedAt: new Date() },
      create: { shop, embedConfirmedAt: new Date() },
    });
    return Response.json({ success: true });
  }

  if (actionType === "reset") {
    await prisma.growthState.upsert({
      where: { shop },
      update: { embedConfirmedAt: null },
      create: { shop },
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Unknown action." }, { status: 400 });
};
