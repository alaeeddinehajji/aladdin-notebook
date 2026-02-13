import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "pending" | "ok" | "error";

type HealthCheck = {
  name: string;
  status: CheckStatus;
  latency: number; // ms
  message: string;
};

type StatusData = {
  timestamp: string;
  environment: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    pending: number;
  };
  config: {
    appwriteEndpoint: string;
    projectConfigured: boolean;
    databaseConfigured: boolean;
    adminPinConfigured: boolean;
    pwaEnabled: boolean;
  };
  clientControls: {
    cookies: string;
  };
  buildVersion: string;
};

// ---------------------------------------------------------------------------
// Health check runner
// ---------------------------------------------------------------------------

const runChecks = async (): Promise<StatusData> => {
  const endpoint =
    import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
  const projectId = import.meta.env.VITE_APPWRITE_PROJECT_ID || "";
  const dbId =
    import.meta.env.VITE_APPWRITE_DATABASE_ID || "aladdin-notes-db";

  const checks: HealthCheck[] = [];

  // 1. Appwrite connectivity
  {
    const start = performance.now();
    const candidates = ["/health", "/health/version"];
    let reported = false;

    for (const path of candidates) {
      try {
        const res = await fetch(`${endpoint}${path}`, {
          method: "GET",
          headers: { "X-Appwrite-Project": projectId },
          signal: AbortSignal.timeout(8000),
        });
        const latency = Math.round(performance.now() - start);

        // Any HTTP response means the API is reachable; auth may be required.
        checks.push({
          name: "Appwrite API Reachable",
          status: "ok",
          latency,
          message: `HTTP ${res.status} ${res.statusText}`.trim(),
        });
        reported = true;
        break;
      } catch (err) {
        // Try next candidate
      }
    }

    if (!reported) {
      checks.push({
        name: "Appwrite API Reachable",
        status: "error",
        latency: Math.round(performance.now() - start),
        message: "Failed to reach Appwrite health endpoints",
      });
    }
  }

  // Helper: check a collection via raw REST API (avoids Appwrite SDK BigNumber bug)
  const checkCollection = async (name: string, collectionId: string) => {
    const start = performance.now();
    try {
      const url = `${endpoint}/databases/${dbId}/collections/${collectionId}/documents?queries[]=${encodeURIComponent(JSON.stringify({ method: "limit", values: [1] }))}`;
      const res = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          "X-Appwrite-Project": projectId,
        },
        signal: AbortSignal.timeout(10000),
      });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        const json = await res.json();
        checks.push({
          name,
          status: "ok",
          latency,
          message: `Readable (${json.total} total documents)`,
        });
      } else {
        const text = await res.text().catch(() => "");
        let msg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.message) msg = parsed.message;
        } catch { /* use default */ }
        checks.push({ name, status: "error", latency, message: msg });
      }
    } catch (err: any) {
      checks.push({
        name,
        status: "error",
        latency: Math.round(performance.now() - start),
        message: err?.message || "Network error",
      });
    }
  };

  // 2. Check all collections via raw REST (no SDK, no BigNumber)
  const collections = [
    ["Database: Users Collection", "users"],
    ["Database: Drawings Collection", "drawings"],
    ["Database: Folders Collection", "folders"],
    ["Database: Drawing Data Collection", "drawing_data"],
    ["Database: Error Logs Collection", "error_logs"],
    ["Database: Activity Logs Collection", "activity_logs"],
    ["Database: Scenes Collection", "scenes"],
    ["Database: Version Snapshots Collection", "version_snapshots"],
  ];

  for (const [name, id] of collections) {
    await checkCollection(name, id);
  }

  // 11. LocalStorage available
  {
    const start = performance.now();
    try {
      localStorage.setItem("__status_test__", "1");
      localStorage.removeItem("__status_test__");
      checks.push({
        name: "LocalStorage",
        status: "ok",
        latency: Math.round(performance.now() - start),
        message: "Read/write OK",
      });
    } catch (err: any) {
      checks.push({
        name: "LocalStorage",
        status: "error",
        latency: Math.round(performance.now() - start),
        message: err?.message || "Not available",
      });
    }
  }

  // 12. Crypto API (needed for password hashing)
  {
    const start = performance.now();
    try {
      const enc = new TextEncoder().encode("test");
      await crypto.subtle.digest("SHA-256", enc);
      checks.push({
        name: "Web Crypto API",
        status: "ok",
        latency: Math.round(performance.now() - start),
        message: "SHA-256 digest OK",
      });
    } catch (err: any) {
      checks.push({
        name: "Web Crypto API",
        status: "error",
        latency: Math.round(performance.now() - start),
        message: err?.message || "Not available (login will fail)",
      });
    }
  }

  const passed = checks.filter((c) => c.status === "ok").length;
  const failed = checks.filter((c) => c.status === "error").length;
  const pending = checks.filter((c) => c.status === "pending").length;

  // Mask sensitive parts of endpoint
  const maskedEndpoint = endpoint.replace(
    /^(https?:\/\/[^/]+)(.*)$/,
    "$1/...",
  );

  return {
    timestamp: new Date().toISOString(),
    environment: import.meta.env.MODE || "unknown",
    checks,
    summary: { total: checks.length, passed, failed, pending },
    config: {
      appwriteEndpoint: maskedEndpoint,
      projectConfigured: !!projectId,
      databaseConfigured: !!dbId,
      adminPinConfigured: !!import.meta.env.VITE_ADMIN_SECRET_PIN,
      pwaEnabled: import.meta.env.VITE_APP_ENABLE_PWA === "true",
    },
    clientControls: {
      cookies: document.cookie || "(none)",
    },
    buildVersion: import.meta.env.VITE_APP_GIT_SHA || "dev",
  };
};

