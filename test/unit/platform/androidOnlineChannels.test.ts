import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/utils/runtimePlatform', () => ({ isAndroidCapacitor: true }));

import { searchQQLyrics } from '../../../src/utils/lyrics/providers/qqLyricProvider';
import { searchKugouLyrics } from '../../../src/utils/lyrics/providers/kugouLyricProvider';
import { searchLuoxueChannel } from '../../../src/services/onlineMusic/luoxueSearch';
import { kuwoProvider } from '../../../src/services/onlineMusic/kuwoProvider';

afterEach(() => vi.unstubAllGlobals());

describe('Android direct online music channels', () => {
    it('sends QQ search to the QQ host instead of the missing web lyric proxy', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 0,
            'music.search.SearchCgiService': {
                code: 0,
                data: { body: { song: { list: [{
                    id: 7,
                    mid: 'qq-song-mid',
                    title: 'Test song',
                    interval: 100,
                    singer: [{ id: 1, name: 'Artist' }],
                    album: { id: 2, name: 'Album' },
                    file: { media_mid: 'qq-media-mid' },
                }] } } },
            },
        })));
        vi.stubGlobal('fetch', fetchMock);

        const songs = await searchQQLyrics('Test song');

        expect(songs).toHaveLength(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain('https://u.y.qq.com/');
        expect(String(fetchMock.mock.calls[0][0])).not.toContain('/api/lyric-proxy');
    });

    it('uses KuGou HTTPS search directly on Android', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            data: { lists: [{
                FileHash: '0123456789ABCDEF',
                SongName: 'Test song',
                Duration: 100,
                Singers: [{ name: 'Artist' }],
            }] },
        })));
        vi.stubGlobal('fetch', fetchMock);

        const songs = await searchKugouLyrics('Test song');

        expect(songs).toHaveLength(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain('https://complexsearch.kugou.com/');
        expect(String(fetchMock.mock.calls[0][0])).not.toContain('/api/lyric-proxy');
    });

    it('routes Kuwo search through the direct Android HTTP transport and normalizes results', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            TOTAL: '1',
            abslist: [{
                MUSICRID: 'MUSIC_7149583',
                SONGNAME: 'Test song',
                ARTIST: 'Artist',
                ALBUM: 'Album',
                DURATION: '100',
            }],
        })));
        vi.stubGlobal('fetch', fetchMock);

        const page = await searchLuoxueChannel('kuwo', 'Test song', { limit: 10, offset: 0 });

        expect(page.items).toHaveLength(1);
        expect(page.items[0].sourceRef).toMatchObject({
            kind: 'online', providerId: 'kuwo', mediaId: '7149583',
        });
        expect(String(fetchMock.mock.calls[0][0])).toContain('https://search.kuwo.cn/');
        expect(String(fetchMock.mock.calls[0][0])).not.toContain('/api/js-source-request');
    });

    it('fetches and parses Kuwo lyrics for the selected song id', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            code: 200,
            data: { lrclist: [
                { time: '1.25', lineLyric: 'First line' },
                { time: '61.5', lineLyric: 'Second line' },
            ] },
        })));
        vi.stubGlobal('fetch', fetchMock);

        const result = await kuwoProvider.lyrics?.getLyrics({
            id: '7149583', name: 'Test song', artists: [], album: { id: 'album', name: 'Album' }, durationMs: 100_000,
            sourceRef: { kind: 'online', providerId: 'kuwo', mediaId: '7149583', providerData: { songmid: '7149583' } },
        });

        expect(result?.mainText).toContain('[00:01.25]First line');
        expect(result?.mainText).toContain('[01:01.50]Second line');
        expect(result?.lyrics?.lines.length).toBeGreaterThanOrEqual(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain('/openapi/v1/www/lyric/getlyric');
        expect(String(fetchMock.mock.calls[0][0])).toContain('musicId=7149583');
    });
});
