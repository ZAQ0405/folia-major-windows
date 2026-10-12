import { describe, expect, it } from 'vitest';
import type { PersonalPlaylist } from '@/types';
import { serializePersonalPlaylistToJson } from '@/services/personalPlaylistFileService';

describe('personalPlaylistFileService', () => {
    it('serializes the local playlist snapshot with source metadata and order intact', () => {
        const playlist: PersonalPlaylist = {
            id: 'favorite',
            name: '我喜欢',
            isFavorite: true,
            createdAt: 1,
            updatedAt: 2,
            songs: [
                {
                    id: 'song-1',
                    name: '测试歌曲',
                    artists: [{ id: 'artist-1', name: '歌手' }],
                    album: { id: 'album-1', name: '专辑' },
                    durationMs: 1234,
                    sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'song-1' },
                },
            ],
        };

        const payload = JSON.parse(serializePersonalPlaylistToJson(playlist, 3));

        expect(payload).toMatchObject({
            format: 'folia-personal-playlist',
            version: 1,
            exportedAt: 3,
            playlist: {
                id: 'favorite',
                name: '我喜欢',
                isFavorite: true,
            },
        });
        expect(payload.playlist.songs).toHaveLength(1);
        expect(payload.playlist.songs[0].sourceRef).toEqual({
            kind: 'online',
            providerId: 'qq',
            mediaId: 'song-1',
        });
        expect(serializePersonalPlaylistToJson(playlist, 3).endsWith('\n')).toBe(true);
    });
});
