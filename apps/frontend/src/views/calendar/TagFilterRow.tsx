import { useEffect, useRef, useState } from 'react';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import { TAG_COLORS, tagColorHex, MAX_TAG_NAME_LENGTH } from '@widget-master/shared';
import type { TagDto, UpdateTagDto } from '@widget-master/shared';

/*
 * Fila de etiquetas: filtra, renombra y borra.
 *
 * Es TODO el vocabulario en un solo lugar. La alternativa --una pantalla de
 * gestion aparte-- seria mas sitio para lo mismo: aca ya esta el nombre de cada
 * etiqueta, su color y cuantos bloques la usan, que es exactamente lo que hace
 * falta para decidir si borrar algo.
 *
 * Filtrar es OR: varias eleccionadas muestran lo que tenga cualquiera de ellas.
 * AND (buscar "work Y personal") casi nunca es lo que se quiere en un
 * calendario personal, y de todos modos es cambiar una linea.
 */

interface TagFilterRowProps {
  tags: TagDto[];
  activeIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onRename: (id: string, dto: UpdateTagDto) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

type Mode = { kind: 'idle' } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string };

export function TagFilterRow({
  tags,
  activeIds,
  onToggle,
  onClear,
  onRename,
  onDelete,
}: TagFilterRowProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (tag: TagDto) => {
    setMode({ kind: 'rename', id: tag.id });
    setDraftName(tag.name);
    setDraftColor(tag.color);
  };

  useEffect(() => {
    if (mode.kind === 'rename') inputRef.current?.focus();
  }, [mode]);

  const commitRename = async () => {
    if (mode.kind !== 'rename') return;
    const name = draftName.trim();
    const id = mode.id;
    setMode({ kind: 'idle' });
    if (!name) return;
    const dto: UpdateTagDto = {};
    if (name !== tags.find((t) => t.id === id)?.name) dto.name = name;
    if (draftColor !== tags.find((t) => t.id === id)?.color) dto.color = draftColor as never;
    if (Object.keys(dto).length) await onRename(id, dto);
  };

  const commitDelete = async () => {
    if (mode.kind !== 'delete') return;
    const id = mode.id;
    setMode({ kind: 'idle' });
    await onDelete(id);
  };

  if (!tags.length) return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-gray-700/60 px-4 py-1.5">
      {tags.map((tag) => {
        const active = activeIds.includes(tag.id);
        const hex = tagColorHex(tag.color);
        const renaming = mode.kind === 'rename' && mode.id === tag.id;
        const deleting = mode.kind === 'delete' && mode.id === tag.id;

        if (renaming) {
          return (
            <div key={tag.id} className="flex shrink-0 items-center gap-1.5 rounded border border-gray-600 bg-gray-800 px-1.5 py-1">
              <div className="flex items-center gap-1">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setDraftColor(c.id)}
                    aria-label={`Use color ${c.id}`}
                    className={`h-3.5 w-3.5 rounded-full ring-offset-1 ring-offset-gray-900 ${
                      draftColor === c.id ? 'ring-2 ring-white' : ''
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              <input
                ref={inputRef}
                value={draftName}
                maxLength={MAX_TAG_NAME_LENGTH}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void commitRename();
                  if (e.key === 'Escape') setMode({ kind: 'idle' });
                }}
                aria-label={`Rename tag ${tag.name}`}
                className="w-28 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500/50"
              />
              <button
                type="button"
                onClick={() => void commitRename()}
                className="rounded px-1.5 py-0.5 text-xs text-p2 transition-colors hover:bg-p2/15"
              >
                Save
              </button>
            </div>
          );
        }

        if (deleting) {
          return (
            <div
              key={tag.id}
              className="flex shrink-0 items-center gap-2 rounded border border-danger/50 bg-danger/10 px-2 py-1"
            >
              <span className="text-xs text-gray-300">
                {/*
                 * Decir CUANTOS bloques toca. Sin el numero, borrar se lee como
                 * borrar una etiqueta y no como sacarla de todos lados.
                 */}
                Remove {tag.name} from{' '}
                <span className="text-white">
                  {tag.eventCount} {tag.eventCount === 1 ? 'block' : 'blocks'}
                </span>
                ?
              </span>
              <button
                type="button"
                onClick={() => void commitDelete()}
                className="rounded px-1.5 py-0.5 text-xs text-danger transition-colors hover:bg-danger/15"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setMode({ kind: 'idle' })}
                className="rounded px-1.5 py-0.5 text-xs text-gray-400 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
            </div>
          );
        }

        return (
          <div key={tag.id} className="group/tag relative flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onToggle(tag.id)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 rounded border py-1 pr-2 pl-1.5 text-xs transition-colors ${
                active
                  ? 'border-transparent bg-white/[0.07] text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: hex }}
              />
              <span style={active ? { color: hex } : undefined}>{tag.name}</span>
              {/* El 0 tambien se muestra: una etiqueta sin bloques se reconoce
                  como tal en vez de parecer un filtro sin uso. */}
              <span className="tabular-nums text-gray-500">{tag.eventCount}</span>
            </button>
            <div className="ml-0.5 flex items-center opacity-0 transition-opacity group-hover/tag:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={() => startRename(tag)}
                aria-label={`Rename tag ${tag.name}`}
                title="Rename"
                className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
              >
                <FiEdit2 size={11} />
              </button>
              <button
                type="button"
                onClick={() => setMode({ kind: 'delete', id: tag.id })}
                aria-label={`Delete tag ${tag.name}`}
                title="Delete"
                className="rounded p-1 text-gray-500 transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <FiTrash2 size={11} />
              </button>
            </div>
          </div>
        );
      })}

      {activeIds.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          Clear
        </button>
      )}
    </div>
  );
}