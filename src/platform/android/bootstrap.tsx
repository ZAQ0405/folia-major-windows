import React from 'react';
import ReactDOM from 'react-dom/client';
import '../../i18n/config';
import '../../index.css';
import './android.css';
import App from '../../App';
import AppSplashGate from '../../components/AppSplashGate';
import { initializeLocalCoverRuntime } from '../../services/localCoverRuntime';
import { jsMusicSourceManager } from '../../services/jsMusicSource/jsSourceManager';
import { initModVisualizers } from '../../mods/modVisualizers';
import { hasVisualizerMode } from '../../components/visualizer/registry';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import '../../stores/useMotionSettingsStore';

// 当前文件：Android 应用装配与启动副作用；在线业务和组件契约复用 shared src。
const mountAndroidApp = () => {
    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Could not find Android app root element');

    ReactDOM.createRoot(rootElement).render(
        <React.StrictMode>
            <AppSplashGate>
                <App />
            </AppSplashGate>
        </React.StrictMode>,
    );

    void initModVisualizers().then(() => {
        try {
            const saved = localStorage.getItem('visualizer_mode');
            if (!saved?.startsWith('mod:') || !hasVisualizerMode(saved)) return;
            const store = useVisualizerSettingsStore.getState();
            if (store.visualizerMode !== saved) store.handleSetVisualizerMode(saved, { notify: false });
        } catch (error) {
            console.warn('[AndroidStartup] Could not restore a saved mod visualizer', error);
        }
    }).catch(error => console.warn('[AndroidStartup] Mod visualizers failed to initialize', error));

    void initializeLocalCoverRuntime().catch(error => console.warn('[AndroidStartup] Cover initialization failed', error));
    void jsMusicSourceManager.initializeEnabledSources().catch(error => console.warn('[AndroidStartup] JS music sources failed to initialize', error));
};

mountAndroidApp();
