export type JizuraCenterDirection = 'tb' | 'lr';
export type JizuraThemeId = 'lyricpv' | 'kinetic' | 'wa' | 'horror' | 'pop' | 'ballad';
export type JizuraRerollScope = 'style' | 'color' | 'mood' | 'arrange';

export interface JizuraSettings {
    themeId: JizuraThemeId;
    extra: boolean;
    wa: boolean;
    horror: boolean;
    typo: boolean;
    kinetic: boolean;
    unify: boolean;
    typeset: boolean;
    centerDir: JizuraCenterDirection;
    centerFree: boolean;
    /** Increments when one of JIZURA's "只换这一项" actions is used. */
    revision: number;
    rerollScope: JizuraRerollScope | null;
}

export const DEFAULT_JIZURA_SETTINGS: JizuraSettings = {
    themeId: 'kinetic',
    extra: false,
    wa: true,
    horror: false,
    typo: true,
    kinetic: true,
    unify: false,
    typeset: false,
    centerDir: 'tb',
    centerFree: false,
    revision: 0,
    rerollScope: null,
};

const JIZURA_SETTINGS_STORAGE_KEY = 'jizura_settings';

const isCenterDirection = (value: unknown): value is JizuraCenterDirection => value === 'tb' || value === 'lr';
const isThemeId = (value: unknown): value is JizuraThemeId => (
    value === 'lyricpv'
    || value === 'kinetic'
    || value === 'wa'
    || value === 'horror'
    || value === 'pop'
    || value === 'ballad'
);
const isRerollScope = (value: unknown): value is JizuraRerollScope => (
    value === 'style' || value === 'color' || value === 'mood' || value === 'arrange'
);

export const sanitizeJizuraSettings = (value: unknown): JizuraSettings => {
    const parsed = value && typeof value === 'object' ? value as Partial<JizuraSettings> : {};
    return {
        ...DEFAULT_JIZURA_SETTINGS,
        ...Object.fromEntries(
            Object.keys(DEFAULT_JIZURA_SETTINGS)
                .filter(key => typeof parsed[key as keyof JizuraSettings] === 'boolean')
                .map(key => [key, parsed[key as keyof JizuraSettings]]),
        ),
        centerDir: isCenterDirection(parsed.centerDir) ? parsed.centerDir : DEFAULT_JIZURA_SETTINGS.centerDir,
        themeId: isThemeId(parsed.themeId) ? parsed.themeId : DEFAULT_JIZURA_SETTINGS.themeId,
        revision: Number.isFinite(parsed.revision) ? Math.max(0, Math.floor(parsed.revision as number)) : DEFAULT_JIZURA_SETTINGS.revision,
        rerollScope: isRerollScope(parsed.rerollScope) ? parsed.rerollScope : DEFAULT_JIZURA_SETTINGS.rerollScope,
    } as JizuraSettings;
};

export const readStoredJizuraSettings = (): JizuraSettings => {
    if (typeof window === 'undefined') return { ...DEFAULT_JIZURA_SETTINGS };

    try {
        const raw = localStorage.getItem(JIZURA_SETTINGS_STORAGE_KEY);
        if (!raw) return { ...DEFAULT_JIZURA_SETTINGS };
        return sanitizeJizuraSettings(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_JIZURA_SETTINGS };
    }
};

export const persistJizuraSettings = (settings: JizuraSettings) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(JIZURA_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
};
