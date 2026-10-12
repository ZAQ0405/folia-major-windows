import type { SongResult, UnifiedSong } from '../../types';
import type { OnlineMusicProvider, ProviderUser } from '../../types/onlineMusic';
import {
    getKuwoAccountAvailability,
    getKuwoAccountStatus,
    loginKuwoAccount,
    logoutKuwoAccount,
} from './kuwoAccountTransport';

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
    // Search/playback stay on the LX channel. This provider is deliberately account-only so
    // registering it cannot create a duplicate search channel or alter manual playback mode.
    capabilities: {
        search: false, playback: false, lyrics: false, auth: true, userLibrary: false,
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
};
