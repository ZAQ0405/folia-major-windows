import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { omni } from '../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import type {
    OnlineProviderId,
    ProviderAccountSummary,
    ProviderChannelHealth,
    ProviderChannelHealthMap,
} from '../types/onlineMusic';
import { useStableCallbacks } from './useStableCallbacks';

// src/hooks/useOnlineProviderPlatform.ts

export type OnlineProviderPlatformState = {
    providers: ProviderAccountSummary[];
    activeProviderId: OnlineProviderId;
    activeProvider: ProviderAccountSummary | undefined;
    switchProvider: (providerId: OnlineProviderId) => Promise<boolean>;
    refreshProvider: (providerId: OnlineProviderId) => Promise<unknown>;
    logoutProvider: (providerId: OnlineProviderId) => Promise<void>;
    completeLogin: (providerId: OnlineProviderId) => Promise<boolean>;
    channelHealth: ProviderChannelHealthMap;
    checkProviderChannel: (providerId: OnlineProviderId) => Promise<ProviderChannelHealth>;
    checkAllProviderChannels: () => Promise<void>;
};

type ProviderSwitchTransaction = {
    currentProviderId: OnlineProviderId;
    nextProviderId: OnlineProviderId;
    prepare?: (currentProviderId: OnlineProviderId, nextProviderId: OnlineProviderId) => Promise<boolean>;
    commit: (providerId: OnlineProviderId) => void;
    refresh?: () => Promise<unknown>;
};

type ProviderLoginTransaction = {
    currentProviderId: OnlineProviderId;
    loginProviderId: OnlineProviderId;
    refresh: () => Promise<unknown>;
    activate: () => Promise<boolean>;
};

// Refreshes the authenticated account before optionally activating its provider.
export const completeOnlineProviderLoginTransaction = async ({
    currentProviderId,
    loginProviderId,
    refresh,
    activate,
}: ProviderLoginTransaction): Promise<boolean> => {
    const refreshed = await refresh();
    if (refreshed === false) return false;
    if (loginProviderId === currentProviderId) return true;
    return activate();
};

// Commits a provider change only after cleanup is confirmed, then refreshes the new account namespace.
export const switchOnlineProviderTransaction = async ({
    currentProviderId,
    nextProviderId,
    prepare,
    commit,
    refresh,
}: ProviderSwitchTransaction): Promise<boolean> => {
    if (nextProviderId === currentProviderId) return true;
    if (prepare && !await prepare(currentProviderId, nextProviderId)) return false;
    omni.invalidateActiveRequests();
    commit(nextProviderId);
    await refresh?.();
    return true;
};

export const useOnlineProviderPlatform = (
    refreshers: Partial<Record<OnlineProviderId, () => Promise<unknown>>>,
    prepareSwitch?: (currentProviderId: OnlineProviderId, nextProviderId: OnlineProviderId) => Promise<boolean>,
    logouts: Partial<Record<OnlineProviderId, () => Promise<void>>> = {},
): OnlineProviderPlatformState => {
    const { accounts, activeProviderId, setActiveProviderId } = useOnlineProviderAccountStore(useShallow(state => ({
        accounts: state.accounts,
        activeProviderId: state.activeProviderId,
        setActiveProviderId: state.setActiveProviderId,
    })));
    const [channelHealth, setChannelHealth] = useState<ProviderChannelHealthMap>({});

    const providers = useMemo<ProviderAccountSummary[]>(() => omni.getProviderSummaries(), [accounts]);
    const refreshProvider = useCallback(async (providerId: OnlineProviderId) => {
        return await refreshers[providerId]?.();
    }, [refreshers]);
    const logoutProvider = useCallback(async (providerId: OnlineProviderId) => {
        await logouts[providerId]?.();
    }, [logouts]);
    const switchProvider = useCallback((providerId: OnlineProviderId) => switchOnlineProviderTransaction({
        currentProviderId: activeProviderId,
        nextProviderId: providerId,
        prepare: prepareSwitch,
        commit: setActiveProviderId,
        refresh: refreshers[providerId],
    }), [activeProviderId, prepareSwitch, refreshers, setActiveProviderId]);
    const completeLogin = useCallback((providerId: OnlineProviderId) => completeOnlineProviderLoginTransaction({
        currentProviderId: activeProviderId,
        loginProviderId: providerId,
        refresh: async () => await refreshers[providerId]?.(),
        activate: () => switchOnlineProviderTransaction({
            currentProviderId: activeProviderId,
            nextProviderId: providerId,
            prepare: prepareSwitch,
            commit: setActiveProviderId,
        }),
    }), [activeProviderId, prepareSwitch, refreshers, setActiveProviderId]);

    const checkProviderChannel = useCallback(async (providerId: OnlineProviderId) => {
        setChannelHealth(previous => ({
            ...previous,
            [providerId]: { status: 'checking' },
        }));
        const result = await omni.checkProviderChannel(providerId);
        setChannelHealth(previous => ({ ...previous, [providerId]: result }));
        return result;
    }, []);
    const checkAllProviderChannels = useCallback(async () => {
        // Account-only providers (currently Kuwo) are not search channels, but they still need a
        // real health check so the provider switcher does not leave them stuck at "checking".
        const providerIds = omni.getProviderSummaries()
            .filter(provider => {
                if (!provider.availability.configured) return false;
                const capabilities = omni.getProviderCapabilities(provider.providerId);
                return capabilities.search || capabilities.auth;
            })
            .map(provider => provider.providerId);
        await Promise.all(providerIds.map(providerId => checkProviderChannel(providerId)));
    }, [checkProviderChannel]);

    useEffect(() => {
        void checkAllProviderChannels();
    }, [checkAllProviderChannels]);

    const activeProvider = providers.find(provider => provider.providerId === activeProviderId) || providers[0];
    // The whole object is a dependency of buildHomeModel, so unlike the other hooks here it is not
    // enough to stabilise the callbacks - the object itself has to keep its identity while nothing
    // in it changed. The callbacks get a permanent identity first so they cannot invalidate it.
    const actions = useStableCallbacks({
        switchProvider,
        refreshProvider,
        logoutProvider,
        completeLogin,
        checkProviderChannel,
        checkAllProviderChannels,
    });
    return useMemo(
        () => ({ providers, activeProviderId, activeProvider, channelHealth, ...actions }),
        [providers, activeProviderId, activeProvider, channelHealth, actions],
    );
};
