/**
 * Firebase Firestore Cloud Sync Service (Offline-First Real-Time Architecture)
 * 
 * - Full Two-Way Synchronization (Local Dexie IndexedDB <-> Firebase Firestore)
 * - Standard RFC4122 UUID v4 for all documents and sub-relations
 * - Schema 100% aligned with song-app (title, lyrics map, references array, timestamps)
 * - Real-time onSnapshot listener for instant live updates across devices
 * - Zero audio upload (keeps MP3 blobs 100% local on device)
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../data/db';
import { SongRecord, PlaylistRecord } from '../types';
import { FIREBASE_CONFIG } from '../config/firebase.config';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function songToFirestore(song: SongRecord): Record<string, any> {
  const nowMs = Date.parse(song.updatedAt) || Date.now();
  const createdMs = Date.parse(song.createdAt) || nowMs;

  return {
    id: song.id,
    title: song.titleBn || song.titleLatin,
    title_lowercase: (song.titleBn || song.titleLatin).toLowerCase(),
    title_bn: song.titleBn,
    title_latin: song.titleLatin,
    category_id: song.categoryId || 'other',
    created_at: createdMs,
    updated_at: nowMs,
    is_deleted: false,
    created_by_user: song.createdByUser || 'Tour_Artist',
    lyrics: song.lyricsBn
      ? {
          id: generateUUID(),
          song_id: song.id,
          content: song.lyricsBn,
          status: song.lyricsStatus || 'unreviewed',
          updated_at: nowMs,
        }
      : null,
    references: song.youtubeUrl
      ? [
          {
            id: generateUUID(),
            song_id: song.id,
            title: song.titleLatin || song.titleBn,
            url: song.youtubeUrl,
            video_id: song.youtubeVideoId || '',
            type: 'youtube',
            updated_at: nowMs,
          },
        ]
      : [],
  };
}

export function firestoreToSong(data: Record<string, any>, docId: string): SongRecord {
  const id = data.id || docId;
  const titleBn = (data.title_bn || data.title || data.title_latin || 'Untitled').trim();
  const titleLatin = (data.title_latin || data.title || titleBn).trim();
  const lyricsContent = data.lyrics?.content || data.lyricsBn || '';
  const youtubeUrl = data.references?.[0]?.url || data.youtubeUrl || '';
  const youtubeVideoId = data.references?.[0]?.video_id || data.youtubeVideoId || '';
  const categoryId = data.category_id || data.categoryId || 'other';
  const nowIso = new Date().toISOString();
  const createdIso = data.created_at ? new Date(data.created_at).toISOString() : nowIso;
  const updatedIso = data.updated_at ? new Date(data.updated_at).toISOString() : nowIso;

  return {
    id,
    importSerial: null,
    titleBn,
    titleLatin,
    aliases: [],
    categoryId,
    youtubeUrl,
    youtubeVideoId,
    youtubeEmbedUrl: youtubeVideoId ? `https://www.youtube-nocookie.com/embed/${youtubeVideoId}` : undefined,
    thumbnailUrl: youtubeVideoId ? `https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg` : undefined,
    lyricsBn: lyricsContent,
    lyricsStatus: (data.lyricsStatus as any) || (lyricsContent ? 'reviewed' : 'missing'),
    lyricsOrigin: lyricsContent ? 'typed' : null,
    sources: [],
    notes: '',
    searchKey: `${titleBn} ${titleLatin}`.toLowerCase(),
    createdAt: createdIso,
    updatedAt: updatedIso,
    lyricsUpdatedAt: lyricsContent ? updatedIso : null,
    createdByUser: data.created_by_user || 'Community_Singer',
    isPrivate: false,
    syncStatus: 'synced',
    playCount: 0,
    lastPlayedAt: null,
    totalListenTimeSec: 0,
    hasAudio: false,
    audioMeta: null,
  };
}

export function playlistToFirestore(playlist: PlaylistRecord): Record<string, any> {
  const nowMs = Date.parse(playlist.updatedAt) || Date.now();
  const createdMs = Date.parse(playlist.createdAt) || nowMs;

  return {
    id: playlist.id,
    name: playlist.name || 'Untitled Tour Setlist',
    name_lowercase: (playlist.name || '').toLowerCase(),
    description: playlist.description || '',
    cover_color: playlist.coverColor || '#8B5CF6',
    song_ids: Array.isArray(playlist.songIds) ? playlist.songIds : [],
    youtube_playlist_id: playlist.youtubePlaylistId || null,
    youtube_playlist_url: playlist.youtubePlaylistUrl || null,
    created_at: createdMs,
    updated_at: nowMs,
    is_deleted: false,
  };
}

export function firestoreToPlaylist(data: Record<string, any>, docId: string): PlaylistRecord {
  const id = data.id || docId;
  const name = (data.name || 'Untitled Tour Setlist').trim();
  const description = (data.description || '').trim();
  const coverColor = data.cover_color || data.coverColor || '#8B5CF6';
  const songIds = Array.isArray(data.song_ids) ? data.song_ids : Array.isArray(data.songIds) ? data.songIds : [];
  const youtubePlaylistId = data.youtube_playlist_id || data.youtubePlaylistId || undefined;
  const youtubePlaylistUrl = data.youtube_playlist_url || data.youtubePlaylistUrl || undefined;

  const nowIso = new Date().toISOString();
  const createdIso = data.created_at ? new Date(data.created_at).toISOString() : nowIso;
  const updatedIso = data.updated_at ? new Date(data.updated_at).toISOString() : nowIso;

  return {
    id,
    name,
    description,
    songIds,
    coverColor,
    youtubePlaylistId,
    youtubePlaylistUrl,
    createdAt: createdIso,
    updatedAt: updatedIso,
  };
}

export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

class FirebaseSyncService {
  private app: FirebaseApp | null = null;
  private db: Firestore | null = null;
  private state: SyncState = 'idle';
  private isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing = false;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private unsubscribeSnapshot: Unsubscribe | null = null;
  private unsubscribePlaylistSnapshot: Unsubscribe | null = null;
  private listeners: Set<(state: SyncState, lastSyncedAt: string | null) => void> = new Set();
  private collectionName = 'tour_lyrics';
  private playlistCollectionName = 'tour_lists';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.setState('idle');
        this.syncWithCloud();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.setState('offline');
      });

      this.init();
    }
  }

  public init(customConfig?: any) {
    try {
      const config = customConfig || FIREBASE_CONFIG;
      if (!config || !config.projectId || !config.apiKey) return;

      this.collectionName = config.collectionName || 'tour_lyrics';

      if (!getApps().length) {
        this.app = initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        });
      } else {
        this.app = getApp();
      }

      this.db = getFirestore(this.app);
      this.startRealtimeListener();
    } catch (err: any) {
      console.warn('Firebase init error:', err);
      this.lastError = err?.message || String(err);
    }
  }

  public subscribe(cb: (state: SyncState, lastSyncedAt: string | null) => void): () => void {
    this.listeners.add(cb);
    cb(this.state, this.lastSyncedAt);
    return () => this.listeners.delete(cb);
  }

  private setState(newState: SyncState) {
    this.state = newState;
    this.listeners.forEach((cb) => cb(this.state, this.lastSyncedAt));
  }

  public getState(): SyncState {
    return this.state;
  }

  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public getLastSyncedAt(): string | null {
    return this.lastSyncedAt;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Push an individual song directly to Firestore
   * Called on song add & edit
   */
  public async pushSong(song: SongRecord): Promise<void> {
    if (!this.db) this.init();
    if (!this.db || song.isPrivate) return;

    try {
      const docData = songToFirestore(song);
      const docRef = doc(this.db, this.collectionName, song.id);
      await setDoc(docRef, docData, { merge: true });
      await db.songs.update(song.id, { syncStatus: 'synced' });
    } catch (err: any) {
      console.warn('Failed to push song to Firestore:', song.titleLatin, err);
    }
  }

  /**
   * Soft delete a song in Firestore
   * Called on song delete
   */
  public async deleteRemoteSong(songId: string): Promise<void> {
    if (!this.db) this.init();
    if (!this.db) return;

    try {
      const docRef = doc(this.db, this.collectionName, songId);
      await setDoc(docRef, { is_deleted: true, updated_at: Date.now() }, { merge: true });
    } catch (err: any) {
      console.warn('Failed to mark song deleted in Firestore:', songId, err);
    }
  }

  /**
   * Push an individual playlist directly to Firestore
   * Called on playlist create & edit
   */
  public async pushPlaylist(playlist: PlaylistRecord): Promise<void> {
    if (!this.db) this.init();
    if (!this.db) return;

    try {
      const docData = playlistToFirestore(playlist);
      const docRef = doc(this.db, this.playlistCollectionName, playlist.id);
      await setDoc(docRef, docData, { merge: true });
    } catch (err: any) {
      console.warn('Failed to push playlist to Firestore:', playlist.name, err);
    }
  }

  /**
   * Soft delete a playlist in Firestore
   * Called on playlist delete
   */
  public async deleteRemotePlaylist(playlistId: string): Promise<void> {
    if (!this.db) this.init();
    if (!this.db) return;

    try {
      const docRef = doc(this.db, this.playlistCollectionName, playlistId);
      await setDoc(docRef, { is_deleted: true, updated_at: Date.now() }, { merge: true });
    } catch (err: any) {
      console.warn('Failed to mark playlist deleted in Firestore:', playlistId, err);
    }
  }

  /**
   * Real-time Firestore snapshot listener
   * Automatically updates local IndexedDB & UI when remote changes occur
   */
  public startRealtimeListener() {
    if (!this.db) return;
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
    }
    if (this.unsubscribePlaylistSnapshot) {
      this.unsubscribePlaylistSnapshot();
    }

    try {
      // 1. Listen to songs (tour_lyrics)
      const colRef = collection(this.db, this.collectionName);
      this.unsubscribeSnapshot = onSnapshot(
        colRef,
        async (snapshot) => {
          let hasChanges = false;

          for (const change of snapshot.docChanges()) {
            const data = change.doc.data();
            const songId = data.id || change.doc.id;

            if (change.type === 'removed' || data.is_deleted === true) {
              const local = await db.songs.get(songId);
              if (local) {
                await db.songs.delete(songId);
                hasChanges = true;
              }
            } else if (change.type === 'added' || change.type === 'modified') {
              const songRecord = firestoreToSong(data, songId);
              const local = await db.songs.get(songId);

              // Don't overwrite local pending changes
              if (!local || local.syncStatus !== 'pending_sync') {
                await db.songs.put(songRecord);
                hasChanges = true;
              }
            }
          }

          if (hasChanges) {
            this.setState('synced');
            this.lastSyncedAt = new Date().toISOString();
          }
        },
        (error) => {
          console.warn('Firestore snapshot error:', error);
          this.lastError = error.message;
        }
      );

      // 2. Listen to playlists (tour_playlists)
      const plColRef = collection(this.db, this.playlistCollectionName);
      this.unsubscribePlaylistSnapshot = onSnapshot(
        plColRef,
        async (snapshot) => {
          let hasChanges = false;

          for (const change of snapshot.docChanges()) {
            const data = change.doc.data();
            const playlistId = data.id || change.doc.id;

            if (change.type === 'removed' || data.is_deleted === true) {
              const local = await db.playlists.get(playlistId);
              if (local) {
                await db.playlists.delete(playlistId);
                hasChanges = true;
              }
            } else if (change.type === 'added' || change.type === 'modified') {
              const playlistRecord = firestoreToPlaylist(data, playlistId);
              const local = await db.playlists.get(playlistId);
              const remoteUpdated = data.updated_at || 0;
              const localUpdated = local ? Date.parse(local.updatedAt) || 0 : 0;

              if (!local || remoteUpdated >= localUpdated) {
                await db.playlists.put(playlistRecord);
                hasChanges = true;
              }
            }
          }

          if (hasChanges) {
            this.setState('synced');
            this.lastSyncedAt = new Date().toISOString();
          }
        },
        (error) => {
          console.warn('Firestore playlist snapshot error:', error);
        }
      );
    } catch (err: any) {
      console.warn('Failed to attach realtime Firestore listener:', err);
    }
  }

  /**
   * Complete Two-Way Sync Routine
   * 1. Pushes any local songs & playlists to Firestore
   * 2. Pulls all remote songs & playlists from Firestore into local Dexie
   */
  public async syncWithCloud(): Promise<boolean> {
    if (this.isSyncing) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setState('offline');
      return false;
    }

    if (!this.db) this.init();
    if (!this.db) {
      this.lastError = 'Firebase connection could not be established.';
      this.setState('error');
      return false;
    }

    this.isSyncing = true;
    this.setState('syncing');

    try {
      // ==========================================
      // SECTION 1: SONG SYNCHRONIZATION (tour_lyrics)
      // ==========================================
      const colRef = collection(this.db, this.collectionName);
      const querySnap = await getDocs(colRef);
      const remoteDocsMap = new Map<string, any>();

      for (const d of querySnap.docs) {
        remoteDocsMap.set(d.id, d.data());
      }

      const allLocal = await db.songs.toArray();

      // Step 1: Push local songs that are not private
      for (const localSong of allLocal) {
        if (localSong.isPrivate) continue;

        const remote = remoteDocsMap.get(localSong.id);
        const shouldPush = !remote || localSong.syncStatus === 'pending_sync';

        if (shouldPush) {
          const docData = songToFirestore(localSong);
          await setDoc(doc(colRef, localSong.id), docData, { merge: true });
          await db.songs.update(localSong.id, { syncStatus: 'synced' });
        }
      }

      // Step 2: Pull remote songs into local IndexedDB
      for (const [remoteId, remoteData] of remoteDocsMap.entries()) {
        if (remoteData.is_deleted === true) {
          const local = await db.songs.get(remoteId);
          if (local) {
            await db.songs.delete(remoteId);
          }
          continue;
        }

        const local = await db.songs.get(remoteId);
        if (!local) {
          const songRecord = firestoreToSong(remoteData, remoteId);
          await db.songs.put(songRecord);
        } else if (local.syncStatus !== 'pending_sync') {
          const remoteUpdated = remoteData.updated_at || 0;
          const localUpdated = Date.parse(local.updatedAt) || 0;
          if (remoteUpdated > localUpdated) {
            const songRecord = firestoreToSong(remoteData, remoteId);
            await db.songs.put(songRecord);
          }
        }
      }

      // ===============================================
      // SECTION 2: PLAYLIST SYNCHRONIZATION (tour_playlists)
      // ===============================================
      const plColRef = collection(this.db, this.playlistCollectionName);
      const plQuerySnap = await getDocs(plColRef);
      const remotePlaylistsMap = new Map<string, any>();

      for (const d of plQuerySnap.docs) {
        remotePlaylistsMap.set(d.id, d.data());
      }

      const allLocalPlaylists = await db.playlists.toArray();

      // Step 3: Push local playlists to Firestore
      for (const localPl of allLocalPlaylists) {
        const remotePl = remotePlaylistsMap.get(localPl.id);
        const localUpdated = Date.parse(localPl.updatedAt) || 0;
        const remoteUpdated = remotePl?.updated_at || 0;

        if (!remotePl || localUpdated > remoteUpdated) {
          const docData = playlistToFirestore(localPl);
          await setDoc(doc(plColRef, localPl.id), docData, { merge: true });
        }
      }

      // Step 4: Pull remote playlists into local IndexedDB
      for (const [remoteId, remoteData] of remotePlaylistsMap.entries()) {
        if (remoteData.is_deleted === true) {
          const local = await db.playlists.get(remoteId);
          if (local) {
            await db.playlists.delete(remoteId);
          }
          continue;
        }

        const local = await db.playlists.get(remoteId);
        if (!local) {
          const playlistRecord = firestoreToPlaylist(remoteData, remoteId);
          await db.playlists.put(playlistRecord);
        } else {
          const remoteUpdated = remoteData.updated_at || 0;
          const localUpdated = Date.parse(local.updatedAt) || 0;
          if (remoteUpdated > localUpdated) {
            const playlistRecord = firestoreToPlaylist(remoteData, remoteId);
            await db.playlists.put(playlistRecord);
          }
        }
      }

      this.isSyncing = false;
      this.lastSyncedAt = new Date().toISOString();
      this.setState('synced');
      return true;
    } catch (err: any) {
      console.error('Error syncing with Firestore:', err);
      this.isSyncing = false;
      this.lastError = err?.message || String(err);
      this.setState('error');
      return false;
    }
  }

  // Compatibility helpers
  public async triggerSync(): Promise<{ pushed: number; pulled: number; error?: string }> {
    const success = await this.syncWithCloud();
    return { pushed: success ? 1 : 0, pulled: 0, error: this.lastError || undefined };
  }

  public async syncAll() {
    const success = await this.syncWithCloud();
    return { success, pushed: 1, pulled: 0 };
  }

  public configure(config?: any, enabled = true) {
    if (enabled) {
      this.init(config);
    }
  }

  public startPeriodicSync(intervalMs = 60000): () => void {
    const timer = setInterval(() => {
      this.syncWithCloud();
    }, intervalMs);
    return () => clearInterval(timer);
  }
}

export const firebaseSync = new FirebaseSyncService();
