import type { JizuraSettings } from './settings';
import { JIZURA_STYLE_OPTIONS, JIZURA_THEME_OPTIONS } from './styleOptions';

export interface JizuraRandomVariant {
    style: string;
    settings: JizuraSettings;
}

const hashSeed = (value: string) => {
    let hash = 2166136261;
    for (const character of value) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
};

const createRandom = (seed: string) => {
    let state = hashSeed(seed);
    return () => {
        state = Math.imul(state ^ (state >>> 16), 2246822519);
        state = Math.imul(state ^ (state >>> 13), 3266489917);
        return ((state ^= state >>> 16) >>> 0) / 4294967296;
    };
};

/**
 * Builds a stable-but-new JIZURA proposal for one playback occurrence.
 * The engine still performs its own full omakase selection; this extra roll
 * changes the direction and seed so a song without a saved preset does not
 * replay the same MV every time.
 */
export const createJizuraRandomVariant = (
    baseStyle: string,
    baseSettings: JizuraSettings,
    seed: string,
): JizuraRandomVariant => {
    const random = createRandom(seed);
    const style = JIZURA_STYLE_OPTIONS[Math.floor(random() * JIZURA_STYLE_OPTIONS.length)]?.value ?? baseStyle;
    const themeId = JIZURA_THEME_OPTIONS[Math.floor(random() * JIZURA_THEME_OPTIONS.length)]?.value ?? baseSettings.themeId;

    return {
        style,
        settings: {
            ...baseSettings,
            themeId,
            revision: baseSettings.revision + 1,
            rerollScope: null,
        },
    };
};
