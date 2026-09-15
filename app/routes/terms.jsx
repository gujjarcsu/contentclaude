// P6.2 — the terms of service, public and unauthenticated. See privacy.jsx.
import { legalPage, legalLocaleFor } from "../utils/legalPage.server.js";

// D1 - ?locale= first, then the browser Accept-Language, else English.
export const loader = ({ request }) => legalPage("terms", { locale: legalLocaleFor(request) });
