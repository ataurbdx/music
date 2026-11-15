/**
 * Waterfall Multi-Tier Audio Extraction Engine
 * -------------------------------------------------------------
 * Architected according to production standard used by NewPipe & Cobalt:
 * Tier 1: On-device direct stream (Residential IP / Innertube iOS Client)
 * Tier 2: Primary VPS Transcoder Bridge (Enhanced iOS & TV client emulation)
 * Tier 3: Decentralized High-Availability Failover Stream Network
 */

import { nativeBridge } from './nativeBridge';
import { songRepository } from '../data/songRepository';

export interface WaterfallAudioResult {
  blob: Blob;
  format: string;
  sourceType: string;
  tierUsed: 'tier1_direct' | 'tier2_vps' | 'tier3_failover';
}

function extractVideoId(url: string): string | null {
  const match = (url || '').match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i
  );
  return match ? match[1] : null;
}

/**
 * Tier 1: Direct On-Device Stream Extraction via Innertube iOS / YT Music client
 */
async function tryTier1DirectDevice(
  videoId: string,
  onProgress?: (msg: string, pct: number) => void
): Promise<WaterfallAudioResult | null> {
  try {
    onProgress?.('Tier 1: Connecting to YouTube direct audio pipeline...', 20);
    const { youtubeDirectService } = await import('./youtubeDownloader');
    const result = await youtubeDirectService.downloadAudioStream(videoId);
    if (result && result.blob && result.blob.size > 8000) {
      return {
        blob: result.blob,
        format: result.format || 'm4a',
        sourceType: 'tier1_direct_device',
        tierUsed: 'tier1_direct',
      };
    }
  } catch (err: any) {
    console.warn('[Waterfall Tier 1 Direct Device Error]:', err?.message || err);
  }
  return null;
}

/**
 * Tier 2: Primary Server / Cloud VPS Transcoder with iOS & TV Emulation
 */
async function tryTier2VpsTranscoder(
  youtubeUrl: string,
  format: string,
  quality: string,
  onProgress?: (msg: string, pct: number) => void
): Promise<WaterfallAudioResult | null> {
  try {
    onProgress?.('Tier 2: Routing through high-fidelity audio transcoder...', 45);
    const settings = await songRepository.getSettings();
    const isLocalPcWeb = typeof window !== 'undefined' && window.location.port === '3000' && !nativeBridge.isNative();

    // Prefer local relative server endpoint on deployed host first, then configured VPS
    const endpointsToTry: string[] = [];

    // 1. Current origin endpoint (works on music.ataurbdx.com or localhost)
    endpointsToTry.push(`/api/audio/download?url=${encodeURIComponent(youtubeUrl)}&format=${format}&quality=${quality}`);

    // 2. Custom configured server or secondary bridge if specified in Settings
    if (settings.ytdlpServerUrl?.trim()) {
      const cleanServer = settings.ytdlpServerUrl.trim().replace(/\/$/, '');
      endpointsToTry.push(`${cleanServer}/download?url=${encodeURIComponent(youtubeUrl)}&format=${format}&quality=${quality}`);
    }

    // 3. Fallback VPS bridge
    endpointsToTry.push(`https://yt-dlp-server-rr8t.onrender.com/download?url=${encodeURIComponent(youtubeUrl)}&format=${format}&quality=${quality}`);

    for (const endpoint of endpointsToTry) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(endpoint, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const blob = await res.blob();
          if (blob && blob.size > 8000) {
            return {
              blob,
              format,
              sourceType: 'tier2_vps_transcoder',
              tierUsed: 'tier2_vps',
            };
          }
        } else {
          const errText = await res.text().catch(() => '');
          // If blocked by YouTube bot check, immediately fall through to Tier 3
          if (errText.includes('bot') || errText.includes('Sign in') || errText.includes('cookies')) {
            console.warn('[Waterfall Tier 2 Bot Challenge Detected]: Falling over to Tier 3.');
            break;
          }
        }
      } catch (endpointErr: any) {
        console.warn(`[Waterfall Tier 2 Endpoint Failed (${endpoint})]:`, endpointErr?.message);
      }
    }
  } catch (err: any) {
    console.warn('[Waterfall Tier 2 VPS Error]:', err?.message || err);
  }
  return null;
}

/**
 * Tier 3: Decentralized High-Availability Failover Engines (Cobalt & Public Decipher Nodes)
 */
