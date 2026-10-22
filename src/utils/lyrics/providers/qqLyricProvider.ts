// src/utils/lyrics/providers/qqLyricProvider.ts

/**
 * QQ Music lyrics provider module.
 * Provides search and download/decryption capabilities for QQ Music lyrics.
 */

import { SongResult } from '../../../types';
import { parseLyricsByFormat } from '../parserCore';
import { detectTimedLyricFormat } from '../formatDetection';
import { qrcDecrypt } from './qrcDecrypt';
import { applyDetectedChorusEffects, applyNeteaseChorusByTime } from '../chorusEffects';
import type { NeteaseChorusRange } from '../chorusEffects';
import { getOriginalCoverUrl } from '../../coverUrl';
import { isAndroidCapacitor } from '../../runtimePlatform';
import { resolveProviderRequestUrl } from './requestUrl';

const QQ_REQUEST_TIMEOUT_MS = 15_000;
const QQ_REQUEST_ATTEMPTS = 3;

type QqRequestResponse = {
  ok: boolean;
  status: number;
  bodyText: string;
};

const getElectronRequestBridge = () => {
  const bridge = typeof window !== 'undefined' ? window.electron?.fetchJsSourceRequest : undefined;
  return typeof bridge === 'function' ? bridge : undefined;
};

const waitBeforeRetry = async (attempt: number): Promise<void> => {
  // Keep retries quick for the UI while giving QQ's edge a chance to recover.
  await new Promise(resolve => setTimeout(resolve, 250 * attempt));
};

/**
 * Sends a QQ request via the Electron main-process bridge or the web proxy.
 */
async function requestQQ(method: string, module: string, param: any): Promise<any> {
  const isDesktopSearch = method === 'DoSearchForQQMusicDesktop';
  const request = {
    method,
    module,
    param,
  };
  const payload = isDesktopSearch
    ? { [module]: request }
    : {
    comm: {
      ct: 11,
      cv: "1003006",
      v: "1003006",
      os_ver: "15",
      phonetype: "24122RKC7C",
      rom: "Redmi/miro/miro:15/AE3A.240806.005/OS2.0.102.0.VOMCNXM:user/release-keys",
      tmeAppID: "qqmusiclight",
      nettype: "NETWORK_WIFI",
      udid: "0",
      uid: "0",
    },
      request,
    };

  const targetUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
  // QQ's current desktop search endpoint rejects the old POST envelope with code 2001.
  // The desktop client sends the module envelope as the URL `data` parameter instead.
  const requestUrl = isDesktopSearch
    ? `${targetUrl}?data=${encodeURIComponent(JSON.stringify(payload))}`
    : targetUrl;
  const bridge = getElectronRequestBridge();
  const url = bridge ? requestUrl : resolveProviderRequestUrl(requestUrl, isAndroidCapacitor);
  const requestBody = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json',
    'Referer': 'https://y.qq.com/',
    ...(isDesktopSearch ? { 'Cookie': 'uin=' } : { 'Cookie': 'tmeLoginType=-1;' }),
    'User-Agent': isDesktopSearch
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36'
      : 'okhttp/3.14.9',
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= QQ_REQUEST_ATTEMPTS; attempt += 1) {
    try {
      let response: QqRequestResponse;
      if (bridge) {
        const bridged = await bridge(requestUrl, {
          method: isDesktopSearch ? 'GET' : 'POST',
          headers,
          ...(isDesktopSearch ? {} : { body: requestBody }),
          timeout: QQ_REQUEST_TIMEOUT_MS,
        });
        response = {
          ok: bridged.ok,
          status: bridged.status,
          bodyText: bridged.bodyText,
        };
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), QQ_REQUEST_TIMEOUT_MS);
        try {
          const fetched = await fetch(url, {
            method: isDesktopSearch ? 'GET' : 'POST',
            credentials: 'same-origin',
            headers,
            ...(isDesktopSearch ? {} : { body: requestBody }),
            signal: controller.signal,
          });
          response = {
            ok: fetched.ok,
            status: fetched.status,
            bodyText: await fetched.text(),
          };
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!response.ok) {
        throw new Error(`QQ Music API request failed: ${response.status}`);
      }

      const data = JSON.parse(response.bodyText);
      const result = isDesktopSearch ? data[module] : data.request;
      if (data.code !== 0 || result?.code !== 0) {
        throw new Error(`QQ Music API error: code ${data.code || result?.code}`);
      }

      return result.data;
    } catch (error) {
      lastError = error;
      if (attempt < QQ_REQUEST_ATTEMPTS) {
        await waitBeforeRetry(attempt);
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('QQ Music API request failed');
}

/**
 * Encodes string to Base64 in UTF-8.
 */
function toBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
        String.fromCharCode(parseInt(p1, 16))
      )
    );
  }
}

