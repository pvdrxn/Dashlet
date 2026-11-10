import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiX,
  FiMoon,
  FiSun,
  FiGlobe,
  FiCheck,
  FiCommand,
} from 'react-icons/fi';
import { SUPPORTED_LANGUAGES, changeLanguage, type SupportedLanguage } from '../i18n';
import { getInitialTheme, applyTheme, type Theme } from '../theme';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggleTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-view-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[#232B3B] bg-[#141A26] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 24px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#232B3B] bg-[#0D111A]/80">
          <div>
            <h2 className="text-sm font-semibold text-[#DCE4EC] tracking-wide">
              {t('settings.title', 'Ajustes y Preferencias')}
            </h2>
            <p className="text-xs text-[#8B9BB0] mt-0.5">
              Configura el entorno de trabajo de Dashlet
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#232B3B] bg-[#1C2436] text-[#8B9BB0] hover:text-[#DCE4EC] hover:bg-[#232B3B] transition-colors cursor-pointer"
            title="Cerrar"
          >
            <FiX size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          {/* Theme Section */}
          <div className="rounded-xl border border-[#232B3B] bg-[#0D111A]/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#232B3B] bg-[#1C2436] text-[#FFC20D]">
                  {theme === 'dark' ? <FiMoon size={16} /> : <FiSun size={16} />}
                </span>
                <div>
                  <h3 className="text-xs font-medium text-[#DCE4EC]">Tema de Interfaz</h3>
                  <p className="text-[11px] text-[#8B9BB0]">
                    Alterna entre modo oscuro técnico y claro
                  </p>
                </div>
              </div>

              <div className="flex items-center rounded-lg border border-[#232B3B] p-0.5 bg-[#182030]">
                <button
                  type="button"
                  onClick={() => toggleTheme('dark')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-[#FFC20D] text-[#0D111A] font-medium shadow-sm'
                      : 'text-[#8B9BB0] hover:text-[#DCE4EC]'
                  }`}
                >
                  <FiMoon size={12} />
                  <span>Oscuro</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleTheme('light')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${
                    theme === 'light'
                      ? 'bg-[#FFC20D] text-[#0D111A] font-medium shadow-sm'
                      : 'text-[#8B9BB0] hover:text-[#DCE4EC]'
                  }`}
                >
                  <FiSun size={12} />
                  <span>Claro</span>
                </button>
              </div>
            </div>
          </div>

          {/* Language Section */}
          <div className="rounded-xl border border-[#232B3B] bg-[#0D111A]/50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#232B3B] bg-[#1C2436] text-[#8B9BB0]">
                <FiGlobe size={16} />
              </span>
              <div>
                <h3 className="text-xs font-medium text-[#DCE4EC]">
                  {t('settings.preferencesTab.language.title', 'Idioma')}
                </h3>
                <p className="text-[11px] text-[#8B9BB0]">
                  {t('settings.preferencesTab.language.selectLanguageDesc', 'Selecciona el idioma del espacio de trabajo')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = i18n.language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => changeLanguage(lang.code as SupportedLanguage)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#FFC20D]/40 bg-[#FFC20D]/15 text-[#DCE4EC]'
                        : 'border-[#232B3B] bg-[#1C2436] text-[#8B9BB0] hover:border-[#313D53] hover:text-[#DCE4EC]'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{lang.nativeName}</span>
                      <span className="text-[10px] text-[#8B9BB0]/70">{lang.name}</span>
                    </div>
                    {isSelected && <FiCheck className="text-[#FFC20D]" size={14} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Keyboard Shortcuts Reference */}
          <div className="rounded-xl border border-[#232B3B] bg-[#0D111A]/50 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[#DCE4EC]">
              <FiCommand size={14} className="text-[#FFC20D]" />
              <span>Atajos de teclado</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-[#8B9BB0]">Cerrar ventana / Ajustes</span>
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-[#1C2436] border border-[#232B3B] text-[#DCE4EC] font-mono">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
