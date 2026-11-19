
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { LinkItem, Category, BackupData, IconSize, LayoutMode } from "../types";
import * as driveService from "../services/driveService";

interface LaunchpadContextType {
  links: LinkItem[];
  categories: Category[];
  appTitle: string;
  backgroundImage: string;
  logoImage: string;
  iconSize: IconSize;
  layoutMode: LayoutMode;
  saveLink: (title: string, url: string, customIconUrl: string | undefined, categoryId: string | null, existingId?: string) => void;
  deleteLink: (id: string) => void;
  duplicateLink: (id: string) => void;
  addCategory: (title: string, parentId?: string | null) => void;
  updateCategory: (id: string, title: string, parentId?: string | null) => void;
  deleteCategory: (id: string) => void;
  duplicateCategory: (id: string) => void;
  getLinkData: (id: string) => LinkItem | undefined;
  getCategoryData: (id: string) => { category: Category, subcategories: Category[], links: LinkItem[] } | undefined;
  importLink: (link: LinkItem, parentId?: string | null) => void;
  importCategory: (data: { category: Category, subcategories: Category[], links: LinkItem[] }, parentId?: string | null) => void;
  updateAppTitle: (title: string) => void;
  updateBackgroundImage: (url: string) => void;
  updateLogoImage: (url: string) => void;
  updateIconSize: (size: IconSize) => void;
  updateLayoutMode: (mode: LayoutMode) => void;
  // New Reorder methods
  replaceLinks: (newLinks: LinkItem[]) => void;
  replaceCategories: (newCategories: Category[]) => void;
  // Drive related
  isDriveConnected: boolean;
  isSyncing: boolean;
  isAuthReady: boolean; // New: knows if initial check is done
  isGuestMode: boolean; // New: knows if user skipped login
  enterGuestMode: () => void; // New: action to skip login
  lastSyncTime: number | null;
  userEmail: string | null;
  connectDrive: () => void;
  disconnectDrive: () => void;
  // Error handling
  error: string | null;
  clearError: () => void;
}

const LaunchpadContext = createContext<LaunchpadContextType | undefined>(undefined);

const DEFAULT_BG = "https://images.unsplash.com/photo-1477346611705-65d1883cee1e?q=80&w=2070&auto=format&fit=crop";
const DEFAULT_LOGO = "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=500&auto=format&fit=crop";

