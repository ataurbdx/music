/**
 * YouTube URL Canonicalization, Embed Generation, and Playlist Fetcher Utilities
 */
import { YouTubePlaylistItem } from '../types';

/**
 * Extracts the canonical 11-character YouTube video ID from various URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 */
export function extractYouTubeVideoId(url: string): string {
  if (!url || typeof url !== 'string') return '';
  
  const trimmed = url.trim();

  // Pattern 1: youtu.be/<id>
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Pattern 2: youtube.com/shorts/<id>
  const shortsMatch = trimmed.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  // Pattern 3: youtube.com/embed/<id>
  const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // Pattern 4: watch?v=<id> (handles youtube.com and music.youtube.com)
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Direct 11-char ID check
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  return '';
}

export interface SanitizedYouTubeLink {
  isValid: boolean;
  type: 'video' | 'playlist' | 'none';
  canonicalUrl: string;
  videoId: string;
  playlistId: string;
  embedUrl: string;
}

/**
 * Validates and sanitizes a YouTube URL or ID.
 * Returns isValid: false and empty strings for any broken, non-YouTube, or invalid URLs
 * (such as arbitrary domains, text placeholders, "false", "N/A", or malformed links).
 */
export function sanitizeAndValidateYouTubeUrl(rawUrl?: string | null): SanitizedYouTubeLink {
  const invalidResult: SanitizedYouTubeLink = {
    isValid: false,
    type: 'none',
    canonicalUrl: '',
    videoId: '',
    playlistId: '',
    embedUrl: '',
  };

  if (!rawUrl || typeof rawUrl !== 'string') return invalidResult;

  const trimmed = rawUrl.trim();
  if (!trimmed) return invalidResult;

  // Discard common spreadsheet placeholder / non-link values
  const lower = trimmed.toLowerCase();
  if (
    [
      'false',
      'true',
      'null',
      'undefined',
      'n/a',
      'na',
      'none',
      '-',
      '--',
      'no',
      'nil',
      'no link',
      'nolink',
      'not available',
      'placeholder',
    ].includes(lower)
  ) {
    return invalidResult;
  }

  // If input contains a URL scheme or domain, verify it is genuinely YouTube
  if (/^https?:\/\//i.test(trimmed) || /^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)/i.test(trimmed)) {
    const isYtDomain =
      /^(https?:\/\/)?([a-zA-Z0-9-]+\.)*(youtube\.com|youtu\.be)($|\/|\?)/i.test(trimmed);
    if (!isYtDomain) {
      // Different website (e.g. facebook.com, google.com, example.com)
      return invalidResult;
    }
  } else {
    // If not a URL, it cannot contain slashes or colons unless it was a path
    if (trimmed.includes('://') || (trimmed.includes('/') && !trimmed.startsWith('youtu.be/'))) {
      return invalidResult;
    }
  }

  // 1. Check for YouTube Playlist
  const playlistId = extractYouTubePlaylistId(trimmed);
  if (playlistId) {
    const isYtDomain = /youtube\.com|youtu\.be/i.test(trimmed);
    const hasPlPrefix = /^(PL|UU|FL|RD|OLAK5uy|TLGG)[a-zA-Z0-9_-]+$/i.test(playlistId);
    if (isYtDomain || hasPlPrefix) {
      return {
        isValid: true,
        type: 'playlist',
        canonicalUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
        videoId: '',
        playlistId,
        embedUrl: buildYouTubePlaylistEmbedUrl(playlistId, true),
      };
    }
  }

  // 2. Check for YouTube Video
  const videoId = extractYouTubeVideoId(trimmed);
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    // Discard any 11-char false positives that match common english words
    if (['undefined11', 'placeholder', 'nullnullnul'].includes(videoId.toLowerCase())) {
      return invalidResult;
    }

    return {
      isValid: true,
      type: 'video',
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      playlistId: '',
      embedUrl: buildYouTubeEmbedUrl(videoId, true),
    };
  }

  return invalidResult;
}

/**
 * Generates an embed URL tailored for responsive in-app playback
 */
