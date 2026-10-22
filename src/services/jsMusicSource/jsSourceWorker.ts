import type { JsMusicSourceDescriptor, JsMusicSourceRecord } from '../../types/jsMusicSource';
import { isAndroidCapacitor } from '../../utils/runtimePlatform';

// src/services/jsMusicSource/jsSourceWorker.ts

type WorkerResponse = {
    type: 'ready' | 'error' | 'event' | 'request' | 'actionResult';
    id?: number;
    requestId?: number;
    event?: string;
    payload?: unknown;
    url?: string;
    options?: Record<string, unknown>;
    ok?: boolean;
    result?: unknown;
    message?: string;
};

type RequestResponse = {
    statusCode: number;
    headers: Record<string, string>;
    body: unknown;
    rawBody?: string;
    bodyBase64?: string;
};

const JS_SOURCE_PROXY_PATH = '/api/js-source-request';

export function resolveJsSourceRequestUrl(
    targetUrl: string,
    useNativeHttp = isAndroidCapacitor,
    currentUrl = typeof window === 'undefined' ? undefined : window.location.href,
): string {
    // Capacitor's Android WebView patches window.fetch to the native HTTP stack.
    // Keep the real URL so installed APKs do not depend on the dev/serverless proxy.
    if (useNativeHttp) return targetUrl;
    if (!currentUrl) return targetUrl;
    try {
        const parsed = new URL(targetUrl, currentUrl);
        if (parsed.origin === new URL(currentUrl).origin) return parsed.toString();
        return `${JS_SOURCE_PROXY_PATH}?url=${encodeURIComponent(parsed.toString())}`;
    } catch {
        return targetUrl;
    }
}

