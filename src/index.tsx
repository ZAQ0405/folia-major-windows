// Keep this file intentionally tiny. A failure in an optional startup helper
// must not leave Electron with only index.html's black splash screen and no
// diagnostic. The heavier runtime setup is loaded behind an explicit catch so
// the user gets either the real app or an actionable in-window error.
console.info('[Startup] Folia index module loaded');

const showStartupError = (error: unknown) => {
  console.error('[Startup] Folia failed to mount', error);
  const root = document.getElementById('root');
  if (!root) return;
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const escaped = detail.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
  root.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;padding:32px;box-sizing:border-box">
      <div style="max-width:680px;width:100%;border:1px solid #3f3f46;border-radius:16px;padding:24px;background:#18181b;box-shadow:0 18px 60px #0008">
        <h1 style="margin:0 0 10px;font-size:20px">Folia 启动失败</h1>
        <p style="margin:0 0 16px;color:#a1a1aa">桌面渲染进程已启动，但界面模块加载失败。请重新启动源码服务，以下是诊断信息：</p>
        <pre style="margin:0;white-space:pre-wrap;color:#fda4af;font:12px/1.6 ui-monospace,monospace">${escaped}</pre>
      </div>
    </div>`;
  document.getElementById('app-splash')?.remove();
};

void (async () => {
  try {
    const { Buffer } = await import('buffer');
    globalThis.Buffer = Buffer;

    // Diagnostics and performance helpers are useful, but none is allowed to
    // become a prerequisite for mounting the player.
    await Promise.allSettled([
      import('./utils/frameRateLimiter').then(({ disableGlobalVisualizerFrameRateLimiter }) => disableGlobalVisualizerFrameRateLimiter()),
      import('./utils/consoleLogBuffer').then(({ installConsoleLogCapture }) => installConsoleLogCapture()),
      import('./services/debug/debugModule').then(({ installDebugModule }) => installDebugModule()),
      import('./services/debug/memorySamples').then(({ installMemorySampleFeed }) => installMemorySampleFeed()),
    ]);

    await import('./bootstrap');
  } catch (error) {
    showStartupError(error);
  }
})();
