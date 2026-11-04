import React from 'react';
interface AvatarProps {
    src?: string;
    /** For the image alt; the fallback is decorative. */
    name: string;
    size: number;
}
/**
 * Round profile image with the tone3000 fallback silhouette
 * (`components/ui/ProfileUser/ProfileAvatar.tsx` there).
 */
export declare const Avatar: React.FC<AvatarProps>;
export {};
