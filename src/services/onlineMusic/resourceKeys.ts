import type { SongResult } from '../../types';
import type { PlaybackMode } from '../../types/playbackMode';
import { getPlaybackSongKey, getPlaybackSourceRef } from '../../utils/appPlaybackGuards';

// src/services/onlineMusic/resourceKeys.ts

export type SongResourceKind = 'audio' | 'lyric' | 'cover' | 'theme' | 'replayGain';

export const getSongResourceCacheKey = (kind: SongResourceKind, song: SongResult): string => {
    const sourceRef = getPlaybackSourceRef(song);
    const versionedKind = kind === 'cover'
        && sourceRef.kind === 'online'
        && sourceRef.providerId === 'kugou'
        ? 'cover_v2'
        : kind;
    return `${versionedKind}_${getPlaybackSongKey(song)}`;
};

/**
 * Audio bytes are not interchangeable between the two manual playback modes.  A source URL can
 * point at a full-length LX result while the official provider returns a preview (or vice versa),
 * so sharing the old provider-only key makes a mode switch silently play the wrong bytes.
 */
export const getSongPlaybackAudioCacheKey = (
    song: SongResult,
    playbackMode: PlaybackMode,
): string => `${getSongResourceCacheKey('audio', song)}_${playbackMode}`;

export const getLegacySongResourceCacheKeys = (kind: SongResourceKind, song: SongResult): string[] => {
    const sourceRef = getPlaybackSourceRef(song);
    if (sourceRef.kind !== 'online' || sourceRef.providerId !== 'netease') return [];
    return [
        ...(sourceRef.variant === 'cloud' ? [`${kind}_cloud_${sourceRef.mediaId}`] : []),
        `${kind}_${sourceRef.mediaId}`,
    ];
};