// ---------------------------------------------------------------------------
// Styles (inline to keep it self-contained)
// ---------------------------------------------------------------------------

const styles = {
  page: {
    height: "100vh",
    overflowY: "auto",
    background: "#0f1117",
    color: "#e4e4e7",
    fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace",
    padding: "2rem",
    boxSizing: "border-box",
  } as React.CSSProperties,
  container: {
    maxWidth: 800,
    margin: "0 auto",
    paddingBottom: "3rem",
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "2rem",
    flexWrap: "wrap" as const,
    gap: "1rem",
  } as React.CSSProperties,
  title: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  } as React.CSSProperties,
  badge: (allOk: boolean) =>
    ({
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: 9999,
      fontSize: "0.75rem",
      fontWeight: 600,
      background: allOk ? "#16a34a22" : "#ef444422",
      color: allOk ? "#4ade80" : "#f87171",
      border: `1px solid ${allOk ? "#16a34a44" : "#ef444444"}`,
    }) as React.CSSProperties,
  meta: {
    fontSize: "0.75rem",
    color: "#6b7280",
    marginBottom: "1.5rem",
    display: "flex",
    gap: "2rem",
    flexWrap: "wrap" as const,
  } as React.CSSProperties,
  section: {
    background: "#1a1d27",
    borderRadius: 10,
    border: "1px solid #2d2d30",
    overflow: "hidden",
    marginBottom: "1.5rem",
  } as React.CSSProperties,
  sectionTitle: {
    padding: "0.75rem 1.25rem",
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "#a1a1aa",
    borderBottom: "1px solid #2d2d30",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  } as React.CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    padding: "0.625rem 1.25rem",
    borderBottom: "1px solid #1f2230",
    gap: "0.75rem",
    fontSize: "0.8125rem",
  } as React.CSSProperties,
  dot: (status: CheckStatus) =>
    ({
      width: 10,
      height: 10,
      borderRadius: "50%",
      flexShrink: 0,
      background:
        status === "ok"
          ? "#4ade80"
          : status === "error"
            ? "#f87171"
            : "#fbbf24",
      boxShadow:
        status === "ok"
          ? "0 0 6px #4ade8066"
          : status === "error"
            ? "0 0 6px #f8717166"
            : "0 0 6px #fbbf2466",
    }) as React.CSSProperties,
  checkName: {
    flex: 1,
    color: "#e4e4e7",
  } as React.CSSProperties,
  checkMsg: {
    color: "#6b7280",
    fontSize: "0.75rem",
    maxWidth: 280,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as React.CSSProperties,
  latency: {
    color: "#6b7280",
    fontSize: "0.6875rem",
    minWidth: 50,
    textAlign: "right" as const,
  } as React.CSSProperties,
  configRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0.5rem 1.25rem",
    borderBottom: "1px solid #1f2230",
    fontSize: "0.8125rem",
  } as React.CSSProperties,
  configLabel: {
    color: "#a1a1aa",
  } as React.CSSProperties,
  configVal: (ok: boolean) =>
    ({
      color: ok ? "#4ade80" : "#f87171",
      fontWeight: 600,
    }) as React.CSSProperties,
  chipLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 9999,
    background: "#11121a",
    border: "1px solid #1f2230",
    color: "#9ca3af",
    fontSize: "0.75rem",
  } as React.CSSProperties,
  buttonRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
    padding: "0.75rem 1.25rem",
    borderBottom: "1px solid #1f2230",
  } as React.CSSProperties,
  btnGhost: {
    padding: "0.5rem 1rem",
    background: "#1f2230",
    color: "#e4e4e7",
    border: "1px solid #2d2d30",
    borderRadius: 6,
    fontSize: "0.8125rem",
    cursor: "pointer",
    fontFamily: "inherit",
  } as React.CSSProperties,
  btn: {
    padding: "0.5rem 1rem",
    background: "#19789e",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    fontSize: "0.8125rem",
    cursor: "pointer",
    fontFamily: "inherit",
  } as React.CSSProperties,
  link: {
    color: "#19789e",
    textDecoration: "none",
    fontSize: "0.8125rem",
    cursor: "pointer",
  } as React.CSSProperties,
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    flexDirection: "column" as const,
    gap: "1rem",
    color: "#6b7280",
    fontSize: "0.875rem",
  } as React.CSSProperties,
  spinner: {
    width: 24,
    height: 24,
    border: "2px solid #2d2d30",
    borderTopColor: "#19789e",
    borderRadius: "50%",
    animation: "status-spin 0.6s linear infinite",
  } as React.CSSProperties,
  footer: {
    textAlign: "center" as const,
    padding: "2rem 0 1rem",
    fontSize: "0.75rem",
    color: "#3f3f46",
  } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StatusPage = ({ onBackToApp }: { onBackToApp: () => void }) => {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const result = await runChecks();
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
  }, []);

  // Client actions

  const handleClearLocalStorage = () => {
    try {
      localStorage.clear();
      setActionMessage("LocalStorage cleared");
      run();
    } catch (err: any) {
      setActionMessage(err?.message || "Failed to clear LocalStorage");
    }
  };

  const handleClearSessionStorage = () => {
    try {
      sessionStorage.clear();
      setActionMessage("SessionStorage cleared");
      run();
    } catch (err: any) {
      setActionMessage(err?.message || "Failed to clear SessionStorage");
    }
  };

  const handleRefreshPage = () => {
    try {
      window.location.reload();
    } catch (err: any) {
      setActionMessage(err?.message || "Failed to refresh");
    }
  };

  const handleClearCookies = () => {
    try {
      document.cookie
        .split(";")
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((cookie) => {
          const eq = cookie.indexOf("=");
          const name = eq > -1 ? cookie.slice(0, eq) : cookie;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        });
      setActionMessage("Cookies cleared");
      run();
    } catch (err: any) {
      setActionMessage(err?.message || "Failed to clear cookies");
    }
  };

  const handleClearPWAData = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      setActionMessage("PWA data cleared (service workers + caches)");
      run();
    } catch (err: any) {
      setActionMessage(err?.message || "Failed to clear PWA data");
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <style>{`@keyframes status-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={styles.loading}>
          <div style={styles.spinner} />
          Running health checks...
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <p>Failed to run health checks.</p>
          <button style={styles.btn} onClick={run}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const allOk = data.summary.failed === 0;

  return (
    <div style={styles.page}>
      <style>{`@keyframes status-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.title}>
            <span style={{ fontSize: "1.75rem" }}>{allOk ? "●" : "●"}</span>
            <span>Aladdin Notes — System Status</span>
            <span style={styles.badge(allOk)}>
              {allOk ? "ALL SYSTEMS OPERATIONAL" : `${data.summary.failed} ISSUE${data.summary.failed > 1 ? "S" : ""} DETECTED`}
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button style={styles.btn} onClick={run}>
              Re-check
            </button>
            <button
              style={{ ...styles.btn, background: "#2d2d30" }}
              onClick={onBackToApp}
            >
              ← App
            </button>
          </div>
        </div>

        {/* Meta */}
        <div style={styles.meta}>
          <span>Checked: {new Date(data.timestamp).toLocaleString()}</span>
          <span>Environment: {data.environment}</span>
          <span>Build: {data.buildVersion}</span>
          <span>
            Passed: {data.summary.passed}/{data.summary.total}
          </span>
        </div>

        {/* Health Checks */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Health Checks</div>
          {data.checks.map((check, i) => (
            <div
              key={i}
              style={{
                ...styles.row,
                borderBottom:
                  i === data.checks.length - 1 ? "none" : styles.row.borderBottom,
              }}
            >
              <div style={styles.dot(check.status)} />
              <div style={styles.checkName}>{check.name}</div>
              <div style={styles.checkMsg} title={check.message}>
                {check.message}
              </div>
              <div style={styles.latency}>{check.latency}ms</div>
            </div>
          ))}
        </div>

        {/* Configuration */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Configuration</div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Appwrite Endpoint</span>
            <span style={{ color: "#e4e4e7" }}>{data.config.appwriteEndpoint}</span>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Project ID Configured</span>
            <span style={styles.configVal(data.config.projectConfigured)}>
              {data.config.projectConfigured ? "Yes" : "No"}
            </span>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Database ID Configured</span>
            <span style={styles.configVal(data.config.databaseConfigured)}>
              {data.config.databaseConfigured ? "Yes" : "No"}
            </span>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Admin PIN Configured</span>
            <span style={styles.configVal(data.config.adminPinConfigured)}>
              {data.config.adminPinConfigured ? "Yes" : "No"}
            </span>
          </div>
          <div
            style={{
              ...styles.configRow,
              borderBottom: "none",
            }}
          >
            <span style={styles.configLabel}>PWA Enabled</span>
            <span style={{ color: "#e4e4e7" }}>
              {data.config.pwaEnabled ? "Yes" : "No"}
            </span>
          </div>
        </div>

        {/* Browser Info */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Client Info</div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>User Agent</span>
            <span
              style={{
                color: "#6b7280",
                fontSize: "0.6875rem",
                maxWidth: 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={navigator.userAgent}
            >
              {navigator.userAgent.slice(0, 80)}...
            </span>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Language</span>
            <span style={{ color: "#e4e4e7" }}>{navigator.language}</span>
          </div>
          <div style={styles.configRow}>
            <span style={styles.configLabel}>Online</span>
            <span style={styles.configVal(navigator.onLine)}>
              {navigator.onLine ? "Yes" : "No"}
            </span>
          </div>
          <div
            style={{
              ...styles.configRow,
              borderBottom: "none",
            }}
          >
            <span style={styles.configLabel}>Screen</span>
            <span style={{ color: "#e4e4e7" }}>
              {window.screen.width}x{window.screen.height} @{" "}
              {window.devicePixelRatio}x
            </span>
          </div>
        </div>

        {/* Client Controls */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Client Controls</div>
          <div style={{ ...styles.configRow, alignItems: "flex-start", flexDirection: "column", gap: "0.35rem" }}>
            <span style={styles.configLabel}>Cookies</span>
            <span
              style={{ ...styles.chipLabel, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={data.clientControls.cookies}
            >
              {data.clientControls.cookies}
            </span>
          </div>
          <div style={styles.buttonRow}>
            <button style={styles.btnGhost} onClick={handleClearCookies}>
              Clear Cookies
            </button>
            <button style={{ ...styles.btnGhost, background: "#1b2331", borderColor: "#2f3c52" }} onClick={handleClearLocalStorage}>
              Clear LocalStorage
            </button>
            <button style={{ ...styles.btnGhost, background: "#1b2331", borderColor: "#2f3c52" }} onClick={handleClearSessionStorage}>
              Clear SessionStorage
            </button>
          </div>
          <div style={{ ...styles.buttonRow, borderBottom: "none" }}>
            <button style={{ ...styles.btnGhost, background: "#2b2440", borderColor: "#3c3258" }} onClick={handleClearPWAData}>
              PWA: Clear SW + Caches
            </button>
            <button style={{ ...styles.btnGhost, background: "#1f2a3d", borderColor: "#30425c" }} onClick={handleRefreshPage}>
              PWA: Refresh App
            </button>
            {actionMessage ? (
              <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>{actionMessage}</span>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          Aladdin Notes Status Page — No sensitive data is exposed on this page.
        </div>
      </div>
    </div>
  );
};
