import { DEFAULT_JIZURA_SETTINGS, type JizuraSettings } from './settings';

export interface JizuraSongPreset {
    style: string;
    settings: JizuraSettings;
}

export type JizuraSongPresetMap = Record<string, JizuraSongPreset>;

const JIZURA_SONG_PRESETS_STORAGE_KEY = 'jizura_song_presets';

const isThemeId = (value: unknown): value is JizuraSettings['themeId'] => (
    value === 'lyricpv'
    || value === 'kinetic'
    || value === 'wa'
    || value === 'horror'
    || value === 'pop'
    || value === 'ballad'
);

const isCenterDir = (value: unknown): value is JizuraSettings['centerDir'] => (
    value === 'tb' || value === 'lr'
);

const isRerollScope = (value: unknown): value is JizuraSettings['rerollScope'] => (
    value === 'style' || value === 'color' || value === 'mood' || value === 'arrange'
);

const sanitizeSettings = (value: unknown): JizuraSettings => {
    const source = value && typeof value === 'object' ? value as Partial<JizuraSettings> : {};
    return {
        ...DEFAULT_JIZURA_SETTINGS,
        ...Object.fromEntries(
            (['extra', 'wa', 'horror', 'typo', 'kinetic', 'unify', 'typeset', 'centerFree'] as const)
                .filter(key => typeof source[key] === 'boolean')
                .map(key => [key, source[key]]),
        ),
        themeId: isThemeId(source.themeId) ? source.themeId : DEFAULT_JIZURA_SETTINGS.themeId,
        centerDir: isCenterDir(source.centerDir) ? source.centerDir : DEFAULT_JIZURA_SETTINGS.centerDir,
        revision: Number.isFinite(source.revision) ? Math.max(0, Math.floor(source.revision as number)) : 0,
        rerollScope: isRerollScope(source.rerollScope) ? source.rerollScope : null,
    };
};

const sanitizePreset = (value: unknown): JizuraSongPreset | null => {
    if (!value || typeof value !== 'object') return null;
    const source = value as Partial<JizuraSongPreset>;
    return {
        style: typeof source.style === 'string' && source.style.trim() ? source.style.trim() : 'noir',
        settings: sanitizeSettings(source.settings),
    };
};

export const sanitizeJizuraSongPresetMap = (value: unknown): JizuraSongPresetMap => {
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .map(([key, item]) => [key, sanitizePreset(item)] as const)
            .filter((entry): entry is [string, JizuraSongPreset] => Boolean(entry[1])),
    );
};

export const readStoredJizuraSongPresets = (): JizuraSongPresetMap => {
    if (typeof window === 'undefined') return {};

    try {
        const raw = localStorage.getItem(JIZURA_SONG_PRESETS_STORAGE_KEY);
        if (!raw) return {};
        return sanitizeJizuraSongPresetMap(JSON.parse(raw));
    } catch {
        return {};
    }
};

export const persistJizuraSongPresets = (presets: JizuraSongPresetMap) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(JIZURA_SONG_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    }
};
