import type { SongResult } from '../../types';
import type {
    AudioQualityPreference,
    JsonValue,
    ProviderAudioSource,
} from '../../types/onlineMusic';
import type {
    JsMusicSourceAudioResult,
    JsMusicSourceDescriptor,
    JsMusicSourceRecord,
    JsMusicSourceRuntimeState,
} from '../../types/jsMusicSource';
import { createJsMusicSourceId, createStableLuoxueSourceId, loadJsMusicSources, parseJsMusicSourceMeta, saveJsMusicSources } from './jsSourceStorage';
import { JsSourceWorkerRuntime } from './jsSourceWorker';
import { resolveLuoxueCachedAudioSource, resolveLuoxueCachedLyrics } from './luoxueCache';
import { buildJsSourceLyricInfo, toProviderLyricsResult } from './jsSourceLyrics';

// src/services/jsMusicSource/jsSourceManager.ts

const PROVIDER_SOURCE_KEY: Record<string, string> = {
    netease: 'wy',
    kugou: 'kg',
    qq: 'tx',
    kuwo: 'kw',
};
const QUALITY_CANDIDATES: Record<AudioQualityPreference, string[]> = {
    standard: ['128k', 'standard', '128'],
    high: ['320k', 'high', '320', '128k', 'standard', '128'],
    lossless: ['flac', 'lossless', 'flac24bit', 'hires', '320k', 'high', '128k', 'standard'],
    hires: ['flac24bit', 'hires', 'flac', 'lossless', '320k', 'high', '128k', 'standard'],
};

const asString = (value: JsonValue | undefined): string | undefined => (
    typeof value === 'string' || typeof value === 'number' ? String(value) : undefined
);

export const chooseJsSourceQuality = (
    requested: AudioQualityPreference,
    supported: string[] | undefined,
): string | undefined => {
    if (!supported || supported.length === 0) return QUALITY_CANDIDATES[requested][0];
    const normalized = supported.map(value => value.trim()).filter(Boolean);
    return QUALITY_CANDIDATES[requested].find(candidate => normalized.includes(candidate)) || normalized[0];
};

export const qualityFromJsSourceToken = (token: string, requested: AudioQualityPreference): AudioQualityPreference => {
    if (/flac24|hires/i.test(token)) return 'hires';
    if (/flac|lossless/i.test(token)) return 'lossless';
    if (/320|high/i.test(token)) return 'high';
    return requested === 'standard' ? 'standard' : 'standard';
};

export const normalizeJsSourceAudioUrl = (value: unknown): string | null => {
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
        const raw = typeof candidate === 'string'
            ? candidate
            : candidate && typeof candidate === 'object'
                ? (candidate as { url?: unknown; data?: unknown; musicUrl?: unknown }).url
                    || (candidate as { data?: unknown }).data
                    || (candidate as { musicUrl?: unknown }).musicUrl
                : undefined;
        if (typeof raw !== 'string' || !raw.trim()) continue;
        try {
            const url = new URL(raw.trim());
            if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
        } catch { /* the playback boundary rejects non-URLs */ }
    }
    return null;
};

export const buildJsSourceMusicInfo = (song: SongResult): Record<string, unknown> => {
    const source = song.sourceRef?.kind === 'online' ? song.sourceRef : undefined;
    const providerData = source?.providerData || {};
    const artistNames = song.artists.map(artist => artist.name).filter(Boolean);
    const mediaId = String(source?.mediaId ?? song.id);
    const sourceKey = source ? PROVIDER_SOURCE_KEY[source.providerId] : undefined;
    const songmid = asString(providerData.songmid) || asString(providerData.songMid) || mediaId;
    const hash = asString(providerData.hash) || mediaId;
    return {
        ...providerData,
        source: asString(providerData.source) || sourceKey,
        id: song.id,
        songid: song.id,
        songId: song.id,
        songmid,
        hash,
        name: song.name,
        songname: song.name,
        title: song.name,
        singer: artistNames.join('、'),
        artist: artistNames.join('、'),
        albumName: song.album?.name || '',
        album: song.album?.name || '',
        albumId: song.album?.id,
        duration: Math.round(song.durationMs / 1000),
        durationMs: song.durationMs,
        meta: {
            ...providerData,
            source: asString(providerData.source) || sourceKey,
            songId: mediaId,
            songMid: songmid,
            hash,
        },
    };
};

