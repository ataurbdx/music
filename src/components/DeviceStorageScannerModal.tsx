import React, { useState, useRef, useEffect } from 'react';
import { CategoryRecord, SongRecord } from '../types';
import {
  ScannedAudioTrack,
  processAudioFiles,
  scanFolderWithDirectoryPicker,
  formatFileSize,
} from '../lib/deviceAudioScanner';
import { songRepository } from '../data/songRepository';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderSearch,
  FileAudio,
  Check,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Search,
  Filter,
  X,
  Upload,
  HardDrive,
  Music,
  SlidersHorizontal,
  ChevronDown,
} from 'lucide-react';

interface DeviceStorageScannerModalProps {
  categories: CategoryRecord[];
  onClose: () => void;
  onImportComplete: (importedCount: number) => void;
}

export const DeviceStorageScannerModal: React.FC<DeviceStorageScannerModalProps> = ({
  categories,
  onClose,
  onImportComplete,
}) => {
  const [tracks, setTracks] = useState<ScannedAudioTrack[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });

  // Filtering options
  const [hideVoiceNotes, setHideVoiceNotes] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id || 'adda'
  );
  const [isPrivate, setIsPrivate] = useState<boolean>(false);

  // Audio preview state
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  // Hidden file inputs for cross-platform compatibility
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.src = '';
      }
    };
  }, []);

  // Handle Directory Picker (Modern Chromium, Android Chrome, Edge)
  const handleDirectoryScan = async () => {
    setIsScanning(true);
    setScanStatus('Scanning device folder for music files...');
    try {
      const files = await scanFolderWithDirectoryPicker((count) => {
        setScanStatus(`Found ${count} audio files... reading metadata...`);
      });

      if (files.length === 0) {
        alert('No audio files (.mp3, .m4a, .flac, .wav, .opus) found in selected folder.');
        setIsScanning(false);
        return;
      }

      setScanStatus(`Probing ${files.length} audio tracks...`);
      const processed = await processAudioFiles(files, (curr, total) => {
        setScanStatus(`Reading tags & durations (${curr}/${total})...`);
      });

      setTracks(processed);
      // Auto-select all non-voice notes
      const initialSelected = new Set(
        processed.filter((t) => !t.isVoiceNote).map((t) => t.id)
      );
      setSelectedIds(initialSelected.size > 0 ? initialSelected : new Set(processed.map((t) => t.id)));
    } catch (err: any) {
      if (err?.message === 'DIRECTORY_PICKER_UNSUPPORTED') {
        // Fallback to webkitdirectory input
        folderInputRef.current?.click();
      } else if (err.name !== 'AbortError') {
        // Fallback to input
        folderInputRef.current?.click();
      }
    } finally {
      setIsScanning(false);
      setScanStatus('');
    }
  };

  // Handle standard File Input (Folder or Multi-File)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsScanning(true);
    setScanStatus(`Reading ${fileList.length} files...`);

    try {
      const filesArray = Array.from(fileList);
      const processed = await processAudioFiles(filesArray, (curr, total) => {
        setScanStatus(`Reading audio metadata (${curr}/${total})...`);
      });

      if (processed.length === 0) {
        alert('No supported audio files found.');
        return;
      }

      setTracks(processed);
      const initialSelected = new Set(
        processed.filter((t) => !t.isVoiceNote).map((t) => t.id)
      );
      setSelectedIds(initialSelected.size > 0 ? initialSelected : new Set(processed.map((t) => t.id)));
    } catch (err: any) {
      alert(`Error reading files: ${err?.message || String(err)}`);
    } finally {
      setIsScanning(false);
      setScanStatus('');
      // Reset input
      e.target.value = '';
    }
  };

  // Preview track snippet (5-10s)
  const handleTogglePreview = (track: ScannedAudioTrack) => {
    if (previewTrackId === track.id) {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      setPreviewTrackId(null);
      return;
    }

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
    }

    try {
      const url = URL.createObjectURL(track.file);
      const audio = new Audio(url);
      audioPreviewRef.current = audio;
      setPreviewTrackId(track.id);

      audio.play().catch(() => setPreviewTrackId(null));
      audio.onended = () => {
        setPreviewTrackId(null);
        URL.revokeObjectURL(url);
      };
    } catch {
      setPreviewTrackId(null);
    }
  };

  // Select / Deselect actions
  const toggleSelectTrack = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAllVisible = () => {
    const next = new Set(selectedIds);
    visibleTracks.forEach((t) => next.add(t.id));
    setSelectedIds(next);
  };

  const handleDeselectAllVisible = () => {
    const next = new Set(selectedIds);
    visibleTracks.forEach((t) => next.delete(t.id));
    setSelectedIds(next);
  };

  // Update track title or artist inline
  const handleUpdateTrackInfo = (id: string, field: 'title' | 'artist', val: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: val } : t))
    );
  };

  // Filter tracks
  const visibleTracks = tracks.filter((t) => {
    if (hideVoiceNotes && t.isVoiceNote) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.fileName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hiddenVoiceNotesCount = tracks.filter((t) => t.isVoiceNote).length;
  const selectedVisibleTracks = tracks.filter((t) => selectedIds.has(t.id));
  const totalSelectedBytes = selectedVisibleTracks.reduce((acc, t) => acc + t.sizeBytes, 0);

  // Execute Import into IndexedDB
  const handleExecuteImport = async () => {
    if (selectedVisibleTracks.length === 0) return;
    setIsImporting(true);
    setImportProgress({ current: 0, total: selectedVisibleTracks.length });

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setPreviewTrackId(null);
    }

    try {
      const targetCategory = categories.find((c) => c.id === selectedCategoryId) || categories[0];
      let importedCount = 0;

      for (let i = 0; i < selectedVisibleTracks.length; i++) {
        const item = selectedVisibleTracks[i];
        setImportProgress({ current: i + 1, total: selectedVisibleTracks.length });

        const now = new Date().toISOString();
        const songData = {
          titleLatin: item.title,
          titleBn: item.title,
          aliases: item.artist ? [item.artist] : [],
          categoryId: targetCategory?.id || 'adda',
          lyricsStatus: 'missing' as const,
          lyricsBn: '',
          lyricsLanguage: 'bn' as const,
          hasAudio: true,
          isPrivate,
          syncStatus: isPrivate ? ('local_only' as const) : ('pending_sync' as const),
          audioMeta: {
            format: item.format.toLowerCase(),
            bitrate: '320kbps',
            sizeBytes: item.sizeBytes,
            durationSec: item.durationSeconds || 180,
            sourceType: 'local-file' as const,
            localUri: item.fileName,
          },
          createdAt: now,
          updatedAt: now,
        };

        // 1. Add song record
        const newSong = await songRepository.addSong(songData);

        // 2. Attach actual audio blob to IndexedDB
        await songRepository.saveAudioBlob(newSong.id, item.file, {
          format: item.format.toLowerCase(),
          bitrate: '320kbps',
          sizeBytes: item.sizeBytes,
          durationSec: item.durationSeconds || 180,
          sourceType: 'local-file',
          localUri: item.fileName,
        });

        importedCount++;
      }

      onImportComplete(importedCount);
      onClose();
    } catch (err: any) {
      alert(`Import failed: ${err?.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      {/* Hidden file inputs */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.opus"
        onChange={handleFileInputChange}
        className="hidden"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-[430px] mx-auto rounded-t-[36px] bg-[#0A0E1A]/98 light:bg-[#FFFFFF]/98 backdrop-blur-2xl border-t border-white/15 light:border-black/10 max-h-[92vh] flex flex-col shadow-[0_-15px_45px_rgba(0,0,0,0.85)] overflow-hidden text-[#F1F5F9] light:text-[#0F172A]"
      >
        {/* Drag Handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/20 light:bg-black/20" />
        </div>

        {/* Modal Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.08] light:border-black/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white light:text-slate-900 leading-tight">
                Scan Device Music
              </h2>
              <p className="text-[11px] text-[#94A3B8] light:text-slate-500">
                Import offline MP3s & audio files from phone storage
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 light:bg-black/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {/* STEP 1: Scan Buttons if no tracks yet */}
          {tracks.length === 0 ? (
            <div className="space-y-4 py-4">
              <div className="p-4 rounded-[26px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2 text-center">
                <div className="w-14 h-14 rounded-full bg-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.3)]">
                  <FolderSearch className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-white light:text-slate-900 pt-1">
                  Bring Your Offline Audio Files
                </h3>
                <p className="text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed max-w-xs mx-auto">
                  Scan any folder on your device or select individual audio files. Files are saved safely in your offline library storage.
                </p>
              </div>

              {/* Action Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleDirectoryScan}
                  disabled={isScanning}
                  className="p-4 rounded-[24px] bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/40 hover:border-indigo-400 text-left transition-all active:scale-95 flex flex-col justify-between h-36"
                >
                  <div className="w-10 h-10 rounded-full bg-indigo-500/25 flex items-center justify-center text-indigo-300">
                    <FolderSearch className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white light:text-slate-900">Scan Folder</div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">Select Music or Downloads folder</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  disabled={isScanning}
                  className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/10 hover:border-white/20 text-left transition-all active:scale-95 flex flex-col justify-between h-36"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white light:text-slate-800">
                    <FileAudio className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white light:text-slate-900">Select Files</div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">Pick specific MP3/M4A tracks</div>
                  </div>
                </button>
              </div>

              {/* Status Indicator */}
              {isScanning && (
                <div className="p-4 rounded-[20px] bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-3 animate-pulse">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>{scanStatus || 'Scanning audio files...'}</span>
                </div>
              )}
            </div>
          ) : (
            /* STEP 2: Preview & Select Tracks */
            <div className="space-y-3.5">
              {/* Scan summary banner */}
              <div className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white light:text-slate-900">
                    Found {tracks.length} Tracks on Device
                  </div>
                  <div className="text-[10px] text-[#94A3B8] light:text-slate-500 mt-0.5">
                    Selected: {selectedVisibleTracks.length} tracks ({formatFileSize(totalSelectedBytes)})
                  </div>
                </div>
                <button
                  onClick={() => setTracks([])}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20"
                >
                  Rescan
                </button>
              </div>

              {/* Controls & Filter Bar */}
              <div className="space-y-2">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search scanned tracks..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/30 light:bg-white border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs focus:outline-none focus:border-indigo-400"
                  />
                </div>

                {/* Voice Note Filter & Select All */}
                <div className="flex items-center justify-between text-xs px-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideVoiceNotes}
                      onChange={(e) => setHideVoiceNotes(e.target.checked)}
                      className="rounded accent-indigo-500"
                    />
                    <span className="text-[11px] text-[#94A3B8] light:text-slate-600">
                      Hide voice notes / clips &lt; 30s
                      {hiddenVoiceNotesCount > 0 && ` (${hiddenVoiceNotesCount} hidden)`}
                    </span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAllVisible}
                      className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                    >
                      Select All
                    </button>
                    <span className="text-white/20">|</span>
                    <button
                      onClick={handleDeselectAllVisible}
                      className="text-[11px] font-semibold text-[#94A3B8] hover:text-white"
                    >
                      None
                    </button>
                  </div>
                </div>

                {/* Target Category & Privacy Selector */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] block mb-1">
                      Target Category
                    </label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 light:bg-white border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs focus:outline-none focus:border-indigo-400"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8] block mb-1">
                      Sync Preference
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsPrivate(!isPrivate)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 light:bg-white border border-white/10 light:border-black/10 text-xs text-left flex items-center justify-between text-white light:text-slate-900"
                    >
                      <span className="truncate">{isPrivate ? '🔒 Private (Local)' : '🌍 Shareable'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Tracks List */}
              <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                {visibleTracks.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#94A3B8] italic bg-white/[0.02] rounded-2xl border border-white/5">
                    No tracks match your filter.
                  </div>
                ) : (
                  visibleTracks.map((t) => {
                    const isSelected = selectedIds.has(t.id);
                    const isPlaying = previewTrackId === t.id;

                    return (
                      <div
                        key={t.id}
                        className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                          isSelected
                            ? 'bg-indigo-500/10 border-indigo-500/40'
                            : 'bg-white/[0.02] light:bg-black/[0.02] border-white/[0.06] opacity-75'
                        }`}
                      >
                        {/* Checkbox */}
                        <button
                          type="button"
                          onClick={() => toggleSelectTrack(t.id)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                            isSelected
                              ? 'bg-indigo-500 border-indigo-400 text-white shadow-sm'
                              : 'border-white/20 hover:border-white/40'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        {/* Format Badge / Play Preview */}
                        <button
                          type="button"
                          onClick={() => handleTogglePreview(t)}
                          title="Preview 5s snippet"
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                            isPlaying
                              ? 'bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.6)] animate-pulse'
                              : 'bg-white/10 hover:bg-white/20 text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          {isPlaying ? (
                            <Square className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>

                        {/* Title & Artist Details */}
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={t.title}
                            onChange={(e) => handleUpdateTrackInfo(t.id, 'title', e.target.value)}
                            className="w-full bg-transparent font-medium text-xs text-white light:text-slate-900 truncate focus:outline-none focus:border-b border-indigo-400"
                          />
                          <div className="flex items-center gap-2 text-[10px] text-[#94A3B8] light:text-slate-500 mt-0.5">
                            <span className="font-mono bg-white/10 px-1 py-0.2 rounded text-[9px]">
                              {t.format}
                            </span>
                            <span>{t.durationFormatted}</span>
                            <span>•</span>
                            <span>{t.sizeFormatted}</span>
                            {t.artist && (
                              <>
                                <span>•</span>
                                <span className="truncate">{t.artist}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer / Import Action */}
        {tracks.length > 0 && (
          <div className="p-4 border-t border-white/[0.08] light:border-black/[0.08] bg-[#0A0E1A] light:bg-white space-y-2">
            {isImporting && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-indigo-300">
                  <span>Importing into library storage...</span>
                  <span className="font-mono">
                    {importProgress.current} / {importProgress.total}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-200"
                    style={{
                      width: `${(importProgress.current / Math.max(importProgress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleExecuteImport}
              disabled={isImporting || selectedVisibleTracks.length === 0}
              className="w-full py-3 rounded-full btn-primary-gradient text-white text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Upload className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isImporting
                  ? `Importing (${importProgress.current}/${importProgress.total})...`
                  : `Import ${selectedVisibleTracks.length} Selected Songs (${formatFileSize(totalSelectedBytes)})`}
              </span>
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
