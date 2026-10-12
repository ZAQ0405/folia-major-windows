import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';
import { addSongsToPersonalPlaylist, createPersonalPlaylist, deletePersonalPlaylist, getPersonalPlaylists, isSongInPersonalFavorite, removeSongsFromPersonalPlaylist, updatePersonalPlaylist } from '@/services/personalPlaylistService';
import { getFromCache, saveToCache } from '@/services/db';

vi.mock('@/services/db', () => ({
    getFromCache: vi.fn(),
    saveToCache: vi.fn(),
}));

const cached = vi.mocked(getFromCache);
const saved = vi.mocked(saveToCache);

const song = (id: string, providerId = 'netease'): SongResult => ({
    id,
    name: id,
    artists: [],
    album: { id: '', name: '' },
    durationMs: 1,
    sourceRef: { kind: 'online', providerId, mediaId: id },
});

describe('personalPlaylistService', () => {
    beforeEach(() => {
        let stored: unknown = null;
        cached.mockReset();
        saved.mockReset();
        cached.mockImplementation(async () => stored as any);
        saved.mockImplementation(async (_key, value) => {
            stored = value;
        });
    });

    it('creates and persists the LX-style default favorite list without an account', async () => {
        const playlists = await getPersonalPlaylists();

        expect(playlists).toHaveLength(1);
        expect(playlists[0]).toMatchObject({ name: '我喜欢', isFavorite: true, songs: [] });
        expect(saved).toHaveBeenCalledWith('personal_playlists_v1', playlists);
    });

    it('deduplicates songs by playback source and supports rename/remove/delete', async () => {
        const playlist = await createPersonalPlaylist('收藏', [song('1'), song('1'), song('1', 'qq')]);
        expect(playlist.songs.map(item => (
            item.sourceRef?.kind === 'online' ? item.sourceRef.providerId : item.sourceRef?.kind
        ))).toEqual(['netease', 'qq']);
        expect(isSongInPersonalFavorite([{ ...playlist, isFavorite: true }], song('1'))).toBe(true);

        await addSongsToPersonalPlaylist(playlist.id, [song('1'), song('2')]);
        const renamed = await updatePersonalPlaylist(playlist.id, item => ({ ...item, name: '我的歌单' }));
        expect(renamed?.name).toBe('我的歌单');

        await removeSongsFromPersonalPlaylist(playlist.id, ['online:netease:1']);
        await deletePersonalPlaylist(playlist.id);

        const persisted = saved.mock.lastCall?.[1] as Array<{ id: string; name: string }>;
        expect(persisted.some(item => item.id === playlist.id)).toBe(false);
    });

    it('keeps the favorite list undeletable', async () => {
        cached.mockResolvedValueOnce([{ id: 'fav', name: '我喜欢', songs: [], createdAt: 1, updatedAt: 1, isFavorite: true }]);

        await deletePersonalPlaylist('fav');

        expect(saved).not.toHaveBeenCalled();
    });
});
