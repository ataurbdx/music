import React, { useState, useEffect, useMemo } from 'react';
import { SongRecord, CategoryRecord } from '../types';
import { songRepository } from '../data/songRepository';
import { useAudio } from '../context/AudioContext';
import { motion } from 'motion/react';
import {
  Flame,
  Clock,
  ShieldCheck,
  HardDrive,
  Trophy,
  Play,
  Sparkles,
} from 'lucide-react';

interface DashboardViewProps {
  songs: SongRecord[];
  categories: CategoryRecord[];
  onSelectSongToRead: (song: SongRecord) => void;
  onOpenAudioHub: () => void;
  onOpenPrepare: (song?: SongRecord) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  songs,
  categories,
  onSelectSongToRead,
  onOpenAudioHub,
  onOpenPrepare,
}) => {
  const { playSong } = useAudio();
  const [storageStats, setStorageStats] = useState<{ count: number; totalSizeBytes: number }>({
    count: 0,
    totalSizeBytes: 0,
  });
  const [healthFilter, setHealthFilter] = useState<'all' | 'has_audio' | 'missing_audio' | 'missing_lyrics'>('all');

  useEffect(() => {
    songRepository.getAudioStorageStats().then((res) => setStorageStats(res));
  }, [songs]);

  // Calculations
  const totalPlays = useMemo(() => {
    return songs.reduce((acc, s) => acc + (s.playCount || 0), 0);
  }, [songs]);

  const totalListenTimeSec = useMemo(() => {
    return songs.reduce((acc, s) => acc + (s.totalListenTimeSec || 0), 0);
  }, [songs]);

  const formatTotalTime = (totalSec: number) => {
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
  };

  const reviewedCount = useMemo(() => songs.filter((s) => s.lyricsStatus === 'reviewed').length, [songs]);
  const audioCount = useMemo(() => songs.filter((s) => s.hasAudio).length, [songs]);
  const missingLyricsCount = useMemo(() => songs.filter((s) => s.lyricsStatus === 'missing').length, [songs]);

  // Offline Readiness Score: combination of reviewed lyrics and offline audio availability
  const readinessScore = useMemo(() => {
    if (songs.length === 0) return 0;
    const lyricsWeight = (reviewedCount / songs.length) * 50;
    const audioWeight = (audioCount / songs.length) * 50;
    return Math.min(100, Math.round(lyricsWeight + audioWeight));
  }, [songs, reviewedCount, audioCount]);

  // Top Played Tracks
  const topTracks = useMemo(() => {
    return [...songs]
      .filter((s) => (s.playCount || 0) > 0)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 5);
  }, [songs]);

  // Category map
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // Category distribution
  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    songs.forEach((s) => {
      const catName = categoryMap.get(s.categoryId) || 'Other';
      counts[catName] = (counts[catName] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [songs, categoryMap]);

  // Filtered health songs
  const filteredHealthSongs = useMemo(() => {
    if (healthFilter === 'has_audio') return songs.filter((s) => s.hasAudio);
    if (healthFilter === 'missing_audio') return songs.filter((s) => !s.hasAudio);
    if (healthFilter === 'missing_lyrics') return songs.filter((s) => s.lyricsStatus === 'missing');
    return songs;
  }, [songs, healthFilter]);

  return (
    <div
      className="flex-1 overflow-y-auto px-5 pb-28 space-y-6 scrollbar-none select-none"
      style={{
        paddingTop: 'calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
      }}
    >
      {/* Title Header */}
      <div>
        <h2 className="text-xl font-bold text-white dark:text-white light:text-slate-900 tracking-tight">
          Tour Analytics & Readiness
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 mt-0.5">
          Real-time offline readiness, play activity & storage
        </p>
      </div>

      {/* Bento Grid 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        {/* Card 1: Total Plays */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-[26px] frosted-card border border-white/10 dark:border-white/10 light:border-slate-200 flex flex-col justify-between shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Plays
            </span>
            <div className="w-8 h-8 rounded-full bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white dark:text-white light:text-slate-900">{totalPlays}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Across {songs.length} tour songs</div>
          </div>
        </motion.div>

        {/* Card 2: Listen Time */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="p-4 rounded-[26px] frosted-card border border-white/10 dark:border-white/10 light:border-slate-200 flex flex-col justify-between shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Listen Time
            </span>
            <div className="w-8 h-8 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white dark:text-white light:text-slate-900">
              {formatTotalTime(totalListenTimeSec)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Tour performance time</div>
          </div>
        </motion.div>

        {/* Card 3: Offline Readiness Score */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-4 rounded-[26px] frosted-card border border-violet-500/30 flex flex-col justify-between shadow-md relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-violet-400 uppercase tracking-wider">
              Offline Score
            </span>
            <div className="w-8 h-8 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-pink-400">
              {readinessScore}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {reviewedCount} checked • {audioCount} audio
            </div>
          </div>
        </motion.div>

        {/* Card 4: Audio Cache Storage */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 rounded-[26px] frosted-card border border-white/10 dark:border-white/10 light:border-slate-200 flex flex-col justify-between shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Audio Storage
            </span>
            <div className="w-8 h-8 rounded-full bg-cyan-500/15 text-cyan-400 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-white dark:text-white light:text-slate-900">
              {(storageStats.totalSizeBytes / (1024 * 1024)).toFixed(1)}{' '}
              <span className="text-xs font-normal text-slate-400">MB</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {storageStats.count} files cached
            </div>
          </div>
        </motion.div>
      </div>

      {/* Top Played Leaderboard */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900 tracking-tight">
              Most Played Tracks
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Tour Leaderboard</span>
        </div>

        {topTracks.length === 0 ? (
          <div className="p-5 rounded-[24px] frosted-card border border-white/10 dark:border-white/10 light:border-slate-200 text-center text-slate-400">
            <p className="text-xs">No song has been played for &gt;15s yet.</p>
            <p className="text-[10px] mt-1">Play any track in the player to track tour stats!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {topTracks.map((song, idx) => (
              <div
                key={song.id}
                onClick={() => onSelectSongToRead(song)}
                className="p-3 rounded-[22px] frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 hover:border-violet-500/40 flex items-center justify-between gap-3 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                      idx === 0
                        ? 'bg-amber-400 text-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.5)]'
                        : idx === 1
                        ? 'bg-slate-300 text-slate-950'
                        : idx === 2
                        ? 'bg-amber-700 text-white'
                        : 'bg-white/10 text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-white dark:text-white light:text-slate-900 truncate font-bengali">
                      {song.titleBn || song.titleLatin}
                    </h4>
                    <p className="text-[10px] text-slate-400 truncate">
                      {song.playCount} plays • {formatTotalTime(song.totalListenTimeSec || 0)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playSong(song);
                  }}
                  className="w-8 h-8 rounded-full btn-primary-gradient text-white flex items-center justify-center shrink-0 active:scale-90 shadow-sm"
                  title="Play"
                >
                  <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Category Breakdown Progress */}
      <div className="p-4 rounded-[26px] frosted-card border border-white/10 dark:border-white/10 light:border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white dark:text-white light:text-slate-900">
            Genre & Category Distribution
          </span>
          <span className="text-[11px] text-slate-400">{categories.length} categories</span>
        </div>

        {/* Stacked multi-segment bar */}
        <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden flex">
          {categoryStats.map(([name, count], i) => {
            const pct = (count / songs.length) * 100;
            const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B', '#10B981'];
            return (
              <div
                key={name}
                style={{
                  width: `${pct}%`,
                  backgroundColor: colors[i % colors.length],
                }}
                title={`${name}: ${count}`}
              />
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {categoryStats.slice(0, 5).map(([name, count], i) => {
            const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#06B6D4', '#F59E0B'];
            return (
              <div key={name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span>{name} ({count})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Health Filter & Song Inspector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white dark:text-white light:text-slate-900 tracking-tight">
            Library Health Inspector
          </h3>
          <button
            onClick={onOpenAudioHub}
            className="text-xs text-violet-400 font-semibold hover:underline"
          >
            Manage Audio
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'all', label: 'All', count: songs.length },
            { id: 'has_audio', label: 'Has Audio', count: audioCount },
            { id: 'missing_audio', label: 'Missing Audio', count: songs.length - audioCount },
            { id: 'missing_lyrics', label: 'Missing Lyrics', count: missingLyricsCount },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setHealthFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                healthFilter === f.id
                  ? 'btn-primary-gradient text-white border-transparent shadow-sm'
                  : 'frosted-surface border-white/10 dark:border-white/10 light:border-slate-200 text-slate-400 hover:text-white'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* Songs List */}
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-none pr-1">
          {filteredHealthSongs.slice(0, 15).map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectSongToRead(s)}
              className="p-3 rounded-[20px] frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 flex items-center justify-between gap-3 cursor-pointer hover:border-violet-500/30 transition-all"
            >
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-white dark:text-white light:text-slate-900 truncate font-bengali">
                  {s.titleBn || s.titleLatin}
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-slate-400 truncate">{s.titleLatin}</span>
                  {s.hasAudio ? (
                    <span className="text-[9px] font-bold text-emerald-400">Audio Ready</span>
                  ) : (
                    <span className="text-[9px] text-slate-400">No Audio</span>
                  )}
                </div>
              </div>

              {!s.lyricsBn ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenPrepare(s);
                  }}
                  className="px-2.5 py-1 rounded-full bg-violet-500/15 border border-violet-500/40 text-[10px] font-semibold text-violet-300"
                >
                  Fetch
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    playSong(s);
                  }}
                  className="w-7 h-7 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-violet-400"
                >
                  <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
