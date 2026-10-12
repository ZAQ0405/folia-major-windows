import { afterEach, describe, expect, it } from 'vitest';
import { getPlaybackMode, isSourcePlaybackMode, usePlaybackModeStore } from '../../src/stores/usePlaybackModeStore';

describe('manual playback mode', () => {
    afterEach(() => {
        usePlaybackModeStore.getState().setPlaybackMode('official');
    });

    it('does not infer source mode from source availability or account state', () => {
        expect(getPlaybackMode()).toBe('official');
        expect(isSourcePlaybackMode()).toBe(false);

        usePlaybackModeStore.getState().setPlaybackMode('source');

        expect(getPlaybackMode()).toBe('source');
        expect(isSourcePlaybackMode()).toBe(true);
    });
});
