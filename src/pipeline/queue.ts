import { songRepository } from '../data/songRepository';
import { SongRecord, VerificationResult } from '../types';
import { discoverLyricsCandidates } from './discover';
import { fetchLyricsPageHtml } from './fetchPage';
import { extractCleanTextFromHtml } from './pageText';
import { geminiService } from '../services/gemini';
import { verifyExtractedLyrics } from './verify';
import { parseSongMetadata } from '../lib/songMetadata';

export interface QueueCandidateDiagnostic {
  attempt: number;
  url: string;
  errorType: 'SEARCH_FAILED' | 'NO_SEARCH_RESULTS' | 'CANDIDATE_REJECTED' | 'WEBSITE_INACCESSIBLE' | 'NO_READABLE_LYRICS' | 'AI_EXTRACTION_FAILED' | 'VERIFICATION_FAILED' | 'SUCCESS';
  message: string;
}

export interface QueueItem {
  songId: string;
  songTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'needs_attention' | 'failed' | 'skipped';
  reason?: string;
  verification?: VerificationResult;
  extractedLyrics?: string;
  sourceUrl?: string;
  diagnosticCode?: 'SEARCH_FAILED' | 'NO_SEARCH_RESULTS' | 'CANDIDATE_REJECTED' | 'WEBSITE_INACCESSIBLE' | 'NO_READABLE_LYRICS' | 'AI_EXTRACTION_FAILED' | 'VERIFICATION_FAILED' | 'SUCCESS';
  diagnostics?: QueueCandidateDiagnostic[];
}

export interface QueueState {
  isRunning: boolean;
  isPaused: boolean;
  currentIndex: number;
  items: QueueItem[];
  completedCount: number;
  failedCount: number;
}

type QueueListener = (state: QueueState) => void;

class LyricsQueueProcessor {
  private state: QueueState = {
    isRunning: false,
    isPaused: false,
    currentIndex: 0,
    items: [],
    completedCount: 0,
    failedCount: 0,
  };