export const LaunchpadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [appTitle, setAppTitle] = useState("LaunchPad");
  const [backgroundImage, setBackgroundImage] = useState(DEFAULT_BG);
  const [logoImage, setLogoImage] = useState(DEFAULT_LOGO);
  const [iconSize, setIconSize] = useState<IconSize>('medium');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');

  // Drive State
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Auth Flow State
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Refs for auto-saving
  const isInitialLoad = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDataRef = useRef<string>("");
  const localLastUpdatedRef = useRef<number>(0);

  // Load session from local storage on mount
  useEffect(() => {
    const storedDriveConnected = localStorage.getItem("launchpad_drive_connected");
    const storedEmail = localStorage.getItem("google_user_email");
    const storedGuestMode = localStorage.getItem("launchpad_guest_mode");

    if (storedEmail) setUserEmail(storedEmail);
    if (storedGuestMode === "true") setIsGuestMode(true);
    
    // Cleanup existing data cache to ensure no persistence
    const keysToRemove = [
      "launchpad_links", "launchpad_categories", "launchpad_title", 
      "launchpad_bg", "launchpad_logo", "launchpad_icon_size", 
      "launchpad_layout_mode", "launchpad_last_updated"
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    prevDataRef.current = JSON.stringify({
       links: [],
       categories: [],
       appTitle: "LaunchPad",
       backgroundImage: DEFAULT_BG,
       logoImage: DEFAULT_LOGO,
       iconSize: 'medium',
       layoutMode: 'grid'
    });

    // Check if we should auto-connect
    if (storedDriveConnected === "true") {
      initializeDrive(true, storedEmail);
    } else {
        // If not trying to auto-connect, we are ready immediately
        setTimeout(() => setIsAuthReady(true), 500);
    }
    
    setIsLoaded(true);
  }, []);

  // Handle data changes and auto-save
  useEffect(() => {
    if (!isLoaded) return;

    const currentData = JSON.stringify({ links, categories, appTitle, backgroundImage, logoImage, iconSize, layoutMode });
    let dataChanged = false;
    if (currentData !== prevDataRef.current) {
       localLastUpdatedRef.current = Date.now();
       prevDataRef.current = currentData;
       dataChanged = true;
    }

    // We no longer save data to localStorage (cache)
    localStorage.setItem("launchpad_guest_mode", isGuestMode ? "true" : "false");
    if (userEmail) localStorage.setItem("google_user_email", userEmail);
    
    // Trigger Auto-Save to Drive
    if (!isInitialLoad.current && isDriveConnected && dataChanged) {
       triggerAutoSave();
    }
    isInitialLoad.current = false;
  }, [links, categories, appTitle, backgroundImage, logoImage, iconSize, isDriveConnected, layoutMode, userEmail, isGuestMode, isLoaded]);

  // --- Google Drive Logic ---

  // Centralized Token Response Handler
  const handleTokenResponse = async (tokenResponse: any) => {
    if (tokenResponse && tokenResponse.access_token) {
      // Set the token for GAPI client
      if ((window as any).gapi && (window as any).gapi.client) {
        (window as any).gapi.client.setToken(tokenResponse);
      }
      
      // SAVE TOKEN TO STORAGE for persistence
      const expiresIn = tokenResponse.expires_in || 3599; // Default 1h
      const tokenWithExpiry = {
        ...tokenResponse,
        expires_at: Date.now() + (expiresIn * 1000)
      };
      localStorage.setItem("google_access_token", JSON.stringify(tokenWithExpiry));

      // Fetch User Profile immediately after token
      try {
          const profile = await driveService.getUserProfile();
          if (profile.email) {
              setUserEmail(profile.email);
              localStorage.setItem("google_user_email", profile.email);
          }
      } catch (e) {
          console.warn("Could not fetch user profile", e);
      }

      setIsDriveConnected(true);
      setIsGuestMode(false);
      localStorage.setItem("launchpad_drive_connected", "true");
      
      // Sync immediately after fresh login
      syncWithDrive();
    } else {
        console.warn("Token response was invalid or error:", tokenResponse);
        // If this was a silent attempt that failed, we ensure we are logged out locally
        if (tokenResponse?.error === 'interaction_required' || tokenResponse?.error) {
           setIsDriveConnected(false);
        }
    }
  };

  const initializeDrive = async (autoConnect = false, emailHint: string | null = null) => {
    try {
      await driveService.initGapiClient();

      // Initialize GIS *before* checking token so we can refresh if needed
      await driveService.initGisClient(handleTokenResponse);

      // 1. Try to restore active session from LocalStorage cache
      let sessionRestored = false;
      const storedTokenStr = localStorage.getItem("google_access_token");
      
      if (storedTokenStr) {
        try {
          const storedToken = JSON.parse(storedTokenStr);
          const now = Date.now();
          // Check if token is valid (with 1 minute buffer safety)
          if (storedToken.expires_at && now < storedToken.expires_at - 60000) {
             if ((window as any).gapi && (window as any).gapi.client) {
               (window as any).gapi.client.setToken(storedToken);
               setIsDriveConnected(true);
               setIsGuestMode(false); 
               sessionRestored = true;
             }
          } else {
            // Token expired
            localStorage.removeItem("google_access_token");
          }
        } catch (e) {
          localStorage.removeItem("google_access_token");
        }
      }

      // 2. Logic: If autoConnect is true but we couldn't restore session (expired), try SILENT refresh
      if (autoConnect && !sessionRestored && emailHint) {
          console.log("Token expired, attempting silent renewal...");
          driveService.requestAccessToken(emailHint, true); // Silent = true
      } 
      // 3. Logic: If session restored, just sync
      else if (sessionRestored) {
        if (!userEmail) {
            driveService.getUserProfile().then(p => setUserEmail(p.email)).catch(() => {});
        }
        await syncWithDrive();
      }

    } catch (error) {
      console.error("Failed to init Drive:", error);
      if (!autoConnect) throw error;
    } finally {
        setIsAuthReady(true);
    }
  };

  const connectDrive = async () => {
    try {
      // Ensure clients are loaded. 
      // If already loaded, this just ensures global vars are set.
      // We pass handleTokenResponse again just in case, though usually init only runs once.
      // Note: initGisClient protects against double-init internally.
      await driveService.initGapiClient();
      await driveService.initGisClient(handleTokenResponse);
      
      // Pass userEmail as hint if we have it remembered
      driveService.requestAccessToken(userEmail || undefined, false); // Interactive
    } catch (e) {
      console.error("Connect flow failed", e);
      setError("Error inicializando Google Drive. Es posible que los servicios de Google no estén cargados aún o que la configuración sea inválida.");
    }
  };

  const disconnectDrive = () => {
    setIsDriveConnected(false);
    setDriveFileId(null);
    setUserEmail(null);
    localStorage.removeItem("launchpad_drive_connected");
    localStorage.removeItem("google_access_token"); 
    localStorage.removeItem("google_user_email"); 
    setIsGuestMode(true); 
    
    try {
      const token = (window as any).gapi.client.getToken();
      if (token !== null) {
        (window as any).google.accounts.oauth2.revoke(token.access_token, () => {});
        (window as any).gapi.client.setToken(null);
      }
    } catch (e) {
      console.warn("Error during disconnect cleanup", e);
    }
  };

  const enterGuestMode = () => {
      setIsGuestMode(true);
  }

  const syncWithDrive = async () => {
    setIsSyncing(true);
    try {
      let fileId = driveFileId;
      if (!fileId) {
        // Try to find file. If this fails with 401, it means token is invalid.
        try {
          fileId = await driveService.findBackupFile();
          setDriveFileId(fileId);
        } catch (err: any) {
           handleApiError(err);
           return;
        }
      }

      if (fileId) {
        // Load from Drive (Cloud wins on connect)
        const data = await driveService.readBackupFile(fileId);
        if (data) {
          const localLastUpdated = localLastUpdatedRef.current;
          
          if (localLastUpdated > data.lastUpdated) {
             console.log("Local data is newer, uploading to Drive...");
             await performSaveToDrive(fileId);
          } else if (localLastUpdated < data.lastUpdated) {
             console.log("Cloud data is newer, downloading...");
             setLinks(data.links);
             setCategories(data.categories);
             setAppTitle(data.appTitle);
             setBackgroundImage(data.backgroundImage);
             setLogoImage(data.logoImage);
             if (data.iconSize) setIconSize(data.iconSize);
             if (data.layoutMode) setLayoutMode(data.layoutMode);
             setLastSyncTime(data.lastUpdated);
             
             // Update prevDataRef so the persist effect doesn't treat this as a user change
             prevDataRef.current = JSON.stringify({
                 links: data.links,
                 categories: data.categories,
                 appTitle: data.appTitle,
                 backgroundImage: data.backgroundImage,
                 logoImage: data.logoImage,
                 iconSize: data.iconSize || 'medium',
                 layoutMode: data.layoutMode || 'grid'
             });
             localLastUpdatedRef.current = data.lastUpdated;
          } else {
             console.log("Data is in sync.");
             setLastSyncTime(data.lastUpdated);
          }
        }
      } else {
        // No file exists, create one with current data
        await performSaveToDrive(null);
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const performSaveToDrive = async (existingFileId: string | null) => {
    if (!isDriveConnected) return;
    setIsSyncing(true);
    
    const localLastUpdated = localLastUpdatedRef.current || Date.now();

    const backupData: BackupData = {
      links,
      categories,
      appTitle,
      backgroundImage,
      logoImage,
      iconSize,
      lastUpdated: localLastUpdated
    };

    try {
      if (existingFileId) {
        await driveService.updateBackupFile(existingFileId, backupData);
      } else {
        // Check finding file one last time
        let fileId = await driveService.findBackupFile();
        if (fileId) {
            await driveService.updateBackupFile(fileId, backupData);
            setDriveFileId(fileId);
        } else {
            fileId = await driveService.createBackupFile(backupData);
            setDriveFileId(fileId);
        }
      }
      setLastSyncTime(Date.now());
    } catch (error: any) {
      handleApiError(error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApiError = (error: any) => {
      console.error("API Error:", error);
      // If error is 401/403, need re-auth
      if (error.status === 401 || (error.result && error.result.error && error.result.error.code === 401)) {
         console.log("Token expired during operation, attempting silent refresh...");
         if (userEmail) {
             // Attempt silent refresh
             driveService.requestAccessToken(userEmail, true);
         } else {
             disconnectDrive();
         }
      }
  };

  const triggerAutoSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Debounce save for 2 seconds
    saveTimeoutRef.current = setTimeout(() => {
      performSaveToDrive(driveFileId);
    }, 2000);
  }, [driveFileId, links, categories, appTitle, backgroundImage, logoImage, iconSize]);

  const clearError = () => setError(null);

  // --- Standard CRUD Operations ---

  const addCategory = (title: string, parentId: string | null = null) => {
    if (!title.trim()) return;
    const newCat: Category = {
      id: uuidv4(),
      title: title.trim(),
      parentId: parentId
    };
    setCategories([...categories, newCat]);
  };

  const updateCategory = (id: string, title: string, parentId?: string | null) => {
    setCategories((prev) =>
      prev.map((c) => {
          if (c.id !== id) return c;
          return {
              ...c,
              title: title.trim(),
              ...(parentId !== undefined ? { parentId } : {})
          }
      })
    );
  };

  const saveLink = (title: string, url: string, customIconUrl: string | undefined, categoryId: string | null, existingId?: string) => {
    if (existingId) {
      // Update
      const updatedLinks = links.map((l) => 
        l.id === existingId 
          ? { ...l, title, url, customIconUrl, categoryId: categoryId } 
          : l
      );
      setLinks(updatedLinks);
    } else {
      // Create
      const newLink: LinkItem = {
        id: uuidv4(),
        title,
        url,
        customIconUrl,
        categoryId: categoryId,
        createdAt: Date.now(),
      };
      setLinks([...links, newLink]);
    }
  };

  const deleteLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  const deleteCategory = (categoryId: string) => {
    const categoryToDelete = categories.find(c => c.id === categoryId);
    const parentOfDeleted = categoryToDelete?.parentId || null;

    // Move links to parent (or root)
    const updatedLinks = links.map((l) => 
      l.categoryId === categoryId ? { ...l, categoryId: parentOfDeleted } : l
    );
    setLinks(updatedLinks);

    // Move subcategories to parent (or root) to avoid losing them
    const updatedCategories = categories
        .filter((c) => c.id !== categoryId) // Remove target
        .map(c => c.parentId === categoryId ? { ...c, parentId: parentOfDeleted } : c); // Hoist children

    setCategories(updatedCategories);
  };

  const duplicateLink = (id: string) => {
    setLinks(prev => {
      const linkToCopy = prev.find(l => l.id === id);
      if (!linkToCopy) return prev;
      return [...prev, { ...linkToCopy, id: uuidv4(), title: `${linkToCopy.title} (Copia)`, createdAt: Date.now() }];
    });
  };

  const duplicateCategory = (categoryId: string) => {
    const catToCopy = categories.find(c => c.id === categoryId);
    if (!catToCopy) return;

    const newCategories: Category[] = [];
    const newLinks: LinkItem[] = [];

    const copyRecursive = (oldCatId: string, newParentId: string | null, isTopLevel: boolean) => {
      const oldCat = categories.find(c => c.id === oldCatId);
      if (!oldCat) return;

      const newCatId = uuidv4();
      newCategories.push({
        ...oldCat,
        id: newCatId,
        title: isTopLevel ? `${oldCat.title} (Copia)` : oldCat.title,
        parentId: newParentId
      });

      const catLinks = links.filter(l => l.categoryId === oldCatId);
      catLinks.forEach(l => {
        newLinks.push({
          ...l,
          id: uuidv4(),
          categoryId: newCatId,
          createdAt: Date.now()
        });
      });

      const subCats = categories.filter(c => c.parentId === oldCatId);
      subCats.forEach(sub => {
        copyRecursive(sub.id, newCatId, false);
      });
    };

    copyRecursive(categoryId, catToCopy.parentId || null, true);

    setCategories(prev => [...prev, ...newCategories]);
    setLinks(prev => [...prev, ...newLinks]);
  };

  const getLinkData = (id: string) => links.find(l => l.id === id);

  const getCategoryData = (id: string) => {
    const category = categories.find(c => c.id === id);
    if (!category) return undefined;

    const subcategories: Category[] = [];
    const linksInCategory: LinkItem[] = [];

    const gatherRecursive = (catId: string) => {
      const subCats = categories.filter(c => c.parentId === catId);
      subcategories.push(...subCats);
      subCats.forEach(sub => gatherRecursive(sub.id));
      linksInCategory.push(...links.filter(l => l.categoryId === catId));
    };

    gatherRecursive(id);
    return { category, subcategories, links: linksInCategory };
  };

  const importLink = (link: LinkItem, parentId: string | null = null) => {
    console.log("Importing link:", link.title, "to parent:", parentId);
    setLinks(prev => [...prev, { ...link, id: uuidv4(), categoryId: parentId, createdAt: Date.now() }]);
  };

  const importCategory = (data: { category: Category, subcategories: Category[], links: LinkItem[] }, parentId: string | null = null) => {
    if (!data || !data.category) {
        console.error("Invalid category data for import");
        return;
    }
    
    console.log("Importing category:", data.category.title, "to parent:", parentId);
    
    const newCatId = uuidv4();
    const oldCatId = data.category.id;
    
    const idMap = new Map<string, string>();
    idMap.set(oldCatId, newCatId);

    const newCategories: Category[] = [{
      ...data.category,
      id: newCatId,
      parentId: parentId
    }];

    const subcategories = data.subcategories || [];
    subcategories.forEach(sub => {
      const newSubId = uuidv4();
      idMap.set(sub.id, newSubId);
      newCategories.push({
        ...sub,
        id: newSubId,
        parentId: idMap.get(sub.parentId || "") || newCatId
      });
    });

    const linksToImport = data.links || [];
    const newLinks: LinkItem[] = linksToImport.map(l => ({
      ...l,
      id: uuidv4(),
      categoryId: idMap.get(l.categoryId || "") || newCatId,
      createdAt: Date.now()
    }));

    console.log(`Importing ${newCategories.length} categories and ${newLinks.length} links`);

    setCategories(prev => [...prev, ...newCategories]);
    setLinks(prev => [...prev, ...newLinks]);
  };

  const updateAppTitle = (title: string) => {
    setAppTitle(title);
  };

  const updateBackgroundImage = (url: string) => {
    setBackgroundImage(url || DEFAULT_BG);
  };

  const updateLogoImage = (url: string) => {
    setLogoImage(url || DEFAULT_LOGO);
  };

  const updateIconSize = (size: IconSize) => {
    setIconSize(size);
  }
  
  const updateLayoutMode = (mode: LayoutMode) => {
    setLayoutMode(mode);
  }

  // --- Reorder Operations ---
  const replaceLinks = (newLinks: LinkItem[]) => {
    console.log("Replacing all links with:", newLinks.length, "items");
    setLinks(newLinks);
  }

  const replaceCategories = (newCategories: Category[]) => {
    console.log("Replacing all categories with:", newCategories.length, "items");
    setCategories(newCategories);
  }

  return (
    <LaunchpadContext.Provider
      value={{
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
        // Drive exports
        isDriveConnected,
        isSyncing,
        isAuthReady,
        isGuestMode,
        enterGuestMode,
        lastSyncTime,
        userEmail,
        connectDrive,
        disconnectDrive,
        error,
        clearError
      }}
    >
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
