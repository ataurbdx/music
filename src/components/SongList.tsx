import React, { useState, useMemo } from 'react';
import { SongRecord, CategoryRecord, AppSettings, LyricsStatus } from '../types';
import { rankSearchResults } from '../lib/normalize';
import { useAudio } from '../context/AudioContext';
import { songRepository } from '../data/songRepository';
import { firebaseSync } from '../services/firebaseSync';
import { motion, AnimatePresence, Reorder, useDragControls } from 'motion/react';
import {
  Search,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Upload,
  Tags,
  CheckCircle2,
  AlertCircle,
  FileText,
  X,
  Music,
  ArrowUpDown,
  Play,
  Pause,
  Share2,
  Download,
  Trash2,
  Check,
  Youtube,
  Lock,
  User,
  Headphones,
  CheckSquare,
  Square,
  RefreshCw,
  CloudOff,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';

interface SongListProps {
  songs: SongRecord[];
  categories: CategoryRecord[];
  settings: AppSettings;
  onSelectSong: (song: SongRecord) => void;
  onAddSong: () => void;
  onOpenImport: () => void;
  onOpenPrepare: (song?: SongRecord) => void;
  onOpenAudioHub?: (song: SongRecord) => void;
  onOpenSettings: () => void;
  onOpenCategories: () => void;
  onOpenShare?: (selectedSongIds?: string[]) => void;
  onSongsUpdated?: () => void;
}

type SortOption = 'serial' | 'latin' | 'bengali' | 'updated';
type QuickFilterOption = 'all' | 'has_audio' | 'has_lyrics' | 'reviewed' | 'needs_audio' | 'needs_lyrics';

export function hasValidLyrics(lyricsBn?: string | null): boolean {
  if (!lyricsBn) return false;
  const trimmed = lyricsBn.trim().toLowerCase();
  if (!trimmed) return false;
  return !['false', 'true', 'null', 'undefined', 'n/a', 'none', '-'].includes(trimmed);
}

const SORT_LABELS: Record<SortOption, string> = {
  serial: 'Serial',
  latin: 'Title (A-Z)',
  bengali: 'বাংলা (ক-হ)',
  updated: 'Recent',
};

interface DraggableSongCatalogueRowProps {
  song: SongRecord;
  idx: number;
  total: number;
  catName: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragEnd: () => void;
}

const DraggableSongCatalogueRow: React.FC<DraggableSongCatalogueRowProps> = ({
  song,
  idx,
  total,
  catName,
  onMoveUp,
  onMoveDown,
  onDragEnd,
}) => {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      key={song.id}
      value={song}
      dragListener={false}
      dragControls={dragControls}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02, zIndex: 50, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)' }}
      className="frosted-surface rounded-[22px] px-3.5 py-2.5 min-h-[68px] cursor-pointer transition-colors flex items-center justify-between gap-3 group shadow-sm select-none relative"
    >
      {/* YouTube Style Drag Grip Handle */}
      <div
        className="cursor-grab active:cursor-grabbing p-1.5 -ml-1 text-slate-400 hover:text-violet-300 transition-colors touch-none shrink-0 flex items-center justify-center select-none"
        title="Drag to reorder"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragControls.start(e);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'none' }}
      >
        <GripVertical className="w-5 h-5 text-violet-400" />
      </div>

      <div className="w-10 h-10 rounded-[13px] bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-400 shrink-0 shadow-sm font-mono text-xs font-bold">
        {String(idx + 1).padStart(2, '0')}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="text-[14.5px] font-bold text-white font-bengali truncate leading-tight group-hover:text-violet-300 transition-colors">
          {song.titleBn || song.titleLatin}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate leading-none mt-1">
          <span className="font-bold uppercase tracking-wider text-[9px] text-[#C4B5FD] bg-[#8B5CF6]/15 px-1.5 h-[17px] inline-flex items-center rounded-md border border-[#8B5CF6]/25 shrink-0 leading-none">
            {catName}
          </span>
          {song.titleLatin && song.titleLatin !== song.titleBn && (
            <span className="truncate">{song.titleLatin}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          disabled={idx === 0}
          onClick={onMoveUp}
          className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-violet-500/40 disabled:opacity-20 active:scale-90 transition-all shadow-sm"
          title="Move Up"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          disabled={idx === total - 1}
          onClick={onMoveDown}
          className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-violet-500/40 disabled:opacity-20 active:scale-90 transition-all shadow-sm"
          title="Move Down"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </Reorder.Item>
  );
};

