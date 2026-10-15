import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const optionalConfig = {
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const config = Object.fromEntries(
  Object.entries({ ...requiredConfig, ...optionalConfig }).filter(([, value]) => value?.trim()),
);

export const missingFirebaseConfig = Object.entries(requiredConfig)
  .filter(([, value]) => !value?.trim())
  .map(([key]) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`);

export const isFirebaseConfigured = missingFirebaseConfig.length === 0;
export const firebaseConfigError = isFirebaseConfigured
  ? null
  : new Error(`Firebase is not configured. Add these values to client/.env.local: ${missingFirebaseConfig.join(', ')}`);

export const firebaseApp = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(config))
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;
export const database = firebaseApp ? getDatabase(firebaseApp) : null;