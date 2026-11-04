import React from 'react';
interface PlayButtonProps {
    isPlaying: boolean;
    isBusy?: boolean;
    disabled?: boolean;
    size?: number;
    onClick: () => void;
    label?: string;
}
/** The one play/pause/loading affordance used by every layout and row. */
export declare const PlayButton: React.FC<PlayButtonProps>;
export {};
