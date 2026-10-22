import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import type { PlayerChromeVisibilityMode } from '../types/remoteControl';

// src/hooks/usePlayerChromeAutoHide.ts
// Coordinates persisted player-chrome modes with the legacy auto-hide setting.
const PLAYER_CHROME_VISIBILITY_MODE_STORAGE_KEY = 'player_chrome_visibility_mode';

const isPlayerChromeVisibilityMode = (value: string | null): value is PlayerChromeVisibilityMode => (
    value === 'always-hidden' || value === 'always-visible' || value === 'auto-hide'
);
type UsePlayerChromeAutoHideOptions = {
    autoHidePlayerChrome: boolean;
    initialPlayerChromeHidden: boolean;
    suppressPointerReveal?: boolean;
    setIsPlayerChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;
    setAutoHidePlayerChromePreference: (enabled: boolean) => void;
    onModeChange?: (mode: PlayerChromeVisibilityMode) => void;
};

const getNextPlayerChromeVisibilityMode = (mode: PlayerChromeVisibilityMode): PlayerChromeVisibilityMode => {
    if (mode === 'always-hidden') return 'always-visible';
    if (mode === 'always-visible') return 'auto-hide';
    return 'always-hidden';
};

const getInitialPlayerChromeVisibilityMode = (autoHidePlayerChrome: boolean, initialPlayerChromeHidden: boolean): PlayerChromeVisibilityMode => {
    const storedMode = localStorage.getItem(PLAYER_CHROME_VISIBILITY_MODE_STORAGE_KEY);
    // The explicit auto-hide setting must win over an older saved "always-visible" mode.
    if (autoHidePlayerChrome) return 'auto-hide';
    if (isPlayerChromeVisibilityMode(storedMode)) {
        return storedMode;
    }

    return initialPlayerChromeHidden ? 'always-hidden' : 'always-visible';
};

export const usePlayerChromeAutoHide = ({
    autoHidePlayerChrome,
    initialPlayerChromeHidden,
    suppressPointerReveal = false,
    setIsPlayerChromeHidden,
    setAutoHidePlayerChromePreference,
    onModeChange,
}: UsePlayerChromeAutoHideOptions) => {
    const [playerChromeVisibilityMode, setPlayerChromeVisibilityMode] = useState<PlayerChromeVisibilityMode>(() => (
        getInitialPlayerChromeVisibilityMode(autoHidePlayerChrome, initialPlayerChromeHidden)
    ));
    const [isFloatingPlayerControlsHidden, setIsFloatingPlayerControlsHidden] = useState(
        () => playerChromeVisibilityMode !== 'always-visible',
    );
    const playerChromeVisibilityModeRef = useRef(playerChromeVisibilityMode);
    const timeoutIdRef = useRef<number | undefined>(undefined);
    const isSynchronizingPreferenceRef = useRef(false);
    const hasInitializedPreferenceSyncRef = useRef(false);

    const clearAutoHideTimer = useCallback(() => {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = undefined;
    }, []);

    const scheduleAutoHide = useCallback((delay: number) => {
        clearAutoHideTimer();
        timeoutIdRef.current = window.setTimeout(() => {
            timeoutIdRef.current = undefined;
            setIsFloatingPlayerControlsHidden(true);
        }, delay);
    }, [clearAutoHideTimer]);

    const handleAutoHidePointerEnter = useCallback(() => {
        if (playerChromeVisibilityModeRef.current !== 'auto-hide' || suppressPointerReveal) return;
        clearAutoHideTimer();
        setIsFloatingPlayerControlsHidden(false);
    }, [clearAutoHideTimer, suppressPointerReveal]);

    const handleAutoHidePointerLeave = useCallback(() => {
        if (playerChromeVisibilityModeRef.current !== 'auto-hide' || suppressPointerReveal) return;
        scheduleAutoHide(220);
    }, [scheduleAutoHide, suppressPointerReveal]);

    const cyclePlayerChromeVisibilityMode = useCallback(() => {
        const nextMode = getNextPlayerChromeVisibilityMode(playerChromeVisibilityModeRef.current);
        const shouldAutoHide = nextMode === 'auto-hide';
        playerChromeVisibilityModeRef.current = nextMode;
        setPlayerChromeVisibilityMode(nextMode);
        if (autoHidePlayerChrome !== shouldAutoHide) {
            isSynchronizingPreferenceRef.current = true;
            setAutoHidePlayerChromePreference(shouldAutoHide);
        }
        onModeChange?.(nextMode);
    }, [autoHidePlayerChrome, onModeChange, setAutoHidePlayerChromePreference]);

    useEffect(() => {
        localStorage.setItem(PLAYER_CHROME_VISIBILITY_MODE_STORAGE_KEY, playerChromeVisibilityMode);
    }, [playerChromeVisibilityMode]);

    useEffect(() => {
        if (!hasInitializedPreferenceSyncRef.current) {
            hasInitializedPreferenceSyncRef.current = true;
            const shouldAutoHide = playerChromeVisibilityModeRef.current === 'auto-hide';
            if (autoHidePlayerChrome !== shouldAutoHide) {
                isSynchronizingPreferenceRef.current = true;
                setAutoHidePlayerChromePreference(shouldAutoHide);
            }
            return;
        }

        if (isSynchronizingPreferenceRef.current) {
            isSynchronizingPreferenceRef.current = false;
            return;
        }

        const nextMode = autoHidePlayerChrome ? 'auto-hide' : 'always-visible';
        playerChromeVisibilityModeRef.current = nextMode;
        setPlayerChromeVisibilityMode(nextMode);
    }, [autoHidePlayerChrome, setAutoHidePlayerChromePreference]);

    useLayoutEffect(() => {
        if (playerChromeVisibilityMode === 'always-hidden') {
            setIsPlayerChromeHidden(true);
            setIsFloatingPlayerControlsHidden(true);
            return clearAutoHideTimer;
        }

        if (playerChromeVisibilityMode === 'always-visible') {
            setIsPlayerChromeHidden(false);
            setIsFloatingPlayerControlsHidden(false);
            return clearAutoHideTimer;
        }

        // Auto-hide is deliberately local to the floating playback dock. Do not toggle the
        // shared chrome flag: side-panel buttons and other spaces use that flag independently.
        setIsPlayerChromeHidden(false);

        // Click-through still forwards pointer events into the renderer, so the hidden bar must
        // stay hidden while the window is intentionally letting clicks pass through.
        if (suppressPointerReveal) {
            clearAutoHideTimer();
            setIsFloatingPlayerControlsHidden(true);
            return clearAutoHideTimer;
        }

        // Auto-hide mode is hover-only: start concealed and reveal only from the bar's hotspot.
        clearAutoHideTimer();
        setIsFloatingPlayerControlsHidden(true);
        return () => {
            clearAutoHideTimer();
        };
    }, [playerChromeVisibilityMode, suppressPointerReveal, setIsPlayerChromeHidden, clearAutoHideTimer]);

    return {
        isFloatingPlayerControlsHidden,
        playerChromeVisibilityMode,
        cyclePlayerChromeVisibilityMode,
        handleAutoHidePointerEnter,
        handleAutoHidePointerLeave,
    };
};
