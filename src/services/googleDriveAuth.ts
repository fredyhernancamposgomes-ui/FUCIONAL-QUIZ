import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Google Auth Provider with Google Drive readonly & file scopes
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/drive.file');
// FORCE Google consent prompt to prevent 'insufficient authentication scopes'
provider.setCustomParameters({
  prompt: 'consent select_account',
});

// In-memory token cache (NEVER stored in localStorage per security guidelines)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  iconLink?: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

// Auth State Listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Sign in with Google (Popup with forced consent prompt)
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google Drive con permisos suficientes.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Error during Google Sign-In:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Get current in-memory access token
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Sign out and clear cached token
export const googleSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Browse Drive Folder Contents (My Drive / subfolders) with visual navigation
export const listDriveFolderContents = async (
  accessToken: string,
  folderId: string = 'root',
  searchQuery: string = ''
): Promise<DriveItem[]> => {
  try {
    let q: string;
    if (searchQuery.trim()) {
      const sanitized = searchQuery.replace(/'/g, "\\'");
      // When searching, find matching folders or study documents anywhere in Drive
      q = `name contains '${sanitized}' and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/pdf' or mimeType contains 'image/' or mimeType contains 'text/' or mimeType = 'application/vnd.google-apps.document')`;
    } else {
      // Manual folder navigation: show all children of folderId (folders first, then files)
      q = `'${folderId}' in parents and trashed = false and (mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/pdf' or mimeType contains 'image/' or mimeType contains 'text/' or mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')`;
    }

    const fields = 'files(id, name, mimeType, size, modifiedTime, thumbnailLink, iconLink)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&orderBy=folder desc,modifiedTime desc&pageSize=100&fields=${encodeURIComponent(fields)}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = errData?.error?.message || '';
      if (msg.includes('insufficient authentication scopes') || res.status === 403) {
        throw new Error(
          'Permisos insuficientes para Google Drive. Por favor haz clic en "Desconectar" y vuelve a conectar tu cuenta aceptando los permisos de lectura de Drive.'
        );
      }
      throw new Error(msg || `Error al acceder a Google Drive (${res.status})`);
    }

    const data = await res.json();
    const files: any[] = data.files || [];

    return files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      size: f.size,
      modifiedTime: f.modifiedTime,
      thumbnailLink: f.thumbnailLink,
      iconLink: f.iconLink,
    }));
  } catch (err: any) {
    console.error('Error in listDriveFolderContents:', err);
    throw err;
  }
};

// Download file binary/blob from Google Drive by fileId
export const downloadDriveFileBlob = async (
  accessToken: string,
  fileId: string,
  mimeType?: string
): Promise<{ blob: Blob; base64: string }> => {
  try {
    // If it's a Google Doc, export as PDF
    const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
    const url = isGoogleDoc
      ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || '';
      if (msg.includes('insufficient authentication scopes') || res.status === 403) {
        throw new Error(
          'Permisos insuficientes al descargar el archivo. Desconéctate y vuelve a iniciar sesión marcando la casilla de permisos de Drive.'
        );
      }
      throw new Error(msg || `Error descargando archivo de Google Drive (${res.status})`);
    }

    const blob = await res.blob();

    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Strip data:mime/type;base64,
        const base64Clean = result.split(',')[1] || result;
        resolve(base64Clean);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    return { blob, base64 };
  } catch (err: any) {
    console.error('Error downloading Drive file:', err);
    throw err;
  }
};
