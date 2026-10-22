import type { SongResult, UnifiedSong } from '../../types';
import type { OnlineMusicProvider, ProviderLyricsResult, ProviderUser } from '../../types/onlineMusic';
import { parseLyricsByFormat } from '../../utils/lyrics/parserCore';
import { isAndroidCapacitor } from '../../utils/runtimePlatform';
import {
    getKuwoAccountAvailability,
    getKuwoAccountStatus,
    loginKuwoAccount,
    logoutKuwoAccount,
} from './kuwoAccountTransport';

const KUWO_LYRIC_ENDPOINT = 'https://www.kuwo.cn/openapi/v1/www/lyric/getlyric';

const getKuwoSongId = (song: SongResult): string => {
    const sourceRef = song.sourceRef?.kind === 'online' && song.sourceRef.providerId === 'kuwo'
        ? song.sourceRef
        : undefined;
    return String(sourceRef?.providerData?.songmid || sourceRef?.mediaId || song.id || '').trim().replace(/^MUSIC_/iu, '');
};

const formatKuwoTimestamp = (value: unknown): string | null => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const centiseconds = Math.round(seconds * 100);
    const minutes = Math.floor(centiseconds / 6000);
    const remainder = (centiseconds % 6000) / 100;
    return `[${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}]`;
};

export const normalizeKuwoLyrics = (body: unknown): ProviderLyricsResult => {
    const response = body && typeof body === 'object' ? body as Record<string, any> : {};
    const data = response.data && typeof response.data === 'object' ? response.data as Record<string, any> : {};
    const rows = Array.isArray(data.lrclist) ? data.lrclist : [];
    const lyricText = rows
        .map((row: any) => {
            const timestamp = formatKuwoTimestamp(row?.time);
            const line = String(row?.lineLyric || '').trim();
            return timestamp && line ? `${timestamp}${line}` : '';
        })
        .filter(Boolean)
        .join('\n');
    const parsed = lyricText ? parseLyricsByFormat('lrc', lyricText, '') : null;
    return {
        lyrics: parsed,
        mainText: lyricText || null,
        wordByWordText: lyricText || null,
        isPureMusic: false,
        chorusRanges: [],
    };
};

const getKuwoLyrics = async (song: SongResult): Promise<ProviderLyricsResult> => {
    const musicId = getKuwoSongId(song);
    if (!musicId) return normalizeKuwoLyrics(null);

    const url = new URL(KUWO_LYRIC_ENDPOINT);
    url.searchParams.set('musicId', musicId);
    url.searchParams.set('httpsStatus', '1');
    url.searchParams.set('reqId', typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    url.searchParams.set('plat', 'web_www');
    url.searchParams.set('from', 'lrc');

    const bridge = typeof window !== 'undefined' ? window.electron?.fetchJsSourceRequest : undefined;
    let response: Response | { ok: boolean; status: number; bodyText: string };
    if (bridge) {
        response = await bridge(url.toString(), { method: 'GET', timeout: 15_000 });
    } else if (isAndroidCapacitor) {
        response = await fetch(url, { headers: { Referer: `https://www.kuwo.cn/play_detail/${musicId}` } });
    } else {
        response = await fetch(`/api/js-source-request?url=${encodeURIComponent(url.toString())}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'GET', headers: { Referer: `https://www.kuwo.cn/play_detail/${musicId}` } }),
        });
    }

    if (!response.ok) throw new Error(`Kuwo lyrics request failed: ${response.status}`);
    const body = 'bodyText' in response ? JSON.parse(response.bodyText) : await response.json();
    if (Number((body as any)?.code) !== 200) {
        throw new Error(`Kuwo lyrics unavailable: ${String((body as any)?.msg || 'empty response')}`);
    }
    return normalizeKuwoLyrics(body);
};

const normalizeUser = (raw: any): ProviderUser => ({
    id: raw?.id ?? '',
    nickname: String(raw?.nickname || '酷我音乐用户'),
    ...(raw?.avatarUrl ? { avatarUrl: String(raw.avatarUrl) } : {}),
    vipType: Number(raw?.vipType || 0),
});

export const kuwoProvider: OnlineMusicProvider = {
    id: 'kuwo',
    displayName: 'Kuwo Music',
    shortName: '酷我',
    getAvailability: getKuwoAccountAvailability,
    // Search is handled by luoxueSearch; this provider keeps account/playback capabilities
    // separate while still providing anonymous lyrics directly.
    capabilities: {
        search: false, playback: false, lyrics: true, auth: true, userLibrary: false,
        playlists: false, albums: false, artists: false, recommendations: false, mutations: false,
        wordByWordLyrics: false,
    },
    normalizeSong(raw: unknown): UnifiedSong {
        return raw as UnifiedSong;
    },
    normalizeUser,
    auth: {
        async getLoginStatus() {
            const result = await getKuwoAccountStatus();
            return result.user ? normalizeUser(result.user) : null;
        },
        async loginWithCredentials(username, password) {
            const result = await loginKuwoAccount(username, password);
            if (!result.user) throw new Error('酷我登录未返回账号信息');
            return normalizeUser(result.user);
        },
        async logout() {
            await logoutKuwoAccount();
        },
    },
    lyrics: { getLyrics: getKuwoLyrics },
};
