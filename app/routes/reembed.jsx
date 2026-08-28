import { renderReembedPage } from "../utils/embedded.server.js";

// Resource route (NO component) that renders the App Bridge re-embed page.
// Routes that must recover an embedded merchant from a session-less / param-less
// state (auth.login, _index) redirect here instead of returning a raw Response
// themselves — a route WITH a component can't cleanly return a raw Response
// (React Router renders the component with it as data). This route has no
// component, so its Response (App Bridge HTML + its own frame-ancestors CSP) is
// served verbatim. See renderReembedPage for the recovery mechanism (2.1.1 #4).
export const loader = ({ request }) => {
  return renderReembedPage(request, "/app");
};
