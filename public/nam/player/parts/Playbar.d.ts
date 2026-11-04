import React, { ReactNode } from 'react';
import { PlayerController } from '../hooks/usePlayer';
interface PlaybarProps {
    controller: PlayerController;
    disabled?: boolean;
    headerSlot?: ReactNode;
    /** `compact` layout: render the expand/collapse chevron. */
    expandToggle?: boolean;
}
/**
 * Transport + waveform. Demo: play, skip, waveform, time. Live: LED ·
 * LIVE | mute/unmute, scope. Same bar, same visualizer.
 */
export declare const Playbar: React.FC<PlaybarProps>;
export {};
