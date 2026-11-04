import React from 'react';
import { PlayerController } from '../hooks/usePlayer';
export interface MiniLayoutProps {
    controller: PlayerController;
    status: 'ready' | 'loading' | 'disabled';
    size?: number;
}
/** A play/pause button and nothing else. Title (if any) is the aria label. */
export declare const MiniLayout: React.FC<MiniLayoutProps>;
