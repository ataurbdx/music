import { songRepository } from '../data/songRepository';
import { SongRecord, CategoryRecord, AppSettings } from '../types';
import { SCHEMA_VERSION } from '../data/db';

export interface FullBackupPayload {
  schemaVersion: number;
  type: 'full_backup';
  exportedAt: string;
  songs: SongRecord[];
  categories: CategoryRecord[];
  settings: AppSettings;
}

export interface CatalogueShareSong {
  id: string;
  importSerial: number | null;
  titleLatin: string;
  titleBn: string;
  aliases: string[];
  categoryId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
}

export interface CatalogueSharePayload {
  schemaVersion: number;
  type: 'catalogue_share';
  exportedAt: string;
  songs: CatalogueShareSong[];
  categories: CategoryRecord[];
}

export const backupManager = {
  /**
   * Generates a Full Backup JSON (Personal restore only - NEVER includes Gemini key)
   */
  async generateFullBackup(): Promise<FullBackupPayload> {
    const songs = await songRepository.getAllSongs();
    const categories = await songRepository.getAllCategories();
    const settings = await songRepository.getSettings();

    // Invariant check: Ensure no API keys exist in settings
    const sanitizedSettings = { ...settings };
    delete (sanitizedSettings as any).apiKey;
    delete (sanitizedSettings as any).geminiApiKey;

    const payload: FullBackupPayload = {
      schemaVersion: SCHEMA_VERSION,
      type: 'full_backup',
      exportedAt: new Date().toISOString(),
      songs,
      categories,
      settings: sanitizedSettings,
    };

    await songRepository.saveSettings({ lastBackupDate: payload.exportedAt });
    return payload;
  },

  /**
   * Generates a Catalogue Share JSON (Safe to share with friends - Strips lyrics, notes, sources)
   */
  async generateCatalogueShare(): Promise<CatalogueSharePayload> {
    const songs = await songRepository.getAllSongs();
    const categories = await songRepository.getAllCategories();

    const strippedSongs: CatalogueShareSong[] = songs.map((s) => ({
      id: s.id,
      importSerial: s.importSerial,
      titleLatin: s.titleLatin,
      titleBn: s.titleBn,
      aliases: s.aliases,
      categoryId: s.categoryId,
      youtubeUrl: s.youtubeUrl,
      youtubeVideoId: s.youtubeVideoId,
    }));

    return {
      schemaVersion: SCHEMA_VERSION,
      type: 'catalogue_share',
      exportedAt: new Date().toISOString(),
      songs: strippedSongs,
      categories,
    };
  },

  /**
   * Triggers a file download in the browser
   */
  downloadJson(data: object, filename: string): void {
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  },

  /**
   * Exports full backup as downloadable file
   */
  async exportFullBackup(): Promise<void> {
    const data = await this.generateFullBackup();
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadJson(data, `tour-lyrics-backup-${dateStr}.json`);
  },

  /**
   * Exports catalogue share as downloadable file
   */
  async exportCatalogueShare(): Promise<void> {
    const data = await this.generateCatalogueShare();
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadJson(data, `tour-lyrics-catalogue-${dateStr}.json`);
  },

  /**
   * Validates and restores from a parsed JSON backup
   */
  async restoreFromBackup(
    backupJson: any,
    mode: 'merge' | 'replace'
  ): Promise<{ songsCount: number; categoriesCount: number }> {
    if (!backupJson || typeof backupJson !== 'object') {
      throw new Error('Invalid backup file: content is not a valid JSON object.');
    }

    if (!backupJson.schemaVersion || backupJson.schemaVersion > SCHEMA_VERSION) {
      throw new Error(
        `Unsupported schema version (${backupJson.schemaVersion}). Current supported version is ${SCHEMA_VERSION}.`
      );
    }

    if (!Array.isArray(backupJson.categories)) {
      throw new Error('Invalid backup: "categories" array missing.');
    }

    if (!Array.isArray(backupJson.songs)) {
      throw new Error('Invalid backup: "songs" array missing.');
    }

    const categories: CategoryRecord[] = backupJson.categories;
    const incomingSongs: any[] = backupJson.songs;

    const songs: SongRecord[] = incomingSongs.map((s) => ({
      id: s.id || (crypto.randomUUID ? crypto.randomUUID() : `song_${Date.now()}`),
      importSerial: s.importSerial ?? null,
      titleLatin: s.titleLatin || '',
      titleBn: s.titleBn || '',
      aliases: s.aliases || [],
      categoryId: s.categoryId || 'cat_other',
      youtubeUrl: s.youtubeUrl || '',
      youtubeVideoId: s.youtubeVideoId || '',
      lyricsBn: s.lyricsBn || '',
      lyricsStatus: s.lyricsStatus || (s.lyricsBn ? 'unreviewed' : 'missing'),
      lyricsOrigin: s.lyricsOrigin || (s.lyricsBn ? 'pasted' : null),
      sources: s.sources || [],
      notes: s.notes || '',
      searchKey: s.searchKey || { bn: '', latin: '' },
      createdAt: s.createdAt || new Date().toISOString(),
      updatedAt: s.updatedAt || new Date().toISOString(),
      lyricsUpdatedAt: s.lyricsUpdatedAt || null,
      playCount: s.playCount || 0,
      lastPlayedAt: s.lastPlayedAt || null,
      totalListenTimeSec: s.totalListenTimeSec || 0,
      hasAudio: Boolean(s.hasAudio),
      audioMeta: s.audioMeta || null,
    }));

    await songRepository.bulkImport(songs, categories, mode);

    if (mode === 'replace' && backupJson.settings && backupJson.type === 'full_backup') {
      await songRepository.saveSettings(backupJson.settings);
    }

    return {
      songsCount: songs.length,
      categoriesCount: categories.length,
    };
  },
};
