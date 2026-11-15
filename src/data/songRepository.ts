import { db } from './db';
import {
  SongRecord,
  CategoryRecord,
  AppSettings,
  AudioBlobRecord,
  PlaylistRecord,
  DownloadQueueItem,
  SongAudioMeta,
  TourShareBundle,
} from '../types';
import { STARTER_CATEGORIES } from './sampleData';
import { computeSearchKey, normalizeBengali, normalizeLatin } from '../lib/normalize';
import {
  extractYouTubeVideoId,
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
} from '../lib/youtube';
import { generateGamingUsername } from '../lib/userNames';
import { firebaseSync } from '../services/firebaseSync';

const PRODUCTION_YTDLP_SERVER = 'https://yt-dlp-server-rr8t.onrender.com';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSize: 20,
  lineHeight: 1.8,
  keepAwake: true,
  fullTextLyricsSearch: false,
  aiProvider: 'gemini',
  selectedModel: 'gemini-3.5-flash-lite',
  aiBaseUrl: '',
  enabledSites: ['lyricsbangla', 'banglalyrics', 'amar-gaan'],
  lastBackupDate: null,
  persistentStorageGranted: false,
  userName: generateGamingUsername(),
  cloudSyncEnabled: true,
  ytdlpServerUrl: PRODUCTION_YTDLP_SERVER,
};

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

function generateId(): string {
  return generateUUID();
}

class SongRepository {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const catCount = await db.categories.count();
      if (catCount === 0) {
        await db.categories.bulkAdd(STARTER_CATEGORIES);
      }

      const settingsRecord = await db.settingsTable.get('app_settings');

      // Do NOT auto-seed sample songs. Default state is clean/blank per user request.
      if (!settingsRecord) {
        await db.settingsTable.put({
          id: 'app_settings',
          settings: {
            ...DEFAULT_SETTINGS,
            userName: generateGamingUsername(),
          },
        });
      } else if (!settingsRecord.settings.userName) {
        // Upgrade existing settings with gaming username
        settingsRecord.settings.userName = generateGamingUsername();
        await db.settingsTable.put(settingsRecord);
      }

      // Sanitize any existing songs that have 'FALSE', 'null', or empty booleans as lyrics
      const corrupted = await db.songs
        .filter((s) => {
          const l = (s.lyricsBn || '').trim().toLowerCase();
          return l === 'false' || l === 'null' || l === 'undefined' || l === 'none' || l === 'n/a';
        })
        .toArray();

      if (corrupted.length > 0) {
        for (const song of corrupted) {
          await db.songs.update(song.id, {
            lyricsBn: '',
            lyricsStatus: 'missing',
            lyricsOrigin: null,
            sources: [],
            lyricsUpdatedAt: null,
          });
        }
      }

