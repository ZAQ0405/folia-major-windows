const crypto = require('crypto');

// Kuwo's Android login endpoint uses a little-endian DES variant.  The tables and
// block layout mirror the public Kuwo client protocol; keeping it in the main
// process means the password and the login ticket never enter renderer storage.
const KW_IP = [57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7,56,48,40,32,24,16,8,0,58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6];
const KW_E = [31,0,1,2,3,4,-1,-1,3,4,5,6,7,8,-1,-1,7,8,9,10,11,12,-1,-1,11,12,13,14,15,16,-1,-1,15,16,17,18,19,20,-1,-1,19,20,21,22,23,24,-1,-1,23,24,25,26,27,28,-1,-1,27,28,29,30,31,30,-1,-1];
const KW_P = [15,6,19,20,28,11,27,16,0,14,22,25,4,17,30,9,1,7,23,13,31,26,2,8,18,12,29,5,21,10,3,24];
const KW_FP = [39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25,32,0,40,8,48,16,56,24];
const KW_PC1 = [56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
const KW_PC2 = [13,16,10,23,0,4,-1,-1,2,27,14,5,20,9,-1,-1,22,18,11,3,25,7,-1,-1,15,6,26,19,12,1,-1,-1,40,51,30,36,46,54,-1,-1,29,39,50,44,32,47,-1,-1,43,48,38,55,33,52,-1,-1,45,41,49,35,28,31,-1,-1];
const KW_SHIFT = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const KW_MROT = [0n, 1048577n, 3145731n];
const KW_MASK64 = (1n << 64n) - 1n;
const KW_MASK32 = 0xffffffffn;
const KW_BIT = Array.from({ length: 64 }, (_, index) => 1n << BigInt(index));
const KW_G = [
  [14,4,3,15,2,13,5,3,13,14,6,9,11,2,0,5,4,1,10,12,15,6,9,10,1,8,12,7,8,11,7,0,0,15,10,5,14,4,9,10,7,8,12,3,13,1,3,6,15,12,6,11,2,9,5,0,4,2,11,14,1,7,8,13],
  [15,0,9,5,6,10,12,9,8,7,2,12,3,13,5,2,1,14,7,8,11,4,0,3,14,11,13,6,4,1,10,15,3,13,12,11,15,3,6,0,4,10,1,7,8,4,11,14,13,8,0,6,2,15,9,5,7,1,10,12,14,2,5,9],
  [10,13,1,11,6,8,11,5,9,4,12,2,15,3,2,14,0,6,13,1,3,15,4,10,14,9,7,12,5,0,8,7,13,1,2,4,3,6,12,11,0,13,5,14,6,8,15,2,7,10,8,15,4,9,11,5,9,0,14,3,10,7,1,12],
  [7,10,1,15,0,12,11,5,14,9,8,3,9,7,4,8,13,6,2,1,6,11,12,2,3,0,5,14,10,13,15,4,13,3,4,9,6,10,1,12,11,0,2,5,0,13,14,2,8,15,7,4,15,1,10,7,5,6,12,11,3,8,9,14],
  [2,4,8,15,7,10,13,6,4,1,3,12,11,7,14,0,12,2,5,9,10,13,0,3,1,11,15,5,6,8,9,14,14,11,5,6,4,1,3,10,2,12,15,0,13,2,8,5,11,8,0,15,7,14,9,4,12,7,10,9,1,13,6,3],
  [12,9,0,7,9,2,14,1,10,15,3,4,6,12,5,11,1,14,13,0,2,8,7,13,15,5,4,10,8,3,11,6,10,4,6,11,7,9,0,6,4,2,13,1,9,15,3,8,15,3,1,14,12,5,11,0,2,12,14,7,5,10,8,13],
  [4,1,3,10,15,12,5,0,2,11,9,6,8,7,6,9,11,4,12,15,0,3,10,5,14,13,7,8,13,14,1,2,13,6,14,9,4,1,2,14,11,13,5,0,1,10,8,3,0,11,3,5,9,4,15,2,7,8,12,15,10,7,6,12],
  [13,7,10,0,6,9,5,15,8,4,3,10,11,14,12,5,2,11,9,6,15,12,0,3,4,1,14,13,1,2,7,8,1,2,12,15,10,4,0,3,13,14,6,9,7,8,9,6,15,1,5,12,3,10,14,5,8,7,11,0,4,13,2,11],
];

const kwPermute = (table, value) => table.reduce((out, bit, index) => (
  bit >= 0 && (KW_BIT[bit] & value) !== 0n ? out | KW_BIT[index] : out
), 0n);

function kwKeySchedule(key, decrypt = false) {
  let value = 0n;
  for (let index = 0; index < 8; index++) value |= BigInt(key[index] & 0xff) << BigInt(index * 8);
  let state = kwPermute(KW_PC1, value);
  const subkeys = new Array(16);
  for (let round = 0; round < 16; round++) {
    const mask = KW_MROT[KW_SHIFT[round]];
    const shift = BigInt(KW_SHIFT[round]);
    state = (((state & (~mask & KW_MASK64)) >> shift) | ((mask & state) << (28n - shift))) & KW_MASK64;
    subkeys[round] = kwPermute(KW_PC2, state);
  }
  if (decrypt) for (let index = 0; index < 8; index++) [subkeys[index], subkeys[15 - index]] = [subkeys[15 - index], subkeys[index]];
  return subkeys;
}

function kwDesBlock(subkeys, block) {
  const permuted = kwPermute(KW_IP, block);
  let left = permuted & KW_MASK32;
  let right = (permuted >> 32n) & KW_MASK32;
  for (let round = 0; round < 16; round++) {
    let expanded = kwPermute(KW_E, right) ^ subkeys[round];
    let substituted = 0n;
    for (let index = 7; index >= 0; index--) {
      const nibble = Number((expanded >> BigInt(index * 8)) & 0xffn);
      substituted = (substituted << 4n) | BigInt(KW_G[index][nibble]);
    }
    const mixed = kwPermute(KW_P, substituted);
    [left, right] = [right, (left ^ mixed) & KW_MASK32];
  }
  return kwPermute(KW_FP, ((left << 32n) & KW_MASK64) | right);
}

function kwEncrypt(bytes, key) {
  const subkeys = kwKeySchedule(Buffer.from(key, 'ascii'));
  const blocks = [];
  const count = Math.floor(bytes.length / 8);
  for (let block = 0; block <= count; block++) {
    let value = 0n;
    const start = block * 8;
    for (let index = 0; index < Math.min(8, bytes.length - start); index++) value |= BigInt(bytes[start + index]) << BigInt(index * 8);
    blocks.push(kwDesBlock(subkeys, value));
  }
  const output = Buffer.alloc(blocks.length * 8);
  blocks.forEach((block, blockIndex) => {
    for (let index = 0; index < 8; index++) output[blockIndex * 8 + index] = Number((block >> BigInt(index * 8)) & 0xffn);
  });
  return output;
}

function kwDecrypt(bytes, key) {
  const subkeys = kwKeySchedule(Buffer.from(key, 'ascii'), true);
  const output = Buffer.alloc(Math.floor(bytes.length / 8) * 8);
  for (let blockIndex = 0; blockIndex < output.length / 8; blockIndex++) {
    let value = 0n;
    for (let index = 0; index < 8; index++) value |= BigInt(bytes[blockIndex * 8 + index]) << BigInt(index * 8);
    const decrypted = kwDesBlock(subkeys, value);
    for (let index = 0; index < 8; index++) output[blockIndex * 8 + index] = Number((decrypted >> BigInt(index * 8)) & 0xffn);
  }
  return output;
}

const kwBase64 = bytes => Buffer.from(bytes).toString('base64');

const LOGIN_KEY = 'kwks&@69';
const LOGIN_RESPONSE_KEY = 'mr8kw3sx';
const LOGIN_URL = 'http://ar.i.kuwo.cn/US_NEW/kuwo/login_kw';
const VERSION = '11.1.8.2';
const PRODUCT = `kwplayer_ar_${VERSION}`;
const SOURCE = `${PRODUCT}_newpcguanwangmobile.apk`;
const ACCOUNT_STORAGE_KEY = 'KUWO_ACCOUNT_SESSION_V1';

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);

