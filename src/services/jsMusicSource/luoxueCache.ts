import type { AudioQualityPreference, ProviderLyricsResult } from '../../types/onlineMusic';
import type { SongResult } from '../../types';
import type { JsMusicSourceAudioResult } from '../../types/jsMusicSource';
import { toProviderLyricsResult } from './jsSourceLyrics';

// Luoxue stores already-resolved URLs in its desktop-only SQLite cache. The browser build cannot
// read that file, so this bridge deliberately becomes a no-op outside Electron.
const SOURCE_KEYS: Record<string, string> = { netease: 'wy', kugou: 'kg', qq: 'tx' };

const QUALITY_KEYS: Record<AudioQualityPreference, string[]> = {
    standard: ['128k', 'standard'],
    high: ['320k', 'high', '128k', 'standard'],
    lossless: ['flac', 'lossless', '320k', 'high', '128k', 'standard'],
    hires: ['flac24bit', 'hires', 'flac', 'lossless', '320k', 'high', '128k', 'standard'],
};

export const getLuoxueCacheCandidates = (song: SongResult, quality: AudioQualityPreference): string[] => {
    const sourceRef = song.sourceRef?.kind === 'online' ? song.sourceRef : undefined;
    if (!sourceRef) return [];
    const source = String(sourceRef.providerData?.source || SOURCE_KEYS[sourceRef.providerId] || '');
    if (!source) return [];
    const id = String(sourceRef.mediaId || song.id);
    return QUALITY_KEYS[quality].map(token => `${source}_${id}_${token}`);
};

export const getLuoxueLyricCacheCandidates = (song: SongResult): string[] => {
    const sourceRef = song.sourceRef?.kind === 'online' ? song.sourceRef : undefined;
    if (!sourceRef) return [];
    const source = String(sourceRef.providerData?.source || SOURCE_KEYS[sourceRef.providerId] || '');
    if (!source) return [];
    return [`${source}_${String(sourceRef.mediaId || song.id)}`];
};

export const resolveLuoxueCachedAudioSource = async (
    song: SongResult,
    quality: AudioQualityPreference,
    options: { forceRefresh?: boolean } = {},
): Promise<JsMusicSourceAudioResult | null> => {
    if (options.forceRefresh) return null;
    const bridge = typeof window !== 'undefined' ? window.electron?.getLuoxueMusicUrl : undefined;
    if (!bridge) return null;
    const candidates = getLuoxueCacheCandidates(song, quality);
    if (!candidates.length) return null;
    try {
        const result = await bridge(candidates);
        if (!result?.url) return null;
        const url = new URL(result.url);
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        console.info('[JsMusicSource] Luoxue cache hit', result.cacheKey || candidates[0]);
        return {
            url: url.toString(),
            fetchedAt: Date.now(),
            quality,
            sourceId: 'luoxue-cache',
            sourceKey: result.cacheKey || candidates[0],
            requestedQuality: quality,
        };
    } catch (error) {
        console.warn('[JsMusicSource] Luoxue cache lookup failed', error);
        return null;
    }
};

export const resolveLuoxueCachedLyrics = async (song: SongResult): Promise<ProviderLyricsResult | null> => {
    const bridge = typeof window !== 'undefined' ? window.electron?.getLuoxueLyrics : undefined;
    if (!bridge) return null;
    const candidates = getLuoxueLyricCacheCandidates(song);
    if (!candidates.length) return null;
    try {
        const result = await bridge(candidates);
        const lyrics = toProviderLyricsResult(result);
        if (lyrics) console.info('[JsMusicSource] Luoxue lyric cache hit', result?.cacheKey || candidates[0]);
        return lyrics;
    } catch (error) {
        console.warn('[JsMusicSource] Luoxue lyric cache lookup failed', error);
        return null;
    }
};
