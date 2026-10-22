import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import type { UnifiedSong } from '../../src/types';
import {
    buildJsSourceMusicInfo,
    chooseJsSourceQuality,
    getAudioUrlIdentity,
    normalizeJsSourceAudioUrl,
    qualityFromJsSourceToken,
} from '../../src/services/jsMusicSource/jsSourceManager';
import { getLuoxueCacheCandidates } from '../../src/services/jsMusicSource/luoxueCache';
import { buildJsSourceLyricInfo, normalizeJsSourceLyrics, toProviderLyricsResult } from '../../src/services/jsMusicSource/jsSourceLyrics';
import { resolveJsSourceRequestUrl, WORKER_SOURCE } from '../../src/services/jsMusicSource/jsSourceWorker';

describe('JS music source helpers', () => {
    it('provides AES-128-ECB required by LX source scripts for NetEase eAPI signatures', async () => {
        const messages: Array<Record<string, unknown>> = [];
        const context = {
            postMessage: (message: Record<string, unknown>) => messages.push(message),
            crypto: webcrypto,
            TextEncoder,
            TextDecoder,
            Uint8Array,
            ArrayBuffer,
            Map,
            Promise,
            setTimeout,
            clearTimeout,
            atob,
            btoa,
        };
        runInNewContext(WORKER_SOURCE, context);
        const sourceCode = `
            lx.on('request', () => lx.utils.buffer.bufToString(
                lx.utils.crypto.aesEncrypt(
                    new Uint8Array([0,17,34,51,68,85,102,119,136,153,170,187,204,221,238,255]),
                    'aes-128-ecb',
                    new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]),
                    '',
                ),
                'hex',
            ));
            lx.send('inited', { status: true, sources: {} });
        `;
        await runInNewContext(`self.onmessage({ data: { type: 'init', code: ${JSON.stringify(sourceCode)} } })`, context);
        await runInNewContext(`self.onmessage({ data: { type: 'action', requestId: 1, payload: {} } })`, context);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(messages.find(message => message.type === 'actionResult')).toMatchObject({
            ok: true,
            result: expect.stringMatching(/^69c4e0d86a7b0430d8cdb78070b4c55a/u),
        });
    });

    it('keeps external LX source URLs direct when Android native HTTP is available', () => {
        expect(resolveJsSourceRequestUrl('https://music.example.test/api', true))
            .toBe('https://music.example.test/api');
    });

    it('uses the same-origin request proxy for browser-only external LX source requests', () => {
        expect(resolveJsSourceRequestUrl('https://music.example.test/api', false, 'https://folia.example.test/'))
            .toContain('/api/js-source-request?url=');
    });

    it('selects the closest supported quality without exceeding the source contract', () => {
        expect(chooseJsSourceQuality('hires', ['128k'])).toBe('128k');
        expect(chooseJsSourceQuality('lossless', ['320k', '128k'])).toBe('320k');
        expect(chooseJsSourceQuality('standard', [])).toBe('128k');
        expect(qualityFromJsSourceToken('flac24bit', 'high')).toBe('hires');
    });

    it('accepts the common LX Music URL result shapes and rejects unsafe URLs', () => {
        expect(normalizeJsSourceAudioUrl('https://cdn.example.test/song.mp3')).toBe('https://cdn.example.test/song.mp3');
        expect(normalizeJsSourceAudioUrl({ url: 'http://cdn.example.test/song.mp3' })).toBe('http://cdn.example.test/song.mp3');
        expect(normalizeJsSourceAudioUrl({ data: 'javascript:alert(1)' })).toBeNull();
        expect(normalizeJsSourceAudioUrl({ data: '' })).toBeNull();
    });

    it('identifies a media resource independently of its rotating access token', () => {
        expect(getAudioUrlIdentity('https://cdn.example.test/song.mp3?token=old'))
            .toBe(getAudioUrlIdentity('https://cdn.example.test/song.mp3?token=new'));
        expect(getAudioUrlIdentity('https://cdn.example.test/other.mp3?token=new'))
            .not.toBe(getAudioUrlIdentity('https://cdn.example.test/song.mp3?token=old'));
    });

    it('builds platform-compatible musicInfo while preserving provider data', () => {
        const song: UnifiedSong = {
            id: 123,
            name: '测试歌曲',
            artists: [{ id: 1, name: '测试歌手' }],
            album: { id: 2, name: '测试专辑' },
            durationMs: 181000,
            sourceRef: {
                kind: 'online',
                providerId: 'kugou',
                mediaId: 'HASH',
                providerData: { hash: 'HASH', albumId: '2' },
            },
        };
        const info = buildJsSourceMusicInfo(song);
        expect(info.hash).toBe('HASH');
        expect(info.songmid).toBe('HASH');
        expect(info.singer).toBe('测试歌手');
        expect(info.duration).toBe(181);
        expect(info.albumId).toBe(2);
    });

    it('uses Luoxue cache keys for the provider media id and requested quality', () => {
        const song: UnifiedSong = {
            id: 2067368745,
            name: '测试歌曲',
            artists: [{ id: 1, name: '测试歌手' }],
            album: { id: 2, name: '测试专辑' },
            durationMs: 181000,
            sourceRef: {
                kind: 'online',
                providerId: 'netease',
                mediaId: '2067368745',
            },
        };
        expect(getLuoxueCacheCandidates(song, 'standard')).toEqual([
            'wy_2067368745_128k',
            'wy_2067368745_standard',
        ]);
    });

    it('normalizes LX lyric fields and parses the display timeline', () => {
        const result = toProviderLyricsResult({
            lyric: '[ti:测试歌曲]\n[00:01.00]第一句',
            tlyric: '[00:01.00]First line',
            rlyric: '[00:01.00]Di yi ju',
            lxlyric: '',
        });
        expect(result?.mainText).toContain('第一句');
        expect(result?.translationText).toContain('First line');
        expect(result?.lyrics?.lines[0]?.fullText).toBe('第一句');
        expect(result?.lyrics?.lines[0]?.translation).toBe('First line');
    });

    it('recognizes word-timed LX lyric containers and builds source musicInfo', () => {
        const envelope = normalizeJsSourceLyrics({ lxlyric: '[00:01.000]<0,500>一<500,500>句' });
        expect(envelope?.wordByWordText).toContain('<0,500>');
        const song: UnifiedSong = {
            id: 7,
            name: '测试歌曲',
            artists: [{ id: 1, name: '测试歌手' }],
            album: { id: 2, name: '测试专辑' },
            durationMs: 181000,
            sourceRef: { kind: 'online', providerId: 'netease', mediaId: '7', providerData: { hash: 'h7' } },
        };
        expect(buildJsSourceLyricInfo(song).musicInfo).toMatchObject({ songmid: '7', hash: 'h7', interval: 181 });
    });

});
