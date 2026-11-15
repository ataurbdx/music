import Papa from 'papaparse';
import { SongRecord, CategoryRecord, DuplicateConflict, CsvImportReport } from '../types';
import { extractYouTubeVideoId, sanitizeAndValidateYouTubeUrl } from './youtube';
import { computeSearchKey, normalizeBengali, normalizeLatin } from './normalize';
import { songRepository } from '../data/songRepository';

export interface ParsedCsvRow {
  serial?: number | null;
  rawTitle: string;
  titleBn?: string;
  titleLatin?: string;
  categoryName: string;
  youtubeUrl: string;
  lyricsBn?: string;
  notes?: string;
}

export interface CsvPreviewResult {
  hasMojibake: boolean;
  mojibakeWarning?: string;
  rows: ParsedCsvRow[];
  detectedColumns: {
    titleCol: string;
    serialCol?: string;
    categoryCol?: string;
    youtubeCol?: string;
    lyricsCol?: string;
    notesCol?: string;
  };
  conflicts: DuplicateConflict[];
  newCategories: string[];
  removedInvalidYoutubeCount: number;
}

/**
 * Checks if the text has signs of mojibake or UTF-8 corruption
 */
export function detectMojibake(text: string): boolean {
  if (text.includes('\uFFFD')) return true;
  if (/à[¦§]/.test(text)) return true;
  return false;
}

/**
 * Sanitizes lyrics text by filtering out spreadsheet booleans ("FALSE", "TRUE", "null", "undefined", etc.)
 */
