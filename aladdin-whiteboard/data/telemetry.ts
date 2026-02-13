import { Client, Databases, ID, Permission, Role } from "appwrite";

// Read user from localStorage directly to avoid circular dependency with authService
const SESSION_KEY = "aladdin_notes_session";
const getSessionUser = (): { $id: string } | null => {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Appwrite client (separate from main app to avoid circular deps)
// ---------------------------------------------------------------------------

let client: Client | null = null;
let databases: Databases | null = null;

const getClient = () => {
  if (!client) {
    client = new Client()
      .setEndpoint(
        import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1",
      )
      .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || "");
  }
  return client;
};

const getDatabases = () => {
  if (!databases) {
    databases = new Databases(getClient());
  }
  return databases;
};

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "aladdin-notes-db";

const DOC_PERMISSIONS = [
  Permission.read(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
];

// ---------------------------------------------------------------------------
// Browser / OS parsing
// ---------------------------------------------------------------------------

const parseBrowser = (ua: string): string => {
  if (/Edg\//i.test(ua)) {
    return "Edge " + (ua.match(/Edg\/([\d.]+)/)?.[1] ?? "");
  }
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) {
    return "Opera " + (ua.match(/OPR\/([\d.]+)/)?.[1] ?? "");
  }
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    return "Chrome " + (ua.match(/Chrome\/([\d.]+)/)?.[1] ?? "");
  }
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    return "Safari " + (ua.match(/Version\/([\d.]+)/)?.[1] ?? "");
  }
  if (/Firefox\//i.test(ua)) {
    return "Firefox " + (ua.match(/Firefox\/([\d.]+)/)?.[1] ?? "");
  }
  return "Unknown";
};

const parseOS = (ua: string): string => {
  if (/Windows NT 10/i.test(ua)) return "Windows 10/11";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) {
    const ver = ua.match(/Mac OS X ([\d_.]+)/)?.[1]?.replace(/_/g, ".");
    return `macOS ${ver ?? ""}`.trim();
  }
  if (/Android/i.test(ua)) {
    return "Android " + (ua.match(/Android ([\d.]+)/)?.[1] ?? "");
  }
  if (/iPhone|iPad/i.test(ua)) {
    const ver = ua.match(/OS ([\d_]+)/)?.[1]?.replace(/_/g, ".");
    return `iOS ${ver ?? ""}`.trim();
  }
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
};

// ---------------------------------------------------------------------------
// IP detection (cached per session)
// ---------------------------------------------------------------------------

let cachedIp: string | null = null;
let ipFetchPromise: Promise<string> | null = null;

const getClientIp = async (): Promise<string> => {
  if (cachedIp) return cachedIp;
  if (ipFetchPromise) return ipFetchPromise;

  ipFetchPromise = fetch("https://api.ipify.org?format=json")
    .then((r) => r.json())
    .then((data: { ip: string }) => {
      cachedIp = data.ip;
      return data.ip;
    })
    .catch(() => {
      cachedIp = "";
      return "";
    });

  return ipFetchPromise;
};

// ---------------------------------------------------------------------------
// Shared context builder
// ---------------------------------------------------------------------------

const buildContext = async () => {
  const ua = navigator.userAgent;
  const user = getSessionUser();
  const ip = await getClientIp();

  return {
    userId: user?.$id ?? "",
    userAgent: ua.slice(0, 500),
    browser: parseBrowser(ua).slice(0, 100),
    os: parseOS(ua).slice(0, 100),
    ip: ip.slice(0, 45),
    url: window.location.href.slice(0, 2000),
  };
};

// ---------------------------------------------------------------------------
// Error log queue + flush
// ---------------------------------------------------------------------------

type ErrorEntry = {
  userId: string;
  level: string;
  message: string;
  stack: string;
  source: string;
  url: string;
  userAgent: string;
  browser: string;
  os: string;
  ip: string;
  timestamp: string;
  metadata: string;
};

type ActivityEntry = {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  method: string;
  url: string;
  requestSize: number;
  responseSize: number;
  responseTime: number;
  statusCode: number;
  success: boolean;
  userAgent: string;
  browser: string;
  os: string;
  ip: string;
  location: string;
  timestamp: string;
  metadata: string;
};

const errorQueue: ErrorEntry[] = [];
const activityQueue: ActivityEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

