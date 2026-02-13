import { useCallback, useEffect, useState } from "react";

import ExcalidrawApp from "./App";
import { LandingPage } from "./components/LandingPage";
import { AuthPage } from "./components/AuthPage";
import { NotesDashboard } from "./components/NotesDashboard";
import {
  loadDrawingFromCloud,
  getDrawingById,
  saveDrawingToCloud,
  buildFolderPath,
} from "./data/drawingStorage";
import { getCurrentUser, isLoggedIn, logout } from "./data/authService";
import { AdminPanel } from "./components/admin/AdminPanel";
import { StatusPage } from "./components/StatusPage";
import { trackActivity } from "./data/telemetry";

import type { DrawingDocument } from "./data/drawingStorage";
import type { User } from "./data/authService";

// ---------------------------------------------------------------------------
// Route types — folder context is encoded in the URL path, not in state
// ---------------------------------------------------------------------------

type Route =
  | { type: "landing" }
  | { type: "login" }
  | { type: "register" }
  | { type: "notes"; folderPath: string[] }
  | {
      type: "editor";
      drawingId: string;
      folderPath: string[];
      folderId: string;
      drawing?: DrawingDocument;
      initialData?: object;
    }
  | { type: "collab" }
  | { type: "admin"; subPage: string }
  | { type: "status" };

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const navigateTo = (path: string) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const buildNotesUrl = (folderPath: string[]) => {
  if (folderPath.length === 0) {
    return "/notes";
  }
  return "/notes/" + folderPath.map(encodeURIComponent).join("/");
};

const buildDrawingUrl = (folderPath: string[], drawingId: string) => {
  const base = folderPath.length > 0
    ? "/notes/" + folderPath.map(encodeURIComponent).join("/")
    : "/notes";
  return `${base}/drawing/${drawingId}`;
};

// ---------------------------------------------------------------------------
// Route parsing — derives everything from the URL
// ---------------------------------------------------------------------------

const parseRoute = (): Route => {
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Collaboration links use hash: #room=... (no auth required)
  if (hash.startsWith("#room=")) {
    return { type: "collab" };
  }

  // Status page (public)
  if (path === "/status" || path === "/status/") {
    return { type: "status" };
  }

  // Admin routes
  if (path === "/admin" || path === "/admin/") {
    return { type: "admin", subPage: "dashboard" };
  }
  if (path.startsWith("/admin/")) {
    const subPage = path.slice("/admin/".length).replace(/\/$/, "") || "dashboard";
    return { type: "admin", subPage };
  }

  if (path === "/login") {
    return { type: "login" };
  }
  if (path === "/register") {
    return { type: "register" };
  }

  // Everything under /notes/...
  if (path === "/notes" || path === "/notes/") {
    return { type: "notes", folderPath: [] };
  }

  if (path.startsWith("/notes/")) {
    // Strip "/notes/" prefix and decode segments
    const rest = path.slice("/notes/".length).replace(/\/$/, "");
    const segments = rest.split("/").map(decodeURIComponent);

    // Check for /drawing/<id> pattern anywhere in the path
    const drawingIdx = segments.indexOf("drawing");
    if (drawingIdx >= 0 && drawingIdx < segments.length - 1) {
      const drawingId = segments[drawingIdx + 1];
      const folderPath = segments.slice(0, drawingIdx);
      return { type: "editor", drawingId, folderPath, folderId: "" };
    }

    // Legacy URL compat: /notes/<appwriteId> (single segment, 20+ chars, looks like a doc ID)
    if (segments.length === 1 && /^[a-zA-Z0-9._-]{20,}$/.test(segments[0])) {
      return { type: "editor", drawingId: segments[0], folderPath: [], folderId: "" };
    }

    // Otherwise it's a folder path
    return { type: "notes", folderPath: segments };
  }

  return { type: "landing" };
};

// ---------------------------------------------------------------------------
// Router component
// ---------------------------------------------------------------------------