  private listeners: Set<QueueListener> = new Set();
  private abortRequested = false;

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener({ ...this.state, items: [...this.state.items] });
    }
  }

  getState(): QueueState {
    return { ...this.state, items: [...this.state.items] };
  }

  startQueue(songs: SongRecord[]): void {
    if (this.state.isRunning) return;

    this.abortRequested = false;
    this.state = {
      isRunning: true,
      isPaused: false,
      currentIndex: 0,
      items: songs.map((s) => ({
        songId: s.id,
        songTitle: s.titleBn || s.titleLatin,
        status: 'pending',
      })),
      completedCount: 0,
      failedCount: 0,
    };

    this.notify();
    this.processNext();
  }

  pause(): void {
    this.state.isPaused = true;
    this.notify();
  }

  resume(): void {
    if (!this.state.isRunning) return;
    this.state.isPaused = false;
    this.notify();
    this.processNext();
  }

  cancel(): void {
    this.abortRequested = true;
    this.state.isRunning = false;
    this.state.isPaused = false;
    this.notify();
  }

  private async processNext(): Promise<void> {
    if (this.abortRequested || this.state.isPaused || !this.state.isRunning) return;

    if (this.state.currentIndex >= this.state.items.length) {
      this.state.isRunning = false;
      this.notify();
      return;
    }

    const item = this.state.items[this.state.currentIndex];
    item.status = 'processing';
    this.notify();

    try {
      const song = await songRepository.getSongById(item.songId);
      if (!song) {
        item.status = 'failed';
        item.reason = 'Song not found in library';
        this.state.failedCount++;
      } else {
        await this.processSingleSong(song, item);
      }
    } catch (err: any) {
      if (err?.status === 429) {
        // Quota exhausted backoff / pause
        item.status = 'failed';
        item.reason = 'Quota limit reached (429). Queue paused.';
        this.state.failedCount++;
        this.pause();
        return;
      }

      item.status = 'failed';
      item.reason = err?.message || 'Processing error';
      this.state.failedCount++;
    }

    this.state.currentIndex++;
    this.notify();

    // Small delay between requests to be polite to sites
    setTimeout(() => {
      this.processNext();
    }, 1200);
  }

  private async processSingleSong(song: SongRecord, item: QueueItem): Promise<void> {
    const songInput = song.titleBn || song.titleLatin || '';
    const parsed = parseSongMetadata(songInput, song.artist);
    const searchTitle = parsed.canonicalTitle || songInput;
    const songArtist = song.artist || parsed.artist;
    const language: 'bn' | 'en' = (song.language as any) || parsed.language || 'bn';

    // 1. Discover candidates from approved sites and progressive search
    let candidates: any[] = [];
    try {
      candidates = await discoverLyricsCandidates(
        searchTitle,
        undefined,
        song.titleLatin || parsed.canonicalTitle,
        song.titleBn,
        language,
        songArtist
      );
    } catch (err: any) {
      item.status = 'needs_attention';
      item.diagnosticCode = 'SEARCH_FAILED';
      item.reason = `Search query failed: ${err?.message || 'Network error'}`;
      this.state.failedCount++;
      return;
    }

    if (!candidates || candidates.length === 0) {
      item.status = 'needs_attention';
      item.diagnosticCode = 'NO_SEARCH_RESULTS';
      item.reason = 'No candidates found on approved sites or archives. Try Paste and Clean.';
      this.state.failedCount++;
      return;
    }

    // Try up to 8 ranked candidates progressively instead of stopping at candidates[0]
    const maxToTry = Math.min(candidates.length, 8);
    const diagnostics: QueueCandidateDiagnostic[] = [];
    let succeeded = false;

    for (let i = 0; i < maxToTry; i++) {
      const candidate = candidates[i];
      const attempt = i + 1;

      try {
        const html = await fetchLyricsPageHtml(candidate.url);
        if (!html || html.trim().length < 50) {
          diagnostics.push({
            attempt,
            url: candidate.url,
            errorType: 'WEBSITE_INACCESSIBLE',
            message: 'Lyrics page was empty, blocked, or timed out.',
          });
          continue;
        }

        const cleanPageText = extractCleanTextFromHtml(html);
        if (!cleanPageText || cleanPageText.trim().length < 40) {
          diagnostics.push({
            attempt,
            url: candidate.url,
            errorType: 'NO_READABLE_LYRICS',
            message: 'No readable lyrics text found in candidate page markup.',
          });
          continue;
        }

        // 2. Extract with AI (Gemini or OpenAI-compatible)
        const extractRes = await geminiService.extractLyrics(cleanPageText, searchTitle, songArtist, language);
        if (!extractRes.found || !extractRes.lyricsBn || extractRes.lyricsBn.trim().length < 20) {
          diagnostics.push({
            attempt,
            url: candidate.url,
            errorType: 'AI_EXTRACTION_FAILED',
            message: 'Lyrics not identified by AI on candidate page.',
          });
          continue;
        }

        // 3. Verify in code (with explicit 90% threshold and correct language)
        const verification = verifyExtractedLyrics(extractRes.lyricsBn, cleanPageText, 0.90, language);
        if (!verification.passed) {
          diagnostics.push({
            attempt,
            url: candidate.url,
            errorType: 'VERIFICATION_FAILED',
            message: verification.reasons.join('; '),
          });
          continue;
        }

        // Verification passed!
        item.verification = verification;
        item.extractedLyrics = extractRes.lyricsBn;
        item.sourceUrl = candidate.url;
        item.diagnosticCode = 'SUCCESS';
        item.diagnostics = diagnostics;

        // Auto-save as unreviewed if song has missing lyrics
        if (song.lyricsStatus === 'missing') {
          const now = new Date().toISOString();
          await songRepository.updateSong(song.id, {
            lyricsBn: extractRes.lyricsBn,
            lyricsStatus: 'unreviewed',
            lyricsOrigin: 'fetched',
            sources: [
              {
                url: candidate.url,
                siteId: candidate.siteId,
                fetchedAt: now,
                coverage: verification.coverage,
              },
            ],
          });
          item.status = 'completed';
          this.state.completedCount++;
        } else {
          // Do not silently overwrite existing lyrics
          item.status = 'needs_attention';
          item.reason = 'Song already has lyrics; user review required to overwrite.';
        }

        succeeded = true;
        break;
      } catch (candErr: any) {
        diagnostics.push({
          attempt,
          url: candidate.url,
          errorType: 'CANDIDATE_REJECTED',
          message: candErr?.message || 'Candidate extraction encountered an error.',
        });
      }
    }

    if (!succeeded) {
      item.status = 'needs_attention';
      item.diagnostics = diagnostics;
      const last = diagnostics[diagnostics.length - 1];
      item.diagnosticCode = last?.errorType || 'CANDIDATE_REJECTED';
      item.reason = `All ${maxToTry} candidate(s) failed verification: ${last?.message || 'Lyrics could not be verified'}`;
      this.state.failedCount++;
    }
  }
}

export const lyricsQueue = new LyricsQueueProcessor();
