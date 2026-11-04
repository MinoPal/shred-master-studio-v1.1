import React from 'react';
import { ToneMeta } from '../../types';
interface ToneHeaderProps {
    meta: ToneMeta;
    /** `default` for the full layout, `dense` for compact playlists. */
    variant?: 'default' | 'dense';
    linkTarget?: '_blank' | '_self';
}
/**
 * Image, title, then one line of facts styled like a tone3000 tone card:
 * avatar name ✓ · subtitle (gear) · format pill.
 */
export declare const ToneHeader: React.FC<ToneHeaderProps>;
export {};
