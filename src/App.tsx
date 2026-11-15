import React, { useState, useEffect, useCallback } from 'react';
import { SongRecord, CategoryRecord, AppSettings, CsvImportReport } from './types';
import { songRepository } from './data/songRepository';
import { AudioProvider, useAudio } from './context/AudioContext';
import { SongList } from './components/SongList';
import { SongReader } from './components/SongReader';
import { SongEditor } from './components/SongEditor';
import { ImportDialog } from './components/ImportDialog';
import { PrepareLyricsModal } from './components/PrepareLyricsModal';
import { SettingsModal } from './components/SettingsModal';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { FirstRunOnboarding } from './components/FirstRunOnboarding';
import { MiniPlayer } from './components/MiniPlayer';
import { FullPlayerModal } from './components/FullPlayerModal';
import { AudioHubModal } from './components/AudioHubModal';
import { PlaylistManagerModal } from './components/PlaylistManagerModal';
import { DashboardView } from './components/DashboardView';
import { ShareModal } from './components/ShareModal';
import { firebaseSync } from './services/firebaseSync';
import { FIREBASE_CONFIG } from './config/firebase.config';
import { nativeBridge } from './services/nativeBridge';
import { Music, ListMusic, FileAudio, BarChart3, Sparkles, Settings as SettingsIcon, Plus } from 'lucide-react';

