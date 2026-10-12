import type { PersonalPlaylist, SongResult } from '../types';
import { getPlaybackSongKey, normalizePlaybackSongSource } from '../utils/appPlaybackGuards';
import { getFromCache, saveToCache } from './db';

const PERSONAL_PLAYLISTS_CACHE_KEY = 'personal_playlists_v1';
const FAVORITE_PLAYLIST_NAME = '我喜欢';
const UNTITLED_PLAYLIST_NAME = '未命名歌单';

type LegacyPersonalPlaylist = Partial<PersonalPlaylist> & {
    tracks?: SongResult[];
    songList?: SongResult[];
};

const createPlaylistId = () => `personal_playlist_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// Provider results can carry extra runtime fields added by a transport. Keep the playlist record
// structured-cloneable so one unusual provider payload cannot make IndexedDB silently reject the
// whole playlist write.
const snapshotSong = (song: SongResult): SongResult => {
    const normalized = normalizePlaybackSongSource(song);
    try {
        if (typeof structuredClone === 'function') {
            return structuredClone(normalized);
        }
    } catch {
        // Fall through to the JSON-safe copy below.
    }

    try {
        return JSON.parse(JSON.stringify(normalized)) as SongResult;
    } catch {
        const { sourceRef, id, name, artists, album, durationMs } = normalized;
        return { sourceRef, id, name, artists, album, durationMs };
    }
};

const dedupeSongs = (songs: SongResult[]): SongResult[] => {
    const seen = new Set<string>();
    return songs
        .filter(song => Boolean(song?.id))
        .map(snapshotSong)
        .filter(song => {
            const key = getPlaybackSongKey(song);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

const normalizePlaylist = (playlist: LegacyPersonalPlaylist): PersonalPlaylist => ({
    id: typeof playlist.id === 'string' && playlist.id ? playlist.id : createPlaylistId(),
    name: typeof playlist.name === 'string' && playlist.name.trim()
        ? playlist.name.trim()
        : (playlist.isFavorite ? FAVORITE_PLAYLIST_NAME : UNTITLED_PLAYLIST_NAME),
    songs: dedupeSongs(Array.isArray(playlist.songs)
        ? playlist.songs
        : Array.isArray(playlist.songList)
            ? playlist.songList
            : Array.isArray(playlist.tracks) ? playlist.tracks : []),
    createdAt: typeof playlist.createdAt === 'number' ? playlist.createdAt : Date.now(),
    updatedAt: typeof playlist.updatedAt === 'number' ? playlist.updatedAt : Date.now(),
    isFavorite: Boolean(playlist.isFavorite),
});

const persist = async (playlists: PersonalPlaylist[]): Promise<void> => {
    await saveToCache(PERSONAL_PLAYLISTS_CACHE_KEY, playlists.map(normalizePlaylist));
};

export const getPersonalPlaylists = async (): Promise<PersonalPlaylist[]> => {
    const cached = await getFromCache<LegacyPersonalPlaylist[]>(PERSONAL_PLAYLISTS_CACHE_KEY);
    const playlists = Array.isArray(cached) ? cached.map(normalizePlaylist) : [];
    if (playlists.some(playlist => playlist.isFavorite)) {
        return playlists;
    }

    const now = Date.now();
    const favorite: PersonalPlaylist = {
        id: createPlaylistId(),
        name: FAVORITE_PLAYLIST_NAME,
        songs: [],
        createdAt: now,
        updatedAt: now,
        isFavorite: true,
    };
    const next = [favorite, ...playlists];
    await persist(next);
    return next;
};

export const savePersonalPlaylists = async (playlists: PersonalPlaylist[]): Promise<PersonalPlaylist[]> => {
    const normalized = playlists.map(normalizePlaylist);
    await persist(normalized);
    return normalized;
};

export const mergePersonalPlaylistBackup = async (incoming: PersonalPlaylist[]): Promise<PersonalPlaylist[]> => {
    const current = await getPersonalPlaylists();
    const byId = new Map(current.map(playlist => [playlist.id, playlist]));
    incoming.map(normalizePlaylist).forEach(playlist => {
        const existing = byId.get(playlist.id);
        if (!existing) {
            byId.set(playlist.id, playlist);
            return;
        }
        byId.set(playlist.id, normalizePlaylist({
            ...existing,
            ...playlist,
            // A backup import is additive: songs added locally after the backup are preserved.
            songs: dedupeSongs([...existing.songs, ...playlist.songs]),
            updatedAt: Math.max(existing.updatedAt, playlist.updatedAt),
        }));
    });
    return savePersonalPlaylists(Array.from(byId.values()));
};

export const createPersonalPlaylist = async (
    name: string,
    songs: SongResult[] = [],
): Promise<PersonalPlaylist> => {
    const playlists = await getPersonalPlaylists();
    const now = Date.now();
    const playlist: PersonalPlaylist = {
        id: createPlaylistId(),
        name: name.trim() || UNTITLED_PLAYLIST_NAME,
        songs: dedupeSongs(songs),
        createdAt: now,
        updatedAt: now,
    };
    await persist([...playlists, playlist]);
    return playlist;
};

export const updatePersonalPlaylist = async (
    playlistId: string,
    updater: (playlist: PersonalPlaylist) => PersonalPlaylist,
): Promise<PersonalPlaylist | null> => {
    const playlists = await getPersonalPlaylists();
    let updated: PersonalPlaylist | null = null;
    const next = playlists.map(playlist => {
        if (playlist.id !== playlistId) return playlist;
        updated = normalizePlaylist({ ...updater(playlist), updatedAt: Date.now() });
        return updated;
    });
    if (!updated) return null;
    await persist(next);
    return updated;
};

export const deletePersonalPlaylist = async (playlistId: string): Promise<void> => {
    const playlists = await getPersonalPlaylists();
    const target = playlists.find(playlist => playlist.id === playlistId);
    if (!target || target.isFavorite) return;
    await persist(playlists.filter(playlist => playlist.id !== playlistId));
};

export const addSongsToPersonalPlaylist = async (
    playlistId: string,
    songs: SongResult[],
): Promise<PersonalPlaylist | null> => updatePersonalPlaylist(playlistId, playlist => ({
    ...playlist,
    songs: dedupeSongs([...playlist.songs, ...songs]),
}));

export const removeSongsFromPersonalPlaylist = async (
    playlistId: string,
    songKeys: string[],
): Promise<PersonalPlaylist | null> => {
    const removing = new Set(songKeys);
    return updatePersonalPlaylist(playlistId, playlist => ({
        ...playlist,
        songs: playlist.songs.filter(song => !removing.has(getPlaybackSongKey(song))),
    }));
};

export const isSongInPersonalFavorite = (
    playlists: PersonalPlaylist[],
    song: SongResult | null | undefined,
): boolean => {
    if (!song) return false;
    const favorite = playlists.find(playlist => playlist.isFavorite);
    if (!favorite) return false;
    const key = getPlaybackSongKey(song);
    return favorite.songs.some(item => getPlaybackSongKey(item) === key);
};

export const reorderPersonalPlaylistSongs = async (
    playlistId: string,
    songs: SongResult[],
): Promise<PersonalPlaylist | null> => updatePersonalPlaylist(playlistId, playlist => ({
    ...playlist,
    songs: dedupeSongs(songs),
}));