const flushQueues = async () => {
  if (isFlushing) return;
  isFlushing = true;

  try {
    const db = getDatabases();

    // Flush errors
    while (errorQueue.length > 0) {
      const entry = errorQueue.shift()!;
      try {
        await db.createDocument(DB_ID, "error_logs", ID.unique(), entry, DOC_PERMISSIONS);
      } catch {
        // silently drop — never block UI
      }
    }

    // Flush activities
    while (activityQueue.length > 0) {
      const entry = activityQueue.shift()!;
      try {
        await db.createDocument(DB_ID, "activity_logs", ID.unique(), entry, DOC_PERMISSIONS);
      } catch {
        // silently drop
      }
    }
  } catch {
    // ignore
  } finally {
    isFlushing = false;
  }
};

const scheduleFlush = () => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushQueues();
  }, 5000);
};

// ---------------------------------------------------------------------------
// Public API: log error
// ---------------------------------------------------------------------------

export const logError = async (
  level: "error" | "warn" | "info",
  message: string,
  opts: {
    stack?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  } = {},
) => {
  try {
    const ctx = await buildContext();
    errorQueue.push({
      ...ctx,
      level,
      message: message.slice(0, 65000),
      stack: (opts.stack ?? "").slice(0, 100000),
      source: (opts.source ?? "js_error").slice(0, 50),
      timestamp: new Date().toISOString(),
      metadata: opts.metadata ? JSON.stringify(opts.metadata).slice(0, 100000) : "",
    });
    scheduleFlush();
  } catch {
    // never throw
  }
};

// ---------------------------------------------------------------------------
// Public API: track activity
// ---------------------------------------------------------------------------

export type TrackActivityOptions = {
  resourceType?: string;
  resourceId?: string;
  method?: string;
  requestSize?: number;
  responseSize?: number;
  responseTime?: number;
  statusCode?: number;
  success?: boolean;
  location?: string;
  metadata?: Record<string, unknown>;
};

export const trackActivity = async (
  action: string,
  opts: TrackActivityOptions = {},
) => {
  try {
    const ctx = await buildContext();
    if (!ctx.userId) return; // don't track anonymous

    activityQueue.push({
      userId: ctx.userId,
      action: action.slice(0, 100),
      resourceType: (opts.resourceType ?? "").slice(0, 50),
      resourceId: (opts.resourceId ?? "").slice(0, 255),
      method: (opts.method ?? "").slice(0, 10),
      url: ctx.url,
      requestSize: opts.requestSize ?? 0,
      responseSize: opts.responseSize ?? 0,
      responseTime: opts.responseTime ?? 0,
      statusCode: opts.statusCode ?? 200,
      success: opts.success !== false,
      userAgent: ctx.userAgent,
      browser: ctx.browser,
      os: ctx.os,
      ip: ctx.ip,
      location: (opts.location ?? "").slice(0, 255),
      timestamp: new Date().toISOString(),
      metadata: opts.metadata ? JSON.stringify(opts.metadata).slice(0, 100000) : "",
    });
    scheduleFlush();
  } catch {
    // never throw
  }
};

// ---------------------------------------------------------------------------
// Global error handlers — call once at app startup
// ---------------------------------------------------------------------------

let initialized = false;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export const initTelemetry = () => {
  if (initialized) return;
  initialized = true;

  // Unhandled JS errors
  window.addEventListener("error", (event) => {
    logError("error", event.message || "Unknown error", {
      source: "js_error",
      stack: event.error?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  // Unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    const msg =
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason);
    logError("error", msg, {
      source: "unhandled_rejection",
      stack: event.reason instanceof Error ? event.reason.stack : "",
    });
  });

  // Intercept console.error
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args);
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logError("error", msg.slice(0, 65000), { source: "console" });
  };

  // Intercept console.warn
  console.warn = (...args: unknown[]) => {
    originalConsoleWarn.apply(console, args);
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    logError("warn", msg.slice(0, 65000), { source: "console" });
  };

  // Flush on page unload
  window.addEventListener("beforeunload", () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    // Best-effort sync flush via sendBeacon is not possible with Appwrite SDK,
    // so we do a fire-and-forget flush
    flushQueues();
  });

  // Pre-fetch IP
  getClientIp();
};
