
export type LinkItemType = 'web' | 'app';
export type TargetOS = 'win32' | 'linux' | 'darwin' | 'all';

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  itemType?: LinkItemType; // Defaults to 'web'; 'app' launches local PC software on Desktop
  targetOs?: TargetOS; // Which desktop OS displays this app ('win32' | 'linux' | 'darwin' | 'all')
  launchArgs?: string; // Optional CLI arguments for local PC software
  customIconUrl?: string; // Optional custom image URL or local extracted icon data URL
  categoryId?: string | null; // If null, it's on the root desktop
  createdAt: number;
}

export interface Category {
  id: string;
  title: string;
  parentId?: string | null; // ID of the parent category, or null if root
}

export type ViewMode = 'desktop' | 'folder';
export type LayoutMode = 'grid' | 'list';
export type IconSize = 'small' | 'medium' | 'large';

export interface AppState {
  links: LinkItem[];
  categories: Category[];
}

export interface BackupData {
  links: LinkItem[];
  categories: Category[];
  appTitle: string;
  backgroundImage: string;
  logoImage: string;
  iconSize: IconSize;
  layoutMode?: LayoutMode;
  lastUpdated: number;
}

export interface UserProfile {
  name: string;
  email: string;
  picture: string;
}

export interface AccountTab {
  slotId: string;
  uid: string;
  email: string;
  appTitle: string;
  logoImage?: string;
}
