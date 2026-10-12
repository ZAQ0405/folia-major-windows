import type { UnifiedSong } from '../../types';
import type { JsonValue, OnlineProviderId, ProviderPage } from '../../types/onlineMusic';
import { OnlineProviderError } from '../../types/onlineMusic';
import { getOnlineMusicProvider } from './providerRegistry';

// This is the search layer used by Luoxue itself. JS source scripts are deliberately not
// involved here: they resolve audio/lyrics for an already identified song.

type PageInput = { limit: number; offset: number };
type LuoxueChannelId = 'wy' | 'tx' | 'kg' | 'kw';

const CHANNELS: Array<{ id: LuoxueChannelId; providerId: OnlineProviderId; label: string }> = [
    { id: 'wy', providerId: 'netease', label: '网易云音乐' },
    { id: 'tx', providerId: 'qq', label: 'QQ音乐' },
    { id: 'kg', providerId: 'kugou', label: '酷狗音乐' },
    { id: 'kw', providerId: 'kuwo', label: '酷我音乐' },
];

const emptyPage = (offset: number): ProviderPage<UnifiedSong> => ({
    items: [],
    total: 0,
    hasMore: false,
    nextOffset: offset,
});

const record = (value: unknown): Record<string, any> => (
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
);

const text = (value: unknown): string => (
    typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
);

const number = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const artistNames = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.flatMap(item => {
            if (typeof item === 'string' || typeof item === 'number') return [String(item)];
            const artist = record(item);
            const name = text(artist.name || artist.singerName || artist.singer || artist.artist);
            return name ? [name] : [];
        }).filter(Boolean);
    }
    return text(value).split(/[、,，;/]+/u).map(item => item.trim()).filter(Boolean);
};

const providerData = (entries: Array<[string, unknown]>): Record<string, JsonValue> => (
    Object.fromEntries(entries.filter(([, value]) => (
        value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ))) as Record<string, JsonValue>
);

const buildSong = ({
    providerId,
    source,
    id,
    name,
    artists,
    albumId,
    albumName,
    durationMs,
    coverUrl,
    data,
}: {
    providerId: OnlineProviderId;
    source: LuoxueChannelId;
    id: string;
    name: string;
    artists: string[];
    albumId?: string;
    albumName?: string;
    durationMs?: number;
    coverUrl?: string;
    data?: Record<string, JsonValue>;
}): UnifiedSong | null => {
    if (!id || !name) return null;
    const normalizedArtists = artists.length ? artists : ['未知艺术家'];
    return {
        id,
        name,
        artists: normalizedArtists.map((artist, index) => ({
            id: `${providerId}-artist-${index}-${artist}`,
            name: artist,
        })),
        album: {
            id: albumId || `${providerId}-album-${id}`,
            name: albumName || '未知专辑',
            ...(coverUrl ? { coverUrl } : {}),
        },
        durationMs: Math.max(0, durationMs || 0),
        sourceRef: {
            kind: 'online',
            providerId,
            mediaId: id,
            providerData: {
                source,
                songmid: id,
                ...(data || {}),
            },
        },
    };
};

const normalizeKuwo = (body: unknown, providerId: OnlineProviderId, source: LuoxueChannelId): ProviderPage<UnifiedSong> => {
    const response = record(body);
    const rawList = Array.isArray(response.abslist) ? response.abslist : [];
    const items = rawList.map(item => {
        const raw = record(item);
        const id = text(raw.MUSICRID).replace(/^MUSIC_/u, '');
        const durationMs = number(raw.DURATION) * 1000;
        return buildSong({
            providerId,
            source,
            id,
            name: text(raw.SONGNAME),
            artists: artistNames(raw.ARTIST),
            albumId: text(raw.ALBUMID),
            albumName: text(raw.ALBUM),
            durationMs,
            data: providerData([
                ['songmid', id],
                ['albumId', text(raw.ALBUMID)],
            ]),
        });
    }).filter((song): song is UnifiedSong => Boolean(song));
    const total = Math.max(0, number(response.TOTAL));
    return { items, total, hasMore: total > items.length, nextOffset: 0 };
};

