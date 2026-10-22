import { create } from 'zustand';
import type { OnlineProviderId } from '../types/onlineMusic';
import type { PlaybackMode } from '../types/playbackMode';
import { PLAYBACK_MODE_STORAGE_KEY, PROVIDER_PLAYBACK_MODE_STORAGE_KEY } from '../types/playbackMode';
import { isAndroidCapacitor } from '../utils/runtimePlatform';

export const resolveInitialPlaybackMode = (
    storedMode: string | null,
    isAndroid = isAndroidCapacitor,
): PlaybackMode => {
    if (storedMode === 'source') return 'source';
    if (storedMode === 'official') return 'official';
    // Android release has no bundled provider API server. Follow LX Music's
    // script-first playback route by default, while respecting any saved choice.
    return isAndroid ? 'source' : 'official';
};

const readStoredPlaybackMode = (): PlaybackMode => {
    if (typeof window === 'undefined') return resolveInitialPlaybackMode(null);
    return resolveInitialPlaybackMode(localStorage.getItem(PLAYBACK_MODE_STORAGE_KEY));
};

type ProviderPlaybackModes = Partial<Record<string, PlaybackMode>>;

const readStoredProviderPlaybackModes = (): ProviderPlaybackModes => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(localStorage.getItem(PROVIDER_PLAYBACK_MODE_STORAGE_KEY) || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.entries(parsed).filter(([, value]) => value === 'official' || value === 'source'),
        ) as ProviderPlaybackModes;
    } catch {
        return {};
    }
};

export type PlaybackModeState = {
    playbackMode: PlaybackMode;
    providerPlaybackModes: ProviderPlaybackModes;
    setPlaybackMode: (mode: PlaybackMode) => void;
    setProviderPlaybackMode: (providerId: OnlineProviderId, mode: PlaybackMode | null) => void;
};

/**
 * Playback routing is deliberately independent from provider accounts.
 * Logging in only hydrates account data; this store is the sole manual switch
 * that decides whether playback goes through an official provider or LX sources.
 */
export const usePlaybackModeStore = create<PlaybackModeState>((set) => ({
    playbackMode: readStoredPlaybackMode(),
    providerPlaybackModes: readStoredProviderPlaybackModes(),
    setPlaybackMode: (mode) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(PLAYBACK_MODE_STORAGE_KEY, mode);
        }
        set({ playbackMode: mode });
    },
    setProviderPlaybackMode: (providerId, mode) => {
        set(state => {
            const next = { ...state.providerPlaybackModes };
            if (mode) next[providerId] = mode;
            else delete next[providerId];
            if (typeof window !== 'undefined') {
                localStorage.setItem(PROVIDER_PLAYBACK_MODE_STORAGE_KEY, JSON.stringify(next));
            }
            return { providerPlaybackModes: next };
        });
    },
}));

export const getPlaybackMode = (): PlaybackMode => usePlaybackModeStore.getState().playbackMode;

export const getPlaybackModeForProvider = (providerId: OnlineProviderId): PlaybackMode => (
    usePlaybackModeStore.getState().providerPlaybackModes[providerId]
    || getPlaybackMode()
);

export const isSourcePlaybackMode = (): boolean => getPlaybackMode() === 'source';

export const isSourcePlaybackModeForProvider = (providerId: OnlineProviderId): boolean => (
    getPlaybackModeForProvider(providerId) === 'source'
);
