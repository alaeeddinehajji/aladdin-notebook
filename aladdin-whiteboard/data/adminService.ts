import { Client, Databases, Query } from "appwrite";

// ---------------------------------------------------------------------------
// Appwrite client
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminUser = {
  $id: string;
  email: string;
  name: string;
  role: string;
  $createdAt: string;
  $updatedAt: string;
};

export type AdminDrawing = {
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

export type AdminFolder = {
  $id: string;
  name: string;
  parentId: string;
  userId: string;
  color: string;
  createdAt: string;
  $createdAt: string;
};

export type AdminErrorLog = {
  $id: string;
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
  $createdAt: string;
};

export type AdminActivityLog = {
  $id: string;
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
  $createdAt: string;
};

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const listAllUsers = async (
  limit = 100,
  offset = 0,
): Promise<{ total: number; users: AdminUser[] }> => {
  const db = getDatabases();
  const res = await db.listDocuments(DB_ID, "users", [
    Query.limit(limit),
    Query.offset(offset),
    Query.orderDesc("$createdAt"),
  ]);
  return {
    total: res.total,
    users: res.documents as unknown as AdminUser[],
  };
};

export const getUserById = async (userId: string): Promise<AdminUser | null> => {
  const db = getDatabases();
  try {
    const doc = await db.getDocument(DB_ID, "users", userId);
    return doc as unknown as AdminUser;
  } catch {
    return null;
  }
};

export const updateUserRole = async (
  userId: string,
  role: string,
): Promise<void> => {
  const db = getDatabases();
  await db.updateDocument(DB_ID, "users", userId, { role });
};

export const deleteUser = async (userId: string): Promise<void> => {
  const db = getDatabases();
  await db.deleteDocument(DB_ID, "users", userId);
};

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

export const listAllDrawings = async (
  limit = 100,
  offset = 0,
  userId?: string,
): Promise<{ total: number; drawings: AdminDrawing[] }> => {
  const db = getDatabases();
  const queries = [
    Query.limit(limit),
    Query.offset(offset),
    Query.orderDesc("lastModified"),
  ];
  if (userId) {
    queries.push(Query.equal("userId", userId));
  }
  const res = await db.listDocuments(DB_ID, "drawings", queries);
  return {
    total: res.total,
    drawings: res.documents as unknown as AdminDrawing[],
  };
};

export const listAllFolders = async (
  limit = 100,
  offset = 0,
  userId?: string,
): Promise<{ total: number; folders: AdminFolder[] }> => {
  const db = getDatabases();
  const queries = [
    Query.limit(limit),
    Query.offset(offset),
    Query.orderDesc("$createdAt"),
  ];
  if (userId) {
    queries.push(Query.equal("userId", userId));
  }
  const res = await db.listDocuments(DB_ID, "folders", queries);
  return {
    total: res.total,
    folders: res.documents as unknown as AdminFolder[],
  };
};

// ---------------------------------------------------------------------------
// Error Logs
// ---------------------------------------------------------------------------

export const listErrorLogs = async (
  limit = 50,
  offset = 0,
  filters?: { level?: string; source?: string },
): Promise<{ total: number; logs: AdminErrorLog[] }> => {
  const db = getDatabases();
  const queries = [
    Query.limit(limit),
    Query.offset(offset),
    Query.orderDesc("timestamp"),
  ];
  if (filters?.level) {
    queries.push(Query.equal("level", filters.level));
  }
  if (filters?.source) {
    queries.push(Query.equal("source", filters.source));
  }
  const res = await db.listDocuments(DB_ID, "error_logs", queries);
  return {
    total: res.total,
    logs: res.documents as unknown as AdminErrorLog[],
  };
};

export const getErrorLog = async (id: string): Promise<AdminErrorLog | null> => {
  const db = getDatabases();
  try {
    const doc = await db.getDocument(DB_ID, "error_logs", id);
    return doc as unknown as AdminErrorLog;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Activity Logs
// ---------------------------------------------------------------------------

export const listActivityLogs = async (
  limit = 50,
  offset = 0,
  filters?: { userId?: string; action?: string; success?: boolean },
): Promise<{ total: number; logs: AdminActivityLog[] }> => {
  const db = getDatabases();
  const queries = [
    Query.limit(limit),
    Query.offset(offset),
    Query.orderDesc("timestamp"),
  ];
  if (filters?.userId) {
    queries.push(Query.equal("userId", filters.userId));
  }
  if (filters?.action) {
    queries.push(Query.equal("action", filters.action));
  }
  if (filters?.success !== undefined) {
    queries.push(Query.equal("success", filters.success));
  }
  const res = await db.listDocuments(DB_ID, "activity_logs", queries);
  return {
    total: res.total,
    logs: res.documents as unknown as AdminActivityLog[],
  };
};

export const getActivityLog = async (id: string): Promise<AdminActivityLog | null> => {
  const db = getDatabases();
  try {
    const doc = await db.getDocument(DB_ID, "activity_logs", id);
    return doc as unknown as AdminActivityLog;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

export type DashboardStats = {
  totalUsers: number;
  totalDrawings: number;
  totalFolders: number;
  errorsLast24h: number;
  activitiesLast24h: number;
};

export const getDashboardStats = async (): Promise<DashboardStats> => {
  const db = getDatabases();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [users, drawings, folders, recentErrors, recentActivity] =
    await Promise.all([
      db.listDocuments(DB_ID, "users", [Query.limit(1)]),
      db.listDocuments(DB_ID, "drawings", [Query.limit(1)]),
      db.listDocuments(DB_ID, "folders", [Query.limit(1)]),
      db.listDocuments(DB_ID, "error_logs", [
        Query.greaterThan("timestamp", yesterday),
        Query.limit(1),
      ]).catch(() => ({ total: 0 })),
      db.listDocuments(DB_ID, "activity_logs", [
        Query.greaterThan("timestamp", yesterday),
        Query.limit(1),
      ]).catch(() => ({ total: 0 })),
    ]);

  return {
    totalUsers: users.total,
    totalDrawings: drawings.total,
    totalFolders: folders.total,
    errorsLast24h: recentErrors.total,
    activitiesLast24h: recentActivity.total,
  };
};

export const getRecentErrors = async (
  limit = 5,
): Promise<AdminErrorLog[]> => {
  const db = getDatabases();
  const res = await db.listDocuments(DB_ID, "error_logs", [
    Query.orderDesc("timestamp"),
    Query.limit(limit),
  ]);
  return res.documents as unknown as AdminErrorLog[];
};

export const getRecentActivity = async (
  limit = 10,
): Promise<AdminActivityLog[]> => {
  const db = getDatabases();
  const res = await db.listDocuments(DB_ID, "activity_logs", [
    Query.orderDesc("timestamp"),
    Query.limit(limit),
  ]);
  return res.documents as unknown as AdminActivityLog[];
};
