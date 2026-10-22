import { Buffer } from 'buffer';
import handleQqRequest from '@yakult-green-tea/qq-music-api/serverless';
import { createMqttListenOver } from '@yakult-green-tea/qq-music-api/mqtt';
import type { MqttConnect, QqQrRelay, QrEvent } from '@yakult-green-tea/qq-music-api/serverless';
import { isAndroidCapacitor } from '../../utils/runtimePlatform';
import { readProviderSessionValue, writeProviderSessionValue } from './providerStorage';

type QrEntry = {
    image: string;
    events: QrEvent[];
    waiters: Set<() => void>;
    listener: ReturnType<ReturnType<typeof createMqttListenOver>> | null;
};

const QR_WAIT_CAP_MS = 20_000;
const qrEntries = new Map<string, QrEntry>();

// The package's serverless build intentionally avoids node:* imports, but its MQTT codec expects
// the standard Buffer surface. The Buffer polyfill is installed only in this lazy Android chunk.
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

const getInstallSecret = (): string => {
    const stored = readProviderSessionValue('qq', 'android_api_secret');
    if (stored) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    writeProviderSessionValue('qq', 'android_api_secret', secret);
    return secret;
};

const connectBrowserWebSocket: MqttConnect = (url, protocol, handlers) => new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocol);
    socket.binaryType = 'arraybuffer';
    const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('QQ login socket timed out'));
    }, 20_000);
    socket.addEventListener('open', () => {
        clearTimeout(timeout);
        socket.addEventListener('message', event => handlers.message(event.data));
        socket.addEventListener('error', () => handlers.error(new Error('QQ login socket failed')));
        socket.addEventListener('close', () => handlers.close());
        resolve({
            send: data => {
                const frame = new Uint8Array(data.byteLength);
                frame.set(data);
                socket.send(frame);
            },
            close: () => socket.close(),
        });
    }, { once: true });
    socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('QQ login socket handshake failed'));
    }, { once: true });
});

const listenForQqQr = createMqttListenOver(connectBrowserWebSocket);

const notify = (entry: QrEntry, event: QrEvent): void => {
    entry.events.push(event);
    entry.waiters.forEach(wake => wake());
    entry.waiters.clear();
};

const androidQrRelay: QqQrRelay = {
    async open(qrcodeId, image, ttlMs) {
        const entry: QrEntry = { image, events: [], waiters: new Set(), listener: null };
        qrEntries.set(qrcodeId, entry);
        const listener = listenForQqQr(qrcodeId, event => notify(entry, event), Math.max(0, ttlMs));
        entry.listener = listener;
        void listener.done.catch(() => undefined).finally(() => {
            if (qrEntries.get(qrcodeId) === entry) {
                notify(entry, { type: 'timeout', payload: null });
            }
        });
        try {
            // Do not show the QR until MQTT has subscribed; QQ does not retain early scan events.
            await listener.ready;
        } catch (error) {
            qrEntries.delete(qrcodeId);
            listener.close();
            throw error;
        }
    },
    async image(qrcodeId) {
        const entry = qrEntries.get(qrcodeId);
        if (!entry) throw new Error('QQ login QR has expired');
        return entry.image;
    },
    async poll(qrcodeId, budgetMs) {
        const entry = qrEntries.get(qrcodeId);
        if (!entry) return [{ type: 'timeout', payload: null }];
        if (!entry.events.length) {
            await new Promise<void>(resolve => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    entry.waiters.delete(finish);
                    resolve();
                };
                const timer = setTimeout(finish, Math.max(0, Math.min(QR_WAIT_CAP_MS, budgetMs)));
                entry.waiters.add(finish);
            });
        }
        return entry.events.splice(0);
    },
    async close(qrcodeId) {
        const entry = qrEntries.get(qrcodeId);
        if (!entry) return;
        qrEntries.delete(qrcodeId);
        entry.waiters.forEach(wake => wake());
        entry.waiters.clear();
        entry.listener?.close();
        await entry.listener?.done.catch(() => undefined);
    },
};

/** Runs QQMusicApi's edge-compatible serverless handler without a local or remote API server. */
export const handleAndroidQqApiRequest = async (request: Request): Promise<Response> => {
    return handleQqRequest(request, { QQ_SESSION_SECRET: getInstallSecret() }, { qqRelay: androidQrRelay });
};

/** Android-only transport guard; the desktop build keeps using its existing embedded Node server. */
export const requestAndroidQqApi = async (request: Request): Promise<Response> => {
    if (!isAndroidCapacitor) throw new Error('Embedded QQ API is only available in the Android app');
    return handleAndroidQqApiRequest(request);
};
