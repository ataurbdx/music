/**
 * Poweramp-Grade Offline Audio Engine & Beat-Sync Visualizer for Tour Lyrics
 * Built on Web Audio API + HTML5 Audio + MediaSession
 */

import { SongRecord, SongAudioMeta } from '../types';
import { songRepository } from '../data/songRepository';

export interface EQBandConfig {
  frequency: number;
  label: string;
  type: BiquadFilterType;
  gain: number; // -12 to +12 dB
}

export type EQPresetKey = 'flat' | 'tour-bus-bass' | 'baul-vocal' | 'acoustic-warmth' | 'custom';

export const EQ_PRESETS: Record<EQPresetKey, { name: string; description: string; bands: number[]; preampDb: number }> = {
  flat: {
    name: 'Flat',
    description: 'Clean reference audio without coloration',
    bands: [0, 0, 0, 0, 0],
    preampDb: 0,
  },
  'tour-bus-bass': {
    name: 'Tour Bus Bass Punch',
    description: 'Deep low-end punch to cut through noisy bus engines',
    bands: [6, 4, 0, 2, 4],
    preampDb: 1,
  },
  'baul-vocal': {
    name: 'Baul & Folk Vocal Clarity',
    description: 'Crisp presence for Dotara, Harmonium, and Bengali folk singing',
    bands: [-2, 1, 5, 4, 2],
    preampDb: 0,
  },
  'acoustic-warmth': {
    name: 'Acoustic Warmth',
    description: 'Rich low-mids and sparkling highs for unplugged guitars',
    bands: [4, 3, -1, 3, 5],
    preampDb: 0,
  },
  custom: {
    name: 'Custom User EQ',
    description: 'Your personalized 5-band sound profile',
    bands: [0, 0, 0, 0, 0],
    preampDb: 0,
  },
};

export type SleepTimerType = 'time' | 'songs';

export interface SleepTimerState {
  isActive: boolean;
  type: SleepTimerType | null;
  targetSeconds: number;
  secondsRemaining: number;
  songsRemaining: number;
  initialLabel: string;
}

export interface AudioEngineState {
  currentSong: SongRecord | null;
  queue: SongRecord[];
  queueIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  loopMode: 'off' | 'all' | 'one';
  isShuffle: boolean;
  eqPreset: EQPresetKey;
  eqBands: number[]; // 5 band values in dB
  preampDb: number;
  beatEnergy: number; // 0.0 to 1.0 (sub-bass / kick RMS)
  spectrumData: number[]; // 32 normalized frequency bands (0.0 to 1.0)
  hasOfflineAudio: boolean;
  sleepTimer: SleepTimerState;
}

type AudioStateListener = (state: AudioEngineState) => void;

class AudioEngine {
  private audio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private preampGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqDataArray: Uint8Array | null = null;
  private sleepTimerInterval: number | null = null;
  private sleepTimerTargetEndTime: number = 0;

  private state: AudioEngineState = {
    currentSong: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0,
    volume: 1.0,
    isMuted: false,
    loopMode: 'all',
    isShuffle: false,
    eqPreset: 'tour-bus-bass',
    eqBands: [...EQ_PRESETS['tour-bus-bass'].bands],
    preampDb: EQ_PRESETS['tour-bus-bass'].preampDb,
    beatEnergy: 0,
    spectrumData: new Array(32).fill(0),
    hasOfflineAudio: false,
    sleepTimer: {
      isActive: false,
      type: null,
      targetSeconds: 0,
      secondsRemaining: 0,
      songsRemaining: 0,
      initialLabel: '',
    },
  };

  private listeners: Set<AudioStateListener> = new Set();
  private rafId: number | null = null;
  private currentObjectUrl: string | null = null;
  private currentBlobUrl: string | null = null;

