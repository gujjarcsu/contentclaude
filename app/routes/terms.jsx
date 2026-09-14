// P6.2 — the terms of service, public and unauthenticated. See privacy.jsx.
import { legalPage } from "../utils/legalPage.server.js";

export const loader = () => legalPage("terms");
