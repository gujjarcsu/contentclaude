import { authenticate } from "../shopify.server";
import db from "../db.server";
import logger from "../utils/logger.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  logger.info({ shop, topic }, "Webhook received: app/scopes_update");
  const current = payload.current;

  if (session) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: current.toString(),
      },
    });
  }

  return new Response();
};