async function tryTier3Failover(
  videoId: string,
  youtubeUrl: string,
  onProgress?: (msg: string, pct: number) => void
): Promise<WaterfallAudioResult | null> {
  onProgress?.('Tier 3: Engaging decentralized failover audio stream...', 65);

  // Strategy 0: Dedicated Cloudflare Edge Stream Worker
  const edgeNodes = [
    `https://audio.ataurbdx.com/?id=${videoId}`,
    `https://yt-audio.ataurrahman-wub.workers.dev/?id=${videoId}`,
  ];
  for (const edgeUrl of edgeNodes) {
    try {
      const edgeController = new AbortController();
      const edgeTimeout = setTimeout(() => edgeController.abort(), 15000);
      const edgeRes = await fetch(edgeUrl, { signal: edgeController.signal });
      clearTimeout(edgeTimeout);
      if (edgeRes.ok) {
        const blob = await edgeRes.blob();
        if (blob && blob.size > 8000) {
          return {
            blob,
            format: 'm4a',
            sourceType: 'tier3_cloudflare_edge',
            tierUsed: 'tier3_failover',
          };
        }
      }
    } catch (e: any) {
      console.warn(`[Waterfall Cloudflare Edge (${edgeUrl}) failed]:`, e?.message);
    }
  }

  // Strategy A: Cobalt Open Converter API Nodes
  const cobaltNodes = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekm.tokyo',
    'https://co.wuk.sh/api/json',
  ];

  for (const node of cobaltNodes) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18000);

      const resp = await fetch(node.endsWith('/json') ? node : `${node}/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (resp.ok) {
        const json = await resp.json().catch(() => null);
        const streamUrl = json?.url || json?.stream;
        if (streamUrl) {
          onProgress?.('Tier 3: Streaming audio from failover node...', 85);
          const audioResp = await fetch(streamUrl);
          if (audioResp.ok) {
            const blob = await audioResp.blob();
            if (blob && blob.size > 8000) {
              return {
                blob,
                format: 'mp3',
                sourceType: 'tier3_cobalt_failover',
                tierUsed: 'tier3_failover',
              };
            }
          }
        }
      }
    } catch (e: any) {
      console.warn(`[Waterfall Tier 3 Cobalt node (${node}) failed]:`, e?.message);
    }
  }

  // Strategy B: Piped / Invidious Stream Resolver Nodes
  const pipedNodes = [
    `https://pipedapi.kavin.rocks/streams/${videoId}`,
    `https://api.piped.privacydev.net/streams/${videoId}`,
    `https://piped-api.lunar.icu/streams/${videoId}`,
  ];

  for (const pNode of pipedNodes) {
    try {
      const pController = new AbortController();
      const pTimeout = setTimeout(() => pController.abort(), 15000);
      const pResp = await fetch(pNode, { signal: pController.signal });
      pTimeout && clearTimeout(pTimeout);

      if (pResp.ok) {
        const pData = await pResp.json().catch(() => null);
        const streams = pData?.audioStreams || [];
        if (streams.length > 0) {
          // Sort for best bitrate
          streams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
          const bestUrl = streams[0]?.url;
          if (bestUrl) {
            onProgress?.('Tier 3: Downloading verified audio stream...', 88);
            const streamRes = await fetch(bestUrl);
            if (streamRes.ok) {
              const blob = await streamRes.blob();
              if (blob && blob.size > 8000) {
                return {
                  blob,
                  format: streams[0]?.format?.toLowerCase() || 'm4a',
                  sourceType: 'tier3_piped_stream',
                  tierUsed: 'tier3_failover',
                };
              }
            }
          }
        }
      }
    } catch (pe: any) {
      console.warn(`[Waterfall Tier 3 Piped node (${pNode}) failed]:`, pe?.message);
    }
  }

  return null;
}

/**
 * Main Waterfall Entry Point: Cascades through Tier 1 -> Tier 2 -> Tier 3
 */
export async function downloadWaterfallAudio(
  youtubeUrl: string,
  format = 'mp3',
  quality = '320k',
  onProgress?: (msg: string, pct: number) => void
): Promise<WaterfallAudioResult> {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube video link. Could not parse video ID.');
  }

  // Step 1: Tier 1 - Direct On-Device Stream
  const tier1Res = await tryTier1DirectDevice(videoId, onProgress);
  if (tier1Res) {
    return tier1Res;
  }

  // Step 2: Tier 2 - VPS Transcoder Bridge
  const tier2Res = await tryTier2VpsTranscoder(youtubeUrl, format, quality, onProgress);
  if (tier2Res) {
    return tier2Res;
  }

  // Step 3: Tier 3 - Decentralized Failover Stream
  const tier3Res = await tryTier3Failover(videoId, youtubeUrl, onProgress);
  if (tier3Res) {
    return tier3Res;
  }

  throw new Error('All 3 Waterfall download tiers failed. YouTube is temporarily limiting audio extraction for this track.');
}
