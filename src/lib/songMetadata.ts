/**
 * Intelligent Song Metadata Parser & Query Generator
 * 
 * Accurately extracts canonical title, artist, version details, and context
 * from messy or combined user inputs like:
 * - "Artist | Song Title | Version"
 * - "Artist: Imagine Dragons | Song: Symphony | Version: Inner City Youth Orchestra... | Context: Coke Studio"
 * - "Song Title - Artist"
 * - "Artist - Song Title"
 * - "Song Title (Live Version)"
 * - "Song Title (Cover Version)"
 */

export interface ParsedSongMetadata {
  rawInput: string;
  artist?: string;
  canonicalTitle: string;
  alternateTitles: string[];
  versionDetails?: string;
  context?: string;
  language: 'bn' | 'en';
  searchVariants: {
    exactArtistTitle: string;
    canonicalTitleOnly: string;
    versionSpecific?: string;
    lyricsQueries: string[];
  };
}

const COMMON_VERSION_KEYWORDS = [
  'live version',
  'live at',
  'live in',
  'live performance',
  'acoustic version',
  'acoustic',
  'cover version',
  'cover',
  'orchestra version',
  'orchestra',
  'unplugged',
  'remix',
  'instrumental',
  'reprise',
  'slowed',
  'reverb',
  'karaoke',
  'studio version',
  'radio edit',
  'extended version',
  'deluxe',
  'bonus track',
  'official video',
  'music video',
  'lyric video',
  'full video',
  'full song',
  'audio song',
  'season 1',
  'season 2',
  'season 3',
  'season 4',
];

const KNOWN_BENGALI_ARTISTS = new Set([
  'lalon', 'fakir lalon shah', 'rabindranath tagore', 'kazi nazrul islam',
  'james', 'nagar baul', 'ayub bachy', 'lrb', 'artcell', 'warfaze',
  'shunno', 'miles', 'fossils', 'rupam islam', 'anupam roy', 'tahsan',
  'habib wahid', 'arnob', 'chirkutt', 'jalali set', 'shironamhin',
  'hemanta mukherjee', 'manna dey', 'kishore kumar', 'shyamal mitra',
  'sandhya mukherjee', 'aroti mukherjee', 'geeta dutt', 'sd burman',
  'rd burman', 'nachiketa', 'anjan dutt', 'suman', 'kabir suman'
]);

/**
 * Intelligent parser that separates Artist, Canonical Title, Version, and Context
 */
