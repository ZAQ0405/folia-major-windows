import React from 'react';
import { motion } from 'framer-motion';
import {
    AppWindow,
    Check,
    Cpu,
    EyeOff,
    Globe,
    KeyRound,
    Loader2,
    Minimize2,
    Monitor,
    ShieldAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';

// src/components/modal/settings/DesktopSettingsSubview.tsx
// Desktop-only tray and AI settings separated from the global settings modal.

type ElectronSettingsState = {
    GEMINI_API_KEY: string;
    OPENAI_API_KEY: string;
    OPENAI_API_URL: string;
    OPENAI_API_MODEL: string;
    OPENAI_API_TEMPERATURE: string;
    AI_PROVIDER: string;
    USE_SYSTEM_PROXY_FOR_AI: boolean;
    STAGE_MODE_SOURCE: string;
    DISCORD_RICH_PRESENCE_ENABLED: boolean;
};

export type DesktopSettingsChrome = {
    borderColor: string;
    isDaylight: boolean;
    isElectron: boolean;
    settingsCardClass: string;
    settingsIconClass: string;
    successTextColor: string;
    theme?: Theme;
    toggleOffBackgroundClass: string;
};

export type DesktopSettingsPreferences = {
    hideTaskbarIcon: boolean;
    hideRemoteControlTaskbarIcon: boolean;
    minimizeToTray: boolean;
    onToggleHideTaskbarIcon: (enabled: boolean) => void;
    onToggleHideRemoteControlTaskbarIcon: (enabled: boolean) => void;
    onToggleMinimizeToTray: (enabled: boolean) => void;
    onToggleOpenPlayerOnLaunch: (enabled: boolean) => void;
    openPlayerOnLaunch: boolean;
    wallpaperMode: boolean;
    onToggleWallpaperMode: (enabled: boolean) => void;
    wallpaperMacAutohideDock: boolean;
    onToggleWallpaperMacAutohideDock: (enabled: boolean) => void;
};

export type DesktopSettingsModel = {
    electronSaveStatus: 'idle' | 'saving' | 'saved';
    electronSettings: ElectronSettingsState;
    onSaveElectronSettings: () => Promise<void> | void;
    setElectronSettings: React.Dispatch<React.SetStateAction<ElectronSettingsState>>;
};

type DesktopSettingsSubviewProps = {
    chrome: DesktopSettingsChrome;
    model: DesktopSettingsModel;
    preferences: DesktopSettingsPreferences;
};

const DesktopSettingsSubview: React.FC<DesktopSettingsSubviewProps> = ({
    chrome,
    model,
    preferences,
}) => {
    const {
        borderColor,
        isDaylight,
        isElectron,
        settingsCardClass,
        settingsIconClass,
        successTextColor,
        theme,
        toggleOffBackgroundClass,
    } = chrome;
    const {
        hideTaskbarIcon,
        hideRemoteControlTaskbarIcon,
        minimizeToTray,
        onToggleHideTaskbarIcon,
        onToggleHideRemoteControlTaskbarIcon,
        onToggleMinimizeToTray,
        onToggleOpenPlayerOnLaunch,
        openPlayerOnLaunch,
        wallpaperMode,
        onToggleWallpaperMode,
        wallpaperMacAutohideDock,
        onToggleWallpaperMacAutohideDock,
    } = preferences;
    const isLinux = isElectron && window.electron?.platform === 'linux';
    const isWindows = isElectron && window.electron?.platform === 'win32';
    const isMac = isElectron && window.electron?.platform === 'darwin';
    const {
        electronSaveStatus,
        electronSettings,
        onSaveElectronSettings,
        setElectronSettings,
    } = model;
    const { t } = useTranslation();

    if (!isElectron) {
        return null;
    }

    const renderToggle = (checked: boolean, onChange: () => void, disabled?: boolean) => (
        <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            className={`w-12 h-6 rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${checked ? '' : toggleOffBackgroundClass}`}
            style={{ backgroundColor: checked ? theme?.secondaryColor || 'rgba(114, 119, 134, 1)' : undefined }}
        >
            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
    );

    return (
        <>
            <SettingsAnchor anchorId="desktopTrayBehavior" label={t('options.desktopTrayBehavior')} className="space-y-4">
                <SettingsSectionHeading icon={Monitor} label={t('options.desktopTrayBehavior')} />
                <div className={`border rounded-2xl overflow-hidden ${borderColor} ${settingsCardClass}`}>
                    <div className={`p-4 bg-black/[0.04] dark:bg-white/[0.02] border-b ${borderColor}`}>
                        <p className="text-xs opacity-60 leading-relaxed text-left" style={{ color: 'var(--text-secondary)' }}>
                            {t('options.desktopTrayBehaviorDesc')}
                        </p>
                    </div>

                    <div className={`flex items-center justify-between p-4 gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors border-b ${borderColor}`}>
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${settingsIconClass}`} style={{ color: 'var(--text-primary)' }}>
                                <Minimize2 size={16} />
                            </div>
                            <div className="space-y-0.5 text-left">
                                <h4 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                                    {t('options.minimizeToTray')}
                                </h4>
                                <p className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    点击最小化时，应用将隐藏至系统托盘。
                                </p>
                            </div>
                        </div>
                        {renderToggle(minimizeToTray, () => onToggleMinimizeToTray(!minimizeToTray))}
                    </div>

                    <div className={`flex items-center justify-between p-4 gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors border-b ${borderColor}`}>
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${settingsIconClass}`} style={{ color: 'var(--text-primary)' }}>
                                <AppWindow size={16} />
                            </div>
                            <div className="space-y-0.5 text-left">
                                <h4 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                                    {t('options.openPlayerOnLaunch')}
                                </h4>
                                <p className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    应用启动时自动开启全屏/大屏歌词播放界面，无需手动点击。
                                </p>
                            </div>
                        </div>
                        {renderToggle(openPlayerOnLaunch, () => onToggleOpenPlayerOnLaunch(!openPlayerOnLaunch))}
                    </div>

                    <div className={`flex items-center justify-between p-4 gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors border-b ${borderColor}`}>
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${settingsIconClass}`} style={{ color: 'var(--text-primary)' }}>
                                <EyeOff size={16} />
                            </div>
                            <div className="space-y-0.5 text-left">
                                <h4 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                                    {t('options.hideTaskbarIcon')}
                                </h4>
                                <p className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    即使主窗口处于打开状态，也不在系统任务栏显示应用，最大程度减少干扰。
                                </p>
                            </div>
                        </div>
                        {renderToggle(hideTaskbarIcon, () => onToggleHideTaskbarIcon(!hideTaskbarIcon))}
                    </div>
                    <div className="flex items-center justify-between p-4 gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                        <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${settingsIconClass}`} style={{ color: 'var(--text-primary)' }}>
                                <EyeOff size={16} />
                            </div>
                            <div className="space-y-0.5 text-left">
                                <h4 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                                    {t('options.hideRemoteControlTaskbarIcon')}
                                </h4>
                                <p className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    {t('options.hideRemoteControlTaskbarIconDesc')}
                                </p>
                            </div>
                        </div>
                        {renderToggle(hideRemoteControlTaskbarIcon, () => onToggleHideRemoteControlTaskbarIcon(!hideRemoteControlTaskbarIcon))}
                    </div>
                </div>

                {hideTaskbarIcon && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border text-xs leading-relaxed ${
                            isDaylight
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-800'
                                : 'bg-amber-500/8 border-amber-500/15 text-amber-200'
                        }`}
                    >
                        <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-left">
                            <span className="font-semibold">重要提示：</span>
                            <span>隐藏任务栏图标后，应用只会在系统托盘显示。如需找回主窗口，请双击或右键点击托盘中的 Folia 图标。建议同时配合启用“最小化到托盘”。</span>
                        </div>
                    </motion.div>
                )}
            </SettingsAnchor>

            {(isLinux || isWindows || isMac) && (
                <SettingsAnchor anchorId="wallpaperMode" label={t('options.wallpaperMode') || 'Wallpaper Mode'} className="space-y-4">
                    <SettingsSectionHeading icon={AppWindow} label={t('options.wallpaperMode') || 'Wallpaper Mode'} />
                    <div className={`border rounded-2xl overflow-hidden ${borderColor} ${settingsCardClass}`}>
                        <div className={`flex items-center justify-between p-4 gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors border-b ${borderColor}`}>
                            <div className="flex items-start gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${settingsIconClass}`} style={{ color: 'var(--text-primary)' }}>
                                    <AppWindow size={16} />
                                </div>
                                <div className="space-y-0.5 text-left">
                                    <h4 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                                        {t('options.wallpaperMode')}
                                    </h4>
                                    <p className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        {t('options.wallpaperModeDesc') || 'Sink the app window to the bottom of the desktop and keep it always visible as a lyrics wallpaper.'}
                                    </p>
                                </div>
                            </div>
                            {renderToggle(wallpaperMode, () => onToggleWallpaperMode(!wallpaperMode))}
                        </div>
                        {isMac && (
                            <div className="flex items-center justify-between p-4 gap-4 hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${settingsIconClass}`} style={{ color: 'var(--text-primary)' }}>
                                        <AppWindow size={16} />
                                    </div>
                                    <div className="space-y-0.5 text-left">
                                        <h4 className="text-sm font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
                                            {t('options.wallpaperMacAutohideDock')}
                                        </h4>
                                        <p className="text-xs opacity-50 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                            {t('options.wallpaperMacAutohideDockDesc')}
                                        </p>
                                    </div>
                                </div>
                                {renderToggle(wallpaperMacAutohideDock, () => onToggleWallpaperMacAutohideDock(!wallpaperMacAutohideDock))}
                            </div>
                        )}
                    </div>
                    {isMac && (
                        <div className="px-1 text-xs leading-relaxed text-left text-amber-500">
                            {t('options.wallpaperModeMacPermissionHint') || 'Mac wallpaper mode needs Input Monitoring: enable Folia in System Settings → Privacy & Security → Input Monitoring, then restart the app.'}
                        </div>
                    )}
                </SettingsAnchor>
            )}

            <SettingsAnchor anchorId="electronSettings" label={t('options.electronSettings') || 'Desktop App Settings'} className="space-y-4">
                <SettingsSectionHeading icon={Cpu} label={t('options.electronSettings') || 'Desktop App Settings'} />

                <div className={`border rounded-2xl p-5 ${borderColor} ${settingsCardClass} space-y-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-0.5 text-left">
                            <label className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('options.aiProvider') || 'AI Provider'}
                            </label>
                            <p className="text-xs opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                选择生成智能歌词主题效果的 AI 服务商。
                            </p>
                        </div>

                        <div className="flex bg-black/15 dark:bg-white/5 rounded-xl border border-white/5 p-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => setElectronSettings({ ...electronSettings, AI_PROVIDER: 'gemini' })}
                                className={`px-4.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                                    electronSettings.AI_PROVIDER !== 'openai'
                                        ? (isDaylight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-white/10 text-white shadow-sm')
                                        : 'opacity-50 hover:opacity-100 text-zinc-400 hover:text-zinc-200'
                                }`}
                                style={{ color: electronSettings.AI_PROVIDER !== 'gemini' ? 'var(--text-primary)' : undefined }}
                            >
                                Google Gemini
                            </button>
                            <button
                                type="button"
                                onClick={() => setElectronSettings({ ...electronSettings, AI_PROVIDER: 'openai' })}
                                className={`px-4.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                                    electronSettings.AI_PROVIDER === 'openai'
                                        ? (isDaylight ? 'bg-white text-zinc-900 shadow-sm' : 'bg-white/10 text-white shadow-sm')
                                        : 'opacity-50 hover:opacity-100 text-zinc-400 hover:text-zinc-200'
                                }`}
                                style={{ color: electronSettings.AI_PROVIDER === 'openai' ? 'var(--text-primary)' : undefined }}
                            >
                                {t('options.otherCompatibleApi')}
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-white/5 pt-4 space-y-4">
                        {electronSettings.AI_PROVIDER !== 'openai' ? (
                            <div className="space-y-2 text-left">
                                <div className="flex items-center gap-1.5">
                                    <KeyRound size={14} className="opacity-60" style={{ color: 'var(--text-primary)' }} />
                                    <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {t('options.geminiApiKey') || 'Gemini API Key'}
                                    </label>
                                </div>
                                <input
                                    type="password"
                                    value={electronSettings.GEMINI_API_KEY || ''}
                                    onChange={(e) => setElectronSettings({ ...electronSettings, GEMINI_API_KEY: e.target.value })}
                                    placeholder="AI Theme Generation Key"
                                    className="w-full px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-zinc-500 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-500/10 transition-all leading-normal"
                                    style={{ color: 'var(--text-primary)' }}
                                />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="space-y-2 text-left">
                                    <div className="flex items-center gap-1.5">
                                        <Globe size={14} className="opacity-60" style={{ color: 'var(--text-primary)' }} />
                                        <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            {t('options.openaiApiUrl') || 'OpenAI API URL'}
                                        </label>
                                    </div>
                                    <input
                                        type="text"
                                        value={electronSettings.OPENAI_API_URL || ''}
                                        onChange={(e) => setElectronSettings({ ...electronSettings, OPENAI_API_URL: e.target.value })}
                                        placeholder="https://api.openai.com/v1 or https://api.deepseek.com"
                                        className="w-full px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-zinc-500 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-500/10 transition-all leading-normal"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                </div>

                                <div className="space-y-2 text-left">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <Cpu size={14} className="opacity-60" style={{ color: 'var(--text-primary)' }} />
                                            <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                {t('options.openaiApiModel') || 'OpenAI Model'}
                                            </label>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={electronSettings.OPENAI_API_MODEL || ''}
                                        onChange={(e) => setElectronSettings({ ...electronSettings, OPENAI_API_MODEL: e.target.value })}
                                        placeholder="gpt-5.6-luna / gpt-4.1-mini / deepseek-v4-flash"
                                        className="w-full px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-zinc-500 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-500/10 transition-all leading-normal"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                    <p className="text-[10px] opacity-40 leading-relaxed px-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('options.openaiApiModelDesc') || 'Required for many OpenAI-compatible providers. DeepSeek models like deepseek-v4-flash must be filled explicitly if auto-detection does not apply.'}
                                    </p>
                                </div>

                                <div className="space-y-2 text-left">
                                    <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {t('options.openaiApiTemperature') || 'Temperature'}
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={electronSettings.OPENAI_API_TEMPERATURE}
                                        onChange={(e) => setElectronSettings({ ...electronSettings, OPENAI_API_TEMPERATURE: e.target.value })}
                                        placeholder="0.7"
                                        className="w-full px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-zinc-500 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-500/10 transition-all leading-normal"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                    <p className="text-[10px] opacity-40 leading-relaxed px-1" style={{ color: 'var(--text-secondary)' }}>
                                        {t('options.openaiApiTemperatureDesc') || 'Range: 0–2. Defaults to 0.7 when left blank.'}
                                    </p>
                                </div>

                                <div className="space-y-2 text-left">
                                    <div className="flex items-center gap-1.5">
                                        <KeyRound size={14} className="opacity-60" style={{ color: 'var(--text-primary)' }} />
                                        <label className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            {t('options.openaiApiKey') || 'OpenAI API Key'}
                                        </label>
                                    </div>
                                    <input
                                        type="password"
                                        value={electronSettings.OPENAI_API_KEY || ''}
                                        onChange={(e) => setElectronSettings({ ...electronSettings, OPENAI_API_KEY: e.target.value })}
                                        placeholder="sk-..."
                                        className="w-full px-3.5 py-2.5 bg-black/10 dark:bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:border-zinc-500 dark:focus:border-white/30 focus:ring-2 focus:ring-zinc-500/10 transition-all leading-normal"
                                        style={{ color: 'var(--text-primary)' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/5 gap-4">
                        <div className="space-y-0.5 text-left">
                            <label className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('options.useSystemProxyAI') || 'Use System Proxy for AI'}
                            </label>
                            <p className="text-xs opacity-50 max-w-[360px]" style={{ color: 'var(--text-secondary)' }}>
                                {t('options.useSystemProxyAIDesc') || 'Route strictly AI requests through system proxy.'}
                            </p>
                        </div>
                        {renderToggle(electronSettings.USE_SYSTEM_PROXY_FOR_AI, () => setElectronSettings({ ...electronSettings, USE_SYSTEM_PROXY_FOR_AI: !electronSettings.USE_SYSTEM_PROXY_FOR_AI }))}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-white/5 gap-4">
                        <span className="text-[10px] opacity-40 leading-relaxed max-w-[280px] text-left" style={{ color: 'var(--text-secondary)' }}>
                            {electronSettings.AI_PROVIDER !== 'openai'
                                ? (t('options.geminiApiKeyDesc') || 'Netease API backend runs locally.')
                                : t('options.openaiApiUrlDesc')}
                        </span>
                        <button
                            type="button"
                            onClick={onSaveElectronSettings}
                            disabled={electronSaveStatus === 'saving'}
                            className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 dark:bg-white/10 dark:hover:bg-white/15 active:scale-95 disabled:scale-100 disabled:opacity-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm min-w-[80px]"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            {electronSaveStatus === 'saved' ? (
                                <>
                                    <Check size={14} className={successTextColor} />
                                    <span className={successTextColor}>已保存</span>
                                </>
                            ) : electronSaveStatus === 'saving' ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>正在保存...</span>
                                </>
                            ) : (
                                <span>{t('options.save') || 'Save'}</span>
                            )}
                        </button>
                    </div>
                </div>
            </SettingsAnchor>
        </>
    );
};

export default DesktopSettingsSubview;
