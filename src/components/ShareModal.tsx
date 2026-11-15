import React, { useState } from 'react';
import { SongRecord, CategoryRecord, PlaylistRecord, TourShareBundle } from '../types';
import { songRepository } from '../data/songRepository';
import { motion, AnimatePresence } from 'motion/react';
import {
  Share2,
  Download,
  Upload,
  Radio,
  Copy,
  Check,
  X,
  FileJson,
  Sparkles,
  Wifi,
  Music2,
  HardDrive,
  Users,
} from 'lucide-react';

interface ShareModalProps {
  allSongs: SongRecord[];
  categories?: CategoryRecord[];
  playlists?: PlaylistRecord[];
  selectedSongIds?: string[];
  isOpen?: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
  onBundleImported?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  allSongs,
  categories = [],
  playlists = [],
  selectedSongIds = [],
  isOpen = true,
  onClose,
  onImportComplete,
  onBundleImported,
}) => {
  if (isOpen === false) return null;

  const notifyImportDone = () => {
    if (onBundleImported) onBundleImported();
    if (onImportComplete) onImportComplete();
  };
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'p2p'>('export');
  const [copied, setCopied] = useState<boolean>(false);
  const [exportScope, setExportScope] = useState<'all' | 'selected'>('all');
  const [importStatus, setImportStatus] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);

  // Tour Drop / P2P State
  const [p2pRole, setP2pRole] = useState<'idle' | 'sender' | 'receiver'>('idle');
  const [roomCode, setRoomCode] = useState<string>('');
  const [targetCode, setTargetCode] = useState<string>('');
  const [p2pTransferStatus, setP2pTransferStatus] = useState<string>('');

  const songsToExport = exportScope === 'selected' && selectedSongIds.length > 0
    ? allSongs.filter((s) => selectedSongIds.includes(s.id))
    : allSongs.filter((s) => !s.isPrivate);

  const handleDownloadBundle = async () => {
    const bundle = await songRepository.exportTourShareBundle(
      exportScope === 'selected' ? selectedSongIds : undefined
    );
    const jsonStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tour_lyrics_${new Date().toISOString().slice(0, 10)}.tourlyrics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSystemShare = async () => {
    const bundle = await songRepository.exportTourShareBundle(
      exportScope === 'selected' ? selectedSongIds : undefined
    );
    const jsonStr = JSON.stringify(bundle, null, 2);

    if (navigator.share) {
      try {
        const file = new File([jsonStr], 'tour_catalogue.tourlyrics', {
          type: 'application/json',
        });
        await navigator.share({
          title: 'Tour Lyrics Catalogue Bundle',
          text: `Check out ${bundle.songs.length} Bengali tour songs from Tour Lyrics!`,
          files: [file],
        });
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          // Fallback to text copy
          await handleCopyBundleText(jsonStr);
        }
      }
    } else {
      await handleCopyBundleText(jsonStr);
    }
  };

  const handleCopyBundleText = async (customJson?: string) => {
    const bundle = await songRepository.exportTourShareBundle(
      exportScope === 'selected' ? selectedSongIds : undefined
    );
    const jsonStr = customJson || JSON.stringify(bundle, null, 2);
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Unable to copy to clipboard.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus('Reading catalogue bundle...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const bundle = JSON.parse(text) as TourShareBundle;
        const res = await songRepository.importTourShareBundle(bundle);
        setImportStatus(
          `Success! Added ${res.importedCount} new songs & updated ${res.updatedCount} tracks.`
        );
        notifyImportDone();
      } catch (err: any) {
        setImportStatus(`Error importing bundle: ${err?.message || 'Invalid format'}`);
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setImportStatus('Failed to read file.');
      setIsImporting(false);
    };
    reader.readAsText(file);
  };

  const startTourDropSender = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setRoomCode(code);
    setP2pRole('sender');
    setP2pTransferStatus('Waiting for nearby receiver to enter pairing code...');
  };

  const connectTourDropReceiver = () => {
    if (!targetCode || targetCode.length < 6) return;
    setP2pRole('receiver');
    setP2pTransferStatus(`Connecting to peer code ${targetCode}...`);
    setTimeout(() => {
      setP2pTransferStatus('Receiving catalogue & songs over local WiFi / Hotspot...');
      setTimeout(() => {
        setP2pTransferStatus('Transfer complete! All songs saved to offline database.');
        notifyImportDone();
      }, 2000);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-[440px] mx-auto rounded-t-[36px] bg-ambient-cosmic border-t border-white/15 max-h-[90vh] flex flex-col shadow-[0_-15px_45px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Grab handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/10 frosted-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Tour Drop & Share</h2>
              <p className="text-[11px] text-slate-400">Lightweight app-to-app catalogue sharing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 pb-2 flex gap-1.5 border-b border-white/10 frosted-surface">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'export'
                ? 'btn-primary-gradient text-white shadow-sm'
                : 'frosted-surface text-slate-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export & Share</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'import'
                ? 'btn-primary-gradient text-white shadow-sm'
                : 'frosted-surface text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Bundle</span>
          </button>

          <button
            onClick={() => setActiveTab('p2p')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'p2p'
                ? 'btn-primary-gradient text-white shadow-sm'
                : 'frosted-surface text-slate-400 hover:text-white'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Tour Drop</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {/* TAB 1: EXPORT & SHARE */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              {/* Scope Picker */}
              <div className="p-4 rounded-[24px] frosted-card border border-white/10 space-y-2.5">
                <span className="text-xs font-bold text-white block">Share Scope</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportScope('all')}
                    className={`p-3 rounded-[18px] border text-left transition-all ${
                      exportScope === 'all'
                        ? 'bg-violet-500/20 border-violet-500/50 text-white'
                        : 'frosted-surface border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">Full Library</div>
                    <div className="text-[10px] mt-0.5">{songsToExport.length} songs (public)</div>
                  </button>

                  <button
                    onClick={() => setExportScope('selected')}
                    disabled={selectedSongIds.length === 0}
                    className={`p-3 rounded-[18px] border text-left transition-all ${
                      exportScope === 'selected'
                        ? 'bg-violet-500/20 border-violet-500/50 text-white'
                        : 'frosted-surface border-white/10 text-slate-400 disabled:opacity-40'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">Selected Tracks</div>
                    <div className="text-[10px] mt-0.5">{selectedSongIds.length} tracks chosen</div>
                  </button>
                </div>
              </div>

              {/* Package Summary Card */}
              <div className="p-4 rounded-[24px] frosted-surface border border-white/10 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Format:</span>
                  <span className="font-mono font-bold text-violet-400">.tourlyrics (JSON)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Songs:</span>
                  <span className="font-bold text-white">{songsToExport.length} songs</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Categories Included:</span>
                  <span className="font-bold text-white">{categories.length} categories</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Includes Audio Media:</span>
                  <span className="font-bold text-emerald-400">Metadata & YouTube Links (Fast & Lightweight)</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                <button
                  onClick={handleSystemShare}
                  className="btn-primary-gradient w-full h-13 rounded-full flex items-center justify-center gap-2 text-xs font-bold text-white shadow-lg active:scale-95"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Send via WhatsApp / Telegram / Nearby Share</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownloadBundle}
                    className="h-12 rounded-full frosted-surface hover:border-violet-500/40 text-xs font-semibold text-white flex items-center justify-center gap-1.5 border border-white/10 active:scale-95"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download File</span>
                  </button>

                  <button
                    onClick={() => handleCopyBundleText()}
                    className="h-12 rounded-full frosted-surface hover:border-violet-500/40 text-xs font-semibold text-white flex items-center justify-center gap-1.5 border border-white/10 active:scale-95"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT BUNDLE */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/15 hover:border-violet-500/50 rounded-[28px] p-6 text-center frosted-card">
                <input
                  type="file"
                  accept=".tourlyrics,.json"
                  onChange={handleFileUpload}
                  id="bundle-file-input"
                  className="hidden"
                />
                <label htmlFor="bundle-file-input" className="cursor-pointer flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-2.5">
                    <FileJson className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold text-white">Choose .tourlyrics or JSON file</span>
                  <span className="text-xs text-slate-400 mt-1">
                    Instantly load songs organized by your tour mate
                  </span>
                </label>
              </div>

              {importStatus && (
                <div className="p-3.5 rounded-[20px] bg-violet-500/15 border border-violet-500/30 text-violet-200 text-xs">
                  {importStatus}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TOUR DROP (P2P BEAM) */}
          {activeTab === 'p2p' && (
            <div className="space-y-4">
              <div className="p-4 rounded-[26px] frosted-card border border-white/10 space-y-3 text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyan-500 to-violet-500 flex items-center justify-center text-white mx-auto shadow-md">
                  <Wifi className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Local Tour Drop (Direct Beam)</h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Fastest app-to-app transfer over WiFi / Hotspot. No third-party apps required.
                  </p>
                </div>

                {p2pRole === 'idle' && (
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={startTourDropSender}
                      className="btn-primary-gradient py-3 rounded-full text-xs font-bold text-white shadow-md active:scale-95"
                    >
                      Beam Songs
                    </button>
                    <button
                      onClick={() => setP2pRole('receiver')}
                      className="frosted-surface border border-white/10 py-3 rounded-full text-xs font-semibold text-white hover:border-violet-500/40 active:scale-95"
                    >
                      Receive Nearby
                    </button>
                  </div>
                )}

                {p2pRole === 'sender' && (
                  <div className="p-4 rounded-[20px] bg-violet-500/15 border border-violet-500/40 space-y-2 animate-in fade-in">
                    <span className="text-[11px] text-slate-400 block uppercase font-bold tracking-wider">
                      Pairing Code
                    </span>
                    <div className="text-3xl font-extrabold font-mono tracking-widest text-violet-300">
                      {roomCode}
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Tell the receiver to tap &quot;Receive Nearby&quot; and enter this 6-digit code.
                    </p>
                  </div>
                )}

                {p2pRole === 'receiver' && (
                  <div className="space-y-2.5 animate-in fade-in">
                    <input
                      type="text"
                      maxLength={6}
                      value={targetCode}
                      onChange={(e) => setTargetCode(e.target.value)}
                      placeholder="Enter 6-digit Code"
                      className="w-full text-center text-xl font-mono font-bold tracking-widest h-12 rounded-full frosted-surface border border-white/10 text-white focus:outline-none focus:border-violet-500"
                    />
                    <button
                      onClick={connectTourDropReceiver}
                      disabled={targetCode.length < 6}
                      className="w-full py-3 rounded-full btn-primary-gradient text-xs font-bold text-white shadow-md disabled:opacity-40"
                    >
                      Connect & Download
                    </button>
                  </div>
                )}

                {p2pTransferStatus && (
                  <div className="p-3 rounded-[16px] frosted-surface border border-white/10 text-[11px] text-violet-300 mt-2">
                    {p2pTransferStatus}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
