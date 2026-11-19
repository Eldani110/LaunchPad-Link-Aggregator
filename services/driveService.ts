
import { BackupData, UserProfile } from "../types";

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// Configuración de Google Drive
const CLIENT_ID = "104999126680-mncb94qv5b9egj7df905dhte5r6mbj2h.apps.googleusercontent.com";
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
// Add userinfo.email to scopes to get the email address
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';
const BACKUP_FILENAME = 'launchpad_backup.json';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

// Helper to wait for specific global conditions
const waitForCondition = (predicate: () => boolean, timeout = 10000, label: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (predicate()) {
      resolve();
      return;
    }
    
    let timeElapsed = 0;
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
      }
      timeElapsed += 100;
      if (timeElapsed > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for: ${label}`));
      }
    }, 100);
  });
};

// Initialize GAPI (for requests)
export const initGapiClient = async (): Promise<void> => {
  if (gapiInited) return;
  
  try {
    // Wait for window.gapi
    await waitForCondition(() => !!window.gapi, 10000, "gapi script");
    
    await new Promise<void>((resolve, reject) => {
      window.gapi.load('client', async () => {
        try {
          await window.gapi.client.init({
            // apiKey: API_KEY, // REMOVED: Do not use Gemini API key here.
            discoveryDocs: [DISCOVERY_DOC],
          });
          gapiInited = true;
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  } catch (error) {
    console.error("GAPI load error:", error);
    throw error;
  }
};

// Initialize GIS (for auth)
export const initGisClient = async (onTokenCallback: (resp: any) => void): Promise<void> => {
  try {
    // Wait specifically for window.google.accounts
    await waitForCondition(
      () => !!window.google && !!window.google.accounts, 
      10000, 
      "google.accounts script"
    );

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: onTokenCallback,
    });
    gisInited = true;
  } catch (error) {
    console.error("GIS load error:", error);
    throw error;
  }
};

// Trigger Login Popup or Silent Refresh
// Accepts an optional emailHint to bypass account selection
// Accepts silent flag to attempt background refresh without popup
export const requestAccessToken = (emailHint?: string, silent: boolean = false) => {
  if (!tokenClient) {
    throw new Error("Google Identity Services not initialized. Please refresh or try again.");
  }
  
  // Configure the request
  const config: any = {
    prompt: silent ? 'none' : '', // 'none' throws error if interaction needed, '' allows consent screen
  };

  if (emailHint) {
    config.login_hint = emailHint;
    // GIS v2 uses login_hint, though sometimes hint works depending on version, login_hint is standard
    config.hint = emailHint; 
  }

  // Check if we already have a token
  const token = window.gapi.client.getToken();
  if (!token || silent) {
      // If silent, we always request to see if we can renew
      tokenClient.requestAccessToken(config);
  } else {
      // If requesting interactively and we have a token, just refresh it
      tokenClient.requestAccessToken(config);
  }
};

// Fetch User Profile (Email, Name, Photo)
export const getUserProfile = async (): Promise<UserProfile> => {
  try {
    // We use the generic request method to hit the userinfo endpoint
    const response = await window.gapi.client.request({
      'path': 'https://www.googleapis.com/oauth2/v3/userinfo',
    });
    return response.result as UserProfile;
  } catch (err) {
    console.error("Error fetching user profile:", err);
    throw err;
  }
};

// Find the backup file
export const findBackupFile = async (): Promise<string | null> => {
  try {
    const response = await window.gapi.client.drive.files.list({
      q: `name = '${BACKUP_FILENAME}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    const files = response.result.files;
    if (files && files.length > 0) {
      return files[0].id;
    }
    return null;
  } catch (err) {
    console.error("Error finding file:", err);
    throw err;
  }
};

// Read content of backup file
export const readBackupFile = async (fileId: string): Promise<BackupData | null> => {
  try {
    const response = await window.gapi.client.drive.files.get({
      fileId: fileId,
      alt: 'media',
    });
    return response.result as BackupData;
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
};

// Create new file
export const createBackupFile = async (data: BackupData): Promise<string> => {
  const fileContent = JSON.stringify(data);
  const file = new Blob([fileContent], { type: 'application/json' });
  const metadata = {
    name: BACKUP_FILENAME,
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  try {
    // We must manually get the token from gapi client for fetch requests
    const tokenObj = window.gapi.client.getToken();
    if (!tokenObj) throw new Error("No access token found");
    const accessToken = tokenObj.access_token;
    
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form,
    });
    const json = await response.json();
    return json.id;
  } catch (err) {
    console.error("Error creating file:", err);
    throw err;
  }
};

// Update existing file
export const updateBackupFile = async (fileId: string, data: BackupData): Promise<void> => {
  const fileContent = JSON.stringify(data);
  const file = new Blob([fileContent], { type: 'application/json' });
  const metadata = {
    mimeType: 'application/json',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  try {
    const tokenObj = window.gapi.client.getToken();
    if (!tokenObj) throw new Error("No access token found");
    const accessToken = tokenObj.access_token;

    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
      method: 'PATCH',
      headers: new Headers({ 'Authorization': 'Bearer ' + accessToken }),
      body: form,
    });
  } catch (err) {
    console.error("Error updating file:", err);
    throw err;
  }
};
