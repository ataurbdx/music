import Dexie, { type EntityTable } from 'dexie';
import { SongRecord, CategoryRecord, AppSettings, AudioBlobRecord, PlaylistRecord, DownloadQueueItem } from '../types';

export const SCHEMA_VERSION = 3;

export interface SettingsRecord {
  id: string; // 'app_settings'
  settings: AppSettings;
}

export class TourLyricsDatabase extends Dexie {
  songs!: EntityTable<SongRecord, 'id'>;
  categories!: EntityTable<CategoryRecord, 'id'>;
  settingsTable!: EntityTable<SettingsRecord, 'id'>;
  audioBlobs!: EntityTable<AudioBlobRecord, 'id'>;
  playlists!: EntityTable<PlaylistRecord, 'id'>;
  downloadQueue!: EntityTable<DownloadQueueItem, 'id'>;

  constructor() {
    super('TourLyricsDB');

    // Version 1: initial schema
    this.version(1).stores({
      songs: 'id, importSerial, categoryId, youtubeVideoId, lyricsStatus, updatedAt, createdAt',
      categories: 'id, sortOrder',
      settingsTable: 'id',
    });

    // Version 2: audio engine, playlists, download queue, analytics
    this.version(2)
      .stores({
        songs: 'id, importSerial, categoryId, youtubeVideoId, lyricsStatus, hasAudio, playCount, lastPlayedAt, updatedAt, createdAt',
        categories: 'id, sortOrder',
        settingsTable: 'id',
        audioBlobs: 'id, songId, updatedAt',
        playlists: 'id, name, createdAt, updatedAt',
        downloadQueue: 'id, songId, status, createdAt',
      })
      .upgrade((tx) => {
        return tx
          .table('songs')
          .toCollection()
          .modify((song) => {
            if (song.playCount === undefined) song.playCount = 0;
            if (song.lastPlayedAt === undefined) song.lastPlayedAt = null;
            if (song.totalListenTimeSec === undefined) song.totalListenTimeSec = 0;
            if (song.hasAudio === undefined) song.hasAudio = false;
            if (song.audioMeta === undefined) song.audioMeta = null;
          });
      });

    // Version 3: community user identity, privacy flag, sync status, YouTube embed
    this.version(3)
      .stores({
        songs: 'id, importSerial, categoryId, youtubeVideoId, lyricsStatus, hasAudio, createdByUser, isPrivate, syncStatus, playCount, lastPlayedAt, updatedAt, createdAt',
        categories: 'id, sortOrder',
        settingsTable: 'id',
        audioBlobs: 'id, songId, updatedAt',
        playlists: 'id, name, createdAt, updatedAt',
        downloadQueue: 'id, songId, status, createdAt',
      })
      .upgrade((tx) => {
        return tx
          .table('songs')
          .toCollection()
          .modify((song) => {
            if (song.isPrivate === undefined) song.isPrivate = false;
            if (song.syncStatus === undefined) song.syncStatus = 'local_only';
            if (song.createdByUser === undefined) song.createdByUser = 'Tour_Singer_101';
          });
      });
  }
}

export const db = new TourLyricsDatabase();
