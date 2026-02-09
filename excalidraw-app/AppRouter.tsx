import { useCallback, useEffect, useState } from "react";

import ExcalidrawApp from "./App";
import { LandingPage } from "./components/LandingPage";
import { AuthPage } from "./components/AuthPage";
import { NotesDashboard } from "./components/NotesDashboard";
import {
  loadDrawingFromCloud,
  getDrawingById,
  saveDrawingToCloud,
} from "./data/drawingStorage";
import { getCurrentUser, isLoggedIn, logout } from "./data/authService";

import type { DrawingDocument } from "./data/drawingStorage";
import type { User } from "./data/authService";

type Route =
  | { type: "landing" }
  | { type: "login" }
  | { type: "register" }
  | { type: "notes" }
  | {
      type: "editor";
      drawingId: string;
      folderId: string;
      drawing?: DrawingDocument;
      initialData?: object;
    }
  | {
      type: "collab";
    };

const navigateTo = (path: string) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const parseRoute = (): Route => {
  const path = window.location.pathname;
  const hash = window.location.hash;

  // Collaboration links use hash: #room=... (no auth required)
  if (hash.startsWith("#room=")) {
    return { type: "collab" };
  }

  if (path === "/login") {
    return { type: "login" };
  }
  if (path === "/register") {
    return { type: "register" };
  }
  if (path === "/notes" || path === "/notes/") {
    return { type: "notes" };
  }
  // /notes/:drawingId
  const drawingMatch = path.match(/^\/notes\/([a-zA-Z0-9._-]+)$/);
  if (drawingMatch) {
    return { type: "editor", drawingId: drawingMatch[1], folderId: "" };
  }

  return { type: "landing" };
};

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
            // Drawing doesn't exist yet in DB — this is a fresh drawing
            // (could happen if someone navigates directly to /notes/someId)
            alert("Drawing not found");
            navigateTo("/notes");
            return;
          }
          let data: object = {};
          try {
            data = await loadDrawingFromCloud(drawing.$id);
          } catch {
            // Data might not exist yet (just created), use empty scene
            data = {};
          }
          setRoute({
            type: "editor",
            drawingId: drawing.$id,
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

  // Auth guard: redirect to login if trying to access /notes without being logged in
  // Note: collab routes don't require auth
  useEffect(() => {
    if (
      (route.type === "notes" || route.type === "editor") &&
      !isLoggedIn()
    ) {
      navigateTo("/login");
    }
  }, [route.type]);

  const handleAuthSuccess = useCallback((u: User) => {
    setUser(u);
    navigateTo("/notes");
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    navigateTo("/");
  }, []);

  // Create a new drawing immediately in Appwrite, then navigate to /notes/:id
  const handleNewDrawing = useCallback(async (folderId: string) => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      navigateTo("/login");
      return;
    }

    setLoadingDrawing(true);
    try {
      const name = `Untitled ${new Date().toLocaleDateString()}`;
      // Create an empty drawing document with an empty scene
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
      // Navigate to the permanent URL
      window.history.pushState({}, "", `/notes/${drawing.$id}`);
      setRoute({
        type: "editor",
        drawingId: drawing.$id,
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

  const handleOpenDrawing = useCallback(async (drawing: DrawingDocument) => {
    setLoadingDrawing(true);
    try {
      let data: object = {};
      try {
        data = await loadDrawingFromCloud(drawing.$id);
      } catch {
        data = {};
      }
      window.history.pushState({}, "", `/notes/${drawing.$id}`);
      setRoute({
        type: "editor",
        drawingId: drawing.$id,
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

  const handleGoHome = useCallback(() => {
    navigateTo("/notes");
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
          onNewDrawing={handleNewDrawing}
          onOpenDrawing={handleOpenDrawing}
          onLogout={handleLogout}
        />
      );

    case "editor":
      if (!route.drawing || !route.initialData) {
        // Still loading
        return null;
      }
      return (
        <ExcalidrawApp
          key={route.drawing.$id}
          drawing={route.drawing}
          folderId={route.folderId}
          initialCloudData={route.initialData}
          onGoHome={handleGoHome}
        />
      );

    // Collaboration mode — no auth required, full Excalidraw with collab
    case "collab":
      return (
        <ExcalidrawApp key="collab" />
      );

    default:
      return null;
  }
};
