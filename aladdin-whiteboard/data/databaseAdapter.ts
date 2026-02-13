import type { Socket } from "socket.io-client";
import type {
  AppState,
  BinaryFileData,
} from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/element/types";
import type { SyncableExcalidrawElement } from ".";
import type Portal from "../collab/Portal";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

// Appwrite imports
import {
  isSavedToAppwrite,
  loadFilesFromAppwrite,
  loadFromAppwrite,
  saveFilesToAppwrite,
  saveToAppwrite,
} from "./appwrite";

export interface DatabaseAdapter {
  isSaved(portal: Portal, elements: readonly SyncableExcalidrawElement[]): boolean;
  save(
    portal: Portal,
    elements: readonly SyncableExcalidrawElement[],
    appState: AppState,
  ): Promise<RemoteExcalidrawElement[] | null>;
  load(
    roomId: string,
    roomKey: string,
    socket: Socket | null,
  ): Promise<readonly SyncableExcalidrawElement[] | null>;
  saveFiles(options: {
    prefix: string;
    files: { id: FileId; buffer: Uint8Array }[];
  }): Promise<{ savedFiles: FileId[]; erroredFiles: FileId[] }>;
  loadFiles(
    prefix: string,
    decryptionKey: string,
    filesIds: readonly FileId[],
  ): Promise<{ loadedFiles: BinaryFileData[]; erroredFiles: Map<FileId, true> }>;
}

class AppwriteAdapter implements DatabaseAdapter {
  isSaved = isSavedToAppwrite;
  save = saveToAppwrite;
  load = loadFromAppwrite;
  saveFiles = saveFilesToAppwrite;
  loadFiles = loadFilesFromAppwrite;
}

// Export the adapter instance
export const databaseAdapter = new AppwriteAdapter();