function AppContent() {
  const [songs, setSongs] = useState<SongRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    fontSize: 20,
    lineHeight: 1.8,
    keepAwake: true,
    fullTextLyricsSearch: false,
    selectedModel: 'gemini-flash-latest',
    enabledSites: ['lyricsbangla', 'banglalyrics', 'amar-gaan'],
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'songs' | 'playlists' | 'dashboard'>('songs');
  const [activeView, setActiveView] = useState<'main' | 'reader' | 'editor'>('main');
  const [selectedSong, setSelectedSong] = useState<SongRecord | null>(null);
  const [editingSong, setEditingSong] = useState<SongRecord | null>(null);

  // Modals
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [isPrepareOpen, setIsPrepareOpen] = useState<boolean>(false);
  const [prepareTargetSong, setPrepareTargetSong] = useState<SongRecord | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState<boolean>(false);
  const [isFirstRunOpen, setIsFirstRunOpen] = useState<boolean>(false);
  const [isAudioHubOpen, setIsAudioHubOpen] = useState<boolean>(false);
  const [audioHubTargetSong, setAudioHubTargetSong] = useState<SongRecord | null>(null);
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState<boolean>(false);
  const [returnToPlaylistId, setReturnToPlaylistId] = useState<string | null>(null);
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [selectedShareSongIds, setSelectedShareSongIds] = useState<string[]>([]);

  // Audio Context
  const { openPlayerForSong, currentSong, updateCurrentSong } = useAudio();

  // Load library data from Dexie repository
  const loadData = useCallback(async () => {
    try {
      await songRepository.init();
      const [loadedSongs, loadedCats, loadedSettings] = await Promise.all([
        songRepository.getAllSongs(),
        songRepository.getAllCategories(),
        songRepository.getSettings(),
      ]);

      setSongs(loadedSongs);
      setCategories(loadedCats);
      setSettings(loadedSettings);

      // Check first-run onboarding - only show on first launch when library is empty (0 songs)
      const hasSeenOnboarding = await nativeBridge.getStorageItem('tl_onboarding_completed');
      if (!hasSeenOnboarding && loadedSongs.length === 0) {
        setIsFirstRunOpen(true);
      } else {
        setIsFirstRunOpen(false);
      }
    } catch (err) {
      console.error('Error loading library data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Native Platform & Safe Area Inset Detection
  useEffect(() => {
    const isCapacitor = Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      window.location.protocol === 'capacitor:' ||
      (window.location.protocol === 'https:' && window.location.hostname === 'localhost' && !window.location.port)
    );
    if (isCapacitor) {
      document.documentElement.classList.add('is-native-app');
      document.body.classList.add('is-native-app');
    }
  }, []);

  // Synchronize documentElement theme class (dark by default, light optional)
  useEffect(() => {
    const activeTheme = settings.theme || 'dark';
    const root = document.documentElement;
    if (activeTheme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    root.setAttribute('data-theme', activeTheme);
  }, [settings.theme]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keep selectedSong in sync if songs array updates
  useEffect(() => {
    if (selectedSong) {
      const refreshed = songs.find((s) => s.id === selectedSong.id);
      if (refreshed) {
        setSelectedSong(refreshed);
      }
    }
  }, [songs]);

  // Android hardware back button & popstate integration
  useEffect(() => {
    const removeNativeBack = nativeBridge.onHardwareBack(() => {
      if (isShareOpen) {
        setIsShareOpen(false);
        return true;
      }
      if (isAudioHubOpen) {
        setIsAudioHubOpen(false);
        return true;
      }
      if (isPlaylistModalOpen) {
        setIsPlaylistModalOpen(false);
        return true;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return true;
      }
      if (isPrepareOpen) {
        setIsPrepareOpen(false);
        return true;
      }
      if (isImportOpen) {
        setIsImportOpen(false);
        return true;
      }
      if (activeView !== 'main') {
        setActiveView('main');
        return true;
      }
      return false;
    });

    const handlePopState = () => {
      if (activeView !== 'main') {
        setActiveView('main');
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      removeNativeBack();
      window.removeEventListener('popstate', handlePopState);
    };
  }, [
    activeView,
    isShareOpen,
    isAudioHubOpen,
    isPlaylistModalOpen,
    isSettingsOpen,
    isPrepareOpen,
    isImportOpen,
  ]);

  // Periodic Firebase Cloud Sync
  useEffect(() => {
    const isEnabled = settings.cloudSyncEnabled ?? true;
    if (isEnabled) {
      const activeConfig = (settings.firebaseConfig && settings.firebaseConfig.projectId)
        ? { ...FIREBASE_CONFIG, ...settings.firebaseConfig }
        : FIREBASE_CONFIG;
      firebaseSync.configure(activeConfig, true);
      // Trigger instant push/pull on app open
      firebaseSync.triggerSync().then(() => loadData()).catch(console.error);
      const stopSync = firebaseSync.startPeriodicSync(30000);
      return () => stopSync();
    }
  }, [settings.cloudSyncEnabled, settings.firebaseConfig, loadData]);

  // Real-time remote cloud updates listener
  useEffect(() => {
    return firebaseSync.subscribe((state) => {
      if (state === 'synced') {
        loadData();
      }
    });
  }, [loadData]);

  const handleOpenReader = (song: SongRecord, fromPlaylistId?: string) => {
    setSelectedSong(song);
    setActiveView('reader');
    if (fromPlaylistId) {
      setReturnToPlaylistId(fromPlaylistId);
    } else {
      setReturnToPlaylistId(null);
    }
    setIsPlaylistModalOpen(false);
    window.history.pushState({ view: 'reader' }, '');
  };

  const handleOpenEditor = (song?: SongRecord) => {
    setEditingSong(song || null);
    setActiveView('editor');
    window.history.pushState({ view: 'editor' }, '');
  };

  const handleOpenPrepareForSong = (song?: SongRecord) => {
    setPrepareTargetSong(song || selectedSong || null);
    setIsPrepareOpen(true);
  };

  const handleOpenAudioHubForSong = (song?: SongRecord) => {
    setAudioHubTargetSong(song || selectedSong || null);
    setIsAudioHubOpen(true);
  };

  const handleSaveEditedSong = (saved: SongRecord) => {
    setSongs((prev) => {
      const exists = prev.some((s) => s.id === saved.id);
      return exists ? prev.map((s) => (s.id === saved.id ? saved : s)) : [saved, ...prev];
    });
    setSelectedSong(saved);
    updateCurrentSong(saved);
    setActiveView('reader');
  };

  const handleSongUpdated = (updated: SongRecord) => {
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (selectedSong?.id === updated.id) {
      setSelectedSong(updated);
    }
    updateCurrentSong(updated);
  };

  const handleCompleteOnboarding = async () => {
    await nativeBridge.setStorageItem('tl_onboarding_completed', 'true');
    setIsFirstRunOpen(false);
  };

  const handleStartBlank = async () => {
    await nativeBridge.setStorageItem('tl_onboarding_completed', 'true');
    await songRepository.clearAllSongsIfDemoOnly();
    await loadData();
    setIsFirstRunOpen(false);
  };

  const handleImportComplete = async (_report: CsvImportReport) => {
    await nativeBridge.setStorageItem('tl_onboarding_completed', 'true');
    setIsFirstRunOpen(false);
    await loadData();
  };

  if (isLoading) {
    return (
      <div className="min-h-dvh h-dvh w-full bg-[#04060C] flex items-center justify-center p-0 sm:p-3">
        <div className="max-w-[430px] w-full h-full sm:h-[92dvh] sm:max-h-[890px] sm:rounded-[44px] sm:border sm:border-white/10 sm:shadow-2xl overflow-hidden flex flex-col items-center justify-center bg-[#080C16] bg-ambient-cosmic text-[#F1F5F9] p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#6366F1] via-[#8B5CF6] to-[#EC4899] p-[2.5px] shadow-[0_0_40px_rgba(139,92,246,0.55)] mb-4 animate-orb-pulse">
            <div className="w-full h-full rounded-full bg-[#0B0F1E] flex items-center justify-center text-white">
              <span className="font-extrabold text-2xl tracking-tighter bg-gradient-to-r from-white via-violet-200 to-pink-200 bg-clip-text text-transparent">
                TL
              </span>
            </div>
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">Tour Lyrics</h2>
          <p className="text-xs text-[#94A3B8] font-medium mt-1">Preparing your offline library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh h-dvh w-full bg-[#04060C] dark:bg-[#04060C] light:bg-[#EDF2F7] flex items-center justify-center p-0 sm:p-3 select-none overflow-hidden transition-colors duration-300">
      <div className="max-w-[430px] w-full h-full sm:h-[92dvh] sm:max-h-[890px] sm:rounded-[44px] sm:border sm:border-white/10 light:sm:border-black/10 sm:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col relative bg-[#080C16] light:bg-[#FFFFFF] bg-ambient-cosmic text-[#F1F5F9] light:text-[#0F172A] font-sans antialiased transition-colors duration-300">
        {/* VIEW CONTAINER */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 1. Main View (Songs / Playlists / Dashboard) */}
          {activeView === 'main' && (
            <>
              {activeTab === 'songs' && (
                <SongList
                  songs={songs}
                  categories={categories}
                  settings={settings}
                  onSelectSong={handleOpenReader}
                  onAddSong={() => handleOpenEditor()}
                  onOpenImport={() => setIsImportOpen(true)}
                  onOpenPrepare={() => handleOpenPrepareForSong()}
                  onOpenAudioHub={handleOpenAudioHubForSong}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenCategories={() => setIsCategoriesOpen(true)}
                  onOpenShare={(ids) => {
                    setSelectedShareSongIds(ids || []);
                    setIsShareOpen(true);
                  }}
                  onSongsUpdated={loadData}
                />
              )}

              {activeTab === 'playlists' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <header
                    className="px-5 pb-3 shrink-0 flex items-center justify-between border-b border-white/10 light:border-black/10"
                    style={{
                      paddingTop: 'calc(14px + max(env(safe-area-inset-top, 0px), var(--safe-top, 0px)))'
                    }}
                  >
                    <div>
                      <h2 className="text-xl font-bold text-white light:text-slate-900 tracking-tight">Tour Lists</h2>
                      <p className="text-xs text-[#94A3B8] light:text-slate-500">Curated Tour Queues & Sets</p>
                    </div>
                    <button
                      onClick={() => setIsPlaylistModalOpen(true)}
                      className="px-4 py-1.5 rounded-full btn-primary-gradient text-xs font-bold shadow-md active:scale-95 transition-all"
                    >
                      Manage
                    </button>
                  </header>

                  {/* Embedded quick playlist overview */}
                  <div className="flex-1 overflow-y-auto p-5">
                    <PlaylistManagerModal
                      allSongs={songs}
                      categories={categories}
                      onClose={() => setActiveTab('songs')}
                      onSelectSongToRead={handleOpenReader}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'dashboard' && (
                <DashboardView
                  songs={songs}
                  categories={categories}
                  onSelectSongToRead={handleOpenReader}
                  onOpenAudioHub={() => setIsAudioHubOpen(true)}
                  onOpenPrepare={handleOpenPrepareForSong}
                />
              )}
            </>
          )}

          {/* 2. Reader View */}
          {activeView === 'reader' && selectedSong && (
            <SongReader
              song={selectedSong}
              allSongs={songs}
              categories={categories}
              settings={settings}
              onBack={() => {
                setActiveView('main');
                if (returnToPlaylistId) {
                  setIsPlaylistModalOpen(true);
                }
              }}
              onSelectSong={(s) => setSelectedSong(s)}
              onEditSong={(s) => handleOpenEditor(s)}
              onOpenPrepare={(s) => handleOpenPrepareForSong(s)}
              onOpenAudioHub={(s) => handleOpenAudioHubForSong(s)}
              onSongUpdated={handleSongUpdated}
            />
          )}

          {/* 3. Editor View */}
          {activeView === 'editor' && (
            <SongEditor
              initialSong={editingSong}
              categories={categories}
              onSave={handleSaveEditedSong}
              onCancel={() => setActiveView(selectedSong ? 'reader' : 'main')}
            />
          )}
        </div>

        {/* PERSISTENT MINI-PLAYER (Floats above bottom bar when song loaded) */}
        {activeView === 'main' && (
          <MiniPlayer
            onOpenLyrics={() => {
              if (currentSong) handleOpenReader(currentSong);
            }}
          />
        )}

        {/* BOTTOM NAVIGATION DOCK (Shown in Main view) */}
        {activeView === 'main' && (
          <nav
            className="w-full bg-[#0A0E1A]/95 light:bg-[#FFFFFF]/95 backdrop-blur-2xl border-t border-white/[0.08] light:border-black/[0.08] grid grid-cols-5 items-center px-1 shrink-0 z-20"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px))',
              height: 'calc(3.8rem + max(env(safe-area-inset-bottom, 0px), var(--safe-bottom, 0px)))'
            }}
          >
            {/* 1. Songs */}
            <button
              onClick={() => setActiveTab('songs')}
              className={`flex flex-col items-center justify-center gap-1 w-full py-1 transition-all active:scale-95 ${
                activeTab === 'songs'
                  ? 'text-[#8B5CF6] light:text-[#7C3AED] font-bold'
                  : 'text-[#94A3B8] hover:text-white light:hover:text-slate-900'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  activeTab === 'songs' ? 'bg-[#8B5CF6]/15 light:bg-[#7C3AED]/10' : ''
                }`}
              >
                <Music className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <span className="text-[10px] font-semibold tracking-tight leading-none">Songs</span>
            </button>

            {/* 2. Tour Lists */}
            <button
              onClick={() => setIsPlaylistModalOpen(true)}
              className="flex flex-col items-center justify-center gap-1 w-full py-1 text-[#94A3B8] hover:text-white light:hover:text-slate-900 transition-all active:scale-95"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center">
                <ListMusic className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <span className="text-[10px] font-semibold tracking-tight leading-none">Tour Lists</span>
            </button>

            {/* 3. CENTER CREATE BUTTON: Add Song (Exact Dead-Center) */}
            <button
              onClick={() => handleOpenEditor()}
              className="flex flex-col items-center justify-center gap-1 w-full py-1 text-slate-300 hover:text-white transition-all active:scale-95 group"
              title="Add New Song"
              aria-label="Add New Song"
            >
              <div className="w-8 h-8 rounded-full btn-primary-gradient text-white flex items-center justify-center shadow-[0_2px_12px_rgba(139,92,246,0.5)] group-hover:scale-105 transition-transform">
                <Plus className="w-4.5 h-4.5 stroke-[2.8]" />
              </div>
              <span className="text-[10px] font-bold text-violet-300 light:text-violet-600 tracking-tight leading-none">Add</span>
            </button>

            {/* 4. Audio Hub */}
            <button
              onClick={() => setIsAudioHubOpen(true)}
              className="flex flex-col items-center justify-center gap-1 w-full py-1 text-[#94A3B8] hover:text-white light:hover:text-slate-900 transition-all active:scale-95"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center">
                <FileAudio className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <span className="text-[10px] font-semibold tracking-tight leading-none">Audio Hub</span>
            </button>

            {/* 5. Analytics */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center justify-center gap-1 w-full py-1 transition-all active:scale-95 ${
                activeTab === 'dashboard'
                  ? 'text-[#8B5CF6] light:text-[#7C3AED] font-bold'
                  : 'text-[#94A3B8] hover:text-white light:hover:text-slate-900'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  activeTab === 'dashboard' ? 'bg-[#8B5CF6]/15 light:bg-[#7C3AED]/10' : ''
                }`}
              >
                <BarChart3 className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <span className="text-[10px] font-semibold tracking-tight leading-none">Analytics</span>
            </button>
          </nav>
        )}

        {/* POWERAMP-GRADE FULL-SCREEN PLAYER MODAL */}
        <FullPlayerModal
          categories={categories}
          allSongs={songs}
          onOpenEdit={handleOpenEditor}
          onOpenPrepare={handleOpenPrepareForSong}
          onOpenAudioHub={handleOpenAudioHubForSong}
        />

        {/* AUDIO HUB & YOUTUBE DOWNLOADER MODAL */}
        {isAudioHubOpen && (
          <AudioHubModal
            allSongs={songs}
            initialSong={audioHubTargetSong}
            onClose={() => setIsAudioHubOpen(false)}
            onSongUpdated={handleSongUpdated}
          />
        )}

        {/* TOUR PLAYLIST MANAGER MODAL */}
        {isPlaylistModalOpen && (
          <PlaylistManagerModal
            allSongs={songs}
            categories={categories}
            initialPlaylistId={returnToPlaylistId}
            onClose={() => {
              setIsPlaylistModalOpen(false);
              setReturnToPlaylistId(null);
            }}
            onSelectSongToRead={handleOpenReader}
          />
        )}

        {/* IMPORT MODAL */}
        {isImportOpen && (
          <ImportDialog
            existingSongs={songs}
            existingCategories={categories}
            onClose={() => setIsImportOpen(false)}
            onImportComplete={handleImportComplete}
            onPlayPlaylist={(playlistSong) => {
              setIsImportOpen(false);
              openPlayerForSong(playlistSong, 'visualizer', songs);
            }}
          />
        )}

        {/* PREPARE & VERIFY LYRICS MODAL */}
        {isPrepareOpen && (
          <PrepareLyricsModal
            initialSong={prepareTargetSong}
            allSongs={songs}
            onClose={() => setIsPrepareOpen(false)}
            onSongUpdated={handleSongUpdated}
          />
        )}

        {/* SETTINGS MODAL */}
        {isSettingsOpen && (
          <SettingsModal
            settings={settings}
            categories={categories}
            allSongs={songs}
            onClose={() => setIsSettingsOpen(false)}
            onSettingsUpdated={(s) => setSettings(s)}
            onLibraryReload={loadData}
          />
        )}

        {/* CATEGORY MANAGER MODAL */}
        {isCategoriesOpen && (
          <CategoryManagerModal
            categories={categories}
            allSongs={songs}
            onClose={() => setIsCategoriesOpen(false)}
            onCategoriesUpdated={loadData}
          />
        )}

        {/* TOUR DROP / COMMUNITY SHARE MODAL */}
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          allSongs={songs}
          selectedSongIds={selectedShareSongIds}
          onBundleImported={loadData}
        />

        {/* ONBOARDING MODAL */}
        {isFirstRunOpen && (
          <FirstRunOnboarding
            onComplete={handleCompleteOnboarding}
            onStartBlank={handleStartBlank}
            onOpenImport={async () => {
              await nativeBridge.setStorageItem('tl_onboarding_completed', 'true');
              setIsFirstRunOpen(false);
              setIsImportOpen(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AudioProvider>
      <AppContent />
    </AudioProvider>
  );
}