function assertSecureStorage(safeStorage) {
  if (!safeStorage?.isEncryptionAvailable?.() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
    throw new Error('Electron safeStorage encryption is unavailable');
  }
}

function createKuwoAccountBridge({ store, safeStorage, warn = console.warn }) {
  const account = {
    deviceId: crypto.randomBytes(8).toString('hex'),
    appuid: String(2_000_000_000 + Math.floor(Math.random() * 900_000_000)),
    loginUid: '0',
    loginSid: '0',
    nickname: '',
    avatar: '',
    vipType: 0,
  };
  let loaded = false;

  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const encoded = store.get(ACCOUNT_STORAGE_KEY);
      if (!encoded) return;
      assertSecureStorage(safeStorage);
      const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(encoded, 'base64')));
      if (!isObject(parsed)) return;
      for (const key of ['deviceId', 'appuid', 'loginUid', 'loginSid', 'nickname', 'avatar']) {
        if (parsed[key] !== undefined && parsed[key] !== null) account[key] = String(parsed[key]);
      }
      account.vipType = Number(parsed.vipType) || 0;
    } catch (error) {
      warn('[KuwoAccount] secure session load failed', error instanceof Error ? error.message : String(error));
    }
  };

  const save = () => {
    try {
      assertSecureStorage(safeStorage);
      const encoded = safeStorage.encryptString(JSON.stringify(account)).toString('base64');
      store.set(ACCOUNT_STORAGE_KEY, encoded);
    } catch (error) {
      warn('[KuwoAccount] secure session save failed', error instanceof Error ? error.message : String(error));
    }
  };

  const requestText = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'okhttp/3.10.0', Accept: '*/*' },
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Kuwo login request failed (${response.status})`);
      return text;
    } finally {
      clearTimeout(timer);
    }
  };

  const parseResponse = raw => {
    const decrypted = kwDecrypt(Buffer.from(String(raw).trim(), 'base64'), LOGIN_RESPONSE_KEY)
      .toString('utf8').replace(/ +$/u, '').replace(/\x00+$/u, '');
    try { return JSON.parse(decrypted); } catch { /* legacy replies are key/value text */ }
    return Object.fromEntries(decrypted.split(/[\r\n]/u).map(line => {
      const separator = line.indexOf('=');
      return separator > 0 ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : ['', ''];
    }).filter(([key]) => key));
  };

  const status = () => {
    load();
    const authenticated = Boolean(account.loginUid && account.loginUid !== '0' && account.loginSid && account.loginSid !== '0');
    return {
      available: true,
      authenticated,
      user: authenticated ? {
        id: account.loginUid,
        nickname: account.nickname || `酷我用户 ${account.loginUid}`,
        avatarUrl: account.avatar || undefined,
        vipType: account.vipType || 0,
      } : null,
    };
  };

  return {
    getStatus: status,
    async login(username, password) {
      load();
      const user = String(username || '').trim();
      const pass = String(password || '');
      if (!user || !pass) throw new Error('请输入酷我账号和密码');
      const pw = kwBase64(Buffer.from(pass, 'utf8'));
      const plain = 'username=' + encodeURIComponent(user)
        + '&password=' + encodeURIComponent(pw)
        + '&dev_id=' + account.appuid + '&user=' + account.deviceId
        + '&dev_name=' + PRODUCT + '&urlencode=0&src=' + SOURCE
        + '&devResolution=1080*2400&from=android&devType=PJZ110&sx=' + LOGIN_RESPONSE_KEY
        + '&version=' + VERSION;
      const q = encodeURIComponent(kwBase64(kwEncrypt(Buffer.from(plain, 'utf8'), LOGIN_KEY)));
      const response = parseResponse(await requestText(`${LOGIN_URL}?f=ar&q=${q}`));
      const success = response?.result === 'succ' || response?.ret === 'succ';
      const userInfo = isObject(response?.userInfo) ? response.userInfo : {};
      const uid = response?.uid || response?.userid || userInfo.uid;
      const sid = response?.sid;
      if (!success || !uid || !sid) throw new Error(String(response?.msg || response?.tips || '酷我账号或密码错误'));
      account.loginUid = String(uid);
      account.loginSid = String(sid);
      account.nickname = String(userInfo.nickName || response.nick || userInfo.name || response.name || '').trim();
      account.avatar = String(response.head || userInfo.pic120 || userInfo.pic || userInfo.pic300 || '').trim();
      account.vipType = Number(response.vip_type || response.vip_lev || userInfo.vipType || 0) || 0;
      save();
      return status();
    },
    logout() {
      load();
      account.loginUid = '0';
      account.loginSid = '0';
      account.nickname = '';
      account.avatar = '';
      account.vipType = 0;
      save();
      return status();
    },
  };
}

module.exports = { createKuwoAccountBridge };
