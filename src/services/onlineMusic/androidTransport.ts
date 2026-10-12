import { isAndroidCapacitor } from '../../utils/runtimePlatform';

// The Android emulator owns its own loopback interface.  A desktop API bound to
// localhost is reachable from the emulator through 10.0.2.2 instead.
export const resolveAndroidTransportBase = (value: string | null | undefined): string => {
    const normalized = String(value || '').trim().replace(/\/$/u, '');
    if (!normalized || !isAndroidCapacitor) return normalized;

    try {
        const url = new URL(normalized, window.location.origin);
        if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
            url.hostname = '10.0.2.2';
            return url.toString().replace(/\/$/u, '');
        }
        return normalized;
    } catch {
        return normalized;
    }
};
