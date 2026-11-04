import React from 'react';
import { T3kPlayerProps } from '../types';
/**
 * The player. One component for every surface:
 *
 * - one tone → single player; two or more → playlist
 * - `layout` picks `mini` | `compact` | `full`
 * - all state changes surface through `onEvent`
 *
 * Must be rendered inside `T3kPlayerProvider`.
 */
export declare const T3kPlayer: React.FC<T3kPlayerProps>;
export default T3kPlayer;
