import { reconcileElements } from "@excalidraw/excalidraw";
import { MIME_TYPES, toBrandedType } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { getSceneVersion } from "@excalidraw/element";
import { Client, Databases, ID, Query } from "appwrite";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type {
  ExcalidrawElement,
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { FILE_CACHE_MAX_AGE_SEC } from "../app_constants";

import { getSyncableElements } from ".";

import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

// private
// -----------------------------------------------------------------------------

let APPWRITE_CONFIG: {
  endpoint: string;
  projectId: string;
  databaseId: string;
};

try {
  APPWRITE_CONFIG = {
    endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1",
    projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || "",
    databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || "aladdin-notes-db",
  };
} catch (error: any) {
  console.warn(
    `Error parsing Appwrite config. Please check your environment variables.`,
  );
  APPWRITE_CONFIG = {
    endpoint: "https://cloud.appwrite.io/v1",
    projectId: "",
    databaseId: "aladdin-notes-db",
  };
}

let appwriteClient: Client | null = null;
let databases: Databases | null = null;

const _initializeAppwrite = () => {
  if (!appwriteClient) {
    appwriteClient = new Client()
      .setEndpoint(APPWRITE_CONFIG.endpoint)
      .setProject(APPWRITE_CONFIG.projectId);
  }
  return appwriteClient;
};

const _getDatabases = () => {
  if (!databases) {
    databases = new Databases(_initializeAppwrite());
  }
  return databases;
};

// -----------------------------------------------------------------------------

type AppwriteDocument = AppwriteStoredScene & {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
};

type AppwriteFileDocument = {
  $id: string;
  prefix: string;
  fileId: string;
  data: string;
  mimeType: string;
  createdAt: string;
};

export const loadAppwriteStorage = async () => {
  return _getDatabases();
};

type AppwriteStoredScene = {
  roomId: string;
  sceneVersion: number;
  ciphertext: string;
  iv: string;
  createdAt: string;
  updatedAt: string;
};

const encryptElements = async (
  key: string,
  elements: readonly ExcalidrawElement[],
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> => {
  const json = JSON.stringify(elements);
  const encoded = new TextEncoder().encode(json);
  const { encryptedBuffer, iv } = await encryptData(key, encoded);

  return { ciphertext: encryptedBuffer, iv };
};

const decryptElements = async (
  data: AppwriteStoredScene,
  roomKey: string,
): Promise<readonly ExcalidrawElement[]> => {
  const ciphertext = new Uint8Array(
    Array.from(atob(data.ciphertext), (c) => c.charCodeAt(0)),
  ) as Uint8Array<ArrayBuffer>;
  const iv = new Uint8Array(
    Array.from(atob(data.iv), (c) => c.charCodeAt(0)),
  ) as Uint8Array<ArrayBuffer>;

  const decrypted = await decryptData(iv, ciphertext, roomKey);
  const decodedData = new TextDecoder("utf-8").decode(
    new Uint8Array(decrypted),
  );
  return JSON.parse(decodedData);
};

class AppwriteSceneVersionCache {
  private static cache = new WeakMap<Socket, number>();
  static get = (socket: Socket) => {
    return AppwriteSceneVersionCache.cache.get(socket);
  };
  static set = (
    socket: Socket,
    elements: readonly SyncableExcalidrawElement[],
  ) => {
    AppwriteSceneVersionCache.cache.set(socket, getSceneVersion(elements));
  };
}

export const isSavedToAppwrite = (
  portal: Portal,
  elements: readonly ExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return AppwriteSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  // if no room exists, consider the room saved so that we don't unnecessarily
  // prevent unload (there's nothing we could do at that point anyway)
  return true;
};

export const saveFilesToAppwrite = async ({
  prefix,
  files,
}: {
  prefix: string;
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const databases = await loadAppwriteStorage();

  const erroredFiles: FileId[] = [];
  const savedFiles: FileId[] = [];

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        // Convert buffer to base64 for storage
        const base64Data = btoa(
          String.fromCharCode(...new Uint8Array(buffer)),
        );

        const documentId = ID.unique();
        await databases.createDocument(
          APPWRITE_CONFIG.databaseId,
          "files",
          documentId,
          {
            prefix,
            fileId: id,
            data: base64Data,
            mimeType: MIME_TYPES.binary,
            createdAt: new Date().toISOString(),
          },
        );
        savedFiles.push(id);
      } catch (error: any) {
        console.error("Error saving file to Appwrite:", error);
        erroredFiles.push(id);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

const createAppwriteSceneDocument = async (
  elements: readonly SyncableExcalidrawElement[],
  roomKey: string,
  roomId: string,
) => {
  const sceneVersion = getSceneVersion(elements);
  const { ciphertext, iv } = await encryptElements(roomKey, elements);
  const now = new Date().toISOString();
  
  return {
    roomId,
    sceneVersion,
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
    createdAt: now,
    updatedAt: now,
  } as AppwriteStoredScene;
};

export const saveToAppwrite = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
  appState: AppState,
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    // bail if no room exists as there's nothing we can do at this point
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToAppwrite(portal, elements)
  ) {
    return null;
  }

  const databases = _getDatabases();

  try {
    // Check if document exists
    const existingDocs = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      "scenes",
      [Query.equal("roomId", roomId)],
    );

    let storedScene: AppwriteStoredScene;

    if (existingDocs.documents.length === 0) {
      // Create new document
      storedScene = await createAppwriteSceneDocument(elements, roomKey, roomId);
      await databases.createDocument(
        APPWRITE_CONFIG.databaseId,
        "scenes",
        ID.unique(),
        storedScene,
      );
    } else {
      // Update existing document
      const existingDoc = existingDocs.documents[0] as unknown as AppwriteDocument;
      const prevStoredElements = getSyncableElements(
        restoreElements(await decryptElements(existingDoc, roomKey), null),
      );
      const reconciledElements = getSyncableElements(
        reconcileElements(
          elements,
          prevStoredElements as OrderedExcalidrawElement[] as RemoteExcalidrawElement[],
          appState,
        ),
      );

      storedScene = await createAppwriteSceneDocument(
        reconciledElements,
        roomKey,
        roomId,
      );

      await databases.updateDocument(
        APPWRITE_CONFIG.databaseId,
        "scenes",
        existingDoc.$id,
        {
          sceneVersion: storedScene.sceneVersion,
          ciphertext: storedScene.ciphertext,
          iv: storedScene.iv,
          updatedAt: new Date().toISOString(),
        },
      );
    }

    const storedElements = getSyncableElements(
      restoreElements(await decryptElements(storedScene, roomKey), null),
    );

    AppwriteSceneVersionCache.set(socket, storedElements);

    return toBrandedType<RemoteExcalidrawElement[]>(storedElements);
  } catch (error: any) {
    console.error("Error saving to Appwrite:", error);
    return null;
  }
};

export const loadFromAppwrite = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly SyncableExcalidrawElement[] | null> => {
  const databases = _getDatabases();
  
  try {
    const documents = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      "scenes",
      [Query.equal("roomId", roomId)],
    );

    if (documents.documents.length === 0) {
      return null;
    }

    const storedScene = documents.documents[0] as unknown as AppwriteDocument;
    const elements = getSyncableElements(
      restoreElements(await decryptElements(storedScene, roomKey), null, {
        deleteInvisibleElements: true,
      }),
    );

    if (socket) {
      AppwriteSceneVersionCache.set(socket, elements);
    }

    return elements;
  } catch (error: any) {
    console.error("Error loading from Appwrite:", error);
    return null;
  }
};

export const loadFilesFromAppwrite = async (
  prefix: string,
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const databases = await loadAppwriteStorage();
  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const documents = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          "files",
          [Query.equal("prefix", prefix), Query.equal("fileId", id)],
        );

        if (documents.documents.length === 0) {
          erroredFiles.set(id, true);
          return;
        }

        const fileDoc = documents.documents[0] as unknown as AppwriteFileDocument;
        const base64Data = fileDoc.data;
        
        // Convert base64 back to array buffer
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const { data, metadata } = await decompressData<BinaryFileMetadata>(
          bytes,
          {
            decryptionKey,
          },
        );

        const dataURL = new TextDecoder().decode(data) as DataURL;

        loadedFiles.push({
          mimeType: (fileDoc.mimeType || MIME_TYPES.binary) as any,
          id,
          dataURL,
          created: new Date(fileDoc.createdAt).getTime(),
          lastRetrieved: new Date(fileDoc.createdAt).getTime(),
        });
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
