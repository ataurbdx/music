import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAudio } from '../context/AudioContext';
import { audioEngine } from '../services/audioEngine';
import { SongRecord, CategoryRecord } from '../types';
import { EqualizerDrawer } from './EqualizerDrawer';
import { SleepTimerDrawer } from './SleepTimerDrawer';
import { hasValidLyrics } from './SongList';
import { motion } from 'motion/react';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Sliders,
  Sparkles,
  Edit3,
  Copy,
  Check,
  Zap,
  Music2,
  FileText,
  Volume2,
  Volume1,
  VolumeX,
  Gauge,
  ArrowDownCircle,
  Timer,
  ChevronRight,
  Disc,
  Radio,
  Activity,
  Youtube,
  ExternalLink,
  Download,
} from 'lucide-react';

interface FullPlayerModalProps {
  categories: CategoryRecord[];
  allSongs: SongRecord[];
  onOpenEdit?: (song: SongRecord) => void;
  onOpenPrepare?: (song: SongRecord) => void;
  onOpenAudioHub?: (song: SongRecord) => void;
}

export const FullPlayerModal: React.FC<FullPlayerModalProps> = ({
  categories,
  allSongs,
  onOpenEdit,
  onOpenPrepare,
  onOpenAudioHub,
}) => {
  const {
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    fullPlayerTab,
    setFullPlayerTab,
    currentSong,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    loopMode,
    isShuffle,
    beatEnergy,
    spectrumData,
    eqPreset,
    hasOfflineAudio,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    queue,
    queueIndex,
    sleepTimer,
    togglePlay,
    seek,
    next,
    previous,
    setPlaybackRate,
    setLoopMode,
    toggleShuffle,
    updateCurrentSong,
    handleTrackEnded,
  } = useAudio();

  const [isEQOpen, setIsEQOpen] = useState<boolean>(false);
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(22);
  const [isAutoScroll, setIsAutoScroll] = useState<boolean>(false);
  const [scrollSpeed, setScrollSpeed] = useState<number>(1);
  const [copied, setCopied] = useState<boolean>(false);
  const lyricsScrollRef = useRef<HTMLDivElement>(null);

  // Media playback source: offline audio vs YouTube stream
  const [mediaSource, setMediaSource] = useState<'audio' | 'youtube'>('audio');
  const [isYouTubeLoading, setIsYouTubeLoading] = useState<boolean>(true);
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytPlayerInstanceRef = useRef<any>(null);

  // Initialize official YouTube IFrame Player API instance
  const initYTPlayer = (iframeEl: HTMLIFrameElement) => {
    if (typeof window === 'undefined') return;
    const win = window as any;

    const setup = () => {
      if (!win.YT || !win.YT.Player) return;
      try {
        if (ytPlayerInstanceRef.current && typeof ytPlayerInstanceRef.current.destroy === 'function') {
          try {
            ytPlayerInstanceRef.current.destroy();
          } catch {}
          ytPlayerInstanceRef.current = null;
        }

        ytPlayerInstanceRef.current = new win.YT.Player(iframeEl, {
          events: {
            onStateChange: (event: any) => {
              // 0 = YT.PlayerState.ENDED, 1 = PLAYING, 2 = PAUSED
              if (event.data === 0) {
                if (ytPlayerInstanceRef.current) {
                  try {
                    ytPlayerInstanceRef.current.pauseVideo();
                    ytPlayerInstanceRef.current.stopVideo();
                  } catch {}
                }
                handleTrackEnded();
              } else if (event.data === 1) {
                audioEngine.setPlayingState(true);
              } else if (event.data === 2) {
                audioEngine.setPlayingState(false);
              }
            },
          },
        });
      } catch (err) {
        console.warn('YT.Player initialization note:', err);
      }
    };

    if (win.YT && win.YT.Player) {
      setup();
    } else {
      const prevOnReady = win.onYouTubeIframeAPIReady;
      win.onYouTubeIframeAPIReady = () => {
        if (prevOnReady) prevOnReady();
        setup();
      };
    }
  };

  // YouTube postMessage fallback listener
  useEffect(() => {
    if (!isFullPlayerOpen || mediaSource !== 'youtube') return;

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (!origin.includes('youtube.com') && !origin.includes('youtube-nocookie.com')) {
        return;
      }

      try {
        let data = event.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            return;
          }
        }

        const playerState =
          data?.event === 'onStateChange'
            ? data?.info
            : data?.event === 'infoDelivery'
            ? data?.info?.playerState
            : undefined;

        if (playerState === 0) {
          handleTrackEnded();
        } else if (playerState === 1) {
          audioEngine.setPlayingState(true);
        } else if (playerState === 2) {
          audioEngine.setPlayingState(false);
        }
      } catch {}
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isFullPlayerOpen, mediaSource, handleTrackEnded]);

  // Dual-Safety Polling Loop: guarantees "End of this song" timer triggers even if YouTube autoplay attempts next
  useEffect(() => {
    if (!isFullPlayerOpen || mediaSource !== 'youtube') return;

    let hasHandledEnd = false;

    const safetyTimer = setInterval(() => {
      const player = ytPlayerInstanceRef.current;
      if (!player) return;

      try {
        if (typeof player.getPlayerState === 'function') {
          const state = player.getPlayerState();
          if (state === 0 && !hasHandledEnd) {
            hasHandledEnd = true;
            try {
              player.pauseVideo();
              player.stopVideo();
            } catch {}
            handleTrackEnded();
            return;
          }
          if (state === 1) {
            hasHandledEnd = false;
          }
        }

        if (
          typeof player.getCurrentTime === 'function' &&
          typeof player.getDuration === 'function'
        ) {
          const curr = player.getCurrentTime();
          const dur = player.getDuration();
          if (dur > 5 && curr >= dur - 0.5 && !hasHandledEnd) {
            hasHandledEnd = true;
            try {
              player.pauseVideo();
              player.stopVideo();
            } catch {}
            handleTrackEnded();
          }
        }
      } catch {}
    }, 400);

    return () => {
      clearInterval(safetyTimer);
    };
  }, [isFullPlayerOpen, mediaSource, handleTrackEnded]);

  const handleIframeLoad = (e?: React.SyntheticEvent<HTMLIFrameElement>) => {
    setIsYouTubeLoading(false);
    const targetIframe = (e?.currentTarget as HTMLIFrameElement) || ytIframeRef.current;
    if (targetIframe) {
      initYTPlayer(targetIframe);
      if (targetIframe.contentWindow) {
        try {
          targetIframe.contentWindow.postMessage(
            JSON.stringify({ event: 'listening' }),
            '*'
          );
        } catch {}
      }
    }
  };

  // Visualizer style state with localStorage persistence
  const [visualizerStyle, setVisualizerStyle] = useState<'wave' | 'vinyl' | 'orb'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tl_vis_style');
        if (saved && ['wave', 'vinyl', 'orb'].includes(saved)) {
          return saved as 'wave' | 'vinyl' | 'orb';
        }
      } catch {}
    }
    return 'wave';
  });

  const handleSetVisualizerStyle = (style: 'wave' | 'vinyl' | 'orb') => {
    setVisualizerStyle(style);
    try {
      localStorage.setItem('tl_vis_style', style);
    } catch {}
  };

  // Peak hold array for Poweramp style FFT meter
  const [peakHoldData, setPeakHoldData] = useState<number[]>(new Array(32).fill(0));

  useEffect(() => {
    if (!isPlaying) return;
    setPeakHoldData((prev) =>
      spectrumData.map((val, idx) => {
        const currentPeak = prev[idx] || 0;
        if (val >= currentPeak) return val;
        return Math.max(0, currentPeak - 0.02);
      })
    );
  }, [spectrumData, isPlaying]);

  // Keep liveSong in sync with current state
  const liveSong = useMemo(() => {
    if (!currentSong) return null;
    const match = allSongs.find((s) => s.id === currentSong.id);
    return match || currentSong;
  }, [allSongs, currentSong]);

  useEffect(() => {
    if (liveSong && currentSong) {
      if (
        liveSong.lyricsBn !== currentSong.lyricsBn ||
        liveSong.hasAudio !== currentSong.hasAudio ||
        liveSong.lyricsStatus !== currentSong.lyricsStatus
      ) {
        updateCurrentSong(liveSong);
      }
    }
  }, [liveSong, currentSong, updateCurrentSong]);

  // Media source auto-sync effect
  useEffect(() => {
    if (liveSong) {
      if (
        !hasOfflineAudio &&
        (liveSong.youtubeEmbedUrl || liveSong.youtubeVideoId || liveSong.youtubePlaylistId)
      ) {
        setMediaSource('youtube');
      } else {
        setMediaSource('audio');
      }
      setIsYouTubeLoading(true);
    }
  }, [liveSong?.id, hasOfflineAudio, liveSong?.youtubeVideoId, liveSong?.youtubePlaylistId]);

  // Determine Up Next song in active queue
  const upNextSong = useMemo(() => {
    if (queue.length === 0 || queueIndex < 0) return null;
    if (queueIndex < queue.length - 1) {
      return queue[queueIndex + 1];
    }
    if (loopMode === 'all' && queue.length > 1) {
      return queue[0];
    }
    return null;
  }, [queue, queueIndex, loopMode]);

  // Auto-scroll logic for lyrics reader mode
  useEffect(() => {
    let animId: number;
    if (isAutoScroll && isPlaying && fullPlayerTab === 'lyrics' && lyricsScrollRef.current) {
      const scrollStep = () => {
        if (lyricsScrollRef.current) {
          lyricsScrollRef.current.scrollTop += 0.5 * scrollSpeed;
        }
        animId = requestAnimationFrame(scrollStep);
      };
      animId = requestAnimationFrame(scrollStep);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isAutoScroll, isPlaying, fullPlayerTab, scrollSpeed]);

  if (!isFullPlayerOpen || !liveSong) return null;

  const categoryName = categories.find((c) => c.id === liveSong.categoryId)?.name || 'General';

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleCopyLyrics = async () => {
    if (!liveSong.lyricsBn) return;
    try {
      await navigator.clipboard.writeText(liveSong.lyricsBn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isValidLyrics = hasValidLyrics(liveSong.lyricsBn);
  const stanzas = isValidLyrics && liveSong.lyricsBn
    ? liveSong.lyricsBn
        .split(/\n\s*\n/)
        .map((st) => st.trim())
        .filter(Boolean)
    : [];

  const isYouTubePlaying =
    mediaSource === 'youtube' &&
    Boolean(liveSong.youtubeEmbedUrl || liveSong.youtubeVideoId || liveSong.youtubePlaylistId);

  const speedOptions = [0.75, 0.9, 1.0, 1.1, 1.25, 1.5];
  const nextSpeed = () => {
    const curIdx = speedOptions.indexOf(playbackRate);
    const nextIdx = (curIdx + 1) % speedOptions.length;
    setPlaybackRate(speedOptions[nextIdx]);
  };

  const cycleLoopMode = () => {
    if (loopMode === 'off') setLoopMode('all');
    else if (loopMode === 'all') setLoopMode('one');
    else setLoopMode('off');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl select-none">
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 260 }}
        className="w-full max-w-[430px] h-full sm:h-[92dvh] sm:max-h-[890px] bg-[#080C16] light:bg-[#FFFFFF] bg-ambient-cosmic sm:rounded-[44px] sm:border sm:border-white/10 light:sm:border-black/10 flex flex-col text-[#F1F5F9] light:text-[#0F172A] overflow-hidden relative shadow-[0_25px_70px_rgba(0,0,0,0.9)]"
      >
        {/* Top Floating App Bar */}
        <header
          className="px-5 pb-2.5 flex items-center justify-between shrink-0 z-20"
          style={{
            paddingTop: 'calc(12px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
          }}
        >
          <button
            onClick={() => setIsFullPlayerOpen(false)}
            className="w-10 h-10 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all shadow-md"
            aria-label="Minimize Player"
          >
            <ChevronDown className="w-5 h-5" />
          </button>

          {/* Segmented Mode Switcher Pill */}
          <div className="flex items-center bg-white/[0.05] light:bg-black/[0.04] border border-white/10 light:border-black/10 rounded-full p-1 shadow-inner">
            <button
              onClick={() => setFullPlayerTab('visualizer')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                fullPlayerTab === 'visualizer'
                  ? 'btn-primary-gradient text-white shadow-md'
                  : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>Beat</span>
            </button>

            <button
              onClick={() => setFullPlayerTab('lyrics')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                fullPlayerTab === 'lyrics'
                  ? 'btn-primary-gradient text-white shadow-md'
                  : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Lyrics</span>
            </button>

            <button
              onClick={() => setFullPlayerTab('split')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                fullPlayerTab === 'split'
                  ? 'btn-primary-gradient text-white shadow-md'
                  : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Split</span>
            </button>
          </div>

          {/* Top Right Action Cluster: Sleep Timer & Equalizer */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsSleepTimerOpen(true)}
              className={`h-10 px-2.5 rounded-full border flex items-center gap-1.5 active:scale-90 transition-all shadow-md ${
                sleepTimer.isActive
                  ? 'btn-primary-gradient text-white font-bold'
                  : 'bg-white/[0.06] light:bg-black/[0.04] border-white/10 light:border-black/10 text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black'
              }`}
              title="Sleep Timer"
            >
              <Timer className="w-4 h-4" />
              {sleepTimer.isActive && (
                <span className="text-[10px] font-mono font-bold tracking-tight">
                  {sleepTimer.type === 'time'
                    ? sleepTimer.secondsRemaining < 60
                      ? `${sleepTimer.secondsRemaining}s`
                      : `${Math.ceil(sleepTimer.secondsRemaining / 60)}m`
                    : `${sleepTimer.songsRemaining}s`}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsEQOpen(true)}
              className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-90 transition-all shadow-md ${
                isEQOpen
                  ? 'btn-primary-gradient text-white'
                  : 'bg-white/[0.06] light:bg-black/[0.04] border-white/10 light:border-black/10 text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black'
              }`}
              title="Graphic Equalizer"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ========================================================
            TAB 1: BEAT VISUALIZER MODE
           ======================================================== */}
        {fullPlayerTab === 'visualizer' && (
          <div
            className={`flex-1 flex flex-col px-6 pt-1 pb-6 ${
              isYouTubePlaying
                ? 'overflow-y-auto scrollbar-none select-text'
                : 'justify-between overflow-hidden'
            }`}
          >
            {/* Song Meta Header */}
            <div className="text-center pt-1 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#C4B5FD] light:text-[#7C3AED] bg-[#8B5CF6]/15 light:bg-[#7C3AED]/10 px-2.5 py-0.5 rounded-full border border-[#8B5CF6]/25 inline-block mb-1.5">
                {categoryName}
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white light:text-slate-900 font-bengali truncate leading-tight">
                {liveSong.titleBn || liveSong.titleLatin}
              </h2>
              <p className="text-xs font-medium text-[#94A3B8] light:text-slate-500 truncate mt-0.5">
                {liveSong.titleLatin}
              </p>

              {/* Audio Format & EQ Profile Pill */}
              <div className="flex items-center justify-center gap-2 mt-1.5">
                <span className="text-[9px] font-semibold text-white/70 light:text-slate-600 bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 px-2.5 py-0.5 rounded-full">
                  {hasOfflineAudio || liveSong.hasAudio
                    ? `${liveSong.audioMeta?.format?.toUpperCase() || 'MP3'} • ${liveSong.audioMeta?.bitrate || '320kbps'}`
                    : liveSong.youtubePlaylistId
                    ? 'YouTube Embedded Playlist • Continuous'
                    : liveSong.youtubeVideoId
                    ? 'YouTube Live Stream • Stereo'
                    : 'No Audio Attached'}
                </span>
                <span className="text-[9px] font-semibold text-[#C4B5FD] light:text-[#7C3AED] bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 px-2 py-0.5 rounded-full">
                  EQ: {eqPreset.replace('-', ' ')}
                </span>
              </div>

              {/* Media Stream Switcher (Offline Audio vs YouTube Stream) */}
              {(hasOfflineAudio || liveSong.hasAudio) && (liveSong.youtubeEmbedUrl || liveSong.youtubeVideoId || liveSong.youtubePlaylistId) && (
                <div className="flex items-center justify-center gap-1.5 mt-2 z-10">
                  <button
                    onClick={() => setMediaSource('audio')}
                    className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                      mediaSource === 'audio'
                        ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-300 light:text-cyan-700 shadow-[0_0_12px_rgba(6,182,212,0.35)]'
                        : 'bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-white/60 light:text-slate-500 hover:text-white'
                    }`}
                  >
                    <Music2 className="w-3 h-3" />
                    <span>Offline Audio</span>
                  </button>
                  <button
                    onClick={() => setMediaSource('youtube')}
                    className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                      mediaSource === 'youtube'
                        ? 'bg-rose-500/20 border border-rose-500 text-rose-300 light:text-rose-700 shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                        : 'bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-white/60 light:text-slate-500 hover:text-white'
                    }`}
                  >
                    <Youtube className="w-3 h-3 text-rose-400" />
                    <span>{liveSong.youtubePlaylistId ? 'YouTube Playlist' : 'YouTube Stream'}</span>
                  </button>
                </div>
              )}

              {/* Up Next Song Bar */}
              <div className="flex items-center justify-between px-3 py-1 rounded-full bg-white/[0.05] light:bg-black/[0.04] border border-white/[0.08] light:border-black/[0.08] backdrop-blur-md max-w-[340px] mx-auto mt-2 text-left shadow-inner">
                <div className="flex items-center gap-1.5 min-w-0 pr-1">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#C4B5FD] light:text-[#7C3AED] bg-[#8B5CF6]/20 px-1.5 py-0.5 rounded shrink-0">
                    Up Next
                  </span>
                  {upNextSong ? (
                    <span className="text-[11px] font-semibold text-white/95 light:text-slate-800 truncate font-bengali">
                      {upNextSong.titleBn || upNextSong.titleLatin}
                      {upNextSong.titleLatin && upNextSong.titleLatin !== upNextSong.titleBn && (
                        <span className="text-[10px] text-[#94A3B8] light:text-slate-500 font-normal ml-1">
                          ({upNextSong.titleLatin})
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#64748B] light:text-slate-400 italic truncate">
                      End of queue • No more songs up next
                    </span>
                  )}
                </div>
                {upNextSong && (
                  <button
                    onClick={next}
                    className="text-[10px] font-bold text-[#8B5CF6] hover:text-[#A78BFA] flex items-center gap-0.5 shrink-0 pl-1 active:scale-95 transition-all"
                    title="Skip to next song"
                  >
                    <span>Skip</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Central Visualizer OR YouTube Player + Lyrics */}
            {isYouTubePlaying ? (
              /* YOUTUBE PLAYER & INTEGRATED BENGALI LYRICS (Natural Page Scroll, Not Sticky) */
              <div className="flex flex-col my-1 shrink-0">
                {/* YouTube Video Player (Scrolls naturally with page) */}
                <div className="w-full pt-1 pb-1">
                  <div className="w-full max-w-[420px] aspect-video rounded-2xl overflow-hidden border border-white/15 light:border-black/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)] relative bg-black mx-auto">
                    {isYouTubeLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
                        {liveSong.thumbnailUrl && (
                          <img
                            src={liveSong.thumbnailUrl}
                            alt="YouTube Thumbnail"
                            className="absolute inset-0 w-full h-full object-cover opacity-25 blur-sm"
                          />
                        )}
                        <div className="w-8 h-8 rounded-full border-2 border-rose-500 border-t-transparent animate-spin z-10" />
                        <span className="text-xs font-medium text-white/90 mt-2 z-10">
                          {liveSong.youtubePlaylistId ? 'Loading Playlist Player...' : 'Loading Stream...'}
                        </span>
                      </div>
                    )}
                    <iframe
                      ref={ytIframeRef}
                      id="youtube-player-frame"
                      src={
                        liveSong.youtubePlaylistId
                          ? `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(liveSong.youtubePlaylistId)}&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&playsinline=1`
                          : liveSong.youtubeEmbedUrl || `https://www.youtube.com/embed/${liveSong.youtubeVideoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&playsinline=1`
                      }
                      title={liveSong.titleLatin}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      onLoad={handleIframeLoad}
                      className="w-full h-full relative z-0"
                    />
                  </div>

                  {/* Quick Action Toolbar under Video Player */}
                  <div className="flex items-center justify-between px-1 mt-2 gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <a
                        href={
                          liveSong.youtubePlaylistId
                            ? `https://www.youtube.com/playlist?list=${encodeURIComponent(liveSong.youtubePlaylistId)}`
                            : liveSong.youtubeUrl || `https://www.youtube.com/watch?v=${liveSong.youtubeVideoId}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-rose-400 light:text-rose-600 hover:text-rose-300 flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 active:scale-95 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{liveSong.youtubePlaylistId ? 'Open on YouTube' : 'YouTube App'}</span>
                      </a>

                      {/* Continuous Auto-Next Skip Button */}
                      <button
                        onClick={next}
                        className="text-[11px] font-bold text-white px-3 py-1 rounded-full btn-primary-gradient active:scale-95 transition-all flex items-center gap-1 shadow-sm"
                        title={upNextSong ? `Skip to: ${upNextSong.titleBn || upNextSong.titleLatin}` : 'Next song in playlist'}
                      >
                        <span>Next</span>
                        <SkipForward className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {(hasOfflineAudio || liveSong.hasAudio) ? (
                        <button
                          onClick={() => setMediaSource('audio')}
                          className="text-[11px] font-semibold text-cyan-400 light:text-cyan-600 hover:text-cyan-300 flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 active:scale-95 transition-all"
                        >
                          <Music2 className="w-3.5 h-3.5" />
                          <span>Offline Audio</span>
                        </button>
                      ) : onOpenAudioHub ? (
                        <button
                          onClick={() => {
                            setIsFullPlayerOpen(false);
                            onOpenAudioHub(liveSong);
                          }}
                          className="text-[11px] font-semibold text-violet-300 light:text-violet-700 hover:text-white px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/35 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
                          title="Download Audio Offline"
                        >
                          <Download className="w-3.5 h-3.5 text-violet-400" />
                          <span>Download Audio</span>
                        </button>
                      ) : null}

                      {stanzas.length > 0 ? (
                        <button
                          onClick={handleCopyLyrics}
                          className="text-[11px] font-semibold text-[#94A3B8] light:text-slate-600 hover:text-white px-3 py-1 rounded-full bg-white/5 light:bg-black/5 border border-white/10 active:scale-95 transition-all flex items-center gap-1"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      ) : onOpenPrepare ? (
                        <button
                          onClick={() => {
                            setIsFullPlayerOpen(false);
                            onOpenPrepare(liveSong);
                          }}
                          className="text-[11px] font-semibold text-[#C4B5FD] px-3 py-1 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/35 active:scale-95 transition-all flex items-center gap-1"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                          <span>AI Fetch</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Scrollable Bengali Lyrics Reader (Clean Text without Cards) */}
                <div className="pt-3 pb-8 px-1 font-bengali text-white/95 light:text-slate-900">
                  {stanzas.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 px-1 text-[11px] text-[#94A3B8] font-sans border-b border-white/[0.06] light:border-black/[0.06] mb-3">
                        <span className="font-semibold text-[#C4B5FD] flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          Lyrics
                        </span>
                        <button
                          onClick={() => setFullPlayerTab('lyrics')}
                          className="text-[#8B5CF6] hover:underline text-[10px] font-semibold"
                        >
                          Fullscreen Reader &gt;
                        </button>
                      </div>
                      {stanzas.map((stanza, sIdx) => (
                        <div
                          key={sIdx}
                          className="mb-6 whitespace-pre-line text-base text-white/95 light:text-slate-900 leading-relaxed font-normal tracking-wide selection:bg-[#8B5CF6]/30"
                        >
                          {stanza}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center px-4 bg-white/[0.02] light:bg-black/[0.02] rounded-[24px] border border-white/5 light:border-black/5 my-auto">
                      <FileText className="w-9 h-9 text-[#64748B] mb-2 stroke-[1.5]" />
                      <p className="text-sm font-bold text-white light:text-slate-900 font-bengali">
                        কোন লিরিক্স সেভ করা নেই
                      </p>
                      <p className="text-xs text-[#94A3B8] light:text-slate-500 mt-1 max-w-[260px]">
                        YouTube is playing above. You can fetch lyrics with AI or add them manually.
                      </p>
                      {onOpenPrepare && (
                        <button
                          onClick={() => {
                            setIsFullPlayerOpen(false);
                            onOpenPrepare(liveSong);
                          }}
                          className="mt-3 px-4 py-2 rounded-full btn-primary-gradient text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md active:scale-95"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Prepare Lyrics with AI</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* OFFLINE AUDIO BEAT VISUALIZERS + CONTROLS */
              <>
                <div className="flex-1 flex flex-col items-center justify-center my-2 relative overflow-hidden">
                  {hasOfflineAudio || liveSong.hasAudio ? (
                    <>
                      {/* Visualizer Style Switcher Bar */}
                      <div className="flex items-center justify-center gap-1.5 mb-2.5 z-10">
                        {[
                          { id: 'wave', label: 'Wave', icon: Activity },
                          { id: 'vinyl', label: 'Vinyl', icon: Disc },
                          { id: 'orb', label: 'Orb', icon: Radio },
                        ].map((mode) => {
                          const Icon = mode.icon;
                          const isSelected = visualizerStyle === mode.id;
                          return (
                            <button
                              key={mode.id}
                              onClick={() => handleSetVisualizerStyle(mode.id as any)}
                              className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95 ${
                                isSelected
                                  ? 'bg-[#8B5CF6]/20 border border-[#8B5CF6] text-[#C4B5FD] light:text-[#7C3AED] shadow-[0_0_12px_rgba(139,92,246,0.35)]'
                                  : 'bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-[#94A3B8] light:text-slate-600 hover:text-white'
                              }`}
                            >
                              <Icon className="w-3 h-3" />
                              <span>{mode.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* MODE 1: POWERAMP STUDIO SPECTRUM WAVE */}
                      {visualizerStyle === 'wave' && (
                        <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                          <div
                            className="absolute w-44 h-44 rounded-full bg-gradient-to-tr from-[#6366F1]/30 via-[#8B5CF6]/30 to-[#EC4899]/25 blur-3xl pointer-events-none transition-transform duration-75"
                            style={{
                              transform: `scale(${1 + beatEnergy * 0.7})`,
                              opacity: isPlaying ? 0.45 + beatEnergy * 0.55 : 0.15,
                            }}
                          />

                          <div className="flex items-center gap-2 mb-3 z-10">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#C4B5FD] light:text-[#7C3AED] bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 px-3 py-0.5 rounded-full shadow-[0_0_15px_rgba(139,92,246,0.25)]">
                              {isPlaying ? `${Math.round(beatEnergy * 100)}% BASS PUNCH` : 'PAUSED'}
                            </span>
                            <span className="text-[9px] font-mono text-[#94A3B8] light:text-slate-500 bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 px-2 py-0.5 rounded-full">
                              32-Band FFT
                            </span>
                          </div>

                          <div className="w-full max-w-[360px] h-28 flex items-end justify-center gap-[3px] px-2 relative z-10">
                            {spectrumData.map((val, idx) => {
                              const barHeight = Math.max(8, val * 100);
                              const peakHeight = Math.max(barHeight + 2, (peakHoldData[idx] || 0) * 100);
                              return (
                                <div key={idx} className="flex-1 h-full flex flex-col justify-end items-center relative">
                                  <div
                                    className="absolute w-full h-[2.5px] rounded-full transition-all duration-75"
                                    style={{
                                      bottom: `${Math.min(100, peakHeight)}%`,
                                      backgroundColor: idx < 10 ? '#6366F1' : idx < 22 ? '#8B5CF6' : '#EC4899',
                                      boxShadow: `0 0 6px ${idx < 10 ? '#6366F1' : idx < 22 ? '#8B5CF6' : '#EC4899'}`,
                                    }}
                                  />

                                  <div
                                    className="w-full rounded-t-sm transition-all duration-75"
                                    style={{
                                      height: `${barHeight}%`,
                                      background:
                                        idx < 10
                                          ? 'linear-gradient(to top, #1E1B4B, #6366F1)'
                                          : idx < 22
                                          ? 'linear-gradient(to top, #2E1065, #8B5CF6)'
                                          : 'linear-gradient(to top, #500724, #EC4899)',
                                      boxShadow: val > 0.5 ? '0 0 10px rgba(139, 92, 246, 0.5)' : 'none',
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>

                          <div className="w-full max-w-[360px] h-10 flex items-start justify-center gap-[3px] px-2 opacity-25 overflow-hidden pointer-events-none mt-[2px]">
                            {spectrumData.map((val, idx) => (
                              <div
                                key={idx}
                                className="flex-1 rounded-b-sm transition-all duration-75"
                                style={{
                                  height: `${Math.max(4, val * 45)}%`,
                                  background: idx < 10 ? '#6366F1' : idx < 22 ? '#8B5CF6' : '#EC4899',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* MODE 2: ROTATING TURNTABLE VINYL DISC */}
                      {visualizerStyle === 'vinyl' && (
                        <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                          <div
                            className="absolute w-52 h-52 rounded-full border transition-transform duration-75"
                            style={{
                              transform: `scale(${1 + beatEnergy * 0.35})`,
                              borderColor: isPlaying ? 'rgba(139, 92, 246, 0.45)' : 'rgba(255, 255, 255, 0.08)',
                              boxShadow: isPlaying ? '0 0 35px rgba(139, 92, 246, 0.25)' : 'none',
                            }}
                          />
                          <div
                            className="absolute w-64 h-64 rounded-full border transition-transform duration-75"
                            style={{
                              transform: `scale(${1 + beatEnergy * 0.55})`,
                              borderColor: isPlaying ? 'rgba(236, 72, 153, 0.3)' : 'rgba(255, 255, 255, 0.04)',
                              opacity: isPlaying ? 0.3 + beatEnergy * 0.5 : 0.05,
                            }}
                          />

                          <div
                            className={`w-48 h-48 rounded-full border-2 border-white/20 relative shadow-[0_15px_40px_rgba(0,0,0,0.9)] flex items-center justify-center overflow-hidden ${
                              isPlaying ? 'animate-spin-slow' : ''
                            }`}
                            style={{
                              background:
                                'repeating-radial-gradient(circle, #080B14 0px, #080B14 2px, #131A2C 3px, #080B14 4px)',
                            }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none rounded-full" />

                            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#6366F1] via-[#8B5CF6] to-[#EC4899] border-2 border-white/40 flex flex-col items-center justify-center text-center p-1 relative z-10 shadow-lg">
                              <div className="w-3.5 h-3.5 rounded-full bg-[#050811] border border-white/30 mb-1" />
                              <span className="text-[8px] font-bold text-white font-bengali truncate max-w-[70px] leading-tight">
                                {liveSong.titleBn || liveSong.titleLatin}
                              </span>
                              <span className="text-[7px] font-mono text-white/90 uppercase tracking-tighter">
                                Tour Vinyl
                              </span>
                            </div>
                          </div>

                          <span className="text-[9px] font-mono font-bold text-[#8B5CF6] mt-3">
                            {isPlaying ? `TURNTABLE SPINNING • ${Math.round(beatEnergy * 100)}% BASS` : 'TURNTABLE PAUSED'}
                          </span>
                        </div>
                      )}

                      {/* MODE 3: COSMIC BASS ORB */}
                      {visualizerStyle === 'orb' && (
                        <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                          <div
                            className="absolute w-52 h-52 rounded-full bg-gradient-to-tr from-[#6366F1]/30 via-[#8B5CF6]/30 to-[#EC4899]/30 blur-2xl pointer-events-none transition-transform duration-75"
                            style={{
                              transform: `scale(${1 + beatEnergy * 0.55})`,
                              opacity: isPlaying ? 0.4 + beatEnergy * 0.6 : 0.15,
                            }}
                          />

                          <div
                            className="w-40 h-40 rounded-full border-2 flex items-center justify-center transition-transform duration-75 shadow-[0_0_40px_rgba(139,92,246,0.25)]"
                            style={{
                              transform: `scale(${1 + beatEnergy * 0.25})`,
                              borderColor: isPlaying ? 'rgba(139, 92, 246, 0.45)' : 'rgba(255, 255, 255, 0.1)',
                            }}
                          >
                            <div
                              className="w-28 h-28 rounded-full bg-gradient-to-b from-[#312E81] via-[#4C1D95] to-[#831843] border border-[#8B5CF6]/60 flex flex-col items-center justify-center text-white shadow-[inset_0_0_25px_rgba(139,92,246,0.4)] transition-transform duration-75"
                              style={{
                                transform: `scale(${1 + beatEnergy * 0.12})`,
                              }}
                            >
                              <Music2 className="w-9 h-9 stroke-[2.2]" />
                              <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-pink-200 mt-1">
                                {isPlaying ? `${Math.round(beatEnergy * 100)}% BASS` : 'PAUSED'}
                              </span>
                            </div>
                          </div>

                          <div className="w-full flex items-end justify-center gap-[3px] h-9 mt-4 px-4">
                            {spectrumData.map((val, idx) => (
                              <div
                                key={idx}
                                className="flex-1 rounded-t-sm transition-all duration-75"
                                style={{
                                  height: `${Math.max(4, val * 100)}%`,
                                  backgroundColor:
                                    idx < 8 ? '#6366F1' : idx < 20 ? '#8B5CF6' : '#EC4899',
                                  boxShadow: val > 0.6 ? '0 0 8px rgba(139, 92, 246, 0.6)' : 'none',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full flex-1 flex flex-col items-center justify-center text-center px-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] mb-3">
                        <Music2 className="w-8 h-8 stroke-[1.5]" />
                      </div>
                      <h3 className="text-sm font-bold text-white light:text-slate-800">
                        No Audio or YouTube Stream Attached
                      </h3>
                      <p className="text-xs text-[#94A3B8] light:text-slate-500 max-w-[280px] mt-1">
                        Attach an offline audio file or paste a YouTube link to listen and view synchronized lyrics.
                      </p>
                      <div className="flex items-center gap-2 mt-4">
                        {onOpenPrepare && (
                          <button
                            onClick={() => {
                              setIsFullPlayerOpen(false);
                              onOpenPrepare(liveSong);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#C4B5FD] light:text-[#7C3AED] text-xs font-semibold hover:bg-[#8B5CF6]/30 transition-all flex items-center gap-1.5"
                          >
                            <ArrowDownCircle className="w-3.5 h-3.5" />
                            <span>Attach Audio</span>
                          </button>
                        )}
                        {onOpenEdit && (
                          <button
                            onClick={() => {
                              setIsFullPlayerOpen(false);
                              onOpenEdit(liveSong);
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/10 light:bg-black/5 border border-white/15 light:border-black/10 text-white light:text-slate-800 text-xs font-semibold hover:bg-white/20 transition-all flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Add YouTube Link</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Timeline Waveform Scrubber & Time */}
                <div className="mt-0.5">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={(e) => seek(parseFloat(e.target.value))}
                    className="w-full h-1.5 appearance-none bg-white/10 light:bg-black/10 rounded-full accent-[#8B5CF6] cursor-pointer"
                  />
                  <div className="flex justify-between text-xs font-mono text-[#94A3B8] light:text-slate-500 mt-1 font-medium">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Convenient Ergonomic Volume Rocker Bar */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] light:bg-black/[0.04] border border-white/[0.08] light:border-black/[0.08] mt-2 mb-1 shadow-inner">
                  <button
                    onClick={toggleMute}
                    className={`p-1.5 rounded-full transition-colors active:scale-90 ${
                      isMuted || volume === 0
                        ? 'text-red-400 bg-red-500/10'
                        : 'text-[#94A3B8] hover:text-[#8B5CF6]'
                    }`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-4 h-4 stroke-[2.2]" />
                    ) : volume < 0.5 ? (
                      <Volume1 className="w-4 h-4 stroke-[2.2]" />
                    ) : (
                      <Volume2 className="w-4 h-4 stroke-[2.2]" />
                    )}
                  </button>

                  <button
                    onClick={() => setVolume(Math.max(0, volume - 0.1))}
                    className="w-6 h-6 rounded-full bg-white/5 light:bg-black/5 hover:bg-white/15 active:scale-90 text-[#94A3B8] light:text-slate-600 hover:text-white flex items-center justify-center text-xs font-bold font-mono transition-all"
                    title="Volume Down (-10%)"
                  >
                    -
                  </button>

                  <div className="flex-1 relative flex items-center">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-1.5 appearance-none bg-white/10 light:bg-black/10 rounded-full accent-[#8B5CF6] cursor-pointer"
                      title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                    />
                  </div>

                  <button
                    onClick={() => setVolume(Math.min(1, volume + 0.1))}
                    className="w-6 h-6 rounded-full bg-white/5 light:bg-black/5 hover:bg-white/15 active:scale-90 text-[#94A3B8] light:text-slate-600 hover:text-white flex items-center justify-center text-xs font-bold font-mono transition-all"
                    title="Volume Up (+10%)"
                  >
                    +
                  </button>

                  <span className="text-[10px] font-mono text-[#8B5CF6] font-bold w-7 text-right">
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>

                {/* Main Playback Controls Cluster */}
                <div className="flex items-center justify-between mt-1 px-2">
                  <button
                    onClick={toggleShuffle}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isShuffle ? 'text-[#8B5CF6] bg-[#8B5CF6]/15' : 'text-[#94A3B8] hover:text-white light:hover:text-black'
                    }`}
                    title="Shuffle"
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>

                  <button
                    onClick={previous}
                    className="w-12 h-12 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 flex items-center justify-center text-white light:text-slate-800 active:scale-90 transition-all shadow-md"
                    title="Previous Track"
                  >
                    <SkipBack className="w-5 h-5 fill-current" />
                  </button>

                  <button
                    onClick={togglePlay}
                    className="w-16 h-16 rounded-full btn-primary-gradient text-white flex items-center justify-center shadow-[0_0_35px_rgba(139,92,246,0.55)] active:scale-90 hover:scale-105 transition-all"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause className="w-7 h-7 fill-current" />
                    ) : (
                      <Play className="w-7 h-7 ml-1 fill-current" />
                    )}
                  </button>

                  <button
                    onClick={next}
                    className="w-12 h-12 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 flex items-center justify-center text-white light:text-slate-800 active:scale-90 transition-all shadow-md"
                    title="Next Track"
                  >
                    <SkipForward className="w-5 h-5 fill-current" />
                  </button>

                  <button
                    onClick={cycleLoopMode}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      loopMode !== 'off'
                        ? 'text-[#8B5CF6] bg-[#8B5CF6]/15'
                        : 'text-[#94A3B8] hover:text-white light:hover:text-black'
                    }`}
                    title={`Loop: ${loopMode}`}
                  >
                    {loopMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
                  </button>
                </div>

                {/* Bottom Utility Row: Speed Selector + Switch to Lyrics + Context Action */}
                <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.08] light:border-black/[0.08] mt-1.5">
                  <button
                    onClick={nextSpeed}
                    className="px-3 py-1.5 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 text-xs font-mono font-semibold text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-95 transition-all flex items-center gap-1.5"
                    title="Playback Speed"
                  >
                    <Gauge className="w-3.5 h-3.5 text-[#8B5CF6]" />
                    <span>{playbackRate}x</span>
                  </button>

                  <button
                    onClick={() => setFullPlayerTab('lyrics')}
                    className="px-3.5 py-1.5 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 text-xs font-semibold text-white light:text-slate-900 hover:border-[#8B5CF6]/50 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm"
                    title="Read Full Bengali Lyrics"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#8B5CF6]" />
                    <span>Lyrics</span>
                  </button>

                  {stanzas.length > 0 ? (
                    <button
                      onClick={handleCopyLyrics}
                      className="px-3 py-1.5 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 text-xs font-semibold text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-95 transition-all flex items-center gap-1.5"
                      title="Copy Lyrics to Clipboard"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  ) : (
                    onOpenPrepare && (
                      <button
                        onClick={() => {
                          setIsFullPlayerOpen(false);
                          onOpenPrepare(liveSong);
                        }}
                        className="px-3 py-1.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 text-xs font-semibold text-[#C4B5FD] active:scale-95 transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(139,92,246,0.25)]"
                        title="Prepare Lyrics with AI"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                        <span>AI Fetch</span>
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 2: LYRICS READER MODE
           ======================================================== */}
        {fullPlayerTab === 'lyrics' && (
          <div className="flex-1 flex flex-col px-5 pt-1 pb-4 overflow-hidden">
            {/* Header Toolbar */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 light:border-black/10 mb-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFontSize(Math.max(16, fontSize - 2))}
                  className="w-8 h-8 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 flex items-center justify-center text-xs font-bold text-[#94A3B8] light:text-slate-600 hover:text-white"
                  title="Smaller Font"
                >
                  A-
                </button>
                <button
                  onClick={() => setFontSize(Math.min(34, fontSize + 2))}
                  className="w-8 h-8 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 flex items-center justify-center text-xs font-bold text-white light:text-slate-900"
                  title="Larger Font"
                >
                  A+
                </button>
                <span className="text-xs font-mono text-[#94A3B8] light:text-slate-500 ml-1">{fontSize}px</span>
              </div>

              {/* Auto Scroll Toggle */}
              <button
                onClick={() => setIsAutoScroll(!isAutoScroll)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  isAutoScroll
                    ? 'btn-primary-gradient text-white border-transparent shadow-md'
                    : 'bg-white/[0.06] light:bg-black/[0.04] border-white/10 light:border-black/10 text-[#94A3B8] light:text-slate-600 hover:text-white'
                }`}
              >
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <span>Auto-Scroll</span>
              </button>
            </div>

            {/* Scrollable Bengali Lyrics Content */}
            <div
              ref={lyricsScrollRef}
              className="flex-1 overflow-y-auto pr-1 pb-16 scrollbar-none font-bengali text-white/95 light:text-slate-900"
            >
              {stanzas.length > 0 ? (
                <div className="pt-2">
                  {stanzas.map((stanza, idx) => (
                    <div
                      key={idx}
                      className="mb-7 whitespace-pre-line font-normal tracking-wide leading-relaxed selection:bg-[#8B5CF6]/30 text-white/95 light:text-slate-900"
                      style={{
                        fontSize: `${fontSize}px`,
                        lineHeight: 1.8,
                      }}
                    >
                      {stanza}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 px-4">
                  <FileText className="w-12 h-12 text-[#64748B] mx-auto mb-3" />
                  <p className="text-base font-bold text-white light:text-slate-900 font-bengali">
                    কোন লিরিক্স সেভ করা নেই
                  </p>
                  <p className="text-xs text-[#94A3B8] light:text-slate-500 mt-1">
                    You can extract authentic lyrics online with AI or paste them manually.
                  </p>
                  {onOpenPrepare && (
                    <button
                      onClick={() => {
                        setIsFullPlayerOpen(false);
                        onOpenPrepare(liveSong);
                      }}
                      className="mt-4 px-5 py-2.5 rounded-full btn-primary-gradient text-white font-semibold text-xs inline-flex items-center gap-2 shadow-md"
                    >
                      <Sparkles className="w-4 h-4" /> Prepare Lyrics with AI
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Mini Control Bar for Lyrics view */}
            <div className="shrink-0 pt-3 border-t border-white/10 light:border-black/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="w-11 h-11 rounded-full btn-primary-gradient text-white flex items-center justify-center shadow-md active:scale-90"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 ml-0.5 fill-current" />
                  )}
                </button>
                <div>
                  <div className="text-xs font-mono text-[#8B5CF6] font-bold">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] light:text-slate-500">Playing background audio</div>
                </div>
              </div>

              {onOpenEdit && (
                <button
                  onClick={() => {
                    setIsFullPlayerOpen(false);
                    onOpenEdit(liveSong);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 text-xs font-medium text-white light:text-slate-800 flex items-center gap-1.5 hover:bg-white/10"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 3: SPLIT SYNC MODE (Visualizer top + Lyrics bottom)
           ======================================================== */}
        {fullPlayerTab === 'split' && (
          <div className="flex-1 flex flex-col px-5 pt-1 pb-4 overflow-hidden">
            {/* Top Compact Visualizer & Transport */}
            {isYouTubePlaying ? (
              <div className="shrink-0 pb-2 border-b border-white/10 light:border-black/10">
                <div className="w-full max-w-[420px] aspect-video rounded-2xl overflow-hidden border border-white/15 light:border-black/15 shadow-md relative bg-black mx-auto">
                  <iframe
                    ref={ytIframeRef}
                    id="youtube-player-frame-split"
                    src={
                      liveSong.youtubePlaylistId
                        ? `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(liveSong.youtubePlaylistId)}&autoplay=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&playsinline=1`
                        : liveSong.youtubeEmbedUrl || `https://www.youtube.com/embed/${liveSong.youtubeVideoId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&playsinline=1`
                    }
                    title={liveSong.titleLatin}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    onLoad={handleIframeLoad}
                    className="w-full h-full relative z-0"
                  />
                </div>
              </div>
            ) : (
              <div className="shrink-0 pb-3 border-b border-white/10 light:border-black/10">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white light:text-slate-900 font-bengali truncate">
                      {liveSong.titleBn || liveSong.titleLatin}
                    </h3>
                    <p className="text-[11px] text-[#94A3B8] light:text-slate-500 truncate">
                      {liveSong.titleLatin}
                    </p>
                  </div>

                  {/* Mini Pulsing Orb */}
                  <div
                    className="w-10 h-10 rounded-full bg-white/[0.06] border border-[#8B5CF6]/50 flex items-center justify-center text-[#8B5CF6] shrink-0 transition-transform duration-75"
                    style={{ transform: `scale(${1 + beatEnergy * 0.2})` }}
                  >
                    <Music2 className="w-4 h-4 stroke-[2.2]" />
                  </div>
                </div>

                {/* Spectrum Bars */}
                <div className="w-full flex items-end justify-center gap-[2px] h-7 mb-2">
                  {spectrumData.slice(0, 24).map((val, idx) => (
                    <div
                      key={idx}
                      className="flex-1 rounded-t-sm"
                      style={{
                        height: `${Math.max(10, val * 100)}%`,
                        backgroundColor: idx < 8 ? '#6366F1' : idx < 16 ? '#8B5CF6' : '#EC4899',
                      }}
                    />
                  ))}
                </div>

                {/* Scrubber */}
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => seek(parseFloat(e.target.value))}
                  className="w-full h-1.5 appearance-none bg-white/10 light:bg-black/10 rounded-full accent-[#8B5CF6] cursor-pointer"
                />
                <div className="flex items-center justify-between text-[11px] font-mono text-[#94A3B8] light:text-slate-500 mt-1">
                  <span>{formatTime(currentTime)}</span>
                  <div className="flex items-center gap-2">
                    <button onClick={previous} className="p-1 text-[#94A3B8] hover:text-white light:hover:text-black">
                      <SkipBack className="w-3.5 h-3.5 fill-current" />
                    </button>
                    <button
                      onClick={togglePlay}
                      className="w-7 h-7 rounded-full btn-primary-gradient text-white flex items-center justify-center shadow-sm"
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
                    </button>
                    <button onClick={next} className="p-1 text-[#94A3B8] hover:text-white light:hover:text-black">
                      <SkipForward className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>
                  <span>{formatTime(duration)}</span>
                </div>

                {/* Up Next in Split View */}
                <div className="flex items-center justify-between px-2.5 py-1 rounded-full bg-white/[0.05] light:bg-black/[0.04] border border-white/[0.06] light:border-black/[0.06] text-[10px] text-[#94A3B8] light:text-slate-500 mt-2">
                  <span className="truncate">
                    <strong className="text-[#8B5CF6]">Up Next:</strong>{' '}
                    {upNextSong ? (upNextSong.titleBn || upNextSong.titleLatin) : 'End of queue'}
                  </span>
                  {upNextSong && (
                    <button onClick={next} className="text-[#8B5CF6] font-semibold shrink-0 ml-1">
                      Skip &gt;
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Synchronized / Scrollable Bengali Lyrics */}
            <div className="flex-1 overflow-y-auto pt-3 pr-1 pb-10 scrollbar-none font-bengali text-white/95 light:text-slate-900">
              {stanzas.length > 0 ? (
                <div className="pt-2">
                  {stanzas.map((stanza, sIdx) => (
                    <div
                      key={sIdx}
                      className="mb-6 whitespace-pre-line text-base text-white/95 light:text-slate-900 leading-relaxed font-normal tracking-wide selection:bg-[#8B5CF6]/30"
                    >
                      {stanza}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-[#94A3B8] light:text-slate-500">
                  <p className="text-sm">No lyrics attached to this track.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5-Band Equalizer Drawer */}
        <EqualizerDrawer isOpen={isEQOpen} onClose={() => setIsEQOpen(false)} />

        {/* Sleep Timer Drawer */}
        <SleepTimerDrawer isOpen={isSleepTimerOpen} onClose={() => setIsSleepTimerOpen(false)} />
      </motion.div>
    </div>
  );
};
