import type { SongResult } from '../../types';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { getSongCoverUrl } from './songMetadata';
import { getCachedSongCoverUrl } from './resourceCache';
import { getSongResourceCacheKey } from './resourceKeys';
import { loadCachedOrFetchCover } from '../coverCache';
import { omni } from './omni';

const MAX_ARTWORK_RESULTS = 400;
const artworkResults = new Map<string, string | null>();
const artworkRequests = new Map<string, Promise<string | null>>();

const remember = (key: string, value: string | null): void => {
    artworkResults.delete(key);
    artworkResults.set(key, value);
    while (artworkResults.size > MAX_ARTWORK_RESULTS) {
        const oldest = artworkResults.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        artworkResults.delete(oldest);
    }
};

/** Resolves missing artwork from the song cache, then from its provider's detail endpoint. */
export const resolveSongArtwork = (song: SongResult): Promise<string | null> => {
    const key = getPlaybackSongKey(song);
    if (artworkResults.has(key)) return Promise.resolve(artworkResults.get(key) ?? null);
    const pending = artworkRequests.get(key);
    if (pending) return pending;

    const request = (async (): Promise<string | null> => {
        const cached = await getCachedSongCoverUrl(song).catch(() => null);
        if (cached) return cached;

        let coverUrl = getSongCoverUrl(song);
        if (!coverUrl) {
            const source = getPlaybackSourceRef(song);
            if (source.kind === 'online') {
                const detail = await omni.getSongDetail(source.providerId, source.mediaId).catch(() => null);
                coverUrl = getSongCoverUrl(detail) || detail?.album?.coverUrl;
            }
        }
        if (!coverUrl) return null;

        const cacheKey = getSongResourceCacheKey('cover', song);
        return await loadCachedOrFetchCover(cacheKey, coverUrl).catch(() => coverUrl);
    })().then(result => {
        remember(key, result);
        return result;
    }).finally(() => artworkRequests.delete(key));

    artworkRequests.set(key, request);
    return request;
};
