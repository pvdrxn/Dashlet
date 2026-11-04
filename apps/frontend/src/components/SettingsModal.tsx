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
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#16181D] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 24px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#0F1013]/60">
          <div>
            <h2 className="text-sm font-semibold text-[#F1F3F5] tracking-wide">
              {t('settings.title', 'Ajustes y Preferencias')}
            </h2>
            <p className="text-xs text-[#8E95A2] mt-0.5">
              Configura el entorno de trabajo de Dashlet
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            title="Cerrar"
          >
            <FiX size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          {/* Theme Section */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0F1013]/40 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-p2/30 bg-p2/15 text-p2">
                  {theme === 'dark' ? <FiMoon size={16} /> : <FiSun size={16} />}
                </span>
                <div>
                  <h3 className="text-xs font-medium text-[#F1F3F5]">Tema de Interfaz</h3>
                  <p className="text-[11px] text-[#8E95A2]">
                    Alterna entre modo oscuro técnico y claro
                  </p>
                </div>
              </div>

              <div className="flex items-center rounded-lg border border-white/10 p-0.5 bg-[#16181D]">
                <button
                  type="button"
                  onClick={() => toggleTheme('dark')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
                    theme === 'dark'
                      ? 'bg-p2 text-gray-950 font-medium shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FiMoon size={12} />
                  <span>Oscuro</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleTheme('light')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
                    theme === 'light'
                      ? 'bg-p2 text-gray-950 font-medium shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <FiSun size={12} />
                  <span>Claro</span>
                </button>
              </div>
            </div>
          </div>

          {/* Language Section */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0F1013]/40 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-gray-300">
                <FiGlobe size={16} />
              </span>
              <div>
                <h3 className="text-xs font-medium text-[#F1F3F5]">
                  {t('settings.preferencesTab.language.title', 'Idioma')}
                </h3>
                <p className="text-[11px] text-[#8E95A2]">
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
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'border-p2/40 bg-p2/15 text-[#F1F3F5]'
                        : 'border-white/[0.08] bg-[#16181D] text-gray-400 hover:border-white/15 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">{lang.nativeName}</span>
                      <span className="text-[10px] text-gray-500">{lang.name}</span>
                    </div>
                    {isSelected && <FiCheck className="text-p2" size={14} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Keyboard Shortcuts Reference */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0F1013]/40 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F1F3F5]">
              <FiCommand size={14} className="text-p2" />
              <span>Atajos de teclado</span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-[#8E95A2]">Cerrar ventana / Ajustes</span>
                <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] border border-white/[0.08] text-gray-300 font-mono">
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
