import { createSafeObjectUrl } from '../utils/blobGuards';
import { sanitizeDownloadFileName } from '../utils/downloadFileName';

export type SettingsBackupCategory = 'complete' | 'folia' | 'jizura';

export interface SettingsBackupPayload {
    format: 'folia-settings-backup';
    version: 1;
    category: SettingsBackupCategory;
    exportedAt: number;
    config: Record<string, unknown>;
}

const FOLIA_KEYS = [
    'visualizerMode',
    'foliaSongPresets',
    'randomVisualizerModePerSong',
    'visualizerBackgroundMode',
    'backgroundOpacity',
    'useCoverColorBg',
    'disableVisualizerGeometricBackground',
    'disableVisualizerVignette',
    'staticMode',
    'visualizerOpacity',
    'visualizerTunings',
    'classicTuning',
    'cadenzaTuning',
    'partitaTuning',
    'fumeTuning',
    'claddaghTuning',
    'cappellaTuning',
    'tiltTuning',
    'dioramaTuning',
    'monetBackgroundTuning',
    'nomandBackgroundTuning',
    'latentBackgroundTuning',
    'monetTuning',
    'pendoloTuning',
    'sonnetTuning',
    'temperaTuning',
    'urlBackgroundList',
    'urlBackgroundSelectedId',
] as const;

const JIZURA_KEYS = [
    'jizuraEnabled',
    'jizuraStyle',
    'jizuraSettings',
    'jizuraSongPresets',
] as const;

const pickKeys = (config: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(
    keys
        .filter(key => config[key] !== undefined)
        .map(key => [key, config[key]]),
);

export const buildCategorizedSettingsConfig = (
    category: SettingsBackupCategory,
    config: Record<string, unknown>,
): Record<string, unknown> => {
    if (category === 'folia') return pickKeys(config, FOLIA_KEYS);
    if (category === 'jizura') return pickKeys(config, JIZURA_KEYS);
    return { ...config };
};

export const createSettingsBackupPayload = (
    category: SettingsBackupCategory,
    config: Record<string, unknown>,
    exportedAt = Date.now(),
): SettingsBackupPayload => ({
    format: 'folia-settings-backup',
    version: 1,
    category,
    exportedAt,
    config: buildCategorizedSettingsConfig(category, config),
});

export const serializeSettingsBackup = (
    category: SettingsBackupCategory,
    config: Record<string, unknown>,
): string => `${JSON.stringify(createSettingsBackupPayload(category, config), null, 2)}\n`;

export const unwrapSettingsBackup = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== 'object') return null;
    const payload = value as Partial<SettingsBackupPayload>;
    if (payload.format !== 'folia-settings-backup' || payload.version !== 1) return null;
    if (!payload.config || typeof payload.config !== 'object') throw new Error('Invalid settings backup payload');
    return payload.config as Record<string, unknown>;
};

export const downloadSettingsBackup = (
    category: SettingsBackupCategory,
    config: Record<string, unknown>,
): void => {
    const labels: Record<SettingsBackupCategory, string> = {
        complete: '完整设置',
        folia: 'Folia歌词动画',
        jizura: 'JIZURA歌词MV',
    };
    const content = serializeSettingsBackup(category, config);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = createSafeObjectUrl(blob);
    if (!url) throw new Error('Failed to create settings backup download');

    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeDownloadFileName(`folia-${labels[category]}-备份`, 'folia-settings')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
