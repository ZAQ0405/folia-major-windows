import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Theme, ThemeMode, VisualizerBackgroundMode, VisualizerMode } from '../../../types';
import type { ThemeSourceModel } from '../../../hooks/themeControllerState';
import { getFoliaVisualizerEntries, getVisualizerModeLabel, getVisualizerRegistryEntry } from '../../visualizer/registry';
import {
    getVisualizerBackgroundModeLabel,
    getVisualizerBackgroundRegistryEntry,
    VISUALIZER_BACKGROUND_REGISTRY,
} from '../../visualizer/backgrounds/registry';
import { resolveVisualizerBackgroundMode } from '../../../stores/visualizerSettingsPersistence';
import { useVisualizerModeStepper } from '../../../hooks/useVisualizerModeStepper';
import { QuickControlChip, QuickControlToggle } from '../../shared/QuickControlChip';
import { Shuffle, Sparkles, WholeWord } from 'lucide-react';
import { openCommandPaletteCommand } from '../../../stores/useAppViewStore';
import { useLyricSegmentationStore } from '../../../stores/useLyricSegmentationStore';
import { LYRIC_SEGMENTATION_COMMAND_ID } from '../../command-palette/commands/lyricSegmentationCommand';
import ModeStepperRow from './ModeStepperRow';
import ThemeSourceRow from './ThemeSourceRow';
import { BackgroundModeGlyph, VisualizerModeGlyph } from '../../visualizer/modeGlyphs';
import { useVisualizerSettingsStore } from '../../../stores/useVisualizerSettingsStore';
import { useSettingsModalStore } from '../../../stores/useSettingsModalStore';
import { selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// src/components/panelTab/controls/AppearanceSection.tsx
// 外观区：歌词样式、背景、主题来源三件事放在一起。
// 前两行是「‹ 字形 当前模式 参数 ›」取景器；背景的模式专属参数由背景注册表自己提供，
// 面板不再按模式写 if 链，新增背景模式会自带快捷控件。

interface AppearanceSectionProps {
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
    isDaylight: boolean;
    visualizerMode: VisualizerMode;
    onVisualizerModeChange: (mode: VisualizerMode) => void;
    useCoverColorBg: boolean;
    onToggleCoverColorBg: (enable: boolean) => void;
    themeSourceModel: ThemeSourceModel;
    onBgModeChange: (mode: ThemeMode) => void;
    hasCustomTheme: boolean;
    defaultTheme: Theme;
    daylightTheme: Theme;
    onClosePanel?: () => void;
}

const ANIMATION_INTENSITIES: Theme['animationIntensity'][] = ['calm', 'normal', 'chaotic'];

const VisualizerCategorySwitcher: React.FC<{
    active: 'folia' | 'jizura';
    isDaylight: boolean;
    onSelect: (category: 'folia' | 'jizura') => void;
    t: (key: string) => string;
}> = ({ active, isDaylight, onSelect, t }) => (
    <div className={`flex w-full items-center gap-0.5 rounded-lg p-0.5 ${isDaylight ? 'bg-black/[0.08]' : 'bg-white/[0.08]'}`}>
        {(['folia', 'jizura'] as const).map(category => {
            const selected = active === category;
            const labelKey = category === 'folia' ? 'options.visualizerCategoryFolia' : 'options.visualizerCategoryJizura';
            const descriptionKey = category === 'folia' ? 'options.visualizerCategoryFoliaDesc' : 'options.visualizerCategoryJizuraDesc';
            return (
                <button
                    key={category}
                    type="button"
                    onClick={() => onSelect(category)}
                    className={`h-7 min-w-0 flex-1 rounded-md px-2 text-[10px] font-bold tracking-wide transition-all ${selected
                        ? (isDaylight ? 'bg-white shadow-sm' : 'bg-white/25 shadow-sm')
                        : 'opacity-55 hover:bg-white/[0.08] hover:opacity-100'}`}
                    title={t(descriptionKey)}
                    aria-label={t(descriptionKey)}
                    aria-pressed={selected}
                >
                    {t(labelKey)}
                </button>
            );
        })}
    </div>
);

const AppearanceSection: React.FC<AppearanceSectionProps> = ({
    theme,
    onThemeChange,
    isDaylight,
    visualizerMode,
    onVisualizerModeChange,
    useCoverColorBg,
    onToggleCoverColorBg,
    themeSourceModel,
    onBgModeChange,
    hasCustomTheme,
    defaultTheme,
    daylightTheme,
    onClosePanel,
}) => {
    const { t } = useTranslation();
    const openSettings = useSettingsModalStore(state => state.openSettings);
    const displaySong = usePlaybackStore(selectDisplaySong);
    const jizuraEnabled = useVisualizerSettingsStore(state => state.jizuraEnabled);
    const setVisualizerMode = useVisualizerSettingsStore(state => state.handleSetVisualizerMode);
    const rerollJizura = useVisualizerSettingsStore(state => state.handleRerollJizura);
    const saveJizuraActiveVariant = useVisualizerSettingsStore(state => state.handleSaveJizuraActiveVariant);
    const randomVisualizerModePerSong = useVisualizerSettingsStore(state => state.randomVisualizerModePerSong);
    const toggleRandomVisualizerModePerSong = useVisualizerSettingsStore(state => state.handleToggleRandomVisualizerModePerSong);
    const setFoliaSongPreset = useVisualizerSettingsStore(state => state.handleSetFoliaSongPreset);
    const resetFoliaSongPreset = useVisualizerSettingsStore(state => state.handleResetFoliaSongPreset);
    const jizuraSongKey = displaySong ? getPlaybackSongKey(displaySong) : null;
    const jizuraSongPreset = useVisualizerSettingsStore(state => (
        jizuraSongKey ? state.jizuraSongPresets[jizuraSongKey] : undefined
    ));
    const foliaSongPreset = useVisualizerSettingsStore(state => (
        jizuraSongKey ? state.foliaSongPresets[jizuraSongKey] : undefined
    ));
    const jizuraActiveVariant = useVisualizerSettingsStore(state => (
        jizuraSongKey && state.jizuraActiveVariant?.songKey === jizuraSongKey
            ? state.jizuraActiveVariant
            : null
    ));
    // Only the modes whose typography is built from word segmentation get the chip; the registry
    // says which, so adding such a mode does not mean editing a list here.
    const usesWordSegmentation = Boolean(getVisualizerRegistryEntry(visualizerMode).usesWordSegmentation);
    const hasSavedSegmentation = useLyricSegmentationStore(state => Boolean(state.record));
    const visualizerBackgroundMode = useVisualizerSettingsStore(state => state.visualizerBackgroundMode);
    const setVisualizerBackgroundMode = useVisualizerSettingsStore(state => state.handleSetVisualizerBackgroundMode);
    const monetBackgroundTuning = useVisualizerSettingsStore(state => state.monetBackgroundTuning);
    const setMonetBackgroundTuning = useVisualizerSettingsStore(state => state.handleSetMonetBackgroundTuning);
    const nomandBackgroundTuning = useVisualizerSettingsStore(state => state.nomandBackgroundTuning);
    const setNomandBackgroundTuning = useVisualizerSettingsStore(state => state.handleSetNomandBackgroundTuning);
    const latentBackgroundTuning = useVisualizerSettingsStore(state => state.latentBackgroundTuning);
    const setLatentBackgroundTuning = useVisualizerSettingsStore(state => state.handleSetLatentBackgroundTuning);

    const visualizerOptions = useMemo(
        () => getFoliaVisualizerEntries().map(entry => ({
            value: entry.mode,
            label: getVisualizerModeLabel(entry.mode, t),
        })),
        [t],
    );
    const visualizerModes = useMemo(() => visualizerOptions.map(option => option.value), [visualizerOptions]);
    const stepVisualizerMode = useVisualizerModeStepper(visualizerModes);

    const backgroundOptions = useMemo(
        () => VISUALIZER_BACKGROUND_REGISTRY.map(entry => ({
            value: entry.mode,
            label: getVisualizerBackgroundModeLabel(entry.mode, t),
        })),
        [t],
    );
    const resolvedBackgroundMode = resolveVisualizerBackgroundMode(visualizerBackgroundMode, visualizerMode);

    const stepBackgroundMode = (direction: -1 | 1) => {
        if (backgroundOptions.length < 2) {
            return;
        }

        const index = backgroundOptions.findIndex(option => option.value === resolvedBackgroundMode);
        const nextIndex = ((index < 0 ? 0 : index) + direction + backgroundOptions.length) % backgroundOptions.length;
        setVisualizerBackgroundMode(backgroundOptions[nextIndex].value);
    };

    const openVisualizerSettings = () => {
        openSettings('options', 'visualizer', 'visualizer');
        onClosePanel?.();
    };

    const openBackgroundSettings = () => {
        openSettings('options', 'visualizer', 'background');
        onClosePanel?.();
    };

    const cycleAnimationIntensity = () => {
        const currentIndex = ANIMATION_INTENSITIES.indexOf(theme.animationIntensity);
        onThemeChange({
            ...theme,
            animationIntensity: ANIMATION_INTENSITIES[(currentIndex + 1) % ANIMATION_INTENSITIES.length],
        });
    };

    const backgroundQuickControls = getVisualizerBackgroundRegistryEntry(resolvedBackgroundMode).renderQuickControls?.({
        config: {
            common: { useCoverColorBg },
            monet: { tuning: monetBackgroundTuning },
            nomand: { tuning: nomandBackgroundTuning },
            latent: { tuning: latentBackgroundTuning },
        },
        actions: {
            common: { onCoverColorChange: onToggleCoverColorBg },
            monet: { onTuningChange: setMonetBackgroundTuning },
            nomand: { onTuningChange: setNomandBackgroundTuning },
            latent: { onTuningChange: setLatentBackgroundTuning },
        },
        t,
        isDaylight,
        theme,
    });

    const selectVisualizerCategory = (nextJizuraEnabled: boolean) => {
        if (nextJizuraEnabled !== jizuraEnabled) {
            if (nextJizuraEnabled) {
                setVisualizerMode('jizura');
            } else {
                setVisualizerMode(visualizerMode);
            }
        }
    };

    return (
        <div className="space-y-1.5">
            <VisualizerCategorySwitcher
                active={jizuraEnabled ? 'jizura' : 'folia'}
                isDaylight={isDaylight}
                onSelect={category => selectVisualizerCategory(category === 'jizura')}
                t={t}
            />
            {jizuraEnabled ? (
                <div className={`flex items-center gap-1 rounded-lg px-1 ${isDaylight ? 'hover:bg-black/[0.06]' : 'hover:bg-white/[0.08]'}`}>
                    <button
                        type="button"
                        onClick={openVisualizerSettings}
                        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left transition-colors"
                        title={t('options.jizuraSettingsDesc')}
                        aria-label={t('options.jizuraLyricMv')}
                    >
                        <span className="flex shrink-0 items-center opacity-65">
                            <Sparkles size={14} />
                        </span>
                        <span className="truncate text-[11px] font-semibold tracking-wide" style={{ color: theme.primaryColor }}>
                            {t('options.jizuraLyricMv')}
                        </span>
                    </button>
                    {displaySong && (
                        <div className="flex shrink-0 items-center gap-1">
                            <QuickControlChip
                                isDaylight={isDaylight}
                                label={t('options.jizuraRandom')}
                                title={t('options.jizuraRandomDesc')}
                                onClick={() => rerollJizura(jizuraSongKey)}
                            />
                            {!jizuraSongPreset && jizuraActiveVariant && (
                                <QuickControlChip
                                    isDaylight={isDaylight}
                                    label={t('options.jizuraSaveRandom')}
                                    title={t('options.jizuraSaveRandomDesc')}
                                    onClick={() => jizuraSongKey && saveJizuraActiveVariant(jizuraSongKey)}
                                />
                            )}
                            <QuickControlChip
                                isDaylight={isDaylight}
                                label={t('options.jizuraCustomizeSong')}
                                title={t('options.jizuraCustomizeSongDesc')}
                                onClick={openVisualizerSettings}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <ModeStepperRow<VisualizerMode>
                        value={visualizerMode}
                        options={visualizerOptions}
                        onSelect={onVisualizerModeChange}
                        onStep={stepVisualizerMode}
                        renderGlyph={mode => <VisualizerModeGlyph mode={mode} />}
                        ariaLabel={t('ui.animationMode')}
                        moreLabel={t('ui.moreSettings')}
                        onOpenMore={openVisualizerSettings}
                        isDaylight={isDaylight}
                        primaryColor={theme.primaryColor}
                        trailing={(
                        <>
                            <QuickControlToggle
                                active={randomVisualizerModePerSong}
                                theme={theme}
                                label={t('options.foliaRandomPerSong')}
                                onToggle={() => {
                                    if (jizuraSongKey && foliaSongPreset) {
                                        resetFoliaSongPreset(jizuraSongKey);
                                    }
                                    toggleRandomVisualizerModePerSong(!randomVisualizerModePerSong);
                                }}
                            >
                                <Shuffle size={14} />
                            </QuickControlToggle>
                            <QuickControlChip
                                isDaylight={isDaylight}
                                label={t(`animation.${theme.animationIntensity}`)}
                                title={`${t('ui.animationIntensity')}: ${t(`animation.${theme.animationIntensity}`)}`}
                                onClick={cycleAnimationIntensity}
                            />
                            {displaySong && jizuraSongKey && (
                                <QuickControlChip
                                    isDaylight={isDaylight}
                                    label={foliaSongPreset ? t('options.foliaUnfixSong') : t('options.foliaFixSong')}
                                    title={t(foliaSongPreset ? 'options.foliaUnfixSongDesc' : 'options.foliaFixSongDesc')}
                                    onClick={() => foliaSongPreset
                                        ? resetFoliaSongPreset(jizuraSongKey)
                                        : setFoliaSongPreset(jizuraSongKey, visualizerMode)}
                                />
                            )}
                            {usesWordSegmentation && (
                                <QuickControlToggle
                                    active={hasSavedSegmentation}
                                    theme={theme}
                                    label={t('commandPalette.commands.lyric-segmentation.title')}
                                    onToggle={() => {
                                        openCommandPaletteCommand(LYRIC_SEGMENTATION_COMMAND_ID);
                                        onClosePanel?.();
                                    }}
                                >
                                    <WholeWord size={14} />
                                </QuickControlToggle>
                            )}
                        </>
                        )}
                    />
                </>
            )}

            {!jizuraEnabled && (
                <>
                    <ModeStepperRow<VisualizerBackgroundMode>
                        value={resolvedBackgroundMode}
                        options={backgroundOptions}
                        onSelect={setVisualizerBackgroundMode}
                        onStep={stepBackgroundMode}
                        renderGlyph={mode => <BackgroundModeGlyph mode={mode} />}
                        ariaLabel={t('options.visualizerBackgroundMode')}
                        moreLabel={t('ui.moreSettings')}
                        onOpenMore={openBackgroundSettings}
                        isDaylight={isDaylight}
                        primaryColor={theme.primaryColor}
                        trailing={backgroundQuickControls}
                    />

                    <div className="pt-1">
                        <ThemeSourceRow
                            themeSourceModel={themeSourceModel}
                            onBgModeChange={onBgModeChange}
                            hasCustomTheme={hasCustomTheme}
                            defaultTheme={defaultTheme}
                            daylightTheme={daylightTheme}
                            isDaylight={isDaylight}
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default AppearanceSection;
