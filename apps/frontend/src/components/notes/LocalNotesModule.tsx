import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiFileText,
  FiPlus,
  FiTrash2,
  FiCheck,
  FiClock,
  FiEdit3,
} from 'react-icons/fi';
import {
  fetchNotes,
  fetchNoteContent,
  createNote,
  updateNote,
  deleteNote,
} from '../../api/notes';
import type { NoteFileDto } from '@widget-master/shared';

export interface LocalNotesModuleProps {
  className?: string;
}

export function LocalNotesModule({ className = '' }: LocalNotesModuleProps) {
  const [notes, setNotes] = useState<NoteFileDto[]>([]);
  const [activeFilename, setActiveFilename] = useState<string | null>(null);

  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [loading, setLoading] = useState(true);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // Cargar lista de notas al inicio
  const loadNotesList = useCallback(async (selectFilename?: string) => {
    try {
      setLoading(true);
      const list = await fetchNotes();
      setNotes(list);

      const toSelect = selectFilename ?? (list.length > 0 ? list[0].filename : null);
      if (toSelect) {
        setActiveFilename(toSelect);
        const note = await fetchNoteContent(toSelect);
        setTitleDraft(note.filename.replace(/\.(md|txt)$/i, ''));
        setContentDraft(note.content || '');
      } else {
        setActiveFilename(null);
        setTitleDraft('');
        setContentDraft('');
      }
    } catch {
      // Manejo silencioso o fallback local
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotesList();
  }, [loadNotesList]);

  // Selección de una nota de la lista
  const handleSelectNote = async (filename: string) => {
    if (filename === activeFilename) return;

    // Si había cambios pendientes en la nota anterior, guardarlos de inmediato
    if (isDirtyRef.current && activeFilename) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      await updateNote(activeFilename, { content: contentDraft }).catch(() => {});
      isDirtyRef.current = false;
    }

    try {
      setActiveFilename(filename);
      const note = await fetchNoteContent(filename);
      const baseTitle = note.filename.replace(/\.(md|txt)$/i, '');
      setTitleDraft(baseTitle);
      setContentDraft(note.content || '');
      setSavingStatus('idle');
    } catch {
      // Ignorar
    }
  };

  // Crear nueva nota
  const handleCreateNote = async () => {
    try {
      const defaultTitle = `Nota ${new Date().toLocaleDateString('es-ES', {
        month: 'short',
        day: 'numeric',
      })}`;
      const newNote = await createNote({ title: defaultTitle, content: '' });
      await loadNotesList(newNote.filename);
    } catch {
      // Fallback
    }
  };

  // Borrar nota activa
  const handleDeleteNote = async (e: React.MouseEvent, filename: string) => {
    e.stopPropagation();
    try {
      await deleteNote(filename);
      const nextList = notes.filter((n) => n.filename !== filename);
      setNotes(nextList);
      if (activeFilename === filename) {
        if (nextList.length > 0) {
          void handleSelectNote(nextList[0].filename);
        } else {
          setActiveFilename(null);
          setTitleDraft('');
          setContentDraft('');
        }
      }
    } catch {
      // Fallback
    }
  };

  // Auto-guardado debounced al escribir
  const triggerAutoSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (!activeFilename) return;
      isDirtyRef.current = true;
      setSavingStatus('saving');

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const updated = await updateNote(activeFilename, {
            title: newTitle,
            content: newContent,
          });
          isDirtyRef.current = false;
          setSavingStatus('saved');

          // Actualizar lista local de notas
          setNotes((prev) =>
            prev.map((n) =>
              n.filename === activeFilename
                ? {
                    ...n,
                    title: newTitle || n.title,
                    updatedAt: updated.updatedAt,
                  }
                : n,
            ),
          );

          setTimeout(() => {
            setSavingStatus('idle');
          }, 1500);
        } catch {
          setSavingStatus('idle');
        }
      }, 600);
    },
    [activeFilename],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitleDraft(val);
    triggerAutoSave(val, contentDraft);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContentDraft(val);
    triggerAutoSave(titleDraft, val);
  };

  return (
    <div
      className={`flex h-full w-full rounded-lg border border-[#262930] bg-[#16181D] overflow-hidden shadow-sm ${className}`}
    >
      {/* Panel Izquierdo: Lista de Notas */}
      <div className="flex w-56 sm:w-64 shrink-0 flex-col border-r border-[#262930] bg-[#121418]">
        {/* Cabecera del panel lateral */}
        <div className="flex h-11 items-center justify-between border-b border-[#262930] px-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <FiFileText className="text-p2" size={14} />
            <span>Notas & Diario</span>
          </div>
          <button
            type="button"
            onClick={handleCreateNote}
            title="Nueva nota"
            className="flex h-6 w-6 items-center justify-center rounded border border-[#262930] bg-[#16181D] text-white/70 hover:text-p2 hover:border-p2/40 transition-colors cursor-pointer"
          >
            <FiPlus size={13} />
          </button>
        </div>

        {/* Lista scrolleable de notas */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && notes.length === 0 ? (
            <div className="py-6 text-center text-xs text-white/40">Cargando...</div>
          ) : notes.length === 0 ? (
            <div className="py-8 text-center text-xs text-white/40">
              <p>Sin notas aún</p>
              <button
                type="button"
                onClick={handleCreateNote}
                className="mt-2 text-[11px] text-p2 hover:underline cursor-pointer"
              >
                + Crear primera nota
              </button>
            </div>
          ) : (
            notes.map((note) => {
              const isSelected = note.filename === activeFilename;
              const dateStr = note.updatedAt
                ? new Date(note.updatedAt).toLocaleDateString('es-ES', {
                    month: 'short',
                    day: 'numeric',
                  })
                : '';

              return (
                <div
                  key={note.filename}
                  onClick={() => void handleSelectNote(note.filename)}
                  className={`group flex items-center justify-between rounded px-2.5 py-2 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-p2/15 text-p2 font-medium border border-p2/30'
                      : 'text-white/70 hover:bg-white/[0.04] hover:text-white border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-1.5">
                    <p className="truncate font-medium leading-snug">
                      {note.title || note.filename}
                    </p>
                    <span className="flex items-center gap-1 text-[10px] text-white/40 font-mono mt-0.5">
                      <FiClock size={10} />
                      {dateStr}
                    </span>
                  </div>
                  <button
                    type="button"
                    title="Eliminar nota"
                    onClick={(e) => void handleDeleteNote(e, note.filename)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-white/40 hover:text-red-400 transition-opacity"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Panel Derecho: Editor Activo */}
      <div className="flex flex-1 min-w-0 flex-col bg-[#16181D]">
        {activeFilename ? (
          <>
            {/* Header del editor con título editable y estado de guardado */}
            <div className="flex h-11 items-center justify-between border-b border-[#262930] px-4">
              <div className="flex items-center gap-2 flex-1 min-w-0 mr-3">
                <FiEdit3 className="text-white/40 shrink-0" size={13} />
                <input
                  type="text"
                  value={titleDraft}
                  onChange={handleTitleChange}
                  placeholder="Título de la nota..."
                  className="w-full bg-transparent text-xs font-semibold text-white placeholder-white/30 outline-none focus:ring-1 focus:ring-p2/40 rounded px-1.5 py-0.5"
                />
              </div>

              {/* Indicador de guardado */}
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-white/40 shrink-0">
                {savingStatus === 'saving' && (
                  <span className="text-amber-400/90 animate-pulse">Guardando...</span>
                )}
                {savingStatus === 'saved' && (
                  <span className="flex items-center gap-1 text-emerald-400/90">
                    <FiCheck size={12} /> Guardado
                  </span>
                )}
                {savingStatus === 'idle' && (
                  <span className="text-white/30 text-[10px] truncate max-w-[120px]">
                    {activeFilename}
                  </span>
                )}
              </div>
            </div>

            {/* Área de texto / Markdown */}
            <div className="flex-1 p-4">
              <textarea
                value={contentDraft}
                onChange={handleContentChange}
                placeholder="Escribe tus notas, reflexiones o diario aquí (formato markdown admitido)..."
                className="h-full w-full resize-none bg-transparent font-sans text-xs leading-relaxed text-[#F1F3F5] placeholder-white/20 outline-none select-text"
              />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-xs text-white/40 p-6 text-center">
            <FiFileText size={28} className="text-white/20 mb-2" />
            <p>Selecciona una nota para editar o crea una nueva.</p>
          </div>
        )}
      </div>
    </div>
  );
}