export const SongList: React.FC<SongListProps> = ({
  songs,
  categories,
  settings,
  onSelectSong,
  onAddSong,
  onOpenImport,
  onOpenPrepare,
  onOpenAudioHub,
  onOpenSettings,
  onOpenCategories,
  onOpenShare,
  onSongsUpdated,
}) => {
  const { playSong, openPlayerForSong, currentSong, isPlaying } = useAudio();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [quickFilter, setQuickFilter] = useState<QuickFilterOption>('has_lyrics');
  const [userFilter, setUserFilter] = useState<string>('all');

  // Multi-select batch mode
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [batchActionNotice, setBatchActionNotice] = useState<string>('');
  const [isBatchDeleteConfirmOpen, setIsBatchDeleteConfirmOpen] = useState<boolean>(false);
  const [isReorderMode, setIsReorderMode] = useState<boolean>(false);

  // Firebase Cloud Sync State (matches song-app)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'offline' | 'error'>(firebaseSync.getState());
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);

  React.useEffect(() => {
    return firebaseSync.subscribe((state) => {
      setSyncState(state);
    });
  }, []);

  const handleCloudSync = async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);

    const startTime = Date.now();
    try {
      const success = await firebaseSync.syncWithCloud();
      // Ensure at least 800ms spinning animation for clear visual feedback
      const elapsed = Date.now() - startTime;
      if (elapsed < 800) {
        await new Promise((r) => setTimeout(r, 800 - elapsed));
      }

      if (success && onSongsUpdated) {
        onSongsUpdated();
      }
    } catch (err: any) {
      console.warn('Sync failed:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const [sortBy, setSortBy] = useState<SortOption>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('tl_sort_by');
        if (saved && ['serial', 'latin', 'bengali', 'updated'].includes(saved)) {
          return saved as SortOption;
        }
      } catch {}
    }
    return 'serial';
  });

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // Quick stats
  const withAudioCount = useMemo(() => songs.filter((s) => s.hasAudio).length, [songs]);
  const withLyricsCount = useMemo(() => songs.filter((s) => hasValidLyrics(s.lyricsBn)).length, [songs]);
  const reviewedCount = useMemo(() => songs.filter((s) => s.lyricsStatus === 'reviewed').length, [songs]);
  const needsAudioCount = useMemo(() => songs.filter((s) => !s.hasAudio).length, [songs]);
  const needsLyricsCount = useMemo(() => songs.filter((s) => !hasValidLyrics(s.lyricsBn)).length, [songs]);

  // List of distinct community users who uploaded songs
  const communityUsers = useMemo(() => {
    const users = new Set<string>();
    songs.forEach((s) => {
      if (s.createdByUser) users.add(s.createdByUser);
    });
    return Array.from(users);
  }, [songs]);

  // Drawer & Accordion State
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);
  const [expandedSections, setExpandedSections] = useState<{
    status: boolean;
    genres: boolean;
    users: boolean;
  }>({
    status: true,
    genres: true,
    users: false,
  });

  const toggleSection = (section: 'status' | 'genres' | 'users') => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    songs.forEach((s) => {
      if (s.categoryId) {
        counts[s.categoryId] = (counts[s.categoryId] || 0) + 1;
      }
    });
    return counts;
  }, [songs]);

  const userCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    songs.forEach((s) => {
      if (s.createdByUser) {
        counts[s.createdByUser] = (counts[s.createdByUser] || 0) + 1;
      }
    });
    return counts;
  }, [songs]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (quickFilter !== 'has_lyrics') count++;
    if (selectedCategoryId !== 'all') count++;
    if (userFilter !== 'all') count++;
    return count;
  }, [quickFilter, selectedCategoryId, userFilter]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (quickFilter !== 'has_lyrics') {
      const qLabels: Record<QuickFilterOption, string> = {
        all: 'All',
        has_audio: 'With Audio',
        has_lyrics: 'With Lyrics',
        reviewed: 'Reviewed',
        needs_audio: 'Needs Audio',
        needs_lyrics: 'Needs Lyrics',
      };
      parts.push(qLabels[quickFilter]);
    }
    if (selectedCategoryId !== 'all') {
      const catName = categoryMap.get(selectedCategoryId) || 'Genre';
      parts.push(catName);
    }
    if (userFilter !== 'all') {
      parts.push(userFilter === 'my_songs' ? 'My Songs' : userFilter);
    }
    return parts.join(' • ');
  }, [quickFilter, selectedCategoryId, userFilter, categoryMap]);

  const resetAllFilters = () => {
    setQuickFilter('has_lyrics');
    setSelectedCategoryId('all');
    setUserFilter('all');
  };

  const cycleSort = () => {
    const order: SortOption[] = ['serial', 'latin', 'bengali', 'updated'];
    const nextIdx = (order.indexOf(sortBy) + 1) % order.length;
    const nextSort = order[nextIdx];
    setSortBy(nextSort);
    try {
      localStorage.setItem('tl_sort_by', nextSort);
    } catch {}
  };

  const filteredAndSortedSongs = useMemo(() => {
    let result = songs;

    // 1. Category Filter
    if (selectedCategoryId !== 'all') {
      result = result.filter((s) => s.categoryId === selectedCategoryId);
    }

    // 2. User Filter
    if (userFilter === 'my_songs') {
      const myName = settings.userName;
      result = result.filter((s) => s.createdByUser === myName);
    } else if (userFilter !== 'all') {
      result = result.filter((s) => s.createdByUser === userFilter);
    }

    // 3. Quick UX Filter
    if (quickFilter === 'has_audio') {
      result = result.filter((s) => s.hasAudio);
    } else if (quickFilter === 'has_lyrics') {
      result = result.filter((s) => hasValidLyrics(s.lyricsBn));
    } else if (quickFilter === 'reviewed') {
      result = result.filter((s) => s.lyricsStatus === 'reviewed');
    } else if (quickFilter === 'needs_audio') {
      result = result.filter((s) => !s.hasAudio);
    } else if (quickFilter === 'needs_lyrics') {
      result = result.filter((s) => !hasValidLyrics(s.lyricsBn));
    }

    // 4. Search query
    if (searchQuery.trim()) {
      return rankSearchResults(
        result,
        searchQuery,
        categoryMap,
        settings.fullTextLyricsSearch
      );
    }

    // 5. Sorting
    return [...result].sort((a, b) => {
      if (sortBy === 'serial') {
        if (a.importSerial != null && b.importSerial != null) {
          return a.importSerial - b.importSerial;
        }
        if (a.importSerial != null) return -1;
        if (b.importSerial != null) return 1;
        return a.titleLatin.localeCompare(b.titleLatin);
      }
      if (sortBy === 'latin') {
        return a.titleLatin.localeCompare(b.titleLatin);
      }
      if (sortBy === 'bengali') {
        return a.titleBn.localeCompare(b.titleBn, 'bn');
      }
      if (sortBy === 'updated') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      return 0;
    });
  }, [
    songs,
    selectedCategoryId,
    userFilter,
    quickFilter,
    searchQuery,
    sortBy,
    categoryMap,
    settings.fullTextLyricsSearch,
    settings.userName,
  ]);

  const [reorderCatalogueSongs, setReorderCatalogueSongs] = useState<SongRecord[]>([]);

  React.useEffect(() => {
    if (isReorderMode) {
      setReorderCatalogueSongs(filteredAndSortedSongs);
    }
  }, [isReorderMode, filteredAndSortedSongs]);

  const handleCatalogueDragEnd = async () => {
    await songRepository.reorderSongs(reorderCatalogueSongs.map((s) => s.id));
    if (onSongsUpdated) onSongsUpdated();
  };

  const moveSongInCatalogue = async (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= reorderCatalogueSongs.length) return;

    const reordered = [...reorderCatalogueSongs];
    const temp = reordered[fromIndex];
    reordered[fromIndex] = reordered[toIndex];
    reordered[toIndex] = temp;
    setReorderCatalogueSongs(reordered);

    await songRepository.reorderSongs(reordered.map((s) => s.id));
    if (onSongsUpdated) onSongsUpdated();
  };

  // Selection toggle
  const toggleSongSelection = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const next = new Set(selectedSongIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSongIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedSongIds.size === filteredAndSortedSongs.length) {
      setSelectedSongIds(new Set());
    } else {
      const all = new Set<string>();
      filteredAndSortedSongs.forEach((s) => all.add(s.id));
      setSelectedSongIds(all);
    }
  };

  const handleBatchDownloadAudio = async () => {
    if (selectedSongIds.size === 0) return;
    const queuedCount = await songRepository.batchEnqueueDownloads(Array.from(selectedSongIds));
    setBatchActionNotice(`Queued ${queuedCount} audio downloads into Audio Hub!`);
    setTimeout(() => setBatchActionNotice(''), 3500);
    setIsSelectMode(false);
    setSelectedSongIds(new Set());
  };

  const handleBatchDelete = () => {
    if (selectedSongIds.size === 0) return;
    setIsBatchDeleteConfirmOpen(true);
  };

  const confirmBatchDelete = async () => {
    setIsBatchDeleteConfirmOpen(false);
    for (const id of Array.from(selectedSongIds)) {
      await songRepository.deleteSong(id);
    }
    setIsSelectMode(false);
    setSelectedSongIds(new Set());
    if (onSongsUpdated) onSongsUpdated();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden select-none">
      {/* ========================================================
          FILTER OFFCANVAS / DRAWER (Opens from Left within Mobile Frame)
         ======================================================== */}
      <AnimatePresence>
        {isFilterDrawerOpen && (
          <div className="absolute inset-0 z-50 flex select-none overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFilterDrawerOpen(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            />

            {/* Sliding Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="relative w-[85%] max-w-[340px] h-full bg-[#080C16] border-r border-white/10 flex flex-col text-slate-100 shadow-2xl z-10 overflow-hidden"
              style={{
                paddingTop: 'calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))',
              }}
            >
              {/* Drawer Header */}
              <div className="px-4 pb-3 flex items-center justify-between border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">Filter Catalogue</h3>
                    <p className="text-[10px] text-slate-400">
                      {filteredAndSortedSongs.length} of {songs.length} songs showing
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="w-8 h-8 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Drawer Scrollable Body: Accordion Sections */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-none">
                {/* ========================================================
                    TOP ROW: SELECT & SERIAL (FLEX CONTENT BETWEEN)
                   ======================================================== */}
                <div className="flex items-center justify-between gap-1.5 p-1.5 rounded-[22px] bg-white/[0.04] border border-white/10 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectMode(!isSelectMode);
                      setSelectedSongIds(new Set());
                      setIsFilterDrawerOpen(false);
                    }}
                    className={`flex-1 py-2 px-2.5 rounded-[18px] text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                      isSelectMode
                        ? 'btn-primary-gradient text-white shadow-sm'
                        : 'frosted-surface text-slate-300 hover:text-white border-white/10 hover:border-violet-500/30'
                    }`}
                    title="Toggle multi-select mode"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-violet-400" />
                    <span>{isSelectMode ? 'Exit' : 'Select'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={cycleSort}
                    className="flex-1 py-2 px-2.5 rounded-[18px] frosted-surface border border-white/10 hover:border-violet-500/30 text-xs font-medium text-slate-300 hover:text-white flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    title="Cycle sort order"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-violet-400" />
                    <span className="truncate max-w-[65px]">{SORT_LABELS[sortBy]}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsReorderMode(!isReorderMode);
                      if (!isReorderMode) setSortBy('serial');
                      setIsFilterDrawerOpen(false);
                    }}
                    className={`flex-1 py-2 px-2.5 rounded-[18px] text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                      isReorderMode
                        ? 'bg-violet-500 text-white border-violet-500 shadow-sm'
                        : 'frosted-surface text-slate-300 hover:text-white border-white/10 hover:border-violet-500/30'
                    }`}
                    title="Reorder songs in catalogue"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-violet-400" />
                    <span>{isReorderMode ? 'Done' : 'Order'}</span>
                  </button>
                </div>

                {/* ========================================================
                    ACCORDION 1: ALL, WITH AUDIO, WITH LYRICS (STATUS)
                   ======================================================== */}
                <div className="rounded-[22px] border border-white/10 frosted-surface overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('status')}
                    className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-white/[0.03] transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-white">Status & Content</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {quickFilter !== 'all' && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-bold border border-violet-500/30">
                          Active
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                          expandedSections.status ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {expandedSections.status && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/5"
                      >
                        <div className="p-2 space-y-1.5">
                          {[
                            { id: 'all', label: 'All Songs', count: songs.length, icon: Music, color: 'text-violet-400' },
                            { id: 'has_audio', label: 'With Audio', count: withAudioCount, icon: Headphones, color: 'text-cyan-400' },
                            { id: 'has_lyrics', label: 'With Lyrics', count: withLyricsCount, icon: FileText, color: 'text-violet-400' },
                            { id: 'reviewed', label: 'Reviewed', count: reviewedCount, icon: CheckCircle2, color: 'text-emerald-400' },
                            { id: 'needs_audio', label: 'Needs Audio', count: needsAudioCount, icon: AlertCircle, color: 'text-amber-400' },
                            { id: 'needs_lyrics', label: 'Needs Lyrics', count: needsLyricsCount, icon: Sparkles, color: 'text-rose-400' },
                          ].map((item) => {
                            const isSelected = quickFilter === item.id;
                            const Icon = item.icon;
                            return (
                              <button
                                key={item.id}
                                onClick={() => setQuickFilter(item.id as QuickFilterOption)}
                                className={`w-full p-2.5 rounded-[16px] border flex items-center justify-between text-xs transition-all active:scale-[0.98] ${
                                  isSelected
                                    ? 'bg-violet-500/20 border-violet-500/50 text-white font-bold shadow-sm'
                                    : 'border-transparent hover:bg-white/5 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-violet-300' : item.color}`} />
                                  <span className="truncate">{item.label}</span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isSelected
                                      ? 'btn-primary-gradient text-white shadow-sm'
                                      : 'bg-white/10 text-slate-400'
                                  }`}
                                >
                                  {item.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ========================================================
                    ACCORDION 2: ALL GENRES / CATEGORIES
                   ======================================================== */}
                <div className="rounded-[22px] border border-white/10 frosted-surface overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection('genres')}
                    className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-white/[0.03] transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <Tags className="w-4 h-4 text-violet-400" />
                      <span className="text-xs font-bold text-white">Genres & Categories</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedCategoryId !== 'all' && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-bold border border-violet-500/30">
                          {categoryMap.get(selectedCategoryId) || 'Genre'}
                        </span>
                      )}
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                          expandedSections.genres ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  <AnimatePresence initial={false}>
                    {expandedSections.genres && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden border-t border-white/5"
                      >
                        <div className="p-2 space-y-1.5">
                          {/* All Genres item */}
                          <button
                            onClick={() => setSelectedCategoryId('all')}
                            className={`w-full p-2.5 rounded-[16px] border flex items-center justify-between text-xs transition-all active:scale-[0.98] ${
                              selectedCategoryId === 'all'
                                ? 'bg-violet-500/20 border-violet-500/50 text-white font-bold shadow-sm'
                                : 'border-transparent hover:bg-white/5 text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Tags className={`w-3.5 h-3.5 shrink-0 ${selectedCategoryId === 'all' ? 'text-violet-300' : 'text-slate-400'}`} />
                              <span className="truncate">All Genres</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                selectedCategoryId === 'all'
                                  ? 'btn-primary-gradient text-white shadow-sm'
                                  : 'bg-white/10 text-slate-400'
                              }`}
                            >
                              {songs.length}
                            </span>
                          </button>

                          {/* Individual Category Items */}
                          {categories.map((c) => {
                            const isSelected = selectedCategoryId === c.id;
                            const count = categoryCounts[c.id] || 0;
                            return (
                              <button
                                key={c.id}
                                onClick={() => setSelectedCategoryId(c.id)}
                                className={`w-full p-2.5 rounded-[16px] border flex items-center justify-between text-xs transition-all active:scale-[0.98] ${
                                  isSelected
                                    ? 'bg-violet-500/20 border-violet-500/50 text-white font-bold shadow-sm'
                                    : 'border-transparent hover:bg-white/5 text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
                                  <span className="truncate">{c.name}</span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isSelected
                                      ? 'btn-primary-gradient text-white shadow-sm'
                                      : 'bg-white/10 text-slate-400'
                                  }`}
                                >
                                  {count}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ========================================================
                    ACCORDION 3: USER / CONTRIBUTOR
                   ======================================================== */}
                {communityUsers.length > 0 && (
                  <div className="rounded-[22px] border border-white/10 frosted-surface overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSection('users')}
                      className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-white/[0.03] transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-violet-400" />
                        <span className="text-xs font-bold text-white">Contributors</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {userFilter !== 'all' && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-bold border border-violet-500/30 truncate max-w-[90px]">
                            {userFilter === 'my_songs' ? 'My Songs' : userFilter}
                          </span>
                        )}
                        <ChevronDown
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                            expandedSections.users ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {expandedSections.users && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden border-t border-white/5"
                        >
                          <div className="p-2 space-y-1.5">
                            {/* All Users */}
                            <button
                              onClick={() => setUserFilter('all')}
                              className={`w-full p-2.5 rounded-[16px] border flex items-center justify-between text-xs transition-all active:scale-[0.98] ${
                                userFilter === 'all'
                                  ? 'bg-violet-500/20 border-violet-500/50 text-white font-bold shadow-sm'
                                  : 'border-transparent hover:bg-white/5 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <User className={`w-3.5 h-3.5 shrink-0 ${userFilter === 'all' ? 'text-violet-300' : 'text-slate-400'}`} />
                                <span className="truncate">All Contributors</span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  userFilter === 'all'
                                    ? 'btn-primary-gradient text-white shadow-sm'
                                    : 'bg-white/10 text-slate-400'
                                }`}
                              >
                                {songs.length}
                              </span>
                            </button>

                            {/* My Songs */}
                            <button
                              onClick={() => setUserFilter('my_songs')}
                              className={`w-full p-2.5 rounded-[16px] border flex items-center justify-between text-xs transition-all active:scale-[0.98] ${
                                userFilter === 'my_songs'
                                  ? 'bg-violet-500/20 border-violet-500/50 text-white font-bold shadow-sm'
                                  : 'border-transparent hover:bg-white/5 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Sparkles className={`w-3.5 h-3.5 shrink-0 ${userFilter === 'my_songs' ? 'text-violet-300' : 'text-amber-400'}`} />
                                <span className="truncate">My Songs ({settings.userName || 'Local'})</span>
                              </div>
                            </button>

                            {/* Community Users */}
                            {communityUsers.map((u) => {
                              const isSelected = userFilter === u;
                              const count = userCounts[u] || 0;
                              return (
                                <button
                                  key={u}
                                  onClick={() => setUserFilter(u)}
                                  className={`w-full p-2.5 rounded-[16px] border flex items-center justify-between text-xs transition-all active:scale-[0.98] ${
                                    isSelected
                                      ? 'bg-violet-500/20 border-violet-500/50 text-white font-bold shadow-sm'
                                      : 'border-transparent hover:bg-white/5 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <User className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-violet-300' : 'text-slate-400'}`} />
                                    <span className="truncate">{u}</span>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isSelected
                                        ? 'btn-primary-gradient text-white shadow-sm'
                                        : 'bg-white/10 text-slate-400'
                                    }`}
                                  >
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Drawer Footer: Two buttons side by side (Reset & Show Results) */}
              <div
                className="p-3.5 border-t border-white/10 frosted-surface shrink-0 flex items-center gap-2.5"
                style={{
                  paddingBottom: 'calc(14px + max(env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px)))',
                }}
              >
                <button
                  type="button"
                  onClick={resetAllFilters}
                  disabled={activeFilterCount === 0}
                  className={`py-3 px-4 rounded-full border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-95 shrink-0 ${
                    activeFilterCount > 0
                      ? 'frosted-surface border-white/10 text-slate-300 hover:text-white hover:border-rose-500/40 hover:bg-rose-500/10'
                      : 'opacity-40 border-white/5 text-slate-500 cursor-not-allowed'
                  }`}
                  title="Reset all filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsFilterDrawerOpen(false)}
                  className="flex-1 py-3 px-4 rounded-full btn-primary-gradient text-white font-bold text-xs shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Show {filteredAndSortedSongs.length} Songs</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Top Hero App Bar */}
      <header
        className="px-3.5 pb-2.5 shrink-0 space-y-2 z-10 frosted-surface border-b border-white/10 light:border-black/10"
        style={{
          paddingTop: 'calc(10px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Brand & Stats (Clean single-line subtitle, no crowding) */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full btn-primary-gradient p-[1.5px] shadow-[0_0_15px_rgba(139,92,246,0.35)] shrink-0">
              <div className="w-full h-full rounded-full bg-[#080C16] light:bg-white flex items-center justify-center text-white light:text-violet-600">
                <Music className="w-4 h-4" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold tracking-tight text-white light:text-slate-900 leading-tight truncate">
                Tour Lyrics
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] light:text-slate-500 truncate mt-0.5">
                <span>{songs.length} songs</span>
                <span>•</span>
                <span className="truncate max-w-[130px]" title={settings.userName || 'Offline Ready'}>
                  {settings.userName || 'Offline Ready'}
                </span>
              </div>
            </div>
          </div>

          {/* Clean Action Cluster */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Real-time Cloud Sync Button (matches song-app) */}
            <button
              onClick={handleCloudSync}
              disabled={isManualSyncing || syncState === 'syncing'}
              className={`w-8.5 h-8.5 rounded-full frosted-surface border flex items-center justify-center active:scale-90 transition-all shadow-sm disabled:opacity-60 ${
                syncState === 'error'
                  ? 'border-rose-500/40 hover:border-rose-500/60'
                  : syncState === 'offline'
                  ? 'border-amber-500/40 hover:border-amber-500/60'
                  : 'border-white/10 light:border-black/10 hover:border-emerald-500/40'
              }`}
              title={
                isManualSyncing || syncState === 'syncing'
                  ? 'Syncing with cloud...'
                  : syncState === 'offline'
                  ? 'Offline'
                  : syncState === 'error'
                  ? `Sync error: ${firebaseSync.getLastError() || 'Failed'}`
                  : 'Sync with Cloud (Firebase)'
              }
              aria-label="Cloud Sync"
            >
              {isManualSyncing || syncState === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 text-violet-400 animate-spin" />
              ) : syncState === 'offline' ? (
                <CloudOff className="w-3.5 h-3.5 text-amber-400" />
              ) : syncState === 'error' ? (
                <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>

            {/* Tour Drop / Share trigger */}
            {onOpenShare && (
              <button
                onClick={() => onOpenShare(Array.from(selectedSongIds))}
                className="w-8.5 h-8.5 rounded-full frosted-surface border border-white/10 light:border-black/10 hover:border-violet-500/40 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all shadow-sm"
                title="Tour Drop & Share Catalogue"
              >
                <Share2 className="w-3.5 h-3.5 text-violet-400" />
              </button>
            )}

            {/* Import CSV / Playlist / Device Music */}
            <button
              onClick={onOpenImport}
              className="w-8.5 h-8.5 rounded-full frosted-surface border border-white/10 light:border-black/10 hover:border-white/20 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all shadow-sm"
              title="Scan Device Music, YouTube, or CSV"
              aria-label="Scan and Import"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>

            {/* App Settings Icon */}
            <button
              onClick={onOpenSettings}
              className="w-8.5 h-8.5 rounded-full frosted-surface border border-white/10 light:border-black/10 hover:border-violet-500/40 flex items-center justify-center text-white light:text-slate-800 hover:text-violet-300 light:hover:text-violet-600 active:scale-90 transition-all shadow-sm"
              title="Settings"
              aria-label="Settings"
            >
              <SettingsIcon className="w-4 h-4 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* Search Bar Pill with Filter Drawer Trigger Button at the beginning */}
        <div className="relative">
          <div className="h-11 rounded-full frosted-surface border border-white/10 pl-1.5 pr-3 flex items-center gap-2.5 transition-all focus-within:border-violet-500/60 focus-within:shadow-[0_0_20px_rgba(139,92,246,0.2)] shadow-sm">
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(true)}
              className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 active:scale-90 ${
                activeFilterCount > 0
                  ? 'btn-primary-gradient text-white shadow-[0_0_12px_rgba(139,92,246,0.5)]'
                  : 'frosted-surface text-slate-300 hover:text-white border border-white/10 hover:border-violet-500/40'
              }`}
              title="Open Filter Drawer"
              aria-label="Filters"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center border border-[#080C16]">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in Bengali or English (e.g. মিলন / Milon)..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-400 focus:outline-none px-0.5"
            />

            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="w-6 h-6 rounded-full frosted-surface flex items-center justify-center text-[#94A3B8] hover:text-white active:scale-90 transition-all shrink-0"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <Search className="w-4 h-4 text-slate-500 shrink-0 pointer-events-none mr-0.5" />
            )}
          </div>
        </div>
      </header>

      {/* Batch notice banner */}
      {batchActionNotice && (
        <div className="px-4 py-2 bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 text-xs text-center font-semibold animate-in fade-in">
          {batchActionNotice}
        </div>
      )}

      {/* Main Song List Scrollable Area */}
      <main
        className={`flex-1 overflow-y-auto px-4 pt-4 space-y-2.5 overscroll-contain transition-all ${
          isSelectMode && selectedSongIds.size > 0 ? 'pb-20' : 'pb-4'
        }`}
      >
        {/* Multi-select Header Bar */}
        {isSelectMode && (
          <div className="p-2.5 rounded-[18px] frosted-card border border-violet-500/40 flex items-center justify-between mb-2 text-xs">
            <button
              onClick={toggleSelectAll}
              className="text-violet-400 font-semibold hover:underline flex items-center gap-1.5"
            >
              {selectedSongIds.size === filteredAndSortedSongs.length ? (
                <CheckSquare className="w-4 h-4 text-violet-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>
                {selectedSongIds.size === filteredAndSortedSongs.length ? 'Deselect All' : 'Select All'}
              </span>
            </button>
            <span className="font-bold text-white">
              {selectedSongIds.size} of {filteredAndSortedSongs.length} selected
            </span>
          </div>
        )}

        {/* Reorder Mode or Normal Song List */}
        {isReorderMode ? (
          <div className="space-y-2">
            <div className="p-2.5 rounded-[18px] bg-violet-500/15 border border-violet-500/35 flex items-center justify-between mb-2 text-xs text-violet-200 shadow-md">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-violet-300">Reorder Mode:</span>
                <span className="truncate">Drag ↕ or use ▲ / ▼ to set sequence</span>
              </div>
              <button
                onClick={() => setIsReorderMode(false)}
                className="px-3 py-1 rounded-full btn-primary-gradient text-[11px] font-bold text-white shadow-sm shrink-0 active:scale-95 transition-all"
              >
                Done
              </button>
            </div>

            <Reorder.Group
              axis="y"
              values={reorderCatalogueSongs}
              onReorder={setReorderCatalogueSongs}
              className="space-y-2.5 list-none p-0 m-0"
            >
              {reorderCatalogueSongs.map((song, idx) => (
                <DraggableSongCatalogueRow
                  key={song.id}
                  song={song}
                  idx={idx}
                  total={reorderCatalogueSongs.length}
                  catName={categoryMap.get(song.categoryId) || 'Other'}
                  onMoveUp={() => moveSongInCatalogue(idx, 'up')}
                  onMoveDown={() => moveSongInCatalogue(idx, 'down')}
                  onDragEnd={handleCatalogueDragEnd}
                />
              ))}
            </Reorder.Group>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredAndSortedSongs.length > 0 ? (
              filteredAndSortedSongs.map((song, idx) => {
                const catName = categoryMap.get(song.categoryId) || 'Other';
                const isCurrentlyPlaying = currentSong?.id === song.id && isPlaying;
                const isSelected = selectedSongIds.has(song.id);

                return (
                  <motion.div
                    key={song.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.2) }}
                    onClick={() => {
                      if (isSelectMode) {
                        toggleSongSelection(song.id);
                      } else {
                        onSelectSong(song);
                      }
                    }}
                    className={`frosted-surface rounded-[22px] px-3.5 py-2.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between gap-3 group shadow-sm ${
                      isSelected ? 'ring-2 ring-violet-500 bg-violet-500/10' : ''
                    }`}
                  >
                    {/* Select Checkbox if in multi-select mode, else Left Track Artwork */}
                    {isSelectMode ? (
                      <div className="w-11 h-11 flex items-center justify-center shrink-0">
                        <div
                          onClick={(e) => toggleSongSelection(song.id, e)}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center ${
                            isSelected
                              ? 'btn-primary-gradient text-white border-transparent'
                              : 'border-white/20'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>
                    ) : (
                      <div className="w-11 h-11 rounded-[14px] bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-400 shrink-0 shadow-sm">
                        <Music className="w-5 h-5" />
                      </div>
                    )}

                    {/* Center Track Info: perfectly contained within icon height */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      {/* Primary Bengali / English Title */}
                      <h3 className="text-[14.5px] font-bold text-white font-bengali truncate leading-tight group-hover:text-violet-300 transition-colors">
                        {song.titleBn || song.titleLatin}
                      </h3>

                      {/* Unified Metadata Line: Category • Latin • Contributor */}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate leading-none mt-1">
                        <span className="font-bold uppercase tracking-wider text-[9px] text-[#C4B5FD] bg-[#8B5CF6]/15 px-1.5 h-[17px] inline-flex items-center rounded-md border border-[#8B5CF6]/25 shrink-0 leading-none">
                          {catName}
                        </span>

                        {song.titleLatin && song.titleLatin !== song.titleBn && (
                          <span className="truncate">{song.titleLatin}</span>
                        )}

                        {song.createdByUser && (
                          <span className="text-slate-400 font-medium truncate flex items-center gap-1 shrink-0">
                            <span className="opacity-40">•</span>
                            <span>{song.createdByUser}</span>
                          </span>
                        )}

                        {song.isPrivate && (
                          <span className="text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1 py-0.2 rounded text-[9px] flex items-center gap-0.5 shrink-0">
                            <Lock className="w-2.5 h-2.5" />
                          </span>
                        )}

                        {song.importSerial != null && (
                          <span className="text-[10px] font-mono text-[#64748B] ml-auto shrink-0">
                            #{song.importSerial}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Perfect Center Glass Action Circle */}
                    <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-violet-300 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-colors shrink-0">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div className="my-4 py-8 px-5 text-center text-[#94A3B8] frosted-card rounded-[26px] border border-white/10 space-y-3.5 shadow-md">
                <div className="w-13 h-13 mx-auto rounded-2xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center text-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.15)]">
                  <FileText className="w-6 h-6 opacity-80" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm sm:text-base font-bold text-white light:text-slate-900">No Matching Songs</h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                    Try clearing search filters, scan device music, import from YouTube, or add manually.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1.5">
                  <button
                    onClick={onOpenImport}
                    className="btn-primary-gradient px-4 py-2 rounded-full text-xs font-bold text-white shadow-md active:scale-95 inline-flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Scan & Import Music</span>
                  </button>
                  <button
                    onClick={onAddSong}
                    className="frosted-surface border border-white/15 px-4 py-2 rounded-full text-xs font-semibold text-white active:scale-95 inline-flex items-center gap-1.5 hover:bg-white/10"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Add Single Song</span>
                  </button>
                </div>
              </div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Floating Action Bar during Multi-Select Mode */}
      {isSelectMode && selectedSongIds.size > 0 && (
        <div className="absolute bottom-18 inset-x-4 z-30 p-3 rounded-[26px] frosted-card border border-violet-500/50 shadow-2xl flex items-center justify-between gap-2 animate-in slide-in-from-bottom duration-200">
          <div className="text-xs font-bold text-white pl-2">
            {selectedSongIds.size} Selected
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleBatchDownloadAudio}
              className="px-3.5 py-2 rounded-full btn-primary-gradient text-[11px] font-bold text-white flex items-center gap-1.5 shadow-md active:scale-95"
              title="Batch Download Audio from YouTube"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Queue Download</span>
            </button>

            {onOpenShare && (
              <button
                onClick={() => onOpenShare(Array.from(selectedSongIds))}
                className="px-3 py-2 rounded-full frosted-surface border border-white/10 text-[11px] font-semibold text-white flex items-center gap-1 active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5 text-violet-400" />
                <span>Share</span>
              </button>
            )}

            <button
              onClick={handleBatchDelete}
              className="w-8 h-8 rounded-full frosted-surface border border-white/10 text-slate-400 hover:text-rose-400 flex items-center justify-center active:scale-90"
              title="Delete Selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      {/* In-App Batch Delete Confirmation Modal (Replaces native browser popup) */}
      {isBatchDeleteConfirmOpen && (
        <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-5 animate-in fade-in duration-150">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-xs rounded-[28px] frosted-card border border-rose-500/30 p-5 text-center shadow-2xl space-y-3.5"
          >
            <div className="w-12 h-12 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400 shadow-sm">
              <Trash2 className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Delete Selected Songs?</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Are you sure you want to delete {selectedSongIds.size} songs from your catalogue? This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setIsBatchDeleteConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-full frosted-surface border border-white/10 text-xs font-semibold text-slate-300 hover:text-white active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBatchDelete}
                className="flex-1 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/30 active:scale-95 transition-all"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