export function parseSongMetadata(rawInput: string, existingArtist?: string): ParsedSongMetadata {
  const cleanRaw = (rawInput || '').trim();
  if (!cleanRaw) {
    return {
      rawInput: '',
      canonicalTitle: '',
      alternateTitles: [],
      language: 'bn',
      searchVariants: {
        exactArtistTitle: '',
        canonicalTitleOnly: '',
        lyricsQueries: [],
      },
    };
  }

  let artist = (existingArtist || '').trim();
  let title = cleanRaw;
  let versionDetails: string | undefined;
  let context: string | undefined;
  const alternateTitles: string[] = [];

  // 1. Check for explicit key-value labels: "Artist: ... | Song: ... | Version: ... | Context: ..."
  if (/artist\s*:/i.test(title) || /song\s*:/i.test(title)) {
    const parts = title.split(/\s*\|\s*/);
    let parsedTitle = '';
    for (const part of parts) {
      const matchArtist = part.match(/^artist\s*:\s*(.+)$/i);
      const matchSong = part.match(/^(?:song|title)\s*:\s*(.+)$/i);
      const matchVersion = part.match(/^version\s*:\s*(.+)$/i);
      const matchContext = part.match(/^context\s*:\s*(.+)$/i);

      if (matchArtist) artist = matchArtist[1].trim();
      else if (matchSong) parsedTitle = matchSong[1].trim();
      else if (matchVersion) versionDetails = matchVersion[1].trim();
      else if (matchContext) context = matchContext[1].trim();
      else if (!parsedTitle) parsedTitle = part.trim();
    }
    if (parsedTitle) {
      title = parsedTitle;
    }
  }

  // 2. Check for pipe delimiters:
  if (!versionDetails && title.includes('|')) {
    const pipeParts = title.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (pipeParts.length >= 2) {
      const part0HasBn = /[\u0980-\u09FF]/.test(pipeParts[0]);
      const part1HasBn = /[\u0980-\u09FF]/.test(pipeParts[1]);

      // Sub-case A: Bilingual title pair (e.g. "শহরের দুইটা গান | Shohorer Duita Gaan | Hatirpool Sessions | Season 2")
      if (part0HasBn && !part1HasBn) {
        title = pipeParts[0]; // Canonical title in Bengali
        alternateTitles.push(pipeParts[1]); // Latin transliterated title

        if (pipeParts.length >= 3) {
          if (!artist) {
            artist = pipeParts[2];
          }
          if (pipeParts.length >= 4) {
            versionDetails = pipeParts.slice(3).join(' | ');
          }
        }
      } else if (!part0HasBn && part1HasBn) {
        title = pipeParts[1];
        alternateTitles.push(pipeParts[0]);

        if (pipeParts.length >= 3) {
          if (!artist) artist = pipeParts[2];
          if (pipeParts.length >= 4) versionDetails = pipeParts.slice(3).join(' | ');
        }
      } else {
        // Monolingual parts (e.g. "Imagine Dragons | Symphony" or "James | Kobita")
        if (!artist) {
          artist = pipeParts[0];
          title = pipeParts[1];
          if (pipeParts.length >= 3) {
            versionDetails = pipeParts.slice(2).join(' | ');
          }
        } else {
          title = pipeParts[0];
          versionDetails = pipeParts.slice(1).join(' | ');
        }
      }
    }
  }

  // 3. Extract bracketed context / versions: [Coke Studio], (Live Version)
  const bracketMatches = Array.from(title.matchAll(/[\[\(]([^\]\)]+)[\]\)]/g));
  for (const m of bracketMatches) {
    const inside = m[1].trim();
    const insideLower = inside.toLowerCase();

    const isVersionOrContext = COMMON_VERSION_KEYWORDS.some((kw) => insideLower.includes(kw));
    if (isVersionOrContext || insideLower.includes('version') || insideLower.includes('feat') || insideLower.includes('ft.')) {
      if (insideLower.includes('coke studio') || insideLower.includes('unplugged') || insideLower.includes('session')) {
        context = context ? `${context}, ${inside}` : inside;
      } else {
        versionDetails = versionDetails ? `${versionDetails}, ${inside}` : inside;
      }
      // Remove from core title
      title = title.replace(m[0], ' ').trim();
    }
  }

  // 4. Check for hyphen separator: "Artist - Song Title" or "Song Title - Artist"
  if (!artist && (title.includes(' - ') || title.includes(' – ') || title.includes(' — '))) {
    const parts = title.split(/\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const part0 = parts[0];
      const part1 = parts[1];

      // Check if part0 is likely artist or part1 is likely artist
      const part0Lower = part0.toLowerCase();
      const part1Lower = part1.toLowerCase();

      if (KNOWN_BENGALI_ARTISTS.has(part0Lower) || /^(imagine dragons|coldplay|lewis capaldi|ed sheeran|taylor swift|adele|queen|beatles)/i.test(part0Lower)) {
        artist = part0;
        title = part1;
      } else if (KNOWN_BENGALI_ARTISTS.has(part1Lower)) {
        artist = part1;
        title = part0;
      } else {
        // Standard convention: Left is Artist, Right is Song Title
        artist = part0;
        title = part1;
      }
    }
  }

  // Clean remaining title
  const canonicalTitle = title
    .replace(/\s+/g, ' ')
    .replace(/^["']|["']$/g, '')
    .trim();

  // Language auto-detection
  const isBengali = /[\u0980-\u09FF]/.test(canonicalTitle) || (artist && /[\u0980-\u09FF]/.test(artist));
  const language: 'bn' | 'en' = isBengali ? 'bn' : 'en';

  // Alternate titles: clean version without punctuation
  const noPunctTitle = canonicalTitle.replace(/[!?,:;"'(){}\[\]<>~`@#$%^&*_\-+=/\\|।॥]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noPunctTitle && noPunctTitle !== canonicalTitle && !alternateTitles.includes(noPunctTitle)) {
    alternateTitles.push(noPunctTitle);
  }

  // Construct progressive search queries
  const exactArtistTitle = artist ? `${artist} ${canonicalTitle}` : canonicalTitle;
  const canonicalTitleOnly = canonicalTitle;
  const versionSpecific = versionDetails ? `${exactArtistTitle} ${versionDetails}` : undefined;

  // 1. Raw clean query (matches real user web search)
  const rawClean = cleanRaw.replace(/\s*\|\s*/g, ' ').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const lyricsQueries: string[] = [`${rawClean} lyrics`];

  // 2. Exact artist + canonical title queries
  if (artist) {
    lyricsQueries.push(`${artist} ${canonicalTitle} lyrics`);
    lyricsQueries.push(`${canonicalTitle} ${artist} lyrics`);
  }
  lyricsQueries.push(`${canonicalTitle} lyrics`);

  // 3. Alternate titles (e.g. Latin transliteration)
  for (const alt of alternateTitles) {
    if (artist) lyricsQueries.push(`${artist} ${alt} lyrics`);
    lyricsQueries.push(`${alt} lyrics`);
  }

  // 4. Bengali specific queries
  if (language === 'bn') {
    lyricsQueries.push(`${canonicalTitle} বাংলা লিরিক্স`);
    lyricsQueries.push(`${canonicalTitle} লিরিক্স`);
    if (artist) lyricsQueries.push(`${artist} ${canonicalTitle} লিরিক্স`);
  }

  // 5. Version-specific queries
  if (versionSpecific) {
    lyricsQueries.push(`${versionSpecific} lyrics`);
  }

  return {
    rawInput: cleanRaw,
    artist: artist || undefined,
    canonicalTitle,
    alternateTitles,
    versionDetails,
    context,
    language,
    searchVariants: {
      exactArtistTitle,
      canonicalTitleOnly,
      versionSpecific,
      lyricsQueries,
    },
  };
}

