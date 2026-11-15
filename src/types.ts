export type LyricsStatus = 'missing' | 'unreviewed' | 'reviewed';
export type LyricsOrigin = null | 'fetched' | 'pasted' | 'typed';

export interface LyricsSource {
  url: string;
  siteId: string;
  fetchedAt: string;
  coverage: number;
}

export interface SongAudioMeta {
  format: string; // 'mp3' | 'm4a' | 'opus' | 'wav' | 'flac' | 'demo-synth'
  bitrate: string; // '320kbps' | '256kbps' | '192kbps' | '128kbps' | 'lossless'
  sizeBytes: number;
  durationSec: number;
  sourceType: 'yt-download' | 'local-file' | 'demo-synth';
  localUri: string | null;
}

export interface SongRecord {
  id: string; // Stable UUID/ULID
  importSerial: number | null; // Informational from CSV
  titleLatin: string;
  titleBn: string;
  artist?: string;
  language?: 'bn' | 'en';
  aliases: string[];
  categoryId: string;
  youtubeUrl: string;
  youtubeVideoId: string; // 11-char canonical ID for deduplication
  youtubePlaylistId?: string; // Canonical YouTube playlist ID (e.g. PL...)
  youtubeEmbedUrl?: string; // e.g. https://www.youtube.com/embed/VIDEO_ID or playlist embed
  thumbnailUrl?: string; // YouTube thumbnail or custom cover
  lyricsBn: string; // Plain UTF-8 NFC, \n line breaks, blank line between stanzas
  lyricsLanguage?: 'bn' | 'en'; // 'bn' (default) or 'en' (user approved)
  lyricsStatus: LyricsStatus;
  lyricsOrigin: LyricsOrigin;
  sources: LyricsSource[];
  notes: string;
  searchKey: {
    bn: string;
    latin: string;
  };
  createdAt: string;
  updatedAt: string;
  lyricsUpdatedAt: string | null;

  // Community & Cloud Sync extensions
  createdByUser?: string; // Cool gaming username, e.g. 'Baul_Rider_402'
  isPrivate?: boolean; // If true, local device only, never synced to cloud
  syncStatus?: 'synced' | 'local_only' | 'pending_sync';

  // Audio & Analytics extensions
  playCount: number; // default 0
  lastPlayedAt: string | null;
  totalListenTimeSec: number; // default 0
  hasAudio: boolean; // default false
  audioMeta?: SongAudioMeta | null;
}

export interface AudioBlobRecord {
  id: string;
  songId: string;
  blob: Blob;
  mimeType: string;
  updatedAt: string;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  description: string;
  songIds: string[];
  coverColor: string;
  youtubePlaylistId?: string;
  youtubePlaylistUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type DownloadStatus = 'queued' | 'extracting' | 'converting' | 'completed' | 'failed';

export interface DownloadQueueItem {
  id: string;
  songId: string;
  youtubeUrl: string;
  title: string;
  format: string; // 'mp3' | 'm4a' | 'opus' | 'wav' | 'flac'
  quality: string; // '320k' | '256k' | '192k' | '128k'
  status: DownloadStatus;
  progress: number; // 0 to 100
  error: string | null;
  createdAt: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
}

export interface FirebaseConfig {
  apiKey: string;
  projectId: string;
  appId?: string;
  authDomain?: string;
  databaseURL?: string;
  storageBucket?: string;
  collectionName?: string;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  fontSize: number; // 16px to 32px
  lineHeight: number; // 1.4 to 2.4
  keepAwake: boolean;
  fullTextLyricsSearch: boolean;
  // AI Provider & Model configuration
  aiProvider?: 'gemini' | 'openai_compatible';
  selectedModel: string;
  aiBaseUrl?: string;

  enabledSites: string[];
  lastBackupDate?: string | null;
  persistentStorageGranted?: boolean;
  ytdlpServerUrl?: string; // custom self-hosted backend url
  eqPreset?: string; // 'flat' | 'tour-bus-bass' | 'baul-vocal' | 'acoustic-warmth' | 'custom'
  eqBands?: number[]; // [60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz]
  preampDb?: number;

  // Community & Cloud additions
  userName?: string; // e.g. 'Baul_Rider_402'
  youtubeApiKey?: string; // Optional YouTube Data API v3 key
  cloudSyncEnabled?: boolean;
  firebaseConfig?: FirebaseConfig | null;
}

export interface LineMatchResult {
  lineIndex: number;
  text: string;
  matched: boolean;
  bestSimilarity: number;
  matchedSourceSnippet?: string;
}

export interface VerificationResult {
  passed: boolean;
  needsAttention: boolean;
  coverage: number;
  bengaliRatio: number;
  language?: 'bn' | 'en';
  lineCount: number;
  matchedLinesCount: number;
  lineDetails: LineMatchResult[];
  reasons: string[];
}

export interface ExtractedLyricsPayload {
  found: boolean;
  pageSongTitle?: string;
  lyricsBn: string;
  script?: 'bengali' | 'latin' | 'mixed';
  language?: 'bn' | 'en';
  sourceUrl?: string;
  siteId?: string;
}

export interface DuplicateConflict {
  existingSong: SongRecord;
  incomingSong: Partial<SongRecord>;
  conflictReason: 'youtubeVideoId' | 'normalizedTitle';
  resolution?: 'skip' | 'update' | 'keepBoth';
}

export interface CsvImportReport {
  totalRows: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  createdCategories: string[];
}

export interface YouTubePlaylistItem {
  videoId: string;
  title: string;
  youtubeUrl: string;
  embedUrl: string;
  thumbnailUrl: string;
  channelTitle: string;
  position: number;
}

export interface TourShareBundle {
  format: 'tour-lyrics-bundle';
  version: '2.0';
  exportedAt: string;
  author: string;
  songs: SongRecord[];
  categories: CategoryRecord[];
  playlists?: PlaylistRecord[];
}
