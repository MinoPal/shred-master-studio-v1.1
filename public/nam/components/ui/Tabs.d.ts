import React, { ReactNode } from 'react';
interface TabProps {
    tabs: (string | ReactNode)[];
    activeTab: number;
    setActiveTab: (index: number) => void;
    disabled?: boolean;
    /** Stretch tabs across the container (default) or size them to content. */
    fill?: boolean;
}
declare const Tabs: ({ tabs, activeTab, setActiveTab, disabled, fill, }: TabProps) => React.JSX.Element;
export { Tabs };
