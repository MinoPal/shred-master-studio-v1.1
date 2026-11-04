import React from 'react';
type AlertVariant = 'error' | 'warning' | 'info';
interface AlertProps {
    variant: AlertVariant;
    children: React.ReactNode;
    className?: string;
}
/** One-line status message with a leading icon. Colors come from the tokens. */
export declare const Alert: React.FC<AlertProps>;
export {};
