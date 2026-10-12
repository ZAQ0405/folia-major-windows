import type { VisualizerMode } from '../../../types';
import { isBuiltinVisualizerMode } from '../../../types/visualizerModes';

export interface FoliaSongPreset {
    mode: VisualizerMode;
}

export type FoliaSongPresetMap = Record<string, FoliaSongPreset>;

const FOLIA_SONG_PRESETS_STORAGE_KEY = 'folia_song_presets';

export const sanitizeFoliaSongPresetMap = (value: unknown): FoliaSongPresetMap => {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => {
                const mode = item && typeof item === 'object'
                    ? (item as { mode?: unknown }).mode
                    : null;
                return [key, isBuiltinVisualizerMode(mode) && mode !== 'jizura' && mode !== 'still'
                    ? { mode }
                    : null] as const;
            })
            .filter((entry): entry is [string, FoliaSongPreset] => Boolean(entry[1])),
    );
};

export const readStoredFoliaSongPresets = (): FoliaSongPresetMap => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(FOLIA_SONG_PRESETS_STORAGE_KEY);
        return raw ? sanitizeFoliaSongPresetMap(JSON.parse(raw)) : {};
    } catch {
        return {};
    }
};

export const persistFoliaSongPresets = (presets: FoliaSongPresetMap) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(FOLIA_SONG_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    }
};
