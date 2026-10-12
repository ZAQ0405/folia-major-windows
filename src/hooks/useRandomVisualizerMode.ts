import { useEffect, useRef } from 'react';
import type { SongResult, VisualizerMode } from '../types';
import { getFoliaVisualizerEntries } from '../components/visualizer/registry';
import { useVisualizerSettingsStore } from '../stores/useVisualizerSettingsStore';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// Applies a per-song Folia mode when one is saved, or rolls a different registered lyric animation
// mode when the optional random-per-song setting is enabled.
export function useRandomVisualizerMode({
    currentSong,
    enabled,
    visualizerMode,
    setVisualizerMode,
}: {
    currentSong: SongResult | null;
    enabled: boolean;
    visualizerMode: VisualizerMode;
    setVisualizerMode: (mode: VisualizerMode, options?: { notify?: boolean }) => void;
}) {
    const observedSongIdRef = useRef<string | null>(null);
    const wasEnabledRef = useRef(enabled);
    const jizuraEnabled = useVisualizerSettingsStore(state => state.jizuraEnabled);
    const foliaSongPresets = useVisualizerSettingsStore(state => state.foliaSongPresets);

    useEffect(() => {
        const songId = currentSong ? getPlaybackSongKey(currentSong) : null;
        const wasEnabled = wasEnabledRef.current;
        wasEnabledRef.current = enabled;

        if (jizuraEnabled) {
            observedSongIdRef.current = songId;
            return;
        }

        if (songId === null) {
            return;
        }

        const savedPreset = foliaSongPresets[songId];
        if (savedPreset) {
            observedSongIdRef.current = songId;
            if (visualizerMode !== savedPreset.mode) {
                setVisualizerMode(savedPreset.mode, { notify: false });
            }
            return;
        }

        if (!enabled) {
            observedSongIdRef.current = songId;
            return;
        }

        const songChanged = observedSongIdRef.current !== songId;
        const randomModeJustEnabled = !wasEnabled;
        if (!songChanged && !randomModeJustEnabled) return;

        observedSongIdRef.current = songId;
        const candidates = getFoliaVisualizerEntries()
            .map(entry => entry.mode)
            .filter(mode => mode !== visualizerMode && mode !== 'jizura' && mode !== 'still');
        const nextMode = candidates[Math.floor(Math.random() * candidates.length)] ?? visualizerMode;
        setVisualizerMode(nextMode, { notify: false });
    }, [currentSong, enabled, foliaSongPresets, jizuraEnabled, setVisualizerMode, visualizerMode]);
}
