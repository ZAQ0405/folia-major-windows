import type { LyricData, SongResult } from '../../types';
import type { ProviderLyricsResult } from '../../types/onlineMusic';
import { detectTimedLyricFormat } from '../../utils/lyrics/formatDetection';
import { parseLyricsByFormat } from '../../utils/lyrics/parserCore';
import { isPureMusicLyricText } from '../../utils/lyrics/pureMusic';

// Normalizes the lyric envelopes returned by LX-style scripts into Folia's shared lyric contract.

type LyricEnvelope = {
    mainText: string;
    wordByWordText: string;
    translationText: string;
    romanizationText: string;
    isPureMusic: boolean;
};

const asText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const unwrapLyricValue = (value: unknown): Record<string, unknown> | string | null => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    for (const key of ['lyricInfo', 'data', 'result', 'lyrics']) {
        const nested = record[key];
        if (nested && typeof nested === 'object') return nested as Record<string, unknown>;
    }
    return record;
};

const pickText = (record: Record<string, unknown>, keys: string[]): string => {
    for (const key of keys) {
        const text = asText(record[key]);
        if (text) return text;
    }
    return '';
};

export const normalizeJsSourceLyrics = (value: unknown): LyricEnvelope | null => {
    const unwrapped = unwrapLyricValue(Array.isArray(value) ? value[0] : value);
    if (typeof unwrapped === 'string') {
        return {
            mainText: unwrapped,
            wordByWordText: '',
            translationText: '',
            romanizationText: '',
            isPureMusic: isPureMusicLyricText(unwrapped),
        };
    }
    if (!unwrapped) return null;

    const mainText = pickText(unwrapped, ['lyric', 'lrc', 'mainLrc', 'mainText', 'text']);
    const wordByWordText = pickText(unwrapped, ['lxlyric', 'yrc', 'qrc', 'krc', 'awlrc', 'wordByWordText', 'wordLrc']);
    const translationText = pickText(unwrapped, ['tlyric', 'tlrc', 'translation', 'translationText', 'transLrc']);
    const romanizationText = pickText(unwrapped, ['rlyric', 'rlrc', 'romanization', 'romanizationText', 'romaLrc']);
    const isPureMusic = Boolean(
        unwrapped.isPureMusic
        || unwrapped.pureMusic
        || isPureMusicLyricText(mainText)
        || isPureMusicLyricText(wordByWordText),
    );

    if (!mainText && !wordByWordText && !isPureMusic) return null;
    return { mainText, wordByWordText, translationText, romanizationText, isPureMusic };
};

const parseLyricText = (envelope: LyricEnvelope): LyricData | null => {
    const primary = envelope.wordByWordText || envelope.mainText;
    if (!primary) return null;
    const format = envelope.wordByWordText && /\[\d{1,3}:\d{2}[.:]\d{1,3}\].*<\d+,\d+>/.test(envelope.wordByWordText)
        ? 'awlrc'
        : detectTimedLyricFormat(primary);
    try {
        return parseLyricsByFormat(format, primary, envelope.translationText, {}, envelope.romanizationText);
    } catch (error) {
        console.warn('[JsMusicSource] Failed to parse source lyrics', error);
        if (primary !== envelope.mainText) {
            try {
                return parseLyricsByFormat(detectTimedLyricFormat(envelope.mainText), envelope.mainText, envelope.translationText, {}, envelope.romanizationText);
            } catch { /* return the raw lyric text below */ }
        }
        return null;
    }
};

export const toProviderLyricsResult = (value: unknown): ProviderLyricsResult | null => {
    const envelope = normalizeJsSourceLyrics(value);
    if (!envelope) return null;
    return {
        lyrics: parseLyricText(envelope),
        mainText: envelope.mainText || null,
        wordByWordText: envelope.wordByWordText || null,
        translationText: envelope.translationText || null,
        romanizationText: envelope.romanizationText || null,
        isPureMusic: envelope.isPureMusic,
    };
};

export const buildJsSourceLyricInfo = (song: SongResult): Record<string, unknown> => {
    const sourceRef = song.sourceRef?.kind === 'online' ? song.sourceRef : undefined;
    const source = sourceRef
        ? ({ netease: 'wy', kugou: 'kg', qq: 'tx' } as Partial<Record<typeof sourceRef.providerId, string>>)[sourceRef.providerId]
        : undefined;
    const providerData = sourceRef?.providerData || {};
    const songmid = typeof providerData.songmid === 'string' || typeof providerData.songmid === 'number'
        ? String(providerData.songmid)
        : String(sourceRef?.mediaId || song.id);
    return {
        musicInfo: {
        source,
        id: song.id,
        songid: song.id,
        songmid,
        name: song.name,
        songname: song.name,
        singer: song.artists.map(artist => artist.name).filter(Boolean).join('、'),
        artist: song.artists.map(artist => artist.name).filter(Boolean).join('、'),
        album: song.album?.name || '',
        albumName: song.album?.name || '',
        interval: Math.round(song.durationMs / 1000),
        duration: Math.round(song.durationMs / 1000),
        ...providerData,
        meta: { ...providerData, source, songId: String(sourceRef?.mediaId || song.id), songMid: songmid },
    },
    };
};
