import React, { useState, useEffect, useMemo } from 'react';
import { PlaylistRecord, SongRecord, CategoryRecord } from '../types';
import { songRepository } from '../data/songRepository';
import { useAudio } from '../context/AudioContext';
import { motion } from 'motion/react';
import {
  X,
  ListMusic,
  Plus,
  Play,
  Pause,
  Trash2,
  ChevronRight,
  Music2,
  Check,
  BookOpen,
  Volume2,
  ArrowLeft,
  Edit2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';

interface PlaylistManagerModalProps {
  allSongs: SongRecord[];
  categories?: CategoryRecord[];
  initialPlaylistId?: string | null;
  onClose: () => void;
  onSelectSongToRead?: (song: SongRecord, playlistId?: string) => void;
}

const PRESET_COLORS = ['#8B5CF6', '#6366F1', '#EC4899', '#06B6D4', '#F59E0B'];

export const PlaylistManagerModal: React.FC<PlaylistManagerModalProps> = ({
  allSongs,
  categories = [],
  initialPlaylistId,
  onClose,
  onSelectSongToRead,
}) => {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistRecord | null>(null);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return 'OTHER';
    if (categoryMap.has(categoryId)) {
      return categoryMap.get(categoryId)!.toUpperCase();
    }
    // Clean up if it has 'cat_' prefix e.g. cat_folk -> FOLK
    const cleaned = categoryId.replace(/^cat_/i, '');
    return (cleaned || 'OTHER').toUpperCase();
  };

  // Creation form state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('#8B5CF6');

  // Edit playlist details state
  const [isEditingPlaylist, setIsEditingPlaylist] = useState<boolean>(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('#8B5CF6');
  const [isReorderMode, setIsReorderMode] = useState<boolean>(false);

  // Song selection for current playlist
  const [isAddingSongs, setIsAddingSongs] = useState<boolean>(false);
  const [songSearch, setSongSearch] = useState<string>('');

  useEffect(() => {
    loadPlaylists();
  }, [initialPlaylistId]);

  const loadPlaylists = async () => {
    const list = await songRepository.getAllPlaylists();
    setPlaylists(list);

    if (initialPlaylistId) {
      const found = list.find((p) => p.id === initialPlaylistId);
      if (found) {
        setSelectedPlaylist(found);
        return;
      }
    }

    // If initial empty, seed a starter playlist
    if (list.length === 0 && allSongs.length > 0) {
      const sample = await songRepository.createPlaylist(
        'Tour Day 1 - Acoustic Night',
        'Singalong favourites for tour bus & campfire adda',
        allSongs.slice(0, 3).map((s) => s.id),
        '#8B5CF6'
      );
      setPlaylists([sample]);
      if (initialPlaylistId === sample.id) {
        setSelectedPlaylist(sample);
      }
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newTitle.trim()) return;
    const created = await songRepository.createPlaylist(
      newTitle.trim(),
      newDesc.trim(),
      [],
      selectedColor
    );
    setNewTitle('');
    setNewDesc('');
    setIsCreating(false);
    await loadPlaylists();
    setSelectedPlaylist(created);
  };

  const handleOpenEditPlaylist = (pl: PlaylistRecord) => {
    setEditingPlaylistId(pl.id);
    setEditTitle(pl.name);
    setEditDesc(pl.description || '');
    setEditColor(pl.coverColor || '#8B5CF6');
    setIsEditingPlaylist(true);
  };

  const handleSaveEditPlaylist = async () => {
    if (!editingPlaylistId || !editTitle.trim()) return;
    const updated = await songRepository.updatePlaylist(editingPlaylistId, {
      name: editTitle.trim(),
      description: editDesc.trim(),
      coverColor: editColor,
    });
    setIsEditingPlaylist(false);
    setEditingPlaylistId(null);
    if (selectedPlaylist && selectedPlaylist.id === editingPlaylistId) {
      setSelectedPlaylist(updated);
    }
    await loadPlaylists();
  };

  const moveSong = async (fromIndex: number, direction: 'up' | 'down') => {
    if (!selectedPlaylist) return;
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= selectedPlaylist.songIds.length) return;

    const newSongIds = [...selectedPlaylist.songIds];
    const temp = newSongIds[fromIndex];
    newSongIds[fromIndex] = newSongIds[toIndex];
    newSongIds[toIndex] = temp;

    const updated = await songRepository.updatePlaylist(selectedPlaylist.id, {
      songIds: newSongIds,
    });
    setSelectedPlaylist(updated);
    await loadPlaylists();
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeletePlaylist = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDeletePlaylist = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    await songRepository.deletePlaylist(id);
    setSelectedPlaylist(null);
    await loadPlaylists();
  };

  const handlePlayEntireSetlist = (pl: PlaylistRecord) => {
    const pSongs = pl.songIds
      .map((id) => allSongs.find((s) => s.id === id))
      .filter(Boolean) as SongRecord[];

    if (pSongs.length === 0) {
      alert('This playlist is empty. Add songs first!');
      return;
    }

    playSong(pSongs[0], pSongs);
    // Keep playlist open; if triggered from all playlists overview, open this playlist detail
    if (!selectedPlaylist || selectedPlaylist.id !== pl.id) {
      setSelectedPlaylist(pl);
    }
  };

  const toggleSongInPlaylist = async (songId: string) => {
    if (!selectedPlaylist) return;
    if (selectedPlaylist.songIds.includes(songId)) {
      await songRepository.removeSongFromPlaylist(selectedPlaylist.id, songId);
    } else {
      await songRepository.addSongToPlaylist(selectedPlaylist.id, songId);
    }
    const updated = await songRepository.getPlaylistById(selectedPlaylist.id);
    if (updated) setSelectedPlaylist(updated);
    await loadPlaylists();
  };

  const playlistSongs = selectedPlaylist
    ? (selectedPlaylist.songIds
        .map((id) => allSongs.find((s) => s.id === id))
        .filter(Boolean) as SongRecord[])
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 select-none">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[440px] h-full sm:h-[92dvh] sm:max-h-[890px] bg-ambient-cosmic sm:rounded-[36px] border-0 sm:border border-white/10 dark:border-white/10 light:border-slate-200 flex flex-col text-slate-100 dark:text-slate-100 light:text-slate-900 overflow-hidden shadow-2xl relative"
      >
        {/* Header with Safe Area Inset for Mobile Notch */}
        <header
          className="px-4.5 sm:px-5 pb-3.5 flex items-center justify-between border-b border-white/10 dark:border-white/10 light:border-slate-200/80 frosted-surface shrink-0 min-h-[66px]"
          style={{
            paddingTop: 'calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {selectedPlaylist ? (
              <button
                onClick={() => {
                  if (isAddingSongs) {
                    setIsAddingSongs(false);
                  } else {
                    setSelectedPlaylist(null);
                  }
                }}
                className="w-9 h-9 rounded-full frosted-surface border border-white/10 light:border-black/10 hover:border-violet-500/40 flex items-center justify-center text-slate-300 hover:text-white active:scale-90 transition-all shadow-sm shrink-0"
                aria-label="Back to Tour Lists"
                title="Back to Tour Lists"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0 shadow-sm">
                <ListMusic className="w-4.5 h-4.5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-white dark:text-white light:text-slate-900 truncate tracking-tight leading-snug">
                {selectedPlaylist ? selectedPlaylist.name : 'Tour Lists'}
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-500 truncate mt-0.5">
                {selectedPlaylist
                  ? `${playlistSongs.length} tracks • ${selectedPlaylist.description || 'Offline ready'}`
                  : 'Custom Tour Sets & Queues'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!selectedPlaylist && (
              <button
                onClick={() => setIsCreating(true)}
                className="w-9 h-9 rounded-full btn-primary-gradient text-white flex items-center justify-center active:scale-90 shadow-sm"
                title="New List"
              >
                <Plus className="w-4.5 h-4.5 stroke-[2.5]" />
              </button>
            )}

            <button
              onClick={() => {
                if (isAddingSongs) {
                  setIsAddingSongs(false);
                } else if (selectedPlaylist) {
                  setSelectedPlaylist(null);
                } else {
                  onClose();
                }
              }}
              className="w-9 h-9 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all shadow-sm"
              title={selectedPlaylist ? 'Back to Tour Lists' : 'Close'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ========================================================
            VIEW 1: PLAYLIST DETAILS
           ======================================================== */}
        {selectedPlaylist ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Playlist Hero Info & Play All CTA */}
            <div className="px-4.5 py-3 border-b border-white/10 frosted-surface shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <div className="min-w-0 pr-2">
                  <h3 className="text-base font-bold text-white dark:text-white light:text-slate-900 truncate font-bengali">
                    {selectedPlaylist.name}
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {selectedPlaylist.description || `${playlistSongs.length} songs prepared`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleOpenEditPlaylist(selectedPlaylist)}
                    className="w-8.5 h-8.5 rounded-full frosted-surface border border-white/10 hover:border-violet-500/40 flex items-center justify-center text-slate-300 hover:text-white shrink-0 active:scale-90 transition-all shadow-sm"
                    title="Edit List Details"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-violet-400" />
                  </button>
                  <button
                    onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
                    className="w-8.5 h-8.5 rounded-full frosted-surface border border-white/10 hover:border-rose-500/40 flex items-center justify-center text-slate-400 hover:text-rose-400 shrink-0 active:scale-90 transition-all shadow-sm"
                    title="Delete List"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handlePlayEntireSetlist(selectedPlaylist)}
                  className="flex-1 py-2.5 px-4 rounded-full btn-primary-gradient text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(139,92,246,0.35)] active:scale-95 transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play Setlist ({playlistSongs.length} Tracks)</span>
                </button>

                <button
                  onClick={() => setIsAddingSongs(!isAddingSongs)}
                  className={`px-3 py-2.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all ${
                    isAddingSongs
                      ? 'bg-white text-slate-900 border-white shadow-md'
                      : 'frosted-surface border-white/10 text-white hover:border-white/20'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isAddingSongs ? 'Done' : 'Add Tracks'}</span>
                </button>

                {playlistSongs.length > 1 && !isAddingSongs && (
                  <button
                    onClick={() => setIsReorderMode(!isReorderMode)}
                    className={`px-3 py-2.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all ${
                      isReorderMode
                        ? 'bg-violet-500 text-white border-violet-500 shadow-md'
                        : 'frosted-surface border-white/10 text-slate-300 hover:text-white hover:border-white/20'
                    }`}
                    title="Reorder Songs in Setlist"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span>{isReorderMode ? 'Done' : 'Order'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Song list inside playlist */}
            <div
              className="flex-1 overflow-y-auto px-5 py-3 space-y-2 scrollbar-none"
              style={{
                paddingBottom: 'calc(20px + max(env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px)))',
              }}
            >
              {isAddingSongs ? (
                <div>
                  <div className="mb-3">
                    <input
                      type="text"
                      value={songSearch}
                      onChange={(e) => setSongSearch(e.target.value)}
                      placeholder="Filter library to add songs..."
                      className="w-full h-11 rounded-full frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 px-4 text-xs text-white dark:text-white light:text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                  {allSongs
                    .filter((s) =>
                      songSearch
                        ? s.titleBn.toLowerCase().includes(songSearch.toLowerCase()) ||
                          s.titleLatin.toLowerCase().includes(songSearch.toLowerCase())
                        : true
                    )
                    .map((s) => {
                      const isSelected = selectedPlaylist.songIds.includes(s.id);
                      return (
                        <div
                          key={s.id}
                          onClick={() => toggleSongInPlaylist(s.id)}
                          className={`frosted-surface rounded-[22px] px-3.5 py-2.5 min-h-[64px] border flex items-center justify-between cursor-pointer transition-all mb-2 active:scale-[0.98] ${
                            isSelected
                              ? 'ring-2 ring-violet-500 bg-violet-500/15 border-transparent'
                              : 'border-white/10 hover:border-violet-500/30'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <h4 className="text-[14px] font-bold text-white truncate font-bengali">
                              {s.titleBn || s.titleLatin}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{s.titleLatin}</p>
                          </div>
                          <div
                            className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'btn-primary-gradient text-white border-transparent'
                                : 'border-white/20'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : playlistSongs.length === 0 ? (
                <div className="text-center py-14 text-slate-400">
                  <Music2 className="w-12 h-12 mx-auto mb-2 opacity-40 text-violet-400" />
                  <p className="text-sm font-semibold text-white dark:text-white light:text-slate-900">
                    No tracks in this playlist
                  </p>
                  <p className="text-xs mt-1 text-slate-400">
                    Tap &quot;Add Tracks&quot; to pick songs from your tour catalogue.
                  </p>
                </div>
              ) : (
                playlistSongs.map((song, idx) => {
                  const isCurrent = currentSong?.id === song.id;
                  const isCurrentPlaying = isCurrent && isPlaying;

                  return (
                    <div
                      key={song.id}
                      onClick={() => {
                        if (onSelectSongToRead) {
                          onSelectSongToRead(song, selectedPlaylist?.id);
                        } else if (isCurrent) {
                          togglePlay();
                        } else {
                          playSong(song, playlistSongs);
                        }
                      }}
                      className={`frosted-surface rounded-[22px] px-3.5 py-2.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between gap-3 group shadow-sm ${
                        isCurrent
                          ? 'ring-2 ring-violet-500 bg-violet-500/10'
                          : ''
                      }`}
                    >
                      {/* Left: Standard squircle artwork showing track number or playing equalizer */}
                      <div className="w-11 h-11 rounded-[14px] bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-400 shrink-0 shadow-sm">
                        {isCurrentPlaying ? (
                          <Volume2 className="w-5 h-5 text-violet-300 animate-pulse" />
                        ) : (
                          <span className="text-xs font-mono font-bold text-violet-300">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                        )}
                      </div>

                      {/* Center Track Info */}
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <h4 className="text-[14.5px] font-bold text-white font-bengali truncate leading-tight group-hover:text-violet-300 transition-colors">
                          {song.titleBn || song.titleLatin}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate leading-none mt-1">
                          <span className="font-bold uppercase tracking-wider text-[9px] text-[#C4B5FD] bg-[#8B5CF6]/15 px-1.5 h-[17px] inline-flex items-center rounded-md border border-[#8B5CF6]/25 shrink-0 leading-none">
                            {getCategoryName(song.categoryId)}
                          </span>
                          {song.titleLatin && song.titleLatin !== song.titleBn && (
                            <span className="truncate">{song.titleLatin}</span>
                          )}
                        </div>
                      </div>

                      {/* Right: Clean, consistent frosted action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isReorderMode ? (
                          <>
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveSong(idx, 'up');
                              }}
                              className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-violet-500/40 disabled:opacity-20 active:scale-90 transition-all shadow-sm"
                              title="Move Up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === playlistSongs.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveSong(idx, 'down');
                              }}
                              className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 hover:text-white hover:border-violet-500/40 disabled:opacity-20 active:scale-90 transition-all shadow-sm"
                              title="Move Down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            {/* Play/Pause Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCurrent) {
                                  togglePlay();
                                } else {
                                  playSong(song, playlistSongs);
                                }
                              }}
                              className={`w-8 h-8 rounded-full border flex items-center justify-center active:scale-90 transition-all ${
                                isCurrentPlaying
                                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-sm'
                                  : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white hover:border-violet-500/40'
                              }`}
                              title={isCurrentPlaying ? 'Pause' : 'Play'}
                            >
                              {isCurrentPlaying ? (
                                <Pause className="w-3.5 h-3.5 fill-current" />
                              ) : (
                                <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />
                              )}
                            </button>

                            {/* Remove from playlist button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSongInPlaylist(song.id);
                              }}
                              className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:border-rose-500/30 active:scale-90 transition-all"
                              title="Remove from list"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>

                            {/* Open Song Details Chevron Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onSelectSongToRead) {
                                  onSelectSongToRead(song, selectedPlaylist?.id);
                                }
                              }}
                              className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-violet-300 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-colors active:scale-90"
                              title="Open Song Details"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* ========================================================
             VIEW 2: ALL PLAYLISTS OVERVIEW
             ======================================================== */
          <div
            className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-none"
            style={{
              paddingBottom: 'calc(24px + max(env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px)))',
            }}
          >
            {/* Create playlist drawer / inline form */}
            {isCreating && (
              <div className="p-4 rounded-[26px] frosted-card border border-violet-500/40 mb-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white dark:text-white light:text-slate-900">
                    Create New Tour Setlist
                  </span>
                  <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Setlist Name (e.g. Bus Singalong)"
                  className="w-full h-11 rounded-[18px] frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 px-4 text-xs text-white dark:text-white light:text-slate-900 focus:outline-none focus:border-violet-500/50"
                />

                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full h-11 rounded-[18px] frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 px-4 text-xs text-white dark:text-white light:text-slate-900 focus:outline-none focus:border-violet-500/50"
                />

                {/* Color chips */}
                <div className="flex items-center gap-2 pt-1">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSelectedColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform shadow-sm ${
                        selectedColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-950' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>

                <button
                  onClick={handleCreatePlaylist}
                  disabled={!newTitle.trim()}
                  className="w-full py-2.5 rounded-full btn-primary-gradient text-white font-bold text-xs shadow-md disabled:opacity-50"
                >
                  Save Setlist
                </button>
              </div>
            )}

            {/* Playlist Cards - Styled sleek and simple exactly like SongList */}
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => setSelectedPlaylist(pl)}
                className="frosted-surface rounded-[22px] px-3.5 py-2.5 min-h-[68px] cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between gap-3 group shadow-sm"
              >
                {/* Left: Standard squircle icon */}
                <div
                  className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0 shadow-sm"
                  style={{
                    backgroundColor: `${pl.coverColor || '#8B5CF6'}20`,
                    color: pl.coverColor || '#C4B5FD',
                    border: `1px solid ${pl.coverColor || '#8B5CF6'}35`,
                  }}
                >
                  <ListMusic className="w-5 h-5" />
                </div>

                {/* Center Track Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="text-[14.5px] font-bold text-white font-bengali truncate leading-tight group-hover:text-violet-300 transition-colors">
                    {pl.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate leading-none mt-1">
                    <span className="font-bold uppercase tracking-wider text-[9px] text-[#C4B5FD] bg-[#8B5CF6]/15 px-1.5 h-[17px] inline-flex items-center rounded-md border border-[#8B5CF6]/25 shrink-0 leading-none">
                      {pl.songIds.length} {pl.songIds.length === 1 ? 'TRACK' : 'TRACKS'}
                    </span>
                    <span>•</span>
                    <span className="truncate">{pl.description || 'Offline ready'}</span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditPlaylist(pl);
                    }}
                    className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-violet-300 hover:border-violet-500/40 active:scale-90 transition-all"
                    title="Edit List"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-violet-300 group-hover:border-violet-500/30 group-hover:bg-violet-500/10 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* In-App Edit Tour List Dialog Modal */}
        {isEditingPlaylist && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-5 animate-in fade-in duration-150">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm rounded-[28px] frosted-card border border-violet-500/40 p-5 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between pb-1 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                    <Edit2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-white">Edit Tour List</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditingPlaylist(false)}
                  className="w-7 h-7 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 mb-1 block">List Name</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Setlist Name (e.g. Cox's Bazar Tour)"
                    className="w-full h-11 rounded-[16px] frosted-surface border border-white/10 px-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 mb-1 block">Description</label>
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full h-11 rounded-[16px] frosted-surface border border-white/10 px-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/60"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 mb-1.5 block">Accent Color</label>
                  <div className="flex items-center gap-2.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className={`w-7 h-7 rounded-full transition-all shadow-sm ${
                          editColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#080C16]' : 'opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingPlaylist(false)}
                  className="flex-1 py-2.5 rounded-full frosted-surface border border-white/10 text-xs font-semibold text-slate-300 hover:text-white active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditPlaylist}
                  disabled={!editTitle.trim()}
                  className="flex-1 py-2.5 rounded-full btn-primary-gradient text-white font-bold text-xs shadow-md active:scale-95 transition-all disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* In-App Delete Confirmation Dialog (Replaces native browser popup) */}
        {deleteConfirmId && (
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
                <h3 className="text-base font-bold text-white">Delete Tour List?</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Are you sure you want to delete &ldquo;{playlists.find(p => p.id === deleteConfirmId)?.name || 'this list'}&rdquo;? Songs will remain intact in your library.
                </p>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="flex-1 py-2.5 rounded-full frosted-surface border border-white/10 text-xs font-semibold text-slate-300 hover:text-white active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeletePlaylist}
                  className="flex-1 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/30 active:scale-95 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
