import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  User,
} from "firebase/auth";
import {
  doc,
  onSnapshot,
  setDoc,
  Unsubscribe,
} from "firebase/firestore";
import {
  DEFAULT_SLOT_ID,
  destroySlotFirebase,
  getSlotFirebase,
} from "./firebase";
import { BackupData } from "../types";

const COLLECTION_NAME = "users";

// Firestore rejects `undefined` values anywhere in a document payload
const sanitizeForFirestore = <T,>(data: T): T => {
  return JSON.parse(JSON.stringify(data));
};

export const waitForSlotUser = async (
  slotId: string = DEFAULT_SLOT_ID
): Promise<User | null> => {
  const { auth } = getSlotFirebase(slotId);
  await auth.authStateReady();
  return auth.currentUser;
};

export const signInWithEmail = async (
  email: string,
  password: string,
  slotId: string = DEFAULT_SLOT_ID
): Promise<User> => {
  const { auth } = getSlotFirebase(slotId);
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const registerWithEmail = async (
  email: string,
  password: string,
  slotId: string = DEFAULT_SLOT_ID
): Promise<User> => {
  const { auth } = getSlotFirebase(slotId);
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const resetPasswordEmail = async (
  email: string,
  slotId: string = DEFAULT_SLOT_ID
): Promise<void> => {
  const { auth } = getSlotFirebase(slotId);
  await sendPasswordResetEmail(auth, email);
};

export const signOutSlot = async (
  slotId: string = DEFAULT_SLOT_ID
): Promise<void> => {
  await destroySlotFirebase(slotId);
};

export const saveUserData = async (
  uid: string,
  data: BackupData,
  slotId: string = DEFAULT_SLOT_ID
): Promise<void> => {
  const { db } = getSlotFirebase(slotId);
  const docRef = doc(db, COLLECTION_NAME, uid);
  await setDoc(docRef, sanitizeForFirestore(data), { merge: true });
};

export const subscribeToUserData = (
  uid: string,
  onData: (data: BackupData | null, hasPendingWrites: boolean) => void,
  onError: (error: Error) => void,
  slotId: string = DEFAULT_SLOT_ID
): Unsubscribe => {
  const { db } = getSlotFirebase(slotId);
  const docRef = doc(db, COLLECTION_NAME, uid);
  return onSnapshot(
    docRef,
    (snap) => {
      const hasPendingWrites = snap.metadata.hasPendingWrites;
      if (!snap.exists()) {
        onData(null, hasPendingWrites);
      } else {
        onData(snap.data() as BackupData, hasPendingWrites);
      }
    },
    onError
  );
};
