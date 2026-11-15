export interface LyricsSourceConfig {
  id: string;
  name: string;
  domain: string;
  searchUrlTemplate: string;
  enabledByDefault: boolean;
  language?: 'bn' | 'en' | 'all';
  notes?: string;
}

export const APPROVED_LYRICS_SOURCES: LyricsSourceConfig[] = [
  // --- Bengali Archives ---
  {
    id: 'lyrics71',
    name: 'Lyrics 71',
    domain: 'lyrics71.net',
    searchUrlTemplate: 'https://lyrics71.net/?s={query}',
    enabledByDefault: true,
    language: 'bn',
    notes: 'Largest active collection of modern, band, and folk Bengali song lyrics.',
  },
  {
    id: 'bangla-lyrics',
    name: 'Bangla-Lyrics.com',
    domain: 'bangla-lyrics.com',
    searchUrlTemplate: 'https://bangla-lyrics.com/?s={query}',
    enabledByDefault: true,
    language: 'bn',
    notes: 'Active archive for Bengali band songs, cinema, and modern tracks.',
  },
  {
    id: 'chordzone',
    name: 'ChordZone Bangla',
    domain: 'chordzone.org',
    searchUrlTemplate: 'https://www.chordzone.org/search?q={query}',
    enabledByDefault: true,
    language: 'bn',
    notes: 'Acoustic adda favorites, chords, and Bengali lyrics.',
  },
  {
    id: 'geetabitan',
    name: 'Geetabitan Archive',
    domain: 'geetabitan.com',
    searchUrlTemplate: 'http://www.geetabitan.com/lyrics/search.jsp?q={query}',
    enabledByDefault: true,
    language: 'bn',
    notes: 'Complete traditional Rabindra and classic archive.',
  },
  {
    id: 'smule',
    name: 'Smule Community',
    domain: 'smule.com',
    searchUrlTemplate: 'https://www.smule.com/search?q={query}',
    enabledByDefault: true,
    language: 'all',
    notes: 'Crowdsourced verified karaoke song lyrics and arrangements.',
  },

  // --- English & International Archives ---
  {
    id: 'genius',
    name: 'Genius',
    domain: 'genius.com',
    searchUrlTemplate: 'https://genius.com/search?q={query}',
    enabledByDefault: true,
    language: 'all',
    notes: 'World largest collection of song lyrics and musical knowledge.',
  },
  {
    id: 'azlyrics',
    name: 'AZLyrics',
    domain: 'azlyrics.com',
    searchUrlTemplate: 'https://search.azlyrics.com/search.php?q={query}',
    enabledByDefault: true,
    language: 'en',
    notes: 'Authoritative clean lyrics archive with long-standing catalog.',
  },
  {
    id: 'songlyrics',
    name: 'SongLyrics.com',
    domain: 'songlyrics.com',
    searchUrlTemplate: 'https://www.songlyrics.com/index.php?section=search&searchW={query}',
    enabledByDefault: true,
    language: 'en',
    notes: 'Fast, high-uptime international lyrics database.',
  },
  {
    id: 'lyricsbox',
    name: 'LyricsBox',
    domain: 'lyricsbox.com',
    searchUrlTemplate: 'https://www.lyricsbox.com/search?q={query}',
    enabledByDefault: true,
    language: 'en',
    notes: 'Direct text lyrics with clean formatting.',
  },
  {
    id: 'lyricsmania',
    name: 'LyricsMania',
    domain: 'lyricsmania.com',
    searchUrlTemplate: 'https://www.lyricsmania.com/search.php?k={query}',
    enabledByDefault: true,
    language: 'en',
    notes: 'Extensive English song archive with verified releases.',
  },
  {
    id: 'elyrics',
    name: 'eLyrics',
    domain: 'elyrics.net',
    searchUrlTemplate: 'https://www.elyrics.net/search.php?q={query}',
    enabledByDefault: true,
    language: 'en',
    notes: 'Classic and contemporary international songs.',
  },
  {
    id: 'letras',
    name: 'Letras',
    domain: 'letras.com',
    searchUrlTemplate: 'https://www.letras.com/?q={query}',
    enabledByDefault: true,
    language: 'en',
    notes: 'Global music lyrics catalogue.',
  },
];
