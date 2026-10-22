import { useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SongResult, UnifiedSong } from '../types';
import { omni } from '../services/onlineMusic/omni';
import { getSongCoverUrl } from '../services/onlineMusic/songMetadata';
import { resolveNeteaseSearchCover } from '../services/onlineMusic/luoxueSearch';

// src/hooks/useOnlineSongMetadataHydration.ts

const isSameOnlineSong = (left: SongResult | null, right: SongResult): boolean => {
    const leftRef = left?.sourceRef;
    const rightRef = right.sourceRef;
    return leftRef?.kind === 'online'
        && rightRef?.kind === 'online'
        && leftRef.providerId === rightRef.providerId
        && String(leftRef.mediaId) === String(rightRef.mediaId);
};

const getOnlineSongKey = (song: SongResult): string | null => {
    const sourceRef = song.sourceRef;
    if (sourceRef?.kind !== 'online') return null;
    return `${sourceRef.providerId}:${String(sourceRef.mediaId)}`;
};

// Hydrates provider-owned display metadata without allowing an older request to replace a newer song.
export const useOnlineSongMetadataHydration = (
    currentSong: SongResult | null,
    setCurrentSong: Dispatch<SetStateAction<SongResult | null>>,
): void => {
    const hydratedSongKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!currentSong) return;

        const sourceRef = currentSong.sourceRef;
        if (sourceRef?.kind !== 'online') return;

        const songKey = getOnlineSongKey(currentSong);
        if (!songKey || hydratedSongKeyRef.current === songKey) return;

        const providerData = sourceRef.providerData || {};
        const picId = String(providerData.pic_id || '');
        const needsNeteaseCover = sourceRef.providerId === 'netease' && !getSongCoverUrl(currentSong) && Boolean(picId);
        const canResolveCatalog = omni.canResolveCatalogRef(currentSong as UnifiedSong, 'album');
        if (!canResolveCatalog && !needsNeteaseCover) return;

        let cancelled = false;

        const resolveMetadata = async (): Promise<SongResult> => {
            const [catalogSong, resolvedCover] = await Promise.all([
                canResolveCatalog ? omni.resolveCatalogRefs(currentSong as UnifiedSong) : Promise.resolve(currentSong),
                needsNeteaseCover ? resolveNeteaseSearchCover(picId, String(sourceRef.mediaId)) : Promise.resolve(''),
            ]);
            if (!resolvedCover || getSongCoverUrl(catalogSong)) return catalogSong;
            return { ...catalogSong, album: { ...catalogSong.album, coverUrl: resolvedCover } };
        };

        void resolveMetadata()
            .then(resolvedSong => {
                if (cancelled) return;
                hydratedSongKeyRef.current = songKey;
                if (resolvedSong === currentSong) return;

                setCurrentSong(existingSong => {
                    if (!existingSong || !isSameOnlineSong(existingSong, currentSong)) return existingSong;

                    const hydratedSong: SongResult = {
                        ...existingSong,
                        ...resolvedSong,
                        album: { ...existingSong.album, ...resolvedSong.album },
                    };
                    return hydratedSong;
                });
            })
            .catch(error => {
                console.warn('[OnlineMetadata] Failed to hydrate current song metadata:', error);
            });

        return () => {
            cancelled = true;
        };
    }, [currentSong, setCurrentSong]);
};
