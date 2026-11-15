import { Innertube, UniversalCache } from 'youtubei.js/web';
import { YouTubePlaylistItem } from '../types';
import { buildYouTubeEmbedUrl, buildYouTubeThumbnailUrl } from '../lib/youtube';

class YouTubeDirectService {
  private yt: Innertube | null = null;
  private isInitializing: boolean = false;

  async init(): Promise<Innertube> {
    if (this.yt) return this.yt;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (this.yt) return this.yt;
    }

    this.isInitializing = true;
    try {
      this.yt = await Innertube.create({
        cache: new UniversalCache(false),
        generate_session_locally: true,
      });
      return this.yt;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Extract all videos from a YouTube Playlist directly on device without any VPS
   */
  async getPlaylistVideos(playlistId: string): Promise<{
    title: string;
    author: string;
    items: YouTubePlaylistItem[];
  }> {
    const yt = await this.init();
    const playlist = await yt.getPlaylist(playlistId);

    const title = playlist.info?.title || 'YouTube Playlist';
    const author = playlist.info?.author?.name || 'YouTube Community';

    const items: YouTubePlaylistItem[] = [];
    const videos = playlist.videos || [];

    videos.forEach((v: any, idx: number) => {
      const vidId = v.id;
      if (!vidId) return;

      const vidTitle = v.title?.text || `Track ${idx + 1}`;
      const thumb = v.thumbnails?.[0]?.url || buildYouTubeThumbnailUrl(vidId);
      const channel = v.author?.name || author;

      items.push({
        videoId: vidId,
        title: vidTitle,
        youtubeUrl: `https://www.youtube.com/watch?v=${vidId}`,
        embedUrl: buildYouTubeEmbedUrl(vidId, true),
        thumbnailUrl: thumb,
        channelTitle: channel,
        position: idx,
      });
    });

    return { title, author, items };
  }

  /**
   * Directly download audio stream from YouTube on device without any VPS
   */
  async downloadAudioStream(videoId: string): Promise<{
    blob: Blob;
    format: string;
    sizeBytes: number;
    title: string;
  }> {
    const yt = await this.init();
    const info = await yt.getInfo(videoId);
    const title = info.basic_info.title || 'Tour Track';

    // Download audio stream (M4A/MP4 or WebM/Opus)
    const stream = await yt.download(videoId, {
      type: 'audio',
      quality: 'best',
    });

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const blob = new Blob(chunks, { type: 'audio/mp4' });

    return {
      blob,
      format: 'm4a',
      sizeBytes: blob.size,
      title,
    };
  }
}

export const youtubeDirectService = new YouTubeDirectService();