export const AppRouter = () => {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [loadingDrawing, setLoadingDrawing] = useState(false);
  const [user, setUser] = useState<User | null>(getCurrentUser);

  // Listen for popstate (browser back/forward)
  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRoute());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // If route is editor with a drawingId but no data loaded yet, load it
  useEffect(() => {
    if (route.type === "editor" && !route.drawing && !loadingDrawing) {
      setLoadingDrawing(true);
      getDrawingById(route.drawingId)
        .then(async (drawing) => {
          if (!drawing) {
            alert("Drawing not found");
            navigateTo("/notes");
            return;
          }
          let data: object = {};
          try {
            data = await loadDrawingFromCloud(drawing.$id);
          } catch {
            data = {};
          }

          // If the URL didn't have a folder path, reconstruct it from the drawing's folderId
          let folderPath = route.folderPath;
          if (folderPath.length === 0 && drawing.folderId) {
            try {
              folderPath = await buildFolderPath(drawing.folderId);
              // Update the URL to include the folder path
              const correctUrl = buildDrawingUrl(folderPath, drawing.$id);
              window.history.replaceState({}, "", correctUrl);
            } catch {
              // ignore — keep empty path
            }
          }

          setRoute({
            type: "editor",
            drawingId: drawing.$id,
            folderPath,
            folderId: drawing.folderId,
            drawing,
            initialData: data,
          });
        })
        .catch((err) => {
          console.error("Failed to load drawing:", err);
          alert("Failed to load drawing");
          navigateTo("/notes");
        })
        .finally(() => setLoadingDrawing(false));
    }
  }, [route, loadingDrawing]);

  // Auth guard
  useEffect(() => {
    if (
      (route.type === "notes" || route.type === "editor" || route.type === "admin") &&
      !isLoggedIn()
    ) {
      navigateTo("/login");
    }
  }, [route.type]);

  // Track page views
  useEffect(() => {
    if (route.type !== "landing") {
      trackActivity("page_view", {
        resourceType: route.type,
        method: "GET",
      });
    }
  }, [route]);

  const handleAuthSuccess = useCallback((u: User) => {
    setUser(u);
    navigateTo("/notes");
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    navigateTo("/");
  }, []);

  // Create a new drawing — URL includes folder path context
  const handleNewDrawing = useCallback(async (folderId: string, folderPath: string[]) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigateTo("/login");
      return;
    }

    setLoadingDrawing(true);
    try {
      const name = `Untitled ${new Date().toLocaleDateString()}`;
      const emptyScene = {
        type: "excalidraw",
        version: 2,
        elements: [],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {},
      };
      const drawing = await saveDrawingToCloud(
        currentUser.$id,
        name,
        emptyScene,
        folderId,
      );
      const url = buildDrawingUrl(folderPath, drawing.$id);
      window.history.pushState({}, "", url);
      setRoute({
        type: "editor",
        drawingId: drawing.$id,
        folderPath,
        folderId: drawing.folderId,
        drawing,
        initialData: emptyScene,
      });
    } catch (err) {
      console.error("Failed to create drawing:", err);
      alert("Failed to create drawing. Please try again.");
    } finally {
      setLoadingDrawing(false);
    }
  }, []);

  // Open an existing drawing — URL includes folder path context
  const handleOpenDrawing = useCallback(async (drawing: DrawingDocument, folderPath: string[]) => {
    setLoadingDrawing(true);
    try {
      let data: object = {};
      try {
        data = await loadDrawingFromCloud(drawing.$id);
      } catch {
        data = {};
      }
      const url = buildDrawingUrl(folderPath, drawing.$id);
      window.history.pushState({}, "", url);
      setRoute({
        type: "editor",
        drawingId: drawing.$id,
        folderPath,
        folderId: drawing.folderId,
        drawing,
        initialData: data,
      });
    } catch (err) {
      console.error("Failed to load drawing:", err);
      alert("Failed to load drawing. Please try again.");
    } finally {
      setLoadingDrawing(false);
    }
  }, []);

  // Go home = navigate to the folder the drawing was in
  const handleGoHome = useCallback((folderPath: string[]) => {
    navigateTo(buildNotesUrl(folderPath));
  }, []);

  // Loading state
  if (loadingDrawing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#F7F7F8",
          color: "#1B1B1E",
          fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            width: "2.5rem",
            height: "2.5rem",
            border: "2px solid #E4E4E7",
            borderTopColor: "#19789E",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: "0.875rem", color: "#6B7280" }}>
          Loading...
        </span>
      </div>
    );
  }

  // Route rendering
  switch (route.type) {
    case "landing":
      return (
        <LandingPage
          onGetStarted={() => navigateTo(isLoggedIn() ? "/notes" : "/register")}
          onLogin={() => navigateTo(isLoggedIn() ? "/notes" : "/login")}
        />
      );

    case "login":
      if (isLoggedIn()) {
        navigateTo("/notes");
        return null;
      }
      return (
        <AuthPage
          initialMode="login"
          onSuccess={handleAuthSuccess}
          onGoHome={() => navigateTo("/")}
        />
      );

    case "register":
      if (isLoggedIn()) {
        navigateTo("/notes");
        return null;
      }
      return (
        <AuthPage
          initialMode="register"
          onSuccess={handleAuthSuccess}
          onGoHome={() => navigateTo("/")}
        />
      );

    case "notes":
      if (!isLoggedIn()) {
        navigateTo("/login");
        return null;
      }
      return (
        <NotesDashboard
          folderPath={route.folderPath}
          onNewDrawing={handleNewDrawing}
          onOpenDrawing={handleOpenDrawing}
          onLogout={handleLogout}
          onNavigate={navigateTo}
        />
      );

    case "editor":
      if (!route.drawing || !route.initialData) {
        return null;
      }
      return (
        <ExcalidrawApp
          key={route.drawing.$id}
          drawing={route.drawing}
          folderId={route.folderId}
          initialCloudData={route.initialData}
          onGoHome={() => handleGoHome(route.folderPath)}
        />
      );

    // Collaboration mode — no auth required, full Excalidraw with collab
    case "collab":
      return (
        <ExcalidrawApp key="collab" />
      );

    case "status":
      return (
        <StatusPage onBackToApp={() => navigateTo("/")} />
      );

    case "admin": {
      if (!isLoggedIn()) {
        navigateTo("/login");
        return null;
      }
      const subPageMap: Record<string, "dashboard" | "users" | "drawings" | "errors" | "activity"> = {
        dashboard: "dashboard",
        users: "users",
        drawings: "drawings",
        errors: "errors",
        activity: "activity",
      };
      return (
        <AdminPanel
          initialPage={subPageMap[route.subPage] ?? "dashboard"}
          onNavigate={navigateTo}
          onBackToApp={() => navigateTo("/notes")}
        />
      );
    }

    default:
      return null;
  }
};