export const WORKER_SOURCE = `
const handlers = new Map();
const pendingRequests = new Map();
let requestId = 0;

function md5(input) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  const bytes = new TextEncoder().encode(text);
  const words = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words[i >> 2] = (bytes[i] || 0) | ((bytes[i + 1] || 0) << 8) | ((bytes[i + 2] || 0) << 16) | ((bytes[i + 3] || 0) << 24);
  }
  const bitLength = bytes.length * 8;
  words[bytes.length >> 2] = (words[bytes.length >> 2] || 0) | (0x80 << ((bytes.length % 4) * 8));
  words[((bytes.length + 8) >> 6 << 4) + 14] = bitLength;
  words[((bytes.length + 8) >> 6 << 4) + 15] = 0;
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;
  const leftRotate = (value, amount) => (value << amount) | (value >>> (32 - amount));
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000));
  const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  for (let offset = 0; offset < words.length; offset += 16) {
    let aa = a, bb = b, cc = c, dd = d;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (bb & cc) | (~bb & dd); g = i; }
      else if (i < 32) { f = (dd & bb) | (~dd & cc); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = bb ^ cc ^ dd; g = (3 * i + 5) % 16; }
      else { f = cc ^ (bb | ~dd); g = (7 * i) % 16; }
      const round = i >> 4;
      const s = shifts[round * 4 + (i % 4)];
      const next = (aa + f + k[i] + (words[offset + g] || 0)) | 0;
      aa = dd; dd = cc; cc = bb; bb = (bb + leftRotate(next, s)) | 0;
    }
    a = (a + aa) | 0; b = (b + bb) | 0; c = (c + cc) | 0; d = (d + dd) | 0;
  }
  return [a, b, c, d].map(value => Array.from({ length: 4 }, (_, i) => ((value >> (i * 8)) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

const bytesFrom = (value, encoding = 'utf8') => {
  if (typeof value === 'string') {
    if (encoding === 'hex') {
      const bytes = new Uint8Array(Math.floor(value.length / 2));
      for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16) || 0;
      return bytes;
    }
    if (encoding === 'base64') {
      const binary = atob(value);
      return Uint8Array.from(binary, char => char.charCodeAt(0));
    }
    return new TextEncoder().encode(value);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value || []);
};
const stringFrom = (value, encoding = 'utf8') => {
  const bytes = bytesFrom(value);
  if (encoding === 'hex') return hexFrom(bytes);
  if (encoding === 'base64') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return new TextDecoder().decode(bytes);
};
const hexFrom = value => Array.from(bytesFrom(value), byte => byte.toString(16).padStart(2, '0')).join('');
const aesSbox = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16,
];
const aesEncrypt = (value, mode, key, iv) => {
  const keyBytes = bytesFrom(key);
  if (![16, 24, 32].includes(keyBytes.length)) throw new Error('AES key must be 16, 24, or 32 bytes');
  const rounds = keyBytes.length / 4 + 6;
  const expanded = Array.from(keyBytes);
  const rcon = [0,1,2,4,8,16,32,64,128,27,54];
  for (let i = keyBytes.length; i < 16 * (rounds + 1); i += 4) {
    let t = expanded.slice(i - 4, i);
    if (i % keyBytes.length === 0) {
      t = [aesSbox[t[1]] ^ rcon[i / keyBytes.length], aesSbox[t[2]], aesSbox[t[3]], aesSbox[t[0]]];
    } else if (keyBytes.length === 32 && i % keyBytes.length === 16) t = t.map(byte => aesSbox[byte]);
    for (let j = 0; j < 4; j++) expanded[i + j] = expanded[i + j - keyBytes.length] ^ t[j];
  }
  const input = bytesFrom(value);
  const padding = 16 - (input.length % 16);
  const padded = new Uint8Array(input.length + padding);
  padded.set(input); padded.fill(padding, input.length);
  const isCbc = String(mode).toLowerCase().endsWith('cbc');
  let previous = isCbc ? bytesFrom(iv) : new Uint8Array(16);
  if (isCbc && previous.length !== 16) throw new Error('AES-CBC requires a 16-byte IV');
  const output = new Uint8Array(padded.length);
  const xtime = value => ((value << 1) ^ ((value & 0x80) ? 0x11b : 0)) & 0xff;
  for (let offset = 0; offset < padded.length; offset += 16) {
    const state = Array.from(padded.slice(offset, offset + 16));
    if (isCbc) for (let i = 0; i < 16; i++) state[i] ^= previous[i];
    const addKey = round => { for (let i = 0; i < 16; i++) state[i] ^= expanded[round * 16 + i]; };
    addKey(0);
    for (let round = 1; round <= rounds; round++) {
      for (let i = 0; i < 16; i++) state[i] = aesSbox[state[i]];
      const shifted = state.slice();
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) state[col * 4 + row] = shifted[((col + row) % 4) * 4 + row];
      if (round < rounds) {
        for (let col = 0; col < 4; col++) {
          const i = col * 4, a = state[i], b = state[i + 1], c = state[i + 2], d = state[i + 3], all = a ^ b ^ c ^ d;
          state[i] ^= all ^ xtime(a ^ b); state[i + 1] ^= all ^ xtime(b ^ c);
          state[i + 2] ^= all ^ xtime(c ^ d); state[i + 3] ^= all ^ xtime(d ^ a);
        }
      }
      addKey(round);
    }
    output.set(state, offset);
    if (isCbc) previous = state;
  }
  return output;
};
const utils = {
  crypto: {
    md5,
    aesEncrypt,
    hex: hexFrom,
    randomBytes: size => {
      const bytes = new Uint8Array(Number(size) || 0);
      crypto.getRandomValues(bytes);
      return bytes;
    },
  },
  buffer: { from: bytesFrom, stringToBuf: bytesFrom, bufToString: stringFrom, bufToHex: hexFrom },
};

// A number of released LX sources use the Node-compatible Buffer global directly even though
// the public contract documents it through lx.utils.buffer. Keep this small compatibility layer
// inside the worker; it never exposes Node APIs or the renderer to source code.
const makeBuffer = value => {
  const bytes = new Uint8Array(value || []);
  bytes.toString = encoding => stringFrom(bytes, encoding || 'utf8');
  return bytes;
};
const BufferCompat = {
  from: (value, encoding) => makeBuffer(bytesFrom(value, encoding || 'utf8')),
  alloc: size => makeBuffer(new Uint8Array(Number(size) || 0)),
  concat: list => makeBuffer(list.flatMap(item => Array.from(item || []))),
  isBuffer: value => value instanceof Uint8Array,
};
globalThis.Buffer = BufferCompat;
// LX sources are authored for a hidden browser window. A dedicated Worker has no window, so
// expose the same global alias without exposing Node's process/require APIs.
globalThis.window = globalThis;
globalThis.self = globalThis;

const lx = {
  EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert', log: 'log' },
  env: 'web', version: 'folia', currentScriptInfo: { version: '' }, utils,
  request(url, options, callback) {
    const id = ++requestId;
    pendingRequests.set(id, callback);
    postMessage({ type: 'request', id, url: String(url), options: options || { method: 'GET' } });
    return () => pendingRequests.delete(id);
  },
  on(event, handler) {
    const list = handlers.get(event) || [];
    list.push(handler);
    handlers.set(event, list);
  },
  send(event, payload) { postMessage({ type: 'event', event, payload }); return Promise.resolve(); },
};

globalThis.lx = lx;

const runHandlers = async (event, payload) => {
  const list = handlers.get(event) || [];
  let result;
  for (const handler of list) result = await handler(payload);
  return result;
};

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    lx.currentScriptInfo = {
      name: data.name || '',
      description: data.description || '',
      version: data.version || '',
      author: data.author || '',
      homepage: data.homepage || '',
      rawScript: data.code || '',
    };
    try {
      new Function('globalThis', data.code)(globalThis);
      postMessage({ type: 'ready' });
    } catch (error) {
      postMessage({ type: 'error', message: error?.stack || String(error) });
    }
    return;
  }
  if (data.type === 'requestResult') {
    const callback = pendingRequests.get(data.id);
    if (!callback) return;
    pendingRequests.delete(data.id);
    const response = data.response;
    if (response?.bodyBase64) response.body = BufferCompat.from(response.bodyBase64, 'base64');
    if (response?.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
      const responseBody = response.body;
      if (!responseBody.split) {
        responseBody.split = (separator) => separator === undefined
          ? [response.rawBody ?? String(response.body)]
          : (response.rawBody ?? String(response.body)).split(separator);
      }
    }
    callback(data.error ? new Error(data.error) : null, response, response?.body);
    return;
  }
  if (data.type === 'action') {
    try {
      const result = await runHandlers('request', data.payload);
      postMessage({ type: 'actionResult', requestId: data.requestId, ok: true, result });
    } catch (error) {
      postMessage({ type: 'actionResult', requestId: data.requestId, ok: false, message: error?.message || String(error) });
    }
  }
};
`;