const requestJson = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<unknown> => {
    const bridge = typeof window !== 'undefined' ? window.electron?.fetchJsSourceRequest : undefined;
    if (bridge) {
        const response = await bridge(url, { ...init, timeout: 15_000 });
        if (!response.ok) throw new Error(`LX search request failed (${response.status})`);
        try { return JSON.parse(response.bodyText); } catch { throw new Error('LX search returned invalid JSON'); }
    }

    const proxyUrl = `/api/js-source-request?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: init.method || 'GET', headers: init.headers || {}, body: init.body }),
    });
    if (!response.ok) throw new Error(`LX search request failed (${response.status})`);
    return response.json();
};

const searchKuwo = async (query: string, page: PageInput): Promise<ProviderPage<UnifiedSong>> => {
    const pageNumber = Math.floor(page.offset / Math.max(1, page.limit)) + 1;
    const url = 'http://search.kuwo.cn/r.s?client=kt'
        + `&all=${encodeURIComponent(query)}&pn=${pageNumber - 1}&rn=${page.limit}`
        + '&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1'
        + '&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json'
        + '&vermerge=1&mobi=1&issubtitle=1';
    return normalizeKuwo(await requestJson(url), 'kuwo', 'kw');
};

const searchNative = async (
    providerId: OnlineProviderId,
    query: string,
    page: PageInput,
): Promise<ProviderPage<UnifiedSong>> => {
    const provider = getOnlineMusicProvider(providerId);
    if (!provider?.search) throw new Error(`LX search channel is unavailable: ${String(providerId)}`);
    return provider.search.searchSongs(query, page.limit, page.offset);
};

const searchChannel = (channel: typeof CHANNELS[number], query: string, page: PageInput) => {
    if (channel.id === 'kw') return searchKuwo(query, page);
    return searchNative(channel.providerId, query, page);
};

const similar = (left: string, right: string): number => {
    const a = left.toLocaleLowerCase();
    const b = right.toLocaleLowerCase();
    if (!a || !b) return 0;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
        let diagonal = previous[0];
        previous[0] = row;
        for (let column = 1; column <= b.length; column += 1) {
            const above = previous[column];
            previous[column] = Math.min(
                previous[column] + 1,
                previous[column - 1] + 1,
                diagonal + (a[row - 1] === b[column - 1] ? 0 : 1),
            );
            diagonal = above;
        }
    }
    return 1 - previous[b.length] / b.length;
};

export const getLuoxueSearchChannels = (): Array<{ id: OnlineProviderId; label: string }> => (
    CHANNELS.map(channel => ({ providerId: channel.providerId, id: channel.providerId, label: channel.label }))
);

export const getLuoxueSearchChannelIds = (): LuoxueChannelId[] => CHANNELS.map(channel => channel.id);

export const searchLuoxueChannel = async (
    channelId: OnlineProviderId,
    query: string,
    page: PageInput,
): Promise<ProviderPage<UnifiedSong>> => {
    const channel = CHANNELS.find(item => item.providerId === channelId || item.id === channelId);
    if (!channel) throw new OnlineProviderError('unsupported', `Unknown Luoxue search channel: ${String(channelId)}`, channelId);
    const result = await searchChannel(channel, query.trim(), page);
    return {
        ...result,
        nextOffset: result.nextOffset > page.offset ? result.nextOffset : page.offset + result.items.length,
    };
};

export const searchLuoxueChannels = async (query: string, page: PageInput): Promise<ProviderPage<UnifiedSong>> => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return emptyPage(page.offset);

    const settled = await Promise.allSettled(CHANNELS.map(channel => searchChannel(channel, normalizedQuery, page)));
    const successful = settled
        .filter((result): result is PromiseFulfilledResult<ProviderPage<UnifiedSong>> => result.status === 'fulfilled')
        .map(result => result.value);
    settled.forEach((result, index) => {
        if (result.status === 'rejected') console.warn('[LuoxueSearch] Channel failed', CHANNELS[index].id, result.reason);
    });
    if (!successful.length) throw new OnlineProviderError('unavailable', 'No Luoxue search channel is available');

    const seen = new Set<string>();
    const items = successful.flatMap(result => result.items).filter(song => {
        const source = song.sourceRef?.kind === 'online'
            ? `${song.sourceRef.providerId}:${song.sourceRef.mediaId}`
            : String(song.id);
        if (seen.has(source)) return false;
        seen.add(source);
        return true;
    });
    const ranked = items
        .map((song, index) => ({
            song,
            index,
            score: similar(normalizedQuery, `${song.name} ${song.artists.map(artist => artist.name).join(' ')}`),
        }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .map(item => item.song);
    const total = Math.max(...successful.map(result => result.total ?? result.items.length), 0);
    const hasMore = successful.some(result => result.hasMore);
    return {
        items: ranked,
        total,
        hasMore,
        nextOffset: page.offset + page.limit,
    };
};
