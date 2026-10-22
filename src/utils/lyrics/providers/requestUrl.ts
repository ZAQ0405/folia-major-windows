/**
 * Resolve a music-platform request for native and browser runtimes.
 * Capacitor's native HTTP bridge can request upstream URLs directly; a normal
 * browser must keep using the same-origin proxy to avoid CORS failures.
 */
export const resolveProviderRequestUrl = (
    targetUrl: string,
    useNativeHttp: boolean,
    proxyPath = '/api/lyric-proxy',
): string => useNativeHttp
    ? targetUrl
    : `${proxyPath}?url=${encodeURIComponent(targetUrl)}`;
