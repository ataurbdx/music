/**
 * Device Storage Audio Scanner & Metadata Extractor
 * Handles folder and file scanning, audio duration probing,
 * voice note filtering, and title/artist clean formatting.
 */

export interface ScannedAudioTrack {
  id: string;
  file: File;
  fileName: string;
  title: string;
  artist: string;
  format: string; // 'mp3' | 'm4a' | 'wav' | 'flac' | 'aac' | 'opus' | 'ogg'
  sizeBytes: number;
  sizeFormatted: string;
  durationSeconds: number;
  durationFormatted: string;
  isVoiceNote: boolean;
}

const SUPPORTED_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus', 'wma']);

/**
 * Checks if a file is an audio file by extension or MIME type
 */
export function isAudioFile(file: File): boolean {
  if (file.type && file.type.startsWith('audio/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return Boolean(ext && SUPPORTED_EXTENSIONS.has(ext));
}

/**
 * Format bytes to readable string (e.g. 4.2 MB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format seconds to mm:ss (e.g. 3:45)
 */
export function formatAudioDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds <= 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Parse file name to extract clean artist and track title
 * e.g. "Lewis Capaldi - Someone You Loved.mp3" -> Artist: Lewis Capaldi, Title: Someone You Loved
 * e.g. "01 - Amar Praner Manush.mp3" -> Title: Amar Praner Manush
 * e.g. "AUD-20231102-WA0001.opus" -> Voice Note
 */
export function parseAudioFileName(fileName: string): { title: string; artist: string; isLikelyVoiceNote: boolean } {
  // Strip extension
  const raw = fileName.replace(/\.[^/.]+$/, '').trim();

  // Check common voice note / recording patterns (WhatsApp, Telegram, Voice Recorder)
  const isLikelyVoiceNote = /^(aud-\d{8}-wa|ptt-\d{8}-wa|voice[_\-\s]|rec[_\-\s]|recording[_\-\s]|call[_\-\s]|memo[_\-\s]|audio[_\-\s]\d+)/i.test(
    raw
  );

  // Clean common file prefixes like track numbers "01. ", "01 - ", "01_", "[320kbps] ", etc.
  let cleaned = raw
    .replace(/^\[.*?\]\s*/g, '')
    .replace(/^\d+[\s\.\-_]+/g, '')
    .replace(/[_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Check for separator like " - " or " – "
  let artist = '';
  let title = cleaned;

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }
  } else if (cleaned.includes(' – ')) {
    const parts = cleaned.split(' – ');
    if (parts.length >= 2) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' – ').trim();
    }
  }

  // Remove common trailing junk like "(Official Video)", "[Lyrics]", "(320kbps)"
  title = title
    .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyrics|lyric\s*video|320\s*kbps|128\s*kbps|remastered)[\)\]]/gi, '')
    .trim();

  return {
    title: title || raw,
    artist: artist,
    isLikelyVoiceNote,
  };
}

/**
 * Probes the duration of an audio file using HTML5 Audio element
 */
export async function probeAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          URL.revokeObjectURL(url);
          audio.src = '';
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve(0);
      }, 2000);

      audio.addEventListener('loadedmetadata', () => {
        const dur = audio.duration;
        clearTimeout(timer);
        cleanup();
        resolve(isFinite(dur) && dur > 0 ? Math.round(dur) : 0);
      });

      audio.addEventListener('error', () => {
        clearTimeout(timer);
        cleanup();
        resolve(0);
      });

      audio.preload = 'metadata';
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}

/**
 * Scans an array of File objects and returns processed ScannedAudioTracks
 */
export async function processAudioFiles(
  files: File[],
  onProgress?: (processed: number, total: number) => void
): Promise<ScannedAudioTrack[]> {
  const audioFiles = files.filter(isAudioFile);
  const tracks: ScannedAudioTrack[] = [];

  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    const ext = (file.name.split('.').pop() || 'mp3').toLowerCase();
    const { title, artist, isLikelyVoiceNote } = parseAudioFileName(file.name);
    
    // Probing duration (fast metadata read)
    const durationSeconds = await probeAudioDuration(file);
    const isShortRecording = durationSeconds > 0 && durationSeconds < 30;

    tracks.push({
      id: `dev_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
      file,
      fileName: file.name,
      title,
      artist,
      format: ext.toUpperCase(),
      sizeBytes: file.size,
      sizeFormatted: formatFileSize(file.size),
      durationSeconds,
      durationFormatted: formatAudioDuration(durationSeconds),
      isVoiceNote: isLikelyVoiceNote || isShortRecording,
    });

    if (onProgress) {
      onProgress(i + 1, audioFiles.length);
    }
  }

  return tracks;
}

/**
 * Scans a folder recursively using the File System Access API (showDirectoryPicker)
 */
export async function scanFolderWithDirectoryPicker(
  onProgress?: (count: number) => void
): Promise<File[]> {
  if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
    throw new Error('DIRECTORY_PICKER_UNSUPPORTED');
  }

  const dirHandle = await (window as any).showDirectoryPicker({
    id: 'tour_lyrics_music_scan',
    mode: 'read',
  });

  const collectedFiles: File[] = [];

  async function traverse(handle: any) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (ext && SUPPORTED_EXTENSIONS.has(ext)) {
          const file = await entry.getFile();
          collectedFiles.push(file);
          if (onProgress) onProgress(collectedFiles.length);
        }
      } else if (entry.kind === 'directory') {
        // Skip hidden directories and android system folders
        if (!entry.name.startsWith('.') && !/^(android|data|\.thumbnails)$/i.test(entry.name)) {
          await traverse(entry);
        }
      }
    }
  }

  await traverse(dirHandle);
  return collectedFiles;
}

