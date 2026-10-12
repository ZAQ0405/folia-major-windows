import { describe, expect, it } from 'vitest';
import type { UnifiedSong } from '../../src/types';
import {
    buildJsSourceMusicInfo,
    chooseJsSourceQuality,
    normalizeJsSourceAudioUrl,
    qualityFromJsSourceToken,
} from '../../src/services/jsMusicSource/jsSourceManager';
import { getLuoxueCacheCandidates } from '../../src/services/jsMusicSource/luoxueCache';
import { buildJsSourceLyricInfo, normalizeJsSourceLyrics, toProviderLyricsResult } from '../../src/services/jsMusicSource/jsSourceLyrics';

describe('JS music source helpers', () => {
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
