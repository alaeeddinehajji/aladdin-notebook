/**
 * Debug utility — controlled by VITE_APP_DEBUG env variable.
 * When enabled, all app errors and key operations are logged
 * to the browser console with full stack traces.
 */

export const DEBUG = import.meta.env.VITE_APP_DEBUG === "true";

export const dbg = {
  log: (...args: unknown[]) => {
    if (DEBUG) console.log("[DEBUG]", ...args);
  },
  warn: (...args: unknown[]) => {
    if (DEBUG) console.warn("[DEBUG]", ...args);
  },
  error: (...args: unknown[]) => {
    if (DEBUG) console.error("[DEBUG]", ...args);
  },
  /** Log an error with full details — always prints in debug mode */
  trace: (label: string, err: unknown) => {
    if (!DEBUG) return;
    console.group(`[DEBUG] ${label}`);
    if (err instanceof Error) {
      console.error("Message:", err.message);
      console.error("Name:", err.name);
      console.error("Stack:", err.stack);
      // Log any extra properties (e.g. Appwrite response, code, type)
      const extra = Object.entries(err).filter(
        ([k]) => !["message", "name", "stack"].includes(k),
      );
      if (extra.length > 0) {
        console.error("Extra:", Object.fromEntries(extra));
      }
    } else {
      console.error("Value:", err);
    }
    console.groupEnd();
  },
};
