import { useEffect, useMemo, useRef, useState } from 'react';
import { FiX, FiTag, FiEdit2, FiTrash2 } from 'react-icons/fi';
import { TAG_COLORS, tagColorHex, tagKey, nextFreeTagColorId, MAX_TAG_NAME_LENGTH, type TagColorId } from '@widget-master/shared';
import type { TagDto, UpdateTagDto } from '@widget-master/shared';

/*
 * Selector de etiqueta del editor.
 *
 * UNA sola etiqueta por bloque.
 *
 * El desplegable hace las TRES cosas del vocabulario de una persona: elegir,
 * renombrar y borrar. Renombrar y borrar estan ahi y no en otra parte del
 * calendario porque la fila que vas a renombrar es la misma que acabas de elegir:
 * tenerla abierta y editable a la vista es la mitad del trabajo.
 *
 * El campo ESCRIBE. No hay un paso previo de "crear" ni un boton para eso: lo
 * que se escribe resuelve solo. Al Enter -- o al sacar el foco -- el texto se
 * contrasta contra el vocabulario y pasa a ser, en este orden:
 *
 *   1. La etiqueta que ya se llama EXACTAMENTE asi (sin distinguir mayusculas).
 *      Escribir "Work" cuando existe "work" no crea una segunda: toma la que ya
 *      esta, que es justo el caso que un campo de texto libre no puede cubrir.
 *   2. Si el filtro deja UNA sola etiqueta, esa. Es lo que pasa al teclear un
 *      prefijo, y tomarla evita el desastre de crear "wor" al lado de "work".
 *   3. Si el filtro NO deja ninguna, el texto es el nombre de una etiqueta
 *      nueva.
 *   4. Si deja varias y ninguna es exacta, no pasa nada: hay que afinar. Crear
 *      "w" al lado de "work" y "weekly" es peor que no hacer nada.
 *
 * La etiqueta nueva no se crea todavia: queda con un color provisional y se
 * guarda recien al confirmar el bloque. Crearla al tecearla dejaria una
 * etiqueta abandonada si el usuario cancela el bloque entero.
 */

interface PendingTag {
  name: string;
  /** Color provisional: el mismo que le daria el servidor al crearla, o `null`. */
  color: string | null;
}

interface TagPickerProps {
  tags: TagDto[];
  /** Id de la etiqueta actual, o `null` si el bloque no tiene. */
  tagId: string | null;
  /** Nombre escrito que todavia no existe como etiqueta. */
  pendingName: string;
  onChange: (next: { tagId: string | null; pendingName: string }) => void;
  onRename: (id: string, dto: UpdateTagDto) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  disabled?: boolean;
}

