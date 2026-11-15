import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SongRecord, DownloadQueueItem, SongAudioMeta } from '../types';
import { songRepository } from '../data/songRepository';
import { useAudio } from '../context/AudioContext';
import { nativeBridge } from '../services/nativeBridge';
import { motion } from 'motion/react';
import {
  X,
  Download,
  HardDrive,
  Sparkles,
  Play,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  FileAudio,
  FolderOpen,
  CheckSquare,
  Square,
  Check,
  ListChecks,
  RotateCcw,
} from 'lucide-react';

interface AudioHubModalProps {
  allSongs: SongRecord[];
  initialSong?: SongRecord | null;
  onClose: () => void;
  onSongUpdated: (updatedSong: SongRecord) => void;
}

export const AudioHubModal: React.FC<AudioHubModalProps> = ({
  allSongs,
  initialSong,
  onClose,
  onSongUpdated,
}) => {
  const { playSong } = useAudio();
  const [activeTab, setActiveTab] = useState<'download' | 'queue' | 'storage'>('download');

  // Only songs without offline audio can be targeted for download
  const downloadableSongs = useMemo(() => {
    return allSongs.filter((s) => !s.hasAudio);
  }, [allSongs]);

  // Downloader form state & multi-select batch queue (up to 20 songs)
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>(() => {
    if (initialSong && !initialSong.hasAudio) {
      return [initialSong.id];
    }
    return [];
  });
  const [targetSongId, setTargetSongId] = useState<string>(
    initialSong?.id || (downloadableSongs[0]?.id ?? '')
  );
  const initialYtUrl =
    initialSong?.youtubeUrl ||
    (initialSong?.youtubeVideoId ? `https://www.youtube.com/watch?v=${initialSong.youtubeVideoId}` : '') ||
    (initialSong?.youtubePlaylistId ? `https://www.youtube.com/playlist?list=${initialSong.youtubePlaylistId}` : '');
  const [youtubeUrl, setYoutubeUrl] = useState<string>(initialYtUrl);
  const [format, setFormat] = useState<string>('mp3');
  const [quality, setQuality] = useState<string>('320k');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Queue state
  const [queueItems, setQueueItems] = useState<DownloadQueueItem[]>([]);

  // Storage state
  const [storageStats, setStorageStats] = useState<{ count: number; totalSizeBytes: number }>({
    count: 0,
    totalSizeBytes: 0,
  });
  const [audioSongList, setAudioSongList] = useState<SongRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refreshQueue();
    refreshStorage();
  }, []);

  useEffect(() => {
    if (initialSong) {
      setTargetSongId(initialSong.id);
      const resolved =
        initialSong.youtubeUrl ||
        (initialSong.youtubeVideoId ? `https://www.youtube.com/watch?v=${initialSong.youtubeVideoId}` : '') ||
        (initialSong.youtubePlaylistId ? `https://www.youtube.com/playlist?list=${initialSong.youtubePlaylistId}` : '');
      if (resolved) {
        setYoutubeUrl(resolved);
      }
    }
  }, [initialSong]);

  const refreshQueue = async () => {
    const items = await songRepository.getDownloadQueue();
    setQueueItems(items.reverse());
  };

  const refreshStorage = async () => {
    const stats = await songRepository.getAudioStorageStats();
    setStorageStats(stats);
    const withAudio = allSongs.filter((s) => s.hasAudio);
    setAudioSongList(withAudio);
  };

  // --- LOCAL AUDIO FILE UPLOAD ---
  const handleLocalFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetSongId) return;

    try {
      setIsProcessing(true);
      setStatusFeedback(`Reading audio file "${file.name}"...`);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const meta: SongAudioMeta = {
        format: ext,
        bitrate: 'Original',
        sizeBytes: file.size,
        durationSec: 180,
        sourceType: 'local-file',
        localUri: null,
      };

      await songRepository.saveAudioBlob(targetSongId, file, file.type || 'audio/mpeg', meta);

      const target = allSongs.find((s) => s.id === targetSongId);
      if (target) {
        const updated = await songRepository.getSongById(targetSongId);
        if (updated) onSongUpdated(updated);
      }

      setStatusFeedback(`Successfully saved "${file.name}" offline!`);
      await refreshStorage();
    } catch (err: any) {
      setStatusFeedback(`File save failed: ${err?.message || String(err)}`);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatusFeedback(null), 3500);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- YOUTUBE AUDIO DOWNLOAD PIPELINE ---
  const handleStartDownload = async () => {
    if (!youtubeUrl.trim() || !targetSongId) {
      setStatusFeedback('Please enter a YouTube URL and select a song.');
      return;
    }

    const rawUrl = youtubeUrl.trim();
    const ytMatch = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
    const sanitizedUrl = ytMatch && ytMatch[1] ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : rawUrl;

    const targetSong = allSongs.find((s) => s.id === targetSongId);
    const title = targetSong?.titleBn || targetSong?.titleLatin || 'Tour Track';

    // Add job to downloadQueue
    const queueItem = await songRepository.addDownloadQueueItem({
      songId: targetSongId,
      youtubeUrl: sanitizedUrl,
      title,
      format,
      quality,
      status: 'extracting',
      progress: 15,
      error: null,
    });

    await refreshQueue();
    setIsProcessing(true);
    setStatusFeedback('Extracting YouTube audio stream...');

    try {
      const { downloadWaterfallAudio } = await import('../services/waterfallAudioDownloader');

      const waterfallResult = await downloadWaterfallAudio(
        sanitizedUrl,
        format,
        quality,
        (statusText, progressPct) => {
          setStatusFeedback(statusText);
          songRepository.updateDownloadQueueItem(queueItem.id, {
            status: 'extracting',
            progress: progressPct,
          }).then(() => refreshQueue()).catch(() => {});
        }
      );

      const audioBlob = waterfallResult.blob;
      const downloadedFormat = waterfallResult.format;

      await songRepository.updateDownloadQueueItem(queueItem.id, {
        status: 'converting',
        progress: 90,
      });

      const meta: SongAudioMeta = {
        format: downloadedFormat,
        bitrate: `${quality}bps`,
        sizeBytes: audioBlob.size,
        durationSec: 180,
        sourceType: 'yt-download',
        localUri: null,
      };

      await songRepository.saveAudioBlob(targetSongId, audioBlob, `audio/${downloadedFormat}`, meta);
      await songRepository.updateSong(targetSongId, {
        youtubeUrl: youtubeUrl.trim(),
      });

      await songRepository.updateDownloadQueueItem(queueItem.id, {
        status: 'completed',
        progress: 100,
        error: null,
      });

      const updated = await songRepository.getSongById(targetSongId);
      if (updated) onSongUpdated(updated);

      setStatusFeedback(`Download completed via ${waterfallResult.tierUsed.replace('_', ' ').toUpperCase()}! Track saved offline (${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB).`);
      await refreshQueue();
      await refreshStorage();
    } catch (err: any) {
      const errorMsg = err?.message || 'Download failed';
      await songRepository.updateDownloadQueueItem(queueItem.id, {
        status: 'failed',
        error: errorMsg,
      });
      setStatusFeedback(`Download failed: ${errorMsg}`);
      await refreshQueue();
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatusFeedback(null), 5000);
    }
  };

  const handleRetryDownload = async (item: DownloadQueueItem) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setStatusFeedback(`Retrying download for "${item.title}"...`);

    try {
      await songRepository.updateDownloadQueueItem(item.id, {
        status: 'extracting',
        progress: 25,
        error: null,
      });
      await refreshQueue();

      const { downloadWaterfallAudio } = await import('../services/waterfallAudioDownloader');

      const waterfallResult = await downloadWaterfallAudio(
        item.youtubeUrl,
        item.format,
        item.quality,
        (statusText, progressPct) => {
          setStatusFeedback(statusText);
          songRepository.updateDownloadQueueItem(item.id, {
            status: 'extracting',
            progress: progressPct,
          }).then(() => refreshQueue()).catch(() => {});
        }
      );

      const audioBlob = waterfallResult.blob;
      const downloadedFormat = waterfallResult.format;

      await songRepository.updateDownloadQueueItem(item.id, {
        status: 'converting',
        progress: 90,
      });

      const meta: SongAudioMeta = {
        format: downloadedFormat,
        bitrate: `${item.quality}bps`,
        sizeBytes: audioBlob.size,
        durationSec: 180,
        sourceType: 'yt-download',
        localUri: null,
      };

      await songRepository.saveAudioBlob(item.songId, audioBlob, `audio/${downloadedFormat}`, meta);
      await songRepository.updateDownloadQueueItem(item.id, {
        status: 'completed',
        progress: 100,
        error: null,
      });

      const updated = await songRepository.getSongById(item.songId);
      if (updated) onSongUpdated(updated);

      setStatusFeedback(`Retry succeeded via ${waterfallResult.tierUsed.replace('_', ' ').toUpperCase()}! Track saved offline (${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB).`);
      await refreshQueue();
      await refreshStorage();
    } catch (err: any) {
      const errorMsg = err?.message || 'Download failed';
      await songRepository.updateDownloadQueueItem(item.id, {
        status: 'failed',
        error: errorMsg,
      });
      setStatusFeedback(`Download failed: ${errorMsg}`);
      await refreshQueue();
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatusFeedback(null), 5000);
    }
  };

  const toggleSelectSong = (id: string) => {
    setSelectedSongIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 20) {
        setStatusFeedback('Maximum 20 songs can be selected at a time.');
        setTimeout(() => setStatusFeedback(null), 3000);
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleSelectFirst20 = () => {
    const withYt = downloadableSongs.filter(
      (s) => s.youtubeUrl || s.youtubeVideoId || s.youtubePlaylistId
    );
    const toPick = (withYt.length > 0 ? withYt : downloadableSongs).slice(0, 20);
    setSelectedSongIds(toPick.map((s) => s.id));
    setStatusFeedback(`Selected ${toPick.length} songs for download.`);
    setTimeout(() => setStatusFeedback(null), 3000);
  };

  const handleDeselectAll = () => {
    setSelectedSongIds([]);
  };

  const handleStartBatchDownload = async () => {
    const toDownload = downloadableSongs.filter((s) => selectedSongIds.includes(s.id));
    if (toDownload.length === 0) {
      if (targetSongId && youtubeUrl.trim()) {
        await handleStartDownload();
        return;
      }
      setStatusFeedback('Please select up to 20 songs from the list below to download.');
      return;
    }

    setIsProcessing(true);
    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toDownload.length; i++) {
      const song = toDownload[i];
      const title = song.titleBn || song.titleLatin || `Track ${i + 1}`;
      const rawUrl =
        song.youtubeUrl ||
        (song.youtubeVideoId ? `https://www.youtube.com/watch?v=${song.youtubeVideoId}` : '') ||
        (song.youtubePlaylistId ? `https://www.youtube.com/playlist?list=${song.youtubePlaylistId}` : '') ||
        (selectedSongIds.length === 1 ? youtubeUrl.trim() : '');

      if (!rawUrl) {
        setStatusFeedback(`[${i + 1}/${toDownload.length}] Skipped "${title}" (no YouTube link).`);
        failedCount++;
        continue;
      }

      const ytMatch = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
      const sanitizedUrl = ytMatch && ytMatch[1] ? `https://www.youtube.com/watch?v=${ytMatch[1]}` : rawUrl;

      setStatusFeedback(`[${i + 1}/${toDownload.length}] Downloading "${title}"...`);

      const queueItem = await songRepository.addDownloadQueueItem({
        songId: song.id,
        youtubeUrl: sanitizedUrl,
        title,
        format,
        quality,
        status: 'extracting',
        progress: 20,
        error: null,
      });

      await refreshQueue();

      try {
        const settings = await songRepository.getSettings();
        const isLocalPcWeb = typeof window !== 'undefined' && window.location.port === '3000' && !nativeBridge.isNative();
        const serverBase = isLocalPcWeb ? '' : (settings.ytdlpServerUrl?.trim().replace(/\/$/, '') || 'https://yt-dlp-server-rr8t.onrender.com');
        const endpoint = serverBase
          ? `${serverBase}/download?url=${encodeURIComponent(sanitizedUrl)}&format=${format}&quality=${quality}`
          : `/api/audio/download?url=${encodeURIComponent(sanitizedUrl)}&format=${format}&quality=${quality}`;

        await songRepository.updateDownloadQueueItem(queueItem.id, {
          status: 'extracting',
          progress: 50,
        });

        const res = await fetch(endpoint);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const audioBlob = await res.blob();
        if (!audioBlob || audioBlob.size < 5000) {
          throw new Error('Audio stream was empty or blocked');
        }

        await songRepository.updateDownloadQueueItem(queueItem.id, {
          status: 'converting',
          progress: 90,
        });

        const meta: SongAudioMeta = {
          format,
          bitrate: `${quality}bps`,
          sizeBytes: audioBlob.size,
          durationSec: 180,
          sourceType: 'yt-download',
          localUri: null,
        };

        await songRepository.saveAudioBlob(song.id, audioBlob, `audio/${format}`, meta);
        await songRepository.updateDownloadQueueItem(queueItem.id, {
          status: 'completed',
          progress: 100,
        });

        const updated = await songRepository.getSongById(song.id);
        if (updated) onSongUpdated(updated);

        completedCount++;
        setSelectedSongIds((prev) => prev.filter((id) => id !== song.id));
      } catch (err: any) {
        failedCount++;
        await songRepository.updateDownloadQueueItem(queueItem.id, {
          status: 'failed',
          error: err?.message || 'Download failed',
        });
      }

      await refreshQueue();
      await refreshStorage();
    }

    setIsProcessing(false);
    setStatusFeedback(
      `Batch finished! ${completedCount} downloaded successfully${failedCount > 0 ? `, ${failedCount} skipped/failed` : ''}.`
    );
    setTimeout(() => setStatusFeedback(null), 6000);
  };

  const handleDeleteAudio = async (song: SongRecord) => {
    if (confirm(`Remove offline audio file for "${song.titleBn || song.titleLatin}"?`)) {
      await songRepository.deleteAudioBlob(song.id);
      const updated = await songRepository.getSongById(song.id);
      if (updated) onSongUpdated(updated);
      await refreshStorage();
    }
  };

  const handleClearDemoTracks = async () => {
    const blobs = await songRepository.getAllAudioBlobs();
    for (const b of blobs) {
      const song = allSongs.find((s) => s.id === b.songId);
      if (song?.audioMeta?.sourceType === 'demo-synth') {
        await songRepository.deleteAudioBlob(song.id);
        const updated = await songRepository.getSongById(song.id);
        if (updated) onSongUpdated(updated);
      }
    }
    await refreshStorage();
  };

  const handleClearAllStorage = async () => {
    if (confirm('Delete all offline cached audio files? Songs and lyrics will remain intact.')) {
      await songRepository.clearAllAudioBlobs();
      for (const s of allSongs) {
        if (s.hasAudio) {
          const updated = await songRepository.getSongById(s.id);
          if (updated) onSongUpdated(updated);
        }
      }
      await refreshStorage();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 select-none">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-[430px] h-full sm:h-[92dvh] sm:max-h-[890px] bg-[#080C16] light:bg-[#FFFFFF] bg-ambient-cosmic sm:rounded-[36px] sm:border sm:border-white/10 light:sm:border-black/10 flex flex-col text-[#F1F5F9] light:text-[#0F172A] overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <header
          className="px-5 pb-3 flex items-center justify-between border-b border-white/10 light:border-black/10 shrink-0"
          style={{
            paddingTop: 'calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-white/[0.08] light:bg-black/[0.05] border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6]">
              <FileAudio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white light:text-slate-900 tracking-tight">Audio Hub & Downloader</h2>
              <p className="text-[11px] text-[#94A3B8] light:text-slate-500">Offline MP3, M4A & Audio Storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 shrink-0">
          <div className="flex rounded-full bg-white/[0.05] light:bg-black/[0.04] border border-white/10 light:border-black/10 p-1">
            <button
              onClick={() => setActiveTab('download')}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'download'
                  ? 'btn-primary-gradient text-white shadow-md'
                  : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
              }`}
            >
              <Download className="w-3.5 h-3.5" /> Downloader
            </button>
            <button
              onClick={() => setActiveTab('queue')}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'queue'
                  ? 'btn-primary-gradient text-white shadow-md'
                  : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Queue ({queueItems.length})
            </button>
            <button
              onClick={() => setActiveTab('storage')}
              className={`flex-1 py-1.5 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'storage'
                  ? 'btn-primary-gradient text-white shadow-md'
                  : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" /> Storage ({storageStats.count})
            </button>
          </div>
        </div>

        {/* Feedback pill */}
        {statusFeedback && (
          <div className="px-5 pt-2 shrink-0">
            <div className="px-3.5 py-2 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 text-xs font-semibold text-[#C4B5FD] flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0 text-[#8B5CF6]" />
              <span className="truncate">{statusFeedback}</span>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 1: DOWNLOADER & ATTACHMENT
           ======================================================== */}
        {activeTab === 'download' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none">
            {/* Target Songs Multi-Select with Checkboxes (Up to 20) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block">
                    Target Songs (Select up to 20)
                  </label>
                  <span className="text-[10px] text-[#8B5CF6] font-semibold">
                    {selectedSongIds.length} of 20 selected • {downloadableSongs.length} available to download
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleSelectFirst20}
                    disabled={downloadableSongs.length === 0}
                    className="px-2.5 py-1 rounded-lg bg-white/10 light:bg-black/5 hover:bg-white/15 text-white light:text-slate-900 text-[11px] font-bold transition-all disabled:opacity-40"
                  >
                    Select First 20
                  </button>
                  {selectedSongIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeselectAll}
                      className="px-2 py-1 rounded-lg bg-red-500/10 text-red-300 text-[11px] font-medium transition-all"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Checkbox List (Downloaded songs excluded) */}
              <div className="max-h-52 overflow-y-auto rounded-[20px] bg-white/[0.03] light:bg-slate-50 border border-white/10 light:border-black/10 divide-y divide-white/[0.05] light:divide-black/[0.05] p-1.5 scrollbar-none">
                {downloadableSongs.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#94A3B8]">
                    🎉 All songs in your library already have offline audio downloaded!
                  </div>
                ) : (
                  downloadableSongs.map((song) => {
                    const isChecked = selectedSongIds.includes(song.id);
                    const hasYtLink = Boolean(
                      song.youtubeUrl || song.youtubeVideoId || song.youtubePlaylistId
                    );
                    return (
                      <div
                        key={song.id}
                        onClick={() => {
                          toggleSelectSong(song.id);
                          setTargetSongId(song.id);
                          const resolved =
                            song.youtubeUrl ||
                            (song.youtubeVideoId ? `https://www.youtube.com/watch?v=${song.youtubeVideoId}` : '') ||
                            (song.youtubePlaylistId ? `https://www.youtube.com/playlist?list=${song.youtubePlaylistId}` : '');
                          if (resolved) setYoutubeUrl(resolved);
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-white'
                            : 'hover:bg-white/[0.04] light:hover:bg-black/[0.03] text-[#94A3B8]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-[#64748B] shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold font-bengali truncate text-white light:text-slate-900">
                              {song.titleBn || song.titleLatin}
                            </p>
                            <p className="text-[10px] text-[#64748B] truncate">
                              {song.titleLatin}
                            </p>
                          </div>
                        </div>

                        {hasYtLink ? (
                          <span className="text-[9px] font-bold text-rose-300 light:text-rose-600 bg-rose-500/15 px-2 py-0.5 rounded-md shrink-0">
                            YouTube Attached
                          </span>
                        ) : (
                          <span className="text-[9px] text-[#64748B] bg-white/5 px-2 py-0.5 rounded-md shrink-0">
                            Custom Link
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* YouTube URL Input */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block mb-1.5">
                YouTube Song or Playlist URL
              </label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full h-12 rounded-[20px] bg-white/[0.04] light:bg-slate-100 border border-white/10 light:border-black/10 px-4 text-xs text-white light:text-slate-900 placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
              />
            </div>

            {/* Format & Bitrate Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block mb-1.5">
                  Audio Format
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['mp3', 'm4a', 'opus', 'wav', 'flac'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFormat(f)}
                      className={`py-2 rounded-xl text-xs font-bold uppercase transition-all border ${
                        format === f
                          ? 'btn-primary-gradient text-white border-transparent'
                          : 'bg-white/5 light:bg-black/5 border-white/10 light:border-black/10 text-[#94A3B8]'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block mb-1.5">
                  Target Bitrate
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {['320k', '256k', '192k', '128k'].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuality(q)}
                      className={`py-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                        quality === q
                          ? 'btn-primary-gradient text-white border-transparent'
                          : 'bg-white/5 light:bg-black/5 border-white/10 light:border-black/10 text-[#94A3B8]'
                      }`}
                    >
                      {q}bps
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Action 1: Download button */}
            <button
              onClick={selectedSongIds.length > 1 ? handleStartBatchDownload : handleStartDownload}
              disabled={
                isProcessing ||
                (selectedSongIds.length === 0 && !youtubeUrl.trim()) ||
                (selectedSongIds.length > 0 && downloadableSongs.length === 0)
              }
              className={`w-full py-3.5 rounded-[22px] font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all ${
                isProcessing ||
                (selectedSongIds.length === 0 && !youtubeUrl.trim()) ||
                (selectedSongIds.length > 0 && downloadableSongs.length === 0)
                  ? 'bg-white/5 light:bg-black/5 text-white/40 border border-white/10 cursor-not-allowed'
                  : 'btn-primary-gradient text-white hover:scale-[1.01] active:scale-95'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>
                {isProcessing
                  ? 'Processing Download Queue...'
                  : selectedSongIds.length > 1
                  ? `Download Selected ${selectedSongIds.length} Songs (Batch Queue)`
                  : 'Download & Cache Offline'}
              </span>
            </button>

            {/* Divider */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-white/10 light:border-black/10"></div>
              <span className="flex-shrink mx-3 text-[10px] font-bold text-[#94A3B8] uppercase">
                Or Attach Device Audio
              </span>
              <div className="flex-grow border-t border-white/10 light:border-black/10"></div>
            </div>

            {/* Action 2: Pick Local Audio File */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLocalFileSelect}
              accept="audio/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-[20px] bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 hover:border-white/20 text-white light:text-slate-800 font-semibold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <FolderOpen className="w-4 h-4 text-[#8B5CF6]" />
              <span>Attach Audio from Device (MP3 / FLAC / M4A)</span>
            </button>
          </div>
        )}

        {/* ========================================================
            TAB 2: DOWNLOAD QUEUE
           ======================================================== */}
        {activeTab === 'queue' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-none">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#94A3B8] light:text-slate-500">Download Jobs</span>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  🌊 Waterfall Cascade (3-Tier Engine)
                </span>
              </div>
              <button
                onClick={async () => {
                  await songRepository.clearCompletedDownloads();
                  await refreshQueue();
                }}
                className="text-xs text-[#94A3B8] hover:text-white"
              >
                Clear Finished
              </button>
            </div>

            {queueItems.length === 0 ? (
              <div className="text-center py-16 text-[#94A3B8]">
                <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold text-white light:text-slate-900">Queue is empty</p>
                <p className="text-xs mt-1">Downloaded songs will appear here.</p>
              </div>
            ) : (
              queueItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-slate-100 border border-white/10 light:border-black/10 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-bold text-white light:text-slate-900 truncate font-bengali">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-[#94A3B8]">
                        {item.format.toUpperCase()} • {item.quality}
                      </div>
                    </div>
                    <div>
                      {item.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </span>
                      ) : item.status === 'failed' ? (
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-400">
                            <AlertCircle className="w-3.5 h-3.5" /> Failed
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRetryDownload(item)}
                            disabled={isProcessing}
                            className="px-2.5 py-1 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-[10px] font-bold text-purple-200 flex items-center gap-1 transition-all active:scale-95 border border-purple-500/30 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3 text-purple-300" />
                            <span>Retry</span>
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {item.status}...
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-white/10 light:bg-black/10 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        item.status === 'completed'
                          ? 'bg-emerald-400'
                          : item.status === 'failed'
                          ? 'bg-red-500'
                          : 'bg-[#8B5CF6]'
                      }`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>

                  {item.error && <p className="text-[10px] text-red-300">{item.error}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================================
            TAB 3: OFFLINE STORAGE MANAGER
           ======================================================== */}
        {activeTab === 'storage' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-none">
            {/* Storage Summary Card */}
            <div className="p-4 rounded-[26px] bg-white/[0.04] light:bg-slate-100 border border-white/10 light:border-black/10 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block">
                  Offline Audio Usage
                </span>
                <div className="text-xl font-extrabold text-white light:text-slate-900 mt-0.5">
                  {(storageStats.totalSizeBytes / (1024 * 1024)).toFixed(1)} MB
                </div>
                <div className="text-xs text-[#8B5CF6] font-semibold">
                  {storageStats.count} cached audio files
                </div>
              </div>

              {storageStats.count > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleClearDemoTracks}
                    className="px-2.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold active:scale-95"
                    title="Remove synthesized demo files"
                  >
                    Wipe Demos
                  </button>
                  <button
                    onClick={handleClearAllStorage}
                    className="px-2.5 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-semibold flex items-center gap-1 active:scale-95"
                  >
                    <Trash2 className="w-3 h-3" /> Clear All
                  </button>
                </div>
              )}
            </div>

            {/* List of songs with offline audio */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-[#94A3B8] light:text-slate-500 block">
                Cached Offline Songs ({audioSongList.length})
              </span>

              {audioSongList.length === 0 ? (
                <div className="text-center py-12 text-[#94A3B8]">
                  <p className="text-sm">No audio files cached yet.</p>
                  <p className="text-xs mt-1">Use the Downloader tab to attach or download audio.</p>
                </div>
              ) : (
                audioSongList.map((song) => (
                  <div
                    key={song.id}
                    className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-slate-100 border border-white/10 light:border-black/10 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-bold text-white light:text-slate-900 truncate font-bengali">
                        {song.titleBn || song.titleLatin}
                      </h4>
                      <p className="text-[10px] text-[#94A3B8] flex items-center gap-1.5 mt-0.5">
                        {song.audioMeta?.sourceType === 'demo-synth' && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/15 px-1.5 py-0.2 rounded border border-amber-500/30">
                            Demo Synth
                          </span>
                        )}
                        {song.audioMeta?.sourceType === 'yt-download' && (
                          <span className="text-[9px] font-bold text-[#8B5CF6] bg-[#8B5CF6]/15 px-1.5 py-0.2 rounded border border-[#8B5CF6]/30">
                            YouTube
                          </span>
                        )}
                        {song.audioMeta?.sourceType === 'local-file' && (
                          <span className="text-[9px] font-bold text-sky-400 bg-sky-500/15 px-1.5 py-0.2 rounded border border-sky-500/30">
                            Device
                          </span>
                        )}
                        <span>
                          {song.audioMeta?.format?.toUpperCase() || 'AUDIO'} •{' '}
                          {song.audioMeta?.sizeBytes
                            ? (song.audioMeta.sizeBytes / (1024 * 1024)).toFixed(1) + ' MB'
                            : 'Cached'}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => {
                          playSong(song);
                          onClose();
                        }}
                        className="w-8 h-8 rounded-full btn-primary-gradient text-white flex items-center justify-center active:scale-90"
                        title="Play"
                      >
                        <Play className="w-4 h-4 ml-0.5 fill-current" />
                      </button>
                      <button
                        onClick={() => handleDeleteAudio(song)}
                        className="w-8 h-8 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] hover:text-red-400 active:scale-90"
                        title="Delete audio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
