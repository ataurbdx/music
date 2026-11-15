/**
 * Fetches page HTML with Capacitor native HTTP or server preview proxy
 */
export async function fetchLyricsPageHtml(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) {
    throw new Error('Valid HTTP/HTTPS URL is required.');
  }

  // Check Capacitor native platform
  const isNative = typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.();

  if (isNative && (window as any).Capacitor?.Plugins?.CapacitorHttp) {
    const response = await (window as any).Capacitor.Plugins.CapacitorHttp.get({
      url,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      readTimeout: 10000,
      connectTimeout: 10000,
    });
    if (response.status === 403 || response.status === 429) {
      throw new Error(`HTTP_${response.status}_BLOCKED`);
    }
    return response.data;
  }

  // In Web / PWA preview mode, use the server proxy to bypass CORS
  const proxyUrl = `/api/proxy-fetch?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const errCode = errorBody?.error || `HTTP_${res.status}`;
    throw new Error(`Failed to fetch page: ${errCode}`);
  }
  return res.text();
}
