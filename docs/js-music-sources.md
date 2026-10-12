# JavaScript 音源

Folia 支持导入兼容 LX Music 音源协议的 JavaScript 文件。播放地址和已声明的 LX 歌词 action 由 JS 音源负责；搜索使用洛雪式的多渠道模式，由 Folia 在线 provider 并行搜索并保留每首结果所属的平台身份。

## 使用方式

1. 打开「设置 → 播放 → JS 音源」。
2. 点击「导入 JS 音源」，选择 `.js` 文件。
3. 启用音源并按优先级排序。
4. 播放在线歌曲时，Folia 会直接复用洛雪桌面端 `music_url` 中已解析的完整 URL；洛雪没有缓存时，才按顺序调用已启用音源的 `musicUrl` action。Folia 不再保存或复用旧的 provider/预取 URL。

桌面版启动时还会自动扫描洛雪音源目录（包括系统下载目录下的 `音乐源`、`D:\下载\音乐源` 和洛雪安装目录中的 `洛雪音乐源`），将其中的 `.js` 音源按内容去重导入并置于普通兼容音源之前。文件更新后下次启动会刷新对应脚本；浏览器版不会读取本机文件。

音源脚本保存在浏览器的 localStorage 中，不会写入仓库。移除音源只会删除本地保存的脚本，不会删除原始文件。

## 兼容范围

运行时提供 LX Music 音源常用的：

- `globalThis.lx.EVENT_NAMES`
- `lx.on('request', handler)`
- `lx.send('inited', { sources })`
- `lx.request(url, options, callback)`
- `lx.utils.crypto.md5/hex`
- `lx.utils.buffer.stringToBuf/bufToString/bufToHex`

运行时识别 `sources` 中声明的 `musicUrl` 和 `lyric` action，并根据歌曲所属 provider 映射平台键：网易云 `wy`、酷狗 `kg`、QQ `tx`。歌词结果兼容 LX 常见的 `lyric`、`tlyric`、`rlyric`、`lxlyric` 字段；只声明 `musicUrl` 的旧音源会保留 Folia provider 歌词作为兼容回退。搜索页的「全部音源」会并行搜索已注册的网易云、酷狗和 QQ 渠道；每首结果保留 `sourceRef.providerId`，播放时回到对应渠道。JS 音源脚本自身的 `search`、登录或歌单 action 仍不直接执行，渠道搜索和登录由 Folia 的洛雪式 Omni 兼容层负责。

## 浏览器部署注意事项

桌面版 Electron 会优先通过主进程原生请求桥访问音源；浏览器开发环境和 Web 部署才使用 Folia 的受控同源代理。两条通道都会保留音源脚本声明的请求方法、请求头和请求体，只允许 HTTP(S) 公网目标，并限制超时、请求体大小和私有地址解析。

代理只能解决浏览器跨域和请求环境差异，不能修复音源自己的上游服务故障。如果已启用 JS 音源，音源接口返回 5xx、超时或没有可用地址时，Folia 会报告当前歌曲不可用，不再静默切换到原生 provider 的试听地址；播放失败时会清理 Folia URL 缓存并强制刷新音源。

桌面版还会优先读取洛雪音乐的本地 `LxDatas/lx.data.db` 中的 `music_url` 缓存。这样已经由洛雪解析过的完整地址可以直接复用；网页版本没有权限读取该桌面数据库，因此不会启用这层缓存。

只导入可信脚本。脚本虽然在隔离 Worker 中运行，仍然可以通过它声明的请求桥接访问外部网络。
