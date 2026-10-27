import { useState, useRef, useEffect } from 'react';
import { FiGlobe, FiCheck } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, changeLanguage, type SupportedLanguage } from '../i18n';

export function LanguagePickerDropdown() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ??
    SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Change language"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-gray-700/60 bg-gray-800/80 px-2.5 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700/60 hover:text-white"
      >
        <FiGlobe size={14} className="text-amber-400" />
        <span>{currentLang.nativeName}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl z-50 py-1"
        >
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = i18n.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                role="menuitem"
                onClick={() => {
                  changeLanguage(lang.code as SupportedLanguage);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                  isSelected
                    ? 'bg-amber-500/10 text-amber-400 font-medium'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{lang.nativeName}</span>
                {isSelected && <FiCheck size={13} className="text-amber-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
