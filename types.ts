
export interface LinkItem {
  id: string;
  title: string;
  url: string;
  customIconUrl?: string; // Optional custom image URL
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
  lastUpdated: number;
}

export interface UserProfile {
  name: string;
  email: string;
  picture: string;
}
