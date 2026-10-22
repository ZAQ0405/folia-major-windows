import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { applyOnlineAudioSourceMetadata, loadOnlineSongAudioSource } from '../../../services/onlinePlayback';
import type { SongResult } from '../../../types';
import type { AudioQualityPreference } from '../../../types/onlineMusic';
import {
    getPlaybackSongKey,
    isLocalPlaybackSong,
    isNavidromePlaybackSong,
    isSamePlaybackSong,
    isStagePlaybackSong,
    replacePlaybackSongInQueue,
} from '../../../utils/appPlaybackGuards';
import { setAudioSrc, setCurrentSong, setPlayQueue } from '../../../stores/usePlaybackStore';

// src/components/app/playback/createOnlineRecoveryController.ts

type RecoveryControllerParams = {
    audioQuality: AudioQualityPreference;
    currentSong: SongResult | null;
    audioSrc: string | null;
    audioRef: RefObject<HTMLAudioElement | null>;
    currentSongRef: MutableRefObject<string | number | null>;
    blobUrlRef: MutableRefObject<string | null>;
    shouldAutoPlayRef: MutableRefObject<boolean>;
    pendingResumeTimeRef: MutableRefObject<number | null>;
    onlinePlaybackRecoveryRef: MutableRefObject<Promise<boolean> | null>;
    lastAudioRecoverySourceRef: MutableRefObject<string | null>;
    currentOnlineAudioUrlFetchedAtRef: MutableRefObject<number | null>;
    persistLastPlaybackCache: (song: SongResult | null, queue: SongResult[]) => Promise<void>;
    playQueue: SongResult[];
    onlineAudioUrlTtlMs: number;
    onlineAudioUrlRefreshBufferMs: number;
};

// Provider stream URLs carry a per-request token in the query (QQ mints a fresh `vkey`/`guid`
// every call), so comparing whole URLs never matches and the error -> refresh -> error cycle
// runs unbounded. The origin+path identifies the media file itself, which is what "we already
// refreshed this and it still failed" actually means. Cleared again once playback succeeds.
export const getOnlineRecoveryKey = (src: string | null | undefined): string | null => {
    if (!src) {
        return null;
    }

    try {
        const parsedUrl = new URL(src);
        // Only remote streams carry a token in the query; blob: and friends have no meaningful origin.
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return src;
        }
        return `${parsedUrl.origin}${parsedUrl.pathname}`;
    } catch {
        return src;
    }
};

