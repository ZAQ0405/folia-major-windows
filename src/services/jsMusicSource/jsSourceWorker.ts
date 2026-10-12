import type { JsMusicSourceDescriptor, JsMusicSourceRecord } from '../../types/jsMusicSource';

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

function getJsSourceRequestUrl(targetUrl: string): string {
    if (typeof window === 'undefined') return targetUrl;
    try {
        const parsed = new URL(targetUrl, window.location.href);
        if (parsed.origin === window.location.origin) return parsed.toString();
        return `${JS_SOURCE_PROXY_PATH}?url=${encodeURIComponent(parsed.toString())}`;
    } catch {
        return targetUrl;
    }
}

const WORKER_SOURCE = `
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
const utils = {
  crypto: {
    md5,
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
                const requestUrl = getJsSourceRequestUrl(url);
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
