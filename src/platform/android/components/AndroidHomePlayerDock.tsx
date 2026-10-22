import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { MotionValue } from 'framer-motion';
import { PlayerState } from '../../../types';
import ProgressBar from '../../../components/ProgressBar';

type AndroidHomePlayerDockProps = {
    title: string;
    playerState: PlayerState;
    currentTime: MotionValue<number>;
    duration: number;
    canTogglePlay: boolean;
    disabled: boolean;
    primaryColor: string;
    secondaryColor: string;
    trackColor: string;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    onCollapse: () => void;
};

/** A touch-first expanded state for the small Android home dock. The full player
 * remains one tap away; this state only adds a usable, larger seek target. */
const AndroidHomePlayerDock: React.FC<AndroidHomePlayerDockProps> = ({
    title,
    playerState,
    currentTime,
    duration,
    canTogglePlay,
    disabled,
    primaryColor,
    secondaryColor,
    trackColor,
    onSeek,
    onTogglePlay,
    onCollapse,
}) => {
    const { t } = useTranslation();
    const isPlaying = playerState === PlayerState.PLAYING;

    return (
        <div className="folia-android-home-player-expanded">
            <div className="folia-android-home-player-heading">
                <button
                    type="button"
                    aria-label={t(isPlaying ? 'pause' : 'play')}
                    disabled={!canTogglePlay || disabled}
                    onClick={(event) => {
                        event.stopPropagation();
                        onTogglePlay();
                    }}
                    className="folia-android-home-player-play"
                    style={{ backgroundColor: primaryColor, color: 'var(--bg-color)' }}
                >
                    {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <span className="folia-android-home-player-title" style={{ color: primaryColor }} title={title}>
                    {title}
                </span>
                <button
                    type="button"
                    aria-label={t('collapsePlayerBar')}
                    title={t('collapsePlayerBar')}
                    onClick={(event) => {
                        event.stopPropagation();
                        onCollapse();
                    }}
                    className="folia-android-home-player-collapse"
                >
                    <ChevronDown size={16} />
                </button>
            </div>
            <div className="folia-android-player-progress">
                <ProgressBar
                    currentTime={currentTime}
                    duration={duration}
                    onSeek={onSeek}
                    primaryColor={primaryColor}
                    secondaryColor={secondaryColor}
                    trackColor={trackColor}
                    disabled={disabled || duration <= 0}
                    unknownDurationText="--:--"
                />
            </div>
        </div>
    );
};

export default AndroidHomePlayerDock;
