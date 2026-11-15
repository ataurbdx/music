import { SongRecord } from '../types';

/**
 * Maps Bengali digits (০-৯) to ASCII digits (0-9)
 */
const BENGALI_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

/**
 * 1. Normalize Unicode to NFC
 * 2. Strip ZWJ, ZWNJ, soft hyphen
 * 3. Map Bengali digits to ASCII digits
 * 4. Remove punctuation including danda (।) and double danda (॥)
 * 5. Lowercase and collapse whitespace
 */
export function normalizeBengali(text: string): string {
  if (!text) return '';
  
  let s = text.normalize('NFC');
  
  // Strip ZWJ, ZWNJ, soft hyphens
  s = s.replace(/[\u200C\u200D\u00AD\uFEFF]/g, '');
  
  // Map Bengali digits to ASCII
  s = s.replace(/[০-৯]/g, (d) => BENGALI_DIGITS[d] || d);
  
  // Remove danda, double danda, and standard punctuation/symbols
  s = s.replace(/[।॥!?,:;"'(){}\[\]<>~`@#$%^&*_\-+=/\\|]/g, ' ');
  
  // Lowercase and collapse whitespace
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Latin folding for Bengali transliterations:
 * - Strip diacritics
 * - Lowercase
 * - Fold common phonetic variants: ee -> i, oo -> u, aa -> a, sh -> s, z -> j, bh -> v, ph -> f, etc.
 * - Collapse repeated letters (e.g. "shundooor" -> "shundur")
 */
export function normalizeLatin(text: string): string {
  if (!text) return '';

  let s = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');

  // Strip ZWJ, ZWNJ, soft hyphens
  s = s.replace(/[\u200C\u200D\u00AD\uFEFF]/g, '');

  // Lowercase
  s = s.toLowerCase();

  // Strip punctuation
  s = s.replace(/[।॥!?,:;"'(){}\[\]<>~`@#$%^&*_\-+=/\\|]/g, ' ');

  // Common Bengali-English transliteration phonetic folds
  // Run folds in deliberate order
  s = s
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/aa+/g, 'a')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/bh/g, 'v')
    .replace(/ph/g, 'f')
    .replace(/z/g, 'j')
    .replace(/w/g, 'o');

  // Collapse consecutive identical characters (e.g. "kothaaa" -> "kotha")
  s = s.replace(/(.)\1+/g, '$1');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Precomputes search keys for a song (Bengali and Latin)
 */
export function computeSearchKey(
  titleBn: string,
  titleLatin: string,
  aliases: string[] = []
): { bn: string; latin: string } {
  const allAliases = aliases.join(' ');
  const combinedBn = `${titleBn} ${allAliases}`;
  const combinedLatin = `${titleLatin} ${allAliases}`;

  return {
    bn: normalizeBengali(combinedBn),
    latin: normalizeLatin(combinedLatin),
  };
}

/**
 * Compute the Bengali script ratio (\u0980-\u09FF) in a text
 */
export function computeBengaliRatio(text: string): number {
  if (!text) return 0;
  const letters = text.replace(/[\s\d\p{P}]/gu, '');
  if (!letters.length) return 0;
  
  const bengaliChars = text.match(/[\u0980-\u09FF]/g) || [];
  return bengaliChars.length / letters.length;
}

/**
 * Check if all tokens of query match target string (AND logic)
 */
function matchesAllTokens(target: string, queryTokens: string[]): boolean {
  if (!target) return false;
  return queryTokens.every((token) => target.includes(token));
}

/**
 * Ranks search results according to:
 * 1. Exact/prefix title start
 * 2. Token start (word boundary match)
 * 3. Substring match in title/aliases
 * 4. Category match
 * 5. Lyrics match (if enabled)
 */
export function rankSearchResults(
  songs: SongRecord[],
  rawQuery: string,
  categoryMap: Map<string, string>,
  searchLyrics = false
): SongRecord[] {
  const query = rawQuery.trim();
  if (!query) return songs;

  const normQueryBn = normalizeBengali(query);
  const normQueryLatin = normalizeLatin(query);

  const tokensBn = normQueryBn.split(' ').filter(Boolean);
  const tokensLatin = normQueryLatin.split(' ').filter(Boolean);

  interface ScoredSong {
    song: SongRecord;
    score: number;
  }

  const scored: ScoredSong[] = [];

  for (const song of songs) {
    const keyBn = song.searchKey?.bn || normalizeBengali(song.titleBn);
    const keyLatin = song.searchKey?.latin || normalizeLatin(song.titleLatin);
    const categoryName = categoryMap.get(song.categoryId) || '';
    const normCategory = normalizeLatin(categoryName);

    const matchesBn = tokensBn.length > 0 && matchesAllTokens(keyBn, tokensBn);
    const matchesLatin = tokensLatin.length > 0 && matchesAllTokens(keyLatin, tokensLatin);
    const matchesCategory = tokensLatin.length > 0 && matchesAllTokens(normCategory, tokensLatin);

    let matchesLyrics = false;
    if (searchLyrics && song.lyricsBn) {
      const normLyricsBn = normalizeBengali(song.lyricsBn);
      matchesLyrics = tokensBn.length > 0 && matchesAllTokens(normLyricsBn, tokensBn);
    }

    if (!matchesBn && !matchesLatin && !matchesCategory && !matchesLyrics) {
      continue;
    }

    let score = 0;

    const normTitleBn = normalizeBengali(song.titleBn);
    const normTitleLatin = normalizeLatin(song.titleLatin);

    // Exact title match gets highest score
    if (normTitleBn === normQueryBn || normTitleLatin === normQueryLatin) {
      score += 1000;
    }
    // Prefix title start
    else if (normTitleBn.startsWith(normQueryBn) || normTitleLatin.startsWith(normQueryLatin)) {
      score += 500;
    }
    // Word boundary start
    else if (
      normTitleBn.split(' ').some((w) => w.startsWith(normQueryBn)) ||
      normTitleLatin.split(' ').some((w) => w.startsWith(normQueryLatin))
    ) {
      score += 250;
    }
    // Substring match in title or aliases
    else if (matchesBn || matchesLatin) {
      score += 100;
    }
    // Category match
    else if (matchesCategory) {
      score += 50;
    }
    // Lyrics match
    else if (matchesLyrics) {
      score += 20;
    }

    // Secondary boost: reviewed songs slightly preferred in rank
    if (song.lyricsStatus === 'reviewed') score += 5;
    else if (song.lyricsStatus === 'unreviewed') score += 2;

    scored.push({ song, score });
  }

  // Sort descending by score, then importSerial or title
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.song.importSerial != null && b.song.importSerial != null) {
      return a.song.importSerial - b.song.importSerial;
    }
    return a.song.titleLatin.localeCompare(b.song.titleLatin);
  });

  return scored.map((s) => s.song);
}
