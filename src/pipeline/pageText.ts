/**
 * HTML text extractor and cleaner
 * Parses HTML with DOMParser, detects structured JSON-LD lyrics,
 * strips scripts, styles, nav, footers, ads, and extracts clean plain text
 * while maintaining block line breaks. Supports source-aware selectors.
 */
export function extractCleanTextFromHtml(html: string, maxChars = 40000): string {
  if (!html) return '';

  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, maxChars);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // 1. Check for Schema.org JSON-LD structured lyrics data before removing scripts
  try {
    const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (const s of Array.from(jsonLdScripts)) {
      const content = s.textContent || '';
      if (!content.trim()) continue;
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.lyrics && typeof item.lyrics === 'string' && item.lyrics.length > 50) {
          return item.lyrics.trim().slice(0, maxChars);
        }
        if (item.lyrics?.text && typeof item.lyrics.text === 'string' && item.lyrics.text.length > 50) {
          return item.lyrics.text.trim().slice(0, maxChars);
        }
        if (item['@type'] === 'MusicComposition' && item.text && typeof item.text === 'string' && item.text.length > 50) {
          return item.text.trim().slice(0, maxChars);
        }
      }
    }
  } catch {
    // Non-critical: continue to DOM extraction
  }

  // 2. Source-aware lyrics container targeting (Genius, AZLyrics, Lyrics71, ChordZone)
  const sourceContainers = [
    '[data-lyrics-container="true"]',
    '[class^="Lyrics__Container"]',
    'div.lyrics',
    'div.entry-content',
    'div.post-body',
    'div.song-lyrics',
    'div.lyrics-body',
    '#lyrics-body-text',
    '.entry-content',
    '.verse',
  ];

  for (const sel of sourceContainers) {
    try {
      const containerElements = doc.querySelectorAll(sel);
      if (containerElements.length > 0) {
        let containerText = '';
        containerElements.forEach((el) => {
          // Replace <br> with newlines inside lyrics container
          el.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
          containerText += (el.textContent || '') + '\n\n';
        });

        const cleanedContainer = containerText
          .split('\n')
          .map((l) => l.replace(/[ \t\r]+/g, ' ').trim())
          .filter(Boolean)
          .join('\n');

        if (cleanedContainer.length > 80) {
          return cleanedContainer.slice(0, maxChars);
        }
      }
    } catch {}
  }

  // 3. Fallback: Generic DOM cleaning
  const tagsToRemove = [
    'script',
    'style',
    'noscript',
    'nav',
    'header.site-header',
    '#masthead',
    'footer.site-footer',
    '#colophon',
    'aside',
    'form',
    'iframe',
    'svg',
    '.ad',
    '.ads',
    '.sidebar',
    '.advertisement',
    '.comments',
    '#comments',
  ];

  tagsToRemove.forEach((sel) => {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch {}
  });

  // Convert block elements to newlines
  const blockTags = ['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr'];
  blockTags.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => {
      el.insertAdjacentText('afterend', '\n');
    });
  });

  const rawText = doc.body?.textContent || '';
  
  // Clean whitespace: collapse multiple horizontal spaces, keep clean newlines
  const lines = rawText
    .split('\n')
    .map((l) => l.replace(/[ \t\r]+/g, ' ').trim())
    .filter(Boolean);

  const cleanText = lines.join('\n');
  return cleanText.slice(0, maxChars);
}
