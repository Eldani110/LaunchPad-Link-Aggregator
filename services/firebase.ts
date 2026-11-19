import { deleteApp, FirebaseApp, getApps, initializeApp } from "firebase/app";
import { Auth, getAuth, signOut } from "firebase/auth";
import { Firestore, getFirestore, terminate } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const DEFAULT_SLOT_ID = "default";

export interface FirebaseSlotContext {
  slotId: string;
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

// Default app instance (keeps compatibility with existing sessions)
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const slotRegistry = new Map<string, FirebaseSlotContext>([
  [DEFAULT_SLOT_ID, { slotId: DEFAULT_SLOT_ID, app, auth, db }],
]);

/**
 * Lazily gets or initializes an isolated Firebase App + Auth + Firestore instance
 * for a given account slot. Inactive tabs are never initialized until needed.
 */
export const getSlotFirebase = (slotId: string = DEFAULT_SLOT_ID): FirebaseSlotContext => {
  const existing = slotRegistry.get(slotId);
  if (existing) return existing;

  const existingApp = getApps().find((a) => a.name === slotId);
  const slotApp = existingApp ?? initializeApp(firebaseConfig, slotId);
  const slotAuth = getAuth(slotApp);
  const slotDb = getFirestore(slotApp);

  const ctx: FirebaseSlotContext = {
    slotId,
    app: slotApp,
    auth: slotAuth,
    db: slotDb,
  };
  slotRegistry.set(slotId, ctx);
  return ctx;
};

/**
 * Signs out and tears down a slot's Firebase resources to prevent memory/socket leaks.
 * For the default app we only sign out so it remains reusable.
 */
export const destroySlotFirebase = async (slotId: string): Promise<void> => {
  const ctx = slotRegistry.get(slotId) ?? (slotId === DEFAULT_SLOT_ID ? getSlotFirebase(DEFAULT_SLOT_ID) : null);

  // If the slot wasn't initialized yet in this page load, initialize briefly to clear its persisted IndexedDB auth session
  const resolved = ctx ?? getSlotFirebase(slotId);

  try {
    await signOut(resolved.auth);
  } catch (err) {
    console.warn(`Error signing out slot ${slotId}:`, err);
  }

  if (slotId === DEFAULT_SLOT_ID) return;

  slotRegistry.delete(slotId);

  try {
    await terminate(resolved.db);
  } catch (err) {
    console.warn(`Error terminating Firestore for slot ${slotId}:`, err);
  }

  try {
    await deleteApp(resolved.app);
  } catch (err) {
    console.warn(`Error deleting Firebase app for slot ${slotId}:`, err);
  }
};