export function TagPicker({
  tags,
  tagId,
  pendingName,
  onChange,
  onRename,
  onDelete,
  disabled = false,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Id de la etiqueta que se esta renombrando, o `null` si ninguna. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Id de la etiqueta cuya confirmacion de borrado esta abierta. */
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  /*
   * `null` es "no se toca el color", que es distinto de elegir uno: el PATCH
   * solo manda `color` si el usuario eligio otro. Y una etiqueta puede venir ya
   * sin color, que es el estado legitimo cuando la paleta estaba tomada.
   */
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => (tagId ? tags.find((t) => t.id === tagId) : undefined), [tags, tagId]);

  /*
   * El color provisional es el que le daria el servidor al crearla, con el mismo
   * `nextFreeTagColorId` y los mismos colores usados: asi lo que se ve antes de
   * guardar es el color que queda despues, no uno que despues cambia solo.
   *
   * Devuelve siempre un color de la paleta de 10 (nunca `null`): si los 10 ya los
   * tienen otras etiquetas, el nuevo toma el primero de la paleta (duplicado
   * permitido, pero nunca color blanco/default).
   */
  const usados = useMemo(() => tags
    .filter((t) => t.id !== editingId)
    .map((t) => t.color)
    .filter((c): c is TagColorId => !!c), [tags, editingId]);
  /*
   * Los colores que ya tiene OTRA etiqueta, para los swatches.
   *
   * La etiqueta que se esta editando queda fuera: su color propio tiene que
   * seguir disponible para poder conservarlo.
   */
  const tomadosPorOtros = useMemo(() => {
    const otros = tags.filter((t) => t.id !== editingId);
    return new Set(otros.map((t) => t.color).filter((c): c is TagColorId => !!c));
  }, [tags, editingId]);
  const pending: PendingTag | null = useMemo(
    () => (pendingName ? { name: pendingName, color: tagColorHex(nextFreeTagColorId(usados)) } : null),
    [pendingName, usados],
  );

  const shown = current ?? pending;

  /*
   * La lista se FILTRA por lo escrito, no solo por prefijo: son pocas y el
   * filtro por "contiene" encuentra "trabajo" escribiendo "bajo".
   *
   * La etiqueta actual no se ofrece: ya esta elegida y volver a mostrarla solo
   * invita a elegir la misma.
   */
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tags.filter((t) => t.id !== tagId && (!q || t.name.toLowerCase().includes(q)));
  }, [tags, tagId, query]);

  const trimmed = query.trim();
  const willCreate = Boolean(trimmed) && listed.length === 0 && !shown;

  const focus = () => inputRef.current?.focus();

  const select = (id: string) => {
    onChange({ tagId: id, pendingName: '' });
    setQuery('');
    setEditingId(null);
    setDeletingId(null);
    setOpen(false);
    focus();
  };

  /** Sacar la etiqueta. Es una accion valida: el bloque queda sin etiqueta. */
  const clear = () => {
    onChange({ tagId: null, pendingName: '' });
    setQuery('');
    setEditingId(null);
    setDeletingId(null);
    setOpen(false);
    focus();
  };

  /** Resuelve el texto escrito. Ver la tabla de reglas en la cabecera. */
  const commitText = () => {
    if (!trimmed) return;
    // 1. Mismo nombre exacto.
    const exact = tags.find((t) => tagKey(t.name) === tagKey(trimmed));
    if (exact) {
      select(exact.id);
      return;
    }
    // 2. Una sola coincidencia: es lo que se quiso al teclear el prefijo.
    if (listed.length === 1) {
      select(listed[0].id);
      return;
    }
    // 3. Ninguna: el texto es el nombre de una etiqueta nueva.
    if (listed.length === 0) {
      onChange({ tagId, pendingName: trimmed });
      setQuery('');
      setOpen(false);
      focus();
      return;
    }
    // 4. Varias sin exacta: hay que afinar. No se hace nada a proposito.
  };

  const startRename = (tag: TagDto) => {
    setDeletingId(null);
    setEditingId(tag.id);
    setDraftName(tag.name);
    setDraftColor(tag.color);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const id = editingId;
    const name = draftName.trim();
    const original = tags.find((t) => t.id === id);
    setEditingId(null);
    if (!name || !original) return;
    const dto: UpdateTagDto = {};
    if (name !== original.name) dto.name = name;
    if (draftColor !== original.color && draftColor !== null) {
      dto.color = draftColor as never;
    }
    // Sin cambios no se manda nada: un PATCH sin campos solo gasta un viaje.
    if (Object.keys(dto).length) await onRename(id, dto);
    focus();
  };

  const commitDelete = async () => {
    if (!deletingId) return;
    const id = deletingId;
    setDeletingId(null);
    await onDelete(id);
    focus();
  };

  /*
   * Renombrar o borrar saca el foco del campo de texto, y eso disparaba
   * `commitText` con lo que hubiera escrito: abrir el lapiz con "perso" a medio
   * teclear asignaba `personal` y ademas abria el renombrado. El `preventDefault`
   * en `mousedown` cancela el cambio de foco -- y por lo tanto el blur -- sin
   * tocar el estado del campo.
   */
  const enterManagement = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // El filtro escrito se cae: la fila que se esta renombrando puede no estar
    // entre las que el filtro deja, y desaparecer a mitad de editarla confunde.
    setQuery('');
    fn();
  };

  useEffect(() => {
    if (editingId) renameRef.current?.focus();
  }, [editingId]);

  // Click afuera cierra la lista sin confirmar nada: perder el foco esta
  // justamente entre las dos formas de confirmar, asi que cerrarlo es una
  // tercera, que es solo cerrar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setEditingId(null);
      setDeletingId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitText();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) {
        setQuery('');
        return;
      }
      if (shown) clear();
      return;
    }
    // Backspace sobre el input vacio saca la etiqueta, como en un campo de
    // archivo: es el atajo que todos esperan.
    if (e.key === 'Backspace' && !query && shown) {
      clear();
    }
  };

  return (
    <div ref={rootRef} className="relative flex min-w-0 flex-1 flex-col">
      <div
        onClick={() => {
          setOpen(true);
          focus();
        }}
        className="flex min-h-[26px] cursor-text items-center gap-1 rounded bg-gray-700 px-2 py-1 focus-within:ring-1 focus-within:ring-gray-500/50"
      >
        {shown && (
          <span
            title={pending ? 'Created when you save' : undefined}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs"
            /*
             * Sin color no hay tinte: se pinta gris y ya. Un `null` en `color`
             * es una etiqueta creada cuando la paleta estaba tomada, y tiene que
             * verse distinta de las que si tienen color para que el usuario note
             * que a esa le falta.
             */
            style={
              shown.color
                ? { backgroundColor: `${shown.color}26`, color: shown.color }
                : {
                    backgroundColor: 'var(--color-gray-700)',
                    color: 'var(--color-gray-400)',
                  }
            }
          >
            {shown.name}
            <button
              type="button"
              // El `preventDefault` en mousedown es lo que evita que este click
              // saque el foco del input: sin el, el blur confirmaria el texto a
              // medio escribir y despues se borraria la etiqueta que se eligio.
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              disabled={disabled}
              aria-label={`Remove tag ${shown.name}`}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <FiX size={10} />
            </button>
          </span>
        )}

        {/* El estado "sin etiqueta" lo dice SOLO el placeholder del input. */}
        {!shown && (
          <span aria-hidden="true" className="shrink-0 text-gray-500">
            <FiTag size={12} />
          </span>
        )}

        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          // Confirmar al perder el foco es la mitad del contrato: lo escrito se
          // resuelve al Enter o al clickear en cualquier otro lado.
          onBlur={commitText}
          placeholder={shown ? '' : 'Add a tag'}
          aria-label="Add a tag"
          className="min-w-[5rem] flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
        />
      </div>

      {open && (
        /*
         * `bottom-full mb-1`, NO `top-full mt-1`.
         *
         * El selector vive en la barra del editor, que esta PEGADA al pie de la
         * pantalla. Abriendo hacia abajo el menu se sale del viewport y encima
         * lo recorta el `overflow-hidden` del panel de horas: medido, caia 13px
         * fuera y el elemento del centro era el panel, no el menu. Es decir,
         * invisible. Hacia arriba hay toda la altura del panel de sobra.
         */
        <div className="absolute bottom-full left-0 z-[var(--z-menu)] mb-1 w-full overflow-hidden rounded border border-gray-600 bg-gray-800 shadow-xl">
          {listed.length > 0 ? (
            <div className="max-h-48 overflow-y-auto">
              {listed.map((t) => (
                <div key={t.id} className="flex items-center pr-1">
                  {/* ---- Editando el nombre de esta etiqueta ---- */}
                  {editingId === t.id ? (
                    <div className="w-full px-2 py-2">
                      {/*
                       * Los swatches van en su propia linea y no al lado del
                       * input: seis botones de 14px mas el campo y los botones no
                       * entran en el ancho del desplegable y el lapiz se abria
                       * sin campo donde escribir.
                       */}
                      <div className="flex flex-wrap items-center gap-1">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => setDraftColor(c.id)}
                            /* Los que ya tiene otra etiqueta no se ofrecen: elegir
                               uno dejaria dos del mismo color, que es justamente
                               lo que la asignacion automatica evita sola. Se
                               apagan y se avisa en el `title`, no en silencio. */
                            disabled={tomadosPorOtros.has(c.id)}
                            aria-label={`Use color ${c.id}`}
                            title={
                              tomadosPorOtros.has(c.id)
                                ? `${c.id} - already used by another tag`
                                : c.id
                            }
                            className={`h-3.5 w-3.5 rounded-full ring-offset-1 ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-30 ${
                              draftColor === c.id ? 'ring-2 ring-white' : ''
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <input
                          ref={renameRef}
                          value={draftName}
                          maxLength={MAX_TAG_NAME_LENGTH}
                          onMouseDown={(e) => e.preventDefault()}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void commitRename();
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingId(null);
                              focus();
                            }
                          }}
                          aria-label={`Rename tag ${t.name}`}
                          className="min-w-0 flex-1 rounded bg-gray-700 px-1.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-gray-500/50"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void commitRename()}
                          className="shrink-0 rounded px-1.5 py-1 text-xs text-p2 transition-colors hover:bg-p2/15"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setEditingId(null);
                            focus();
                          }}
                          className="shrink-0 rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : /* ---- Confirmando el borrado de esta etiqueta ---- */ deletingId ===
                    t.id ? (
                    <div className="w-full border-l-2 border-danger/60 bg-danger/10 px-2 py-1.5">
                      {/*
                       * Decir CUANTOS bloques toca. Sin el numero, borrar se lee
                       * como borrar una etiqueta y no como sacarla de todos lados.
                       */}
                      <p className="text-xs text-gray-300">
                        Remove <span className="text-white">{t.name}</span> from{' '}
                        <span className="text-white">
                          {t.eventCount} {t.eventCount === 1 ? 'block' : 'blocks'}
                        </span>
                        ?
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => void commitDelete()}
                          className="rounded px-1.5 py-1 text-xs text-danger transition-colors hover:bg-danger/15"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setDeletingId(null);
                            focus();
                          }}
                          className="rounded px-1.5 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ---- Fila normal: elegir, editar o borrar ---- */
                    <>
                      <button
                        type="button"
                        // `onMouseDown` y no `onClick`, con `preventDefault`: el
                        // click sobre el boton leeria como un blur del input, que
                        // dispara `onBlur` y confirmaria el texto a medio elegir.
                        onMouseDown={(e) => {
                          e.preventDefault();
                          select(t.id);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-2 text-left text-sm text-gray-300 hover:bg-white/5"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tagColorHex(t.color) ?? 'var(--color-gray-600)' }}
                        />
                        <span className="min-w-0 flex-1 truncate">{t.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-gray-600">
                          {t.eventCount}
                        </span>
                      </button>
                      {/*
                       * Siempre visibles y no con `group-hover`: en un menu
                       * desplegado el puntero pasa por encima de camino a otro
                       * sitio y un boton que solo aparece al hover se va antes de
                       * poder apuntarlo.
                       */}
                      <button
                        type="button"
                        onMouseDown={enterManagement(() => startRename(t))}
                        disabled={disabled}
                        aria-label={`Edit tag ${t.name}`}
                        title="Rename"
                        className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
                      >
                        <FiEdit2 size={11} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={enterManagement(() => setDeletingId(t.id))}
                        disabled={disabled}
                        aria-label={`Delete tag ${t.name}`}
                        title="Delete"
                        className="shrink-0 rounded p-1 text-gray-500 transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <FiTrash2 size={11} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /*
             * Sin lista y con algo escrito, el texto va a ser una etiqueta
             * nueva. No es un boton -- el Enter y el blur ya hacen la accion --
             * pero avisarlo evita que el nombre se pierda en silencio.
             */
            <p className="px-2 py-1.5 text-xs text-gray-500">
              {willCreate ? (
                <>
                  New tag: <span className="text-gray-300">{trimmed}</span>
                </>
              ) : (
                'No tags yet'
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