      this.initialized = true;
    } catch (err) {
      console.error('Failed to initialize songRepository:', err);
    }
  }

  // --- SONGS ---

  async getAllSongs(): Promise<SongRecord[]> {
    await this.init();
    return db.songs.toArray();
  }

  async getSongById(id: string): Promise<SongRecord | undefined> {
    await this.init();
    return db.songs.get(id);
  }

  async addSong(data: {
    id?: string;
    importSerial?: number | null;
    titleLatin: string;
    titleBn: string;
    aliases?: string[];
    categoryId: string;
    youtubeUrl?: string;
    lyricsBn?: string;
    lyricsStatus?: 'missing' | 'unreviewed' | 'reviewed';
    lyricsOrigin?: null | 'fetched' | 'pasted' | 'typed';
    notes?: string;
    sources?: SongRecord['sources'];
    audioMeta?: SongAudioMeta | null;
    hasAudio?: boolean;
    createdByUser?: string;
    isPrivate?: boolean;
    syncStatus?: 'synced' | 'local_only' | 'pending_sync';
  }): Promise<SongRecord> {
    await this.init();
    const settings = await this.getSettings();
    const now = new Date().toISOString();
    const id = data.id || generateId();
    const aliases = data.aliases || [];
    const searchKey = computeSearchKey(data.titleBn, data.titleLatin, aliases);
    const youtubeUrl = data.youtubeUrl || '';
    const youtubeVideoId = extractYouTubeVideoId(youtubeUrl);
    const youtubeEmbedUrl = youtubeVideoId ? buildYouTubeEmbedUrl(youtubeVideoId, true) : undefined;
    const thumbnailUrl = youtubeVideoId ? buildYouTubeThumbnailUrl(youtubeVideoId) : undefined;
    const lyricsBn = (data.lyricsBn || '').trim();

    let lyricsStatus = data.lyricsStatus || (lyricsBn ? 'unreviewed' : 'missing');
    if (!lyricsBn) lyricsStatus = 'missing';

    const isPrivate = data.isPrivate ?? false;
    const createdByUser = data.createdByUser || settings.userName || generateGamingUsername();
    const syncStatus = data.syncStatus || (isPrivate ? 'local_only' : 'pending_sync');

    const song: SongRecord = {
      id,
      importSerial: data.importSerial ?? null,
      titleLatin: data.titleLatin.trim(),
      titleBn: data.titleBn.trim(),
      aliases,
      categoryId: data.categoryId,
      youtubeUrl,
      youtubeVideoId,
      youtubeEmbedUrl,
      thumbnailUrl,
      lyricsBn,
      lyricsStatus,
      lyricsOrigin: data.lyricsOrigin || (lyricsBn ? 'typed' : null),
      sources: data.sources || [],
      notes: data.notes || '',
      searchKey,
      createdAt: now,
      updatedAt: now,
      lyricsUpdatedAt: lyricsBn ? now : null,
      createdByUser,
      isPrivate,
      syncStatus,
      playCount: 0,
      lastPlayedAt: null,
      totalListenTimeSec: 0,
      hasAudio: data.hasAudio || false,
      audioMeta: data.audioMeta || null,
    };

    await db.songs.add(song);
    firebaseSync.pushSong(song).catch(console.warn);
    return song;
  }

  async bulkAddSongs(songsData: Partial<SongRecord>[]): Promise<number> {
    await this.init();
    const settings = await this.getSettings();
    const now = new Date().toISOString();
    const recordsToAdd: SongRecord[] = [];

    for (const data of songsData) {
      if (!data.titleLatin && !data.titleBn) continue;
      const titleLatin = (data.titleLatin || data.titleBn || '').trim();
      const titleBn = (data.titleBn || data.titleLatin || '').trim();
      const aliases = data.aliases || [];
      const searchKey = computeSearchKey(titleBn, titleLatin, aliases);
      const youtubeUrl = data.youtubeUrl || '';
      const youtubeVideoId = data.youtubeVideoId || extractYouTubeVideoId(youtubeUrl);
      const youtubeEmbedUrl = data.youtubeEmbedUrl || (youtubeVideoId ? buildYouTubeEmbedUrl(youtubeVideoId, true) : undefined);
      const thumbnailUrl = data.thumbnailUrl || (youtubeVideoId ? buildYouTubeThumbnailUrl(youtubeVideoId) : undefined);
      const lyricsBn = (data.lyricsBn || '').trim();
      const lyricsStatus = data.lyricsStatus || (lyricsBn ? 'unreviewed' : 'missing');

      const song: SongRecord = {
        id: data.id || generateId(),
        importSerial: data.importSerial ?? null,
        titleLatin,
        titleBn,
        aliases,
        categoryId: data.categoryId || 'other',
        youtubeUrl,
        youtubeVideoId,
        youtubePlaylistId: data.youtubePlaylistId,
        youtubeEmbedUrl,
        thumbnailUrl,
        lyricsBn,
        lyricsStatus,
        lyricsOrigin: data.lyricsOrigin || (lyricsBn ? 'typed' : null),
        sources: data.sources || [],
        notes: data.notes || '',
        searchKey,
        createdAt: data.createdAt || now,
        updatedAt: now,
        lyricsUpdatedAt: lyricsBn ? now : null,
        createdByUser: data.createdByUser || settings.userName || generateGamingUsername(),
        isPrivate: data.isPrivate ?? false,
        syncStatus: data.syncStatus || (data.isPrivate ? 'local_only' : 'pending_sync'),
        playCount: data.playCount || 0,
        lastPlayedAt: data.lastPlayedAt || null,
        totalListenTimeSec: data.totalListenTimeSec || 0,
        hasAudio: data.hasAudio || false,
        audioMeta: data.audioMeta || null,
      };

      recordsToAdd.push(song);
    }

    if (recordsToAdd.length > 0) {
      await db.songs.bulkPut(recordsToAdd);
    }
    return recordsToAdd.length;
  }

  async updateSong(id: string, updates: Partial<SongRecord>): Promise<SongRecord> {
    await this.init();
    const existing = await db.songs.get(id);
    if (!existing) {
      throw new Error(`Song with ID "${id}" not found.`);
    }

    const now = new Date().toISOString();
    const titleBn = updates.titleBn !== undefined ? updates.titleBn.trim() : existing.titleBn;
    const titleLatin = updates.titleLatin !== undefined ? updates.titleLatin.trim() : existing.titleLatin;
    const aliases = updates.aliases !== undefined ? updates.aliases : existing.aliases;
    const searchKey = computeSearchKey(titleBn, titleLatin, aliases);

    let youtubeUrl = updates.youtubeUrl !== undefined ? updates.youtubeUrl : existing.youtubeUrl;
    let youtubeVideoId = updates.youtubeVideoId !== undefined ? updates.youtubeVideoId : existing.youtubeVideoId;
    let youtubeEmbedUrl = updates.youtubeEmbedUrl !== undefined ? updates.youtubeEmbedUrl : existing.youtubeEmbedUrl;
    let thumbnailUrl = updates.thumbnailUrl !== undefined ? updates.thumbnailUrl : existing.thumbnailUrl;

    if (updates.youtubeUrl !== undefined && updates.youtubeUrl !== existing.youtubeUrl) {
      youtubeVideoId = extractYouTubeVideoId(updates.youtubeUrl);
      youtubeEmbedUrl = youtubeVideoId ? buildYouTubeEmbedUrl(youtubeVideoId, true) : undefined;
      thumbnailUrl = youtubeVideoId ? buildYouTubeThumbnailUrl(youtubeVideoId) : undefined;
    }

    const lyricsBn = updates.lyricsBn !== undefined ? updates.lyricsBn.trim() : existing.lyricsBn;
    let lyricsStatus = updates.lyricsStatus !== undefined ? updates.lyricsStatus : existing.lyricsStatus;
    if (!lyricsBn) lyricsStatus = 'missing';

    const lyricsUpdatedAt =
      updates.lyricsBn !== undefined && updates.lyricsBn !== existing.lyricsBn
        ? now
        : existing.lyricsUpdatedAt;

    const syncStatus = updates.isPrivate ? 'local_only' : 'pending_sync';

    const merged: SongRecord = {
      ...existing,
      ...updates,
      titleBn,
      titleLatin,
      aliases,
      searchKey,
      youtubeUrl,
      youtubeVideoId,
      youtubeEmbedUrl,
      thumbnailUrl,
      lyricsBn,
      lyricsStatus,
      lyricsUpdatedAt,
      syncStatus: updates.syncStatus || syncStatus,
      updatedAt: now,
    };

    await db.songs.put(merged);
    firebaseSync.pushSong(merged).catch(console.warn);
    return merged;
  }

  async deleteSong(id: string): Promise<void> {
    await this.init();
    const affectedPlaylists: PlaylistRecord[] = [];
    await db.transaction('rw', db.songs, db.audioBlobs, db.playlists, db.downloadQueue, async () => {
      await db.songs.delete(id);
      await db.audioBlobs.where('songId').equals(id).delete();
      await db.downloadQueue.where('songId').equals(id).delete();

      const allPlaylists = await db.playlists.toArray();
      for (const pl of allPlaylists) {
        if (pl.songIds.includes(id)) {
          pl.songIds = pl.songIds.filter((sid) => sid !== id);
          pl.updatedAt = new Date().toISOString();
          await db.playlists.put(pl);
          affectedPlaylists.push(pl);
        }
      }
    });
    firebaseSync.deleteRemoteSong(id).catch(console.warn);
    for (const pl of affectedPlaylists) {
      firebaseSync.pushPlaylist(pl).catch(console.warn);
    }
  }

  async clearAllSongsIfDemoOnly(): Promise<void> {
    await this.init();
    await db.transaction('rw', db.songs, db.audioBlobs, db.playlists, db.downloadQueue, async () => {
      await db.songs.clear();
      await db.audioBlobs.clear();
      await db.downloadQueue.clear();
      await db.playlists.clear();
    });
  }

  // --- BATCH ACTIONS ---

  async batchEnqueueDownloads(songIds: string[], format = 'mp3', quality = '320k'): Promise<number> {
    await this.init();
    const songs = await db.songs.where('id').anyOf(songIds).toArray();
    let queuedCount = 0;

    for (const song of songs) {
      if (!song.youtubeUrl && !song.youtubeVideoId) continue;
      const ytUrl = song.youtubeUrl || `https://www.youtube.com/watch?v=${song.youtubeVideoId}`;

      const existingQueue = await db.downloadQueue.where('songId').equals(song.id).first();
      if (existingQueue && existingQueue.status !== 'failed') continue;

      const newItem: DownloadQueueItem = {
        id: generateId(),
        songId: song.id,
        youtubeUrl: ytUrl,
        title: song.titleBn || song.titleLatin,
        format,
        quality,
        status: 'queued',
        progress: 0,
        error: null,
        createdAt: new Date().toISOString(),
      };

      await db.downloadQueue.put(newItem);
      queuedCount++;
    }

    return queuedCount;
  }

  async exportTourShareBundle(songIds?: string[]): Promise<TourShareBundle> {
    await this.init();
    const settings = await this.getSettings();
    let songsToExport = await db.songs.toArray();

    // Exclude private songs unless explicitly requested
    songsToExport = songsToExport.filter((s) => !s.isPrivate);

    if (songIds && songIds.length > 0) {
      const set = new Set(songIds);
      songsToExport = songsToExport.filter((s) => set.has(s.id));
    }

    const categories = await db.categories.toArray();
    const playlists = await db.playlists.toArray();

    return {
      format: 'tour-lyrics-bundle',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      author: settings.userName || 'Tour_Singer',
      songs: songsToExport,
      categories,
      playlists,
    };
  }

  async importTourShareBundle(bundle: TourShareBundle): Promise<{ importedCount: number; updatedCount: number }> {
    await this.init();
    if (!bundle || bundle.format !== 'tour-lyrics-bundle' || !Array.isArray(bundle.songs)) {
      throw new Error('Invalid Tour Lyrics bundle format.');
    }

    // Merge categories
    if (Array.isArray(bundle.categories)) {
      for (const cat of bundle.categories) {
        const existing = await db.categories.get(cat.id);
        if (!existing) {
          await db.categories.add(cat);
        }
      }
    }

    // Merge songs
    let importedCount = 0;
    let updatedCount = 0;

    for (const incoming of bundle.songs) {
      const existing = await db.songs.get(incoming.id);
      if (existing) {
        // Update if incoming has lyrics and existing doesn't, or newer
        if ((!existing.lyricsBn && incoming.lyricsBn) || new Date(incoming.updatedAt) > new Date(existing.updatedAt)) {
          await db.songs.put({
            ...existing,
            ...incoming,
            // Keep local audio state intact
            hasAudio: existing.hasAudio,
            audioMeta: existing.audioMeta,
          });
          updatedCount++;
        }
      } else {
        await db.songs.add({
          ...incoming,
          hasAudio: false,
          audioMeta: null,
          syncStatus: 'synced',
        });
        importedCount++;
      }
    }

    return { importedCount, updatedCount };
  }

  // --- CATEGORIES ---

  async getAllCategories(): Promise<CategoryRecord[]> {
    await this.init();
    const categories = await db.categories.toArray();
    return categories.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async addCategory(name: string): Promise<CategoryRecord> {
    await this.init();
    const categories = await db.categories.toArray();
    const exists = categories.some((c) => c.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      throw new Error(`Category "${name}" already exists.`);
    }

    const newCat: CategoryRecord = {
      id: generateId(),
      name: name.trim(),
      sortOrder: categories.length,
    };
    await db.categories.add(newCat);
    return newCat;
  }

  async updateCategory(id: string, updates: Partial<CategoryRecord>): Promise<CategoryRecord> {
    await this.init();
    const existing = await db.categories.get(id);
    if (!existing) {
      throw new Error(`Category "${id}" not found.`);
    }
    const merged = { ...existing, ...updates };
    await db.categories.put(merged);
    return merged;
  }

  async deleteCategory(id: string, fallbackCategoryId?: string): Promise<void> {
    await this.init();
    await db.transaction('rw', db.categories, db.songs, async () => {
      await db.categories.delete(id);
      if (fallbackCategoryId) {
        await db.songs.where('categoryId').equals(id).modify({ categoryId: fallbackCategoryId });
      }
    });
  }

  // --- SETTINGS ---

  async getSettings(): Promise<AppSettings> {
    await this.init();
    const record = await db.settingsTable.get('app_settings');
    if (!record) {
      return { ...DEFAULT_SETTINGS, userName: generateGamingUsername() };
    }
    const settings = { ...DEFAULT_SETTINGS, ...record.settings };
    if (!settings.ytdlpServerUrl || settings.ytdlpServerUrl.trim() === '') {
      settings.ytdlpServerUrl = PRODUCTION_YTDLP_SERVER;
    }
    return settings;
  }

  async saveSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    await this.init();
    const current = await this.getSettings();
    const merged: AppSettings = { ...current, ...updates };
    await db.settingsTable.put({
      id: 'app_settings',
      settings: merged,
    });
    return merged;
  }

  // --- AUDIO BLOB STORAGE ---

  async saveAudioBlob(
    songId: string,
    blob: Blob,
    metaOrMime: SongAudioMeta | string,
    maybeMeta?: SongAudioMeta
  ): Promise<void> {
    await this.init();
    const meta: SongAudioMeta =
      typeof metaOrMime === 'object'
        ? metaOrMime
        : maybeMeta || {
            format: 'mp3',
            bitrate: '320kbps',
            sizeBytes: blob.size,
            durationSec: 180,
            sourceType: 'local-file',
            localUri: null,
          };
    const now = new Date().toISOString();
    const record: AudioBlobRecord = {
      id: `audio_${songId}`,
      songId,
      blob,
      mimeType: typeof metaOrMime === 'string' ? metaOrMime : blob.type || 'audio/mpeg',
      updatedAt: now,
    };

    await db.transaction('rw', db.audioBlobs, db.songs, async () => {
      await db.audioBlobs.put(record);
      await db.songs.update(songId, {
        hasAudio: true,
        audioMeta: meta,
        updatedAt: now,
      });
    });
  }

  async getAudioBlob(songId: string): Promise<AudioBlobRecord | undefined> {
    await this.init();
    return db.audioBlobs.where('songId').equals(songId).first();
  }

  async getAllAudioBlobs(): Promise<AudioBlobRecord[]> {
    await this.init();
    return db.audioBlobs.toArray();
  }

  async deleteAudio(songId: string): Promise<void> {
    await this.init();
    const now = new Date().toISOString();
    await db.transaction('rw', db.audioBlobs, db.songs, async () => {
      await db.audioBlobs.where('songId').equals(songId).delete();
      await db.songs.update(songId, {
        hasAudio: false,
        audioMeta: null,
        updatedAt: now,
      });
    });
  }

  async deleteAudioBlob(songId: string): Promise<void> {
    return this.deleteAudio(songId);
  }

  async deleteAllAudios(): Promise<number> {
    await this.init();
    const count = await db.audioBlobs.count();
    const now = new Date().toISOString();
    await db.transaction('rw', db.audioBlobs, db.songs, async () => {
      await db.audioBlobs.clear();
      await db.songs.toCollection().modify((song) => {
        song.hasAudio = false;
        song.audioMeta = null;
        song.updatedAt = now;
      });
    });
    return count;
  }

  async clearAllAudioBlobs(): Promise<void> {
    await this.deleteAllAudios();
  }

  async getAudioStorageStats(): Promise<{ count: number; totalSizeBytes: number }> {
    await this.init();
    const blobs = await db.audioBlobs.toArray();
    let totalSizeBytes = 0;
    for (const b of blobs) {
      if (b.blob && typeof b.blob.size === 'number') {
        totalSizeBytes += b.blob.size;
      }
    }
    return {
      count: blobs.length,
      totalSizeBytes,
    };
  }

  // --- PERSISTENT STORAGE & BULK OPERATIONS ---

  async checkPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      return navigator.storage.persisted();
    }
    return false;
  }

  async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      await this.saveSettings({ persistentStorageGranted: granted });
      return granted;
    }
    return false;
  }

  async deleteAllLyrics(): Promise<number> {
    await this.init();
    const now = new Date().toISOString();
    let count = 0;
    await db.transaction('rw', db.songs, async () => {
      const all = await db.songs.toArray();
      for (const song of all) {
        if (song.lyricsBn) {
          count++;
          await db.songs.update(song.id, {
            lyricsBn: '',
            lyricsStatus: 'missing',
            lyricsOrigin: null,
            updatedAt: now,
          });
        }
      }
    });
    return count;
  }

  async clearLibrary(): Promise<void> {
    await this.init();
    await db.transaction('rw', db.songs, db.audioBlobs, db.playlists, db.downloadQueue, async () => {
      await db.songs.clear();
      await db.audioBlobs.clear();
      await db.playlists.clear();
      await db.downloadQueue.clear();
    });
  }

  async bulkImport(
    songsToImport: SongRecord[],
    categoriesToImport: CategoryRecord[],
    mode: 'merge' | 'replace' = 'merge'
  ): Promise<void> {
    await this.init();
    await db.transaction('rw', db.songs, db.categories, async () => {
      if (mode === 'replace') {
        await db.songs.clear();
        await db.categories.clear();
      }

      for (const cat of categoriesToImport) {
        const existing = await db.categories.get(cat.id);
        if (!existing || mode === 'replace') {
          await db.categories.put(cat);
        }
      }

      for (const song of songsToImport) {
        const existing = await db.songs.get(song.id);
        if (!existing || mode === 'replace') {
          await db.songs.put(song);
        } else if (mode === 'merge') {
          await db.songs.put({
            ...song,
            hasAudio: existing.hasAudio || song.hasAudio,
            audioMeta: existing.audioMeta || song.audioMeta,
          });
        }
      }
    });
  }

  // --- ANALYTICS / PLAY LOGGING ---

  async recordPlay(songId: string, listenDurationSec: number): Promise<void> {
    await this.init();
    const song = await db.songs.get(songId);
    if (!song) return;

    const now = new Date().toISOString();
    const playCount = (song.playCount || 0) + 1;
    const totalListenTimeSec = (song.totalListenTimeSec || 0) + Math.round(listenDurationSec);

    await db.songs.update(songId, {
      playCount,
      lastPlayedAt: now,
      totalListenTimeSec,
    });
  }

  // --- PLAYLISTS ---

  async getAllPlaylists(): Promise<PlaylistRecord[]> {
    await this.init();
    const playlists = await db.playlists.toArray();
    return playlists.sort((a, b) => {
      if (a.order != null && b.order != null) return a.order - b.order;
      if (a.order != null) return -1;
      if (b.order != null) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  async reorderPlaylists(orderedIds: string[]): Promise<void> {
    await this.init();
    await db.transaction('rw', db.playlists, async () => {
      for (let i = 0; i < orderedIds.length; i++) {
        await db.playlists.update(orderedIds[i], { order: i });
      }
    });
  }

  async reorderSongs(orderedSongIds: string[]): Promise<void> {
    await this.init();
    await db.transaction('rw', db.songs, async () => {
      for (let i = 0; i < orderedSongIds.length; i++) {
        await db.songs.update(orderedSongIds[i], { importSerial: i + 1 });
      }
    });
  }

  async getPlaylistById(id: string): Promise<PlaylistRecord | undefined> {
    await this.init();
    return db.playlists.get(id);
  }

  async createPlaylist(
    name: string,
    description: string = '',
    songIds: string[] = [],
    coverColor: string = '#8B5CF6'
  ): Promise<PlaylistRecord> {
    await this.init();
    const now = new Date().toISOString();
    const playlist: PlaylistRecord = {
      id: generateId(),
      name: name.trim() || 'Untitled Tour Setlist',
      description: description.trim(),
      songIds,
      coverColor,
      createdAt: now,
      updatedAt: now,
    };
    await db.playlists.add(playlist);
    firebaseSync.pushPlaylist(playlist).catch(console.warn);
    return playlist;
  }

  async updatePlaylist(id: string, updates: Partial<PlaylistRecord>): Promise<PlaylistRecord> {
    await this.init();
    const existing = await db.playlists.get(id);
    if (!existing) {
      throw new Error(`Playlist with ID "${id}" not found.`);
    }
    const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    await db.playlists.put(merged);
    firebaseSync.pushPlaylist(merged).catch(console.warn);
    return merged;
  }

  async deletePlaylist(id: string): Promise<void> {
    await this.init();
    await db.playlists.delete(id);
    firebaseSync.deleteRemotePlaylist(id).catch(console.warn);
  }

  async addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
    await this.init();
    const pl = await db.playlists.get(playlistId);
    if (!pl) return;
    if (!pl.songIds.includes(songId)) {
      pl.songIds.push(songId);
      pl.updatedAt = new Date().toISOString();
      await db.playlists.put(pl);
      firebaseSync.pushPlaylist(pl).catch(console.warn);
    }
  }

  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
    await this.init();
    const pl = await db.playlists.get(playlistId);
    if (!pl) return;
    pl.songIds = pl.songIds.filter((id) => id !== songId);
    pl.updatedAt = new Date().toISOString();
    await db.playlists.put(pl);
    firebaseSync.pushPlaylist(pl).catch(console.warn);
  }

  // --- DOWNLOAD QUEUE ---

  async getDownloadQueue(): Promise<DownloadQueueItem[]> {
    await this.init();
    const items = await db.downloadQueue.toArray();
    // Auto-clean any legacy duplicate queue records by songId
    const seenSongIds = new Set<string>();
    const uniqueItems: DownloadQueueItem[] = [];
    const duplicateIdsToDelete: string[] = [];

    // Prioritize newest / completed items
    const sorted = [...items].reverse();
    for (const item of sorted) {
      if (!seenSongIds.has(item.songId)) {
        seenSongIds.add(item.songId);
        uniqueItems.unshift(item);
      } else {
        duplicateIdsToDelete.push(item.id);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      db.downloadQueue.bulkDelete(duplicateIdsToDelete).catch(() => {});
    }

    return uniqueItems;
  }

  async addDownloadQueueItem(
    item: Omit<DownloadQueueItem, 'id' | 'createdAt'>
  ): Promise<DownloadQueueItem> {
    await this.init();
    // Reuse/update existing queue item for the same song so it doesn't create duplicate entries
    const existing = await db.downloadQueue.where('songId').equals(item.songId).first();
    if (existing) {
      const updated: DownloadQueueItem = {
        ...existing,
        ...item,
        createdAt: new Date().toISOString(),
      };
      await db.downloadQueue.put(updated);
      return updated;
    }

    const newItem: DownloadQueueItem = {
      ...item,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    await db.downloadQueue.add(newItem);
    return newItem;
  }

  async updateDownloadQueueItem(
    id: string,
    updates: Partial<DownloadQueueItem>
  ): Promise<void> {
    await this.init();
    await db.downloadQueue.update(id, updates);
  }

  async removeDownloadQueueItem(id: string): Promise<void> {
    await this.init();
    await db.downloadQueue.delete(id);
  }

  async clearCompletedDownloads(): Promise<void> {
    await this.init();
    await db.transaction('rw', db.downloadQueue, async () => {
      const items = await db.downloadQueue.toArray();
      for (const item of items) {
        if (item.status === 'completed' || item.status === 'failed') {
          await db.downloadQueue.delete(item.id);
        }
      }
    });
  }
}

export const songRepository = new SongRepository();
