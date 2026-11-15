/**
 * Firebase Community Cloud Sync Configuration
 * 
 * Configured for Tour Lyrics under Firebase Project 'song-app-475cf'
 * Dedicated Collection: 'tour_lyrics'
 */

export interface FirebaseAppConfig {
  projectId: string;
  apiKey?: string;
  appId?: string;
  authDomain?: string;
  databaseURL?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  collectionName?: string;
  enabled: boolean;
}

export const FIREBASE_CONFIG: FirebaseAppConfig = {
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'song-app-475cf',
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBDVwg-62O0W6s5i3NL3l655xyUtWipbkw',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1088760138913:web:a5f7df58eebd1315d774e0',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'song-app-475cf.firebaseapp.com',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'song-app-475cf.firebasestorage.app',
  messagingSenderId: '1088760138913',
  collectionName: 'tour_lyrics',
  enabled: true, // Auto-enabled for live hybrid community sync
};
