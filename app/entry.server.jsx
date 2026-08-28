import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { shopFromHost } from "./utils/embedded.server.js";
// Run startup tasks (stuck-job recovery + BullMQ worker) once at boot.
import "./utils/startup.server.js";
import logger from "./utils/logger.server.js";

export const streamTimeout = 15_000; // 15 seconds — accommodates slow DB queries under load

export default async function handleRequest(
  request,
  responseStatusCode,
  responseHeaders,
  reactRouterContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);

  // Persist the shop as a PARTITIONED cookie on every document response that
  // carries the embedded context (host/shop). CHIPS partitioned cookies survive
  // incognito's third-party-cookie block, so a LATER host-less document load can
  // still be recovered by the /reembed backstop → fully-qualified admin URL (no
  // host, no 404). This is the reliable server-side version of the persistence
  // (a client document.cookie write was being rejected). See 2.1.1 #4.
  try {
    const u = new URL(request.url);
    const shop = u.searchParams.get("shop") || shopFromHost(u.searchParams.get("host"));
    if (shop && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
      responseHeaders.append(
        "Set-Cookie",
        `navaal_shop=${shop.toLowerCase()}; Path=/; Max-Age=2592000; Secure; SameSite=None; Partitioned`
      );
    }
  } catch {
    /* best-effort */
  }

  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={reactRouterContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          logger.error({ err: error }, "React render error");
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