export function buildYouTubeEmbedUrl(videoId: string, autoplay = true): string {
  if (!videoId) return '';
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * Generates a high quality thumbnail URL from video ID
 */
export function buildYouTubeThumbnailUrl(videoId: string): string {
  if (!videoId) return '';
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Normalizes a YouTube URL into a clean share/open link without tracking params
 */
export function cleanYouTubeUrl(url: string): string {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return url.trim();
}

/**
 * Extracts a playlist ID from playlist URLs or returns direct playlist ID
 * - https://www.youtube.com/playlist?list=PL...
 * - https://youtube.com/watch?v=...&list=PL...
 * - https://music.youtube.com/playlist?list=...
 */
export function extractYouTubePlaylistId(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();

  // Pattern 1: URL query param ?list=... or &list=...
  const match = trimmed.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // Pattern 2: Direct playlist ID (PL, UU, FL, RD, OLAK5uy, etc.)
  if (/^(PL|UU|FL|RD|OLAK5uy|TLGG)[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[a-zA-Z0-9_-]{12,64}$/.test(trimmed)) {
    return trimmed;
  }
  return '';
}

/**
 * Generates an official YouTube embedded playlist player URL
 * Works 100% without requiring any YouTube API key or authentication!
 */
export function buildYouTubePlaylistEmbedUrl(playlistId: string, autoplay = true): string {
  if (!playlistId) return '';
  const params = new URLSearchParams({
    list: playlistId,
    autoplay: autoplay ? '1' : '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    origin: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  });
  return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
}

/**
 * Safely reads a developer-configured YouTube Data API key from environment variables
 * End-users NEVER need to provide or manage their own Google Cloud keys.
 */
export function getDeveloperYouTubeApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_YOUTUBE_API_KEY) {
    return String(import.meta.env.VITE_YOUTUBE_API_KEY).trim();
  }
  return '';
}

/**
 * oEmbed fetch for identifying song title, artist/channel name, and default thumbnail
 */
export async function fetchYouTubeOEmbed(url: string): Promise<{
  title: string;
  authorName: string;
  thumbnailUrl: string;
} | null> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      title: data.title || '',
      authorName: data.author_name || '',
      thumbnailUrl: data.thumbnail_url || buildYouTubeThumbnailUrl(videoId),
    };
  } catch {
    return {
      title: '',
      authorName: '',
      thumbnailUrl: buildYouTubeThumbnailUrl(videoId),
    };
  }
}

export interface FetchPlaylistResult {
  playlistId: string;
  embedUrl: string;
  canDirectPlay: boolean;
  canBulkImportTracks: boolean;
  items: YouTubePlaylistItem[];
  totalCount: number;
  playlistTitle: string;
  authorName: string;
  thumbnailUrl: string;
  statusNotice?: string;
  error?: string;
}

/**
 * Zero-configuration YouTube playlist handler:
 * 1. Always validates and generates direct official embedded playlist playback URL (no API key needed)
 * 2. If a developer key (VITE_YOUTUBE_API_KEY) or backend bridge service is available,
 *    automatically retrieves individual track titles, video IDs, and thumbnails.
 * 3. Keeps direct playlist playback 100% functional even when individual metadata import is unavailable.
 */
