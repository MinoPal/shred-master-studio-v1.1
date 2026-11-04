import React, { ReactNode } from 'react';
import { PlayerController } from '../hooks/usePlayer';
export interface PanelLayoutProps {
    controller: PlayerController;
    layout: 'compact' | 'full';
    live: boolean;
    status: 'ready' | 'loading' | 'disabled';
    disabledReason?: string;
    headerSlot?: ReactNode;
    attribution: boolean;
    linkTarget: '_blank' | '_self';
    /** Drop the top border + radius so the panel docks under a host card. */
    docked: boolean;
}
/**
 * `compact` and `full` are one set of sections in two orders.
 *
 * `full` (tone page, share embed):
 *
 *   [ Sample | Plug in and play            Powered by ]   source tabs / attribution
 *   [ image  title · author · gear · pill       ‹ n/N › ]   tone header (+ pager)
 *   [ playbar                                          ]
 *   [ controls | live setup wizard | play live         ]
 *
 * `compact` (docked under a card, or a standalone bar in an embed): the
 * playbar is the whole collapsed player; the chevron opens the tabs and the
 * body beneath it.
 *
 *   [ image  title                             ‹ n/N › ]   dense header: playlists, or not docked
 *   [ playbar                                        ⌄ ]
 *   [ Sample | Plug in and play            Powered by ]   ┐ expanded
 *   [ controls | live setup wizard | play live         ]   ┘
 */
export declare const PanelLayout: React.FC<PanelLayoutProps>;
