import React, { useState, useEffect } from 'react';
import { SongRecord, CategoryRecord, AppSettings } from '../types';
import { songRepository } from '../data/songRepository';
import { wakeLockManager } from '../services/wakeLock';
import { useAudio } from '../context/AudioContext';
import { hasValidLyrics } from './SongList';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Edit3,
  Sparkles,
  Copy,
  Check,
  Type,
  Play,
  Pause,
  Sun,
  X,
  Music2,
  Download,
} from 'lucide-react';

interface SongReaderProps {
  song: SongRecord;
  allSongs: SongRecord[];
  categories: CategoryRecord[];
  settings: AppSettings;
  onBack: () => void;
  onSelectSong: (song: SongRecord) => void;
  onEditSong: (song: SongRecord) => void;
  onOpenPrepare: (song: SongRecord) => void;
  onSongUpdated: (updatedSong: SongRecord) => void;
  onOpenAudioHub?: (song: SongRecord) => void;
}

export const SongReader: React.FC<SongReaderProps> = ({
  song,
  allSongs,
  categories,
  settings,
  onBack,
  onSelectSong,
  onEditSong,
  onOpenPrepare,
  onSongUpdated,
  onOpenAudioHub,
}) => {
  const { playSong, openPlayerForSong, currentSong, isPlaying, togglePlay, setIsFullPlayerOpen } = useAudio();
  const isSongActive = currentSong?.id === song.id;

  const [fontSize, setFontSize] = useState<number>(settings.fontSize || 20);
  const [lineHeight, setLineHeight] = useState<number>(settings.lineHeight || 1.8);
  const [isWakeLockOn, setIsWakeLockOn] = useState<boolean>(settings.keepAwake);
  const [copied, setCopied] = useState<boolean>(false);
  const [showFormatDrawer, setShowFormatDrawer] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isWakeLockOn) {
      wakeLockManager.request();
    } else {
      wakeLockManager.release();
    }
    return () => {
      wakeLockManager.release();
    };
  }, [isWakeLockOn]);

  const currentIndex = allSongs.findIndex((s) => s.id === song.id);
  const prevSong = currentIndex > 0 ? allSongs[currentIndex - 1] : null;
  const nextSong = currentIndex >= 0 && currentIndex < allSongs.length - 1 ? allSongs[currentIndex + 1] : null;

  const categoryName = categories.find((c) => c.id === song.categoryId)?.name || 'General';

  const handleMarkReviewed = async () => {
    const updated = await songRepository.updateSong(song.id, {
      lyricsStatus: 'reviewed',
    });
    onSongUpdated(updated);
  };

  const handleCopyLyrics = async () => {
    if (!song.lyricsBn) return;
    try {
      await navigator.clipboard.writeText(song.lyricsBn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleSaveReaderPrefs = async (newFontSize: number, newLineHeight: number) => {
    setFontSize(newFontSize);
    setLineHeight(newLineHeight);
    await songRepository.saveSettings({
      fontSize: newFontSize,
      lineHeight: newLineHeight,
    });
  };

  const isValid = hasValidLyrics(song.lyricsBn);
  const stanzas = isValid && song.lyricsBn
    ? song.lyricsBn
        .split(/\n\s*\n/)
        .map((st) => st.trim())
        .filter(Boolean)
    : [];

  const hasYouTube = Boolean(song.youtubeVideoId || song.youtubePlaylistId || song.youtubeUrl);

  return (
    <div className="flex flex-col h-full bg-[#080C16] light:bg-[#FFFFFF] bg-ambient-cosmic text-[#F1F5F9] light:text-[#0F172A] relative overflow-hidden">
      {/* Top Floating App Bar */}
      <header
        className="px-4.5 sm:px-5 pb-3.5 flex items-center justify-between gap-3 shrink-0 z-20 border-b border-white/10 light:border-black/10 frosted-surface min-h-[66px]"
        style={{
          paddingTop: 'calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-full frosted-surface border border-white/10 light:border-black/10 hover:border-violet-500/40 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all shadow-sm shrink-0"
            aria-label="Back to library"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-base font-bold text-white light:text-slate-900 truncate font-bengali leading-snug">
              {song.titleBn || song.titleLatin}
            </h1>
            <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] light:text-slate-500 truncate mt-0.5">
              <span className="font-semibold text-violet-300 uppercase tracking-wider text-[9px]">
                {categoryName}
              </span>
              {song.importSerial != null && (
                <>
                  <span>•</span>
                  <span>#{song.importSerial}</span>
                </>
              )}
              {song.titleLatin && song.titleLatin !== song.titleBn && (
                <>
                  <span>•</span>
                  <span className="truncate">{song.titleLatin}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Format Settings Drawer Trigger */}
          <button
            onClick={() => setShowFormatDrawer(true)}
            className="w-9 h-9 rounded-full frosted-surface border border-white/10 light:border-black/10 hover:border-violet-500/40 flex items-center justify-center text-[#94A3B8] hover:text-white active:scale-90 transition-all shadow-sm shrink-0"
            aria-label="Display & font settings"
            title="Reader Settings"
          >
            <Type className="w-4 h-4 text-violet-400" />
          </button>

          {/* Offline / Online Status Indicator - Exactly matched in size and styling to T button */}
          <div
            className="w-9 h-9 rounded-full frosted-surface border border-white/10 light:border-black/10 flex items-center justify-center shadow-sm shrink-0"
            title={isOnline ? 'Online (Ready to fetch lyrics)' : 'Offline (Local library only)'}
          >
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                isOnline
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]'
              }`}
            />
          </div>
        </div>
      </header>

      {/* Main Lyrics Reader Scroll Container */}
      <main className="flex-1 overflow-y-auto px-5 pt-3 pb-28 overscroll-contain select-none">
        {/* Song Hero Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="frosted-surface rounded-[24px] p-4 text-center mb-4 relative overflow-hidden shadow-sm"
        >
          {/* Ambient Glow */}
          <div className="absolute inset-x-0 -top-10 h-24 bg-gradient-to-b from-[#6366F1]/15 to-transparent pointer-events-none" />

          {/* Bengali Title - Clean, Simple Font Size */}
          <h2 className="text-base sm:text-lg font-bold text-white light:text-slate-900 font-bengali tracking-wide mb-1 leading-snug">
            {song.titleBn || song.titleLatin}
          </h2>

          {/* Latin Subtitle */}
          {song.titleLatin && song.titleLatin !== song.titleBn && (
            <p className="text-xs font-medium text-[#94A3B8] light:text-slate-500 tracking-normal mb-2">
              {song.titleLatin}
            </p>
          )}

          {/* Category & Status Badge Row */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap mb-3">
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#C4B5FD] light:text-[#7C3AED] bg-[#8B5CF6]/15 light:bg-[#7C3AED]/10 px-2 py-0.5 rounded-md border border-[#8B5CF6]/25">
              {categoryName}
            </span>

            {song.importSerial != null && (
              <span className="text-[10px] font-mono text-[#64748B] light:text-slate-400">
                #{song.importSerial}
              </span>
            )}

            {isValid && song.lyricsStatus === 'reviewed' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-400/40">
                <CheckCircle2 className="w-3 h-3 stroke-[2.2]" /> Reviewed
              </span>
            ) : isValid && song.lyricsStatus === 'unreviewed' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/40">
                <AlertCircle className="w-3 h-3 stroke-[2.2]" /> Unreviewed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 light:bg-black/5 text-[#94A3B8] light:text-slate-500 border border-white/10 light:border-black/10">
                <FileText className="w-3 h-3" /> Missing Lyrics
              </span>
            )}
          </div>

          {/* Audio Player Banner - Clicking card opens Full Player */}
          <div
            onClick={() => {
              if (song.hasAudio) {
                if (!isSongActive) {
                  playSong(song, allSongs);
                }
                setIsFullPlayerOpen(true);
              } else if (hasYouTube) {
                openPlayerForSong(song, 'visualizer', allSongs);
              } else if (onOpenAudioHub) {
                onOpenAudioHub(song);
              }
            }}
            className="mb-4 p-3 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/10 light:border-black/10 flex items-center justify-between gap-3 cursor-pointer hover:border-[#8B5CF6]/40 active:scale-[0.99] transition-all group"
            title={song.hasAudio ? 'Click to open Full Player' : hasYouTube ? 'Click to play YouTube stream' : 'Click to attach audio'}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                  isSongActive && isPlaying
                    ? 'btn-primary-gradient text-white shadow-[0_0_15px_rgba(139,92,246,0.45)]'
                    : song.hasAudio
                    ? 'bg-white/[0.08] light:bg-black/[0.05] text-[#8B5CF6] border-[#8B5CF6]/30 group-hover:border-[#8B5CF6]/60'
                    : hasYouTube
                    ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 group-hover:border-rose-500/60'
                    : 'bg-white/5 light:bg-black/5 text-[#64748B] border-white/10 light:border-black/10'
                }`}
              >
                {hasYouTube && !song.hasAudio ? (
                  <Play className="w-5 h-5 ml-0.5 fill-current" />
                ) : (
                  <Music2 className="w-5 h-5 stroke-[2.2]" />
                )}
              </div>
              <div className="text-left min-w-0">
                <span className="text-xs font-bold text-white light:text-slate-900 block truncate">
                  {song.hasAudio
                    ? 'Offline Audio Ready'
                    : song.youtubePlaylistId
                    ? 'YouTube Playlist Attached'
                    : hasYouTube
                    ? 'YouTube Stream Attached'
                    : 'No Audio Attached'}
                </span>
                <span className="text-[10px] text-[#94A3B8] light:text-slate-500 block truncate">
                  {song.hasAudio
                    ? isSongActive && isPlaying
                      ? 'Playing with Beat Visualizer • Tap to open player'
                      : 'Tap card to play & open full player'
                    : hasYouTube
                    ? 'Play video stream or download offline audio'
                    : 'Attach an audio file or download from YouTube'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {song.hasAudio ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isSongActive) {
                      togglePlay();
                    } else {
                      playSong(song, allSongs);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-full btn-primary-gradient text-white font-bold text-xs flex items-center gap-1.5 active:scale-90 shadow-sm"
                  title={isSongActive && isPlaying ? 'Pause' : 'Play'}
                >
                  {isSongActive && isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      <span>Play</span>
                    </>
                  )}
                </button>
              ) : hasYouTube ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlayerForSong(song, 'visualizer', allSongs);
                    }}
                    className="px-3 py-1.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 font-bold text-xs flex items-center gap-1 active:scale-90 shadow-sm transition-all"
                    title="Play Video Stream in App"
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    <span>Play</span>
                  </button>
                  {onOpenAudioHub && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenAudioHub(song);
                      }}
                      className="px-3 py-1.5 rounded-full btn-primary-gradient text-white font-bold text-xs flex items-center gap-1 active:scale-90 shadow-md transition-all hover:opacity-95"
                      title="Download Offline Audio (via yt-dlp)"
                    >
                      <Download className="w-3.5 h-3.5 stroke-[2.2]" />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              ) : (
                onOpenAudioHub && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenAudioHub(song);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-white/10 light:bg-black/5 border border-[#8B5CF6]/40 text-[#8B5CF6] font-semibold text-xs flex items-center gap-1.5 active:scale-90 hover:bg-[#8B5CF6] hover:text-white transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Attach Audio</span>
                  </button>
                )
              )}

              {song.hasAudio && onOpenAudioHub && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAudioHub(song);
                  }}
                  className="w-8 h-8 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white active:scale-90"
                  title="Manage Audio"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Symmetrical 4-Button Action Cluster */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/[0.08] light:border-black/[0.08]">
            {/* 1. YouTube */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => {
                  if (hasYouTube) {
                    openPlayerForSong(song, 'visualizer', allSongs);
                  } else {
                    window.alert('No YouTube link attached to this song yet. You can add one in Edit.');
                  }
                }}
                className={`w-13 h-13 rounded-full flex items-center justify-center border active:scale-90 transition-all ${
                  hasYouTube
                    ? 'bg-red-500/15 border-red-500/40 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)] hover:bg-red-500/25'
                    : 'bg-white/5 light:bg-black/5 border-white/10 light:border-black/10 text-white/30 light:text-black/30 cursor-not-allowed'
                }`}
                aria-label="Play on YouTube"
                title={hasYouTube ? 'Play video & lyrics inside app' : 'No link'}
              >
                <Play className="w-5 h-5 ml-0.5 fill-current" />
              </button>
              <span className="text-[11px] font-medium text-[#94A3B8] light:text-slate-500 mt-1.5">
                {hasYouTube ? 'Play Video' : 'No Link'}
              </span>
            </div>

            {/* 2. Copy Lyrics */}
            <div className="flex flex-col items-center">
              <button
                onClick={handleCopyLyrics}
                disabled={!isValid}
                className={`w-13 h-13 rounded-full flex items-center justify-center border active:scale-90 transition-all ${
                  copied
                    ? 'btn-primary-gradient text-white shadow-md'
                    : isValid
                    ? 'bg-white/[0.06] light:bg-black/[0.04] border-white/10 light:border-black/10 text-white light:text-slate-800 hover:border-white/30'
                    : 'bg-white/5 light:bg-black/5 border-white/10 light:border-black/10 text-white/30 light:text-black/30 cursor-not-allowed'
                }`}
                aria-label="Copy lyrics"
              >
                {copied ? <Check className="w-5 h-5 stroke-[2.5]" /> : <Copy className="w-5 h-5" />}
              </button>
              <span className="text-[11px] font-medium text-[#94A3B8] light:text-slate-500 mt-1.5">
                {copied ? 'Copied!' : 'Copy'}
              </span>
            </div>

            {/* 3. Action based on lyrics presence: If lyrics exist, Format; if missing, AI Fetch */}
            <div className="flex flex-col items-center">
              {isValid ? (
                <>
                  <button
                    onClick={() => setShowFormatDrawer(true)}
                    className="w-13 h-13 rounded-full flex items-center justify-center bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 text-white light:text-slate-800 hover:border-[#8B5CF6]/40 active:scale-90 transition-all shadow-sm"
                    aria-label="Reader Formatting"
                    title="Font & Spacing Settings"
                  >
                    <Type className="w-5 h-5 text-[#8B5CF6]" />
                  </button>
                  <span className="text-[11px] font-medium text-[#94A3B8] light:text-slate-500 mt-1.5">
                    Format
                  </span>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onOpenPrepare(song)}
                    className="w-13 h-13 rounded-full flex items-center justify-center bg-[#8B5CF6]/15 border border-[#8B5CF6]/50 text-[#8B5CF6] shadow-[0_0_22px_rgba(139,92,246,0.25)] hover:shadow-[0_0_30px_rgba(139,92,246,0.4)] active:scale-90 transition-all"
                    aria-label="Prepare lyrics with AI"
                    title="Prepare lyrics with AI"
                  >
                    <Sparkles className="w-5 h-5" />
                  </button>
                  <span className="text-[11px] font-semibold text-[#8B5CF6] mt-1.5">
                    AI Fetch
                  </span>
                </>
              )}
            </div>

            {/* 4. Edit Song */}
            <div className="flex flex-col items-center">
              <button
                onClick={() => onEditSong(song)}
                className="w-13 h-13 rounded-full flex items-center justify-center bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 text-white light:text-slate-800 hover:border-white/30 active:scale-90 transition-all"
                aria-label="Edit song"
              >
                <Edit3 className="w-5 h-5" />
              </button>
              <span className="text-[11px] font-medium text-[#94A3B8] light:text-slate-500 mt-1.5">
                Edit
              </span>
            </div>
          </div>

          {/* Mark Reviewed CTA button if unreviewed */}
          {song.lyricsStatus === 'unreviewed' && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleMarkReviewed}
              className="mt-5 w-full py-3 rounded-full bg-emerald-500/18 border border-emerald-400/50 text-emerald-400 font-semibold text-xs flex items-center justify-center gap-2 shadow-sm"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>Mark Lyrics as Checked & Reviewed</span>
            </motion.button>
          )}
        </motion.div>

        {/* Lyrics Stage Display */}
        {stanzas.length > 0 ? (
          <div
            className="font-bengali text-white/95 light:text-slate-900 transition-all select-text pb-6"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
            }}
          >
            {stanzas.map((stanza, idx) => (
              <div
                key={idx}
                className="mb-7 whitespace-pre-line font-normal tracking-wide leading-relaxed selection:bg-[#8B5CF6]/30"
              >
                {stanza}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-5 text-center rounded-[32px] frosted-surface my-4">
            <div className="w-16 h-16 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] mb-3">
              <FileText className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white light:text-slate-900 mb-1">No Lyrics Saved Yet</h3>
            <p className="text-xs text-[#94A3B8] light:text-slate-500 max-w-xs mb-5 leading-relaxed">
              Find lyrics with live web search, AI lookup, paste from clipboard, or type directly.
            </p>

            <div className="flex flex-col w-full gap-2.5 max-w-xs">
              <button
                onClick={() => onOpenPrepare(song)}
                className="btn-primary-gradient h-13 rounded-full flex items-center justify-center gap-2 text-sm shadow-lg"
              >
                <Sparkles className="w-4 h-4" />
                <span>Search & Prepare Lyrics</span>
              </button>

              <button
                onClick={() => onEditSong(song)}
                className="h-12 rounded-full bg-white/[0.08] light:bg-black/[0.05] border border-white/10 light:border-black/10 text-white light:text-slate-900 font-semibold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <Edit3 className="w-4 h-4" />
                <span>Type / Paste in Editor</span>
              </button>
            </div>
          </div>
        )}

        {/* Notes Section if any */}
        {song.notes && (
          <div className="mt-6 p-4 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.07] light:border-black/[0.07] text-xs text-[#94A3B8] light:text-slate-600">
            <span className="font-semibold text-white light:text-slate-900 block mb-1">Notes:</span>
            <p className="whitespace-pre-line leading-relaxed">{song.notes}</p>
          </div>
        )}

        {/* Sources & Provenance */}
        {song.sources && song.sources.length > 0 && (
          <div className="mt-4 p-4 rounded-[22px] bg-white/[0.03] light:bg-black/[0.02] border border-white/[0.05] light:border-black/[0.05] text-[11px] text-[#64748B] space-y-1">
            <span className="font-semibold text-[#94A3B8] light:text-slate-600 block">Sources & Provenance:</span>
            {song.sources.map((src, i) => (
              <div key={i} className="flex items-center justify-between truncate">
                <span className="truncate">{src.url || src.siteId}</span>
                <span className="ml-2 font-mono text-[#8B5CF6]">
                  {(src.coverage * 100).toFixed(0)}% verified
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Bottom Nav Pill (< Previous | 12 of 107 | Next >) */}
      <div className="absolute bottom-5 inset-x-5 z-20 flex justify-center pointer-events-none">
        <div className="pointer-events-auto h-14 rounded-full bg-[#0A0E1A]/92 light:bg-white/92 backdrop-blur-2xl border border-white/12 light:border-black/12 px-5 flex items-center justify-between gap-5 shadow-[0_16px_40px_rgba(0,0,0,0.7)] w-full max-w-sm">
          <button
            onClick={() => prevSong && onSelectSong(prevSong)}
            disabled={!prevSong}
            className={`flex items-center gap-1.5 text-xs font-semibold active:scale-90 transition-all ${
              prevSong ? 'text-white light:text-slate-900 hover:text-[#8B5CF6]' : 'text-white/20 light:text-slate-300 cursor-not-allowed'
            }`}
            aria-label="Previous song"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Prev</span>
          </button>

          <span className="text-xs font-mono text-[#94A3B8] light:text-slate-500 tracking-wider">
            {currentIndex >= 0 ? `${currentIndex + 1} of ${allSongs.length}` : ''}
          </span>

          <button
            onClick={() => nextSong && onSelectSong(nextSong)}
            disabled={!nextSong}
            className={`flex items-center gap-1.5 text-xs font-semibold active:scale-90 transition-all ${
              nextSong ? 'text-white light:text-slate-900 hover:text-[#8B5CF6]' : 'text-white/20 light:text-slate-300 cursor-not-allowed'
            }`}
            aria-label="Next song"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slide-Up Typography & Reader Drawer */}
      <AnimatePresence>
        {showFormatDrawer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end"
            onClick={() => setShowFormatDrawer(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[430px] mx-auto rounded-t-[36px] bg-[#0A0E1A]/98 light:bg-white/98 backdrop-blur-2xl border-t border-white/15 light:border-black/10 p-6 space-y-5 text-[#F1F5F9] light:text-[#0F172A] shadow-[0_-15px_45px_rgba(0,0,0,0.85)]"
            >
              <div className="w-12 h-1 rounded-full bg-white/20 light:bg-black/20 mx-auto mb-2" />
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white light:text-slate-900">Reader Settings</h3>
                <button
                  onClick={() => setShowFormatDrawer(false)}
                  className="w-8 h-8 rounded-full bg-white/10 light:bg-black/10 flex items-center justify-center text-white/70 light:text-slate-600 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Text Size Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-[#94A3B8] light:text-slate-500">
                  <span>Text Size</span>
                  <span className="text-[#8B5CF6] font-mono">{fontSize}px</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#94A3B8] light:text-slate-500">A-</span>
                  <input
                    type="range"
                    min="16"
                    max="32"
                    step="2"
                    value={fontSize}
                    onChange={(e) => handleSaveReaderPrefs(Number(e.target.value), lineHeight)}
                    className="flex-1 accent-[#8B5CF6] cursor-pointer"
                  />
                  <span className="text-base text-white light:text-slate-900 font-bold">A+</span>
                </div>
              </div>

              {/* Line Spacing Pills */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#94A3B8] light:text-slate-500">Stanza Spacing</span>
                <div className="grid grid-cols-3 gap-2">
                  {[1.5, 1.8, 2.2].map((lh) => (
                    <button
                      key={lh}
                      onClick={() => handleSaveReaderPrefs(fontSize, lh)}
                      className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                        lineHeight === lh
                          ? 'btn-primary-gradient text-white border-transparent'
                          : 'bg-white/5 light:bg-black/5 text-[#94A3B8] light:text-slate-600 border-white/10 light:border-black/10 hover:text-white'
                      }`}
                    >
                      {lh}x Spacing
                    </button>
                  ))}
                </div>
              </div>

              {/* Keep Awake Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.04] light:bg-black/[0.03] border border-white/10 light:border-black/10">
                <div>
                  <span className="text-xs font-bold text-white light:text-slate-900 block">Keep Screen Awake</span>
                  <span className="text-[10px] text-[#94A3B8] light:text-slate-500">Prevent phone sleep during tour addas</span>
                </div>
                <button
                  onClick={() => setIsWakeLockOn(!isWakeLockOn)}
                  className={`w-12 h-7 rounded-full p-1 transition-colors ${
                    isWakeLockOn ? 'bg-[#8B5CF6]' : 'bg-white/15 light:bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      isWakeLockOn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Optional AI Re-fetch for saved lyrics */}
              <div className="pt-2 border-t border-white/10 light:border-black/10 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-white light:text-slate-900 block">AI Lyrics Assistant</span>
                  <span className="text-[10px] text-[#94A3B8] light:text-slate-500">Re-fetch, clean, or verify from web archives</span>
                </div>
                <button
                  onClick={() => {
                    setShowFormatDrawer(false);
                    onOpenPrepare(song);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#C4B5FD] light:text-[#7C3AED] text-xs font-semibold flex items-center gap-1.5 active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Re-fetch</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
