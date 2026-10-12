import type { ProviderCollection } from '../types/onlineMusic';

// The app owns one account-independent "我喜欢" playlist. Provider accounts may also expose
// their built-in liked-song collection; showing both makes them look like two different local
// favorites and lets the two buttons drift apart.
export const isProviderLikedCollection = (
    collection: Pick<ProviderCollection, 'providerId' | 'name' | 'isLiked' | 'providerData'>,
): boolean => {
    if (collection.isLiked === true) return true;

    const name = collection.name.trim().toLowerCase();
    const providerData = collection.providerData ?? {};
    const specialType = String(
        providerData.specialType ?? providerData.listType ?? providerData.collectionType ?? '',
    ).trim().toLowerCase();

    if (specialType === 'liked' || specialType === 'favorite' || specialType === 'favorites') {
        return true;
    }

    if (collection.providerId === 'kugou' && String(providerData.listId ?? '').trim() === '2') {
        return true;
    }

    if (
        name === '我喜欢'
        || name === '我喜欢的音乐'
        || name === 'liked songs'
        || name === 'my liked songs'
        || name === 'favorite songs'
    ) {
        return true;
    }

    // Some providers return the built-in liked playlist with a generated name such as
    // "用户...喜欢的歌曲" and no isLiked flag. This is a provider convention, not a user
    // playlist name, so it must be removed before the collection reaches account state/cache.
    return name.includes('喜欢的');
};
