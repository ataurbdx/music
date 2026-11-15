import React, { createContext, useContext, useState, useEffect } from 'react';
import { SongRecord } from '../types';
import {
  audioEngine,
  AudioEngineState,
  EQPresetKey,
  EQ_PRESETS,
} from '../services/audioEngine';

interface AudioContextValue extends AudioEngineState {
  isFullPlayerOpen: boolean;
  setIsFullPlayerOpen: (open: boolean) => void;
  fullPlayerTab: 'visualizer' | 'lyrics' | 'split';
  setFullPlayerTab: (tab: 'visualizer' | 'lyrics' | 'split') => void;
  playSong: (song: SongRecord, queue?: SongRecord[]) => Promise<void>;
  togglePlay: () => void;
  play: () => Promise<void>;
  pause: () => void;
  seek: (seconds: number) => void;
  next: () => void;
  previous: () => void;
  setEQPreset: (preset: EQPresetKey) => void;
  setBandGain: (bandIndex: number, gainDb: number) => void;
  setPreamp: (gainDb: number) => void;
  setPlaybackRate: (rate: number) => void;
  setLoopMode: (mode: 'off' | 'all' | 'one') => void;
  toggleShuffle: () => void;
  openPlayerForSong: (song: SongRecord, tab?: 'visualizer' | 'lyrics' | 'split', queue?: SongRecord[]) => void;
  updateCurrentSong: (song: SongRecord) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setSleepTimer: (durationMinutes: number, label?: string) => void;
  setSleepTimerSongs: (songCount: number, label?: string) => void;
  cancelSleepTimer: () => void;
  handleTrackEnded: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [engineState, setEngineState] = useState<AudioEngineState>(audioEngine.getState());
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState<boolean>(false);
  const [fullPlayerTab, setFullPlayerTab] = useState<'visualizer' | 'lyrics' | 'split'>('visualizer');

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe((newState) => {
      setEngineState(newState);
    });
    return () => unsubscribe();
  }, []);

  const playSong = async (song: SongRecord, queue?: SongRecord[]) => {
    await audioEngine.loadSong(song, queue, true);
  };

  const openPlayerForSong = (
    song: SongRecord,
    tab: 'visualizer' | 'lyrics' | 'split' = 'visualizer',
    queue?: SongRecord[]
  ) => {
    if (engineState.currentSong?.id !== song.id || (queue && queue.length > 0)) {
      playSong(song, queue);
    }
    setFullPlayerTab(tab);
    setIsFullPlayerOpen(true);
  };

  const updateCurrentSong = (song: SongRecord) => {
    audioEngine.updateCurrentSong(song);
  };

  const value: AudioContextValue = {
    ...engineState,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    fullPlayerTab,
    setFullPlayerTab,
    playSong,
    togglePlay: () => audioEngine.togglePlay(),
    play: () => audioEngine.play(),
    pause: () => audioEngine.pause(),
    seek: (sec) => audioEngine.seek(sec),
    next: () => audioEngine.next(),
    previous: () => audioEngine.previous(),
    setEQPreset: (p) => audioEngine.setEQPreset(p),
    setBandGain: (i, g) => audioEngine.setBandGain(i, g),
    setPreamp: (g) => audioEngine.setPreamp(g),
    setPlaybackRate: (r) => audioEngine.setPlaybackRate(r),
    setLoopMode: (m) => audioEngine.setLoopMode(m),
    toggleShuffle: () => audioEngine.toggleShuffle(),
    openPlayerForSong,
    updateCurrentSong,
    setVolume: (v) => audioEngine.setVolume(v),
    toggleMute: () => audioEngine.toggleMute(),
    setSleepTimer: (m, l) => audioEngine.setSleepTimer(m, l),
    setSleepTimerSongs: (c, l) => audioEngine.setSleepTimerSongs(c, l),
    cancelSleepTimer: () => audioEngine.cancelSleepTimer(),
    handleTrackEnded: () => audioEngine.handleTrackEnded(),
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return ctx;
}
