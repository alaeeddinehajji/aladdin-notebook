import { Client, Databases, ID, Query, Permission, Role } from "appwrite";
import { trackActivity } from "./telemetry";
import { dbg } from "./debug";

export type User = {
  $id: string;
  email: string;
  name: string;
  role: string;
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
  dbg.log("register: starting", { email, name });
  try {
    const db = getDatabases();

    // Check if email already exists
    dbg.log("register: checking existing email");
    const existing = await db.listDocuments(DB_ID, "users", [
      Query.equal("email", email),
    ]);
    if (existing.documents.length > 0) {
      throw new Error("An account with this email already exists");
    }

    const hashed = await hashPassword(password);
    dbg.log("register: creating user document");
    const doc = await db.createDocument(DB_ID, "users", ID.unique(), {
      email,
      password: hashed,
      name,
    }, [
      Permission.read(Role.any()),
      Permission.update(Role.any()),
      Permission.delete(Role.any()),
    ]);

    const user: User = { $id: doc.$id, email, name, role: doc.role || "user" };
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    dbg.log("register: success", { userId: doc.$id });
    trackActivity("register", {
      resourceType: "user",
      resourceId: doc.$id,
      method: "POST",
      success: true,
    });
    return user;
  } catch (err) {
    dbg.trace("register failed", err);
    throw err;
  }
};

export const login = async (
  email: string,
  password: string,
): Promise<User> => {
  dbg.log("login: starting", { email });
  try {
    const db = getDatabases();

    dbg.log("login: querying users collection");
    const results = await db.listDocuments(DB_ID, "users", [
      Query.equal("email", email),
    ]);
    dbg.log("login: query returned", results.documents.length, "documents");

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
      role: userDoc.role || "user",
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    dbg.log("login: success", { userId: userDoc.$id, role: user.role });
    trackActivity("login", {
      resourceType: "user",
      resourceId: userDoc.$id,
      method: "POST",
      success: true,
    });
    return user;
  } catch (err) {
    dbg.trace("login failed", err);
    throw err;
  }
};

export const logout = (): void => {
  const user = getCurrentUser();
  if (user) {
    trackActivity("logout", {
      resourceType: "user",
      resourceId: user.$id,
      method: "POST",
      success: true,
    });
  }
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

export const isAdmin = (): boolean => {
  const user = getCurrentUser();
  return user?.role === "admin" || user?.role === "owner";
};

export const isOwner = (): boolean => {
  const user = getCurrentUser();
  return user?.role === "owner";
};
