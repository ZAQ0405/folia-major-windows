// Bundled adapter based on the GitHub LX source published at:
// https://github.com/wangxanshen/lx-music-source
// The adapter keeps the upstream gdstudio API but fixes the boundary between
// Folia's provider identity and the LX Music source contract.

export const GDSTUDIO_SOURCE_HOMEPAGE = 'https://github.com/wangxanshen/lx-music-source';
export const GDSTUDIO_SOURCE_ID = 'js-gdstudio-adapter';

export const GDSTUDIO_SOURCE_CODE = String.raw`/*!
 * @name GDSStudio 直连音源（Folia适配）
 * @description 基于 GitHub LX Music 音源适配，优先使用歌曲原始 ID 获取完整音频和歌词
 * @version 1.0.0
 * @author Folia adapter / wangxanshen
 * @homepage https://github.com/wangxanshen/lx-music-source
 */
var API_BASE = 'https://music-api.gdstudio.xyz/api.php'
var QUALITY_MAP = { '128k': 128, '320k': 320, flac: 740, flac24bit: 999 }
var QUALITY_FALLBACKS = { 999: [740, 320, 128], 740: [320, 128], 320: [128], 128: [] }
var SOURCE_MAP = { wy: 'netease', kw: 'kuwo', tx: 'tencent', kg: 'kugou' }
var EVENT_NAMES = globalThis.lx.EVENT_NAMES
var request = globalThis.lx.request
var on = globalThis.lx.on
var send = globalThis.lx.send

function httpJson(url) {
  return new Promise(function (resolve, reject) {
    request(url, { method: 'GET' }, function (err, response) {
      if (err) return reject(err)
      var body = response && response.body
      if (typeof body === 'string') {
        try { body = JSON.parse(body) } catch (_) {}
      }
      resolve(body)
    })
  })
}

function sourceName(source) {
  return SOURCE_MAP[source] || source
}

function directId(source, info) {
  if (source === 'kg') return info.hash || info.songmid || info.songId || info.id
  return info.songmid || info.songId || info.songid || info.id
}

function searchSong(source, info) {
  var keyword = [info.name || info.songname || info.title || '', info.singer || info.artist || ''].join(' ').trim()
  if (!keyword) return Promise.reject(new Error('missing song identity'))
  var url = API_BASE + '?types=search&source=' + encodeURIComponent(sourceName(source)) + '&name=' + encodeURIComponent(keyword) + '&count=10'
  return httpJson(url).then(function (list) {
    if (!Array.isArray(list) || !list.length) throw new Error('gdstudio search returned no result')
    var wantedName = String(info.name || info.songname || '').toLowerCase().replace(/\s+/g, '')
    var wantedSinger = String(info.singer || info.artist || '').toLowerCase().replace(/\s+/g, '')
    var best = list[0]
    var bestScore = -1
    list.forEach(function (item) {
      var itemName = String(item.name || '').toLowerCase().replace(/\s+/g, '')
      var itemArtist = Array.isArray(item.artist) ? item.artist.join('') : String(item.artist || '')
      itemArtist = itemArtist.toLowerCase().replace(/\s+/g, '')
      var score = 0
      if (itemName === wantedName) score += 100
      else if (itemName.indexOf(wantedName) >= 0 || wantedName.indexOf(itemName) >= 0) score += 60
      if (wantedSinger && itemArtist.indexOf(wantedSinger) >= 0) score += 80
      if (score > bestScore) { best = item; bestScore = score }
    })
    return { id: best.id || best.url_id, source: best.source || sourceName(source) }
  })
}

function resolveIdentity(source, info) {
  var id = directId(source, info)
  if (id !== undefined && id !== null && String(id)) {
    return Promise.resolve({ id: String(id), source: sourceName(source) })
  }
  return searchSong(source, info)
}

function requestUrl(source, info, quality) {
  var br = QUALITY_MAP[quality] || 128
  var fallbacks = QUALITY_FALLBACKS[br] || [320, 128]
  return resolveIdentity(source, info).then(function (identity) {
    var tries = [br].concat(fallbacks)
    function next(index) {
      if (index >= tries.length) throw new Error('gdstudio returned no playable URL')
      var url = API_BASE + '?types=url&source=' + encodeURIComponent(identity.source) + '&id=' + encodeURIComponent(identity.id) + '&br=' + tries[index]
      return httpJson(url).then(function (body) {
        if (body && body.url) return body.url
        return next(index + 1)
      }, function () { return next(index + 1) })
    }
    return next(0)
  })
}

function requestLyric(source, info) {
  return resolveIdentity(source, info).then(function (identity) {
    var url = API_BASE + '?types=lyric&source=' + encodeURIComponent(identity.source) + '&id=' + encodeURIComponent(identity.id)
    return httpJson(url)
  })
}

on(EVENT_NAMES.request, function (data) {
  var source = data.source
  var info = data.info || {}
  if (data.action === 'musicUrl') return requestUrl(source, info.musicInfo || {}, info.type)
  if (data.action === 'lyric') return requestLyric(source, info.musicInfo || {})
  return Promise.reject(new Error('unsupported action: ' + data.action))
})

var sources = {}
sources.wy = { name: 'wy', type: 'music', actions: ['musicUrl', 'lyric'], qualitys: ['128k', '320k', 'flac', 'flac24bit'] }
send(EVENT_NAMES.inited, { status: true, sources: sources })
`;