const descriptorCanPlay = (descriptor: JsMusicSourceDescriptor | undefined): boolean => (
    Boolean(descriptor && (descriptor.actions || []).includes('musicUrl'))
);

const createInitialRuntimeState = (): JsMusicSourceRuntimeState => ({ status: 'idle', descriptors: {} });

export interface LuoxueSourceFile {
    name: string;
    path: string;
    code: string;
    modifiedAt?: number;
}

class JsMusicSourceManager {
    private sources: JsMusicSourceRecord[] = loadJsMusicSources();
    private readonly runtimes = new Map<string, JsSourceWorkerRuntime>();
    private readonly runtimeStates = new Map<string, JsMusicSourceRuntimeState>();
    private readonly initializationPromises = new Map<string, Promise<void>>();
    private readonly listeners = new Set<() => void>();

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSources = (): JsMusicSourceRecord[] => this.sources;

    getRuntimeState = (id: string): JsMusicSourceRuntimeState => (
        this.runtimeStates.get(id) || createInitialRuntimeState()
    );

    addSource = (code: string, fallbackName?: string): JsMusicSourceRecord => {
        const meta = parseJsMusicSourceMeta(code);
        const now = Date.now();
        const source: JsMusicSourceRecord = {
            id: createJsMusicSourceId(),
            name: meta.name || fallbackName?.replace(/\.js$/i, '') || 'JS Music Source',
            ...(meta.description ? { description: meta.description } : {}),
            ...(meta.version ? { version: meta.version } : {}),
            ...(meta.author ? { author: meta.author } : {}),
            ...(meta.homepage ? { homepage: meta.homepage } : {}),
            code,
            enabled: true,
            createdAt: now,
            updatedAt: now,
        };
        this.sources = [...this.sources, source];
        this.persistAndNotify();
        void this.initializeSource(source);
        return source;
    };

    /**
     * Imports the same event-driven source files used by Luoxue Desktop. The import is idempotent:
     * a source is matched by its original path or code, refreshed in place, and moved ahead of
     * generic compatibility sources so Luoxue remains the playback authority.
     */
    importLuoxueSources = (files: LuoxueSourceFile[]): JsMusicSourceRecord[] => {
        const imported: JsMusicSourceRecord[] = [];
        let nextSources = [...this.sources];
        let changed = false;
        // Keep the tested StellarWave aggregate ahead of legacy files copied from the
        // Luoxue installation. Some old sources still advertise all five channels but
        // can return stale preview URLs; source order is the explicit fallback order.
        const orderedFiles = [...files].sort((left, right) => {
            const priority = (file: LuoxueSourceFile): number => (
                /星澜|stellarwave|lick563\/xinglan-aggregate-sound-sources/iu.test(`${file.name}\n${file.code}`) ? 1 : 0
            );
            return priority(left) - priority(right);
        });
        for (const file of orderedFiles) {
            if (!file || typeof file.code !== 'string' || !file.code.trim() || file.code.length > 2 * 1024 * 1024) continue;
            const meta = parseJsMusicSourceMeta(file.code);
            const stableId = createStableLuoxueSourceId(file.path, file.code);
            const existingIndex = nextSources.findIndex(source => (
                source.id === stableId
                || source.sourcePath === file.path
                || source.code === file.code
            ));
            const existing = existingIndex >= 0 ? nextSources[existingIndex] : undefined;
            const now = file.modifiedAt || Date.now();
            const source: JsMusicSourceRecord = {
                id: existing?.id || stableId,
                name: meta.name || existing?.name || file.name.replace(/\.js$/i, '') || 'Luoxue Music Source',
                ...(meta.description ? { description: meta.description } : existing?.description ? { description: existing.description } : {}),
                ...(meta.version ? { version: meta.version } : existing?.version ? { version: existing.version } : {}),
                ...(meta.author ? { author: meta.author } : existing?.author ? { author: existing.author } : {}),
                ...(meta.homepage ? { homepage: meta.homepage } : existing?.homepage ? { homepage: existing.homepage } : {}),
                code: file.code,
                enabled: existing?.enabled ?? true,
                origin: 'luoxue',
                sourcePath: file.path,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
            };
            if (existingIndex >= 0) {
                if (this.runtimes.has(source.id) && existing?.code !== source.code) {
                    this.runtimes.get(source.id)?.stop();
                    this.runtimes.delete(source.id);
                    this.runtimeStates.delete(source.id);
                }
                nextSources.splice(existingIndex, 1);
            }
            nextSources.unshift(source);
            imported.push(source);
            changed = true;
        }
        if (!changed) return [];
        this.sources = nextSources.slice(0, 20);
        this.persistAndNotify();
        imported.filter(source => source.enabled).forEach(source => { void this.initializeSource(source); });
        console.info('[LuoxueCore] Imported sources', imported.map(source => source.name));
        return imported;
    };