/**
 * Detects if a lyric string is in QRC format.
 */
function detectIsQrc(content: string): boolean {
  return content.includes('(') && content.includes(')') && /\[\d+,\d+\]/.test(content);
}

/**
 * Searches songs on QQ Music.
 */
export async function searchQQLyrics(keyword: string, page = 1, pageSize = 20): Promise<SongResult[]> {
  const safeKeyword = keyword.trim();
  if (!safeKeyword) return [];

  const pagesize = pageSize;
  const param = {
    // Keep the desktop search payload minimal. QQ currently returns code 2001
    // when mobile/session-only fields are included in this request.
    query: safeKeyword.length > 60 ? safeKeyword.slice(0, 60) : safeKeyword,
    search_type: 0, // 0 = SONG
    num_per_page: pagesize,
    page_num: page,
  };

  try {
    const data = await requestQQ("DoSearchForQQMusicDesktop", "music.search.SearchCgiService", param);
    const songs = data?.body?.song?.list || data?.body?.item_song || [];
    
    return songs.map((info: any) => {
      const artists = (info.singer || []).map((s: any, idx: number) => ({
        id: s.id || idx,
        name: s.name || 'Unknown Artist',
      }));
      
      const albumMid = info.album?.mid;
      const picUrl = albumMid
        ? getOriginalCoverUrl(`https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg?max_age=2592000`)
        : undefined;

      const mediaMid = info.file?.media_mid || info.media_mid || info.mediaMid || '';
      return {
        id: Number(info.id || 0),
        name: info.title || info.name || 'Unknown Song',
        artists,
        album: {
          id: Number(info.album?.id || 0),
          name: info.album?.name || 'Unknown Album',
          coverUrl: picUrl,
        },
        durationMs: (info.interval || 0) * 1000,
        qqMid: info.mid,
        sourceRef: {
          kind: 'online' as const,
          providerId: 'qq' as const,
          mediaId: String(info.mid || info.id || ''),
          providerData: {
            songId: Number(info.id || 0),
            songMid: String(info.mid || ''),
            ...(mediaMid ? { mediaMid: String(mediaMid) } : {}),
          },
        },
      };
    });
  } catch (error) {
    console.error('[QQMusic] Search failed:', error);
    return [];
  }
}

/**
 * Fetches and decrypts QQ Music lyrics.
 */
export async function fetchQQLyrics(
  song: SongResult,
  options: { chorusRanges?: NeteaseChorusRange[] } = {}
): Promise<any | null> {
  if (!song.id || !song.qqMid) {
    throw new Error('Missing song ID or mid');
  }

  const artistsStr = song.artists?.map(a => a.name).join(', ') || '';
  
  const param = {
    albumName: toBase64(song.album?.name || ''),
    crypt: 1,
    ct: 19,
    cv: 2111,
    interval: Math.floor(song.durationMs / 1000),
    lrc_t: 0,
    qrc: 1,
    qrc_t: 0,
    roma: 1,
    roma_t: 0,
    singerName: toBase64(artistsStr),
    songID: Number(song.id),
    songName: toBase64(song.name),
    trans: 1,
    trans_t: 0,
    type: 0,
  };

  try {
    const data = await requestQQ("GetPlayLyricInfo", "music.musichallSong.PlayLyricInfo", param);
    const encryptedLyricHex = data?.lyric;
    const encryptedTransHex = data?.trans;
    const encryptedRomanizationHex = data?.roma;

    if (!encryptedLyricHex) {
      return null;
    }

    const decryptedLyric = await qrcDecrypt(encryptedLyricHex);
    const decryptedTrans = encryptedTransHex ? await qrcDecrypt(encryptedTransHex) : '';
    const decryptedRomanization = encryptedRomanizationHex ? await qrcDecrypt(encryptedRomanizationHex) : '';

    const isQrc = detectIsQrc(decryptedLyric);
    const format = isQrc ? 'qrc' : detectTimedLyricFormat(decryptedLyric);

    const parsed = parseLyricsByFormat(format, decryptedLyric, decryptedTrans, {}, decryptedRomanization);
    if (!parsed) {
      return null;
    }
    parsed.isWordByWord = isQrc;
    if (options.chorusRanges && options.chorusRanges.length > 0) {
      return applyNeteaseChorusByTime(parsed, options.chorusRanges);
    }
    return applyDetectedChorusEffects(parsed, decryptedLyric);
  } catch (error) {
    console.error('[QQMusic] Fetch lyrics failed:', error);
    return null;
  }
}