export async function fetchYouTubePlaylistEntries(
  playlistUrlOrId: string,
  serverUrl?: string
): Promise<FetchPlaylistResult> {
  const playlistId = extractYouTubePlaylistId(playlistUrlOrId);
  if (!playlistId) {
    return {
      playlistId: '',
      embedUrl: '',
      canDirectPlay: false,
      canBulkImportTracks: false,
      items: [],
      totalCount: 0,
      playlistTitle: '',
      authorName: '',
      thumbnailUrl: '',
      error: 'Invalid YouTube Playlist link. Please paste a valid playlist URL (e.g. youtube.com/playlist?list=...).',
    };
  }

  const embedUrl = buildYouTubePlaylistEmbedUrl(playlistId, true);
  const videoId = extractYouTubeVideoId(playlistUrlOrId);

  let playlistTitle = `YouTube Playlist (${playlistId.slice(0, 10)}...)`;
  let authorName = 'YouTube Community';
  let thumbnailUrl = videoId ? buildYouTubeThumbnailUrl(videoId) : `https://img.youtube.com/vi/${playlistId}/hqdefault.jpg`;

  // If a video ID is part of the playlist link (e.g. watch?v=xxx&list=yyy), fetch initial title and thumbnail via oEmbed
  if (videoId) {
    try {
      const oembed = await fetchYouTubeOEmbed(playlistUrlOrId);
      if (oembed) {
        if (oembed.title) playlistTitle = oembed.title;
        if (oembed.authorName) authorName = oembed.authorName;
        if (oembed.thumbnailUrl) thumbnailUrl = oembed.thumbnailUrl;
      }
    } catch {}
  }

  // 1. Direct on-device playlist extraction (Zero VPS, Zero Datacenter IP, 100% Client-side)
  try {
    const { youtubeDirectService } = await import('../services/youtubeDownloader');
    const directResult = await youtubeDirectService.getPlaylistVideos(playlistId);
    if (directResult.items && directResult.items.length > 0) {
      return {
        playlistId,
        embedUrl,
        canDirectPlay: true,
        canBulkImportTracks: true,
        items: directResult.items,
        totalCount: directResult.items.length,
        playlistTitle: directResult.title || playlistTitle,
        authorName: directResult.author || authorName,
        thumbnailUrl: directResult.items[0]?.thumbnailUrl || thumbnailUrl,
      };
    }
  } catch (directErr) {
    console.warn('Direct device playlist extract fallback:', directErr);
  }

  // 2. Check the built-in yt-dlp backend bridge (supports local PC bridge and Cloud VPS bridge)
  const fullPlaylistUrl = playlistUrlOrId.startsWith('http')
    ? playlistUrlOrId
    : `https://www.youtube.com/playlist?list=${playlistId}`;

  const endpointsToTry: string[] = [];
  const cleanServer = (serverUrl || 'https://yt-dlp-server-rr8t.onrender.com').trim().replace(/\/$/, '');

  // On local PC web (localhost:3000), try local relative endpoint first
  const isLocalWeb = typeof window !== 'undefined' && window.location?.hostname === 'localhost' && window.location?.port === '3000';
  if (isLocalWeb) {
    endpointsToTry.push('/api/playlist');
    endpointsToTry.push('/playlist');
  }

  if (cleanServer) {
    endpointsToTry.push(`${cleanServer}/api/playlist`);
    endpointsToTry.push(`${cleanServer}/playlist`);
  }

  if (!isLocalWeb) {
    endpointsToTry.push('/api/playlist');
  }

  for (const endpoint of endpointsToTry) {
    try {
      let res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fullPlaylistUrl }),
      });

      if (!res.ok && res.status === 404) {
        res = await fetch(`${endpoint}?url=${encodeURIComponent(fullPlaylistUrl)}`);
      }

      if (res.ok) {
        const data = await res.json();
        const rawEntries = data.items || data.entries || [];
        const items: YouTubePlaylistItem[] = rawEntries
          .map((entry: any, idx: number) => {
            const vidId = entry.id || entry.videoId;
            let thumb = '';
            if (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
              thumb = entry.thumbnails[entry.thumbnails.length - 1]?.url || entry.thumbnails[0]?.url;
            } else if (entry.thumbnail || entry.thumbnailUrl) {
              thumb = entry.thumbnail || entry.thumbnailUrl;
            } else if (vidId) {
              thumb = buildYouTubeThumbnailUrl(vidId);
            }

            return {
              videoId: vidId,
              title: entry.title || `Track ${idx + 1}`,
              youtubeUrl: entry.url || entry.youtubeUrl || `https://www.youtube.com/watch?v=${vidId}`,
              embedUrl: buildYouTubeEmbedUrl(vidId, true),
              thumbnailUrl: thumb,
              channelTitle: entry.channelTitle || entry.uploader || entry.channel || data.author || authorName,
              position: idx,
            };
          })
          .filter((item: YouTubePlaylistItem) => Boolean(item.videoId));

        if (items.length > 0) {
          return {
            playlistId,
            embedUrl,
            canDirectPlay: true,
            canBulkImportTracks: true,
            items,
            totalCount: items.length,
            playlistTitle: data.title || playlistTitle,
            authorName: data.author || data.uploader || authorName,
            thumbnailUrl: items[0]?.thumbnailUrl || thumbnailUrl,
          };
        }
      }
    } catch (err) {
      console.warn(`yt-dlp playlist check error on ${endpoint}, trying next:`, err);
    }
  }

  // 2. Check for developer-configured API key (never required from end-users)
  const devApiKey = getDeveloperYouTubeApiKey();

  if (devApiKey) {
    try {
      const items: YouTubePlaylistItem[] = [];
      let nextPageToken: string | undefined = undefined;
      let pageCount = 0;
      const maxPages = 15;

      do {
        pageCount++;
        const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('maxResults', '50');
        url.searchParams.set('playlistId', playlistId);
        url.searchParams.set('key', devApiKey);
        if (nextPageToken) {
          url.searchParams.set('pageToken', nextPageToken);
        }

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = await res.json();
          const rawItems = data.items || [];

          for (const raw of rawItems) {
            const snippet = raw.snippet;
            const vidId = snippet?.resourceId?.videoId;
            const title = snippet?.title;

            if (!vidId || title === 'Private video' || title === 'Deleted video') {
              continue;
            }

            const thumb =
              snippet?.thumbnails?.high?.url ||
              snippet?.thumbnails?.medium?.url ||
              snippet?.thumbnails?.default?.url ||
              buildYouTubeThumbnailUrl(vidId);

            items.push({
              videoId: vidId,
              title: title || `Track ${items.length + 1}`,
              youtubeUrl: `https://www.youtube.com/watch?v=${vidId}`,
              embedUrl: buildYouTubeEmbedUrl(vidId, true),
              thumbnailUrl: thumb,
              channelTitle: snippet?.channelTitle || snippet?.videoOwnerChannelTitle || authorName,
              position: snippet?.position ?? items.length,
            });
          }

          nextPageToken = data.nextPageToken;
        } else {
          break;
        }
      } while (nextPageToken && pageCount < maxPages);

      if (items.length > 0) {
        return {
          playlistId,
          embedUrl,
          canDirectPlay: true,
          canBulkImportTracks: true,
          items,
          totalCount: items.length,
          playlistTitle,
          authorName,
          thumbnailUrl: items[0]?.thumbnailUrl || thumbnailUrl,
        };
      }
    } catch (err) {
      console.warn('Developer YouTube API request error, proceeding with direct playlist playback:', err);
    }
  }

  // 2. Check for backend service (e.g. yt-dlp server)
  if (serverUrl && serverUrl.trim()) {
    try {
      const cleanServer = serverUrl.trim().replace(/\/$/, '');
      const res = await fetch(`${cleanServer}/playlist?url=${encodeURIComponent(playlistUrlOrId)}`);
      if (res.ok) {
        const data = await res.json();
        const rawEntries = data.entries || data.items || [];
        const items: YouTubePlaylistItem[] = rawEntries.map((entry: any, idx: number) => {
          const vidId = entry.id || entry.videoId;
          return {
            videoId: vidId,
            title: entry.title || `Track ${idx + 1}`,
            youtubeUrl: `https://www.youtube.com/watch?v=${vidId}`,
            embedUrl: buildYouTubeEmbedUrl(vidId, true),
            thumbnailUrl: entry.thumbnail || buildYouTubeThumbnailUrl(vidId),
            channelTitle: entry.channel || entry.uploader || authorName,
            position: idx,
          };
        }).filter((item: YouTubePlaylistItem) => Boolean(item.videoId));

        if (items.length > 0) {
          return {
            playlistId,
            embedUrl,
            canDirectPlay: true,
            canBulkImportTracks: true,
            items,
            totalCount: items.length,
            playlistTitle: data.title || playlistTitle,
            authorName: data.author || authorName,
            thumbnailUrl: items[0]?.thumbnailUrl || thumbnailUrl,
          };
        }
      }
    } catch (err) {
      console.warn('Backend playlist bridge error, proceeding with direct playlist playback:', err);
    }
  }

  // 3. Zero-Configuration Mode: Direct playlist playback is 100% ready
  return {
    playlistId,
    embedUrl,
    canDirectPlay: true,
    canBulkImportTracks: false,
    items: [],
    totalCount: 0,
    playlistTitle,
    authorName,
    thumbnailUrl,
    statusNotice:
      'Direct in-app playlist player is ready with zero setup! You can play this playlist or save it to your library immediately.',
  };
}
