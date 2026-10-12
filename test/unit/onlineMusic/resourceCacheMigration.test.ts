import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFromCache, saveToCache } from '@/services/db';
import { getCachedAudioBlob, hasCachedAudio, saveAudioBlob } from '@/services/audioCache';
import { getCachedSongAudioBlob, getSongCacheWithLegacyMigration, hasCachedSongAudio } from '@/services/onlineMusic/resourceCache';
import { usePlaybackModeStore } from '@/stores/usePlaybackModeStore';
import type { SongResult } from '@/types';

// test/unit/onlineMusic/resourceCacheMigration.test.ts

vi.mock('@/services/db', () => ({
    getFromCache: vi.fn(),
    saveToCache: vi.fn(),
}));

vi.mock('@/services/audioCache', () => ({
    getCachedAudioBlob: vi.fn(),
    hasCachedAudio: vi.fn(),
    saveAudioBlob: vi.fn(),
}));

vi.mock('@/services/coverCache', () => ({
    getCachedCoverUrl: vi.fn(),
    saveCoverBlob: vi.fn(),
}));

const legacyNeteaseSong: SongResult = {
    id: 42,
    name: 'Legacy',
    artists: [],
    album: { id: 1, name: 'Album' },
    durationMs: 1000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '42' },
};

describe('provider-aware resource cache migration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        usePlaybackModeStore.getState().setPlaybackMode('official');
    });

    it('reads an old lyric key and writes the provider-aware key', async () => {
        const lyric = { lines: [{ fullText: 'legacy' }] };
        vi.mocked(getFromCache).mockImplementation(async key => (
            key === 'lyric_42' ? lyric : null
        ) as any);

        await expect(getSongCacheWithLegacyMigration('lyric', legacyNeteaseSong)).resolves.toEqual(lyric);
        expect(saveToCache).toHaveBeenCalledWith('lyric_online:netease:42', lyric);
    });

    it('does not reuse official audio bytes because VIP entitlement can change', async () => {
        const blob = new Blob(['audio'], { type: 'audio/mpeg' });
        vi.mocked(getCachedAudioBlob).mockResolvedValue(blob);

        await expect(getCachedSongAudioBlob(legacyNeteaseSong)).resolves.toBeNull();
        expect(getCachedAudioBlob).not.toHaveBeenCalled();
        expect(saveAudioBlob).not.toHaveBeenCalled();
    });

    it('reads only the source-mode audio key', async () => {
        usePlaybackModeStore.getState().setPlaybackMode('source');
        const blob = new Blob(['audio'], { type: 'audio/mpeg' });
        vi.mocked(getCachedAudioBlob).mockResolvedValue(blob);
        vi.mocked(hasCachedAudio).mockResolvedValue(true);

        await expect(getCachedSongAudioBlob(legacyNeteaseSong)).resolves.toBe(blob);
        await expect(hasCachedSongAudio(legacyNeteaseSong)).resolves.toBe(true);
        expect(getCachedAudioBlob).toHaveBeenCalledWith('audio_online:netease:42_source');
        expect(hasCachedAudio).toHaveBeenCalledTimes(1);
        expect(hasCachedAudio).toHaveBeenCalledWith('audio_online:netease:42_source');
    });

    it('does not reuse an unscoped legacy audio cache in source mode', async () => {
        usePlaybackModeStore.getState().setPlaybackMode('source');
        vi.mocked(hasCachedAudio).mockImplementation(async key => key === 'audio_42');

        await expect(hasCachedSongAudio(legacyNeteaseSong)).resolves.toBe(false);
        expect(hasCachedAudio).toHaveBeenCalledWith('audio_online:netease:42_source');
        expect(hasCachedAudio).toHaveBeenCalledTimes(1);
        expect(getCachedAudioBlob).not.toHaveBeenCalled();
        expect(saveAudioBlob).not.toHaveBeenCalled();
    });
});
