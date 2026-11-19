import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { v4 as uuidv4 } from "uuid";
import {
  AccountTab,
  BackupData,
  Category,
  IconSize,
  LayoutMode,
  LinkItem,
  LinkItemType,
  TargetOS,
} from "../types";
import { DEFAULT_SLOT_ID } from "../services/firebase";
import * as firebaseService from "../services/firebaseService";
import { toast } from "sonner";

export interface AddAccountResult {
  alreadyOpen: boolean;
  slotId: string;
}

interface LaunchpadContextType {
  links: LinkItem[];
  categories: Category[];
  appTitle: string;
  backgroundImage: string;
  logoImage: string;
  iconSize: IconSize;
  layoutMode: LayoutMode;
  saveLink: (
    title: string,
    url: string,
    customIconUrl: string | undefined,
    categoryId: string | null,
    existingId?: string,
    itemType?: LinkItemType,
    launchArgs?: string,
    targetOs?: TargetOS
  ) => void;
  deleteLink: (id: string) => void;
  duplicateLink: (id: string) => void;
  addCategory: (title: string, parentId?: string | null) => void;
  updateCategory: (id: string, title: string, parentId?: string | null) => void;
  deleteCategory: (id: string) => void;
  duplicateCategory: (id: string) => void;
  getLinkData: (id: string) => LinkItem | undefined;
  getCategoryData: (
    id: string
  ) => { category: Category; subcategories: Category[]; links: LinkItem[] } | undefined;
  importLink: (link: LinkItem, parentId?: string | null) => void;
  importCategory: (
    data: { category: Category; subcategories: Category[]; links: LinkItem[] },
    parentId?: string | null
  ) => void;
  updateAppTitle: (title: string) => void;
  updateBackgroundImage: (url: string) => void;
  updateLogoImage: (url: string) => void;
  updateIconSize: (size: IconSize) => void;
  updateLayoutMode: (mode: LayoutMode) => void;
  // Reorder methods
  replaceLinks: (newLinks: LinkItem[]) => void;
  replaceCategories: (newCategories: Category[]) => void;
  // Multi-account & Cloud (Firebase)
  accounts: AccountTab[];
  activeSlotId: string | null;
  isSwitchingAccount: boolean;
  isCloudConnected: boolean;
  isSyncing: boolean;
  isAuthReady: boolean;
  lastSyncTime: number | null;
  userEmail: string | null;
  switchAccount: (slotId: string) => Promise<void>;
  addAccountWithEmail: (email: string, password: string) => Promise<AddAccountResult>;
  registerAccountWithEmail: (email: string, password: string) => Promise<AddAccountResult>;
  removeAccount: (slotId: string) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  disconnectCloud: () => Promise<void>;
  // Error handling
  error: string | null;
  clearError: () => void;
}

interface WorkspaceSnapshot {
  links: LinkItem[];
  categories: Category[];
  appTitle: string;
  backgroundImage: string;
  logoImage: string;
  iconSize: IconSize;
  layoutMode: LayoutMode;
}

interface CachedAccountState extends WorkspaceSnapshot {
  lastUpdated: number;
  lastSyncTime: number | null;
}

const LaunchpadContext = createContext<LaunchpadContextType | undefined>(undefined);

const DEFAULT_BG =
  "https://images.unsplash.com/photo-1477346611705-65d1883cee1e?q=80&w=2070&auto=format&fit=crop";
const DEFAULT_LOGO =
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=500&auto=format&fit=crop";

const STORAGE_ACCOUNTS_KEY = "launchpad_account_tabs";
const STORAGE_ACTIVE_SLOT_KEY = "launchpad_active_slot";

const createDefaultWorkspace = (): WorkspaceSnapshot => ({
  links: [],
  categories: [],
  appTitle: "LaunchPad",
  backgroundImage: DEFAULT_BG,
  logoImage: DEFAULT_LOGO,
  iconSize: "medium",
  layoutMode: "grid",
});

const serializeWorkspace = (w: WorkspaceSnapshot): string =>
  JSON.stringify({
    links: w.links,
    categories: w.categories,
    appTitle: w.appTitle,
    backgroundImage: w.backgroundImage,
    logoImage: w.logoImage,
    iconSize: w.iconSize,
    layoutMode: w.layoutMode,
  });

const readStoredAccounts = (): AccountTab[] => {
  try {
    const raw = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AccountTab =>
        Boolean(item && typeof item.slotId === "string" && typeof item.email === "string")
    );
  } catch {
    return [];
  }
};

const persistAccounts = (tabs: AccountTab[], activeSlot: string | null) => {
  try {
    if (tabs.length > 0) {
      localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(tabs));
    } else {
      localStorage.removeItem(STORAGE_ACCOUNTS_KEY);
    }
    if (activeSlot) {
      localStorage.setItem(STORAGE_ACTIVE_SLOT_KEY, activeSlot);
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_SLOT_KEY);
    }
  } catch (e) {
    console.warn("Could not persist account tabs metadata:", e);
  }
};