// Creates online-stream refresh and recovery helpers without tying them to a React hook.
export const createOnlineRecoveryController = ({
    audioQuality,
    currentSong,
    audioSrc,
    audioRef,
    currentSongRef,
    blobUrlRef,
    shouldAutoPlayRef,
    pendingResumeTimeRef,
    onlinePlaybackRecoveryRef,
    lastAudioRecoverySourceRef,
    currentOnlineAudioUrlFetchedAtRef,
    persistLastPlaybackCache,
    playQueue,
    onlineAudioUrlTtlMs,
    onlineAudioUrlRefreshBufferMs,
}: RecoveryControllerParams) => {
    const shouldRefreshCurrentOnlineAudioSource = () => {
        if (!currentSong || isLocalPlaybackSong(currentSong) || isNavidromePlaybackSong(currentSong) || isStagePlaybackSong(currentSong)) {
            return false;
        }

        if (!audioSrc || audioSrc.startsWith('blob:')) {
            return false;
        }

        const fetchedAt = currentOnlineAudioUrlFetchedAtRef.current;
        if (!fetchedAt) {
            return false;
        }

        return Date.now() - fetchedAt >= onlineAudioUrlTtlMs - onlineAudioUrlRefreshBufferMs;
    };

    const recoverOnlinePlaybackSource = async ({
        failedSrc,
        resumeAt,
        autoplay,
        allowSameSourceRetry = false,
        fallbackQuality,
    }: {
        failedSrc?: string | null;
        resumeAt?: number;
        autoplay: boolean;
        allowSameSourceRetry?: boolean;
        fallbackQuality?: AudioQualityPreference;
    }): Promise<boolean> => {
        const song = currentSong;
        const audioElement = audioRef.current;

        if (!song || !audioElement || isLocalPlaybackSong(song) || isNavidromePlaybackSong(song) || isStagePlaybackSong(song)) {
            return false;
        }

        const normalizedFailedSrc = getOnlineRecoveryKey(failedSrc || audioElement.currentSrc || audioSrc || null);
        const songRecoveryKey = `song:${getPlaybackSongKey(song)}`;
        if (!allowSameSourceRetry && (
            lastAudioRecoverySourceRef.current === songRecoveryKey
            || (normalizedFailedSrc && lastAudioRecoverySourceRef.current === normalizedFailedSrc)
        )) {
            return false;
        }

        if (onlinePlaybackRecoveryRef.current) {
            return onlinePlaybackRecoveryRef.current;
        }

        const recoveryTask = (async () => {
            if (normalizedFailedSrc) {
                lastAudioRecoverySourceRef.current = normalizedFailedSrc;
            }

            try {
                let failedSourceOrigin: string | null = null;
                try {
                    failedSourceOrigin = failedSrc ? new URL(failedSrc).origin : null;
                } catch {
                    failedSourceOrigin = failedSrc?.startsWith('blob:') ? 'blob:' : null;
                }
                console.info('[OnlineRecovery] resolving a replacement source', JSON.stringify({
                    providerId: song.sourceRef?.kind === 'online' ? song.sourceRef.providerId : null,
                    failedSourceOrigin,
                    allowSameSourceRetry,
                }));
                const audioResult = await loadOnlineSongAudioSource(song, fallbackQuality ?? audioQuality, null, {
                    forceRefresh: true,
                    excludeUrl: failedSrc || audioElement.currentSrc || audioSrc,
                });
                if (currentSongRef.current !== getPlaybackSongKey(song) || !audioRef.current) {
                    console.warn('[OnlineRecovery] discarded a stale replacement source', JSON.stringify({
                        songStillCurrent: currentSongRef.current === getPlaybackSongKey(song),
                        audioElementAvailable: Boolean(audioRef.current),
                        sourceAvailable: audioResult.kind === 'ok',
                    }));
                    return false;
                }

                if (audioResult.kind === 'unavailable') {
                    console.warn('[OnlineRecovery] no compatible replacement source was available');
                    return false;
                }

                if (blobUrlRef.current && blobUrlRef.current !== audioResult.blobUrl) {
                    URL.revokeObjectURL(blobUrlRef.current);
                    blobUrlRef.current = null;
                }

                if (audioResult.blobUrl) {
                    blobUrlRef.current = audioResult.blobUrl;
                }

                const resolvedSong = applyOnlineAudioSourceMetadata(song, audioResult.replayGain);
                const replayGain = resolvedSong.replayGain;
                if (replayGain) {
                    setCurrentSong(prev => {
                        if (!prev || !isSamePlaybackSong(prev, song)) return prev;
                        return { ...prev, replayGain };
                    });
                    const resolvedQueue = replacePlaybackSongInQueue(playQueue, resolvedSong);
                    setPlayQueue(resolvedQueue);
                    void persistLastPlaybackCache(
                        resolvedSong,
                        resolvedQueue,
                    );
                }

                pendingResumeTimeRef.current = Math.max(0, resumeAt ?? audioRef.current.currentTime ?? 0);
                shouldAutoPlayRef.current = autoplay;
                currentOnlineAudioUrlFetchedAtRef.current = audioResult.audioSrc.startsWith('blob:')
                    ? null
                    : Date.now();
                console.info('[OnlineRecovery] installed replacement source', JSON.stringify({
                    fallbackQuality: fallbackQuality ?? audioQuality,
                    sourceOrigin: (() => { try { return new URL(audioResult.audioSrc).origin; } catch { return 'blob:'; } })(),
                }));
                // A failed replacement may come from a different CDN hostname for the same track.
                // Lock the song after one automatic failover so alternating hosts cannot create an
                // endless reload loop; a deliberate play tap can still request another retry.
                lastAudioRecoverySourceRef.current = songRecoveryKey;
                setAudioSrc(audioResult.audioSrc);
                return true;
            } catch (error) {
                console.error('[App] Failed to recover online playback source', error);
                return false;
            } finally {
                onlinePlaybackRecoveryRef.current = null;
            }
        })();

        onlinePlaybackRecoveryRef.current = recoveryTask;
        return recoveryTask;
    };

    return {
        shouldRefreshCurrentOnlineAudioSource,
        recoverOnlinePlaybackSource,
    };
};
