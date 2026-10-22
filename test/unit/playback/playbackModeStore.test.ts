import { describe, expect, it } from 'vitest';
import { resolveInitialPlaybackMode } from '../../../src/stores/usePlaybackModeStore';

describe('initial Android playback routing', () => {
    it('defaults Android installs to LX source playback when no mode was saved', () => {
        expect(resolveInitialPlaybackMode(null, true)).toBe('source');
    });

    it('preserves an explicit saved playback choice on Android', () => {
        expect(resolveInitialPlaybackMode('official', true)).toBe('official');
        expect(resolveInitialPlaybackMode('source', true)).toBe('source');
    });

    it('keeps the desktop default on official playback', () => {
        expect(resolveInitialPlaybackMode(null, false)).toBe('official');
    });
});
