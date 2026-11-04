import React from 'react';
interface MonitorButtonProps {
    isMonitoring: boolean;
    onClick: () => void;
    /** Drives the ring; pass `null` when idle. */
    analyserNode: AnalyserNode | null;
    size?: number;
    disabled?: boolean;
    /** Rendered inside the button after the LED, e.g. `LIVE | 🔇`. */
    trailing?: React.ReactNode;
}
/**
 * The Live-mode counterpart of PlayButton: a dot with a ring that breathes
 * with the input level while monitoring. Click to mute / unmute.
 */
export declare const MonitorButton: React.FC<MonitorButtonProps>;
export {};
