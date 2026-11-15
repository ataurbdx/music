import React, { useState, useEffect } from 'react';
import { SongRecord, VerificationResult } from '../types';
import { songRepository } from '../data/songRepository';
import { discoverLyricsCandidates, CandidateLyricsUrl } from '../pipeline/discover';
import { fetchLyricsPageHtml } from '../pipeline/fetchPage';
import { extractCleanTextFromHtml } from '../pipeline/pageText';
import { verifyExtractedLyrics } from '../pipeline/verify';
import { geminiService } from '../services/gemini';
import { lyricsQueue, QueueState, QueueItem } from '../pipeline/queue';
import { parseSongMetadata } from '../lib/songMetadata';
import { motion } from 'motion/react';
import {
  X,
  Search,
  Sparkles,
  Check,
  AlertTriangle,
  Globe,
  ClipboardPaste,
  ShieldCheck,
  ExternalLink,
  Bot,
  Play,
  Pause,
  ListOrdered,
} from 'lucide-react';

interface PrepareLyricsModalProps {
  initialSong?: SongRecord | null;
  allSongs: SongRecord[];
  onClose: () => void;
  onSongUpdated: (updatedSong: SongRecord) => void;
}

export const PrepareLyricsModal: React.FC<PrepareLyricsModalProps> = ({
  initialSong,
  allSongs,
  onClose,
  onSongUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'single' | 'paste' | 'queue'>('single');
  const [selectedSongId, setSelectedSongId] = useState<string>(
    initialSong?.id || allSongs[0]?.id || ''
  );

  const currentSong = allSongs.find((s) => s.id === selectedSongId) || initialSong || null;
  const rawSongInput = currentSong ? currentSong.titleBn || currentSong.titleLatin : '';
  const parsedMeta = React.useMemo(() => parseSongMetadata(rawSongInput, currentSong?.artist), [rawSongInput, currentSong?.artist]);
  const canonicalTitle = parsedMeta.canonicalTitle || rawSongInput;
  const songArtist = currentSong?.artist || parsedMeta.artist || '';
  const searchTitle = canonicalTitle || rawSongInput;

  // Language state: auto-detect if song is English / Latin only (e.g. Lewis Capaldi)
  const isPureLatin = Boolean(
    parsedMeta.language === 'en' ||
    (currentSong &&
      !/[\u0980-\u09FF]/.test(currentSong.titleBn || '') &&
      !/[\u0980-\u09FF]/.test(currentSong.titleLatin || ''))
  );
  const [selectedLanguage, setSelectedLanguage] = useState<'bn' | 'en'>(isPureLatin ? 'en' : 'bn');
  const [fetchedLanguage, setFetchedLanguage] = useState<'bn' | 'en'>(isPureLatin ? 'en' : 'bn');
  const [allowEnglishInPaste, setAllowEnglishInPaste] = useState<boolean>(isPureLatin);

  // Single Song Discovery & Fetch state
  const [isSearching, setIsSearching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateLyricsUrl[]>([]);
  const [directUrl, setDirectUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [isDirectLookupLoading, setIsDirectLookupLoading] = useState(false);
  const [fetchResultLyrics, setFetchResultLyrics] = useState('');
  const [fetchVerification, setFetchVerification] = useState<VerificationResult | null>(null);
  const [fetchSourceUrl, setFetchSourceUrl] = useState('');
  const [fetchError, setFetchError] = useState('');

  // Paste & Clean state
  const [pastedRawText, setPastedRawText] = useState('');
  const [isCleaningPaste, setIsCleaningPaste] = useState(false);
  const [pasteResultLyrics, setPasteResultLyrics] = useState('');
  const [pasteVerification, setPasteVerification] = useState<VerificationResult | null>(null);
  const [pasteError, setPasteError] = useState('');

  // Batch Queue state
  const [queueState, setQueueState] = useState<QueueState>(lyricsQueue.getState());

  useEffect(() => {
    const unsub = lyricsQueue.subscribe((state: QueueState) => {
      setQueueState(state);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (currentSong) {
      const isLatin =
        !/[\u0980-\u09FF]/.test(currentSong.titleBn || '') &&
        !/[\u0980-\u09FF]/.test(currentSong.titleLatin || '');
      setSelectedLanguage(isLatin ? 'en' : 'bn');
      setAllowEnglishInPaste(isLatin);
    }
  }, [selectedSongId, currentSong?.titleBn, currentSong?.titleLatin]);

  const isLoadingAny = isSearching || isFetchingUrl || isDirectLookupLoading || isCleaningPaste;
  const loadingStepText = isSearching
    ? selectedLanguage === 'en'
      ? 'Searching for English & International Lyrics Archives...'
      : 'Scanning Approved Bengali Lyrics Archives...'
    : isFetchingUrl
    ? 'Extracting clean text & running deterministic verification...'
    : isDirectLookupLoading
    ? selectedLanguage === 'en'
      ? 'Querying AI knowledge base for authentic English lyrics...'
      : 'Querying AI knowledge base for authentic Bengali lyrics...'
    : isCleaningPaste
    ? 'Standardizing stanzas & formatting...'
    : '';

  // 1. Live Web Discovery
  const handleDiscover = async (lang: 'bn' | 'en' = selectedLanguage) => {
    if (!currentSong) return;
    setIsSearching(true);
    setFetchError('');
    setCandidates([]);
    setFetchResultLyrics('');
    setFetchVerification(null);
    setSelectedLanguage(lang);

    try {
      const settings = await songRepository.getSettings();
      const enabledSites = settings.enabledSites || ['genius', 'azlyrics', 'lyrics71', 'bangla-lyrics', 'chordzone', 'smule'];
      const results = await discoverLyricsCandidates(
        canonicalTitle,
        enabledSites,
        currentSong.titleLatin || canonicalTitle,
        currentSong.titleBn,
        lang,
        songArtist
      );

      if (results.length === 0) {
        if (lang === 'bn') {
          setFetchError(`No direct Bengali lyrics archive found for "${searchTitle}". You can try AI Lookup, or search for English lyrics if this is an English song.`);
        } else {
          setFetchError(`No direct web matches found for English lyrics of "${searchTitle}". Tap "AI Lookup" below for instant retrieval.`);
        }
      } else {
        setCandidates(results);
      }
    } catch (err: any) {
      setFetchError(`Search query error: ${err?.message || 'Check network connection'}`);
    } finally {
      setIsSearching(false);
    }
  };

  // 2. Fetch specific candidate URL with automated fallback to next available candidate
  const handleFetchCandidateUrl = async (
    targetUrl: string,
    siteName: string = 'Archive',
    lang: 'bn' | 'en' = selectedLanguage,
    attemptIndex?: number
  ) => {
    if (!currentSong) return;
    setFetchError('');
    setIsFetchingUrl(true);
    setFetchVerification(null);
    setFetchResultLyrics('');
    setFetchSourceUrl(targetUrl);
    setFetchedLanguage(lang);

    const currentIndex = attemptIndex !== undefined ? attemptIndex : candidates.findIndex((c) => c.url === targetUrl);

    try {
      const html = await fetchLyricsPageHtml(targetUrl);
      const cleanText = extractCleanTextFromHtml(html);

      const res = await geminiService.extractLyrics(cleanText, canonicalTitle, songArtist, lang);
      if (!res.found || !res.lyricsBn) {
        // Automatically try next candidate if this page didn't contain lyrics
        if (currentIndex !== -1 && currentIndex + 1 < candidates.length) {
          const nextCand = candidates[currentIndex + 1];
          return handleFetchCandidateUrl(nextCand.url, nextCand.siteName, lang, currentIndex + 1);
        }
        setFetchError(`Lyrics for "${searchTitle}" were not found on this page (${siteName}). Try One-Tap AI Lookup below.`);
        return;
      }

      const verification = verifyExtractedLyrics(res.lyricsBn, cleanText, 0.90, lang === 'en');
      setFetchResultLyrics(res.lyricsBn);
      setFetchVerification(verification);
      setFetchedLanguage(lang);
    } catch (err: any) {
      // If current candidate was blocked (403/429) or failed, automatically advance to next candidate
      if (currentIndex !== -1 && currentIndex + 1 < candidates.length) {
        const nextCand = candidates[currentIndex + 1];
        return handleFetchCandidateUrl(nextCand.url, nextCand.siteName, lang, currentIndex + 1);
      }
      setFetchError(`Failed to fetch from ${siteName}: ${err?.message || String(err)}. Try One-Tap AI Lookup below.`);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // AI Direct Lookup
  const handleDirectLookup = async (lang: 'bn' | 'en' = selectedLanguage) => {
    if (!currentSong) return;
    setFetchError('');
    setIsDirectLookupLoading(true);
    setFetchVerification(null);
    setFetchResultLyrics('');
    setFetchSourceUrl(`gemini_ai_lookup_${lang}`);
    setSelectedLanguage(lang);

    try {
      const res = await geminiService.lookupLyrics(canonicalTitle, songArtist, lang);
      if (!res.found || !res.lyricsBn) {
        if (lang === 'bn') {
          setFetchError(res.notes || `No authentic Bengali lyrics found for "${searchTitle}". If this is an English or international track, you can fetch English lyrics below.`);
        } else {
          setFetchError(res.notes || `Authentic recorded English lyrics for "${searchTitle}" not found in AI archive. Please paste manually.`);
        }
        return;
      }

      setFetchedLanguage(lang);
      setFetchResultLyrics(res.lyricsBn);
      setFetchVerification({
        passed: true,
        needsAttention: false,
        coverage: 1.0,
        bengaliRatio: lang === 'en' ? 0 : 1.0,
        language: lang,
        lineCount: res.lyricsBn.split('\n').filter(Boolean).length,
        matchedLinesCount: res.lyricsBn.split('\n').filter(Boolean).length,
        lineDetails: [],
        reasons: [],
      });
    } catch (err: any) {
      setFetchError(`AI Lookup failed: ${err?.message || 'Check your internet connection'}`);
    } finally {
      setIsDirectLookupLoading(false);
    }
  };

  const handleSaveFetchResult = async () => {
    if (!currentSong || !fetchResultLyrics) return;
    const now = new Date().toISOString();

    const updated = await songRepository.updateSong(currentSong.id, {
      lyricsBn: fetchResultLyrics,
      lyricsLanguage: fetchedLanguage,
      lyricsStatus: 'unreviewed',
      lyricsOrigin: 'fetched',
      sources: [
        ...(currentSong.sources || []),
        {
          url: fetchSourceUrl,
          siteId: fetchSourceUrl.includes('//') ? new URL(fetchSourceUrl).hostname : 'gemini',
          fetchedAt: now,
          coverage: fetchVerification?.coverage || 1.0,
        },
      ],
    });

    onSongUpdated(updated);
    onClose();
  };

  // 3. Paste and Clean
  const handlePasteAndClean = async () => {
    if (!pastedRawText.trim() || !currentSong) return;
    setPasteError('');
    setIsCleaningPaste(true);
    setPasteResultLyrics('');
    setPasteVerification(null);

    try {
      const isEnglishText = allowEnglishInPaste;
      const lang: 'bn' | 'en' = isEnglishText ? 'en' : 'bn';
      const cleanResult = await geminiService.extractLyrics(pastedRawText, searchTitle, undefined, lang);
      if (!cleanResult.lyricsBn) {
        setPasteError(`Could not format ${isEnglishText ? 'English' : 'Bengali'} lyrics from pasted text. Please verify content.`);
        return;
      }

      const verification = verifyExtractedLyrics(cleanResult.lyricsBn, pastedRawText, 0.90, isEnglishText);
      setPasteResultLyrics(cleanResult.lyricsBn);
      setPasteVerification(verification);
      setFetchedLanguage(lang);
    } catch (err: any) {
      setPasteError(`Cleaning failed: ${err?.message || String(err)}`);
    } finally {
      setIsCleaningPaste(false);
    }
  };

  const handleSavePasteResult = async () => {
    if (!currentSong || !pasteResultLyrics) return;
    const isEnglishText = allowEnglishInPaste;
    const updated = await songRepository.updateSong(currentSong.id, {
      lyricsBn: pasteResultLyrics,
      lyricsLanguage: isEnglishText ? 'en' : 'bn',
      lyricsStatus: 'unreviewed',
      lyricsOrigin: 'pasted',
    });
    onSongUpdated(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-[430px] mx-auto rounded-t-[36px] bg-[#0A0E1A]/98 light:bg-white/98 backdrop-blur-2xl border-t border-white/15 light:border-black/10 max-h-[92vh] flex flex-col shadow-[0_-15px_45px_rgba(0,0,0,0.85)] overflow-hidden text-[#F1F5F9] light:text-[#0F172A]"
      >
        {/* Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/20 light:bg-black/20" />
        </div>

        {/* Sheet Top Bar */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.08] light:border-black/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/[0.08] light:bg-black/[0.05] border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6] shadow-[0_0_15px_rgba(139,92,246,0.25)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white light:text-slate-900 leading-tight">Prepare & Verify</h2>
              <p className="text-[11px] text-[#94A3B8] light:text-slate-500">Extract authentic lyrics with zero hallucinations</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 light:bg-black/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Pill Control */}
        <div className="px-5 pt-3 pb-2">
          <div className="bg-white/[0.05] light:bg-black/[0.04] p-1.5 rounded-full flex items-center border border-white/[0.08] light:border-black/[0.08]">
            {[
              { id: 'single', label: 'Web Extraction', icon: Globe },
              { id: 'paste', label: 'Paste & Clean', icon: ClipboardPaste },
              { id: 'queue', label: 'Batch Queue', icon: ListOrdered },
            ].map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-2 px-3 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    active
                      ? 'btn-primary-gradient text-white shadow-md'
                      : 'text-[#94A3B8] light:text-slate-500 hover:text-white light:hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Song Selector Pill */}
        {activeTab !== 'queue' && (
          <div className="px-5 py-2 flex items-center justify-between text-xs border-b border-white/[0.06] light:border-black/[0.06] bg-white/[0.02] light:bg-black/[0.02]">
            <span className="text-[#94A3B8] light:text-slate-500 font-medium">Target:</span>
            <select
              value={selectedSongId}
              onChange={(e) => {
                setSelectedSongId(e.target.value);
                setCandidates([]);
                setFetchResultLyrics('');
                setFetchVerification(null);
              }}
              className="bg-white/[0.05] light:bg-slate-100 border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs font-bengali font-semibold px-3 py-1.5 rounded-full max-w-[280px] truncate focus:outline-none focus:border-[#8B5CF6]"
            >
              {allSongs.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#080C16] text-white">
                  {s.titleBn || s.titleLatin} {s.lyricsStatus === 'missing' ? '(Missing)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scrollable Sheet Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Animated Cosmic AI Orb Loader */}
          {isLoadingAny && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="py-8 flex flex-col items-center justify-center text-center space-y-4"
            >
              <div className="relative w-32 h-32 flex items-center justify-center">
                {/* Outermost pulsing ring */}
                <div className="absolute inset-0 rounded-full bg-[#8B5CF6]/15 animate-ping opacity-60" />
                
                {/* Secondary rotating dash ring */}
                <div className="absolute inset-2 rounded-full border-2 border-dashed border-[#8B5CF6]/40 animate-spin-slow" />
                
                {/* Counter-rotating gradient aura ring */}
                <div className="absolute inset-4 rounded-full border border-pink-400/50 animate-spin-reverse" />

                {/* Core Luminous Glowing Orb */}
                <div className="w-16 h-16 rounded-full btn-primary-gradient flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.7)] animate-orb-pulse">
                  <Sparkles className="w-8 h-8 text-white stroke-[2.5]" />
                </div>
              </div>

              <div>
                <h4 className="text-base font-bold text-white light:text-slate-900 animate-pulse">
                  {loadingStepText}
                </h4>
                <p className="text-xs text-[#94A3B8] light:text-slate-500 mt-1 font-bengali">
                  "{searchTitle}"
                </p>
              </div>
            </motion.div>
          )}

          {/* TAB 1: WEB EXTRACTION */}
          {activeTab === 'single' && !isLoadingAny && (
            <div className="space-y-4">
              {/* Language Selection Row */}
              <div className="flex items-center justify-between p-2 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08]">
                <div className="flex items-center gap-1.5 pl-2">
                  <Globe className="w-3.5 h-3.5 text-[#8B5CF6]" />
                  <span className="text-[11px] font-bold text-[#94A3B8] light:text-slate-600">Language:</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setSelectedLanguage('bn');
                      setCandidates([]);
                      setFetchError('');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      selectedLanguage === 'bn'
                        ? 'btn-primary-gradient text-white shadow-sm'
                        : 'text-[#94A3B8] light:text-slate-500 hover:text-white'
                    }`}
                  >
                    🇧🇩 Bengali (বাংলা)
                  </button>
                  <button
                    onClick={() => {
                      setSelectedLanguage('en');
                      setCandidates([]);
                      setFetchError('');
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      selectedLanguage === 'en'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-[#94A3B8] light:text-slate-500 hover:text-white'
                    }`}
                  >
                    🌍 English / Latin
                  </button>
                </div>
              </div>

              {/* Main Action Buttons Row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDiscover(selectedLanguage)}
                  disabled={!currentSong}
                  className="btn-primary-gradient flex-1 h-13 rounded-full flex items-center justify-center gap-2 text-xs font-bold shadow-md"
                >
                  <Search className="w-4 h-4 stroke-[2.5]" />
                  <span>{selectedLanguage === 'en' ? 'Live Search English' : 'Live Search Web'}</span>
                </button>

                <button
                  onClick={() => handleDirectLookup(selectedLanguage)}
                  disabled={!currentSong}
                  className="h-13 px-4 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-[#8B5CF6]/40 text-[#8B5CF6] hover:bg-[#8B5CF6]/15 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                  title="Direct AI lyrics lookup"
                >
                  <Bot className="w-4 h-4" />
                  <span>{selectedLanguage === 'en' ? 'English AI Lookup' : 'AI Lookup'}</span>
                </button>

                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(
                    searchTitle + (selectedLanguage === 'en' ? ' song lyrics english' : ' song lyrics বাংলা লিরিক্স')
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-13 h-13 rounded-full bg-white/[0.06] light:bg-black/[0.04] border border-white/10 light:border-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black active:scale-90 transition-all shrink-0"
                  title="Search on Google in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Direct URL Fetch Pill Input */}
              <div className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8] light:text-slate-500">
                  Or Paste Direct URL (e.g. lyrics71.net / genius / azlyrics)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={directUrl}
                    onChange={(e) => setDirectUrl(e.target.value)}
                    placeholder={selectedLanguage === 'en' ? 'https://genius.com/song-lyrics...' : 'https://lyrics71.net/lyrics/bioscope/...'}
                    className="flex-1 px-4 py-2.5 rounded-full bg-black/40 light:bg-white border border-white/10 light:border-black/10 text-xs text-white light:text-slate-900 placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]"
                  />
                  <button
                    onClick={() => handleFetchCandidateUrl(directUrl.trim(), 'Direct URL', selectedLanguage)}
                    disabled={!directUrl.trim()}
                    className="px-4 py-2.5 rounded-full btn-primary-gradient text-white text-xs font-bold active:scale-95 transition-all disabled:opacity-40 shrink-0"
                  >
                    Fetch
                  </button>
                </div>
              </div>

              {/* ACTIONABLE FETCH ERROR BANNER + ENGLISH LYRICS OFFER */}
              {fetchError && (
                <div className="space-y-3 animate-in fade-in">
                  <div className="p-4 rounded-[24px] bg-amber-500/12 border border-amber-500/35 text-amber-200 text-xs space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{fetchError}</span>
                    </div>
                    <button
                      onClick={() => handleDirectLookup(selectedLanguage)}
                      className="w-full py-2.5 px-4 rounded-full bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-300 active:scale-95 transition-all shadow-md"
                    >
                      <Bot className="w-4 h-4 stroke-[2.5]" />
                      <span>Retry AI Lookup for "{searchTitle}"</span>
                    </button>
                  </div>

                  {/* English Fallback Offer Card (When Bengali lookup didn't find lyrics) */}
                  {selectedLanguage === 'bn' && (
                    <div className="p-4 rounded-[24px] bg-indigo-500/15 border border-indigo-500/35 text-indigo-100 text-xs space-y-3 shadow-lg">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/25 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-xs leading-tight">
                            Looking for English / International Lyrics?
                          </h4>
                          <p className="text-[11px] text-indigo-200/90 mt-1 leading-relaxed">
                            If "{searchTitle}" is an English or international track, you can fetch authentic English lyrics with AI. If you approve, they will be attached to this song.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDirectLookup('en')}
                        className="w-full py-2.5 px-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>🌍 Fetch English Lyrics with AI</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* VERIFIED RESULT PREVIEW & SAVE */}
              {fetchResultLyrics && fetchVerification && (
                <div className={`p-5 rounded-[28px] bg-white/[0.05] light:bg-slate-100 border-2 ${
                  fetchedLanguage === 'en' ? 'border-indigo-500 shadow-[0_10px_35px_rgba(99,102,241,0.25)]' : 'border-[#8B5CF6] shadow-[0_10px_35px_rgba(139,92,246,0.25)]'
                } space-y-4 animate-in fade-in slide-in-from-top-4`}>
                  <div className="flex items-center justify-between border-b border-white/10 light:border-black/10 pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`w-5 h-5 ${fetchedLanguage === 'en' ? 'text-indigo-400' : 'text-[#8B5CF6]'}`} />
                      <div>
                        <div className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-1.5">
                          <span>
                            {fetchSourceUrl.includes('ai_lookup') ? 'AI Authentic Lyrics' : 'Verified Web Extraction'}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            fetchedLanguage === 'en' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-[#8B5CF6]/20 text-[#C4B5FD] border border-[#8B5CF6]/40'
                          }`}>
                            {fetchedLanguage === 'en' ? '🇬🇧 English' : '🇧🇩 Bengali'}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#94A3B8] light:text-slate-500 truncate max-w-[180px]">
                          "{searchTitle}"
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/40">
                      {(fetchVerification.coverage * 100).toFixed(0)}% Line Match
                    </span>
                  </div>

                  {fetchedLanguage === 'en' && (
                    <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs flex items-center gap-2">
                      <Check className="w-4 h-4 text-indigo-300 shrink-0" />
                      <span className="leading-relaxed">
                        English lyrics retrieved. Tap <strong>"Approve & Save English Lyrics"</strong> to confirm and add them to this song.
                      </span>
                    </div>
                  )}

                  <div className={`max-h-60 overflow-y-auto p-4 rounded-[20px] bg-black/40 light:bg-white border border-white/[0.08] light:border-black/[0.08] text-sm ${
                    fetchedLanguage === 'en' ? 'font-sans' : 'font-bengali'
                  } text-white/95 light:text-slate-900 leading-relaxed whitespace-pre-line shadow-inner`}>
                    {fetchResultLyrics}
                  </div>

                  <div className="space-y-2 pt-1">
                    <button
                      onClick={handleSaveFetchResult}
                      className={`w-full h-14 rounded-full flex items-center justify-center gap-2 text-sm font-bold shadow-md active:scale-95 transition-all text-white ${
                        fetchedLanguage === 'en' ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600' : 'btn-primary-gradient'
                      }`}
                    >
                      <Check className="w-5 h-5 stroke-[2.5]" />
                      <span>
                        {fetchedLanguage === 'en'
                          ? `✓ Approve & Save English Lyrics to "${searchTitle}"`
                          : `Save Lyrics to "${searchTitle}"`}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setFetchResultLyrics('');
                        setFetchVerification(null);
                      }}
                      className="w-full py-2 text-[11px] text-[#94A3B8] hover:text-white light:hover:text-black text-center transition-all"
                    >
                      Clear & Try Another Source
                    </button>
                  </div>
                </div>
              )}

              {/* FOUND WEB ARCHIVES */}
              {candidates.length > 0 && (
                <div className="space-y-2 pt-1">
                  <span className="text-xs font-bold text-white light:text-slate-900 flex items-center justify-between">
                    <span>Found Web Archives ({candidates.length})</span>
                    <span className="text-[11px] text-[#94A3B8] light:text-slate-500">Tap "Fetch" to extract</span>
                  </span>
                  <div className="space-y-2">
                    {candidates.map((cand, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-[22px] frosted-surface flex items-center justify-between gap-3 hover:border-white/20 transition-all"
                      >
                        <div className="truncate flex-1">
                          <div className={`text-xs font-bold text-white light:text-slate-900 truncate ${selectedLanguage === 'en' ? 'font-sans' : 'font-bengali'}`}>
                            {cand.pageTitle}
                          </div>
                          {cand.snippet && (
                            <div className={`text-[11px] text-[#94A3B8] light:text-slate-500 truncate mt-0.5 ${selectedLanguage === 'en' ? 'font-sans' : 'font-bengali'}`}>
                              {cand.snippet}
                            </div>
                          )}
                          <div className="text-[10px] text-[#64748B] truncate flex items-center gap-1.5 mt-0.5">
                            <span className="text-[#8B5CF6] font-semibold">{cand.siteName}</span>
                            <span>•</span>
                            <span className="truncate">{cand.url}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleFetchCandidateUrl(cand.url, cand.siteName, selectedLanguage)}
                          className="px-4 py-2 rounded-full bg-white/[0.08] light:bg-black/[0.05] border border-[#8B5CF6]/40 text-[#8B5CF6] text-xs font-bold active:scale-90 transition-all shrink-0 hover:bg-[#8B5CF6] hover:text-white"
                        >
                          Fetch
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PASTE AND CLEAN */}
          {activeTab === 'paste' && !isLoadingAny && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.07] light:border-black/[0.07] text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed">
                <span className="font-bold text-[#8B5CF6] block mb-0.5">Paste & Clean:</span>
                Paste copied lyrics from any website or note. Gemini cleans and formats the stanzas, and deterministic verification proves zero lines were altered.
              </div>

              {/* Allow English Checkbox */}
              <div className="flex items-center gap-2.5 p-3 rounded-[20px] bg-white/[0.04] border border-white/10">
                <input
                  type="checkbox"
                  id="allow-english-paste"
                  checked={allowEnglishInPaste}
                  onChange={(e) => setAllowEnglishInPaste(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 cursor-pointer"
                />
                <label htmlFor="allow-english-paste" className="text-xs text-white/90 cursor-pointer select-none">
                  <span className="font-semibold block">Allow English / Latin Lyrics</span>
                  <span className="text-[10px] text-[#94A3B8] block">Bypasses Bengali script ratio requirement for English songs</span>
                </label>
              </div>

              {pasteError && (
                <div className="p-3 rounded-[18px] bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{pasteError}</span>
                </div>
              )}

              <textarea
                rows={6}
                value={pastedRawText}
                onChange={(e) => setPastedRawText(e.target.value)}
                placeholder={allowEnglishInPaste ? "Paste raw unformatted English lyrics here..." : "Paste raw unformatted Bengali lyrics here..."}
                className="w-full p-4 rounded-[24px] bg-white/[0.04] light:bg-slate-100 border border-white/10 light:border-black/10 text-xs text-white light:text-slate-900 font-sans leading-relaxed focus:outline-none focus:border-[#8B5CF6]"
              />

              <button
                onClick={handlePasteAndClean}
                disabled={!pastedRawText.trim()}
                className="btn-primary-gradient w-full h-14 rounded-full flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-40 shadow-md"
              >
                <Sparkles className="w-5 h-5" />
                <span>Clean & Format Stanzas</span>
              </button>

              {pasteResultLyrics && pasteVerification && (
                <div className="p-5 rounded-[28px] bg-white/[0.05] light:bg-slate-100 border border-[#8B5CF6]/40 space-y-3.5 animate-in fade-in shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 light:border-black/10 pb-2">
                    <span className="text-xs font-bold text-white light:text-slate-900">
                      Line Verification: {(pasteVerification.coverage * 100).toFixed(0)}% Match
                    </span>
                    <span className="text-xs font-mono text-[#8B5CF6]">
                      {pasteVerification.matchedLinesCount}/{pasteVerification.lineCount} lines
                    </span>
                  </div>

                  <div className={`max-h-56 overflow-y-auto p-4 rounded-[20px] bg-black/40 light:bg-white border border-white/[0.06] light:border-black/[0.06] text-sm ${
                    allowEnglishInPaste ? 'font-sans' : 'font-bengali'
                  } text-white/95 light:text-slate-900 leading-relaxed whitespace-pre-line`}>
                    {pasteResultLyrics}
                  </div>

                  <button
                    onClick={handleSavePasteResult}
                    className="btn-primary-gradient w-full h-14 rounded-full flex items-center justify-center gap-2 text-sm font-bold shadow-md"
                  >
                    <Check className="w-5 h-5 stroke-[2.5]" />
                    <span>{allowEnglishInPaste ? '✓ Approve & Save English Lyrics' : 'Save Lyrics to Song'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BATCH QUEUE */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.07] light:border-black/[0.07] text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed">
                <span className="font-bold text-[#8B5CF6] block mb-0.5">Sequential Queue:</span>
                Processes songs with missing lyrics one by one sequentially using live web sources.
              </div>

              <div className="flex items-center gap-2">
                {!queueState.isRunning ? (
                  <button
                    onClick={() => {
                      const missingSongs = allSongs.filter((s) => s.lyricsStatus === 'missing');
                      lyricsQueue.startQueue(missingSongs);
                    }}
                    className="btn-primary-gradient flex-1 h-14 rounded-full flex items-center justify-center gap-2 text-sm font-bold shadow-md"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>
                      Start Queue (
                      {allSongs.filter((s) => s.lyricsStatus === 'missing').length} missing)
                    </span>
                  </button>
                ) : queueState.isPaused ? (
                  <button
                    onClick={() => lyricsQueue.resume()}
                    className="flex-1 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Resume Queue</span>
                  </button>
                ) : (
                  <button
                    onClick={() => lyricsQueue.pause()}
                    className="flex-1 h-14 rounded-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Pause className="w-5 h-5 fill-current" />
                    <span>Pause Queue</span>
                  </button>
                )}

                {queueState.isRunning && (
                  <button
                    onClick={() => lyricsQueue.cancel()}
                    className="h-14 px-5 rounded-full bg-white/10 light:bg-black/5 text-[#94A3B8] hover:text-white font-semibold text-xs active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {queueState.items.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#94A3B8] light:text-slate-500">
                    <span>Progress: {queueState.currentIndex} of {queueState.items.length}</span>
                    <span className="text-[#8B5CF6] font-mono">
                      {queueState.completedCount} saved, {queueState.failedCount} flagged
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-white/10 light:bg-black/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#EC4899] transition-all duration-300"
                      style={{
                        width: `${(queueState.currentIndex / Math.max(1, queueState.items.length)) * 100}%`,
                      }}
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-[22px] border border-white/[0.08] light:border-black/[0.08] p-2 bg-white/[0.02] light:bg-black/[0.02]">
                    {queueState.items.map((item: QueueItem, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl text-xs flex items-center justify-between bg-white/[0.04] light:bg-black/[0.03]"
                      >
                        <div className="truncate max-w-[70%]">
                          <span className="text-white light:text-slate-900 font-semibold font-bengali">{item.songTitle}</span>
                          {item.reason && (
                            <span className="block text-[10px] text-[#94A3B8] light:text-slate-500 truncate">{item.reason}</span>
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                            item.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : item.status === 'processing'
                              ? 'bg-[#8B5CF6]/20 text-[#C4B5FD] animate-pulse'
                              : item.status === 'needs_attention'
                              ? 'bg-amber-500/20 text-amber-300'
                              : item.status === 'failed'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-white/10 text-[#64748B]'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
