import { create } from 'zustand';
import type { PlaybackMode } from '../types/playbackMode';
import { PLAYBACK_MODE_STORAGE_KEY } from '../types/playbackMode';

const readStoredPlaybackMode = (): PlaybackMode => {
    if (typeof window === 'undefined') return 'official';
    return localStorage.getItem(PLAYBACK_MODE_STORAGE_KEY) === 'source' ? 'source' : 'official';
};

export type PlaybackModeState = {
    playbackMode: PlaybackMode;
    setPlaybackMode: (mode: PlaybackMode) => void;
};

/**
 * Playback routing is deliberately independent from provider accounts.
 * Logging in only hydrates account data; this store is the sole manual switch
 * that decides whether playback goes through an official provider or LX sources.
 */
export const usePlaybackModeStore = create<PlaybackModeState>((set) => ({
    playbackMode: readStoredPlaybackMode(),
    setPlaybackMode: (mode) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(PLAYBACK_MODE_STORAGE_KEY, mode);
        }
        set({ playbackMode: mode });
    },
}));

export const getPlaybackMode = (): PlaybackMode => usePlaybackModeStore.getState().playbackMode;

export const isSourcePlaybackMode = (): boolean => getPlaybackMode() === 'source';
