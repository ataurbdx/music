import { APPROVED_LYRICS_SOURCES } from './sources.config';
import { fetchLyricsPageHtml } from './fetchPage';
import { normalizeBengali, normalizeLatin } from '../lib/normalize';
import { parseSongMetadata } from '../lib/songMetadata';

export interface CandidateLyricsUrl {
  url: string;
  siteId: string;
  siteName: string;
  pageTitle: string;
  snippet?: string;
  score: number;
}

/**
 * Searches approved sites and live search engine for candidates matching the song title
 */
export async function discoverLyricsCandidates(
  songTitle: string,
  enabledSiteIds: string[] = ['genius', 'azlyrics', 'songlyrics', 'lyrics71', 'bangla-lyrics', 'chordzone', 'smule'],
  titleLatin?: string,
  titleBn?: string,
  language?: 'bn' | 'en',
  artist?: string
): Promise<CandidateLyricsUrl[]> {
  const candidates: CandidateLyricsUrl[] = [];
  const seenUrls = new Set<string>();

  // Parse metadata intelligently separating canonical title, artist, version, and context
  const parsedMeta = parseSongMetadata(songTitle, artist);
  const activeLanguage: 'bn' | 'en' = language || parsedMeta.language;
  const canonicalTitle = parsedMeta.canonicalTitle || songTitle;
  const resolvedArtist = artist || parsedMeta.artist || '';

  const targetBn = titleBn || (normalizeBengali(canonicalTitle) ? canonicalTitle : '');
  const targetLatin = titleLatin || canonicalTitle;

  const normTitleBn = normalizeBengali(targetBn);
  const normTitleLatin = normalizeLatin(targetLatin);
  const normArtist = normalizeLatin(resolvedArtist);

  // Extract core title tokens for matching (min 2 chars) - NOT polluted by version words!
  const bnTokens = normTitleBn.split(/\s+/).filter((t) => t.length >= 2);
  const latinTokens = normTitleLatin.split(/\s+/).filter((t) => t.length >= 2);

  // Helper to score a candidate title and snippet against song query
  const scoreCandidate = (candTitle: string, snippet = ''): number => {
    if (!candTitle || !candTitle.trim()) return 0;
    
    // Ignore generic navigation/boilerplates
    if (/^(home|read more|next|previous|older|newer|comments?|share|contact|about|privacy)/i.test(candTitle.trim())) {
      return 0;
    }

    const normCandBn = normalizeBengali(candTitle);
    const normCandLatin = normalizeLatin(candTitle);
    const normSnipBn = normalizeBengali(snippet);
    const normSnipLatin = normalizeLatin(snippet);

    let score = 0;

    // 1. Canonical Title Matching
    if (normTitleBn && normCandBn) {
      if (normCandBn.includes(normTitleBn)) score = Math.max(score, 90);
      else if (normTitleBn.includes(normCandBn) && normCandBn.length >= normTitleBn.length * 0.7) score = Math.max(score, 85);
    }
    if (normTitleLatin && normCandLatin) {
      if (normCandLatin.includes(normTitleLatin)) score = Math.max(score, 90);
      else if (normTitleLatin.includes(normCandLatin) && normCandLatin.length >= normTitleLatin.length * 0.7) score = Math.max(score, 85);
    }

    // 2. Artist Matching Bonus
    if (normArtist && (normCandLatin.includes(normArtist) || normSnipLatin.includes(normArtist))) {
      score = Math.min(100, score + 15);
    }

    // 3. Version Bonus (if user specified a version, and candidate matches it, give bonus)
    if (parsedMeta.versionDetails) {
      const normVersion = normalizeLatin(parsedMeta.versionDetails);
      const vTokens = normVersion.split(/\s+/).filter((t) => t.length >= 3);
      let vMatches = 0;
      for (const vt of vTokens) {
        if (normCandLatin.includes(vt) || normSnipLatin.includes(vt)) vMatches++;
      }
      if (vMatches >= 1) {
        score = Math.min(100, score + 10);
      }
    }

    // 4. Token match count in title
    let matchedTokens = 0;
    if (bnTokens.length > 0) {
      for (const tok of bnTokens) {
        if (normCandBn.includes(tok)) matchedTokens++;
      }
      const ratio = matchedTokens / bnTokens.length;
      if (ratio >= 0.5 || matchedTokens >= 2) {
        score = Math.max(score, Math.round(ratio * 80));
      }
    }

    let matchedLatinTokens = 0;
    if (latinTokens.length > 0) {
      for (const tok of latinTokens) {
        if (normCandLatin.includes(tok)) matchedLatinTokens++;
      }
      const ratio = matchedLatinTokens / latinTokens.length;
      if (ratio >= 0.5 || matchedLatinTokens >= 2) {
        score = Math.max(score, Math.round(ratio * 80));
      }
    }

    // 5. Snippet bonus
    if (snippet && ((normTitleBn && normSnipBn.includes(normTitleBn)) || (normTitleLatin && normSnipLatin.includes(normTitleLatin)))) {
      score = Math.min(100, score + 10);
    }

    return score;
  };

  // 1. Live Web Search via /api/search-lyrics
  try {
    const params = new URLSearchParams();
    params.set('q', songTitle);
    params.set('canonicalTitle', canonicalTitle);
    if (resolvedArtist) params.set('artist', resolvedArtist);
    if (titleLatin) params.set('titleLatin', titleLatin);
    if (titleBn) params.set('titleBn', titleBn);
    params.set('language', activeLanguage);

    const searchRes = await fetch(`/api/search-lyrics?${params.toString()}`);
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (Array.isArray(data.results)) {
        for (const item of data.results) {
          if (!item.url || seenUrls.has(item.url)) continue;

          const localScore = scoreCandidate(item.title, item.snippet);
          const finalScore = Math.max(localScore, item.score || 0);

          // Discard candidates below relevance threshold
          if (finalScore >= 40) {
            seenUrls.add(item.url);
            candidates.push({
              url: item.url,
              siteId: item.source || 'web',
              siteName: item.source === 'genius.com' ? 'Genius' : item.source === 'azlyrics.com' ? 'AZLyrics' : item.source === 'lyrics71.net' ? 'Lyrics 71' : item.source === 'bangla-lyrics.com' ? 'Bangla-Lyrics' : item.source === 'chordzone.org' ? 'ChordZone' : item.source || 'Web Archive',
              pageTitle: item.title || canonicalTitle,
              snippet: item.snippet || '',
              score: finalScore,
            });
          }
        }
      }
    }
  } catch {
    // Web search optional fallback
  }

  // 2. Direct search on configured active sites if candidates are few
  if (candidates.length < 4) {
    const activeSources = APPROVED_LYRICS_SOURCES.filter((s) => {
      if (!enabledSiteIds.includes(s.id)) return false;
      if (activeLanguage === 'en' && s.language === 'bn') return false;
      if (activeLanguage === 'bn' && s.language === 'en') return false;
      return true;
    });

    for (const source of activeSources) {
      try {
        const queryTerm = resolvedArtist ? `${resolvedArtist} ${canonicalTitle}` : canonicalTitle;
        const searchUrl = source.searchUrlTemplate.replace('{query}', encodeURIComponent(queryTerm));
        const html = await fetchLyricsPageHtml(searchUrl);

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const headingAnchors = Array.from(doc.querySelectorAll('h1 a, h2 a, h3 a, article a.read-more-btn, .mini_card a'));
        const allAnchors = headingAnchors.length > 0 ? headingAnchors : Array.from(doc.querySelectorAll('a[href]'));

        for (const a of allAnchors) {
          const href = a.getAttribute('href') || '';
          const linkText = (a.textContent || '').trim();

          if (!linkText || linkText.length < 2) continue;
          if (/^(read more|older|newer|home|share|next|previous)/i.test(linkText)) continue;
          if (!href.startsWith('http') && !href.startsWith('/')) continue;
          const fullUrl = href.startsWith('http') ? href : `https://${source.domain}${href}`;

          if (!fullUrl.includes(source.domain)) continue;
          if (/(\/category\/|\/tag\/|\/page\/|\/author\/|#|\/feed\/|\/comments\/)/i.test(fullUrl)) continue;
          if (fullUrl === `https://${source.domain}/` || fullUrl === `http://${source.domain}/`) continue;
          if (seenUrls.has(fullUrl)) continue;

          const score = scoreCandidate(linkText);
          if (score >= 40) {
            seenUrls.add(fullUrl);
            candidates.push({
              url: fullUrl,
              siteId: source.id,
              siteName: source.name,
              pageTitle: linkText,
              score,
            });
          }
        }
      } catch {
        // Best effort per site
      }
    }
  }

  // Sort candidates by score descending
  return candidates.sort((a, b) => b.score - a.score).slice(0, 10);
}
