import { describe, expect, it } from 'vitest';
import { resolveAndroidTransportBase } from '../../../src/platform/android/services/androidTransport';

describe('Android API base handling', () => {
    it('does not rewrite local endpoints to emulator host aliases', () => {
        expect(resolveAndroidTransportBase('http://localhost:3200/')).toBe('http://localhost:3200');
        expect(resolveAndroidTransportBase('http://127.0.0.1:3300')).toBe('http://127.0.0.1:3300');
    });

    it('normalizes configured public endpoints', () => {
        expect(resolveAndroidTransportBase('https://api.example.test/')).toBe('https://api.example.test');
        expect(resolveAndroidTransportBase('')).toBe('');
    });
});
