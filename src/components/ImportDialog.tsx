import React, { useState, useEffect, useRef } from 'react';
import { SongRecord, CategoryRecord, CsvImportReport, YouTubePlaylistItem } from '../types';
import { parseCsvContent, executeCsvImport, CsvPreviewResult } from '../lib/csvImport';
import {
  extractYouTubePlaylistId,
  fetchYouTubePlaylistEntries,
  buildYouTubeEmbedUrl,
  buildYouTubePlaylistEmbedUrl,
  buildYouTubeThumbnailUrl,
  FetchPlaylistResult,
} from '../lib/youtube';
import {
  ScannedAudioTrack,
  processAudioFiles,
  scanFolderWithDirectoryPicker,
  formatFileSize,
} from '../lib/deviceAudioScanner';
import { songRepository } from '../data/songRepository';
import { motion } from 'motion/react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRight,
  RefreshCw,
  Youtube,
  Check,
  ListPlus,
  Play,
  BookmarkPlus,
  Tv,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Globe,
  Lock,
  HardDrive,
  FolderSearch,
  FileAudio,
  Search,
  Square,
} from 'lucide-react';

interface ImportDialogProps {
  existingSongs: SongRecord[];
  existingCategories: CategoryRecord[];
  onClose: () => void;
  onImportComplete: (report: CsvImportReport) => void;
  onPlayPlaylist?: (song: SongRecord) => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  existingSongs,
  existingCategories,
  onClose,
  onImportComplete,
  onPlayPlaylist,
}) => {
  const [mode, setMode] = useState<'device_storage' | 'youtube_playlist' | 'csv'>('device_storage');

  // Device Storage Scanner states
  const [deviceTracks, setDeviceTracks] = useState<ScannedAudioTrack[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Set<string>>(new Set());
  const [isScanningDevice, setIsScanningDevice] = useState<boolean>(false);
  const [deviceScanStatus, setDeviceScanStatus] = useState<string>('');
  const [hideVoiceNotes, setHideVoiceNotes] = useState<boolean>(true);
  const [deviceSearchQuery, setDeviceSearchQuery] = useState<string>('');
  const [deviceCategoryId, setDeviceCategoryId] = useState<string>(
    existingCategories[0]?.id || 'adda'
  );
  const [isDevicePrivate, setIsDevicePrivate] = useState<boolean>(false);
  const [deviceImportProgress, setDeviceImportProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });

  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  // CSV states
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [preview, setPreview] = useState<CsvPreviewResult | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [globalResolution] = useState<'skip' | 'update' | 'keepBoth'>('skip');
  const [clearStarterFirst, setClearStarterFirst] = useState<boolean>(true);
  const [report, setReport] = useState<CsvImportReport | null>(null);

  // YouTube Playlist states (Zero-Configuration)
  const [playlistUrl, setPlaylistUrl] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    existingCategories[0]?.id || 'other'
  );
  const [ytPlaylistItems, setYtPlaylistItems] = useState<YouTubePlaylistItem[]>([]);
  const [selectedYtIndexes, setSelectedYtIndexes] = useState<Set<number>>(new Set());
  const [isFetchingYt, setIsFetchingYt] = useState<boolean>(false);
  const [playlistResult, setPlaylistResult] = useState<FetchPlaylistResult | null>(null);
  const [showEmbedPreview, setShowEmbedPreview] = useState<boolean>(false);
  const [backendServerUrl, setBackendServerUrl] = useState<string>('https://yt-dlp-server-rr8t.onrender.com');
  const [isPrivateImport, setIsPrivateImport] = useState<boolean>(false);

  const handlePlaylistUrlChange = (val: string) => {
    setPlaylistUrl(val);
    setErrorMsg('');
    setPlaylistResult(null);
    setYtPlaylistItems([]);
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          handlePlaylistUrlChange(text.trim());
        }
      }
    } catch {}
  };

  useEffect(() => {
    return () => {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
        audioPreviewRef.current.src = '';
      }
    };
  }, []);

  useEffect(() => {
    songRepository.getSettings().then((s) => {
      if (s.ytdlpServerUrl) setBackendServerUrl(s.ytdlpServerUrl);
    });
  }, []);

  // Directory Scan via showDirectoryPicker with fallback to file input
  const handleDeviceDirectoryScan = async () => {
    setIsScanningDevice(true);
    setDeviceScanStatus('Scanning device folder for music files...');
    try {
      const files = await scanFolderWithDirectoryPicker((count) => {
        setDeviceScanStatus(`Found ${count} audio files... reading metadata...`);
      });

      if (files.length === 0) {
        setErrorMsg('No audio files (.mp3, .m4a, .flac, .wav, .opus) found in selected folder.');
        setIsScanningDevice(false);
        return;
      }

      setDeviceScanStatus(`Probing ${files.length} audio tracks...`);
      const processed = await processAudioFiles(files, (curr, total) => {
        setDeviceScanStatus(`Reading tags & durations (${curr}/${total})...`);
      });

      setDeviceTracks(processed);
      const initialSelected = new Set(
        processed.filter((t) => !t.isVoiceNote).map((t) => t.id)
      );
      setSelectedDeviceIds(initialSelected.size > 0 ? initialSelected : new Set(processed.map((t) => t.id)));
    } catch (err: any) {
      if (err?.message === 'DIRECTORY_PICKER_UNSUPPORTED' || err?.name !== 'AbortError') {
        folderInputRef.current?.click();
      }
    } finally {
      setIsScanningDevice(false);
      setDeviceScanStatus('');
    }
  };

  const handleDeviceFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsScanningDevice(true);
    setDeviceScanStatus(`Reading ${fileList.length} files...`);

    try {
      const filesArray = Array.from(fileList);
      const processed = await processAudioFiles(filesArray, (curr, total) => {
        setDeviceScanStatus(`Reading audio metadata (${curr}/${total})...`);
      });

      if (processed.length === 0) {
        setErrorMsg('No supported audio files found.');
        return;
      }

      setDeviceTracks(processed);
      const initialSelected = new Set(
        processed.filter((t) => !t.isVoiceNote).map((t) => t.id)
      );
      setSelectedDeviceIds(initialSelected.size > 0 ? initialSelected : new Set(processed.map((t) => t.id)));
    } catch (err: any) {
      setErrorMsg(`Error reading files: ${err?.message || String(err)}`);
    } finally {
      setIsScanningDevice(false);
      setDeviceScanStatus('');
      e.target.value = '';
    }
  };

  const handleToggleDevicePreview = (track: ScannedAudioTrack) => {
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

  const toggleSelectDeviceTrack = (id: string) => {
    const next = new Set(selectedDeviceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDeviceIds(next);
  };

  const handleSelectAllVisibleDeviceTracks = () => {
    const next = new Set(selectedDeviceIds);
    visibleDeviceTracks.forEach((t) => next.add(t.id));
    setSelectedDeviceIds(next);
  };

  const handleDeselectAllVisibleDeviceTracks = () => {
    const next = new Set(selectedDeviceIds);
    visibleDeviceTracks.forEach((t) => next.delete(t.id));
    setSelectedDeviceIds(next);
  };

  const handleUpdateDeviceTrackInfo = (id: string, field: 'title' | 'artist', val: string) => {
    setDeviceTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: val } : t))
    );
  };

  const visibleDeviceTracks = deviceTracks.filter((t) => {
    if (hideVoiceNotes && t.isVoiceNote) return false;
    if (deviceSearchQuery.trim()) {
      const q = deviceSearchQuery.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.fileName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hiddenVoiceNotesCount = deviceTracks.filter((t) => t.isVoiceNote).length;
  const selectedVisibleDeviceTracks = deviceTracks.filter((t) => selectedDeviceIds.has(t.id));
  const totalSelectedDeviceBytes = selectedVisibleDeviceTracks.reduce((acc, t) => acc + t.sizeBytes, 0);

  const handleExecuteDeviceImport = async () => {
    if (selectedVisibleDeviceTracks.length === 0) return;
    setIsImporting(true);
    setDeviceImportProgress({ current: 0, total: selectedVisibleDeviceTracks.length });

    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setPreviewTrackId(null);
    }

    try {
      const targetCategory = existingCategories.find((c) => c.id === deviceCategoryId) || existingCategories[0];
      let importedCount = 0;

      for (let i = 0; i < selectedVisibleDeviceTracks.length; i++) {
        const item = selectedVisibleDeviceTracks[i];
        setDeviceImportProgress({ current: i + 1, total: selectedVisibleDeviceTracks.length });

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
          isPrivate: isDevicePrivate,
          syncStatus: isDevicePrivate ? ('local_only' as const) : ('pending_sync' as const),
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

        const newSong = await songRepository.addSong(songData);

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

      const rep: CsvImportReport = {
        totalRows: selectedVisibleDeviceTracks.length,
        imported: importedCount,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        createdCategories: [],
      };

      setReport(rep);
      onImportComplete(rep);
    } catch (err: any) {
      setErrorMsg(`Failed to import device songs: ${err?.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg('');
    setIsParsing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setFileContent(text);
      try {
        const previewResult = await parseCsvContent(text, existingSongs, existingCategories);
        setPreview(previewResult);
      } catch (err: any) {
        setErrorMsg(`Failed to parse CSV: ${err?.message || String(err)}`);
      } finally {
        setIsParsing(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read the file.');
      setIsParsing(false);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handlePasteParse = async () => {
    if (!fileContent.trim()) {
      setErrorMsg('Please paste CSV text first.');
      return;
    }
    setErrorMsg('');
    setIsParsing(true);
    try {
      const previewResult = await parseCsvContent(fileContent, existingSongs, existingCategories);
      setPreview(previewResult);
    } catch (err: any) {
      setErrorMsg(`Failed to parse CSV: ${err?.message || String(err)}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!preview) return;
    setIsImporting(true);
    setErrorMsg('');

    try {
      const rep = await executeCsvImport(
        preview.rows,
        preview.conflicts,
        globalResolution,
        preview.newCategories,
        clearStarterFirst
      );
      setReport(rep);
      onImportComplete(rep);
    } catch (err: any) {
      setErrorMsg(`Import execution failed: ${err?.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Auto-extracted playlist ID from input URL or raw ID
  const detectedPlaylistId = extractYouTubePlaylistId(playlistUrl);

  // Probes playlist metadata & tracks using developer key or backend
  const handleFetchYouTubePlaylist = async () => {
    const playlistId = detectedPlaylistId || extractYouTubePlaylistId(playlistUrl);
    if (!playlistId) {
      setErrorMsg('Please enter a valid YouTube Playlist link or ID (e.g. https://www.youtube.com/playlist?list=PL...).');
      return;
    }

    setErrorMsg('');
    setIsFetchingYt(true);

    try {
      const result = await fetchYouTubePlaylistEntries(playlistId, backendServerUrl);
      setPlaylistResult(result);

      if (result.error) {
        setErrorMsg(result.error);
      } else if (result.canBulkImportTracks && result.items.length > 0) {
        setYtPlaylistItems(result.items);
        const allIdx = new Set<number>();
        result.items.forEach((_, idx) => allIdx.add(idx));
        setSelectedYtIndexes(allIdx);
      } else {
        setYtPlaylistItems([]);
      }
    } catch (err: any) {
      setErrorMsg(`Failed to probe playlist: ${err?.message || 'Check network connection'}`);
    } finally {
      setIsFetchingYt(false);
    }
  };

  const createPlaylistSongRecord = (pid: string): SongRecord => {
    const title = playlistResult?.playlistTitle || `YouTube Playlist (${pid.slice(0, 10)}...)`;
    const author = playlistResult?.authorName || 'YouTube Continuous Playlist';
    const thumb = playlistResult?.thumbnailUrl || buildYouTubeThumbnailUrl(pid);
    const now = new Date().toISOString();

    return {
      id: `yt-pl-${pid}`,
      importSerial: null,
      titleLatin: title,
      titleBn: title,
      aliases: [author],
      categoryId: selectedCategoryId,
      youtubeUrl: `https://www.youtube.com/playlist?list=${encodeURIComponent(pid)}`,
      youtubeVideoId: '',
      youtubePlaylistId: pid,
      youtubeEmbedUrl: buildYouTubePlaylistEmbedUrl(pid, true),
      thumbnailUrl: thumb,
      lyricsBn: `🎶 YouTube Continuous Playlist: ${title}\nPlaying via YouTube official embedded player.\nChannel: ${author}`,
      lyricsStatus: 'reviewed',
      lyricsOrigin: 'typed',
      sources: [],
      notes: '',
      searchKey: {
        bn: title.toLowerCase(),
        latin: title.toLowerCase(),
      },
      hasAudio: false,
      audioMeta: null,
      playCount: 0,
      lastPlayedAt: null,
      totalListenTimeSec: 0,
      createdAt: now,
      updatedAt: now,
      lyricsUpdatedAt: null,
      isPrivate: isPrivateImport,
      syncStatus: isPrivateImport ? 'local_only' : 'pending_sync',
    };
  };

  // Direct Playlist Playback (Zero-configuration using official embedded player)
  const handleDirectPlayPlaylist = (saveToLib = false) => {
    const pid = detectedPlaylistId || extractYouTubePlaylistId(playlistUrl);
    if (!pid) {
      setErrorMsg('Please enter a valid YouTube Playlist link first.');
      return;
    }

    const playlistSong = createPlaylistSongRecord(pid);

    if (saveToLib) {
      const existing = existingSongs.find(
        (s) => s.youtubePlaylistId === pid || s.id === playlistSong.id
      );
      if (!existing) {
        songRepository.bulkAddSongs([playlistSong]).then(() => {
          onImportComplete({
            totalRows: 1,
            imported: 1,
            updated: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            createdCategories: [],
          });
        });
      }
    }

    if (onPlayPlaylist) {
      onPlayPlaylist(playlistSong);
    }
  };

  // Save Playlist to Library without immediate full screen player launch
  const handleSavePlaylistToLibrary = async () => {
    const pid = detectedPlaylistId || extractYouTubePlaylistId(playlistUrl);
    if (!pid) return;

    const existing = existingSongs.find((s) => s.youtubePlaylistId === pid);
    if (existing) {
      setErrorMsg('This playlist is already saved in your library.');
      return;
    }

    setIsImporting(true);
    setErrorMsg('');

    try {
      const playlistSong = createPlaylistSongRecord(pid);

      await songRepository.bulkAddSongs([playlistSong]);
      const rep: CsvImportReport = {
        totalRows: 1,
        imported: 1,
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        createdCategories: [],
      };
      setReport(rep);
      onImportComplete(rep);
    } catch (err: any) {
      setErrorMsg(`Failed to save playlist to library: ${err?.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  const toggleYtIndex = (idx: number) => {
    const next = new Set(selectedYtIndexes);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setSelectedYtIndexes(next);
  };

  const toggleSelectAllYt = () => {
    if (selectedYtIndexes.size === ytPlaylistItems.length) {
      setSelectedYtIndexes(new Set());
    } else {
      const allIdx = new Set<number>();
      ytPlaylistItems.forEach((_, idx) => allIdx.add(idx));
      setSelectedYtIndexes(allIdx);
    }
  };

  const handleExecuteYouTubeImport = async () => {
    if (selectedYtIndexes.size === 0) return;
    setIsImporting(true);
    setErrorMsg('');

    try {
      const selectedItems = ytPlaylistItems.filter((_, idx) => selectedYtIndexes.has(idx));
      const existingVideoIds = new Set(existingSongs.map((s) => s.youtubeVideoId).filter(Boolean));

      let imported = 0;
      let skipped = 0;

      const songsToAdd: Partial<SongRecord>[] = [];

      for (const item of selectedItems) {
        if (existingVideoIds.has(item.videoId)) {
          skipped++;
          continue;
        }

        songsToAdd.push({
          titleLatin: item.title,
          titleBn: item.title,
          categoryId: selectedCategoryId,
          youtubeUrl: item.youtubeUrl,
          youtubeVideoId: item.videoId,
          youtubeEmbedUrl: item.embedUrl || buildYouTubeEmbedUrl(item.videoId, true),
          thumbnailUrl: item.thumbnailUrl,
          lyricsBn: '',
          lyricsStatus: 'missing',
          aliases: item.channelTitle ? [item.channelTitle] : [],
          isPrivate: isPrivateImport,
          syncStatus: isPrivateImport ? 'local_only' : 'pending_sync',
        });
        imported++;
      }

      await songRepository.bulkAddSongs(songsToAdd);

      const rep: CsvImportReport = {
        totalRows: selectedItems.length,
        imported,
        updated: 0,
        skipped,
        failed: 0,
        errors: [],
        createdCategories: [],
      };

      setReport(rep);
      onImportComplete(rep);
    } catch (err: any) {
      setErrorMsg(`Failed to import YouTube tracks: ${err?.message || String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      {/* Hidden file inputs for cross-platform device storage scanning */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleDeviceFileInputChange}
        className="hidden"
      />
      <input
        ref={filesInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.opus"
        onChange={handleDeviceFileInputChange}
        className="hidden"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-[440px] mx-auto rounded-t-[36px] bg-ambient-cosmic border-t border-white/15 max-h-[92vh] flex flex-col shadow-[0_-15px_45px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/10 frosted-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              {mode === 'device_storage' ? (
                <HardDrive className="w-4 h-4 text-indigo-400" />
              ) : mode === 'csv' ? (
                <FileSpreadsheet className="w-4 h-4" />
              ) : (
                <Youtube className="w-4 h-4 text-rose-500" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {mode === 'device_storage'
                  ? 'Scan Device Music'
                  : mode === 'csv'
                  ? 'Import CSV Songs'
                  : 'YouTube Playlist'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {mode === 'device_storage'
                  ? 'Import offline MP3s & audio files from phone storage'
                  : mode === 'csv'
                  ? 'Google Sheets or Excel exports (UTF-8)'
                  : 'Stream playlists or extract individual songs'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        {!report && (
          <div className="px-5 pt-3 pb-2 flex gap-1.5 border-b border-white/10 frosted-surface">
            <button
              onClick={() => {
                setMode('device_storage');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'device_storage'
                  ? 'btn-primary-gradient text-white shadow-sm'
                  : 'frosted-surface text-slate-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
              <span>Device Music</span>
            </button>
            <button
              onClick={() => {
                setMode('youtube_playlist');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'youtube_playlist'
                  ? 'btn-primary-gradient text-white shadow-sm'
                  : 'frosted-surface text-slate-400 hover:text-white'
              }`}
            >
              <Youtube className="w-3.5 h-3.5 text-rose-400" />
              <span>YouTube</span>
            </button>
            <button
              onClick={() => {
                setMode('csv');
                setErrorMsg('');
              }}
              className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === 'csv'
                  ? 'btn-primary-gradient text-white shadow-sm'
                  : 'frosted-surface text-slate-400 hover:text-white'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-violet-400" />
              <span>CSV / Sheet</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {errorMsg && (
            <div className="p-3.5 rounded-[20px] bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* SUCCESS REPORT VIEW */}
          {report ? (
            <div className="py-4 space-y-5 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center text-emerald-400 mx-auto shadow-[0_0_30px_rgba(16,185,129,0.3)]">
                <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Import Complete!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Processed {report.totalRows} songs into your Tour Lyrics library.
                </p>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center py-1">
                <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                  <div className="text-xl font-bold text-emerald-400">{report.imported}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Added</div>
                </div>
                <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                  <div className="text-xl font-bold text-sky-400">{report.updated}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Updated</div>
                </div>
                <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                  <div className="text-xl font-bold text-amber-400">{report.skipped}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Skipped</div>
                </div>
                <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                  <div className="text-xl font-bold text-rose-400">{report.failed}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Failed</div>
                </div>
              </div>

              <button
                onClick={onClose}
                className="btn-primary-gradient w-full h-14 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-lg active:scale-95"
              >
                Open Library
              </button>
            </div>
          ) : mode === 'device_storage' ? (
            /* DEVICE STORAGE SCANNER VIEW */
            deviceTracks.length === 0 ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-[26px] bg-white/[0.04] border border-white/[0.08] space-y-2 text-center">
                  <div className="w-14 h-14 rounded-full bg-indigo-500/20 text-indigo-400 mx-auto flex items-center justify-center shadow-[0_0_25px_rgba(99,102,241,0.3)]">
                    <FolderSearch className="w-7 h-7" />
                  </div>
                  <h3 className="text-sm font-bold text-white pt-1">
                    Scan Your Device Storage
                  </h3>
                  <p className="text-xs text-[#94A3B8] leading-relaxed max-w-xs mx-auto">
                    Bring your offline music files (.mp3, .m4a, .flac, .wav) from your mobile or PC into the offline app player.
                  </p>
                </div>

                {/* Action Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleDeviceDirectoryScan}
                    disabled={isScanningDevice}
                    className="p-4 rounded-[24px] bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/40 hover:border-indigo-400 text-left transition-all active:scale-95 flex flex-col justify-between h-36"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-500/25 flex items-center justify-center text-indigo-300">
                      <FolderSearch className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Scan Folder</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">Select Music or Downloads folder</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => filesInputRef.current?.click()}
                    disabled={isScanningDevice}
                    className="p-4 rounded-[24px] bg-white/[0.04] border border-white/10 hover:border-white/20 text-left transition-all active:scale-95 flex flex-col justify-between h-36"
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                      <FileAudio className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Select Audio Files</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">Pick specific audio tracks</div>
                    </div>
                  </button>
                </div>

                {/* Status Indicator */}
                {isScanningDevice && (
                  <div className="p-4 rounded-[20px] bg-indigo-500/15 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-3 animate-pulse">
                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    <span>{deviceScanStatus || 'Scanning audio files on device...'}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Scanned Tracks List */
              <div className="space-y-3.5">
                {/* Summary banner */}
                <div className="p-3.5 rounded-[22px] bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">
                      Found {deviceTracks.length} Tracks on Device
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">
                      Selected: {selectedVisibleDeviceTracks.length} tracks ({formatFileSize(totalSelectedDeviceBytes)})
                    </div>
                  </div>
                  <button
                    onClick={() => setDeviceTracks([])}
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
                      value={deviceSearchQuery}
                      onChange={(e) => setDeviceSearchQuery(e.target.value)}
                      placeholder="Search scanned tracks..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/30 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-400"
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
                      <span className="text-[11px] text-[#94A3B8]">
                        Hide voice notes / clips &lt; 30s
                        {hiddenVoiceNotesCount > 0 && ` (${hiddenVoiceNotesCount} hidden)`}
                      </span>
                    </label>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSelectAllVisibleDeviceTracks}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300"
                      >
                        Select All
                      </button>
                      <span className="text-white/20">|</span>
                      <button
                        onClick={handleDeselectAllVisibleDeviceTracks}
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
                        value={deviceCategoryId}
                        onChange={(e) => setDeviceCategoryId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs focus:outline-none focus:border-indigo-400"
                      >
                        {existingCategories.map((c) => (
                          <option key={c.id} value={c.id} className="bg-slate-900 text-white">
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
                        onClick={() => setIsDevicePrivate(!isDevicePrivate)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-left flex items-center justify-between text-white"
                      >
                        <span className="truncate">{isDevicePrivate ? '🔒 Private (Local)' : '🌍 Shareable'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tracks List */}
                <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                  {visibleDeviceTracks.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#94A3B8] italic bg-white/[0.02] rounded-2xl border border-white/5">
                      No tracks match your filter.
                    </div>
                  ) : (
                    visibleDeviceTracks.map((t) => {
                      const isSelected = selectedDeviceIds.has(t.id);
                      const isPreviewing = previewTrackId === t.id;

                      return (
                        <div
                          key={t.id}
                          className={`p-3 rounded-2xl border transition-all flex items-center gap-3 ${
                            isSelected
                              ? 'bg-indigo-500/10 border-indigo-500/40'
                              : 'bg-white/[0.02] border-white/[0.06] opacity-75'
                          }`}
                        >
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => toggleSelectDeviceTrack(t.id)}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                              isSelected
                                ? 'bg-indigo-500 border-indigo-400 text-white shadow-sm'
                                : 'border-white/20 hover:border-white/40'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </button>

                          {/* 5s Snippet Preview */}
                          <button
                            type="button"
                            onClick={() => handleToggleDevicePreview(t)}
                            title="Preview snippet"
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                              isPreviewing
                                ? 'bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.6)] animate-pulse'
                                : 'bg-white/10 hover:bg-white/20 text-[#94A3B8] hover:text-white'
                            }`}
                          >
                            {isPreviewing ? (
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
                              onChange={(e) => handleUpdateDeviceTrackInfo(t.id, 'title', e.target.value)}
                              className="w-full bg-transparent font-medium text-xs text-white truncate focus:outline-none focus:border-b border-indigo-400"
                            />
                            <div className="flex items-center gap-2 text-[10px] text-[#94A3B8] mt-0.5">
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
            )
          ) : mode === 'csv' ? (
            /* CSV IMPORT VIEW */
            !preview ? (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-white/15 hover:border-violet-500/50 rounded-[28px] p-6 text-center transition-colors frosted-card">
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    id="csv-file-input"
                    className="hidden"
                  />
                  <label htmlFor="csv-file-input" className="cursor-pointer flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-2.5">
                      <Upload className="w-6 h-6" />
                    </div>
                    <span className="text-sm font-bold text-white">
                      {fileName || 'Tap to choose CSV / TSV file'}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      Exported from Google Sheets (UTF-8)
                    </span>
                  </label>
                </div>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-white/10"></div>
                  <span className="flex-shrink mx-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Or Paste CSV Text
                  </span>
                  <div className="flex-grow border-t border-white/10"></div>
                </div>

                <div>
                  <textarea
                    rows={4}
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    placeholder="Paste CSV rows here (e.g. Serial, Title, Category, Link)..."
                    className="w-full p-4 rounded-[22px] frosted-surface border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-violet-500 placeholder:text-slate-500 resize-none"
                  />
                  <button
                    onClick={handlePasteParse}
                    disabled={isParsing || !fileContent.trim()}
                    className="mt-2 w-full py-3 rounded-full frosted-surface border border-white/15 text-xs font-bold text-violet-300 hover:text-white flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                  >
                    {isParsing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Parsing rows...</span>
                      </>
                    ) : (
                      <span>Parse Pasted Content</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* CSV PREVIEW VIEW */
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                    <div className="text-lg font-bold text-white">{preview.rows.length}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Rows</div>
                  </div>
                  <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                    <div className="text-lg font-bold text-violet-400">{preview.newCategories.length}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">New Cats</div>
                  </div>
                  <div className="p-3 rounded-[20px] frosted-surface border border-white/10">
                    <div className="text-lg font-bold text-amber-400">{preview.conflicts.length}</div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold mt-0.5">Duplicates</div>
                  </div>
                </div>

                {preview.removedInvalidYoutubeCount > 0 && (
                  <div className="flex items-center gap-2.5 p-3 rounded-[20px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs shadow-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      Detected & automatically removed{' '}
                      <strong>{preview.removedInvalidYoutubeCount}</strong> invalid YouTube link(s).
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 p-3.5 rounded-[22px] frosted-surface border border-white/10">
                  <input
                    type="checkbox"
                    id="clear-starter"
                    checked={clearStarterFirst}
                    onChange={(e) => setClearStarterFirst(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 text-violet-500 accent-violet-500"
                  />
                  <label htmlFor="clear-starter" className="text-xs text-white">
                    <span className="font-semibold">Clear initial starter demo songs</span>
                    <span className="block text-[10px] text-slate-400">
                      Replaces factory mock songs with your personal library.
                    </span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    First 5 Songs Preview:
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 scrollbar-none">
                    {preview.rows.slice(0, 5).map((row, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-[18px] frosted-surface border border-white/5 flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-white font-bengali truncate max-w-[200px]">
                          {row.titleBn || row.titleLatin}
                        </span>
                        <span className="text-[10px] text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full shrink-0">
                          {row.categoryName || 'General'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* YOUTUBE PLAYLIST VIEW (Zero-Configuration) */
            <div className="space-y-4">
              {/* URL Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    YouTube Playlist Link
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePasteClipboard}
                      className="text-[10px] font-semibold text-violet-300 hover:text-white bg-violet-500/15 hover:bg-violet-500/25 px-2 py-0.5 rounded-full border border-violet-500/30 transition-all flex items-center gap-1 active:scale-95"
                    >
                      <span>📋 Paste</span>
                    </button>
                    <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                      Instant Import
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={playlistUrl}
                    onChange={(e) => handlePlaylistUrlChange(e.target.value)}
                    onInput={(e) => handlePlaylistUrlChange((e.target as HTMLInputElement).value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text');
                      if (pasted) {
                        handlePlaylistUrlChange(pasted.trim());
                      }
                    }}
                    placeholder="https://www.youtube.com/playlist?list=PL..."
                    className="w-full px-4 py-3 rounded-[20px] frosted-surface border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-violet-500 pr-10"
                  />
                  {detectedPlaylistId && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  )}
                </div>

                {detectedPlaylistId ? (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[10px] font-mono font-bold text-violet-300 bg-violet-500/15 px-2 py-0.5 rounded-md border border-violet-500/30 truncate">
                      ID: {detectedPlaylistId}
                    </span>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      Valid playlist detected
                    </span>
                  </div>
                ) : playlistUrl.trim().length > 0 ? (
                  <p className="text-[10px] text-amber-400/90 pt-1">
                    Please paste a link containing ?list=... or a playlist ID starting with PL/UU/FL.
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 pt-1">
                    Supports any public YouTube playlist or music album URL.
                  </p>
                )}
              </div>

              {/* Category Assignment */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Assign to Category
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-full frosted-surface border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
                >
                  {existingCategories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* CARD 1: DIRECT PLAYLIST EMBEDDED PLAYBACK */}
              <div className="p-4 rounded-[26px] bg-gradient-to-br from-violet-500/10 via-purple-500/5 to-rose-500/10 border border-violet-500/30 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white leading-tight">
                        Stream Entire Playlist
                      </h3>
                      <span className="text-[10px] text-violet-300 font-medium">
                        Continuous in-app playback
                      </span>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Ready Instantly
                  </span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Stream every song in this playlist continuously with synchronized video and lyrics inside your app.
                </p>

                {/* Primary Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => handleDirectPlayPlaylist(true)}
                    disabled={!detectedPlaylistId}
                    className="h-11 rounded-full btn-primary-gradient text-xs font-bold text-white shadow-md flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 transition-all"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Play in App</span>
                  </button>

                  <button
                    onClick={handleSavePlaylistToLibrary}
                    disabled={!detectedPlaylistId || isImporting}
                    className="h-11 rounded-full frosted-surface border border-white/15 text-xs font-bold text-white shadow-md flex items-center justify-center gap-1.5 hover:bg-white/10 active:scale-95 disabled:opacity-40 transition-all"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-violet-400" />
                    <span>Add to Library</span>
                  </button>
                </div>

                {/* Live Embed Player Accordion Preview */}
                {detectedPlaylistId && (
                  <div className="pt-1">
                    <button
                      onClick={() => setShowEmbedPreview(!showEmbedPreview)}
                      className="w-full py-1.5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-300 hover:text-white transition-colors"
                    >
                      <Tv className="w-3.5 h-3.5 text-violet-400" />
                      <span>{showEmbedPreview ? 'Hide Live Preview Player' : 'Test Live Embedded Player'}</span>
                      {showEmbedPreview ? (
                        <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
                      )}
                    </button>

                    {showEmbedPreview && (
                      <div className="mt-2 aspect-video w-full rounded-2xl overflow-hidden border border-white/20 bg-black shadow-inner">
                        <iframe
                          src={buildYouTubePlaylistEmbedUrl(detectedPlaylistId, false)}
                          title="YouTube Embedded Playlist Preview"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CARD 2: BULK IMPORT INDIVIDUAL SONGS */}
              <div className="p-4 rounded-[26px] frosted-surface border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                      <ListPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white leading-tight">
                        Import as Individual Songs
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        Extract each track into your song list
                      </span>
                    </div>
                  </div>
                </div>

                {ytPlaylistItems.length === 0 ? (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Extracts individual song titles, video IDs, and thumbnails into your local Tour Lyrics library.
                    </p>

                    <button
                      onClick={handleFetchYouTubePlaylist}
                      disabled={isFetchingYt || !detectedPlaylistId}
                      className="w-full h-11 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40 transition-all"
                    >
                      {isFetchingYt ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-400" />
                          <span>Extracting Playlist Tracks...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                          <span>Extract Tracks into Library</span>
                        </>
                      )}
                    </button>

                    {/* Status Notice if track list is not yet loaded */}
                    {playlistResult && !playlistResult.canBulkImportTracks && (
                      <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10 flex items-start gap-2.5 text-[11px] text-slate-300">
                        <Info className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <p className="font-semibold text-white">
                            Continuous Playback is ready above
                          </p>
                          <p className="text-slate-400 text-[10px] leading-relaxed">
                            You can tap <strong>Play in App</strong> or <strong>Add to Library</strong> to stream the entire playlist immediately.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Track Selection List */
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white">
                          {ytPlaylistItems.length} Tracks Discovered
                        </span>
                        <p className="text-[10px] text-slate-400">
                          {selectedYtIndexes.size} of {ytPlaylistItems.length} selected
                        </p>
                      </div>
                      <button
                        onClick={toggleSelectAllYt}
                        className="text-xs text-violet-400 font-semibold hover:underline"
                      >
                        {selectedYtIndexes.size === ytPlaylistItems.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-none">
                      {ytPlaylistItems.map((item, idx) => {
                        const isSelected = selectedYtIndexes.has(idx);
                        const isAlreadyInLib = existingSongs.some((s) => s.youtubeVideoId === item.videoId);

                        return (
                          <div
                            key={item.videoId}
                            onClick={() => toggleYtIndex(idx)}
                            className={`p-2.5 rounded-[20px] border flex items-center gap-3 cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-violet-500/15 border-violet-500/40'
                                : 'frosted-surface border-white/10 opacity-70'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? 'btn-primary-gradient text-white border-transparent'
                                  : 'border-white/20'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>

                            <img
                              src={item.thumbnailUrl}
                              alt=""
                              className="w-12 h-8 rounded-lg object-cover border border-white/10 shrink-0"
                            />

                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-400 truncate">{item.channelTitle}</span>
                                {isAlreadyInLib && (
                                  <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1.5 rounded">
                                    In Library
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Destination / Privacy Toggle Card */}
                    <div className="p-3.5 rounded-[22px] frosted-card border border-white/10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                            isPrivateImport
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                          }`}
                        >
                          {isPrivateImport ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-white block truncate">
                            {isPrivateImport ? 'Private (Local Storage Only)' : 'Upload for All (Sync to Database)'}
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {isPrivateImport
                              ? 'Saved only on this device • Never synced to cloud'
                              : 'Synced to cloud database • Visible to tour community'}
                          </span>
                        </div>
                      </div>

                      {/* Interactive Segmented Switcher */}
                      <div className="flex items-center bg-white/5 border border-white/10 rounded-full p-1 shrink-0 shadow-inner">
                        <button
                          type="button"
                          onClick={() => setIsPrivateImport(false)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                            !isPrivateImport
                              ? 'bg-emerald-500 text-slate-950 shadow-md font-extrabold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Upload for all & sync to database"
                        >
                          <Globe className="w-3.5 h-3.5" />
                          <span>All</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPrivateImport(true)}
                          className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all flex items-center gap-1.5 ${
                            isPrivateImport
                              ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Keep private on local device storage only"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Private</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setYtPlaylistItems([])}
                        className="px-4 py-2.5 rounded-full frosted-surface text-xs font-semibold text-slate-400 hover:text-white"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleExecuteYouTubeImport}
                        disabled={isImporting || selectedYtIndexes.size === 0}
                        className="flex-1 h-11 rounded-full btn-primary-gradient text-xs font-bold text-white shadow-lg flex items-center justify-center gap-2 active:scale-95 disabled:opacity-40"
                      >
                        {isImporting ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Importing...</span>
                          </>
                        ) : (
                          <>
                            <span>
                              Import {selectedYtIndexes.size} Songs {isPrivateImport ? '(Private)' : '(Synced)'}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Device Storage Footer action */}
        {mode === 'device_storage' && deviceTracks.length > 0 && !report && (
          <div className="p-4 border-t border-white/10 frosted-surface space-y-2">
            {isImporting && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-indigo-300">
                  <span>Importing songs into local device storage...</span>
                  <span className="font-mono">
                    {deviceImportProgress.current} / {deviceImportProgress.total}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-200"
                    style={{
                      width: `${(deviceImportProgress.current / Math.max(deviceImportProgress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleExecuteDeviceImport}
              disabled={isImporting || selectedVisibleDeviceTracks.length === 0}
              className="w-full py-3 rounded-full btn-primary-gradient text-white text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Upload className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isImporting
                  ? `Importing (${deviceImportProgress.current}/${deviceImportProgress.total})...`
                  : `Import ${selectedVisibleDeviceTracks.length} Selected Songs (${formatFileSize(totalSelectedDeviceBytes)})`}
              </span>
            </button>
          </div>
        )}

        {/* CSV Footer action */}
        {mode === 'csv' && preview && !report && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 frosted-surface">
            <button
              onClick={() => setPreview(null)}
              className="px-4 py-2.5 rounded-full text-xs font-semibold text-slate-400 hover:text-white"
            >
              Back
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={isImporting}
              className="btn-primary-gradient px-6 h-12 rounded-full text-xs font-bold text-white flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <span>Import {preview.rows.length} Songs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
