import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeGdStudioSearch, normalizeKuwoSearch, requestLuoxueJson, resolveNeteaseSearchCover } from '../../../src/services/onlineMusic/luoxueSearch';

afterEach(() => vi.unstubAllGlobals());

describe('LX search request transport', () => {
    it('maps GDSStudio results to Folia songs while preserving LX source IDs', () => {
        const page = normalizeGdStudioSearch([{
            id: '35847388',
            name: 'Hello',
            artist: ['Adele'],
            album: 'Hello',
            pic_id: 'cover-1',
            url_id: 'audio-1',
            lyric_id: 'lyric-1',
        }], 0);

        expect(page.items).toHaveLength(1);
        expect(page.items[0].sourceRef).toMatchObject({
            kind: 'online', providerId: 'netease', mediaId: '35847388',
            providerData: { source: 'wy', songmid: '35847388', url_id: 'audio-1', pic_id: 'cover-1' },
        });
        expect(page.items[0].artists[0].name).toBe('Adele');
        expect(page.hasMore).toBe(false);
    });

    it('resolves NetEase search covers from song detail and caches the result', async () => {
        const coverUrl = 'https://p2.music.126.net/hash/109951168981824640.jpg?param=300y300';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ songs: [{ album: { picUrl: coverUrl } }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(resolveNeteaseSearchCover('109951168981824640', '35847388')).resolves.toBe(coverUrl);
        await expect(resolveNeteaseSearchCover('109951168981824640', '35847388')).resolves.toBe(coverUrl);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const proxyUrl = new URL(String(fetchMock.mock.calls[0][0]), 'https://folia.test');
        const targetUrl = new URL(proxyUrl.searchParams.get('url') || 'https://folia.test');
        expect(targetUrl.searchParams.get('ids')).toBe('["35847388"]');
    });

    it('maps Kuwo album artwork paths to HTTPS cover URLs', () => {
        const page = normalizeKuwoSearch({ abslist: [{
            MUSICRID: 'MUSIC_6686351', SONGNAME: 'Hello', ARTIST: 'Adele', ALBUM: '25',
            ALBUMID: '519830', DURATION: '295', web_albumpic_short: '120/66/8/3440363772.jpg',
        }], TOTAL: '1' });

        expect(page.items[0].album.coverUrl).toBe('https://img1.kuwo.cn/star/albumcover/120/66/8/3440363772.jpg');
    });

    it('uses direct native HTTP for Android instead of the absent APK proxy route', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal('fetch', fetchMock);

        await expect(requestLuoxueJson('https://search.example.test/api', {}, true)).resolves.toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledWith('https://search.example.test/api', expect.objectContaining({ method: 'GET' }));
    });

    it('keeps the proxy transport for browser deployments', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
        vi.stubGlobal('fetch', fetchMock);

        await requestLuoxueJson('https://search.example.test/api', {}, false);
        expect(fetchMock.mock.calls[0][0]).toContain('/api/js-source-request?url=');
    });
});
