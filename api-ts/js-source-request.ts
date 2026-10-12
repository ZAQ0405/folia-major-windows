import dns from 'node:dns/promises';
import net from 'node:net';
import { URL } from 'node:url';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_TIMEOUT_MS = 20_000;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 10 || parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] === 0;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb');
}

async function assertPublicTarget(targetUrl: URL): Promise<void> {
  if (!['http:', 'https:'].includes(targetUrl.protocol)) throw new Error('Only HTTP(S) targets are supported');
  if (targetUrl.username || targetUrl.password) throw new Error('Target credentials are not allowed');

  const hostname = targetUrl.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname === 'metadata.google.internal') {
    throw new Error('Private target is not allowed');
  }

  if (net.isIP(hostname) === 4 && isPrivateIpv4(hostname)) throw new Error('Private target is not allowed');
  if (net.isIP(hostname) === 6 && isPrivateIpv6(hostname)) throw new Error('Private target is not allowed');
  if (net.isIP(hostname)) return;

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some(record => net.isIP(record.address) === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address))) {
    throw new Error('Target resolves to a private address');
  }
}

function requestBody(req: any): Record<string, unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Fall through to an empty request body.
    }
  }
  return {};
}

export default async function handler(req: any, res: any) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST is supported' });

  try {
    const targetUrlString = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
    if (typeof targetUrlString !== 'string' || !targetUrlString) return res.status(400).json({ error: 'Missing url parameter' });
    const targetUrl = new URL(targetUrlString);
    await assertPublicTarget(targetUrl);

    const body = requestBody(req);
    const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return res.status(400).json({ error: 'Unsupported method' });

    const forwardedHeaders: Record<string, string> = {};
    if (body.headers && typeof body.headers === 'object') {
      for (const [key, value] of Object.entries(body.headers as Record<string, unknown>)) {
        if (typeof value === 'string' && !['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
          forwardedHeaders[key] = value;
        }
      }
    }

    const rawBody = typeof body.body === 'string' ? body.body : undefined;
    if (rawBody && Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Request body is too large' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MAX_TIMEOUT_MS);
    try {
      const response = await fetch(targetUrl.toString(), {
        method,
        headers: forwardedHeaders,
        body: ['GET', 'HEAD'].includes(method) ? undefined : rawBody,
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      res.status(response.status);
      return res.send(Buffer.from(await response.arrayBuffer()));
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('JS source proxy request failed:', error);
    return res.status(502).json({ error: 'JS source request failed', details: String(error) });
  }
}