  // 15-second listen time tracker
  private listenTimeAccumulator: number = 0;
  private listenLoggedSongId: string | null = null;
  private lastTrackTime: number = 0;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    this.loadSavedEQSettings();
    this.setupAudioListeners();
  }

  private loadSavedEQSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedPreset = localStorage.getItem('tl_eq_preset') as EQPresetKey | null;
      const savedBandsJson = localStorage.getItem('tl_eq_bands');
      const savedPreamp = localStorage.getItem('tl_eq_preamp');

      if (savedPreset && (EQ_PRESETS[savedPreset] || savedPreset === 'custom')) {
        this.state.eqPreset = savedPreset;
      }
      if (savedBandsJson) {
        const parsed = JSON.parse(savedBandsJson);
        if (Array.isArray(parsed) && parsed.length === 5) {
          this.state.eqBands = parsed.map((n: any) =>
            typeof n === 'number' ? Math.max(-12, Math.min(12, n)) : 0
          );
        }
      }
      if (savedPreamp !== null) {
        const val = parseFloat(savedPreamp);
        if (!isNaN(val)) {
          this.state.preampDb = Math.max(-6, Math.min(6, val));
        }
      }
    } catch {}
  }

  private saveEQSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('tl_eq_preset', this.state.eqPreset);
      localStorage.setItem('tl_eq_bands', JSON.stringify(this.state.eqBands));
      localStorage.setItem('tl_eq_preamp', String(this.state.preampDb));
    } catch {}
  }

  private setupAudioListeners() {
    this.audio.addEventListener('play', () => {
      this.ensureAudioContext();
      this.state.isPlaying = true;
      this.startVisualizerLoop();
      this.notify();
      this.updateMediaSessionState();
    });

    this.audio.addEventListener('pause', () => {
      this.state.isPlaying = false;
      this.notify();
      this.updateMediaSessionState();
    });

    this.audio.addEventListener('timeupdate', () => {
      const now = this.audio.currentTime;
      const delta = Math.max(0, now - this.lastTrackTime);
      this.lastTrackTime = now;

      if (this.state.isPlaying && delta > 0 && delta < 2) {
        this.listenTimeAccumulator += delta;
        // Check 15-second listen milestone
        if (
          this.state.currentSong &&
          this.listenTimeAccumulator >= 15 &&
          this.listenLoggedSongId !== this.state.currentSong.id
        ) {
          this.listenLoggedSongId = this.state.currentSong.id;
          songRepository.recordPlay(this.state.currentSong.id, this.listenTimeAccumulator);
        }
      }

      this.state.currentTime = now;
      this.state.duration = this.audio.duration || 0;
      this.notify();
    });

    this.audio.addEventListener('durationchange', () => {
      this.state.duration = this.audio.duration || 0;
      this.notify();
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e: Event) => {
      console.warn('Audio element error:', e);
      this.state.isPlaying = false;
      this.notify();
    });

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          this.state.sleepTimer.isActive &&
          this.state.sleepTimer.type === 'time' &&
          this.sleepTimerTargetEndTime > 0 &&
          Date.now() >= this.sleepTimerTargetEndTime
        ) {
          this.triggerSleepTimerExpired();
        }
      });
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioCtx = new AudioCtxClass();

        // Source node
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

        // Preamp Gain Node
        this.preampGainNode = this.audioCtx.createGain();
        this.preampGainNode.gain.value = Math.pow(10, this.state.preampDb / 20);

        // 5-band Graphic Equalizer filters
        // Frequencies: 60Hz (Low Shelf), 230Hz (Peaking), 910Hz (Peaking), 3.6kHz (Peaking), 14kHz (High Shelf)
        const bandDefs: Array<{ freq: number; type: BiquadFilterType; Q: number }> = [
          { freq: 60, type: 'lowshelf', Q: 0.7 },
          { freq: 230, type: 'peaking', Q: 1.0 },
          { freq: 910, type: 'peaking', Q: 1.0 },
          { freq: 3600, type: 'peaking', Q: 1.0 },
          { freq: 14000, type: 'highshelf', Q: 0.7 },
        ];

        this.filters = bandDefs.map((def, idx) => {
          const filter = this.audioCtx!.createBiquadFilter();
          filter.type = def.type;
          filter.frequency.value = def.freq;
          filter.Q.value = def.Q;
          filter.gain.value = this.state.eqBands[idx] || 0;
          return filter;
        });

        // Analyser Node
        this.analyserNode = this.audioCtx.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = 0.8;
        this.freqDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

        // Connect graph: Source -> Preamp -> Filter[0] -> ... -> Filter[4] -> Analyser -> Destination
        let prevNode: AudioNode = this.sourceNode;
        prevNode.connect(this.preampGainNode);
        prevNode = this.preampGainNode;

        for (const filter of this.filters) {
          prevNode.connect(filter);
          prevNode = filter;
        }

        prevNode.connect(this.analyserNode);
        this.analyserNode.connect(this.audioCtx.destination);
      } catch (err) {
        console.warn('Web Audio API initialization failed:', err);
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    return this.audioCtx;
  }

  // --- PLAYBACK CONTROLS ---

  async loadSong(song: SongRecord, queue?: SongRecord[], autoPlay: boolean = true): Promise<void> {
    this.ensureAudioContext();

    if (queue && queue.length > 0) {
      this.state.queue = [...queue];
      const idx = this.state.queue.findIndex((s) => s.id === song.id);
      this.state.queueIndex = idx >= 0 ? idx : 0;
    } else if (this.state.queue.length === 0) {
      this.state.queue = [song];
      this.state.queueIndex = 0;
    } else {
      const idx = this.state.queue.findIndex((s) => s.id === song.id);
      if (idx >= 0) {
        this.state.queueIndex = idx;
      } else {
        this.state.queue.push(song);
        this.state.queueIndex = this.state.queue.length - 1;
      }
    }

    this.state.currentSong = song;
    this.listenTimeAccumulator = 0;
    this.lastTrackTime = 0;
    this.listenLoggedSongId = null;

    // Check offline audio blob in Dexie
    const audioRecord = await songRepository.getAudioBlob(song.id);
    let audioSrc = '';

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    if (audioRecord && audioRecord.blob) {
      this.currentBlobUrl = URL.createObjectURL(audioRecord.blob);
      audioSrc = this.currentBlobUrl;
      this.state.hasOfflineAudio = true;
    } else if (song.audioMeta?.localUri) {
      audioSrc = song.audioMeta.localUri;
      this.state.hasOfflineAudio = true;
    } else if (song.youtubeEmbedUrl || song.youtubeVideoId || song.youtubePlaylistId) {
      // Song or Playlist has YouTube embed! Offline audio is not present, but YouTube playback is supported
      this.state.hasOfflineAudio = false;
      this.audio.pause();
      this.audio.src = '';
      if (autoPlay) {
        this.state.isPlaying = true;
      }
      this.updateMediaSession(song);
      this.notify();
      return;
    } else {
      // Song does NOT have audio attached. Do NOT fabricate fake sounds!
      this.state.hasOfflineAudio = false;
      this.state.isPlaying = false;
      this.audio.pause();
      this.audio.src = '';
      this.notify();
      return;
    }

    this.audio.src = audioSrc;
    this.audio.playbackRate = this.state.playbackRate;

    this.updateMediaSession(song);
    this.notify();

    if (autoPlay) {
      try {
        await this.play();
      } catch (err) {
        console.warn('AutoPlay prevented:', err);
      }
    }
  }

  sendYouTubeCommand(func: string, args: any[] = []): void {
    if (typeof document === 'undefined') return;
    try {
      const iframes = document.querySelectorAll<HTMLIFrameElement>(
        'iframe[src*="youtube.com"], iframe[src*="youtube-nocookie.com"]'
      );
      iframes.forEach((iframe) => {
        try {
          iframe.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func, args }),
            '*'
          );
        } catch {}
      });
    } catch (e) {
      console.warn('Failed to postMessage to YouTube iframe:', e);
    }
  }

  setPlayingState(isPlaying: boolean): void {
    if (this.state.isPlaying !== isPlaying) {
      this.state.isPlaying = isPlaying;
      this.notify();
    }
  }

  async play(): Promise<void> {
    if (!this.state.hasOfflineAudio || !this.audio.src) {
      if (
        this.state.currentSong?.youtubeEmbedUrl ||
        this.state.currentSong?.youtubeVideoId ||
        this.state.currentSong?.youtubePlaylistId
      ) {
        this.state.isPlaying = true;
        this.sendYouTubeCommand('playVideo');
        this.notify();
        return;
      }
      console.warn('Cannot play: song has no audio');
      this.state.isPlaying = false;
      this.notify();
      return;
    }
    this.ensureAudioContext();
    try {
      await this.audio.play();
      this.state.isPlaying = true;
      this.notify();
    } catch (err) {
      console.warn('Play error:', err);
      this.state.isPlaying = false;
      this.notify();
    }
  }

  pause(): void {
    if (this.state.hasOfflineAudio && this.audio.src) {
      this.audio.pause();
    }
    this.sendYouTubeCommand('pauseVideo');
    this.sendYouTubeCommand('stopVideo');
    this.state.isPlaying = false;
    this.notify();
  }

  togglePlay(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  updateCurrentSong(updatedSong: SongRecord): void {
    if (this.state.currentSong && this.state.currentSong.id === updatedSong.id) {
      this.state.currentSong = { ...this.state.currentSong, ...updatedSong };
      const qIdx = this.state.queue.findIndex((s) => s.id === updatedSong.id);
      if (qIdx >= 0) {
        this.state.queue[qIdx] = { ...this.state.queue[qIdx], ...updatedSong };
      }
      this.updateMediaSession(this.state.currentSong);
      this.notify();
    }
  }

  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    this.audio.currentTime = clamped;
    this.state.currentTime = clamped;
    if (!this.state.hasOfflineAudio && (this.state.currentSong?.youtubeEmbedUrl || this.state.currentSong?.youtubeVideoId || this.state.currentSong?.youtubePlaylistId)) {
      this.sendYouTubeCommand('seekTo', [clamped, true]);
    }
    this.notify();
  }

  setPlaybackRate(rate: number): void {
    this.state.playbackRate = rate;
    this.audio.playbackRate = rate;
    this.notify();
  }

  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.state.volume = clamped;
    this.audio.volume = this.state.isMuted ? 0 : clamped;
    this.notify();
  }

  toggleMute(): void {
    this.state.isMuted = !this.state.isMuted;
    this.audio.volume = this.state.isMuted ? 0 : this.state.volume;
    this.notify();
  }

  setLoopMode(mode: 'off' | 'all' | 'one'): void {
    this.state.loopMode = mode;
    this.notify();
  }

  toggleShuffle(): void {
    this.state.isShuffle = !this.state.isShuffle;
    this.notify();
  }

  next(): void {
    if (this.state.queue.length === 0) return;

    if (this.state.isShuffle) {
      const randomIdx = Math.floor(Math.random() * this.state.queue.length);
      this.state.queueIndex = randomIdx;
      this.loadSong(this.state.queue[randomIdx], this.state.queue, true);
      return;
    }

    let nextIdx = this.state.queueIndex + 1;
    if (nextIdx >= this.state.queue.length) {
      if (this.state.loopMode === 'all') {
        nextIdx = 0;
      } else {
        return;
      }
    }

    this.state.queueIndex = nextIdx;
    this.loadSong(this.state.queue[nextIdx], this.state.queue, true);
  }

  previous(): void {
    if (this.state.queue.length === 0) return;

    // If more than 3 seconds in, restart track
    if (this.audio.currentTime > 3) {
      this.seek(0);
      return;
    }

    let prevIdx = this.state.queueIndex - 1;
    if (prevIdx < 0) {
      if (this.state.loopMode === 'all') {
        prevIdx = this.state.queue.length - 1;
      } else {
        prevIdx = 0;
      }
    }

    this.state.queueIndex = prevIdx;
    this.loadSong(this.state.queue[prevIdx], this.state.queue, true);
  }

  handleTrackEnded(): void {
    if (this.state.sleepTimer.isActive && this.state.sleepTimer.type === 'songs') {
      const remaining = this.state.sleepTimer.songsRemaining - 1;
      if (remaining <= 0) {
        this.pause();
        this.cancelSleepTimer();
        return;
      } else {
        this.state.sleepTimer = {
          ...this.state.sleepTimer,
          songsRemaining: remaining,
        };
        this.notify();
      }
    }

    if (this.state.loopMode === 'one') {
      this.seek(0);
      this.play();
    } else {
      this.next();
    }
  }

  // --- SLEEP TIMER ---

  private triggerSleepTimerExpired(): void {
    if (this.sleepTimerInterval) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }
    this.sleepTimerTargetEndTime = 0;
    this.pause();
    this.audio.volume = this.state.isMuted ? 0 : this.state.volume;
    const normalYtVol = Math.round((this.state.isMuted ? 0 : this.state.volume) * 100);
    this.sendYouTubeCommand('setVolume', [normalYtVol]);
    this.state.sleepTimer = {
      isActive: false,
      type: null,
      targetSeconds: 0,
      secondsRemaining: 0,
      songsRemaining: 0,
      initialLabel: '',
    };
    this.notify();
  }

  setSleepTimer(durationMinutes: number, label?: string): void {
    this.cancelSleepTimer();

    const totalSeconds = Math.max(1, Math.round(durationMinutes * 60));
    this.sleepTimerTargetEndTime = Date.now() + totalSeconds * 1000;
    this.state.sleepTimer = {
      isActive: true,
      type: 'time',
      targetSeconds: totalSeconds,
      secondsRemaining: totalSeconds,
      songsRemaining: 0,
      initialLabel: label || (durationMinutes >= 60 ? `${durationMinutes / 60}h` : `${durationMinutes}m`),
    };
    this.notify();

    if (typeof window !== 'undefined') {
      this.sleepTimerInterval = window.setInterval(() => {
        if (!this.state.sleepTimer.isActive || this.state.sleepTimer.type !== 'time') {
          if (this.sleepTimerInterval) clearInterval(this.sleepTimerInterval);
          this.sleepTimerInterval = null;
          this.sleepTimerTargetEndTime = 0;
          return;
        }

        const now = Date.now();
        const nextSec = Math.max(0, Math.ceil((this.sleepTimerTargetEndTime - now) / 1000));

        // Smooth volume fade-out during last 4 seconds
        if (nextSec <= 4 && nextSec > 0) {
          const factor = Math.max(0.1, nextSec / 4);
          this.audio.volume = this.state.isMuted ? 0 : this.state.volume * factor;
          const ytVol = Math.round((this.state.isMuted ? 0 : this.state.volume * factor) * 100);
          this.sendYouTubeCommand('setVolume', [ytVol]);
        }

        if (nextSec <= 0) {
          this.triggerSleepTimerExpired();
        } else {
          this.state.sleepTimer = {
            ...this.state.sleepTimer,
            secondsRemaining: nextSec,
          };
          this.notify();
        }
      }, 1000);
    }
  }

  setSleepTimerSongs(songCount: number, label?: string): void {
    this.cancelSleepTimer();

    this.state.sleepTimer = {
      isActive: true,
      type: 'songs',
      targetSeconds: 0,
      secondsRemaining: 0,
      songsRemaining: songCount,
      initialLabel: label || (songCount === 1 ? 'End of This Song' : `${songCount} songs`),
    };
    this.notify();
  }

  cancelSleepTimer(): void {
    if (this.sleepTimerInterval) {
      clearInterval(this.sleepTimerInterval);
      this.sleepTimerInterval = null;
    }
    this.sleepTimerTargetEndTime = 0;
    this.audio.volume = this.state.isMuted ? 0 : this.state.volume;
    const normalYtVol = Math.round((this.state.isMuted ? 0 : this.state.volume) * 100);
    this.sendYouTubeCommand('setVolume', [normalYtVol]);
    this.state.sleepTimer = {
      isActive: false,
      type: null,
      targetSeconds: 0,
      secondsRemaining: 0,
      songsRemaining: 0,
      initialLabel: '',
    };
    this.notify();
  }

  // --- EQUALIZER & DSP ---

  setEQPreset(presetKey: EQPresetKey): void {
    const config = EQ_PRESETS[presetKey];
    if (!config) return;

    this.state.eqPreset = presetKey;
    this.state.eqBands = [...config.bands];
    this.state.preampDb = config.preampDb;

    this.applyEQFilterValues();
    this.saveEQSettings();
    this.notify();
  }

  setBandGain(bandIndex: number, gainDb: number): void {
    if (bandIndex < 0 || bandIndex >= 5) return;
    const clamped = Math.max(-12, Math.min(12, gainDb));

    this.state.eqBands[bandIndex] = clamped;
    this.state.eqPreset = 'custom';

    if (this.filters[bandIndex]) {
      this.filters[bandIndex].gain.setTargetAtTime(
        clamped,
        this.audioCtx ? this.audioCtx.currentTime : 0,
        0.05
      );
    }

    this.saveEQSettings();
    this.notify();
  }

  setPreamp(gainDb: number): void {
    const clamped = Math.max(-6, Math.min(6, gainDb));
    this.state.preampDb = clamped;
    this.state.eqPreset = 'custom';

    if (this.preampGainNode && this.audioCtx) {
      const linear = Math.pow(10, clamped / 20);
      this.preampGainNode.gain.setTargetAtTime(linear, this.audioCtx.currentTime, 0.05);
    }

    this.saveEQSettings();
    this.notify();
  }

  private applyEQFilterValues(): void {
    if (!this.audioCtx) return;

    const now = this.audioCtx.currentTime;

    this.filters.forEach((filter, idx) => {
      const val = this.state.eqBands[idx] || 0;
      filter.gain.setTargetAtTime(val, now, 0.05);
    });

    if (this.preampGainNode) {
      const linear = Math.pow(10, this.state.preampDb / 20);
      this.preampGainNode.gain.setTargetAtTime(linear, now, 0.05);
    }
  }

  // --- 60FPS BEAT ENERGY & SPECTRUM EXTRACTION ---

  private startVisualizerLoop(): void {
    if (this.rafId) return;

    const update = () => {
      if (this.analyserNode && this.freqDataArray && this.state.isPlaying) {
        this.analyserNode.getByteFrequencyData(this.freqDataArray as any);

        // 1. Sub-bass & kick energy calculation (bins 0 to 12: ~0 Hz to ~1033 Hz)
        let kickSum = 0;
        const kickBinsCount = 12;
        for (let i = 0; i < kickBinsCount; i++) {
          const val = this.freqDataArray[i];
          kickSum += val * val;
        }
        const rms = Math.sqrt(kickSum / kickBinsCount) / 255;
        // Non-linear expansion for punchy visual bounce
        this.state.beatEnergy = Math.min(1.0, Math.pow(rms, 1.4) * 1.3);

        // 2. 32-band visualizer spectrum
        const binStep = Math.floor(this.freqDataArray.length / 32);
        const newSpectrum = new Array(32);
        for (let i = 0; i < 32; i++) {
          let sum = 0;
          const start = i * binStep;
          for (let j = 0; j < binStep; j++) {
            sum += this.freqDataArray[start + j] || 0;
          }
          newSpectrum[i] = (sum / binStep) / 255;
        }
        this.state.spectrumData = newSpectrum;

        this.notifyVisualizerOnly();
      }

      if (this.state.isPlaying) {
        this.rafId = requestAnimationFrame(update);
      } else {
        this.rafId = null;
        this.state.beatEnergy = 0;
        this.state.spectrumData = new Array(32).fill(0);
        this.notify();
      }
    };

    this.rafId = requestAnimationFrame(update);
  }

  // --- BUILT-IN OFFLINE ACOUSTIC DEMO TRACK GENERATOR ---
  /**
   * Generates a 24-second authentic Bengali folk / acoustic rhythmic loop
   * Synthesizes Dotara harmonic pluck chords, Dholak kick drum, and shaker rhythm
   * Returns a standard 44.1kHz 16-bit PCM WAV Blob.
   */
  generateAcousticDemoBlob(): Blob {
    const sampleRate = 44100;
    const duration = 24; // 24 seconds loop
    const numSamples = sampleRate * duration;
    const buffer = new Int16Array(numSamples);

    const bpm = 94; // Typical brisk Baul/folk tempo
    const secondsPerBeat = 60 / bpm;
    const samplesPerBeat = sampleRate * secondsPerBeat;

    // Dotara open string frequencies (Bengali Folk tuning in C: C4, G3, C3, G4)
    const chords = [
      [261.63, 196.0, 130.81, 392.0], // C major
      [220.0, 164.81, 110.0, 329.63], // A minor
      [174.61, 130.81, 87.31, 261.63], // F major
      [196.0, 146.83, 98.0, 293.66],  // G major
    ];

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const beatIndex = Math.floor(t / secondsPerBeat);
      const beatTime = (t % secondsPerBeat);
      const barIndex = Math.floor(beatIndex / 4);
      const beatInBar = beatIndex % 4;

      const chord = chords[barIndex % chords.length];
      let sample = 0;

      // 1. Dholak / Tabla Bass Kick on beats 0 and 2
      if (beatInBar === 0 || beatInBar === 2) {
        const kickEnv = Math.exp(-beatTime * 14);
        const kickFreq = 58 * Math.exp(-beatTime * 18);
        const kickWave = Math.sin(2 * Math.PI * kickFreq * beatTime);
        sample += kickWave * kickEnv * 0.45;
      }

      // 2. Offbeat dotara pluck strums (accent on 1 and 3)
      const pluckEnv = Math.exp(-beatTime * 8);
      for (let s = 0; s < chord.length; s++) {
        const f = chord[s];
        // Harmonic synthesis: fundamental + 2nd + 3rd harmonic for metallic Dotara wire timbre
        const pluck =
          Math.sin(2 * Math.PI * f * t) * 0.6 +
          Math.sin(4 * Math.PI * f * t) * 0.3 +
          Math.sin(6 * Math.PI * f * t) * 0.15;
        sample += pluck * pluckEnv * 0.08;
      }

      // 3. Subtle ambient shaker rhythm
      const shakerPhase = (beatTime * 4) % 1;
      const shakerNoise = (Math.random() * 2 - 1) * Math.exp(-shakerPhase * 25);
      sample += shakerNoise * 0.04;

      // Soft clamp and convert to 16-bit PCM
      const clamped = Math.max(-1, Math.min(1, sample));
      buffer[i] = Math.round(clamped * 32767);
    }

    // Wrap in standard RIFF WAV header
    const wavBytes = this.encodeWAV(buffer, sampleRate, 1);
    return new Blob([wavBytes], { type: 'audio/wav' });
  }

  private encodeWAV(samples: Int16Array, sampleRate: number, numChannels: number): ArrayBuffer {
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat 1 = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // write PCM audio samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      view.setInt16(offset, samples[i], true);
    }

    return buffer;
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // --- MEDIASESSION ---

  private updateMediaSession(song: SongRecord): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.titleBn || song.titleLatin,
        artist: song.titleLatin || 'Tour Lyrics',
        album: 'Tour Lyrics Offline',
        artwork: [
          {
            src: '/favicon.ico',
            sizes: '96x96',
            type: 'image/x-icon',
          },
        ],
      });

      navigator.mediaSession.setActionHandler('play', () => this.play());
      navigator.mediaSession.setActionHandler('pause', () => this.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.seek(details.seekTime);
        }
      });
    } catch {
      // Ignored if mediaSession not supported
    }
  }

  private updateMediaSessionState(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = this.state.isPlaying ? 'playing' : 'paused';
    } catch {
      // Ignore
    }
  }

  // --- STATE SUBSCRIPTION ---

  subscribe(listener: AudioStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  private notifyVisualizerOnly(): void {
    // Only clone shallow state for high-frequency visualizer frame updates
    const s = { ...this.state };
    this.listeners.forEach((l) => l(s));
  }

  getState(): AudioEngineState {
    return {
      ...this.state,
      eqBands: [...this.state.eqBands],
      spectrumData: [...this.state.spectrumData],
      queue: [...this.state.queue],
      sleepTimer: { ...this.state.sleepTimer },
    };
  }
}

export const audioEngine = new AudioEngine();
