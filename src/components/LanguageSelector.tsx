import React from "react";
import { useLanguage } from "../context/LanguageContext";

export const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as "it" | "en" | "es")}
        className="bg-secondary text-foreground text-xs font-semibold px-2 py-1 rounded-md border border-border focus:outline-none cursor-pointer"
      >
        <option value="it">🇮🇹 IT</option>
        <option value="en">🇬🇧 EN</option>
        <option value="es">🇪🇸 ES</option>
      </select>
    </div>
  );
};