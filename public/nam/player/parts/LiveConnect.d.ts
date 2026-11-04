import React from 'react';
import { PlayerController } from '../hooks/usePlayer';
interface LiveConnectProps {
    controller: PlayerController;
    disabled?: boolean;
    /** Where to send the user when live mode can't run here (embeds). */
    href?: string;
    linkTarget?: '_blank' | '_self';
}
/**
 * The "Play Live" takeover shown in the controls' place until an interface
 * is connected. Connect opens the inline setup wizard (permission →
 * interface); with permission already granted it also starts connecting.
 */
export declare const LiveConnect: React.FC<LiveConnectProps>;
export {};
