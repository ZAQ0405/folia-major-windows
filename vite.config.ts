import path from 'path';
import { fileURLToPath } from 'url';
import { type ConfigEnv, type UserConfig, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { commandPinyinPlugin } from './dev/pinyin/commandPinyinPlugin.mjs';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'child_process';
import fs from 'fs';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getAndroidApiBase = (envName: string): string => {
  const value = process.env[envName]?.trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${envName} must be an absolute HTTPS URL for Android release builds`);
  }
  if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error(`${envName} cannot point to localhost or use non-HTTPS in Android release builds`);
  }
  return url.toString().replace(/\/$/u, '');
};

const LYRIC_PROXY_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers': [
    'X-CSRF-Token',
    'X-Requested-With',
    'Accept',
    'Accept-Version',
    'Content-Length',
    'Content-MD5',
    'Content-Type',
    'Date',
    'X-Api-Version',
    'KG-Rec',
    'KG-RC',
    'KG-CLIENTTIMEMS',
    'mid',
    'x-router',
  ].join(', '),
};

const LYRIC_PROXY_IGNORED_FORWARD_HEADERS = ['host', 'connection', 'content-length', 'origin', 'referer'];

function isAllowedLyricProxyHost(hostname: string): boolean {
  return hostname === 'qq.com' || hostname.endsWith('.qq.com') ||
    hostname === 'y.gtimg.cn' ||
    hostname === 'music.126.net' || hostname.endsWith('.music.126.net') ||
    hostname === 'kugou.com' || hostname.endsWith('.kugou.com') ||
    hostname === 'kgimg.com' || hostname.endsWith('.kgimg.com') ||
    hostname === 'kuwo.cn' || hostname.endsWith('.kuwo.cn') ||
    hostname === 'kuwo.com' || hostname.endsWith('.kuwo.com') ||
    hostname === 'amll-ttml-db.stevexmh.net';
}

function isAmllDbHost(hostname: string): boolean {
  return hostname === 'amll-ttml-db.stevexmh.net';
}

function setLyricProxyCorsHeaders(res: import('http').ServerResponse): void {
  Object.entries(LYRIC_PROXY_CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function sendLyricProxyJson(res: import('http').ServerResponse, statusCode: number, body: unknown): void {
  setLyricProxyCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readDevRequestBody(req: import('http').IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

const JS_SOURCE_PROXY_IGNORED_HEADERS = new Set([
  'host', 'connection', 'content-length',
]);

function isPrivateJsSourceAddress(address: string): boolean {
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] === 0;
}

async function assertDevJsSourceTarget(targetUrl: URL): Promise<void> {
  if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Only HTTP(S) targets are supported');
  if (targetUrl.username || targetUrl.password) throw new Error('Target credentials are not allowed');
  const hostname = targetUrl.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname === 'metadata.google.internal') {
    throw new Error('Private target is not allowed');
  }
  if (net.isIP(hostname) && isPrivateJsSourceAddress(hostname)) throw new Error('Private target is not allowed');
  if (!net.isIP(hostname)) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some(record => isPrivateJsSourceAddress(record.address))) throw new Error('Target resolves to a private address');
  }
}

function devJsSourceProxyPlugin() {
  return {
    name: 'folia-dev-js-source-proxy',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        if (requestUrl.pathname !== '/api/js-source-request') {
          next();
          return;
        }
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Only POST is supported' }));
          return;
        }
        const targetUrlString = requestUrl.searchParams.get('url');
        if (!targetUrlString) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing url parameter' }));
          return;
        }
        try {
          const targetUrl = new URL(targetUrlString);
          await assertDevJsSourceTarget(targetUrl);
          const raw = Buffer.from(await readDevRequestBody(req)).toString('utf8');
          const payload = raw ? JSON.parse(raw) as { method?: string; headers?: Record<string, unknown>; body?: string } : {};
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(payload.headers ?? {})) {
            if (typeof value === 'string' && !JS_SOURCE_PROXY_IGNORED_HEADERS.has(key.toLowerCase())) headers[key] = value;
          }
          const method = typeof payload.method === 'string' ? payload.method.toUpperCase() : 'GET';
          if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Unsupported method');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20_000);
          try {
            const response = await fetch(targetUrl.toString(), {
              method,
              headers,
              body: ['GET', 'HEAD'].includes(method) ? undefined : payload.body,
              signal: controller.signal,
            });
            res.setHeader('Access-Control-Allow-Origin', '*');
            const contentType = response.headers.get('content-type');
            if (contentType) res.setHeader('Content-Type', contentType);
            res.statusCode = response.status;
            res.end(Buffer.from(await response.arrayBuffer()));
          } finally {
            clearTimeout(timeout);
          }
        } catch (error) {
          console.error('Vite JS source proxy request failed:', error);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'JS source request failed', details: String(error) }));
        }
      });
    },
  };
}

function devLyricProxyPlugin() {
  return {
    name: 'folia-dev-lyric-proxy',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        if (requestUrl.pathname !== '/api/lyric-proxy') {
          next();
          return;
        }

        if (req.method === 'OPTIONS') {
          setLyricProxyCorsHeaders(res);
          res.statusCode = 200;
          res.end();
          return;
        }

        const targetUrlStr = requestUrl.searchParams.get('url');
        if (!targetUrlStr) {
          sendLyricProxyJson(res, 400, { error: 'Missing url parameter' });
          return;
        }

        try {
          const targetUrl = new URL(targetUrlStr);
          if (!isAllowedLyricProxyHost(targetUrl.hostname)) {
            sendLyricProxyJson(res, 403, { error: 'Forbidden: Domain not allowed' });
            return;
          }

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (!LYRIC_PROXY_IGNORED_FORWARD_HEADERS.includes(key.toLowerCase()) && value) {
              headers.set(key, Array.isArray(value) ? value.join(', ') : value);
            }
          }

          const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '');
          const response = await fetch(targetUrl.toString(), {
            method: req.method,
            headers,
            body: hasBody ? await readDevRequestBody(req) : undefined,
          });

          setLyricProxyCorsHeaders(res);
          if (isAmllDbHost(targetUrl.hostname) && response.status === 404) {
            res.statusCode = 204;
            res.end();
            return;
          }

          res.statusCode = response.status;
          res.statusMessage = response.statusText;
          const contentType = response.headers.get('content-type');
          if (contentType) {
            res.setHeader('Content-Type', contentType);
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          res.end(buffer);
        } catch (error) {
          console.error('Vite lyric proxy request failed:', error);
          sendLyricProxyJson(res, 500, { error: 'Proxy request failed', details: String(error) });
        }
      });
    },
  };
}

function devAndroidAudioProxyPlugin() {
  return {
    name: 'folia-dev-android-audio-proxy',
    apply: 'serve' as const,
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? '/', 'http://localhost');
        if (requestUrl.pathname !== '/api/android-audio-stream') {
          next();
          return;
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.statusCode = 405;
          res.setHeader('Allow', 'GET, HEAD');
          res.end();
          return;
        }

        const rawTarget = requestUrl.searchParams.get('url');
        if (!rawTarget) {
          res.statusCode = 400;
          res.end('Missing audio URL');
          return;
        }

        const isAllowedAudioUrl = (value: URL) => {
          const hostname = value.hostname.toLowerCase();
          const isNeteaseCdn = hostname === 'music.126.net' || hostname.endsWith('.music.126.net');
          const isQqMusicCdn = /^(?:[a-z0-9-]+\.)*qqmusic\.qq\.com$/u.test(hostname)
            || hostname === 'aqqmusic.tc.qq.com';
          return ['http:', 'https:'].includes(value.protocol)
            && !value.username && !value.password
            && (isNeteaseCdn || isQqMusicCdn);
        };

        try {
          let target = new URL(rawTarget);
          if (!isAllowedAudioUrl(target)) {
            res.statusCode = 403;
            res.end('Audio host is not allowed');
            return;
          }

          const headers = new Headers();
          const range = req.headers.range;
          if (range) headers.set('Range', range);
          const ifRange = req.headers['if-range'];
          if (ifRange) headers.set('If-Range', Array.isArray(ifRange) ? ifRange.join(', ') : ifRange);

          let upstream: Response | null = null;
          for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
            upstream = await fetch(target, { method: req.method, headers, redirect: 'manual' });
            if (![301, 302, 303, 307, 308].includes(upstream.status)) break;
            const location = upstream.headers.get('location');
            if (!location || redirectCount === 4) throw new Error('Audio CDN redirect limit exceeded');
            target = new URL(location, target);
            if (!isAllowedAudioUrl(target)) throw new Error('Audio CDN redirected to a disallowed host');
          }

          if (!upstream) throw new Error('Audio CDN returned no response');
          res.statusCode = upstream.status;
          for (const key of ['accept-ranges', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
            const value = upstream.headers.get(key);
            if (value) res.setHeader(key, value);
          }
          res.setHeader('Access-Control-Allow-Origin', '*');

          if (req.method === 'HEAD' || !upstream.body) {
            res.end();
            return;
          }

          Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream<Uint8Array>)
            .on('error', (error) => res.destroy(error))
            .pipe(res);
        } catch (error) {
          console.error('Vite Android audio proxy request failed:', error);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end('Audio CDN request failed');
          } else {
            res.destroy(error instanceof Error ? error : undefined);
          }
        }
      });
    },
  };
}

export default async function viteConfig(_config: ConfigEnv): Promise<UserConfig> {
  const isCapacitorBuild = process.env.FOLIA_BUILD_TARGET === 'capacitor';
  let commitHash = '';
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    commitHash = process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7);
  } else {
    try {
      commitHash = execSync('git rev-parse --short HEAD').toString().trim();
    } catch (e) {
      console.warn('Could not get commit hash:', e);
      commitHash = 'unknown, probably dev version';
    }
  }

  let gitBranch = '';
  if (process.env.VERCEL_GIT_COMMIT_REF) {
    gitBranch = process.env.VERCEL_GIT_COMMIT_REF;
  } else {
    try {
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    } catch (e) {
      console.warn('Could not get git branch:', e);
      gitBranch = 'unknown';
    }
  }

  let commitSuffix = '';
  const canResolveCommitName = /^[0-9a-f]{7,40}$/i.test(commitHash) && !/^0+$/.test(commitHash);
  if (canResolveCommitName) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`https://namoe.izuna.top/api/namoe?hash=${commitHash}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { name?: string };
        if (data?.name) {
          commitSuffix = `/${data.name}`;
        }
      }
    } catch (e) {
      // Ignore errors during fetch to prevent build failure
    }
  }
  if (process.env.REQUIRE_COMMIT_NAME === 'true' && canResolveCommitName && !commitSuffix) {
    throw new Error(`Could not resolve the commit name for ${commitHash}`);
  }

  const appVersionLabel = process.env.APP_VERSION_LABEL?.trim() || 'Realeco';
  const appReleaseChannel = process.env.APP_RELEASE_CHANNEL?.trim().toLowerCase() || 'realeco';
  const dockerStackVersion = process.env.DOCKER_STACK_VERSION?.trim() || '';

  return {
    base: process.env.ELECTRON === 'true' || isCapacitorBuild ? './' : '/',
    // `.env.local` is a developer machine's configuration, not APK configuration.
    // Only explicitly supplied HTTPS Android service URLs may enter a Capacitor build.
    envPrefix: isCapacitorBuild ? ['VITE_AI_PROVIDER'] : 'VITE_',
    worker: {
      format: 'es'
    },
    build: {
      outDir: isCapacitorBuild ? 'dist-android' : 'dist',
      rollupOptions: {
        input: {
          index: isCapacitorBuild ? 'android.html' : 'index.html',
          ...(!isCapacitorBuild ? {
            stageClient: 'stage-client.html',
            modExport: 'mod-export.html',
          } : {}),
        },
        output: {
          // three.js is a large dependency used only by the diorama 3D visualizer. Split it into its
          // own chunk so it doesn't bloat the main bundle past the PWA precache size limit (each file
          // must stay under workbox.maximumFileSizeToCacheInBytes to be cached for offline use).
          manualChunks(id) {
            return id.includes('/node_modules/three/') ? 'three' : undefined;
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      watch: {
        // Build output and model weights are not sources, and watching them breaks packaging: the
        // watcher opens a handle on every directory it finds, and electron-builder packages by
        // extracting Electron into release/win-unpacked.tmp and renaming it to release/win-unpacked.
        // On Windows that rename fails with EPERM while anything holds the directory - so a dev
        // server left running in another terminal kills every `npm run build:electron`.
        ignored: ['**/release/**', '**/models/**'],
      },
    },
    plugins: [
      devLyricProxyPlugin(),
      devJsSourceProxyPlugin(),
      devAndroidAudioProxyPlugin(),
      commandPinyinPlugin(),
      react(),
      ...(isCapacitorBuild ? [] : [VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        devOptions: {
          enabled: true
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5000000,
          // Docker serves this file dynamically; it must never be pinned in the PWA precache.
          globIgnores: ['**/runtime-config.js'],
          // API navigations must reach the deployment platform instead of the SPA shell.
          navigateFallbackDenylist: [/^\/api(?:\/|$)/]
        },
        manifest: {
          name: 'Folia Music',
          short_name: 'Folia',
          description: 'A beautiful AI-themed music player',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          icons: [
            {
              src: 'icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })])
    ],
    define: {
      '__COMMIT_HASH__': JSON.stringify(commitHash + commitSuffix),
      '__GIT_BRANCH__': JSON.stringify(gitBranch),
      '__APP_VERSION__': JSON.stringify(JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')).version),
      '__APP_VERSION_LABEL__': JSON.stringify(appVersionLabel),
      '__APP_RELEASE_CHANNEL__': JSON.stringify(appReleaseChannel),
      '__DOCKER_STACK_VERSION__': JSON.stringify(dockerStackVersion),
      ...(isCapacitorBuild ? {
        'import.meta.env.VITE_NETEASE_API_BASE': JSON.stringify(getAndroidApiBase('FOLIA_ANDROID_NETEASE_API_BASE')),
        'import.meta.env.VITE_QQ_API_BASE': JSON.stringify(getAndroidApiBase('FOLIA_ANDROID_QQ_API_BASE')),
        'import.meta.env.VITE_KUGOU_API_BASE': JSON.stringify(getAndroidApiBase('FOLIA_ANDROID_KUGOU_API_BASE')),
        'process.env.VITE_NETEASE_API_BASE': 'undefined',
        'process.env.VITE_QQ_API_BASE': 'undefined',
        'process.env.VITE_KUGOU_API_BASE': 'undefined',
      } : {})
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      }
    }
  };
}
