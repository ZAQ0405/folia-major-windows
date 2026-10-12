import type { PersonalPlaylist } from '../types';
import { createSafeObjectUrl } from '../utils/blobGuards';
import { sanitizeDownloadFileName } from '../utils/downloadFileName';

// Portable export for personal playlists. The payload deliberately contains only the local
// playlist snapshot; account cookies/tokens and provider login state never belong in this file.
export interface PersonalPlaylistExportPayload {
    format: 'folia-personal-playlist';
    version: 1;
    exportedAt: number;
    playlist: PersonalPlaylist;
}

export interface PersonalPlaylistsExportPayload {
    format: 'folia-personal-playlists';
    version: 1;
    exportedAt: number;
    playlists: PersonalPlaylist[];
}

export const serializePersonalPlaylistToJson = (
    playlist: PersonalPlaylist,
    exportedAt = Date.now(),
): string => {
    const payload: PersonalPlaylistExportPayload = {
        format: 'folia-personal-playlist',
        version: 1,
        exportedAt,
        playlist,
    };

    return `${JSON.stringify(payload, null, 2)}\n`;
};

export const downloadPersonalPlaylistJson = (playlist: PersonalPlaylist): void => {
    const content = serializePersonalPlaylistToJson(playlist);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = createSafeObjectUrl(blob);
    if (!url) throw new Error('Failed to create playlist data download');

    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeDownloadFileName(playlist.name, 'playlist')}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export const serializePersonalPlaylistsToJson = (
    playlists: PersonalPlaylist[],
    exportedAt = Date.now(),
): string => `${JSON.stringify({
    format: 'folia-personal-playlists',
    version: 1,
    exportedAt,
    playlists,
} satisfies PersonalPlaylistsExportPayload, null, 2)}\n`;

export const parsePersonalPlaylistsJson = (value: string): PersonalPlaylist[] | null => {
    let parsed: Partial<PersonalPlaylistsExportPayload> | Partial<PersonalPlaylistExportPayload>;
    try {
        parsed = JSON.parse(value) as Partial<PersonalPlaylistsExportPayload> | Partial<PersonalPlaylistExportPayload>;
    } catch {
        return null;
    }
    if (parsed.format === 'folia-personal-playlists' && parsed.version === 1 && Array.isArray(parsed.playlists)) {
        return parsed.playlists;
    }
    if (parsed.format === 'folia-personal-playlist' && parsed.version === 1 && parsed.playlist) {
        return [parsed.playlist];
    }
    return null;
};

export const downloadPersonalPlaylistsJson = (playlists: PersonalPlaylist[]): void => {
    const content = serializePersonalPlaylistsToJson(playlists);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = createSafeObjectUrl(blob);
    if (!url) throw new Error('Failed to create playlists data download');

    const link = document.createElement('a');
    link.href = url;
    link.download = 'folia-歌单数据-备份.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
};
