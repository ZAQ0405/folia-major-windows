import { useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PlayerState, type Theme, type VisualizerMode } from '../../types';
import type { VisualizerBackgroundConfig } from './backgrounds/definition';
import { audioBands, audioPower, lyricCurrentTime } from '../../stores/motionSignals';
import { useAppViewStore } from '../../stores/useAppViewStore';
import { useAppChromeStore } from '../../stores/useAppChromeStore';
import { useSettingsModalStore } from '../../stores/useSettingsModalStore';
import { useThemeSettingsStore } from '../../stores/useThemeSettingsStore';
import { useTypographySettingsStore } from '../../stores/useTypographySettingsStore';
import { usePlayerChromeSettingsStore } from '../../stores/usePlayerChromeSettingsStore';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { useVisualizerAssetStore } from '../../stores/useVisualizerAssetStore';
import {
    selectDisplayCoverUrl,
    selectDisplayDuration,
    selectDisplayLyrics,
    selectDisplayPlayerState,
    selectDisplaySong,
    usePlaybackStore,
} from '../../stores/usePlaybackStore';
import { getSongAlbumLabel, getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { useVisualizerBackgroundConfig } from './useVisualizerBackgroundConfig';
import { useVisualizerTunings } from './useVisualizerTunings';
import { createJizuraRandomVariant } from './jizura/randomVariant';

// src/components/visualizer/useVisualizerRendererModel.ts
//
// Assembles VisualizerRenderer's props. This was 47 of them written out in App.tsx's JSX, plus the
// memos that fed them.
//
// VisualizerRenderer itself stays a plain props component on purpose: the same visualizers render
// inside VisPlayground, the Theme Park preview and the OBS browser source, and none of those hosts
// has this app's stores to subscribe to. The subscription boundary is this file, not deeper.

/** What only App.tsx can supply: the theme bundle it derives, and the flags it computes. */
type VisualizerRendererModelDeps = {
    /** Built from `appStyle` + the active theme, which are not store state. */
    theme: Theme;
    subtitleTheme: Theme;
    /** The displayed song's id; visualizers infer "song changed" from it. */
    seed: string | number | undefined;
    /** Rendering into the OBS browser source instead of the window: freeze to a still. */
    isObsBrowserSourceRendering: boolean;
    shouldPauseVisualizerBackground: boolean;
    hideTranslationSubtitle: boolean;
    isPlayerPageTransparent: boolean;
    onLyricLineSeek: (index: number) => void;
    onBack: () => void;
};

export const useVisualizerRendererModel = ({
    theme,
    subtitleTheme,
    seed,
    isObsBrowserSourceRendering,
    shouldPauseVisualizerBackground,
    hideTranslationSubtitle,
    isPlayerPageTransparent,
    onLyricLineSeek,
    onBack,
}: VisualizerRendererModelDeps) => {
    const currentView = useAppViewStore(state => state.view);
    const isPanelOpen = useAppViewStore(state => state.isPanelOpen);
    const isPlayerChromeHidden = useAppChromeStore(state => state.isPlayerChromeHidden);
    const onPlayerPanelGuideHotspotChange = useAppChromeStore(state => state.setIsPlayerPanelGuideHotspotActive);
    const isSettingsModalOpen = useSettingsModalStore(state => state.settingsModalState.isOpen);
    const isSettingsSubviewOpen = useSettingsModalStore(state => state.isSubSettingsViewOpen);
    const isDaylight = useThemeSettingsStore(state => state.isDaylight);
    const staticMode = useThemeSettingsStore(state => state.staticMode);
    const alwaysShowPlayerBackButton = usePlayerChromeSettingsStore(state => state.alwaysShowPlayerBackButton);
    const visualizerMode = useVisualizerSettingsStore(state => state.visualizerMode);
    const jizuraEnabled = useVisualizerSettingsStore(state => state.jizuraEnabled);
    const globalJizuraStyle = useVisualizerSettingsStore(state => state.jizuraStyle);
    const globalJizuraSettings = useVisualizerSettingsStore(state => state.jizuraSettings);
    const visualizerOpacity = useVisualizerSettingsStore(state => state.visualizerOpacity);
    const jizuraRandomNonce = useVisualizerSettingsStore(state => state.jizuraRandomNonce);
    const handleSetJizuraActiveVariant = useVisualizerSettingsStore(state => state.handleSetJizuraActiveVariant);
    const disableGeometricBackground = useVisualizerSettingsStore(state => state.disableVisualizerGeometricBackground);
    const onMonetTuningChange = useVisualizerSettingsStore(state => state.handleSetMonetTuning);
    const typography = useTypographySettingsStore(useShallow(state => ({
        lyricsFontScale: state.lyricsFontScale,
        subtitleFontScale: state.subtitleFontScale,
        subtitleOverlayOpacity: state.subtitleOverlayOpacity,
        subtitleOverlayBackground: state.subtitleOverlayBackground,
        subtitleUpcomingLyricsBlur: state.subtitleUpcomingLyricsBlur,
        showHarmonySubtitle: state.showHarmonySubtitle,
        harmonySubtitleBackground: state.harmonySubtitleBackground,
        showSubtitleTranslation: state.showSubtitleTranslation,
        subtitleContentMode: state.subtitleContentMode,
    })));
    const assets = useVisualizerAssetStore(useShallow(state => ({
        cappellaCustomEmojiImages: state.cappellaCustomEmojiImages,
        cappellaCustomAvatarImages: state.cappellaCustomAvatarImages,
        monetPortraitImage: state.monetPortraitImage,
    })));
    const currentLineIndex = usePlaybackStore(state => state.currentLineIndex);
    // The held picture throughout: song, lyrics, cover and transport must describe one track for the
    // whole length of a blend.
    const displaySong = usePlaybackStore(selectDisplaySong);
    const jizuraSongKey = displaySong ? getPlaybackSongKey(displaySong) : null;
    const displayPlayerState = usePlaybackStore(selectDisplayPlayerState);
    const jizuraPlaybackRef = useRef<{ songKey: string | null; playerState: PlayerState; nonce: number }>({
        songKey: null,
        playerState: PlayerState.IDLE,
        nonce: 0,
    });
    const previousJizuraPlayback = jizuraPlaybackRef.current;
    const startedJizuraPlayback = Boolean(
        jizuraSongKey && (
            previousJizuraPlayback.songKey !== jizuraSongKey
            || (previousJizuraPlayback.playerState === PlayerState.IDLE && displayPlayerState === PlayerState.PLAYING)
        ),
    );
    const jizuraPlaybackNonce = previousJizuraPlayback.nonce + (startedJizuraPlayback ? 1 : 0);
    jizuraPlaybackRef.current = {
        songKey: jizuraSongKey,
        playerState: displayPlayerState,
        nonce: jizuraPlaybackNonce,
    };
    const jizuraSongPreset = useVisualizerSettingsStore(state => (
        jizuraSongKey ? state.jizuraSongPresets[jizuraSongKey] : undefined
    ));
    const hasFixedJizuraPreset = Boolean(jizuraSongPreset);
    const randomJizuraVariant = useMemo(
        () => createJizuraRandomVariant(
            globalJizuraStyle,
            globalJizuraSettings,
            `${jizuraSongKey ?? 'no-song'}:${jizuraPlaybackNonce}:${jizuraRandomNonce}`,
        ),
        [globalJizuraSettings, globalJizuraStyle, jizuraPlaybackNonce, jizuraRandomNonce, jizuraSongKey],
    );
    const jizuraStyle = jizuraSongPreset?.style ?? randomJizuraVariant.style;
    const jizuraSettings = jizuraSongPreset?.settings ?? randomJizuraVariant.settings;
    const jizuraSeed = hasFixedJizuraPreset
        ? `${seed ?? 'folia-jizura'}:${jizuraSongKey ?? 'no-song'}:fixed:${jizuraRandomNonce}`
        : `${seed ?? 'folia-jizura'}:${jizuraSongKey ?? 'no-song'}:random:${jizuraPlaybackNonce}:${jizuraRandomNonce}`;
    useEffect(() => {
        if (!jizuraEnabled || !jizuraSongKey || hasFixedJizuraPreset) {
            handleSetJizuraActiveVariant(null);
            return;
        }
        handleSetJizuraActiveVariant({
            songKey: jizuraSongKey,
            style: randomJizuraVariant.style,
            settings: randomJizuraVariant.settings,
        });
    }, [handleSetJizuraActiveVariant, hasFixedJizuraPreset, jizuraEnabled, jizuraSongKey, randomJizuraVariant]);
    const displayLyrics = usePlaybackStore(selectDisplayLyrics);
    const displayCoverUrl = usePlaybackStore(selectDisplayCoverUrl);
    const displayDuration = usePlaybackStore(selectDisplayDuration);
    const backgroundConfig = useVisualizerBackgroundConfig();
    const visualizerTunings = useVisualizerTunings();

    const songArtist = useMemo(
        () => (displaySong ? getSongArtistLabel(displaySong) || null : null),
        [displaySong],
    );
    const songAlbum = useMemo(
        () => (displaySong ? getSongAlbumLabel(displaySong) || null : null),
        [displaySong],
    );

    const background = useMemo<VisualizerBackgroundConfig>(() => ({
        ...backgroundConfig,
        transparent: isPlayerPageTransparent,
        common: {
            ...backgroundConfig.common,
            // A settings subview covers the geometry anyway, and drawing it under an opaque panel
            // is the one place the cost buys nothing.
            disableGeometricBackground: disableGeometricBackground || isSettingsSubviewOpen,
        },
    }), [backgroundConfig, isPlayerPageTransparent, disableGeometricBackground, isSettingsSubviewOpen]);

    const mode: VisualizerMode = isObsBrowserSourceRendering ? 'still' : visualizerMode;

    return {
        mode,
        jizuraEnabled,
        jizuraStyle,
        jizuraSettings,
        jizuraSeed,
        duration: displayDuration,
        currentTime: lyricCurrentTime,
        currentLineIndex,
        lines: displayLyrics?.lines || [],
        theme,
        subtitleTheme,
        isDaylight,
        audioPower,
        audioBands,
        songTitle: displaySong?.name,
        songArtist,
        songAlbum,
        coverUrl: displayCoverUrl,
        showText: currentView === 'player' && !isSettingsModalOpen,
        seed,
        staticMode,
        backgroundStaticMode: shouldPauseVisualizerBackground
            || (
                background.mode === 'latent'
                && background.latent?.tuning?.dynamicOnlyInPlayer
                && currentView !== 'player'
            ),
        paused: displayPlayerState !== PlayerState.PLAYING,
        visualizerOpacity,
        background,
        ...typography,
        isPlayerChromeHidden,
        hideTranslationSubtitle,
        visualizerTunings,
        onMonetTuningChange,
        ...assets,
        // Only these two read a click on a lyric line; the rest have no line hit-testing at all.
        onLyricLineSeek: ['monet', 'pendolo'].includes(visualizerMode) ? onLyricLineSeek : undefined,
        onBack,
        isPanelOpen,
        alwaysShowBackButton: alwaysShowPlayerBackButton || isPanelOpen,
        onPlayerPanelGuideHotspotChange,
    };
};
