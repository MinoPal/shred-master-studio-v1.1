import React from 'react';
interface PagerProps {
    index: number;
    count: number;
    onStep: (delta: 1 | -1) => void | Promise<void>;
    disabled?: boolean;
    className?: string;
}
/** ‹ n/N › — steps the active tone of a playlist. */
export declare const Pager: React.FC<PagerProps>;
export {};
