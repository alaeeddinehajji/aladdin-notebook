import {
  Excalidraw,
  LiveCollaborationTrigger,
  TTDDialogTrigger,
  CaptureUpdateAction,
  reconcileElements,
  useEditorInterface,
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
import { saveDrawingToCloud } from "./data/drawingStorage";
import { getCurrentUser } from "./data/authService";

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

  const editorInterface = useEditorInterface();

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
  const [currentDrawing, setCurrentDrawing] = useState<DrawingDocument | undefined>(cloudDrawing);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isNetworkOffline, setIsNetworkOffline] = useState(!navigator.onLine);
  const sceneInitializedRef = useRef(false);
  const onChangeCountRef = useRef(0);
  const lastSavedElementsRef = useRef<string>("");

  // Track online/offline status
  useEffect(() => {
    const goOnline = () => setIsNetworkOffline(false);
    const goOffline = () => setIsNetworkOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

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

    setIsSaving(true);
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
        setLastSavedAt(new Date());
        // Store the elements that were saved to compare later
        lastSavedElementsRef.current = JSON.stringify(elements);
      })
      .catch((err) => {
        console.error("Auto-save failed:", err);
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const [excalidrawAPI, excalidrawRefCallback] =
    useCallbackRefState<ExcalidrawImperativeAPI>();

  // Initialize lastSavedElementsRef when drawing data loads
  useEffect(() => {
    if (initialCloudData && (initialCloudData as any).elements && excalidrawAPI) {
      // Initialize with the loaded elements
      lastSavedElementsRef.current = JSON.stringify((initialCloudData as any).elements);
      setHasUnsavedChanges(false);
    }
  }, [initialCloudData, excalidrawAPI]);

  // Schedule auto-save (debounced 5s after last change)
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveRef.current();
    }, 5000);
  }, []);

  // Cleanup auto-save timer on unmount, and flush save
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        // Flush: do a final save on unmount
        autoSaveRef.current();
      }
    };
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
        }
        scheduleAutoSave();
      }
    }

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
      style={{ height: "100%" }}
      className={clsx("excalidraw-app", {
        "is-collaborating": isCollaborating,
      })}
    >
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
        renderTopRightUI={(isMobile) => {
          const saveStatusDot = currentDrawing && onGoHome ? (() => {
            let color: string;
            let label: string;
            if (isNetworkOffline) {
              color = "#EF4444";
              label = "Offline";
            } else if (isSaving) {
              color = "#F59E0B";
              label = "Saving...";
            } else if (hasUnsavedChanges) {
              color = "#F59E0B";
              label = "Unsaved changes";
            } else {
              color = "#22C55E";
              label = lastSavedAt
                ? `Saved at ${lastSavedAt.toLocaleTimeString()}`
                : "Saved";
            }
            return (
              <div
                title={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.375rem 0.625rem",
                  borderRadius: "0.5rem",
                  background: "var(--island-bg-color, #fff)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  cursor: hasUnsavedChanges && !isSaving ? "pointer" : "default",
                  fontSize: "0.75rem",
                  color: "var(--text-primary-color, #1B1B1E)",
                  userSelect: "none",
                  transition: "background-color 0.2s",
                }}
                onClick={() => {
                  if (hasUnsavedChanges && !isSaving && excalidrawAPI && currentDrawing) {
                    // Trigger immediate save when clicking unsaved changes
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
                    
                    setIsSaving(true);
                    saveDrawingToCloud(
                      getCurrentUser()!.$id,
                      currentDrawing.name,
                      sceneData,
                      cloudFolderId,
                      currentDrawing.$id,
                      currentDrawing.storageFileId,
                    )
                      .then((saved) => {
                        setCurrentDrawing(saved);
                        setHasUnsavedChanges(false);
                        setLastSavedAt(new Date());
                        lastSavedElementsRef.current = JSON.stringify(elements);
                        excalidrawAPI.setToast({
                          message: "Saved to cloud!",
                        });
                      })
                      .catch((err) => {
                        console.error("Failed to save to cloud:", err);
                        excalidrawAPI.setToast({
                          message: "Failed to save to cloud",
                        });
                      })
                      .finally(() => {
                        setIsSaving(false);
                      });
                  }
                }}
                onMouseEnter={(e) => {
                  if (hasUnsavedChanges && !isSaving) {
                    e.currentTarget.style.backgroundColor = "var(--button-hover-bg, #f3f4f6)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--island-bg-color, #fff)";
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color,
                    display: "inline-block",
                    flexShrink: 0,
                    boxShadow: `0 0 4px ${color}80`,
                  }}
                />
                <span>{label}</span>
              </div>
            );
          })() : null;

          if (isMobile) {
            return saveStatusDot;
          }

          if (!collabAPI || isCollabDisabled) {
            return saveStatusDot;
          }

          return (
            <div className="excalidraw-ui-top-right" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {saveStatusDot}
              {collabError.message && <CollabError collabError={collabError} />}
              <LiveCollaborationTrigger
                isCollaborating={isCollaborating}
                onSelect={() =>
                  setShareDialogState({ isOpen: true, type: "share" })
                }
                editorInterface={editorInterface}
              />
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
          onSaveToCloud={
            onGoHome
              ? async () => {
                  if (!excalidrawAPI || isSaving) {
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
                      currentDrawing?.name ||
                      `Drawing ${new Date().toLocaleDateString()}`;

                    const currentUser = getCurrentUser();
                    if (!currentUser) {
                      excalidrawAPI.setToast({
                        message: "Please log in to save to cloud",
                      });
                      setIsSaving(false);
                      return;
                    }

                    const saved = await saveDrawingToCloud(
                      currentUser.$id,
                      drawingName,
                      sceneData,
                      cloudFolderId,
                      currentDrawing?.$id,
                      currentDrawing?.storageFileId,
                    );
                    setCurrentDrawing(saved);
                    setHasUnsavedChanges(false);
                    setLastSavedAt(new Date());
                    lastSavedElementsRef.current = JSON.stringify(elements);
                    excalidrawAPI.setToast({
                      message: "Saved to cloud!",
                    });
                  } catch (err) {
                    console.error("Failed to save to cloud:", err);
                    excalidrawAPI.setToast({
                      message: "Failed to save to cloud",
                    });
                  } finally {
                    setIsSaving(false);
                  }
                }
              : undefined
          }
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