const mapAuthError = (e: any): string => {
  switch (e?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Correo o contraseña incorrectos.";
    case "auth/email-already-in-use":
      return "Ya existe una cuenta registrada con este correo.";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres.";
    case "auth/invalid-email":
      return "El formato del correo electrónico no es válido.";
    case "auth/too-many-requests":
      return "Demasiados intentos fallidos. Intenta de nuevo más tarde.";
    case "auth/operation-not-allowed":
      return "Este método de inicio de sesión no está habilitado en Firebase Authentication.";
    case "auth/unauthorized-domain":
      return "Este dominio no está autorizado en Firebase Authentication.";
    default:
      return "Error de autenticación con Firebase.";
  }
};

export const LaunchpadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [appTitle, setAppTitle] = useState("LaunchPad");
  const [backgroundImage, setBackgroundImage] = useState(DEFAULT_BG);
  const [logoImage, setLogoImage] = useState(DEFAULT_LOGO);
  const [iconSize, setIconSize] = useState<IconSize>("medium");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");

  // Multi-account & Firebase Cloud State
  const [accounts, setAccounts] = useState<AccountTab[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Refs for optimized single-listener sync & instant switching
  const accountsRef = useRef<AccountTab[]>([]);
  const activeSlotIdRef = useRef<string | null>(null);
  const activeUidRef = useRef<string | null>(null);
  const unsubscribeFirestoreRef = useRef<(() => void) | null>(null);
  const activationSeqRef = useRef(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<{ slotId: string; uid: string } | null>(null);
  const accountCacheRef = useRef<Map<string, CachedAccountState>>(new Map());
  const prevDataRef = useRef<string>(serializeWorkspace(createDefaultWorkspace()));
  const localLastUpdatedRef = useRef<number>(0);

  const latestDataRef = useRef<WorkspaceSnapshot>(createDefaultWorkspace());
  latestDataRef.current = {
    links,
    categories,
    appTitle,
    backgroundImage,
    logoImage,
    iconSize,
    layoutMode,
  };

  accountsRef.current = accounts;

  const activeAccount = useMemo(
    () => accounts.find((a) => a.slotId === activeSlotId) ?? null,
    [accounts, activeSlotId]
  );

  const isCloudConnected = Boolean(activeSlotId && activeAccount);
  const userEmail = activeAccount?.email ?? null;

  const updateAccountsState = useCallback(
    (updater: (prev: AccountTab[]) => AccountTab[], nextActiveSlot?: string | null) => {
      setAccounts((prev) => {
        const next = updater(prev);
        accountsRef.current = next;
        const resolvedActive =
          nextActiveSlot !== undefined ? nextActiveSlot : activeSlotIdRef.current;
        persistAccounts(next, resolvedActive);
        return next;
      });
    },
    []
  );

  const applyWorkspaceSnapshot = useCallback(
    (snapshot: WorkspaceSnapshot, lastUpdated: number, syncTime: number | null) => {
      const serialized = serializeWorkspace(snapshot);
      prevDataRef.current = serialized;
      localLastUpdatedRef.current = lastUpdated;
      latestDataRef.current = snapshot;

      setLinks(snapshot.links);
      setCategories(snapshot.categories);
      setAppTitle(snapshot.appTitle);
      setBackgroundImage(snapshot.backgroundImage);
      setLogoImage(snapshot.logoImage);
      setIconSize(snapshot.iconSize);
      setLayoutMode(snapshot.layoutMode);
      setLastSyncTime(syncTime);
    },
    []
  );

  const performSaveToCloud = useCallback(
    async (slotId: string, uid: string, snapshotOverride?: WorkspaceSnapshot) => {
      const snapshot = snapshotOverride ?? latestDataRef.current;
      const timestamp = localLastUpdatedRef.current || Date.now();
      localLastUpdatedRef.current = timestamp;

      // Keep in-memory cache up to date immediately
      accountCacheRef.current.set(slotId, {
        ...snapshot,
        lastUpdated: timestamp,
        lastSyncTime: timestamp,
      });

      if (activeSlotIdRef.current === slotId) {
        setIsSyncing(true);
      }

      const backupData: BackupData = {
        links: snapshot.links,
        categories: snapshot.categories,
        appTitle: snapshot.appTitle,
        backgroundImage: snapshot.backgroundImage,
        logoImage: snapshot.logoImage,
        iconSize: snapshot.iconSize,
        layoutMode: snapshot.layoutMode,
        lastUpdated: timestamp,
      };

      try {
        await firebaseService.saveUserData(uid, backupData, slotId);
        if (activeSlotIdRef.current === slotId) {
          setLastSyncTime(timestamp);
        }
      } catch (err: any) {
        console.error(`Error saving slot ${slotId} to Firestore:`, err);
        if (activeSlotIdRef.current === slotId) {
          if (err?.code === "permission-denied") {
            setError(
              "Permiso denegado en Firestore. Revisa las reglas de seguridad de la colección 'users' en Firebase Console."
            );
          } else {
            setError("No se pudieron guardar los cambios en Firebase.");
          }
        }
      } finally {
        if (activeSlotIdRef.current === slotId) {
          setIsSyncing(false);
        }
      }
    },
    []
  );

  const flushPendingSave = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (pending) {
      pendingSaveRef.current = null;
      await performSaveToCloud(pending.slotId, pending.uid, { ...latestDataRef.current });
    }
  }, [performSaveToCloud]);

  const triggerAutoSave = useCallback(() => {
    const slotId = activeSlotIdRef.current;
    const uid = activeUidRef.current;
    if (!slotId || !uid) return;

    // Update cache immediately on local edit so switching tabs feels 100% live
    accountCacheRef.current.set(slotId, {
      ...latestDataRef.current,
      lastUpdated: localLastUpdatedRef.current,
      lastSyncTime,
    });

    pendingSaveRef.current = { slotId, uid };
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      const target = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (target) {
        performSaveToCloud(target.slotId, target.uid);
      }
    }, 800);
  }, [lastSyncTime, performSaveToCloud]);

  const detachFirestoreListener = useCallback(() => {
    if (unsubscribeFirestoreRef.current) {
      unsubscribeFirestoreRef.current();
      unsubscribeFirestoreRef.current = null;
    }
  }, []);

  /**
   * Activates a single account slot: detaches any previous Firestore listener,
   * hydrates instantly from memory cache if available, verifies Auth, and
   * subscribes to the active account's Firestore document.
   */
  const activateSlot = useCallback(
    async (
      slotId: string,
      opts?: { knownUid?: string; knownEmail?: string; skipFlush?: boolean }
    ): Promise<boolean> => {
      const seq = ++activationSeqRef.current;

      if (!opts?.skipFlush) {
        // Persist current tab's latest state in memory cache and flush pending writes
        const prevSlot = activeSlotIdRef.current;
        if (prevSlot && prevSlot !== slotId) {
          accountCacheRef.current.set(prevSlot, {
            ...latestDataRef.current,
            lastUpdated: localLastUpdatedRef.current,
            lastSyncTime,
          });
        }
        await flushPendingSave();
        if (seq !== activationSeqRef.current) return false;
      }

      detachFirestoreListener();
      setError(null);

      // Hydrate immediately from memory cache (0ms switch) or clean defaults to avoid data bleed
      const cached = accountCacheRef.current.get(slotId);
      const tabMeta = accountsRef.current.find((a) => a.slotId === slotId);

      if (cached) {
        applyWorkspaceSnapshot(
          {
            links: cached.links,
            categories: cached.categories,
            appTitle: cached.appTitle,
            backgroundImage: cached.backgroundImage,
            logoImage: cached.logoImage,
            iconSize: cached.iconSize,
            layoutMode: cached.layoutMode,
          },
          cached.lastUpdated,
          cached.lastSyncTime
        );
      } else {
        const clean = createDefaultWorkspace();
        if (tabMeta?.appTitle) clean.appTitle = tabMeta.appTitle;
        if (tabMeta?.logoImage) clean.logoImage = tabMeta.logoImage;
        applyWorkspaceSnapshot(clean, 0, null);
        setIsSwitchingAccount(true);
      }

      activeSlotIdRef.current = slotId;
      setActiveSlotId(slotId);
      persistAccounts(accountsRef.current, slotId);

      // Resolve Firebase Auth for this slot (lazy init for inactive slots)
      let uid = opts?.knownUid ?? null;
      let email = opts?.knownEmail ?? tabMeta?.email ?? "";

      if (!uid) {
        const user = await firebaseService.waitForSlotUser(slotId);
        if (seq !== activationSeqRef.current) return false;
        if (!user) {
          setIsSwitchingAccount(false);
          return false;
        }
        uid = user.uid;
        email = user.email || email;
      }

      activeUidRef.current = uid;
      setIsSyncing(true);

      let isFirstSnapshot = true;

      unsubscribeFirestoreRef.current = firebaseService.subscribeToUserData(
        uid,
        async (data, hasPendingWrites) => {
          if (seq !== activationSeqRef.current || activeSlotIdRef.current !== slotId) return;

          if (isFirstSnapshot) {
            isFirstSnapshot = false;

            if (data) {
              const cloudLastUpdated = data.lastUpdated || Date.now();
              const nextWorkspace: WorkspaceSnapshot = {
                links: data.links || [],
                categories: data.categories || [],
                appTitle: data.appTitle || "LaunchPad",
                backgroundImage: data.backgroundImage || DEFAULT_BG,
                logoImage: data.logoImage || DEFAULT_LOGO,
                iconSize: data.iconSize || "medium",
                layoutMode: data.layoutMode || "grid",
              };

              applyWorkspaceSnapshot(nextWorkspace, cloudLastUpdated, cloudLastUpdated);
              accountCacheRef.current.set(slotId, {
                ...nextWorkspace,
                lastUpdated: cloudLastUpdated,
                lastSyncTime: cloudLastUpdated,
              });

              // Sync tab bar label/logo if changed
              updateAccountsState((prev) =>
                prev.map((tab) =>
                  tab.slotId === slotId
                    ? {
                        ...tab,
                        uid: uid!,
                        email: email || tab.email,
                        appTitle: nextWorkspace.appTitle,
                        logoImage: nextWorkspace.logoImage,
                      }
                    : tab
                )
              );
            } else {
              // Brand-new user document: initialize with clean defaults (never another account's data)
              const clean = createDefaultWorkspace();
              applyWorkspaceSnapshot(clean, Date.now(), null);
              await performSaveToCloud(slotId, uid!, clean);
            }

            setIsSyncing(false);
            setIsSwitchingAccount(false);
            return;
          }

          // Subsequent real-time updates from another browser/device
          if (hasPendingWrites || !data) return;
          const cloudLastUpdated = data.lastUpdated || 0;
          if (cloudLastUpdated <= localLastUpdatedRef.current) return;

          const nextWorkspace: WorkspaceSnapshot = {
            links: data.links || [],
            categories: data.categories || [],
            appTitle: data.appTitle || "LaunchPad",
            backgroundImage: data.backgroundImage || DEFAULT_BG,
            logoImage: data.logoImage || DEFAULT_LOGO,
            iconSize: data.iconSize || "medium",
            layoutMode: data.layoutMode || "grid",
          };

          applyWorkspaceSnapshot(nextWorkspace, cloudLastUpdated, cloudLastUpdated);
          accountCacheRef.current.set(slotId, {
            ...nextWorkspace,
            lastUpdated: cloudLastUpdated,
            lastSyncTime: cloudLastUpdated,
          });

          updateAccountsState((prev) =>
            prev.map((tab) =>
              tab.slotId === slotId
                ? {
                    ...tab,
                    appTitle: nextWorkspace.appTitle,
                    logoImage: nextWorkspace.logoImage,
                  }
                : tab
            )
          );
        },
        (err: any) => {
          if (seq !== activationSeqRef.current) return;
          console.error("Firestore subscription error:", err);
          setIsSyncing(false);
          setIsSwitchingAccount(false);
          if (err?.code === "permission-denied") {
            setError(
              "Permiso denegado en Firestore. Habilita Firestore y configura las reglas para 'users/{userId}'."
            );
          } else {
            setError("Error conectando con Firestore.");
          }
        },
        slotId
      );

      return true;
    },
    [
      applyWorkspaceSnapshot,
      detachFirestoreListener,
      flushPendingSave,
      lastSyncTime,
      performSaveToCloud,
      updateAccountsState,
    ]
  );

  // Cold-boot restore: ONLY initializes the active tab (lazy-loads inactive tabs on click)
  useEffect(() => {
    let cancelled = false;

    const cleanupLegacyStorage = () => {
      const keysToRemove = [
        "launchpad_links",
        "launchpad_categories",
        "launchpad_title",
        "launchpad_bg",
        "launchpad_logo",
        "launchpad_icon_size",
        "launchpad_layout_mode",
        "launchpad_last_updated",
        "launchpad_drive_connected",
        "launchpad_guest_mode",
        "google_access_token",
        "google_user_email",
      ];
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    };

    const bootstrap = async () => {
      try {
        cleanupLegacyStorage();
        const storedTabs = readStoredAccounts();
        const storedActive = localStorage.getItem(STORAGE_ACTIVE_SLOT_KEY);

        // Case 1: No stored tab list yet — check default Firebase slot for existing single-account session
        if (storedTabs.length === 0) {
          const defaultUser = await firebaseService.waitForSlotUser(DEFAULT_SLOT_ID);
          if (cancelled) return;

          if (defaultUser) {
            const initialTab: AccountTab = {
              slotId: DEFAULT_SLOT_ID,
              uid: defaultUser.uid,
              email: defaultUser.email || "",
              appTitle: "LaunchPad",
              logoImage: DEFAULT_LOGO,
            };
            accountsRef.current = [initialTab];
            setAccounts([initialTab]);
            persistAccounts([initialTab], DEFAULT_SLOT_ID);
            await activateSlot(DEFAULT_SLOT_ID, {
              knownUid: defaultUser.uid,
              knownEmail: defaultUser.email || "",
              skipFlush: true,
            });
          }
          return;
        }

        // Case 2: Stored tabs exist — ONLY wake the active tab (fallback to next valid tab if expired)
        let remaining = [...storedTabs];
        const preferredSlot =
          storedActive && remaining.some((t) => t.slotId === storedActive)
            ? storedActive
            : remaining[0].slotId;

        // Order candidate slots: preferred first, then others only if preferred expired
        const ordered = [
          ...remaining.filter((t) => t.slotId === preferredSlot),
          ...remaining.filter((t) => t.slotId !== preferredSlot),
        ];

        let activated = false;
        for (const candidate of ordered) {
          const user = await firebaseService.waitForSlotUser(candidate.slotId);
          if (cancelled) return;

          if (user) {
            remaining = remaining.map((t) =>
              t.slotId === candidate.slotId
                ? { ...t, uid: user.uid, email: user.email || t.email }
                : t
            );
            accountsRef.current = remaining;
            setAccounts(remaining);
            persistAccounts(remaining, candidate.slotId);

            await activateSlot(candidate.slotId, {
              knownUid: user.uid,
              knownEmail: user.email || candidate.email,
              skipFlush: true,
            });
            activated = true;
            break;
          } else {
            // Session expired for this slot — clean it up and try next
            remaining = remaining.filter((t) => t.slotId !== candidate.slotId);
          }
        }

        if (!activated && !cancelled) {
          accountsRef.current = [];
          setAccounts([]);
          activeSlotIdRef.current = null;
          activeUidRef.current = null;
          setActiveSlotId(null);
          persistAccounts([], null);
        }
      } catch (err) {
        console.error("Auth bootstrap error:", err);
      } finally {
        if (!cancelled) setIsAuthReady(true);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      detachFirestoreListener();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save whenever active workspace data mutates
  useEffect(() => {
    if (!isAuthReady || !activeSlotIdRef.current) return;

    const currentData = serializeWorkspace({
      links,
      categories,
      appTitle,
      backgroundImage,
      logoImage,
      iconSize,
      layoutMode,
    });

    if (currentData !== prevDataRef.current) {
      localLastUpdatedRef.current = Date.now();
      prevDataRef.current = currentData;
      triggerAutoSave();
    }
  }, [
    links,
    categories,
    appTitle,
    backgroundImage,
    logoImage,
    iconSize,
    layoutMode,
    isAuthReady,
    triggerAutoSave,
  ]);

  // --- Multi-Account Actions ---

  const switchAccount = useCallback(
    async (targetSlotId: string) => {
      if (targetSlotId === activeSlotIdRef.current) return;
      const targetTab = accountsRef.current.find((a) => a.slotId === targetSlotId);
      if (!targetTab) return;

      const ok = await activateSlot(targetSlotId);
      if (!ok && activeSlotIdRef.current === targetSlotId) {
        // Session expired for the clicked tab — remove it and fall back cleanly
        toast.error(`La sesión de ${targetTab.email} expiró. Inicia sesión nuevamente.`);
        accountCacheRef.current.delete(targetSlotId);
        await firebaseService.signOutSlot(targetSlotId);

        const nextTabs = accountsRef.current.filter((t) => t.slotId !== targetSlotId);
        accountsRef.current = nextTabs;
        setAccounts(nextTabs);

        if (nextTabs.length > 0) {
          await activateSlot(nextTabs[0].slotId, { skipFlush: true });
        } else {
          detachFirestoreListener();
          activeSlotIdRef.current = null;
          activeUidRef.current = null;
          setActiveSlotId(null);
          persistAccounts([], null);
          applyWorkspaceSnapshot(createDefaultWorkspace(), 0, null);
        }
      }
    },
    [activateSlot, applyWorkspaceSnapshot, detachFirestoreListener]
  );

  const allocateSlotId = useCallback((): string => {
    const used = new Set(accountsRef.current.map((a) => a.slotId));
    if (!used.has(DEFAULT_SLOT_ID)) return DEFAULT_SLOT_ID;
    return `acc-${uuidv4().slice(0, 8)}`;
  }, []);

  const authenticateIntoNewTab = useCallback(
    async (
      email: string,
      password: string,
      mode: "login" | "register"
    ): Promise<AddAccountResult> => {
      const normalizedEmail = email.trim().toLowerCase();

      // Prevent duplicate tabs before even spinning up a new Firebase instance
      const existingByEmail = accountsRef.current.find(
        (a) => a.email.toLowerCase() === normalizedEmail
      );
      if (existingByEmail) {
        await switchAccount(existingByEmail.slotId);
        return { alreadyOpen: true, slotId: existingByEmail.slotId };
      }

      const slotId = allocateSlotId();

      try {
        setError(null);
        const user =
          mode === "login"
            ? await firebaseService.signInWithEmail(email.trim(), password, slotId)
            : await firebaseService.registerWithEmail(email.trim(), password, slotId);

        // Double-check duplicate by UID
        const existingByUid = accountsRef.current.find((a) => a.uid === user.uid);
        if (existingByUid) {
          await firebaseService.signOutSlot(slotId);
          await switchAccount(existingByUid.slotId);
          return { alreadyOpen: true, slotId: existingByUid.slotId };
        }

        const newTab: AccountTab = {
          slotId,
          uid: user.uid,
          email: user.email || email.trim(),
          appTitle: "LaunchPad",
          logoImage: DEFAULT_LOGO,
        };

        const nextTabs = [...accountsRef.current, newTab];
        accountsRef.current = nextTabs;
        setAccounts(nextTabs);
        persistAccounts(nextTabs, slotId);

        await activateSlot(slotId, {
          knownUid: user.uid,
          knownEmail: newTab.email,
        });

        return { alreadyOpen: false, slotId };
      } catch (e: any) {
        // Clean up temporary non-default Firebase app on failed login/register
        if (slotId !== DEFAULT_SLOT_ID) {
          await firebaseService.signOutSlot(slotId);
        }
        console.error(`Account ${mode} failed:`, e);
        throw new Error(mapAuthError(e));
      }
    },
    [activateSlot, allocateSlotId, switchAccount]
  );

  const addAccountWithEmail = useCallback(
    (email: string, password: string) => authenticateIntoNewTab(email, password, "login"),
    [authenticateIntoNewTab]
  );

  const registerAccountWithEmail = useCallback(
    (email: string, password: string) => authenticateIntoNewTab(email, password, "register"),
    [authenticateIntoNewTab]
  );

  const loginWithEmail = useCallback(
    async (email: string, password: string) => {
      await authenticateIntoNewTab(email, password, "login");
    },
    [authenticateIntoNewTab]
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string) => {
      await authenticateIntoNewTab(email, password, "register");
    },
    [authenticateIntoNewTab]
  );

  const resetPassword = useCallback(async (email: string) => {
    try {
      setError(null);
      await firebaseService.resetPasswordEmail(email.trim(), DEFAULT_SLOT_ID);
    } catch (e: any) {
      console.error("Password reset failed:", e);
      throw new Error(mapAuthError(e));
    }
  }, []);

  const removeAccount = useCallback(
    async (targetSlotId: string) => {
      const currentTabs = accountsRef.current;
      const index = currentTabs.findIndex((t) => t.slotId === targetSlotId);
      if (index === -1) return;

      const isClosingActive = activeSlotIdRef.current === targetSlotId;

      if (isClosingActive) {
        await flushPendingSave();
        detachFirestoreListener();
      }

      accountCacheRef.current.delete(targetSlotId);
      await firebaseService.signOutSlot(targetSlotId);

      const nextTabs = currentTabs.filter((t) => t.slotId !== targetSlotId);
      accountsRef.current = nextTabs;
      setAccounts(nextTabs);

      if (!isClosingActive) {
        persistAccounts(nextTabs, activeSlotIdRef.current);
        return;
      }

      if (nextTabs.length > 0) {
        const nextIndex = Math.min(index, nextTabs.length - 1);
        const nextSlot = nextTabs[nextIndex].slotId;
        persistAccounts(nextTabs, nextSlot);
        await activateSlot(nextSlot, { skipFlush: true });
      } else {
        activeSlotIdRef.current = null;
        activeUidRef.current = null;
        setActiveSlotId(null);
        persistAccounts([], null);
        applyWorkspaceSnapshot(createDefaultWorkspace(), 0, null);
      }
    },
    [activateSlot, applyWorkspaceSnapshot, detachFirestoreListener, flushPendingSave]
  );

  const disconnectCloud = useCallback(async () => {
    if (activeSlotIdRef.current) {
      await removeAccount(activeSlotIdRef.current);
    }
  }, [removeAccount]);

  const clearError = useCallback(() => setError(null), []);

  // --- Standard CRUD Operations ---

  const addCategory = useCallback((title: string, parentId: string | null = null) => {
    if (!title.trim()) return;
    const newCat: Category = {
      id: uuidv4(),
      title: title.trim(),
      parentId: parentId,
    };
    setCategories((prev) => [...prev, newCat]);
  }, []);

  const updateCategory = useCallback(
    (id: string, title: string, parentId?: string | null) => {
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          return {
            ...c,
            title: title.trim(),
            ...(parentId !== undefined ? { parentId } : {}),
          };
        })
      );
    },
    []
  );

  const saveLink = useCallback(
    (
      title: string,
      url: string,
      customIconUrl: string | undefined,
      categoryId: string | null,
      existingId?: string,
      itemType: LinkItemType = "web",
      launchArgs?: string,
      targetOs?: TargetOS
    ) => {
      const normalizedArgs = launchArgs?.trim() || undefined;
      const resolvedTargetOs = itemType === "app" ? targetOs || "all" : undefined;

      if (existingId) {
        setLinks((prev) =>
          prev.map((l) =>
            l.id === existingId
              ? {
                  ...l,
                  title,
                  url,
                  customIconUrl,
                  categoryId: categoryId,
                  itemType,
                  targetOs: resolvedTargetOs,
                  launchArgs: itemType === "app" ? normalizedArgs : undefined,
                }
              : l
          )
        );
      } else {
        const newLink: LinkItem = {
          id: uuidv4(),
          title,
          url,
          itemType,
          ...(resolvedTargetOs ? { targetOs: resolvedTargetOs } : {}),
          ...(itemType === "app" && normalizedArgs ? { launchArgs: normalizedArgs } : {}),
          customIconUrl,
          categoryId: categoryId,
          createdAt: Date.now(),
        };
        setLinks((prev) => [...prev, newLink]);
      }
    },
    []
  );

  const deleteLink = useCallback((id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const deleteCategory = useCallback((categoryId: string) => {
    const categoryToDelete = latestDataRef.current.categories.find((c) => c.id === categoryId);
    const parentOfDeleted = categoryToDelete?.parentId || null;

    setLinks((prev) =>
      prev.map((l) => (l.categoryId === categoryId ? { ...l, categoryId: parentOfDeleted } : l))
    );

    setCategories((prev) =>
      prev
        .filter((c) => c.id !== categoryId)
        .map((c) => (c.parentId === categoryId ? { ...c, parentId: parentOfDeleted } : c))
    );
  }, []);

  const duplicateLink = useCallback((id: string) => {
    setLinks((prev) => {
      const linkToCopy = prev.find((l) => l.id === id);
      if (!linkToCopy) return prev;
      return [
        ...prev,
        {
          ...linkToCopy,
          id: uuidv4(),
          title: `${linkToCopy.title} (Copia)`,
          createdAt: Date.now(),
        },
      ];
    });
  }, []);

  const duplicateCategory = useCallback((categoryId: string) => {
    const currentCategories = latestDataRef.current.categories;
    const currentLinks = latestDataRef.current.links;
    const catToCopy = currentCategories.find((c) => c.id === categoryId);
    if (!catToCopy) return;

    const newCategories: Category[] = [];
    const newLinks: LinkItem[] = [];

    const copyRecursive = (
      oldCatId: string,
      newParentId: string | null,
      isTopLevel: boolean
    ) => {
      const oldCat = currentCategories.find((c) => c.id === oldCatId);
      if (!oldCat) return;

      const newCatId = uuidv4();
      newCategories.push({
        ...oldCat,
        id: newCatId,
        title: isTopLevel ? `${oldCat.title} (Copia)` : oldCat.title,
        parentId: newParentId,
      });

      const catLinks = currentLinks.filter((l) => l.categoryId === oldCatId);
      catLinks.forEach((l) => {
        newLinks.push({
          ...l,
          id: uuidv4(),
          categoryId: newCatId,
          createdAt: Date.now(),
        });
      });

      const subCats = currentCategories.filter((c) => c.parentId === oldCatId);
      subCats.forEach((sub) => {
        copyRecursive(sub.id, newCatId, false);
      });
    };

    copyRecursive(categoryId, catToCopy.parentId || null, true);

    setCategories((prev) => [...prev, ...newCategories]);
    setLinks((prev) => [...prev, ...newLinks]);
  }, []);

  const getLinkData = useCallback(
    (id: string) => latestDataRef.current.links.find((l) => l.id === id),
    []
  );

  const getCategoryData = useCallback((id: string) => {
    const currentCategories = latestDataRef.current.categories;
    const currentLinks = latestDataRef.current.links;
    const category = currentCategories.find((c) => c.id === id);
    if (!category) return undefined;

    const subcategories: Category[] = [];
    const linksInCategory: LinkItem[] = [];

    const gatherRecursive = (catId: string) => {
      const subCats = currentCategories.filter((c) => c.parentId === catId);
      subcategories.push(...subCats);
      subCats.forEach((sub) => gatherRecursive(sub.id));
      linksInCategory.push(...currentLinks.filter((l) => l.categoryId === catId));
    };

    gatherRecursive(id);
    return { category, subcategories, links: linksInCategory };
  }, []);

  const importLink = useCallback((link: LinkItem, parentId: string | null = null) => {
    setLinks((prev) => [
      ...prev,
      { ...link, id: uuidv4(), categoryId: parentId, createdAt: Date.now() },
    ]);
  }, []);

  const importCategory = useCallback(
    (
      data: { category: Category; subcategories: Category[]; links: LinkItem[] },
      parentId: string | null = null
    ) => {
      if (!data || !data.category) {
        console.error("Invalid category data for import");
        return;
      }

      const newCatId = uuidv4();
      const oldCatId = data.category.id;

      const idMap = new Map<string, string>();
      idMap.set(oldCatId, newCatId);

      const newCategories: Category[] = [
        {
          ...data.category,
          id: newCatId,
          parentId: parentId,
        },
      ];

      const subcategories = data.subcategories || [];
      subcategories.forEach((sub) => {
        const newSubId = uuidv4();
        idMap.set(sub.id, newSubId);
        newCategories.push({
          ...sub,
          id: newSubId,
          parentId: idMap.get(sub.parentId || "") || newCatId,
        });
      });

      const linksToImport = data.links || [];
      const newLinks: LinkItem[] = linksToImport.map((l) => ({
        ...l,
        id: uuidv4(),
        categoryId: idMap.get(l.categoryId || "") || newCatId,
        createdAt: Date.now(),
      }));

      setCategories((prev) => [...prev, ...newCategories]);
      setLinks((prev) => [...prev, ...newLinks]);
    },
    []
  );

  const updateAppTitle = useCallback(
    (title: string) => {
      setAppTitle(title);
      const slotId = activeSlotIdRef.current;
      if (slotId) {
        updateAccountsState((prev) =>
          prev.map((tab) => (tab.slotId === slotId ? { ...tab, appTitle: title } : tab))
        );
      }
    },
    [updateAccountsState]
  );

  const updateBackgroundImage = useCallback((url: string) => {
    setBackgroundImage(url || DEFAULT_BG);
  }, []);

  const updateLogoImage = useCallback(
    (url: string) => {
      const nextLogo = url || DEFAULT_LOGO;
      setLogoImage(nextLogo);
      const slotId = activeSlotIdRef.current;
      if (slotId) {
        updateAccountsState((prev) =>
          prev.map((tab) => (tab.slotId === slotId ? { ...tab, logoImage: nextLogo } : tab))
        );
      }
    },
    [updateAccountsState]
  );

  const updateIconSize = useCallback((size: IconSize) => {
    setIconSize(size);
  }, []);

  const updateLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
  }, []);

  const replaceLinks = useCallback((newLinks: LinkItem[]) => {
    setLinks(newLinks);
  }, []);

  const replaceCategories = useCallback((newCategories: Category[]) => {
    setCategories(newCategories);
  }, []);

  const contextValue = useMemo<LaunchpadContextType>(
    () => ({
      links,
      categories,
      appTitle,
      backgroundImage,
      logoImage,
      iconSize,
      layoutMode,
      saveLink,
      deleteLink,
      duplicateLink,
      addCategory,
      updateCategory,
      deleteCategory,
      duplicateCategory,
      getLinkData,
      getCategoryData,
      importLink,
      importCategory,
      updateAppTitle,
      updateBackgroundImage,
      updateLogoImage,
      updateIconSize,
      updateLayoutMode,
      replaceLinks,
      replaceCategories,
      accounts,
      activeSlotId,
      isSwitchingAccount,
      isCloudConnected,
      isSyncing,
      isAuthReady,
      lastSyncTime,
      userEmail,
      switchAccount,
      addAccountWithEmail,
      registerAccountWithEmail,
      removeAccount,
      loginWithEmail,
      registerWithEmail,
      resetPassword,
      disconnectCloud,
      error,
      clearError,
    }),
    [
      links,
      categories,
      appTitle,
      backgroundImage,
      logoImage,
      iconSize,
      layoutMode,
      saveLink,
      deleteLink,
      duplicateLink,
      addCategory,
      updateCategory,
      deleteCategory,
      duplicateCategory,
      getLinkData,
      getCategoryData,
      importLink,
      importCategory,
      updateAppTitle,
      updateBackgroundImage,
      updateLogoImage,
      updateIconSize,
      updateLayoutMode,
      replaceLinks,
      replaceCategories,
      accounts,
      activeSlotId,
      isSwitchingAccount,
      isCloudConnected,
      isSyncing,
      isAuthReady,
      lastSyncTime,
      userEmail,
      switchAccount,
      addAccountWithEmail,
      registerAccountWithEmail,
      removeAccount,
      loginWithEmail,
      registerWithEmail,
      resetPassword,
      disconnectCloud,
      error,
      clearError,
    ]
  );

  return (
    <LaunchpadContext.Provider value={contextValue}>
      {children}
    </LaunchpadContext.Provider>
  );
};

export const useLaunchpad = () => {
  const context = useContext(LaunchpadContext);
  if (!context) {
    throw new Error("useLaunchpad must be used within a LaunchpadProvider");
  }
  return context;
};
