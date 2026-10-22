// Normalize configured service URLs without rewriting them to emulator/host aliases.
// Android release endpoints are supplied explicitly at build time and must be reachable
// from the handset; development localhost URLs are never mapped into the installed app.
export const resolveAndroidTransportBase = (value: string | null | undefined): string => {
    const normalized = String(value || '').trim().replace(/\/$/u, '');
    return normalized;
};