export function sanitizeLyricsText(text?: string | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower === 'false' ||
    lower === 'true' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'none' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower === '-' ||
    lower === '--' ||
    lower === '0' ||
    lower === 'no'
  ) {
    return '';
  }
  // If there are no Bengali or English alphabetic letters, it's not lyrics
  if (!/[a-zA-Z\u0980-\u09FF]/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

/**
 * Normalizes header string for case-insensitive matching
 */
function cleanHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses CSV/TSV text, strips BOM, auto-detects delimiter, matches headers, and prepares preview
 */
export async function parseCsvContent(
  csvContent: string,
  existingSongs: SongRecord[],
  existingCategories: CategoryRecord[]
): Promise<CsvPreviewResult> {
  // Strip BOM if present
  const cleanContent = csvContent.replace(/^\uFEFF/, '');

  const hasMojibake = detectMojibake(cleanContent);
  const mojibakeWarning = hasMojibake
    ? 'Detected corrupted Bengali characters (mojibake or replacement characters). Please ensure your spreadsheet is exported as "CSV UTF-8 (Comma delimited)" before importing.'
    : undefined;

  const parsed = Papa.parse(cleanContent, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  if (!parsed.data || parsed.data.length === 0) {
    throw new Error('CSV file appears empty or unreadable.');
  }

  const sampleRow = parsed.data[0] as Record<string, string>;
  const rawHeaders = Object.keys(sampleRow);

  let titleCol = '';
  let titleBnCol = '';
  let titleLatinCol = '';
  let serialCol = '';
  let categoryCol = '';
  let youtubeCol = '';
  let lyricsCol = '';
  let notesCol = '';

  for (const h of rawHeaders) {
    const cleaned = cleanHeader(h);

    if (!lyricsCol && (cleaned.includes('lyric') || cleaned.includes('kotha') || cleaned.includes('words') || cleaned.includes('text') || cleaned.includes('gaanerkotha'))) {
      lyricsCol = h;
    } else if (!categoryCol && (cleaned.includes('category') || cleaned.includes('genre') || cleaned.includes('type') || cleaned.includes('shreni'))) {
      categoryCol = h;
    } else if (!youtubeCol && (cleaned.includes('youtube') || cleaned.includes('link') || cleaned.includes('url') || cleaned.includes('video'))) {
      youtubeCol = h;
    } else if (!serialCol && (cleaned === 'serial' || cleaned === 'sl' || cleaned === 'no' || cleaned === 'id' || cleaned === 'number')) {
      serialCol = h;
    } else if (!titleBnCol && (cleaned.includes('bangla') || cleaned.includes('bengali') || cleaned.includes('titlebn'))) {
      titleBnCol = h;
    } else if (!titleLatinCol && (cleaned.includes('english') || cleaned.includes('latin') || cleaned.includes('titleen'))) {
      titleLatinCol = h;
    } else if (!notesCol && (cleaned.includes('artist') || cleaned.includes('singer') || cleaned.includes('note') || cleaned.includes('info'))) {
      notesCol = h;
    } else if (!titleCol && (cleaned.includes('title') || cleaned.includes('song') || cleaned.includes('name') || cleaned === 'gaan')) {
      titleCol = h;
    }
  }

  // Fallbacks
  if (!titleCol) {
    titleCol = titleBnCol || titleLatinCol || rawHeaders[0];
  }

  const rows: ParsedCsvRow[] = [];
  const categoryNamesSet = new Set<string>();
  const existingCatNamesLower = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  let removedInvalidYoutubeCount = 0;

  for (const item of parsed.data as Record<string, string>[]) {
    const rawTitle = (item[titleCol] || item[titleBnCol] || item[titleLatinCol] || '').trim();
    if (!rawTitle) continue;

    let serial: number | null = null;
    if (serialCol && item[serialCol]) {
      const num = parseInt(item[serialCol].replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) serial = num;
    }

    const categoryName = (categoryCol ? item[categoryCol] : '')?.trim() || 'Other';
    const rawYt = (youtubeCol ? item[youtubeCol] : '')?.trim() || '';
    const validatedYt = sanitizeAndValidateYouTubeUrl(rawYt);
    if (rawYt && !validatedYt.isValid) {
      removedInvalidYoutubeCount++;
    }
    const youtubeUrl = validatedYt.isValid ? validatedYt.canonicalUrl : '';
    const lyricsBn = sanitizeLyricsText(lyricsCol ? item[lyricsCol] : '');
    const notes = (notesCol ? item[notesCol] : '')?.trim() || '';

    const titleBn = (titleBnCol ? item[titleBnCol] : '')?.trim() || rawTitle;
    const titleLatin = (titleLatinCol ? item[titleLatinCol] : '')?.trim() || rawTitle;

    rows.push({
      serial,
      rawTitle,
      titleBn,
      titleLatin,
      categoryName,
      youtubeUrl,
      lyricsBn,
      notes,
    });

    if (categoryName && !existingCatNamesLower.has(categoryName.toLowerCase())) {
      categoryNamesSet.add(categoryName);
    }
  }

  // Find conflicts with existing songs
  const conflicts: DuplicateConflict[] = [];

  for (const r of rows) {
    const videoId = extractYouTubeVideoId(r.youtubeUrl);
    const normBn = normalizeBengali(r.titleBn || r.rawTitle);
    const normLatin = normalizeLatin(r.titleLatin || r.rawTitle);

    let matched: SongRecord | undefined;
    let reason: 'youtubeVideoId' | 'normalizedTitle' = 'normalizedTitle';

    if (videoId) {
      matched = existingSongs.find((s) => s.youtubeVideoId === videoId);
      if (matched) reason = 'youtubeVideoId';
    }

    if (!matched) {
      matched = existingSongs.find((s) => {
        if (normBn && normalizeBengali(s.titleBn) === normBn) return true;
        if (normLatin && normalizeLatin(s.titleLatin) === normLatin) return true;
        return false;
      });
    }

    if (matched) {
      conflicts.push({
        existingSong: matched,
        incomingSong: {
          titleLatin: r.titleLatin || r.rawTitle,
          titleBn: r.titleBn || r.rawTitle,
          importSerial: r.serial,
          youtubeUrl: r.youtubeUrl,
          youtubeVideoId: videoId,
          lyricsBn: r.lyricsBn,
          notes: r.notes,
        },
        conflictReason: reason,
        resolution: 'skip',
      });
    }
  }

  return {
    hasMojibake,
    mojibakeWarning,
    rows,
    detectedColumns: {
      titleCol,
      serialCol: serialCol || undefined,
      categoryCol: categoryCol || undefined,
      youtubeCol: youtubeCol || undefined,
      lyricsCol: lyricsCol || undefined,
      notesCol: notesCol || undefined,
    },
    conflicts,
    newCategories: Array.from(categoryNamesSet),
    removedInvalidYoutubeCount,
  };
}

/**
 * Executes CSV import in an atomic transaction
 */
export async function executeCsvImport(
  rows: ParsedCsvRow[],
  conflicts: DuplicateConflict[],
  globalConflictResolution: 'skip' | 'update' | 'keepBoth',
  newCategories: string[],
  clearStarterFirst = false
): Promise<CsvImportReport> {
  const report: CsvImportReport = {
    totalRows: rows.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    createdCategories: [],
  };

  try {
    if (clearStarterFirst) {
      // Clear starter songs so user only sees their own songs
      await songRepository.clearLibrary();
    }

    // Ensure all categories exist
    const categoryMap = new Map<string, string>();
    const existingCats = await songRepository.getAllCategories();
    existingCats.forEach((c) => categoryMap.set(c.name.toLowerCase(), c.id));

    for (const catName of newCategories) {
      if (!categoryMap.has(catName.toLowerCase())) {
        const created = await songRepository.addCategory(catName);
        categoryMap.set(catName.toLowerCase(), created.id);
        report.createdCategories.push(catName);
      }
    }

    const defaultOtherCat = existingCats.find((c) => c.name.toLowerCase() === 'other')?.id || 'cat_other';

    const conflictLookup = new Map<string, DuplicateConflict>();
    if (!clearStarterFirst) {
      conflicts.forEach((c) => {
        const vid = c.incomingSong.youtubeVideoId;
        const title = c.incomingSong.titleLatin || '';
        if (vid) conflictLookup.set(`vid:${vid}`, c);
        if (title) conflictLookup.set(`title:${normalizeLatin(title)}`, c);
      });
    }

    const songsToInsert: SongRecord[] = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      try {
        const validatedYt = sanitizeAndValidateYouTubeUrl(row.youtubeUrl);
        const validYtUrl = validatedYt.isValid ? validatedYt.canonicalUrl : '';
        const videoId = validatedYt.videoId;
        const playlistId = validatedYt.playlistId;
        const embedUrl = validatedYt.embedUrl;
        const catId = categoryMap.get(row.categoryName.toLowerCase()) || defaultOtherCat;

        const effectiveTitleBn = row.titleBn || row.rawTitle;
        const effectiveTitleLatin = row.titleLatin || row.rawTitle;

        if (!clearStarterFirst) {
          const conflict =
            (videoId ? conflictLookup.get(`vid:${videoId}`) : null) ||
            conflictLookup.get(`title:${normalizeLatin(effectiveTitleLatin)}`);

          const resolution = conflict?.resolution || globalConflictResolution;

          if (conflict) {
            if (resolution === 'skip') {
              report.skipped++;
              continue;
            } else if (resolution === 'update') {
              await songRepository.updateSong(conflict.existingSong.id, {
                importSerial: row.serial ?? conflict.existingSong.importSerial,
                youtubeUrl: validYtUrl || conflict.existingSong.youtubeUrl,
                youtubeVideoId: videoId || conflict.existingSong.youtubeVideoId,
                youtubePlaylistId: playlistId || conflict.existingSong.youtubePlaylistId,
                youtubeEmbedUrl: embedUrl || conflict.existingSong.youtubeEmbedUrl,
                categoryId: catId || conflict.existingSong.categoryId,
                lyricsBn: row.lyricsBn || conflict.existingSong.lyricsBn,
                lyricsStatus: row.lyricsBn ? 'unreviewed' : conflict.existingSong.lyricsStatus,
                notes: row.notes || conflict.existingSong.notes,
              });
              report.updated++;
              continue;
            }
          }
        }

        const id = crypto.randomUUID ? crypto.randomUUID() : `song_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const searchKey = computeSearchKey(effectiveTitleBn, effectiveTitleLatin, []);

        const cleanLyrics = sanitizeLyricsText(row.lyricsBn);
        const hasLyrics = cleanLyrics.length > 0;

        songsToInsert.push({
          id,
          importSerial: row.serial ?? null,
          titleLatin: effectiveTitleLatin,
          titleBn: effectiveTitleBn,
          aliases: [],
          categoryId: catId,
          youtubeUrl: validYtUrl,
          youtubeVideoId: videoId,
          youtubePlaylistId: playlistId,
          youtubeEmbedUrl: embedUrl,
          lyricsBn: cleanLyrics,
          lyricsStatus: hasLyrics ? 'unreviewed' : 'missing',
          lyricsOrigin: hasLyrics ? 'pasted' : null,
          sources: hasLyrics
            ? [{ url: 'csv_import', siteId: 'sheet_csv', fetchedAt: now, coverage: 1.0 }]
            : [],
          notes: row.notes || '',
          searchKey,
          createdAt: now,
          updatedAt: now,
          lyricsUpdatedAt: hasLyrics ? now : null,
          playCount: 0,
          lastPlayedAt: null,
          totalListenTimeSec: 0,
          hasAudio: false,
          audioMeta: null,
        });

        report.imported++;
      } catch (rowErr: any) {
        report.failed++;
        report.errors.push(`Row "${row.rawTitle}": ${rowErr?.message || String(rowErr)}`);
      }
    }

    if (songsToInsert.length > 0) {
      await songRepository.bulkImport(songsToInsert, [], 'merge');
    }
  } catch (err: any) {
    report.errors.push(`Critical import error: ${err?.message || String(err)}`);
  }

  return report;
}