    removeSource = (id: string): void => {
        this.runtimes.get(id)?.stop();
        this.runtimes.delete(id);
        this.runtimeStates.delete(id);
        this.sources = this.sources.filter(source => source.id !== id);
        this.persistAndNotify();
    };

    setEnabled = (id: string, enabled: boolean): void => {
        this.sources = this.sources.map(source => source.id === id ? { ...source, enabled, updatedAt: Date.now() } : source);
        this.persistAndNotify();
        if (enabled) {
            const source = this.sources.find(item => item.id === id);
            if (source) void this.initializeSource(source);
        } else {
            this.runtimes.get(id)?.stop();
            this.runtimes.delete(id);
            this.runtimeStates.delete(id);
        }
    };

    move = (id: string, direction: -1 | 1): void => {
        const index = this.sources.findIndex(source => source.id === id);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= this.sources.length) return;
        const next = [...this.sources];
        [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
        this.sources = next;
        this.persistAndNotify();
    };

    async initializeEnabledSources(): Promise<void> {
        const enabledSources = this.sources.filter(source => source.enabled);
        console.info('[JsMusicSource] Initializing enabled sources', enabledSources.map(source => source.name));
        await Promise.all(enabledSources.map(source => this.initializeSource(source)));
    }

    hasEnabledSources = (): boolean => this.sources.some(source => source.enabled);