const toError = (message: unknown): Error => new Error(typeof message === 'string' ? message : String(message));

export class JsSourceWorkerRuntime {
    private worker: Worker | null = null;
    private objectUrl: string | null = null;
    private nextActionId = 0;
    private readonly actionWaiters = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
    private readonly requestWaiters = new Map<number, { resolve: (value: RequestResponse) => void; reject: (error: Error) => void }>();
    private initPromise: Promise<Record<string, JsMusicSourceDescriptor>> | null = null;
    private descriptors: Record<string, JsMusicSourceDescriptor> = {};

    constructor(private readonly record: JsMusicSourceRecord) {}

    async ready(): Promise<Record<string, JsMusicSourceDescriptor>> {
        if (this.initPromise) return this.initPromise;
        this.initPromise = new Promise((resolve, reject) => {
            if (typeof Worker === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
                reject(new Error('JS source runtime is not available in this environment'));
                return;
            }
            this.objectUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'application/javascript' }));
            this.worker = new Worker(this.objectUrl);
            const timeout = window.setTimeout(() => reject(new Error('JS source initialization timed out')), 12_000);
            this.worker.onmessage = event => {
                const message = event.data as WorkerResponse;
                if (message.type === 'ready') return;
                if (message.type === 'error') {
                    window.clearTimeout(timeout);
                    reject(toError(message.message));
                    return;
                }
                if (message.type === 'event') {
                    if (message.event === 'inited') {
                        window.clearTimeout(timeout);
                        this.descriptors = this.normalizeDescriptors(message.payload);
                        resolve(this.descriptors);
                    }
                    return;
                }
                this.handleMessage(message);
            };
            this.worker.onerror = event => {
                window.clearTimeout(timeout);
                reject(new Error(event.message || 'JS source worker failed'));
            };
            this.worker.postMessage({
                type: 'init',
                code: this.record.code,
                name: this.record.name,
                description: this.record.description,
                version: this.record.version,
                author: this.record.author,
                homepage: this.record.homepage,
            });
        });
        return this.initPromise;
    }

    async requestAction(payload: unknown): Promise<unknown> {
        await this.ready();
        if (!this.worker) throw new Error('JS source worker is unavailable');
        const requestId = ++this.nextActionId;
        return new Promise((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                this.actionWaiters.delete(requestId);
                reject(new Error('JS source request timed out'));
            }, 15_000);
            this.actionWaiters.set(requestId, {
                resolve: value => { window.clearTimeout(timeout); resolve(value); },
                reject: error => { window.clearTimeout(timeout); reject(error); },
            });
            this.worker!.postMessage({ type: 'action', requestId, payload });
        });
    }

    async requestMusicUrl(payload: unknown): Promise<unknown> {
        return this.requestAction(payload);
    }

    stop(): void {
        this.worker?.terminate();
        this.worker = null;
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
        this.initPromise = null;
        this.actionWaiters.clear();
        this.requestWaiters.clear();
    }

    getDescriptors(): Record<string, JsMusicSourceDescriptor> { return this.descriptors; }

    private normalizeDescriptors(payload: unknown): Record<string, JsMusicSourceDescriptor> {
        if (!payload || typeof payload !== 'object') return {};
        const sources = (payload as { sources?: unknown }).sources;
        if (!sources || typeof sources !== 'object' || Array.isArray(sources)) return {};
        return Object.fromEntries(Object.entries(sources).map(([key, value]) => {
            const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
            return [key, {
                name: typeof item.name === 'string' ? item.name : key,
                type: typeof item.type === 'string' ? item.type : 'music',
                actions: Array.isArray(item.actions) ? item.actions.filter(value => typeof value === 'string') : [],
                qualitys: Array.isArray(item.qualitys) ? item.qualitys.filter(value => typeof value === 'string') : [],
            }];
        }));
    }

    private handleMessage(message: WorkerResponse): void {
        if (message.type === 'request' && message.id !== undefined) {
            void this.handleRequest(message.id, message.url || '', message.options || {});
        } else if (message.type === 'actionResult' && message.requestId !== undefined) {
            const waiter = this.actionWaiters.get(message.requestId);
            if (!waiter) return;
            this.actionWaiters.delete(message.requestId);
            if (message.ok) waiter.resolve(message.result);
            else waiter.reject(toError(message.message));
        }
    }

    private async handleRequest(id: number, url: string, options: Record<string, unknown>): Promise<void> {
        const controller = new AbortController();
        const timeoutMs = typeof options.timeout === 'number' && options.timeout > 0 ? options.timeout : 15_000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const method = typeof options.method === 'string' ? options.method : 'GET';
            const requestHeaders = options.headers && typeof options.headers === 'object'
                ? options.headers as Record<string, string>
                : {};
            const requestBody = typeof options.body === 'string'
                ? options.body
                : options.body && typeof options.body === 'object'
                    ? JSON.stringify(options.body)
                    : options.form && typeof options.form === 'object'
                        ? new URLSearchParams(options.form as Record<string, string>).toString()
                        : undefined;
            const electronBridge = typeof window !== 'undefined' ? window.electron?.fetchJsSourceRequest : undefined;
            let statusCode: number;
            let responseHeaders: Record<string, string>;
            let text: string;
            let bodyBase64: string | undefined;
            const wantsBinary = options.responseType === 'arraybuffer' || options.responseType === 'buffer';
            if (electronBridge) {
                const response = await electronBridge(url, {
                    method,
                    headers: requestHeaders,
                    body: requestBody,
                    timeout: timeoutMs,
                    responseType: wantsBinary ? 'arraybuffer' : undefined,
                });
                statusCode = response.status;
                responseHeaders = response.headers;
                text = wantsBinary ? '' : response.bodyText;
                bodyBase64 = wantsBinary ? response.bodyBase64 : undefined;
            } else {
                const requestUrl = resolveJsSourceRequestUrl(url);
                const isProxied = requestUrl !== url;
                const response = await fetch(requestUrl, {
                    method: isProxied ? 'POST' : method,
                    headers: isProxied
                        ? { 'Content-Type': 'application/json' }
                        : requestHeaders,
                    body: isProxied
                        ? JSON.stringify({ method, headers: requestHeaders, body: requestBody })
                        : requestBody,
                    signal: controller.signal,
                });
                statusCode = response.status;
                if (wantsBinary) {
                    const bytes = new Uint8Array(await response.arrayBuffer());
                    let binary = '';
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    bodyBase64 = btoa(binary);
                    text = '';
                } else {
                    text = await response.text();
                }
                responseHeaders = {};
                response.headers.forEach((value, key) => { responseHeaders[key] = value; });
            }
            let parsedBody: unknown = text;
            try { parsedBody = text ? JSON.parse(text) : ''; } catch { /* keep text */ }
            this.worker?.postMessage({
                type: 'requestResult',
                id,
                response: { statusCode, headers: responseHeaders, body: parsedBody, rawBody: text, bodyBase64 },
            });
        } catch (error) {
            this.worker?.postMessage({ type: 'requestResult', id, error: error instanceof Error ? error.message : String(error) });
        } finally {
            clearTimeout(timeout);
        }
    }
}
