import React from 'react';
import { Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { Theme } from '../../../types';
import type { PlaybackMode } from '../../../types/playbackMode';
import { omni } from '../../../services/onlineMusic/omni';
import { usePlaybackModeStore } from '../../../stores/usePlaybackModeStore';
import SettingsSectionHeading from './navigation/SettingsSectionHeading';
import { SettingsAnchor } from './navigation/SettingsAnchorContext';

type ProviderPlaybackModesSectionProps = {
    isDaylight: boolean;
    settingsCardClass: string;
    theme?: Theme;
};

const ProviderPlaybackModesSection: React.FC<ProviderPlaybackModesSectionProps> = ({
    isDaylight,
    settingsCardClass,
    theme,
}) => {
    const { t } = useTranslation();
    const { playbackMode, providerPlaybackModes, setProviderPlaybackMode } = usePlaybackModeStore(useShallow(state => ({
        playbackMode: state.playbackMode,
        providerPlaybackModes: state.providerPlaybackModes,
        setProviderPlaybackMode: state.setProviderPlaybackMode,
    })));
    const providers = omni.getProviderSummaries().filter(provider => {
        const capabilities = omni.getProviderCapabilities(provider.providerId);
        return capabilities.search || capabilities.playback;
    });
    const accentColor = theme?.accentColor || (isDaylight ? '#44403c' : '#f4f4f5');

    const optionStyle = (selected: boolean) => selected
        ? { borderColor: accentColor, backgroundColor: `${accentColor}18`, color: 'var(--text-primary)' }
        : { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' };

    return (
        <SettingsAnchor anchorId="providerPlaybackModes" label={t('options.providerPlaybackModes')}>
            <SettingsSectionHeading icon={Radio} label={t('options.providerPlaybackModes')} />
            <div className={`p-4 rounded-xl border space-y-4 ${settingsCardClass}`}>
                <div className="space-y-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {t('options.providerPlaybackModes')}
                    </div>
                    <div className="text-[11px] opacity-50 max-w-[620px]" style={{ color: 'var(--text-secondary)' }}>
                        {t('options.providerPlaybackModesDesc')}
                    </div>
                </div>

                <div className="space-y-2">
                    {providers.map(provider => {
                        const selected = providerPlaybackModes[provider.providerId];
                        const effectiveMode = selected || playbackMode;
                        return (
                            <div key={provider.providerId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2.5" style={{ borderColor: 'var(--border-color)' }}>
                                <div className="min-w-0">
                                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{provider.shortName}</div>
                                    <div className="text-[11px] opacity-50" style={{ color: 'var(--text-secondary)' }}>
                                        {selected ? (selected === 'official' ? t('options.providerPlaybackModeOfficial') : t('options.providerPlaybackModeSource')) : t('options.providerPlaybackModeInherit')}
                                        {' · '}
                                        {effectiveMode === 'official' ? t('options.playbackModeOfficial') : t('options.playbackModeSource')}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px]">
                                    {([
                                        ['official', t('options.providerPlaybackModeOfficial')],
                                        ['source', t('options.providerPlaybackModeSource')],
                                    ] as Array<[PlaybackMode, string]>).map(([mode, label]) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            className="rounded-lg border px-2.5 py-1.5 transition-colors"
                                            style={optionStyle(effectiveMode === mode && (!selected || selected === mode))}
                                            onClick={() => setProviderPlaybackMode(provider.providerId, mode)}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        className="rounded-lg border px-2.5 py-1.5 opacity-75 transition-colors hover:opacity-100"
                                        style={optionStyle(!selected)}
                                        onClick={() => setProviderPlaybackMode(provider.providerId, null)}
                                    >
                                        {t('options.providerPlaybackModeInherit')}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        </SettingsAnchor>
    );
};

export default ProviderPlaybackModesSection;
