import React from 'react';
import { useAudio } from '../context/AudioContext';
import { motion } from 'motion/react';
import { Play, Pause, SkipForward, FileText, Music2, Timer } from 'lucide-react';

interface MiniPlayerProps {
  onOpenLyrics?: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({ onOpenLyrics }) => {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    next,
    beatEnergy,
    hasOfflineAudio,
    sleepTimer,
    setIsFullPlayerOpen,
    setFullPlayerTab,
  } = useAudio();

  if (
    !currentSong ||
    (!hasOfflineAudio &&
      !currentSong.youtubeEmbedUrl &&
      !currentSong.youtubeVideoId &&
      !currentSong.youtubePlaylistId)
  ) {
    return null;
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isPlaylist = Boolean(currentSong.youtubePlaylistId);
  const isYouTube =
    !hasOfflineAudio &&
    Boolean(currentSong.youtubeEmbedUrl || currentSong.youtubeVideoId || currentSong.youtubePlaylistId);

  const handleCardClick = () => {
    setFullPlayerTab('visualizer');
    setIsFullPlayerOpen(true);
  };

  const handleLyricsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenLyrics) {
      onOpenLyrics();
    } else {
      setFullPlayerTab('lyrics');
      setIsFullPlayerOpen(true);
    }
  };

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlay();
  };

  const handleNextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    next();
  };

  return (
    <div className="px-4 pb-2 pt-1 pointer-events-auto shrink-0 z-30">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        onClick={handleCardClick}
        className="group relative rounded-[24px] bg-[#0A0E1A]/95 light:bg-[#FFFFFF]/95 backdrop-blur-2xl border border-white/15 light:border-black/10 p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.7)] cursor-pointer overflow-hidden transition-all hover:border-[#8B5CF6]/50"
      >
        {/* Progress Bar Line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-white/10 light:bg-black/10">
          <div
            className="h-full bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#EC4899] transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* Pulsing Beat Orb / Album Art / YouTube Thumbnail */}
          <div className="relative shrink-0 flex items-center justify-center">
            {/* Ambient violet beat pulse ring */}
            <div
              className="absolute -inset-1 rounded-full bg-[#8B5CF6]/30 transition-transform duration-75 blur-sm"
              style={{
                transform: `scale(${1 + beatEnergy * 0.45})`,
                opacity: isPlaying ? 0.35 + beatEnergy * 0.65 : 0,
              }}
            />

            <div
              className="w-11 h-11 rounded-full overflow-hidden bg-white/[0.08] light:bg-black/[0.05] border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6] relative z-10 transition-transform duration-75"
              style={{
                transform: `scale(${1 + beatEnergy * 0.15})`,
              }}
            >
              {currentSong.thumbnailUrl ? (
                <img
                  src={currentSong.thumbnailUrl}
                  alt={currentSong.titleLatin}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music2 className="w-5 h-5 stroke-[2.2]" />
              )}
            </div>
          </div>

          {/* Song Info */}
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <h4 className="text-sm font-bold text-white light:text-slate-900 truncate font-bengali tracking-tight">
                {currentSong.titleBn || currentSong.titleLatin}
              </h4>
              {hasOfflineAudio ? (
                <span className="text-[9px] font-bold text-cyan-300 light:text-cyan-600 bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.2 rounded-md uppercase tracking-wider shrink-0">
                  Offline
                </span>
              ) : isPlaylist ? (
                <span className="text-[9px] font-bold text-violet-300 light:text-violet-700 bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.2 rounded-md uppercase tracking-wider shrink-0">
                  Playlist
                </span>
              ) : isYouTube ? (
                <span className="text-[9px] font-bold text-rose-300 light:text-rose-600 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.2 rounded-md uppercase tracking-wider shrink-0">
                  YouTube
                </span>
              ) : (
                <span className="text-[9px] font-semibold text-[#C4B5FD] bg-[#8B5CF6]/15 px-1.5 py-0.2 rounded-md shrink-0">
                  Tour Beat
                </span>
              )}

              {sleepTimer.isActive && (
                <span
                  className="text-[9px] font-mono font-bold text-purple-300 light:text-purple-700 bg-purple-500/20 border border-purple-500/40 px-1.5 py-0.2 rounded-md flex items-center gap-1 shrink-0 animate-pulse"
                  title={`Sleep Timer Active (${sleepTimer.initialLabel})`}
                >
                  <Timer className="w-2.5 h-2.5 stroke-[2.2]" />
                  <span>
                    {sleepTimer.type === 'time'
                      ? sleepTimer.secondsRemaining < 60
                        ? `${sleepTimer.secondsRemaining}s`
                        : `${Math.ceil(sleepTimer.secondsRemaining / 60)}m`
                      : `${sleepTimer.songsRemaining}s`}
                  </span>
                </span>
              )}
            </div>

            <p className="text-[11px] text-[#94A3B8] light:text-slate-500 truncate">
              {currentSong.titleLatin}
            </p>
          </div>

          {/* Controls cluster */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Lyrics Pill Button */}
            <button
              onClick={handleLyricsClick}
              className="px-2.5 py-1.5 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 hover:border-[#8B5CF6]/40 text-[#8B5CF6] flex items-center gap-1 text-[11px] font-semibold active:scale-90 transition-all shadow-sm"
              title="Read Lyrics"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Lyrics</span>
            </button>

            {/* Play/Pause Button with Vibrant Gradient */}
            <button
              onClick={handlePlayToggle}
              className="w-10 h-10 rounded-full btn-primary-gradient text-white flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.45)] active:scale-90 hover:scale-105 transition-all"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 ml-0.5 fill-current" />
              )}
            </button>

            {/* Next Track */}
            <button
              onClick={handleNextClick}
              className="w-9 h-9 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all"
              title="Next Track"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
