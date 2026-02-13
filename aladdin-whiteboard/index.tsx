import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

import { AppRouter } from "./AppRouter";
import { initTelemetry } from "./data/telemetry";

// Initialize error tracking & activity logging
initTelemetry();

// ---------------------------------------------------------------------------
// Prevent browser page zoom everywhere (Ctrl/Cmd+Wheel and Ctrl/Cmd+±/0).
// Excalidraw's canvas handles its own zoom internally via a lower-level
// handler, so canvas zoom continues to work as expected.
// ---------------------------------------------------------------------------
document.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  },
  { passive: false },
);

document.addEventListener("keydown", (e) => {
  if (
    (e.ctrlKey || e.metaKey) &&
    (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
  ) {
    // Allow Ctrl+0 to reset zoom only when focus is on the canvas
    // (Excalidraw handles it), block it everywhere else.
    const target = e.target as HTMLElement | null;
    const isCanvas =
      target?.tagName === "CANVAS" ||
      !!target?.closest(".excalidraw-canvas");
    if (!isCanvas) {
      e.preventDefault();
    }
  }
});

window.__EXCALIDRAW_SHA__ = import.meta.env.VITE_APP_GIT_SHA;
const rootElement = document.getElementById("root")!;
const root = createRoot(rootElement);
registerSW();
root.render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
