import {
  Excalidraw,
  TTDDialogTrigger,
  CaptureUpdateAction,
  reconcileElements,
} from "@excalidraw/excalidraw";
import { trackEvent } from "@excalidraw/excalidraw/analytics";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { openConfirmModal } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirmState";
import Trans from "@excalidraw/excalidraw/components/Trans";
import {
  APP_NAME,
  EVENT,
  THEME,
  VERSION_TIMEOUT,
  debounce,
  getVersion,
  getFrame,
  isTestEnv,
  preventUnload,
  resolvablePromise,
  isRunningInIframe,
  isDevEnv,
  DEFAULT_SIDEBAR,
  CANVAS_SEARCH_TAB,
  LIBRARY_SIDEBAR_TAB,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { useCallbackRefState } from "@excalidraw/excalidraw/hooks/useCallbackRefState";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  usersIcon,
  share,
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import clsx from "clsx";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import {
  Provider,
  useAtom,
  useAtomValue,
  useAtomWithInitialValue,
  appJotaiStore,
} from "./app-jotai";
import {
  saveDrawingToCloud,
  createVersionSnapshot,
  deleteOldSnapshots,
} from "./data/drawingStorage";
import { getCurrentUser } from "./data/authService";
import { toast, ToastContainer } from "./components/Toast";
import { VersionHistoryPanel } from "./components/VersionHistoryPanel";

import type { DrawingDocument } from "./data/drawingStorage";
import {
  STORAGE_PREFIXES,
  STORAGE_KEYS,
  SYNC_BROWSER_TABS_TIMEOUT,
} from "./app_constants";
import Collab, {
  collabAPIAtom,
  isCollaboratingAtom,
  isOfflineAtom,
} from "./collab/Collab";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import {
  getCollaborationLinkData,
  isCollaborationLink,
} from "./data";

import { updateStaleImageStatuses } from "./data/FileManager";
import {
  importFromLocalStorage,
  importUsernameFromLocalStorage,
} from "./data/localStorage";

import { loadFilesFromAppwrite } from "./data/appwrite";
import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import { ShareDialog, shareDialogStateAtom } from "./share/ShareDialog";
import CollabError, { collabErrorIndicatorAtom } from "./collab/CollabError";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";
import "./index.scss";
import { AppSidebar } from "./components/AppSidebar";

import type { CollabAPI } from "./collab/Collab";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

declare global {
  interface BeforeInstallPromptEventChoiceResult {
    outcome: "accepted" | "dismissed";
  }

  interface BeforeInstallPromptEvent extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<BeforeInstallPromptEventChoiceResult>;
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let pwaEvent: BeforeInstallPromptEvent | null = null;

// Adding a listener outside of the component as it may (?) need to be
// subscribed early to catch the event.
//
// Also note that it will fire only if certain heuristics are met (user has
// used the app for some time, etc.)
window.addEventListener(
  "beforeinstallprompt",
  (event: BeforeInstallPromptEvent) => {
    // prevent Chrome <= 67 from automatically showing the prompt
    event.preventDefault();
    // cache for later use
    pwaEvent = event;
  },
);

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const shareableLinkConfirmDialog = {
  title: t("overwriteConfirm.modal.shareableLink.title"),
  description: (
    <Trans
      i18nKey="overwriteConfirm.modal.shareableLink.description"
      bold={(text) => <strong>{text}</strong>}
      br={() => <br />}
    />
  ),
  actionLabel: t("overwriteConfirm.modal.shareableLink.button"),
  color: "danger",
} as const;

const initializeScene = async (opts: {
  collabAPI: CollabAPI | null;
  excalidrawAPI: ExcalidrawImperativeAPI;
}): Promise<
  { scene: ExcalidrawInitialDataState | null } & (
    | { isExternalScene: true; id: string; key: string }
    | { isExternalScene: false; id?: null; key?: null }
  )
> => {
  const externalUrlMatch = window.location.hash.match(/^#url=(.*)$/);

  const localDataState = importFromLocalStorage();

  let scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  let roomLinkData = getCollaborationLinkData(window.location.href);
  const isExternalScene = !!roomLinkData;
  if (isExternalScene) {
    if (
      // don't prompt if scene is empty
      !scene.elements.length ||
      // don't prompt for collab scenes because we don't override local storage
      roomLinkData ||
      // otherwise, prompt whether user wants to override current scene
      (await openConfirmModal(shareableLinkConfirmDialog))
    ) {
      scene.scrollToContent = true;
      if (!roomLinkData) {
        window.history.replaceState({}, APP_NAME, window.location.origin);
      }
    } else {
      if (document.hidden) {
        return new Promise((resolve, reject) => {
          window.addEventListener(
            "focus",
            () => initializeScene(opts).then(resolve).catch(reject),
            {
              once: true,
            },
          );
        });
      }

      roomLinkData = null;
      window.history.replaceState({}, APP_NAME, window.location.origin);
    }
  } else if (externalUrlMatch) {
    window.history.replaceState({}, APP_NAME, window.location.origin);

    const url = externalUrlMatch[1];
    try {
      const request = await fetch(window.decodeURIComponent(url));
      const data = await loadFromBlob(await request.blob(), null, null);
      if (
        !scene.elements.length ||
        (await openConfirmModal(shareableLinkConfirmDialog))
      ) {
        return { scene: data, isExternalScene: false };
      }
    } catch (error: any) {
      return {
        scene: {
          appState: {
            errorMessage: t("alerts.invalidSceneUrl"),
          },
        },
        isExternalScene: false,
      };
    }
  }

  if (roomLinkData && opts.collabAPI) {
    const { excalidrawAPI } = opts;

    const scene = await opts.collabAPI.startCollaboration(roomLinkData);

    return {
      // when collaborating, the state may have already been updated at this
      // point (we may have received updates from other clients), so reconcile
      // elements and appState with existing state
      scene: {
        ...scene,
        appState: {
          ...restoreAppState(
            {
              ...scene?.appState,
              theme: localDataState?.appState?.theme || scene?.appState?.theme,
            },
            excalidrawAPI.getAppState(),
          ),
          // necessary if we're invoking from a hashchange handler which doesn't
          // go through App.initializeScene() that resets this flag
          isLoading: false,
        },
        elements: reconcileElements(
          scene?.elements || [],
          excalidrawAPI.getSceneElementsIncludingDeleted() as RemoteExcalidrawElement[],
          excalidrawAPI.getAppState(),
        ),
      },
      isExternalScene: true,
      id: roomLinkData.roomId,
      key: roomLinkData.roomKey,
    };
  } else if (scene) {
    return { scene, isExternalScene: false };
  }
  return { scene: null, isExternalScene: false };
};

type ExcalidrawWrapperProps = {
  drawing?: DrawingDocument;
  folderId?: string;
  initialCloudData?: object;
  onGoHome?: () => void;
};

const ExcalidrawWrapper = ({
  drawing: cloudDrawing,
  folderId: cloudFolderId = "",
  initialCloudData,
  onGoHome,
}: ExcalidrawWrapperProps) => {
  const [errorMessage, setErrorMessage] = useState("");
  const isCollabDisabled = isRunningInIframe();

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [currentDrawing, setCurrentDrawing] = useState<DrawingDocument | undefined>(cloudDrawing);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isNetworkOffline, setIsNetworkOffline] = useState(!navigator.onLine);
  const sceneInitializedRef = useRef(false);
  const onChangeCountRef = useRef(0);
  const lastSavedElementsRef = useRef<string>("");
  const isSavingRef = useRef(false);
  const offlineQueueRef = useRef(false);

  // Version history state (hooks that use excalidrawAPI are below, after its declaration)
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [vhpDocked, setVhpDocked] = useState(false);
  // Track which Excalidraw sidebar tab is active (search/library) for button highlighting
  const [activeSidebarTab, setActiveSidebarTab] = useState<string | null>(null);
  const lastSnapshotTimeRef = useRef<number>(0);
  const lastSnapshotElementsRef = useRef<string>("");
  const snapshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track online/offline status + auto-sync on reconnect
  useEffect(() => {
    const goOnline = () => {
      setIsNetworkOffline(false);
      // If we had unsaved changes while offline, trigger immediate save
      if (offlineQueueRef.current) {
        offlineQueueRef.current = false;
        setTimeout(() => autoSaveRef.current(), 500);
      }
    };
    const goOffline = () => {
      setIsNetworkOffline(true);
      if (hasUnsavedChanges) {
        offlineQueueRef.current = true;
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [hasUnsavedChanges]);

  // Auto-save: throttled cloud save triggered by onChange
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRef = useRef<() => void>(() => {});

  // Keep autoSaveRef up to date with latest state
  autoSaveRef.current = () => {
    if (!excalidrawAPI || !currentDrawing || !onGoHome) {
      return;
    }
    if (!sceneInitializedRef.current) {
      return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return;
    }

    const elements = excalidrawAPI.getSceneElements();
    if (elements.length === 0) {
      // Don't overwrite saved data with empty scene
      return;
    }
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    const sceneData = {
      type: "excalidraw",
      version: 2,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
    };

    if (isSavingRef.current) {
      // Already saving — reschedule
      scheduleAutoSave();
      return;
    }
    setIsSaving(true);
    isSavingRef.current = true;
    saveDrawingToCloud(
      currentUser.$id,
      currentDrawing.name,
      sceneData,
      cloudFolderId,
      currentDrawing.$id,
      currentDrawing.storageFileId,
    )
      .then((saved) => {
        setCurrentDrawing(saved);
        setHasUnsavedChanges(false);
        setSaveFailed(false);
        setLastSavedAt(new Date());
        // Store the elements that were saved to compare later
        lastSavedElementsRef.current = JSON.stringify(elements);
        clearLocalStorageBackup();
        offlineQueueRef.current = false;
      })
      .catch((err) => {
        console.error("Auto-save failed:", err);
        setSaveFailed(true);
        offlineQueueRef.current = true;
      })
      .finally(() => {
        setIsSaving(false);
        isSavingRef.current = false;
      });
  };

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  // Initialize lastSavedElementsRef when drawing data loads
  useEffect(() => {
    if (initialCloudData && (initialCloudData as any).elements && excalidrawAPI) {
      // Initialize with the loaded elements
      const elemStr = JSON.stringify((initialCloudData as any).elements);
      lastSavedElementsRef.current = elemStr;
      lastSnapshotElementsRef.current = elemStr;
      setHasUnsavedChanges(false);
    }
  }, [initialCloudData, excalidrawAPI]);

  // localStorage backup for crash recovery
  const saveToLocalStorageBackup = useCallback((elements: readonly any[], appState: any, files: any) => {
    if (!currentDrawing) return;
    try {
      const backup = JSON.stringify({
        drawingId: currentDrawing.$id,
        timestamp: Date.now(),
        scene: {
          type: "excalidraw",
          version: 2,
          elements,
          appState: {
            viewBackgroundColor: appState?.viewBackgroundColor,
            gridSize: appState?.gridSize,
          },
          files,
        },
      });
      localStorage.setItem(`aladdin-backup-${currentDrawing.$id}`, backup);
    } catch {
      // localStorage might be full, ignore
    }
  }, [currentDrawing]);

  // Clear localStorage backup after successful cloud save
  const clearLocalStorageBackup = useCallback(() => {
    if (!currentDrawing) return;
    try {
      localStorage.removeItem(`aladdin-backup-${currentDrawing.$id}`);
    } catch {
      // ignore
    }
  }, [currentDrawing]);

  // Schedule auto-save (debounced 1.5s after last change)
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveRef.current();
    }, 1500);
  }, []);

  // ---------------------------------------------------------------------------
  // Version history hooks (placed after excalidrawAPI & scheduleAutoSave)
  // ---------------------------------------------------------------------------

  // Create a version snapshot (used by auto-interval and before restore)
  // Manual saves call createVersionSnapshot() directly with captured sceneData.
  const createSnapshotIfNeeded = useCallback(
    async (trigger: "auto" | "restore", restoredFromVersionId: string = "", customName: string = "") => {
      if (!excalidrawAPI || !currentDrawing || !onGoHome) {
        return;
      }
      if (!sceneInitializedRef.current) {
        return;
      }
      const currentUser = getCurrentUser();
      if (!currentUser) {
        return;
      }
      const elements = excalidrawAPI.getSceneElements();
      if (elements.length === 0) {
        return;
      }
      // For auto snapshots, skip if elements haven't changed since last snapshot
      if (trigger === "auto") {
        const currentStr = JSON.stringify(elements);
        if (currentStr === lastSnapshotElementsRef.current) {
          return;
        }
      }
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const sceneData = {
        type: "excalidraw",
        version: 2,
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
        files,
      };
      try {
        await createVersionSnapshot(
          currentDrawing.$id,
          currentUser.$id,
          sceneData,
          trigger,
          restoredFromVersionId,
          customName,
        );
        lastSnapshotTimeRef.current = Date.now();
        lastSnapshotElementsRef.current = JSON.stringify(elements);
        // Cleanup old snapshots (>30 days) in background
        deleteOldSnapshots(currentDrawing.$id, 30).catch(() => {});
      } catch (err) {
        console.error("Failed to create version snapshot:", err);
      }
    },
    [excalidrawAPI, currentDrawing, onGoHome],
  );

  // 5-minute auto-snapshot interval
  useEffect(() => {
    if (!currentDrawing || !onGoHome) {
      return;
    }
    snapshotIntervalRef.current = setInterval(() => {
      createSnapshotIfNeeded("auto");
    }, 5 * 60 * 1000);
    return () => {
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
    };
  }, [currentDrawing, onGoHome, createSnapshotIfNeeded]);

  // Ctrl+H keyboard shortcut for version history
  useEffect(() => {
    if (!currentDrawing || !onGoHome) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setShowVersionHistory((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentDrawing, onGoHome]);

  // Version history restore handler (preview is now modal-based inside the panel)
  const handleVersionRestore = useCallback(
    async (canvasData: object, snapshotTimestamp: string, restoredFromVersionId: string = "", backupName?: string) => {
      if (!excalidrawAPI || !currentDrawing) {
        return;
      }
      // Create a snapshot of current state before restoring
      await createSnapshotIfNeeded("restore", restoredFromVersionId, backupName || "");

      // Load restored data
      const scene = canvasData as any;
      if (scene.elements) {
        excalidrawAPI.updateScene({
          elements: restoreElements(scene.elements, null, {
            repairBindings: true,
          }),
          appState: {
            ...restoreAppState(scene.appState, null),
            viewModeEnabled: false,
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      }

      setShowVersionHistory(false);

      // Mark as unsaved to trigger autosave of restored version
      setHasUnsavedChanges(true);
      scheduleAutoSave();

      const ts = new Date(snapshotTimestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      toast.success("Version restored", `Restored to version from ${ts}`);
    },
    [excalidrawAPI, currentDrawing, createSnapshotIfNeeded, scheduleAutoSave],
  );

  // Fire-and-forget snapshot on exit if elements changed since last snapshot
  const snapshotOnExitRef = useRef<() => void>(() => {});
  snapshotOnExitRef.current = () => {
    if (!excalidrawAPI || !currentDrawing || !onGoHome || !sceneInitializedRef.current) {
      return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return;
    }
    const elements = excalidrawAPI.getSceneElements();
    if (elements.length === 0) {
      return;
    }
    const currentStr = JSON.stringify(elements);
    if (currentStr === lastSnapshotElementsRef.current) {
      return;
    }
    const appState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();
    const sceneData = {
      type: "excalidraw",
      version: 2,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
    };
    // Fire-and-forget — we can't await in beforeunload/unmount
    createVersionSnapshot(currentDrawing.$id, currentUser.$id, sceneData, "auto").catch(() => {});
    lastSnapshotElementsRef.current = currentStr;
  };

  // Cleanup auto-save timer on unmount, and flush save + exit snapshot
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        // Flush: do a final save on unmount
        autoSaveRef.current();
      }
      // Create a version snapshot if content changed since last snapshot
      snapshotOnExitRef.current();
    };
  }, []);

  // Flush cloud save on beforeunload (page close/refresh) + warn if unsaved
  useEffect(() => {
    const flushOnUnload = (e: BeforeUnloadEvent) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      // Synchronous best-effort: trigger the save (fire-and-forget)
      autoSaveRef.current();
      // Create a version snapshot if content changed since last snapshot
      snapshotOnExitRef.current();
      // Also do a synchronous localStorage backup as last resort
      if (excalidrawAPI && currentDrawing) {
        try {
          const els = excalidrawAPI.getSceneElements();
          const as = excalidrawAPI.getAppState();
          const fs = excalidrawAPI.getFiles();
          const backup = JSON.stringify({
            drawingId: currentDrawing.$id,
            timestamp: Date.now(),
            scene: {
              type: "excalidraw",
              version: 2,
              elements: els,
              appState: { viewBackgroundColor: as.viewBackgroundColor, gridSize: as.gridSize },
              files: fs,
            },
          });
          localStorage.setItem(`aladdin-backup-${currentDrawing.$id}`, backup);
        } catch { /* ignore */ }
      }
      // Warn user if there are unsaved changes
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", flushOnUnload);
    return () => window.removeEventListener("beforeunload", flushOnUnload);
  }, [excalidrawAPI, currentDrawing, hasUnsavedChanges]);

  // Flush cloud save on visibility change (tab switch / blur)
  useEffect(() => {
    const flushOnHide = () => {
      if (document.hidden && autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveRef.current();
      }
    };
    document.addEventListener("visibilitychange", flushOnHide);
    return () => document.removeEventListener("visibilitychange", flushOnHide);
  }, []);

  useEffect(() => {
    trackEvent("load", "frame", getFrame());
    // Delayed so that the app has a time to load the latest SW
    setTimeout(() => {
      trackEvent("load", "version", getVersion());
    }, VERSION_TIMEOUT);
  }, []);

  const [, setShareDialogState] = useAtom(shareDialogStateAtom);
  const [collabAPI] = useAtom(collabAPIAtom);
  const [isCollaborating] = useAtomWithInitialValue(isCollaboratingAtom, () => {
    return isCollaborationLink(window.location.href);
  });
  const collabError = useAtomValue(collabErrorIndicatorAtom);

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI || (!isCollabDisabled && !collabAPI)) {
      return;
    }

    const loadImages = (
      data: ResolutionType<typeof initializeScene>,
      isInitialLoad = false,
    ) => {
      if (!data.scene) {
        return;
      }
      if (collabAPI?.isCollaborating()) {
        if (data.scene.elements) {
          collabAPI
            .fetchImageFiles({
              elements: data.scene.elements,
              forceFetchFiles: true,
            })
            .then(({ loadedFiles, erroredFiles }) => {
              excalidrawAPI.addFiles(loadedFiles);
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
      } else {
        const fileIds =
          data.scene.elements?.reduce((acc, element) => {
            if (isInitializedImageElement(element)) {
              return acc.concat(element.fileId);
            }
            return acc;
          }, [] as FileId[]) || [];

        if (data.isExternalScene) {
          loadFilesFromAppwrite(
            `${STORAGE_PREFIXES.shareLinkFiles}/${data.id}`,
            data.key,
            fileIds,
          ).then(({ loadedFiles, erroredFiles }) => {
            excalidrawAPI.addFiles(loadedFiles);
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
        } else if (isInitialLoad) {
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
          // on fresh load, clear unused files from IDB (from previous
          // session)
          LocalData.fileStorage.clearObsoleteFiles({ currentFileIds: fileIds });
        }
      }
    };

    // If we have cloud data (opening an existing drawing), use it directly
    if (initialCloudData && (initialCloudData as any).elements) {
      const cloudScene = initialCloudData as any;
      initialStatePromiseRef.current.promise.resolve({
        elements: restoreElements(cloudScene.elements, null, {
          repairBindings: true,
          deleteInvisibleElements: true,
        }),
        appState: restoreAppState(cloudScene.appState, null),
        scrollToContent: true,
      });
    } else {
      initializeScene({ collabAPI, excalidrawAPI }).then(async (data) => {
        loadImages(data, /* isInitialLoad */ true);
        initialStatePromiseRef.current.promise.resolve(data.scene);
      });
    }

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        if (
          collabAPI?.isCollaborating() &&
          !isCollaborationLink(window.location.href)
        ) {
          collabAPI.stopCollaboration(false);
        }
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene({ collabAPI, excalidrawAPI }).then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (
        !document.hidden &&
        ((collabAPI && !collabAPI.isCollaborating()) || isCollabDisabled)
      ) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          const username = importUsernameFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
          collabAPI?.setUsername(username || "");
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [isCollabDisabled, collabAPI, excalidrawAPI, setLangCode]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    if (collabAPI?.isCollaborating()) {
      collabAPI.syncElements(elements);
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    // Auto-save to cloud (debounced)
    // Skip the first few onChange calls — they fire during scene initialization
    // before the real data is loaded, and would overwrite saved data with empty scene
    if (currentDrawing && onGoHome) {
      onChangeCountRef.current++;
      if (onChangeCountRef.current > 3) {
        sceneInitializedRef.current = true;
      }
      if (sceneInitializedRef.current) {
        // Check if elements actually changed
        const currentElements = JSON.stringify(elements);
        const elementsChanged = currentElements !== lastSavedElementsRef.current;
        
        if (elementsChanged) {
          setHasUnsavedChanges(true);
          // Backup to localStorage immediately for crash recovery
          saveToLocalStorageBackup(elements, appState, files);
          // Only schedule auto-save when elements actually changed
          scheduleAutoSave();
        }
      }
    }

    // Track active sidebar tab for button highlighting
    const currentTab = appState.openSidebar?.name === DEFAULT_SIDEBAR.name
      ? (appState.openSidebar.tab || null)
      : null;
    setActiveSidebarTab(currentTab);

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const isOffline = useAtomValue(isOfflineAtom);

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const onCollabDialogOpen = useCallback(
    () => setShareDialogState({ isOpen: true, type: "collaborationOnly" }),
    [setShareDialogState],
  );

  // Shared manual save + version snapshot logic (used by toolbar save button and menu)
  const triggerManualSave = useCallback(async () => {
    if (!excalidrawAPI || isSaving || !currentDrawing) {
      return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser) {
      toast.warning(
        "Not signed in",
        "Please log in to save your drawings to the cloud.",
      );
      return;
    }
    setIsSaving(true);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const sceneData = {
        type: "excalidraw",
        version: 2,
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        },
        files,
      };
      const drawingName =
        currentDrawing.name ||
        `Drawing ${new Date().toLocaleDateString()}`;
      const saved = await saveDrawingToCloud(
        currentUser.$id,
        drawingName,
        sceneData,
        cloudFolderId,
        currentDrawing.$id,
        currentDrawing.storageFileId,
      );
      setCurrentDrawing(saved);
      setHasUnsavedChanges(false);
      setSaveFailed(false);
      setLastSavedAt(new Date());
      lastSavedElementsRef.current = JSON.stringify(elements);
      clearLocalStorageBackup();
      offlineQueueRef.current = false;
      if (saved.$id) {
        createVersionSnapshot(saved.$id, currentUser.$id, sceneData, "manual")
          .then(() => {
            lastSnapshotTimeRef.current = Date.now();
            lastSnapshotElementsRef.current = JSON.stringify(elements);
            deleteOldSnapshots(saved.$id, 30).catch(() => {});
          })
          .catch((err) => console.error("Failed to create version snapshot:", err));
      }
      toast.success(
        "Saved to cloud",
        `"${drawingName}" synced at ${new Date().toLocaleTimeString()}`,
      );
    } catch (err) {
      console.error("Failed to save to cloud:", err);
      setSaveFailed(true);
      toast.error(
        "Save failed",
        "Could not sync your drawing. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [excalidrawAPI, isSaving, currentDrawing, cloudFolderId, clearLocalStorageBackup]);

  // Toggle search sidebar — always close VHP when opening
  const toggleSearchSidebar = useCallback(() => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const isSearchOpen = appState.openSidebar?.name === DEFAULT_SIDEBAR.name
      && appState.openSidebar?.tab === CANVAS_SEARCH_TAB;
    if (isSearchOpen) {
      excalidrawAPI.toggleSidebar({ name: DEFAULT_SIDEBAR.name, tab: CANVAS_SEARCH_TAB });
    } else {
      // Always close VHP when opening search
      if (showVersionHistory) {
        setShowVersionHistory(false);
        setVhpDocked(false);
      }
      excalidrawAPI.toggleSidebar({ name: DEFAULT_SIDEBAR.name, tab: CANVAS_SEARCH_TAB, force: true });
    }
  }, [excalidrawAPI, showVersionHistory]);

  // Toggle library sidebar — always close VHP when opening
  const toggleLibrarySidebar = useCallback(() => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const isLibraryOpen = appState.openSidebar?.name === DEFAULT_SIDEBAR.name
      && appState.openSidebar?.tab === LIBRARY_SIDEBAR_TAB;
    if (isLibraryOpen) {
      excalidrawAPI.toggleSidebar({ name: DEFAULT_SIDEBAR.name, tab: LIBRARY_SIDEBAR_TAB });
    } else {
      // Always close VHP when opening library
      if (showVersionHistory) {
        setShowVersionHistory(false);
        setVhpDocked(false);
      }
      excalidrawAPI.toggleSidebar({ name: DEFAULT_SIDEBAR.name, tab: LIBRARY_SIDEBAR_TAB, force: true });
    }
  }, [excalidrawAPI, showVersionHistory]);

  // Toggle VHP — always close the default sidebar when opening
  const toggleVersionHistory = useCallback(() => {
    setShowVersionHistory((prev) => {
      if (!prev && excalidrawAPI) {
        // Always close the default sidebar when opening VHP
        const appState = excalidrawAPI.getAppState();
        if (appState.openSidebar?.name === DEFAULT_SIDEBAR.name) {
          excalidrawAPI.toggleSidebar({ name: DEFAULT_SIDEBAR.name, force: false });
        }
      }
      return !prev;
    });
  }, [excalidrawAPI]);

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  return (
    <div
      style={{ height: "100%", display: "flex" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
      <div style={{ flex: 1, minWidth: 0, height: "100%", position: "relative" }}>
      <Excalidraw
        excalidrawAPI={excalidrawRefCallback}
        onChange={onChange}
        initialData={initialStatePromiseRef.current.promise}
        isCollaborating={isCollaborating}
        onPointerUpdate={collabAPI?.onPointerUpdate}
        UIOptions={{
          canvasActions: {
            toggleTheme: true,
          },
        }}
        langCode={langCode}
        renderCustomStats={renderCustomStats}
        detectScroll={false}
        handleKeyboardGlobally={true}
        autoFocus={true}
        theme={editorTheme}
        validateEmbeddable={(url) => {
          try {
            const { protocol } = new URL(url);
            if (protocol === "https:" || protocol === "http:") {
              return true;
            }
          } catch {
            // invalid URL
          }
          return undefined;
        }}
        renderTopRightUI={(isMobile) => {
          // Save status indicator
          const saveStatusDot = currentDrawing && onGoHome ? (() => {
            let dotColor: string;
            let bgColor: string;
            let borderColor: string;
            let iconColor: string;
            if (isNetworkOffline) {
              dotColor = "#EF4444";
              bgColor = "#fef2f2";
              borderColor = "#fecaca";
              iconColor = "#dc2626";
            } else if (saveFailed && !isSaving) {
              dotColor = "#EF4444";
              bgColor = "#fef2f2";
              borderColor = "#fecaca";
              iconColor = "#dc2626";
            } else if (isSaving) {
              dotColor = "#F59E0B";
              bgColor = "#fffbeb";
              borderColor = "#fed7aa";
              iconColor = "#d97706";
            } else if (hasUnsavedChanges) {
              dotColor = "#F59E0B";
              bgColor = "#fffbeb";
              borderColor = "#fed7aa";
              iconColor = "#d97706";
            } else {
              dotColor = "#22C55E";
              bgColor = "#f0fdf4";
              borderColor = "#bbf7d0";
              iconColor = "#16a34a";
            }
            return (
              <div
                title={isNetworkOffline ? "You are offline — changes saved locally" : saveFailed && !isSaving ? "Save failed — click to retry" : isSaving ? "Syncing to cloud…" : hasUnsavedChanges ? "Click to save now" : lastSavedAt ? `Last saved at ${lastSavedAt.toLocaleTimeString()}` : "All changes saved"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.25rem 0.625rem 0.25rem 0.5rem",
                  borderRadius: "0.625rem",
                  background: bgColor,
                  border: `1px solid ${borderColor}`,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
                  cursor: (hasUnsavedChanges || saveFailed) && !isSaving ? "pointer" : "default",
                  fontSize: "0.75rem",
                  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  fontWeight: 500,
                  color: iconColor,
                  userSelect: "none",
                  transition: "all 0.2s ease",
                  lineHeight: 1,
                }}
                onClick={() => {
                  if ((hasUnsavedChanges || saveFailed) && !isSaving) {
                    triggerManualSave();
                  }
                }}
                onMouseEnter={(e) => {
                  if ((hasUnsavedChanges || saveFailed) && !isSaving) {
                    e.currentTarget.style.opacity = "0.85";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.transform = "scale(1)";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                </svg>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: dotColor,
                    display: "inline-block",
                    flexShrink: 0,
                    boxShadow: `0 0 4px ${dotColor}60`,
                  }}
                />
              </div>
            );
          })() : null;

          // Square save button (replaces circular collab trigger)
          const saveButton = currentDrawing && onGoHome ? (
            <button
              title={isSaving ? "Saving…" : "Save version now"}
              onClick={() => triggerManualSave()}
              disabled={isSaving}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: "1px solid var(--color-border-outline-variant, #d1d5db)",
                background: "var(--island-bg-color, #ffffff)",
                cursor: isSaving ? "not-allowed" : "pointer",
                color: "var(--icon-fill-color, #1b1b1e)",
                transition: "all 0.15s ease",
                opacity: isSaving ? 0.6 : 1,
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.background = "var(--button-hover-bg, #f3f4f6)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--island-bg-color, #ffffff)";
              }}
            >
              {/* Bookmark/save icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          ) : null;

          // Version history button
          const versionHistoryButton = currentDrawing && onGoHome ? (
            <button
              title="Version history (Ctrl+H)"
              onClick={toggleVersionHistory}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${showVersionHistory ? "#19789E" : "var(--color-border-outline-variant, #d1d5db)"}`,
                background: showVersionHistory ? "#E0F4F8" : "var(--island-bg-color, #ffffff)",
                cursor: "pointer",
                color: showVersionHistory ? "#19789E" : "var(--icon-fill-color, #1b1b1e)",
                transition: "all 0.15s ease",
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!showVersionHistory) {
                  e.currentTarget.style.background = "var(--button-hover-bg, #f3f4f6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!showVersionHistory) {
                  e.currentTarget.style.background = "var(--island-bg-color, #ffffff)";
                }
              }}
            >
              {/* Clock/history icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </button>
          ) : null;

          // Search in canvas button
          const isSearchActive = activeSidebarTab === CANVAS_SEARCH_TAB;
          const searchButton = (
            <button
              title="Search in canvas (Ctrl+F)"
              onClick={toggleSearchSidebar}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${isSearchActive ? "#19789E" : "var(--color-border-outline-variant, #d1d5db)"}`,
                background: isSearchActive ? "#E0F4F8" : "var(--island-bg-color, #ffffff)",
                cursor: "pointer",
                color: isSearchActive ? "#19789E" : "var(--icon-fill-color, #1b1b1e)",
                transition: "all 0.15s ease",
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isSearchActive) {
                  e.currentTarget.style.background = "var(--button-hover-bg, #f3f4f6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSearchActive) {
                  e.currentTarget.style.background = "var(--island-bg-color, #ffffff)";
                }
              }}
            >
              {/* Search/magnifying glass icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          );

          // Library button
          const isLibraryActive = activeSidebarTab === LIBRARY_SIDEBAR_TAB;
          const libraryButton = (
            <button
              title="Library"
              onClick={toggleLibrarySidebar}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${isLibraryActive ? "#19789E" : "var(--color-border-outline-variant, #d1d5db)"}`,
                background: isLibraryActive ? "#E0F4F8" : "var(--island-bg-color, #ffffff)",
                cursor: "pointer",
                color: isLibraryActive ? "#19789E" : "var(--icon-fill-color, #1b1b1e)",
                transition: "all 0.15s ease",
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isLibraryActive) {
                  e.currentTarget.style.background = "var(--button-hover-bg, #f3f4f6)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isLibraryActive) {
                  e.currentTarget.style.background = "var(--island-bg-color, #ffffff)";
                }
              }}
            >
              {/* Library/book icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
          );

          if (isMobile) {
            return (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {saveStatusDot}
                {saveButton}
              </div>
            );
          }

          return (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {saveStatusDot}
              {searchButton}
              {libraryButton}
              {versionHistoryButton}
              {saveButton}
              {collabError.message && <CollabError collabError={collabError} />}
            </div>
          );
        }}
        onLinkOpen={(element, event) => {
          if (element.link && isElementLink(element.link)) {
            event.preventDefault();
            excalidrawAPI?.scrollToContent(element.link, { animate: true });
          }
        }}
      >
        <AppMainMenu
          onCollabDialogOpen={onCollabDialogOpen}
          isCollaborating={isCollaborating}
          isCollabEnabled={!isCollabDisabled}
          theme={appTheme}
          setTheme={(theme) => setAppTheme(theme)}
          refresh={() => forceRefresh((prev) => !prev)}
          onGoHome={onGoHome}
          isSaving={isSaving}
          onVersionHistory={
            onGoHome && currentDrawing
              ? toggleVersionHistory
              : undefined
          }
          onSaveToCloud={onGoHome ? triggerManualSave : undefined}
        />
        <AppWelcomeScreen
          onCollabDialogOpen={onCollabDialogOpen}
          isCollabEnabled={!isCollabDisabled}
        />
        <OverwriteConfirmDialog>
          <OverwriteConfirmDialog.Actions.ExportToImage />
          <OverwriteConfirmDialog.Actions.SaveToDisk />
        </OverwriteConfirmDialog>
        <AppFooter onChange={() => excalidrawAPI?.refresh()} />

        <TTDDialogTrigger />
        {isCollaborating && isOffline && (
          <div className="alertalert--warning">
            {t("alerts.collabOfflineWarning")}
          </div>
        )}
        {localStorageQuotaExceeded && (
          <div className="alert alert--danger">
            {t("alerts.localStorageQuotaExceeded")}
          </div>
        )}
        {excalidrawAPI && !isCollabDisabled && (
          <Collab excalidrawAPI={excalidrawAPI} />
        )}

        <ShareDialog
          collabAPI={collabAPI}
        />

        <AppSidebar />

        {errorMessage && (
          <ErrorDialog onClose={() => setErrorMessage("")}>
            {errorMessage}
          </ErrorDialog>
        )}

        <CommandPalette
          customCommandPaletteItems={[
            {
              label: t("labels.liveCollaboration"),
              category: DEFAULT_CATEGORIES.app,
              keywords: [
                "team",
                "multiplayer",
                "share",
                "public",
                "session",
                "invite",
              ],
              icon: usersIcon,
              perform: () => {
                setShareDialogState({
                  isOpen: true,
                  type: "collaborationOnly",
                });
              },
            },
            {
              label: t("roomDialog.button_stopSession"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!collabAPI?.isCollaborating(),
              keywords: [
                "stop",
                "session",
                "end",
                "leave",
                "close",
                "exit",
                "collaboration",
              ],
              perform: () => {
                if (collabAPI) {
                  collabAPI.stopCollaboration();
                  if (!collabAPI.isCollaborating()) {
                    setShareDialogState({ isOpen: false });
                  }
                }
              },
            },
            {
              label: t("labels.share"),
              category: DEFAULT_CATEGORIES.app,
              predicate: true,
              icon: share,
              keywords: [
                "link",
                "shareable",
                "readonly",
                "export",
                "publish",
                "snapshot",
                "url",
                "collaborate",
                "invite",
              ],
              perform: async () => {
                setShareDialogState({ isOpen: true, type: "share" });
              },
            },
            {
              ...CommandPalette.defaultItems.toggleTheme,
              perform: () => {
                setAppTheme(
                  editorTheme === THEME.DARK ? THEME.LIGHT : THEME.DARK,
                );
              },
            },
            {
              label: t("labels.installPWA"),
              category: DEFAULT_CATEGORIES.app,
              predicate: () => !!pwaEvent,
              perform: () => {
                if (pwaEvent) {
                  pwaEvent.prompt();
                  pwaEvent.userChoice.then(() => {
                    // event cannot be reused, but we'll hopefully
                    // grab new one as the event should be fired again
                    pwaEvent = null;
                  });
                }
              },
            },
          ]}
        />
        {isVisualDebuggerEnabled() && excalidrawAPI && (
          <DebugCanvas
            appState={excalidrawAPI.getAppState()}
            scale={window.devicePixelRatio}
            ref={debugCanvasRef}
          />
        )}
      </Excalidraw>
      </div>
      {showVersionHistory && currentDrawing && (
        <VersionHistoryPanel
          drawingId={currentDrawing.$id}
          isDark={editorTheme === "dark"}
          onRestore={handleVersionRestore}
          onClose={() => { setShowVersionHistory(false); setVhpDocked(false); }}
          onDockedChange={setVhpDocked}
        />
      )}
      <ToastContainer />
    </div>
  );
};

type ExcalidrawAppProps = {
  drawing?: DrawingDocument;
  folderId?: string;
  initialCloudData?: object;
  onGoHome?: () => void;
};

const ExcalidrawApp = ({
  drawing,
  folderId,
  initialCloudData,
  onGoHome,
}: ExcalidrawAppProps) => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawWrapper
          drawing={drawing}
          folderId={folderId}
          initialCloudData={initialCloudData}
          onGoHome={onGoHome}
        />
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