    async resolveAudioSource(
        song: SongResult,
        requestedQuality: AudioQualityPreference,
        options: { forceRefresh?: boolean } = {},
    ): Promise<JsMusicSourceAudioResult | null> {
        // Luoxue's desktop cache contains full URLs that were already resolved successfully. This
        // must run before live sources so an existing full URL is not replaced by a provider's
        // limited preview fallback while a source backend is temporarily unavailable.
        const luoxueCachedSource = await resolveLuoxueCachedAudioSource(song, requestedQuality, options);
        if (luoxueCachedSource) return luoxueCachedSource;

        for (const source of this.sources.filter(item => item.enabled)) {
            // A malformed/obsolete source should not add its initialization timeout to every
            // subsequent track. Re-enable it from settings to retry after the script is updated.
            if (this.getRuntimeState(source.id).status === 'error') continue;
            try {
                const runtime = await this.ensureRuntime(source);
                const sourceKeys = this.getSourceKeys(song, runtime.getDescriptors());
                for (const sourceKey of sourceKeys) {
                    const descriptor = runtime.getDescriptors()[sourceKey];
                    if (!descriptorCanPlay(descriptor)) continue;
                    const qualityToken = chooseJsSourceQuality(requestedQuality, descriptor?.qualitys);
                    if (!qualityToken) continue;
                    console.info('[JsMusicSource] Requesting music URL', `${source.name} ${sourceKey} ${qualityToken}`);
                    const result = await runtime.requestMusicUrl({
                        source: sourceKey,
                        action: 'musicUrl',
                        info: { musicInfo: buildJsSourceMusicInfo(song), type: qualityToken },
                    });
                    const url = normalizeJsSourceAudioUrl(result);
                    if (!url) continue;
                    console.info('[JsMusicSource] Music URL resolved', `${source.name} ${sourceKey}`);
                    const providerSource: ProviderAudioSource = {
                        url,
                        fetchedAt: Date.now(),
                        quality: qualityFromJsSourceToken(qualityToken, requestedQuality),
                    };
                    return { ...providerSource, sourceId: source.id, sourceKey, requestedQuality };
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const previous = this.getRuntimeState(source.id);
                this.setRuntimeState(source.id, {
                    status: previous.status === 'ready' ? 'ready' : 'error',
                    descriptors: previous.descriptors,
                    error: message,
                });
                console.warn('[JsMusicSource] Source failed, trying the next source', `${source.name}: ${message}`);
            }
        }
        return null;
    }

    async resolveLyrics(song: SongResult): Promise<ReturnType<typeof toProviderLyricsResult>> {
        const luoxueCachedLyrics = await resolveLuoxueCachedLyrics(song);
        if (luoxueCachedLyrics) return luoxueCachedLyrics;
        for (const source of this.sources.filter(item => item.enabled)) {
            if (this.getRuntimeState(source.id).status === 'error') continue;
            try {
                const runtime = await this.ensureRuntime(source);
                const sourceKeys = this.getSourceKeys(song, runtime.getDescriptors());
                for (const sourceKey of sourceKeys) {
                    const descriptor = runtime.getDescriptors()[sourceKey];
                    if (!descriptor?.actions?.includes('lyric')) continue;
                    console.info('[JsMusicSource] Requesting lyrics', `${source.name} ${sourceKey}`);
                    const result = toProviderLyricsResult(await runtime.requestAction({
                        source: sourceKey,
                        action: 'lyric',
                        info: buildJsSourceLyricInfo(song),
                    }));
                    if (result) return result;
                }
            } catch (error) {
                console.warn('[JsMusicSource] Lyric source failed, trying the next source', source.name, error);
            }
        }
        return null;
    }

    private getSourceKeys(song: SongResult, descriptors: Record<string, JsMusicSourceDescriptor>): string[] {
        const sourceRef = song.sourceRef?.kind === 'online' ? song.sourceRef : undefined;
        if (!sourceRef) return [];
        const explicit = asString(sourceRef.providerData?.source);
        const preferred = explicit || PROVIDER_SOURCE_KEY[sourceRef.providerId];
        return preferred && descriptors[preferred] ? [preferred] : [];
    }

    private async ensureRuntime(source: JsMusicSourceRecord): Promise<JsSourceWorkerRuntime> {
        const existing = this.runtimes.get(source.id);
        if (existing) return existing;
        const meta = parseJsMusicSourceMeta(source.code);
        const runtimeSource: JsMusicSourceRecord = {
            ...source,
            ...(meta.name ? { name: meta.name } : {}),
            ...(meta.description ? { description: meta.description } : {}),
            ...(meta.version ? { version: meta.version } : {}),
            ...(meta.author ? { author: meta.author } : {}),
            ...(meta.homepage ? { homepage: meta.homepage } : {}),
        };
        const runtime = new JsSourceWorkerRuntime(runtimeSource);
        this.runtimes.set(source.id, runtime);
        this.setRuntimeState(source.id, { status: 'loading', descriptors: {} });
        try {
            const descriptors = await runtime.ready();
            this.setRuntimeState(source.id, { status: 'ready', descriptors });
            return runtime;
        } catch (error) {
            runtime.stop();
            this.runtimes.delete(source.id);
            throw error;
        }
    }

    private async initializeSource(source: JsMusicSourceRecord): Promise<void> {
        const existing = this.initializationPromises.get(source.id);
        if (existing) return existing;

        console.info('[JsMusicSource] Initializing source', source.name);
        const initialization = this.ensureRuntime(source)
            .then(() => undefined)
            .catch(error => {
                this.setRuntimeState(source.id, {
                    status: 'error',
                    descriptors: this.getRuntimeState(source.id).descriptors,
                    error: error instanceof Error ? error.message : String(error),
                });
            })
            .finally(() => {
                if (this.initializationPromises.get(source.id) === initialization) {
                    this.initializationPromises.delete(source.id);
                }
            });
        this.initializationPromises.set(source.id, initialization);
        return initialization;
    }

    private setRuntimeState(id: string, state: JsMusicSourceRuntimeState): void {
        this.runtimeStates.set(id, state);
        this.listeners.forEach(listener => listener());
    }

    private persistAndNotify(): void {
        saveJsMusicSources(this.sources);
        this.listeners.forEach(listener => listener());
    }
}

export const jsMusicSourceManager = new JsMusicSourceManager();
