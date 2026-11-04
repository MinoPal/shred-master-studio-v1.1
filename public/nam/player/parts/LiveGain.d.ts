import React from 'react';
interface LiveGainProps {
    label: string;
    /** Monitoring is running, so the meter is live. */
    active: boolean;
}
/** `Input: (knob) ▮▮▮▯▯ ●` — the live counterpart of the Input select. */
export declare const LiveGain: React.FC<LiveGainProps>;
export {};
