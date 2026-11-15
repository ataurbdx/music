import React, { useState, useEffect } from 'react';
import { SongRecord, CategoryRecord, LyricsStatus } from '../types';
import { songRepository } from '../data/songRepository';
import { firebaseSync } from '../services/firebaseSync';
import { geminiService } from '../services/gemini';
import {
  extractYouTubeVideoId,
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
  cleanYouTubeUrl,
  fetchYouTubeOEmbed,
} from '../lib/youtube';
import {
  X,
  Check,
  Sparkles,
  Youtube,
  Plus,
  AlertCircle,
  HelpCircle,
  Eye,
  Lock,
  Globe,
} from 'lucide-react';

interface SongEditorProps {
  initialSong?: SongRecord | null;
  categories: CategoryRecord[];
  onSave: (savedSong: SongRecord) => void;
  onCancel: () => void;
}

export const SongEditor: React.FC<SongEditorProps> = ({
  initialSong,
  categories,
  onSave,
  onCancel,
}) => {
  const [titleLatin, setTitleLatin] = useState(initialSong?.titleLatin || '');
  const [titleBn, setTitleBn] = useState(initialSong?.titleBn || '');
  const [categoryId, setCategoryId] = useState(
    initialSong?.categoryId || categories[0]?.id || 'other'
  );
  const [youtubeUrl, setYoutubeUrl] = useState(initialSong?.youtubeUrl || '');
  const [lyricsBn, setLyricsBn] = useState(initialSong?.lyricsBn || '');
  const [lyricsStatus, setLyricsStatus] = useState<LyricsStatus>(
    initialSong?.lyricsStatus || 'missing'
  );
  const [notes, setNotes] = useState(initialSong?.notes || '');
  const [aliases, setAliases] = useState<string[]>(initialSong?.aliases || []);
  const [newAlias, setNewAlias] = useState('');
  const [isPrivate, setIsPrivate] = useState<boolean>(initialSong?.isPrivate || false);

  const [isSuggesting, setIsSuggesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [ytThumbnail, setYtThumbnail] = useState<string>(
    initialSong?.thumbnailUrl || (initialSong?.youtubeVideoId ? buildYouTubeThumbnailUrl(initialSong.youtubeVideoId) : '')
  );

  // Auto-extract thumbnail and validate when YouTube URL changes
  useEffect(() => {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (videoId) {
      setYtThumbnail(buildYouTubeThumbnailUrl(videoId));
    } else {
      setYtThumbnail('');
    }
  }, [youtubeUrl]);

  const handleFetchYoutubeInfo = async () => {
    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      setErrorMsg('Please enter a valid YouTube link first.');
      return;
    }
    setErrorMsg('');
    setIsSuggesting(true);
    try {
      const info = await fetchYouTubeOEmbed(youtubeUrl);
      if (info && info.title) {
        if (!titleLatin && !titleBn) {
          setTitleLatin(info.title);
        }
        if (info.authorName && !aliases.includes(info.authorName)) {
          setAliases([...aliases, info.authorName]);
        }
        if (info.thumbnailUrl) {
          setYtThumbnail(info.thumbnailUrl);
        }
      }
    } catch {
      setErrorMsg('Could not fetch YouTube title. Please type title manually.');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAddAlias = () => {
    if (!newAlias.trim()) return;
    if (!aliases.includes(newAlias.trim())) {
      setAliases([...aliases, newAlias.trim()]);
    }
    setNewAlias('');
  };

  const handleRemoveAlias = (idx: number) => {
    setAliases(aliases.filter((_, i) => i !== idx));
  };

  const handleSuggestAliases = async () => {
    if (!titleLatin.trim() && !titleBn.trim()) {
      setErrorMsg('Enter a title first to get AI alias suggestions.');
      return;
    }
    setErrorMsg('');
    setIsSuggesting(true);

    try {
      const result = await geminiService.suggestAliases(titleLatin, titleBn);
      if (result.titleBn && !titleBn) setTitleBn(result.titleBn);
      if (result.titleLatin && !titleLatin) setTitleLatin(result.titleLatin);
      if (Array.isArray(result.aliases)) {
        const merged = Array.from(new Set([...aliases, ...result.aliases]));
        setAliases(merged);
      }
    } catch (err: any) {
      setErrorMsg(`AI assist error: ${err?.message || 'Check connection or key in Settings.'}`);
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleLatin.trim() && !titleBn.trim()) {
      setErrorMsg('Song title is required in at least one script.');
      return;
    }

    try {
      const cleanUrl = cleanYouTubeUrl(youtubeUrl);
      const videoId = extractYouTubeVideoId(cleanUrl);
      const embedUrl = videoId ? buildYouTubeEmbedUrl(videoId, true) : undefined;
      const thumb = videoId ? (ytThumbnail || buildYouTubeThumbnailUrl(videoId)) : undefined;

      let saved: SongRecord;

      if (initialSong) {
        saved = await songRepository.updateSong(initialSong.id, {
          titleLatin: titleLatin.trim() || titleBn.trim(),
          titleBn: titleBn.trim() || titleLatin.trim(),
          aliases,
          categoryId,
          youtubeUrl: cleanUrl,
          youtubeVideoId: videoId,
          youtubeEmbedUrl: embedUrl,
          thumbnailUrl: thumb,
          lyricsBn: lyricsBn.trim(),
          lyricsStatus: lyricsBn.trim() ? lyricsStatus : 'missing',
          notes: notes.trim(),
          isPrivate,
        });
      } else {
        saved = await songRepository.addSong({
          titleLatin: titleLatin.trim() || titleBn.trim(),
          titleBn: titleBn.trim() || titleLatin.trim(),
          aliases,
          categoryId,
          youtubeUrl: cleanUrl,
          lyricsBn: lyricsBn.trim(),
          lyricsStatus: lyricsBn.trim() ? lyricsStatus : 'missing',
          lyricsOrigin: lyricsBn.trim() ? 'typed' : null,
          notes: notes.trim(),
          isPrivate,
        });
      }

      onSave(saved);
      firebaseSync.triggerSync().catch((e) => console.warn('Sync on save failed:', e));
    } catch (err: any) {
      setErrorMsg(`Failed to save song: ${err?.message || String(err)}`);
    }
  };

  const ytVideoId = extractYouTubeVideoId(youtubeUrl);

  return (
    <div className="flex flex-col h-full bg-[#080C16] bg-ambient-cosmic text-[#F1F5F9] relative overflow-hidden">
      {/* Top Header */}
      <header
        className="px-5 pb-3 flex items-center justify-between z-20 shrink-0 border-b border-white/[0.08] frosted-surface"
        style={{
          paddingTop: 'calc(12px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
        }}
      >
        <button
          onClick={onCancel}
          type="button"
          className="w-10 h-10 rounded-full frosted-surface border border-white/10 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 transition-all shadow-md"
          aria-label="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        <h1 className="text-base font-bold text-white tracking-tight">
          {initialSong ? 'Edit Song & Lyrics' : 'Add New Tour Song'}
        </h1>

        <button
          onClick={handleSubmit}
          type="button"
          className="h-10 px-4 rounded-full btn-primary-gradient flex items-center gap-1.5 text-xs font-bold shadow-lg active:scale-95 transition-all"
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          <span>Save</span>
        </button>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto pb-20">
          {errorMsg && (
            <div className="p-3.5 rounded-[20px] bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex items-center gap-2.5 shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Privacy & Community Visibility Switch */}
          <div className="p-3.5 rounded-[24px] frosted-card border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPrivate ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                {isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  {isPrivate ? 'Private Track (Device Only)' : 'Community Shared (Visible to All)'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isPrivate ? 'Stored strictly on this device, never synced to cloud' : 'Syncs with tour mates & community'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                isPrivate
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {isPrivate ? 'Private' : 'Shared'}
            </button>
          </div>

          {/* Bengali Title */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Bengali Title (বাংলা নাম)
            </label>
            <input
              type="text"
              value={titleBn}
              onChange={(e) => setTitleBn(e.target.value)}
              placeholder="e.g. মিলন হবে কত দিনে"
              className="w-full px-4 py-3 rounded-[20px] frosted-surface border border-white/10 text-white font-bengali text-sm focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Latin Title & AI Button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                English / Latin Title
              </label>
              <button
                type="button"
                onClick={handleSuggestAliases}
                disabled={isSuggesting}
                className="text-xs text-violet-400 hover:underline font-semibold flex items-center gap-1 active:scale-95 disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSuggesting ? 'Thinking...' : 'AI Title & Aliases'}</span>
              </button>
            </div>
            <input
              type="text"
              value={titleLatin}
              onChange={(e) => setTitleLatin(e.target.value)}
              placeholder="e.g. Milon Hobe Koto Dine"
              className="w-full px-4 py-3 rounded-[20px] frosted-surface border border-white/10 text-white text-sm focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Category Pill Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Category / Genre
            </label>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => {
                const isSelected = categoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                      isSelected
                        ? 'btn-primary-gradient text-white shadow-md'
                        : 'frosted-surface text-slate-400 border border-white/10 hover:text-white'
                    }`}
                  >
                    {cat.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* YouTube Link with Auto-Validation & Thumbnail Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                YouTube Video Link
              </label>
              {ytVideoId && (
                <button
                  type="button"
                  onClick={handleFetchYoutubeInfo}
                  disabled={isSuggesting}
                  className="text-[11px] text-violet-400 hover:underline font-semibold flex items-center gap-1 active:scale-95"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Fetch Title</span>
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                className="w-full px-4 py-3 rounded-[20px] frosted-surface border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-violet-500 pr-10"
              />
              <Youtube className="w-4 h-4 text-rose-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* YouTube preview badge */}
            {ytVideoId && (
              <div className="p-2.5 rounded-[18px] frosted-card border border-violet-500/30 flex items-center gap-3">
                {ytThumbnail && (
                  <img
                    src={ytThumbnail}
                    alt="Thumbnail"
                    className="w-14 h-10 rounded-lg object-cover border border-white/10"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                    ✓ Valid YouTube Video • Direct In-App Play Ready
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono truncate block">
                    Video ID: {ytVideoId}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Aliases */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Search Aliases & Alternative Spellings
            </label>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAlias();
                  }
                }}
                placeholder="Add alias (e.g. Lalon song)"
                className="flex-1 px-4 py-2.5 rounded-full frosted-surface border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={handleAddAlias}
                className="w-10 h-10 rounded-full frosted-surface border border-white/10 text-white flex items-center justify-center active:scale-90"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {aliases.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aliases.map((alias, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs frosted-surface text-slate-300 border border-white/10"
                  >
                    <span>{alias}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAlias(i)}
                      className="text-slate-400 hover:text-rose-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Review Status Pill Selector */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Lyrics Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'reviewed', label: 'Reviewed' },
                { id: 'unreviewed', label: 'Pending' },
                { id: 'missing', label: 'Missing' },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setLyricsStatus(st.id as any)}
                  className={`py-2 rounded-full text-xs font-semibold border transition-all ${
                    lyricsStatus === st.id
                      ? st.id === 'reviewed'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400/50 shadow-sm'
                        : st.id === 'unreviewed'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-400/50 shadow-sm'
                        : 'bg-white/10 text-white border-white/20'
                      : 'frosted-surface text-slate-400 border-white/10'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Bengali Lyrics Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Bengali Lyrics (বাংলা লিরিক্স)
              </label>
              <button
                type="button"
                onClick={async () => {
                  const songTitle = titleBn.trim() || titleLatin.trim();
                  if (!songTitle) {
                    setErrorMsg('Please enter a song title first.');
                    return;
                  }
                  setErrorMsg('');
                  setIsSuggesting(true);
                  try {
                    const res = await geminiService.lookupLyrics(songTitle);
                    if (res.found && res.lyricsBn) {
                      setLyricsBn(res.lyricsBn);
                      setLyricsStatus('unreviewed');
                      if (res.notes && !notes) setNotes(res.notes);
                    } else {
                      setErrorMsg(`Authentic recorded lyrics for "${songTitle}" not found in AI knowledge base. Please paste manually.`);
                    }
                  } catch (err: any) {
                    setErrorMsg(`Lookup failed: ${err?.message || 'Check connection.'}`);
                  } finally {
                    setIsSuggesting(false);
                  }
                }}
                disabled={isSuggesting}
                className="text-xs text-violet-400 hover:underline font-semibold flex items-center gap-1 active:scale-95 disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSuggesting ? 'Looking up...' : 'Auto-Lookup Lyrics'}</span>
              </button>
            </div>
            <textarea
              rows={10}
              value={lyricsBn}
              onChange={(e) => {
                setLyricsBn(e.target.value);
                if (e.target.value && lyricsStatus === 'missing') {
                  setLyricsStatus('unreviewed');
                }
              }}
              placeholder="Paste or type Bengali lyrics here..."
              className="w-full p-4 rounded-[22px] frosted-surface border border-white/10 text-white font-bengali text-sm leading-relaxed focus:outline-none focus:border-violet-500"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Notes / Artist info
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Traditional Baul, key of D..."
              className="w-full p-3.5 rounded-[20px] frosted-surface border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
            />
          </div>
        </form>
      </main>
    </div>
  );
};
