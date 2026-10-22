import { Buffer } from 'buffer';

// 当前文件：Android 独立 WebView 构建入口，不经过桌面 index.tsx。
globalThis.Buffer = Buffer;

void Promise.allSettled([
    import('../../utils/frameRateLimiter').then(({ disableGlobalVisualizerFrameRateLimiter }) => disableGlobalVisualizerFrameRateLimiter()),
    import('../../utils/consoleLogBuffer').then(({ installConsoleLogCapture }) => installConsoleLogCapture()),
    import('../../services/debug/debugModule').then(({ installDebugModule }) => installDebugModule()),
    import('../../services/debug/memorySamples').then(({ installMemorySampleFeed }) => installMemorySampleFeed()),
]).then(() => import('./bootstrap'));
