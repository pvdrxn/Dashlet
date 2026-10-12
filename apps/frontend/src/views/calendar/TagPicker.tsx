import { useEffect, useMemo, useRef, useState } from 'react';
import { FiX, FiTag } from 'react-icons/fi';
import { tagColorHex, tagKey, nextTagColorId } from '@widget-master/shared';
import type { TagDto } from '@widget-master/shared';

/*
 * Selector de etiqueta del editor.
 *
 * UNA sola etiqueta por bloque.
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
  /** Color provisional: el mismo que le daria el servidor al crearla. */
  color: string;
}

interface TagPickerProps {
  tags: TagDto[];
  /** Id de la etiqueta actual, o `null` si el bloque no tiene. */
  tagId: string | null;
  /** Nombre escrito que todavia no existe como etiqueta. */
  pendingName: string;
  onChange: (next: { tagId: string | null; pendingName: string }) => void;
  disabled?: boolean;
}

export function TagPicker({ tags, tagId, pendingName, onChange, disabled = false }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => (tagId ? tags.find((t) => t.id === tagId) : undefined), [tags, tagId]);

  /*
   * El color provisional es el que le daria el servidor al crearla, con el mismo
   * `nextTagColorId` y el mismo conteo: asi lo que se ve antes de guardar es el
   * color que queda despues, no un azul fijo que despues cambia solo.
   */
  const pending: PendingTag | null = useMemo(
    () => (pendingName ? { name: pendingName, color: tagColorHex(nextTagColorId(tags.length)) } : null),
    [pendingName, tags.length],
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
    setOpen(false);
    focus();
  };

  /** Sacar la etiqueta. Es una accion valida: el bloque queda sin etiqueta. */
  const clear = () => {
    onChange({ tagId: null, pendingName: '' });
    setQuery('');
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

  // Click afuera cierra la lista sin confirmar nada: perder el foco esta
  // justamente entre las dos formas de confirmar, asi que cerrarlo es una
  // tercera, que es solo cerrar.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
            style={{ backgroundColor: `${shown.color}26`, color: shown.color }}
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
                <button
                  key={t.id}
                  type="button"
                  // `onMouseDown` y no `onClick`, con `preventDefault`: el click
                  // sobre el boton leeria como un blur del input, que dispara
                  // `onBlur` y confirmaria el texto a medio elegir. Con mousedown
                  // previene el blur y el click llega con el foco intacto.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(t.id);
                  }}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-gray-300 hover:bg-white/5"
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: tagColorHex(t.color) }}
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-600">{t.eventCount}</span>
                </button>
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