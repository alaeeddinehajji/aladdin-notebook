import { Client, Databases, ID, Query, Permission, Role } from "appwrite";

const DOC_PERMISSIONS = [
  Permission.read(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
];

// Types
// -----------------------------------------------------------------------------

export type DrawingDocument = {
  $id: string;
  name: string;
  folderId: string;
  userId: string;
  storageFileId: string;
  thumbnail: string;
  lastModified: string;
  $createdAt: string;
  $updatedAt: string;
};

export type FolderDocument = {
  $id: string;
  name: string;
  parentId: string;
  userId: string;
  color: string;
  createdAt: string;
  $createdAt: string;
  $updatedAt: string;
};

// Appwrite client singleton
// -----------------------------------------------------------------------------

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

// Folder operations
// -----------------------------------------------------------------------------

export const listFolders = async (
  userId: string,
  parentId: string = "",
): Promise<FolderDocument[]> => {
  const db = getDatabases();
  const queries = [
    Query.equal("userId", userId),
    Query.orderAsc("name"),
    Query.limit(100),
  ];
  if (parentId) {
    queries.push(Query.equal("parentId", parentId));
  } else {
    queries.push(Query.equal("parentId", ""));
  }

  const res = await db.listDocuments(DB_ID, "folders", queries);
  return res.documents as unknown as FolderDocument[];
};

export const createFolder = async (
  userId: string,
  name: string,
  parentId: string = "",
  color: string = "#19789E",
): Promise<FolderDocument> => {
  const db = getDatabases();
  const doc = await db.createDocument(DB_ID, "folders", ID.unique(), {
    name,
    parentId,
    userId,
    color,
    createdAt: new Date().toISOString(),
  }, DOC_PERMISSIONS);
  return doc as unknown as FolderDocument;
};

export const deleteFolder = async (
  userId: string,
  folderId: string,
): Promise<void> => {
  const db = getDatabases();
  const drawings = await listDrawings(userId, folderId);
  for (const drawing of drawings) {
    await deleteDrawing(drawing.$id, drawing.storageFileId);
  }
  const subFolders = await listFolders(userId, folderId);
  for (const sub of subFolders) {
    await deleteFolder(userId, sub.$id);
  }
  await db.deleteDocument(DB_ID, "folders", folderId);
};

export const renameFolder = async (
  folderId: string,
  name: string,
): Promise<void> => {
  const db = getDatabases();
  await db.updateDocument(DB_ID, "folders", folderId, { name });
};

// Drawing operations
// -----------------------------------------------------------------------------

export const listDrawings = async (
  userId: string,
  folderId: string = "",
): Promise<DrawingDocument[]> => {
  const db = getDatabases();
  const queries = [
    Query.equal("userId", userId),
    Query.orderDesc("lastModified"),
    Query.limit(100),
  ];
  if (folderId) {
    queries.push(Query.equal("folderId", folderId));
  } else {
    queries.push(Query.equal("folderId", ""));
  }

  const res = await db.listDocuments(DB_ID, "drawings", queries);
  return res.documents as unknown as DrawingDocument[];
};

export const getDrawingById = async (
  drawingId: string,
): Promise<DrawingDocument | null> => {
  const db = getDatabases();
  try {
    const doc = await db.getDocument(DB_ID, "drawings", drawingId);
    return doc as unknown as DrawingDocument;
  } catch {
    return null;
  }
};

export const saveDrawingToCloud = async (
  userId: string,
  name: string,
  sceneData: object,
  folderId: string = "",
  existingDrawingId?: string,
  _existingStorageFileId?: string,
): Promise<DrawingDocument> => {
  const db = getDatabases();
  const now = new Date().toISOString();
  const jsonStr = JSON.stringify(sceneData);

  if (existingDrawingId) {
    // Update existing drawing metadata
    const doc = await db.updateDocument(
      DB_ID,
      "drawings",
      existingDrawingId,
      {
        name,
        folderId,
        lastModified: now,
      },
      DOC_PERMISSIONS,
    );

    // Upsert scene data in drawing_data collection
    try {
      const existing = await db.listDocuments(DB_ID, "drawing_data", [
        Query.equal("drawingId", existingDrawingId),
        Query.limit(1),
      ]);
      if (existing.documents.length > 0) {
        await db.updateDocument(
          DB_ID,
          "drawing_data",
          existing.documents[0].$id,
          { sceneData: jsonStr },
          DOC_PERMISSIONS,
        );
      } else {
        await db.createDocument(DB_ID, "drawing_data", ID.unique(), {
          drawingId: existingDrawingId,
          sceneData: jsonStr,
        }, DOC_PERMISSIONS);
      }
    } catch (err) {
      console.error("Failed to save scene data:", err);
      throw err;
    }

    return doc as unknown as DrawingDocument;
  } else {
    // Create new drawing
    const drawingDoc = await db.createDocument(DB_ID, "drawings", ID.unique(), {
      name,
      folderId,
      userId,
      storageFileId: "",
      thumbnail: "",
      lastModified: now,
    }, DOC_PERMISSIONS);

    // Store scene data
    await db.createDocument(DB_ID, "drawing_data", ID.unique(), {
      drawingId: drawingDoc.$id,
      sceneData: jsonStr,
    }, DOC_PERMISSIONS);

    return drawingDoc as unknown as DrawingDocument;
  }
};

export const loadDrawingFromCloud = async (
  drawingId: string,
): Promise<object> => {
  const db = getDatabases();
  try {
    const res = await db.listDocuments(DB_ID, "drawing_data", [
      Query.equal("drawingId", drawingId),
      Query.limit(1),
    ]);
    if (res.documents.length > 0) {
      return JSON.parse(res.documents[0].sceneData as string);
    }
  } catch (err) {
    console.error("Failed to load drawing data:", err);
  }
  return {};
};

export const deleteDrawing = async (
  drawingId: string,
  _storageFileId?: string,
): Promise<void> => {
  const db = getDatabases();
  // Delete scene data
  try {
    const res = await db.listDocuments(DB_ID, "drawing_data", [
      Query.equal("drawingId", drawingId),
      Query.limit(1),
    ]);
    if (res.documents.length > 0) {
      await db.deleteDocument(DB_ID, "drawing_data", res.documents[0].$id);
    }
  } catch {
    // ignore
  }
  await db.deleteDocument(DB_ID, "drawings", drawingId);
};

export const renameDrawing = async (
  drawingId: string,
  name: string,
): Promise<void> => {
  const db = getDatabases();
  await db.updateDocument(DB_ID, "drawings", drawingId, { name });
};

export const moveDrawing = async (
  drawingId: string,
  folderId: string,
): Promise<void> => {
  const db = getDatabases();
  await db.updateDocument(DB_ID, "drawings", drawingId, { folderId });
};

// Folder path resolution
// -----------------------------------------------------------------------------

export const getFolderByNameAndParent = async (
  userId: string,
  name: string,
  parentId: string = "",
): Promise<FolderDocument | null> => {
  const db = getDatabases();
  const queries = [
    Query.equal("userId", userId),
    Query.equal("name", name),
    Query.equal("parentId", parentId || ""),
    Query.limit(1),
  ];
  const res = await db.listDocuments(DB_ID, "folders", queries);
  if (res.documents.length > 0) {
    return res.documents[0] as unknown as FolderDocument;
  }
  return null;
};

export type ResolvedFolder = {
  folderId: string;
  breadcrumb: { id: string; name: string }[];
};

export const resolveFolderPath = async (
  userId: string,
  pathSegments: string[],
): Promise<ResolvedFolder | null> => {
  let parentId = "";
  const breadcrumb: { id: string; name: string }[] = [];

  for (const segment of pathSegments) {
    const folder = await getFolderByNameAndParent(userId, segment, parentId);
    if (!folder) {
      return null;
    }
    breadcrumb.push({ id: folder.$id, name: folder.name });
    parentId = folder.$id;
  }

  return { folderId: parentId, breadcrumb };
};

export const getFolderById = async (
  folderId: string,
): Promise<FolderDocument | null> => {
  const db = getDatabases();
  try {
    const doc = await db.getDocument(DB_ID, "folders", folderId);
    return doc as unknown as FolderDocument;
  } catch {
    return null;
  }
};

export const buildFolderPath = async (
  folderId: string,
): Promise<string[]> => {
  const segments: string[] = [];
  let currentId = folderId;
  while (currentId) {
    const folder = await getFolderById(currentId);
    if (!folder) {
      break;
    }
    segments.unshift(folder.name);
    currentId = folder.parentId;
  }
  return segments;
};

// Version snapshot operations
// -----------------------------------------------------------------------------

export const getNextVersionNumber = async (
  drawingId: string,
  trigger: "auto" | "manual" | "restore",
): Promise<number> => {
  const db = getDatabases();
  const res = await db.listDocuments(DB_ID, "version_snapshots", [
    Query.equal("drawingId", drawingId),
    Query.equal("trigger", trigger),
    Query.orderDesc("timestamp"),
    Query.limit(1),
  ]);
  
  const snapshots = res.documents as unknown as VersionSnapshot[];
  if (snapshots.length === 0) {
    return 1;
  }
  
  // Extract number from existing version name
  const latestSnapshot = snapshots[0];
  const nameMatch = latestSnapshot.customName?.match(/(\d+)$/);
  if (nameMatch) {
    return parseInt(nameMatch[1], 10) + 1;
  }
  
  return 1;
};

export type VersionSnapshot = {
  $id: string;
  drawingId: string;
  userId: string;
  timestamp: string;
  canvasData: string;
  trigger: string;
  customName: string;
  starred: boolean;
  restoredFromVersionId: string;
  $createdAt: string;
  $updatedAt: string;
};

export const createVersionSnapshot = async (
  drawingId: string,
  userId: string,
  canvasData: object,
  trigger: "auto" | "manual" | "restore" = "auto",
  restoredFromVersionId: string = "",
  customName: string = "",
): Promise<VersionSnapshot> => {
  const db = getDatabases();
  
  // Generate automatic numbered name if customName is not provided
  let finalCustomName = customName;
  if (!finalCustomName) {
    const nextNumber = await getNextVersionNumber(drawingId, trigger);
    if (trigger === "manual") {
      finalCustomName = `Session ${nextNumber}`;
    } else if (trigger === "restore") {
      finalCustomName = `Restored ${nextNumber}`;
    } else {
      finalCustomName = `Auto ${nextNumber}`;
    }
  }
  
  const data: Record<string, unknown> = {
    drawingId,
    userId,
    timestamp: new Date().toISOString(),
    canvasData: JSON.stringify(canvasData),
    trigger,
    customName: finalCustomName,
  };
  if (restoredFromVersionId) {
    data.restoredFromVersionId = restoredFromVersionId;
  }
  const doc = await db.createDocument(
    DB_ID,
    "version_snapshots",
    ID.unique(),
    data,
    DOC_PERMISSIONS,
  );
  return doc as unknown as VersionSnapshot;
};

export const listVersionSnapshots = async (
  drawingId: string,
  limit: number = 50,
): Promise<VersionSnapshot[]> => {
  const db = getDatabases();
  const res = await db.listDocuments(DB_ID, "version_snapshots", [
    Query.equal("drawingId", drawingId),
    Query.orderDesc("timestamp"),
    Query.limit(limit),
  ]);
  return res.documents as unknown as VersionSnapshot[];
};

export const getVersionSnapshot = async (
  snapshotId: string,
): Promise<VersionSnapshot | null> => {
  const db = getDatabases();
  try {
    const doc = await db.getDocument(DB_ID, "version_snapshots", snapshotId);
    return doc as unknown as VersionSnapshot;
  } catch {
    return null;
  }
};

export const deleteVersionSnapshot = async (
  snapshotId: string,
): Promise<void> => {
  const db = getDatabases();
  await db.deleteDocument(DB_ID, "version_snapshots", snapshotId);
};

export const updateVersionSnapshot = async (
  snapshotId: string,
  data: { customName?: string; starred?: boolean },
): Promise<VersionSnapshot> => {
  const db = getDatabases();
  const doc = await db.updateDocument(DB_ID, "version_snapshots", snapshotId, data);
  return doc as unknown as VersionSnapshot;
};

export const deleteOldSnapshots = async (
  drawingId: string,
  keepDays: number = 30,
): Promise<void> => {
  const db = getDatabases();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);
  try {
    const old = await db.listDocuments(DB_ID, "version_snapshots", [
      Query.equal("drawingId", drawingId),
      Query.lessThan("timestamp", cutoff.toISOString()),
      Query.limit(100),
    ]);
    for (const doc of old.documents) {
      await db.deleteDocument(DB_ID, "version_snapshots", doc.$id);
    }
  } catch {
    // ignore cleanup errors
  }
};
