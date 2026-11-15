import React, { useState, useEffect } from 'react';
import { AppSettings, SongRecord, CategoryRecord } from '../types';
import { keyStore } from '../services/keyStore';
import { geminiService, TestKeyResult } from '../services/gemini';
import { APPROVED_LYRICS_SOURCES } from '../pipeline/sources.config';
import { backupManager } from '../lib/backup';
import { songRepository } from '../data/songRepository';
import { STARTER_CATEGORIES, generateStarterSongs } from '../data/sampleData';
import { firebaseSync } from '../services/firebaseSync';
import { generateGamingUsername } from '../lib/userNames';
import { motion } from 'motion/react';
import {
  Settings,
  KeyRound,
  Globe,
  Sliders,
  Database,
  Info,
  X,
  CheckCircle2,
  AlertTriangle,
  Download,
  Upload,
  RefreshCw,
  Check,
  ShieldCheck,
  Moon,
  Sun,
  Server,
  Terminal,
  Copy,
  Palette,
  Cloud,
  User,
  Sparkles,
  ExternalLink,
} from 'lucide-react';

interface SettingsModalProps {
  settings: AppSettings;
  categories: CategoryRecord[];
  allSongs: SongRecord[];
  onClose: () => void;
  onSettingsUpdated: (newSettings: AppSettings) => void;
  onLibraryReload: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onClose,
  onSettingsUpdated,
  onLibraryReload,
}) => {
  const [activeTab, setActiveTab] = useState<'theme' | 'community' | 'key' | 'reader' | 'sources' | 'data' | 'server' | 'about'>('theme');

  // Theme state (Dark default)
  const [theme, setTheme] = useState<'dark' | 'light'>(settings.theme || 'dark');

  // Community & Gaming Profile state
  const [userName, setUserName] = useState<string>(settings.userName || '');
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState<boolean>(settings.cloudSyncEnabled || false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Server state
  const [serverUrl, setServerUrl] = useState<string>(settings.ytdlpServerUrl || 'https://yt-dlp-server-rr8t.onrender.com');
  const [serverTestStatus, setServerTestStatus] = useState<string | null>(null);
  const [isTestingServer, setIsTestingServer] = useState<boolean>(false);
  const [copiedServerCode, setCopiedServerCode] = useState<boolean>(false);

  // AI Provider & Model state
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai_compatible'>(settings.aiProvider || 'gemini');
  const [selectedModel, setSelectedModel] = useState<string>(settings.selectedModel || 'gemini-3.5-flash-lite');
  const [customModelInput, setCustomModelInput] = useState<string>(
    ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'commandcode-flash'].includes(settings.selectedModel)
      ? ''
      : settings.selectedModel || ''
  );
  const [isCustomModel, setIsCustomModel] = useState<boolean>(
    Boolean(settings.selectedModel && !['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.7-flash', 'gpt-4o-mini', 'gpt-4o', 'claude-3-5-sonnet', 'commandcode-flash'].includes(settings.selectedModel))
  );
  const [aiBaseUrl, setAiBaseUrl] = useState<string>(settings.aiBaseUrl || '');

  // Key state
  const [maskedKey, setMaskedKey] = useState<string>('');
  const [newKeyInput, setNewKeyInput] = useState<string>('');
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestKeyResult | null>(null);
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);

  // Dynamic Model Fetching state
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [modelFetchMessage, setModelFetchMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Reader settings local state
  const [fontSize, setFontSize] = useState<number>(settings.fontSize || 20);
  const [lineHeight, setLineHeight] = useState<number>(settings.lineHeight || 1.8);
  const [keepAwake, setKeepAwake] = useState<boolean>(settings.keepAwake);
  const [fullTextSearch, setFullTextSearch] = useState<boolean>(settings.fullTextLyricsSearch);
  const [enabledSites, setEnabledSites] = useState<string[]>(
    settings.enabledSites || ['lyricsbangla', 'banglalyrics', 'amar-gaan']
  );
  const [isPersisted, setIsPersisted] = useState<boolean>(settings.persistentStorageGranted || false);

  // Restore state
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    keyStore.getMaskedKey().then((k) => setMaskedKey(k));
    songRepository.checkPersistentStorage().then((p: boolean) => setIsPersisted(p));
  }, []);

  const handleThemeChange = async (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    const updated = await songRepository.saveSettings({ theme: newTheme });
    onSettingsUpdated(updated);
    const root = document.documentElement;
    if (newTheme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    root.setAttribute('data-theme', newTheme);
    try {
      localStorage.setItem('tl_theme', newTheme);
    } catch {}
    setStatusMessage({ text: `Theme changed to ${newTheme === 'dark' ? 'Cosmic Dark' : 'Crisp Light'}` });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleSaveProfile = async () => {
    const trimmed = userName.trim() || generateGamingUsername();
    setUserName(trimmed);
    const updated = await songRepository.saveSettings({ userName: trimmed });
    onSettingsUpdated(updated);
    setStatusMessage({ text: `Gaming tag updated to "${trimmed}"!` });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleRollNewUsername = async () => {
    const rolled = generateGamingUsername();
    setUserName(rolled);
    const updated = await songRepository.saveSettings({ userName: rolled });
    onSettingsUpdated(updated);
    setStatusMessage({ text: `Rolled new gaming tag: "${rolled}"!` });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleTriggerCloudSync = async () => {
    setIsSyncing(true);
    try {
      const res = await firebaseSync.syncAll();
      setStatusMessage({
        text: res.success
          ? `Cloud Sync Complete: Pulled ${res.pulled} songs, uploaded ${res.pushed} songs!`
          : `Sync status: Could not synchronize with cloud.`,
        isError: !res.success,
      });
      if (res.pulled > 0) {
        onLibraryReload();
      }
    } catch (e: any) {
      setStatusMessage({ text: `Sync failed: ${e?.message || 'Network error'}`, isError: true });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleSaveAISettings = async () => {
    const activeModel = isCustomModel ? customModelInput.trim() : selectedModel;
    if (newKeyInput.trim()) {
      await keyStore.setKey(newKeyInput.trim());
      const masked = await keyStore.getMaskedKey();
      setMaskedKey(masked);
      setNewKeyInput('');
      setShowKeyInput(false);
    }
    const updated = await songRepository.saveSettings({
      aiProvider,
      selectedModel: activeModel || (aiProvider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-4o-mini'),
      aiBaseUrl: aiBaseUrl.trim(),
    });
    onSettingsUpdated(updated);
    setStatusMessage({ text: 'AI Engine settings saved successfully!' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleRemoveKey = async () => {
    await keyStore.removeKey();
    setMaskedKey('');
    setTestResult(null);
    setFetchedModels([]);
    setModelFetchMessage(null);
    setStatusMessage({ text: 'API Key removed from device.' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelFetchMessage(null);
    setTestResult(null);

    try {
      const keyToUse = newKeyInput.trim() || undefined;
      const res = await geminiService.fetchAvailableModels({
        apiKey: keyToUse,
        provider: aiProvider,
        baseUrl: aiBaseUrl.trim(),
      });

      if (res.success && res.models.length > 0) {
        setFetchedModels(res.models);
        if (!res.models.includes(selectedModel)) {
          setSelectedModel(res.recommended || res.models[0]);
          setIsCustomModel(false);
        }
        setModelFetchMessage({
          text: `Found ${res.models.length} live models on your account! Auto-selected recommended: ${res.recommended || res.models[0]}`,
        });
      } else {
        setModelFetchMessage({
          text: res.error || 'Could not fetch live models. You can pick standard models or type a custom name below.',
          isError: true,
        });
        if (res.canInputManually) {
          setIsCustomModel(true);
        }
      }
    } catch (err: any) {
      setModelFetchMessage({
        text: err?.message || 'Connection failed while retrieving model list.',
        isError: true,
      });
      setIsCustomModel(true);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestKey = async () => {
    setIsTestingKey(true);
    setTestResult(null);
    try {
      const activeModel = isCustomModel ? customModelInput.trim() : selectedModel;
      const keyToTest = newKeyInput.trim() || undefined;
      const res = await geminiService.testApiKey({
        apiKey: keyToTest,
        provider: aiProvider,
        model: activeModel,
        baseUrl: aiBaseUrl.trim(),
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        valid: false,
        message: `Connection test error: ${err?.message || 'Check network'}`,
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleSaveDisplayPrefs = async (updates: Partial<AppSettings>) => {
    const updated = await songRepository.saveSettings(updates);
    onSettingsUpdated(updated);
  };

  const handleToggleSite = async (siteId: string) => {
    const nextSites = enabledSites.includes(siteId)
      ? enabledSites.filter((id) => id !== siteId)
      : [...enabledSites, siteId];
    setEnabledSites(nextSites);
    handleSaveDisplayPrefs({ enabledSites: nextSites });
  };

  const handleRequestPersist = async () => {
    const granted = await songRepository.requestPersistentStorage();
    setIsPersisted(granted);
    setStatusMessage({
      text: granted
        ? 'Persistent storage granted by browser!'
        : 'Storage persistence status updated.',
    });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const res = await backupManager.restoreFromBackup(json, restoreMode);
        setStatusMessage({
          text: `Restored ${res.songsCount} songs and ${res.categoriesCount} categories (${restoreMode} mode)!`,
        });
        onLibraryReload();
      } catch (err: any) {
        setStatusMessage({ text: `Restore failed: ${err?.message || String(err)}`, isError: true });
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteAllLyrics = async () => {
    if (window.confirm('Delete lyrics from ALL songs in library? Songs and categories remain intact.')) {
      const count = await songRepository.deleteAllLyrics();
      setStatusMessage({ text: `Deleted lyrics from ${count} songs.` });
      onLibraryReload();
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleClearLibrary = async () => {
    const input = window.prompt('Type "DELETE" to permanently erase your entire library:');
    if (input === 'DELETE') {
      await songRepository.clearLibrary();
      setStatusMessage({ text: 'Library cleared.' });
      onLibraryReload();
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleReloadSampleData = async () => {
    if (window.confirm('Reload starter public-domain sample songs (Lalon, Folk, Adda)?')) {
      const sampleSongs = generateStarterSongs();
      await songRepository.bulkImport(sampleSongs, STARTER_CATEGORIES, 'merge');
      setStatusMessage({ text: 'Starter songs added to library!' });
      onLibraryReload();
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const handleSaveServerUrl = async () => {
    const cleaned = serverUrl.trim();
    await songRepository.saveSettings({ ytdlpServerUrl: cleaned });
    onSettingsUpdated({ ...settings, ytdlpServerUrl: cleaned });
    setStatusMessage({ text: 'Backend bridge URL saved!' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleTestServer = async () => {
    if (!serverUrl.trim()) return;
    setIsTestingServer(true);
    setServerTestStatus(null);
    try {
      const res = await fetch(`${serverUrl.trim().replace(/\/$/, '')}/health`);
      if (res.ok) {
        const data = await res.json();
        setServerTestStatus(`Online: ${data.service || 'Ready'}`);
      } else {
        setServerTestStatus(`Server error: HTTP ${res.status}`);
      }
    } catch (e: any) {
      setServerTestStatus(`Connection error: ${e?.message || 'Unreachable'}`);
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleCopyServerCode = async () => {
    const serverSnippet = `# Run in your terminal or VPS (Docker):
docker build -t tour-ytdlp ./yt-dlp-server
docker run -d -p 8080:8080 --name tour-ytdlp tour-ytdlp

# Or standalone Node.js:
cd yt-dlp-server
npm install
node server.js`;
    await navigator.clipboard.writeText(serverSnippet);
    setCopiedServerCode(true);
    setTimeout(() => setCopiedServerCode(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-[430px] mx-auto rounded-t-[36px] bg-[#0A0E1A]/98 light:bg-[#FFFFFF]/98 backdrop-blur-2xl border-t border-white/15 light:border-black/10 max-h-[92vh] flex flex-col shadow-[0_-15px_45px_rgba(0,0,0,0.85)] overflow-hidden text-[#F1F5F9] light:text-[#0F172A]"
      >
        {/* Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/20 light:bg-black/20" />
        </div>

        {/* Top Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/[0.08] light:border-black/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/[0.06] light:bg-black/[0.05] border border-white/10 light:border-black/10 flex items-center justify-center text-[#8B5CF6]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white light:text-slate-900 leading-tight">Settings & Storage</h2>
              <p className="text-[11px] text-[#94A3B8] light:text-slate-500">Theme, reader, backups & Gemini key</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 light:bg-black/5 hover:bg-white/10 light:hover:bg-black/10 flex items-center justify-center text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-black transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Horizontally Scrollable Tab Bar */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] light:border-black/[0.06] bg-[#080C16] light:bg-[#F8FAFC]">
          <div className="flex items-center gap-1.5 overflow-x-auto select-none">
            {[
              { id: 'theme', label: 'Theme', icon: Palette },
              { id: 'community', label: 'User & Sync', icon: Cloud },
              { id: 'key', label: 'AI & Models', icon: Sparkles },
              { id: 'reader', label: 'Reader', icon: Sliders },
              { id: 'sources', label: 'Sources', icon: Globe },
              { id: 'data', label: 'Data & Backup', icon: Database },
              { id: 'server', label: 'yt-dlp Server', icon: Server },
              { id: 'about', label: 'About', icon: Info },
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`py-2 px-3 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all ${
                    active
                      ? 'btn-primary-gradient shadow-md'
                      : 'text-[#94A3B8] light:text-slate-600 hover:text-white light:hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Toast Notification */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 ${
              statusMessage.isError
                ? 'bg-red-500/20 text-red-300 border-b border-red-500/30'
                : 'bg-emerald-500/20 text-emerald-300 border-b border-emerald-500/30'
            }`}
          >
            {statusMessage.isError ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {/* TAB 0: THEME SELECTION (Dark by default, Light option) */}
          {activeTab === 'theme' && (
            <div className="space-y-4">
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2">
                <div className="flex items-center gap-2 text-[#8B5CF6] font-bold text-xs">
                  <Palette className="w-4 h-4" />
                  <span>Display Theme</span>
                </div>
                <p className="text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed">
                  Choose your preferred look. Dark theme is the default cosmic midnight style designed for comfortable reading during night tours and stage addas.
                </p>
              </div>

              {/* Theme Selection Cards */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Dark Theme Card (Default) */}
                <button
                  type="button"
                  onClick={() => handleThemeChange('dark')}
                  className={`p-4 rounded-[24px] border text-left transition-all relative flex flex-col justify-between h-36 ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-[#121828] to-[#0A0E1A] border-[#8B5CF6] shadow-[0_0_25px_rgba(139,92,246,0.35)]'
                      : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-full bg-[#182035] border border-white/10 flex items-center justify-center text-[#8B5CF6]">
                      <Moon className="w-5 h-5" />
                    </div>
                    {theme === 'dark' && (
                      <span className="w-6 h-6 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>Dark Theme</span>
                      <span className="text-[9px] font-mono uppercase bg-[#8B5CF6]/20 text-[#C4B5FD] px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    </div>
                    <div className="text-[11px] text-[#94A3B8] mt-0.5">
                      Cosmic Midnight & Liquid Glass
                    </div>
                  </div>
                </button>

                {/* 2. Light Theme Card */}
                <button
                  type="button"
                  onClick={() => handleThemeChange('light')}
                  className={`p-4 rounded-[24px] border text-left transition-all relative flex flex-col justify-between h-36 ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 border-[#6366F1] shadow-[0_0_25px_rgba(99,102,241,0.25)]'
                      : 'bg-white/[0.03] light:bg-black/[0.03] border-white/10 light:border-black/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                      <Sun className="w-5 h-5" />
                    </div>
                    {theme === 'light' && (
                      <span className="w-6 h-6 rounded-full bg-[#6366F1] text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white light:text-slate-900">
                      Light Theme
                    </div>
                    <div className="text-[11px] text-[#94A3B8] light:text-slate-600 mt-0.5">
                      Crisp Slate & Frosted Paper
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* TAB 1: GAMING PROFILE & FIREBASE CLOUD SYNC */}
          {activeTab === 'community' && (
            <div className="space-y-4">
              {/* Card 1: Gamer Tag & Identity */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <div className="flex items-center gap-2 text-[#8B5CF6] font-bold text-xs">
                  <User className="w-4 h-4" />
                  <span>Gaming Identity & Persona</span>
                </div>
                <p className="text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed">
                  Your songs, lyrics contributions, and tour sets are tagged with this unique gaming name.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Baul_Rider_402"
                    className="flex-1 px-3 py-2 rounded-xl bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-white light:text-slate-900 font-mono text-xs font-bold focus:border-[#8B5CF6] focus:outline-none"
                  />
                  <button
                    onClick={handleRollNewUsername}
                    className="px-3 py-2 rounded-xl bg-white/10 light:bg-black/5 hover:bg-white/15 text-white light:text-slate-900 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all shrink-0"
                    title="Roll Random Gaming Tag"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#8B5CF6]" />
                    <span>Roll Tag</span>
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    className="px-3 py-2 rounded-xl btn-primary-gradient text-white text-xs font-semibold shadow-sm active:scale-95 transition-all shrink-0"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Card 2: Community Cloud Synchronization */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#8B5CF6] font-bold text-xs">
                    <Cloud className="w-4 h-4" />
                    <span>Tour Community Cloud Sync</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cloudSyncEnabled}
                      onChange={async (e) => {
                        const nextVal = e.target.checked;
                        setCloudSyncEnabled(nextVal);
                        const updated = await songRepository.saveSettings({ cloudSyncEnabled: nextVal });
                        onSettingsUpdated(updated);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#8B5CF6]"></div>
                  </label>
                </div>

                <p className="text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed">
                  Automatically sync your public songs, lyrics, and YouTube streams with other tour companions. Works offline-first: changes queue locally and sync automatically when internet restores.
                </p>

                {cloudSyncEnabled && (
                  <div className="pt-2 border-t border-white/[0.06] light:border-black/[0.06] flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[#94A3B8] light:text-slate-500 font-mono">
                      Cloud Endpoint Configured
                    </span>
                    <button
                      onClick={handleTriggerCloudSync}
                      disabled={isSyncing}
                      className="px-4 py-2 rounded-xl bg-white/10 light:bg-black/5 hover:bg-white/15 text-white light:text-slate-900 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  </div>
                )}

                {/* Zero Cloud Audio Policy Pill */}
                <div className="p-2.5 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/25 text-[11px] text-[#C4B5FD] light:text-[#7C3AED] leading-relaxed flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Zero Cloud Audio Policy: </span>
                    Personal offline MP3 audio files remain 100% on your personal device and are NEVER uploaded to cloud.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI & MODELS */}
          {activeTab === 'key' && (
            <div className="space-y-4">
              {/* Security & Overview Card */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-[#8B5CF6] font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Bring Your Own Key & Multi-Provider AI</span>
                </div>
                <p className="text-[#94A3B8] light:text-slate-600 leading-relaxed">
                  Connect either Google AI Studio directly or any custom API provider (CommandCode, OpenRouter, Groq, OpenAI). Stored securely on your personal device.
                </p>
              </div>

              {/* Step 1: Select AI Provider */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500">
                  1. Select AI Engine / Provider
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {/* Google Gemini Card */}
                  <button
                    type="button"
                    onClick={() => {
                      setAiProvider('gemini');
                      setSelectedModel('gemini-3.5-flash-lite');
                      setIsCustomModel(false);
                      setFetchedModels([]);
                      setModelFetchMessage(null);
                      setTestResult(null);
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      aiProvider === 'gemini'
                        ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] shadow-[0_0_15px_rgba(139,92,246,0.25)]'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="w-7 h-7 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6]">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      {aiProvider === 'gemini' && (
                        <span className="w-5 h-5 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white light:text-slate-900">Google AI Studio</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">Gemini 2.5/3.5 Flash</div>
                    </div>
                  </button>

                  {/* Other AI API Key / CommandCode Card */}
                  <button
                    type="button"
                    onClick={() => {
                      setAiProvider('openai_compatible');
                      setSelectedModel('gpt-4o-mini');
                      setIsCustomModel(false);
                      setFetchedModels([]);
                      setModelFetchMessage(null);
                      setTestResult(null);
                      if (!aiBaseUrl) setAiBaseUrl('https://api.commandcode.ai/v1');
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all relative flex flex-col justify-between ${
                      aiProvider === 'openai_compatible'
                        ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] shadow-[0_0_15px_rgba(139,92,246,0.25)]'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="w-7 h-7 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6]">
                        <Terminal className="w-3.5 h-3.5" />
                      </div>
                      {aiProvider === 'openai_compatible' && (
                        <span className="w-5 h-5 rounded-full bg-[#8B5CF6] text-white flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white light:text-slate-900">Other AI API Key</div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">CommandCode / OpenAI</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Endpoint Guidance for Other AI API */}
              {aiProvider === 'openai_compatible' && (
                <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500">
                      2. Provider Endpoint & Base URL
                    </label>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { name: 'CommandCode', url: 'https://api.commandcode.ai/v1' },
                      { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
                      { name: 'Groq', url: 'https://api.groq.com/openai/v1' },
                      { name: 'OpenAI', url: 'https://api.openai.com/v1' },
                      { name: 'DeepSeek', url: 'https://api.deepseek.com/v1' },
                    ].map((preset) => {
                      const isActive = aiBaseUrl === preset.url;
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setAiBaseUrl(preset.url);
                            setFetchedModels([]);
                            setModelFetchMessage(null);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                            isActive
                              ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#C4B5FD]'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={aiBaseUrl}
                    onChange={(e) => {
                      setAiBaseUrl(e.target.value);
                      setFetchedModels([]);
                      setModelFetchMessage(null);
                    }}
                    placeholder="https://api.commandcode.ai/v1"
                    className="w-full px-3 py-2 rounded-xl bg-black/30 light:bg-white border border-white/10 light:border-black/10 text-white light:text-slate-900 font-mono text-xs focus:outline-none focus:border-[#8B5CF6]"
                  />
                  <div className="p-2.5 rounded-xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 text-[11px] text-[#C4B5FD] leading-relaxed flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>
                      CommandCode AI provides standard OpenAI-compatible endpoints. Enter your key below, then tap &apos;Connect &amp; Fetch Available Models&apos; to automatically retrieve all models assigned to your subscription.
                    </span>
                  </div>
                </div>
              )}

              {/* Step 3: API Key & Dynamic Model Fetcher */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500">
                    {aiProvider === 'openai_compatible' ? '3. Enter API Key' : '2. Enter Google AI Studio Key'}
                  </span>
                  {maskedKey && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                      <Check className="w-3 h-3" /> Key Active
                    </span>
                  )}
                </div>

                {maskedKey ? (
                  <div className="flex items-center justify-between bg-black/30 light:bg-slate-100 p-3 rounded-[18px] border border-white/[0.07] light:border-black/[0.07]">
                    <span className="font-mono text-xs text-white light:text-slate-900">{maskedKey}</span>
                    <button
                      onClick={handleRemoveKey}
                      className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded-full hover:bg-white/5"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-[#64748B] italic p-1">
                    {aiProvider === 'gemini'
                      ? 'Enter your personal Google AI Studio key below (or leave empty to test server ambient key).'
                      : 'Enter your CommandCode or custom API key below to connect.'}
                  </div>
                )}

                {/* Key Input Toggle/Box */}
                {(!maskedKey || showKeyInput) && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-[10px] text-[#94A3B8] light:text-slate-500 font-semibold block">
                      {aiProvider === 'gemini' ? 'Google AI Studio Key (AIzaSy...)' : 'Custom Provider API Key'}
                    </label>
                    <input
                      type="password"
                      value={newKeyInput}
                      onChange={(e) => {
                        setNewKeyInput(e.target.value);
                        setTestResult(null);
                        setFetchedModels([]);
                        setModelFetchMessage(null);
                      }}
                      placeholder={aiProvider === 'gemini' ? 'AIzaSy...' : 'cmd-... or sk-...'}
                      className="w-full px-4 py-2.5 rounded-xl bg-black/40 light:bg-white border border-white/10 light:border-black/10 text-white light:text-slate-900 font-mono text-xs focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>
                )}

                {/* Connect & Fetch Models Button */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleFetchModels}
                    disabled={isFetchingModels}
                    className="flex-1 py-2.5 rounded-xl btn-primary-gradient text-white text-xs font-semibold shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingModels ? 'animate-spin' : ''}`} />
                    <span>{isFetchingModels ? 'Connecting & Fetching Models...' : 'Connect & Fetch Available Models'}</span>
                  </button>

                  {maskedKey && (
                    <button
                      onClick={() => setShowKeyInput(!showKeyInput)}
                      className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] light:bg-black/[0.05] border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs font-semibold active:scale-95 transition-all"
                    >
                      {showKeyInput ? 'Cancel' : 'Change Key'}
                    </button>
                  )}
                </div>

                {/* Fetch Feedback Message */}
                {modelFetchMessage && (
                  <div
                    className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                      modelFetchMessage.isError
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-200'
                        : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
                    }`}
                  >
                    {modelFetchMessage.isError ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span className="leading-relaxed">{modelFetchMessage.text}</span>
                  </div>
                )}
              </div>

              {/* Step 4: Model Selector (Live Fetched or Smart Defaults) */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500">
                    {aiProvider === 'openai_compatible' ? '4. Selected Model' : '3. Selected Model'}
                  </label>
                  <span className="text-[10px] text-[#8B5CF6] font-mono font-medium">
                    {isCustomModel ? (customModelInput || 'custom') : selectedModel}
                  </span>
                </div>

                {/* Model Dropdown */}
                {fetchedModels.length > 0 ? (
                  <select
                    value={isCustomModel ? 'custom' : selectedModel}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomModel(true);
                      } else {
                        setIsCustomModel(false);
                        setSelectedModel(e.target.value);
                      }
                      setTestResult(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-2xl bg-black/40 light:bg-white border border-[#8B5CF6]/50 text-white light:text-slate-900 text-xs focus:outline-none focus:border-[#8B5CF6]"
                  >
                    {fetchedModels.map((m, idx) => (
                      <option key={m} value={m}>
                        {m} {idx === 0 ? '⚡ (Recommended · Fastest)' : ''}
                      </option>
                    ))}
                    <option value="custom">Type Custom Model Name...</option>
                  </select>
                ) : aiProvider === 'gemini' ? (
                  <select
                    value={isCustomModel ? 'custom' : selectedModel}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomModel(true);
                      } else {
                        setIsCustomModel(false);
                        setSelectedModel(e.target.value);
                      }
                      setTestResult(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-2xl bg-black/40 light:bg-white border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite ⚡ (Recommended · Fastest)</option>
                    <option value="gemini-flash-lite-latest">gemini-flash-lite-latest (Stable Fast)</option>
                    <option value="gemini-3.5-flash">gemini-3.5-flash (High Intelligence)</option>
                    <option value="gemini-3.7-flash">gemini-3.7-flash (Latest Model)</option>
                    <option value="custom">Type Custom Model Name...</option>
                  </select>
                ) : (
                  <select
                    value={isCustomModel ? 'custom' : selectedModel}
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        setIsCustomModel(true);
                      } else {
                        setIsCustomModel(false);
                        setSelectedModel(e.target.value);
                      }
                      setTestResult(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-2xl bg-black/40 light:bg-white border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs focus:outline-none focus:border-[#8B5CF6]"
                  >
                    <option value="commandcode-flash">commandcode-flash ⚡ (CommandCode Fast)</option>
                    <option value="gpt-4o-mini">gpt-4o-mini (OpenAI Fast)</option>
                    <option value="gpt-4o">gpt-4o (High Accuracy)</option>
                    <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                    <option value="custom">Type Custom Model Name...</option>
                  </select>
                )}

                {/* Custom Model Text Input */}
                {isCustomModel && (
                  <div className="pt-1 space-y-1">
                    <label className="text-[10px] text-[#94A3B8] light:text-slate-500 font-semibold block">
                      Type exact model ID as named in your provider account:
                    </label>
                    <input
                      type="text"
                      value={customModelInput}
                      onChange={(e) => {
                        setCustomModelInput(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder={aiProvider === 'gemini' ? 'e.g. gemini-3.5-flash-lite' : 'e.g. commandcode-flash or gpt-4o-mini'}
                      className="w-full px-3 py-2 rounded-xl bg-black/30 light:bg-white border border-[#8B5CF6]/50 text-white light:text-slate-900 font-mono text-xs focus:outline-none focus:border-[#8B5CF6]"
                    />
                  </div>
                )}

                {/* Connection Test & Save Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06] light:border-black/[0.06]">
                  <button
                    onClick={handleTestKey}
                    disabled={isTestingKey}
                    className="flex-1 py-2.5 rounded-full bg-white/[0.06] light:bg-black/[0.05] hover:bg-white/10 light:hover:bg-black/10 border border-[#8B5CF6]/40 text-[#8B5CF6] text-xs font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingKey ? 'animate-spin' : ''}`} />
                    <span>{isTestingKey ? 'Testing Model...' : 'Test Connection'}</span>
                  </button>

                  <button
                    onClick={handleSaveAISettings}
                    className="flex-1 py-2.5 rounded-full btn-primary-gradient text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Save All Settings</span>
                  </button>
                </div>

                {/* Test Result Feedback */}
                {testResult && (
                  <div
                    className={`p-3 rounded-2xl text-xs flex items-center gap-2.5 ${
                      testResult.valid
                        ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-200'
                        : 'bg-red-500/15 border border-red-500/30 text-red-200'
                    }`}
                  >
                    {testResult.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span className="leading-relaxed">{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: READER PREFERENCES */}
          {activeTab === 'reader' && (
            <div className="space-y-4">
              {/* Text Size Slider */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-white light:text-slate-900">
                  <span>Default Reader Font Size</span>
                  <span className="font-mono text-[#8B5CF6]">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="32"
                  step="2"
                  value={fontSize}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setFontSize(val);
                    handleSaveDisplayPrefs({ fontSize: val });
                  }}
                  className="w-full accent-[#8B5CF6] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[#64748B]">
                  <span>16px (Pocket)</span>
                  <span>22px (Standard)</span>
                  <span>32px (Stage)</span>
                </div>
              </div>

              {/* Line Height Stanza Spacing */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-white light:text-slate-900">
                  <span>Line Height (Stanza Spacing)</span>
                  <span className="font-mono text-[#8B5CF6]">{lineHeight.toFixed(1)}x</span>
                </div>
                <div className="flex items-center gap-2">
                  {[1.5, 1.8, 2.0, 2.2].map((lh) => (
                    <button
                      key={lh}
                      onClick={() => {
                        setLineHeight(lh);
                        handleSaveDisplayPrefs({ lineHeight: lh });
                      }}
                      className={`flex-1 py-2 rounded-full text-xs font-semibold border transition-all ${
                        lineHeight === lh
                          ? 'btn-primary-gradient border-transparent text-white'
                          : 'bg-white/5 light:bg-black/5 text-[#94A3B8] light:text-slate-600 border-white/10 light:border-black/10'
                      }`}
                    >
                      {lh}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Keep Awake Toggle */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white light:text-slate-900">Keep Screen Awake</div>
                  <div className="text-[11px] text-[#94A3B8] light:text-slate-500 mt-0.5">
                    Prevents screen from dimming or sleeping during tour addas
                  </div>
                </div>
                <button
                  onClick={() => {
                    const next = !keepAwake;
                    setKeepAwake(next);
                    handleSaveDisplayPrefs({ keepAwake: next });
                  }}
                  className={`w-12 h-7 rounded-full p-1 transition-colors ${
                    keepAwake ? 'bg-[#8B5CF6]' : 'bg-white/15 light:bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      keepAwake ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Full Text Lyrics Search Toggle */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white light:text-slate-900">Full-Text Lyrics Search</div>
                  <div className="text-[11px] text-[#94A3B8] light:text-slate-500 mt-0.5">
                    Match keywords inside song lyrics in search bar
                  </div>
                </div>
                <button
                  onClick={() => {
                    const next = !fullTextSearch;
                    setFullTextSearch(next);
                    handleSaveDisplayPrefs({ fullTextLyricsSearch: next });
                  }}
                  className={`w-12 h-7 rounded-full p-1 transition-colors ${
                    fullTextSearch ? 'bg-[#8B5CF6]' : 'bg-white/15 light:bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      fullTextSearch ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: APPROVED SOURCES */}
          {activeTab === 'sources' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] text-xs text-[#94A3B8] light:text-slate-600">
                <span className="font-bold text-[#8B5CF6] block mb-0.5">Approved Bengali Archives:</span>
                Only verified lyrics archives are queried. The app never makes background requests to unapproved sites.
              </div>

              <div className="space-y-2">
                {APPROVED_LYRICS_SOURCES.map((site) => {
                  const isEnabled = enabledSites.includes(site.id);
                  return (
                    <div
                      key={site.id}
                      className="p-3.5 rounded-[22px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] flex items-center justify-between gap-3"
                    >
                      <div className="truncate">
                        <div className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-1.5 truncate">
                          <span>{site.name}</span>
                          <span className="text-[10px] font-mono text-[#64748B]">({site.domain})</span>
                        </div>
                        <div className="text-[11px] text-[#94A3B8] light:text-slate-500 truncate mt-0.5">{site.notes}</div>
                      </div>

                      <button
                        onClick={() => handleToggleSite(site.id)}
                        className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${
                          isEnabled ? 'bg-[#8B5CF6]' : 'bg-white/15 light:bg-slate-300'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: DATA & BACKUP */}
          {activeTab === 'data' && (
            <div className="space-y-4">
              {/* Storage Persistence */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white light:text-slate-900">Browser Storage Shield</div>
                  <div className="text-[11px] text-[#94A3B8] light:text-slate-500 mt-0.5">
                    {isPersisted
                      ? 'Storage is protected from OS cleanup.'
                      : 'Request persistence to guard against storage clearing.'}
                  </div>
                </div>
                {!isPersisted && (
                  <button
                    onClick={handleRequestPersist}
                    className="px-3.5 py-1.5 rounded-full bg-[#8B5CF6]/15 text-[#C4B5FD] text-xs font-bold border border-[#8B5CF6]/30 active:scale-95"
                  >
                    Protect
                  </button>
                )}
              </div>

              {/* Export Buttons */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block">
                  Export Options
                </span>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => backupManager.exportFullBackup()}
                    className="p-3.5 rounded-[20px] bg-white/[0.05] light:bg-black/[0.04] hover:bg-white/10 light:hover:bg-black/[0.07] border border-white/10 light:border-black/10 text-left transition-all active:scale-95 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-[#8B5CF6] mb-1">
                      <Download className="w-4 h-4" />
                      <span className="text-[10px] font-mono bg-[#8B5CF6]/15 px-1.5 py-0.5 rounded-full">
                        Full
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white light:text-slate-900">Full Backup</div>
                    <div className="text-[10px] text-[#94A3B8] light:text-slate-500 mt-1">
                      Songs, lyrics, notes. Zero keys.
                    </div>
                  </button>

                  <button
                    onClick={() => backupManager.exportCatalogueShare()}
                    className="p-3.5 rounded-[20px] bg-white/[0.05] light:bg-black/[0.04] hover:bg-white/10 light:hover:bg-black/[0.07] border border-white/10 light:border-black/10 text-left transition-all active:scale-95 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-blue-400 mb-1">
                      <Download className="w-4 h-4" />
                      <span className="text-[10px] font-mono bg-blue-500/15 px-1.5 py-0.5 rounded-full">
                        Share
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white light:text-slate-900">Catalogue Share</div>
                    <div className="text-[10px] text-[#94A3B8] light:text-slate-500 mt-1">
                      Titles & links only. No lyrics.
                    </div>
                  </button>
                </div>
              </div>

              {/* Restore */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block">
                  Restore from JSON Backup
                </span>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-white light:text-slate-900 cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      value="merge"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                      className="accent-[#8B5CF6]"
                    />
                    <span>Merge with existing</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-white light:text-slate-900 cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      value="replace"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                      className="accent-[#8B5CF6]"
                    />
                    <span>Replace all</span>
                  </label>
                </div>

                <label className="flex items-center justify-center gap-2 w-full py-3 rounded-full bg-white/[0.06] light:bg-black/[0.05] hover:bg-white/10 light:hover:bg-black/10 border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs font-bold cursor-pointer transition-all active:scale-95">
                  <Upload className="w-4 h-4 text-[#8B5CF6]" />
                  <span>Choose Backup File (.json)</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleRestoreFile}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Danger Zone */}
              <div className="p-4 rounded-[24px] bg-red-500/10 border border-red-500/25 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-400 block">
                  Library Maintenance
                </span>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleReloadSampleData}
                    className="px-3.5 py-2 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-white light:text-slate-900 text-xs font-semibold active:scale-95"
                  >
                    Load Sample Songs
                  </button>

                  <button
                    onClick={handleDeleteAllLyrics}
                    className="px-3.5 py-2 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold active:scale-95"
                  >
                    Delete All Lyrics
                  </button>

                  <button
                    onClick={handleClearLibrary}
                    className="px-3.5 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold active:scale-95"
                  >
                    Clear Library
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: YT-DLP SERVER */}
          {activeTab === 'server' && (
            <div className="space-y-4">
              <div className="p-4 rounded-[26px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#8B5CF6]" />
                  <span className="text-sm font-bold text-white light:text-slate-900">Self-Hosted yt-dlp Transcoder</span>
                </div>
                <p className="text-xs text-[#94A3B8] light:text-slate-600 leading-relaxed">
                  Connect your own private yt-dlp bridge for high-speed YouTube audio extraction into MP3, M4A, or FLAC without hitting third-party limits.
                </p>
              </div>

              {/* URL Input */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] light:text-slate-500 block">
                  Server Endpoint URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    placeholder="e.g. http://192.168.1.100:8080 or https://ytdlp.yourdomain.com"
                    className="flex-1 h-11 rounded-[18px] bg-black/40 light:bg-white border border-white/10 light:border-black/10 px-4 text-xs text-white light:text-slate-900 placeholder-[#64748B] focus:outline-none focus:border-[#8B5CF6]/50"
                  />
                  <button
                    onClick={handleSaveServerUrl}
                    className="px-4 h-11 rounded-[18px] btn-primary-gradient text-white text-xs font-bold active:scale-95 shadow-sm"
                  >
                    Save
                  </button>
                </div>

                {serverUrl && (
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={handleTestServer}
                      disabled={isTestingServer}
                      className="px-3.5 py-1.5 rounded-full bg-white/5 light:bg-black/5 border border-[#8B5CF6]/40 text-xs font-semibold text-[#8B5CF6] flex items-center gap-1.5 active:scale-95"
                    >
                      {isTestingServer ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Testing...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Test Health</span>
                        </>
                      )}
                    </button>

                    {serverTestStatus && (
                      <span className="text-xs font-medium text-white/90 light:text-slate-800">
                        {serverTestStatus}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Copy Server Code & Dockerfile */}
              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white light:text-slate-900 flex items-center gap-1.5">
                    <Terminal className="w-4 h-4 text-[#8B5CF6]" />
                    <span>Run Server with Docker</span>
                  </span>
                  <button
                    onClick={handleCopyServerCode}
                    className="px-3 py-1 rounded-full bg-white/5 light:bg-black/5 border border-white/10 light:border-black/10 text-xs font-semibold text-[#8B5CF6] flex items-center gap-1 active:scale-90"
                  >
                    {copiedServerCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedServerCode ? 'Copied' : 'Copy Commands'}</span>
                  </button>
                </div>
                <div className="p-3 rounded-[18px] bg-black/40 light:bg-slate-100 font-mono text-[11px] text-[#94A3B8] light:text-slate-700 space-y-1">
                  <div>docker build -t tour-ytdlp ./yt-dlp-server</div>
                  <div>docker run -d -p 8080:8080 tour-ytdlp</div>
                </div>
                <p className="text-[10px] text-[#64748B]">
                  The backend code is already included inside <span className="font-mono text-white/70 light:text-slate-700">/yt-dlp-server</span> in this repository.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: ABOUT */}
          {activeTab === 'about' && (
            <div className="space-y-3 text-xs text-[#94A3B8] light:text-slate-600">
              {/* Android APK Download Card */}
              <div className="p-4 rounded-[24px] bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-indigo-500/15 border border-emerald-500/30 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-400" />
                      Android App (APK)
                    </div>
                    <p className="text-[11px] text-[#94A3B8] light:text-slate-500 mt-0.5">
                      Direct offline install • v2.0 • 14.0 MB
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                    Latest APK
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300 light:text-slate-600">
                  অফলাইনে ফুল স্পিডে গান শোনা ও লিরিক্স পড়ার জন্য সরাসরি অ্যান্ড্রয়েড অ্যাপটি ডাউনলোড করে ইনস্টল করতে পারেন।
                </p>
                <a
                  href="/TourLyrics.apk"
                  download="TourLyrics.apk"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(16,185,129,0.35)] active:scale-95 transition-all cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download APK (14.0 MB)</span>
                </a>
              </div>

              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-1.5">
                <div className="text-base font-bold text-white light:text-slate-900">Tour Lyrics v2.0</div>
                <p className="leading-relaxed">
                  Tour Lyrics is an offline-first Bengali song lyrics reader designed for tours, picnics, and group addas where mobile internet is patchy or unavailable.
                </p>
              </div>

              <div className="p-4 rounded-[24px] bg-white/[0.04] light:bg-black/[0.03] border border-white/[0.08] light:border-black/[0.08] space-y-2 text-[#94A3B8] light:text-slate-600">
                <div className="font-bold text-white light:text-slate-900">Legal & Architecture Invariants</div>
                <p>• Ships with zero copyrighted lyrics. Sample songs are public domain Baul and folk songs.</p>
                <p>• Gemini extraction operates strictly on text supplied or requested by user.</p>
                <p>• Zero backend servers, zero telemetry, zero tracking.</p>
              </div>

              <div className="text-[11px] text-[#64748B] text-center pt-2">
                Built with React, Dexie IndexedDB, Tailwind CSS & Capacitor.
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
