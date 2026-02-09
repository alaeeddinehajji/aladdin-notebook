import { Client, Databases, ID, Query, Permission, Role } from "appwrite";

export type User = {
  $id: string;
  email: string;
  name: string;
};

const SESSION_KEY = "aladdin_notes_session";

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

// Simple hash for password (not production-grade, but works for DB-based auth)
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const register = async (
  email: string,
  password: string,
  name: string,
): Promise<User> => {
  const db = getDatabases();

  // Check if email already exists
  const existing = await db.listDocuments(DB_ID, "users", [
    Query.equal("email", email),
  ]);
  if (existing.documents.length > 0) {
    throw new Error("An account with this email already exists");
  }

  const hashed = await hashPassword(password);
  const doc = await db.createDocument(DB_ID, "users", ID.unique(), {
    email,
    password: hashed,
    name,
  }, [
    Permission.read(Role.any()),
    Permission.update(Role.any()),
    Permission.delete(Role.any()),
  ]);

  const user: User = { $id: doc.$id, email, name };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
};

export const login = async (
  email: string,
  password: string,
): Promise<User> => {
  const db = getDatabases();

  const results = await db.listDocuments(DB_ID, "users", [
    Query.equal("email", email),
  ]);

  if (results.documents.length === 0) {
    throw new Error("Invalid email or password");
  }

  const userDoc = results.documents[0];
  const hashed = await hashPassword(password);

  if (userDoc.password !== hashed) {
    throw new Error("Invalid email or password");
  }

  const user: User = {
    $id: userDoc.$id,
    email: userDoc.email,
    name: userDoc.name,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  return user;
};

export const logout = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

export const getCurrentUser = (): User | null => {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as User;
  } catch {
    return null;
  }
};

export const isLoggedIn = (): boolean => {
  return getCurrentUser() !== null;
};
