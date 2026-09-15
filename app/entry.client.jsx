/**
 * Phase 12 Part D (D1) — the framework's default client entry, plus one
 * await: the document's locale (root.jsx sets `<html lang>` from the app
 * route's loader) is loaded from its chunk BEFORE hydration, so the first
 * client render is in the same language as the server's markup. English
 * needs nothing and hydrates exactly as the default entry did.
 */
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { loadUiLocale } from "./i18n/chunks.js";

const locale = document.documentElement.getAttribute("lang") || "en";

loadUiLocale(locale)
  .catch(() => false)
  .then(() => {
    startTransition(() => {
      hydrateRoot(
        document,
        <StrictMode>
          <HydratedRouter />
        </StrictMode>,
      );
    });
  });
