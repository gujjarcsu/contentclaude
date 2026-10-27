/**
 * Incident 2026-10-28 — errors no route boundary handled fell through to React
 * Router's built-in "Application Error" page: an empty pink box, no way forward.
 * The root now has its own boundary. Pin that it renders, offers a reload, and
 * never shows the error's message (that is logged server-side instead).
 */
import * as React from "react";
import { it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { ErrorBoundary } from "../../app/root.jsx";

globalThis.React = React; // root.jsx is compiled with the classic JSX runtime under vitest

const render = (error) => {
  const Stub = createRoutesStub([{ id: "r", path: "/", Component: () => null, ErrorBoundary }]);
  return renderToString(React.createElement(Stub, { initialEntries: ["/"], hydrationData: { errors: { r: error } } }))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
};

it("an unexpected error renders a retry screen, not the empty default page", () => {
  const text = render(new Error("internal-detail-that-must-not-leak"));
  expect(text).toContain("Something went wrong");
  expect(text).toContain("Reload");
  expect(text).toContain("hello@navaal.ai");
  expect(text).not.toContain("Application Error");
  expect(text).not.toContain("internal-detail-that-must-not-leak");
});

it("a 404 says so and offers no pointless reload", () => {
  const text = render({ status: 404, statusText: "Not Found", internal: true, data: "", __isRouteErrorResponse: true });
  expect(text).toContain("Page not found");
  expect(text).not.toContain("Reload");
});
