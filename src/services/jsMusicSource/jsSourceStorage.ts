import type { JsMusicSourceRecord } from '../../types/jsMusicSource';
import {
    GDSTUDIO_SOURCE_CODE,
    GDSTUDIO_SOURCE_HOMEPAGE,
    GDSTUDIO_SOURCE_ID,
} from './bundledGdStudioSource';
import {
    STELLARWAVE_SOURCE_CODE,
    STELLARWAVE_SOURCE_HOMEPAGE,
    STELLARWAVE_SOURCE_ID,
} from './bundledStellarWaveSource';

// src/services/jsMusicSource/jsSourceStorage.ts

export const JS_MUSIC_SOURCE_STORAGE_KEY = 'folia_js_music_sources_v1';
const MAX_SOURCE_COUNT = 20;
const MAX_SOURCE_CODE_LENGTH = 2 * 1024 * 1024;
const LEGACY_URL_CACHE_PREFIX = 'folia_lx_music_url_v1:';
const GDSTUDIO_SEED_KEY = 'folia_js_gdstudio_seed_v1';
const STELLARWAVE_SEED_KEY = 'folia_js_stellarwave_seed_v1';

const clearLegacyUrlCache = (): void => {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(LEGACY_URL_CACHE_PREFIX)) localStorage.removeItem(key);
    }
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isValidSource = (value: unknown): value is JsMusicSourceRecord => {
    if (!isRecord(value)) return false;
    return typeof value.id === 'string'
        && typeof value.name === 'string'
        && typeof value.code === 'string'
        && value.code.length > 0
        && value.code.length <= MAX_SOURCE_CODE_LENGTH
        && typeof value.enabled === 'boolean'
        && typeof value.createdAt === 'number'
        && typeof value.updatedAt === 'number';
};

export const loadJsMusicSources = (): JsMusicSourceRecord[] => {
    if (typeof localStorage === 'undefined') return [];
    try {
        clearLegacyUrlCache();
        const raw = localStorage.getItem(JS_MUSIC_SOURCE_STORAGE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const sources = Array.isArray(parsed)
            ? parsed.filter(isValidSource).slice(0, MAX_SOURCE_COUNT)
            : [];
        const bundledIndex = sources.findIndex(source => source.id === GDSTUDIO_SOURCE_ID);
        let storageChanged = false;
        if (bundledIndex >= 0 && sources[bundledIndex].code !== GDSTUDIO_SOURCE_CODE) {
            sources[bundledIndex] = {
                ...sources[bundledIndex],
                code: GDSTUDIO_SOURCE_CODE,
                homepage: GDSTUDIO_SOURCE_HOMEPAGE,
                updatedAt: Date.now(),
            };
            storageChanged = true;
        }
        if (localStorage.getItem(GDSTUDIO_SEED_KEY) !== '1') {
            const alreadyInstalled = sources.some(source => source.id === GDSTUDIO_SOURCE_ID || source.homepage === GDSTUDIO_SOURCE_HOMEPAGE);
            if (!alreadyInstalled && sources.length < MAX_SOURCE_COUNT) {
                const now = Date.now();
                sources.unshift({
                    id: GDSTUDIO_SOURCE_ID,
                    name: 'GDSStudio 直连音源（Folia适配）',
                    description: '基于 GitHub LX Music 音源适配，直接获取完整音频与歌词',
                    version: '1.0.0',
                    author: 'Folia adapter / wangxanshen',
                    homepage: GDSTUDIO_SOURCE_HOMEPAGE,
                    code: GDSTUDIO_SOURCE_CODE,
                    enabled: true,
                    createdAt: now,
                    updatedAt: now,
                });
                storageChanged = true;
            }
            localStorage.setItem(GDSTUDIO_SEED_KEY, '1');
        }
        const stellarwaveIndex = sources.findIndex(source => source.id === STELLARWAVE_SOURCE_ID);
        if (stellarwaveIndex >= 0 && sources[stellarwaveIndex].code !== STELLARWAVE_SOURCE_CODE) {
            sources[stellarwaveIndex] = {
                ...sources[stellarwaveIndex],
                code: STELLARWAVE_SOURCE_CODE,
                description: '基于 LX Music 聚合源，覆盖网易、QQ、酷我、酷狗四个平台；已移除不稳定线路和失效酷我旧直链后端',
                homepage: STELLARWAVE_SOURCE_HOMEPAGE,
                updatedAt: Date.now(),
            };
            storageChanged = true;
        }
        if (localStorage.getItem(STELLARWAVE_SEED_KEY) !== '1') {
            const alreadyInstalled = sources.some(source => (
                source.id === STELLARWAVE_SOURCE_ID || source.homepage === STELLARWAVE_SOURCE_HOMEPAGE
            ));
            if (!alreadyInstalled && sources.length < MAX_SOURCE_COUNT) {
                const now = Date.now();
                sources.unshift({
                    id: STELLARWAVE_SOURCE_ID,
                    name: '星澜聚合音源（Folia适配）',
                    description: '基于 LX Music 聚合源，覆盖网易、QQ、酷我、酷狗四个平台；已移除不稳定线路和失效酷我旧直链后端',
                    version: 'v4.0.0',
                    author: '星澜团队 / Folia adapter',
                    homepage: STELLARWAVE_SOURCE_HOMEPAGE,
                    code: STELLARWAVE_SOURCE_CODE,
                    enabled: true,
                    createdAt: now,
                    updatedAt: now,
                });
                storageChanged = true;
            }
            localStorage.setItem(STELLARWAVE_SEED_KEY, '1');
        }
        if (storageChanged) localStorage.setItem(JS_MUSIC_SOURCE_STORAGE_KEY, JSON.stringify(sources));
        return sources;
    } catch (error) {
        console.warn('[JsMusicSource] Failed to load stored sources', error);
        return [];
    }
};

export const saveJsMusicSources = (sources: JsMusicSourceRecord[]): void => {
    if (typeof localStorage === 'undefined') return;
    const safeSources = sources
        .filter(isValidSource)
        .filter(source => source.code.length <= MAX_SOURCE_CODE_LENGTH)
        .slice(0, MAX_SOURCE_COUNT);
    localStorage.setItem(JS_MUSIC_SOURCE_STORAGE_KEY, JSON.stringify(safeSources));
};

export const parseJsMusicSourceMeta = (code: string): Partial<Pick<JsMusicSourceRecord, 'name' | 'description' | 'version' | 'author' | 'homepage'>> => {
    const read = (key: string): string | undefined => {
        const match = code.match(new RegExp(`@${key}\\s+([^\\r\\n*]+)`, 'i'));
        const value = match?.[1]?.trim();
        return value || undefined;
    };
    return {
        name: read('name'),
        description: read('description'),
        version: read('version'),
        author: read('author'),
        homepage: read('homepage'),
    };
};

export const createJsMusicSourceId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `js-${crypto.randomUUID()}`;
    }
    return `js-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const stableSourceHash = (value: string): string => {
    // A small deterministic hash is enough for local source identity. The source code remains
    // the authoritative dedupe key; this only makes the generated id stable across restarts.
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createStableLuoxueSourceId = (sourcePath: string, code: string): string => (
    `luoxue-${stableSourceHash(`${sourcePath}\n${code}`)}`
);
