import { authenticate } from "../shopify.server.js";
import prisma from "../db.server.js";
import { isGscAnswer } from "../utils/gscAiControl.js";

// P2.5 resource route: persists the merchant's answer to the one check no app
// can make — whether Search Console's "Search generative AI control" is on
// for their site. Posted to from the attention page. No UI. The answer is
// theirs; we store it with its date and never infer it from anything else.
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const answer = String(formData.get("answer") ?? "");

  if (answer === "reset") {
    await prisma.growthState.upsert({
      where: { shop },
      update: { gscAiControl: null, gscAiControlAt: null },
      create: { shop },
    });
    return Response.json({ success: true });
  }

  if (isGscAnswer(answer)) {
    const now = new Date();
    await prisma.growthState.upsert({
      where: { shop },
      update: { gscAiControl: answer, gscAiControlAt: now },
      create: { shop, gscAiControl: answer, gscAiControlAt: now },
    });
    return Response.json({ success: true, answer });
  }

  return Response.json({ error: "Unknown answer." }, { status: 400 });
};
