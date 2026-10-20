import { useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import { tagColorHex } from '@widget-master/shared';
import type { TagDto } from '@widget-master/shared';

/*
 * Filtro por etiqueta, en la cabecera del mes.
 *
 * Solo FILTRA. Editar y borrar viven en el desplegable del editor, junto a cada
 * etiqueta, que es donde ya se esta mirando el vocabulario: la fila que vas a
 * renombrar es la misma que acabas de elegir.
 *
 * Filtrar es OR: varias elegidas muestran lo que tenga cualquiera de ellas. AND
 * (buscar "work Y personal") casi nunca es lo que se quiere en un calendario
 * personal, y de todos modos es cambiar una linea.
 *
 * El filtro afecta a las DOS columnas -- esconde bloques del panel del dia Y
 * cambia los contadores de la grilla -- pero vive en la del mes porque es donde
 * cabe. Va pegado al borde derecho de la cabecera para que se lea como un control
 * del encabezado y no como algo que pertenezca solo a la grilla.
 */

interface TagFilterChipsProps {
  tags: TagDto[];
  activeIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function TagFilterChips({ tags, activeIds, onToggle, onClear }: TagFilterChipsProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  /*
   * La tira scrollea cuando no caben, y sin esto el filtro que acabas de poner
   * puede quedar fuera de vista: `justify-end` con desborde manda el comienzo
   * hacia la IZQUIERDA, que es justo donde no se llega scrolleando. Con el chip
   * activo traido a la vista, el estado del filtro siempre se lee.
   */
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    for (const id of activeIds) {
      strip.querySelector(`[data-tag="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [activeIds]);

  if (!tags.length) return null;

  return (
    <div
      ref={stripRef}
      className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {tags.map((tag) => {
        const active = activeIds.includes(tag.id);
        const hex = tagColorHex(tag.color);
        return (
          <button
            key={tag.id}
            type="button"
            data-tag={tag.id}
            onClick={() => onToggle(tag.id)}
            aria-pressed={active}
            /*
             * La cuenta va en el tooltip y no en el chip: con el chip plegado a
             * punto no hay sitio, y el nombre ya esta ahi. El 0 tambien se sigue
             * leyendo -- una etiqueta sin bloques se reconoce como tal y no
             * parece un filtro sin uso.
             */
            title={`${tag.name} · ${tag.eventCount} ${tag.eventCount === 1 ? 'block' : 'blocks'}`}
            aria-label={tag.name}
            className={`flex shrink-0 items-center gap-1 rounded-full border text-xs transition-all ${
              active
                ? 'bg-white/[0.07] py-0.5 pr-2 pl-1.5 text-white'
                : 'h-[18px] w-[18px] justify-center border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}
          >
            <span
              aria-hidden="true"
              className={`rounded-full ${active ? 'h-1.5 w-1.5' : 'h-2 w-2'}`}
              style={{ backgroundColor: hex ?? 'var(--color-gray-600)' }}
            />
            {/*
             * PLEGADO: la etiqueta INACTIVA es solo el punto y la ACTIVA trae el
             * nombre.
             *
             * La cabecera del mes tiene ~265px libres despues del nombre del mes
             * y el contador. Medido con ocho etiquetas de nombre largo: seis de
             * ocho quedaban fuera de vista, porque los nombres no caben por
             * muchas que se les acote el ancho. El punto si: doce entran.
             *
             * El nombre no se pierde -- esta en el tooltip, en el aria-label y en
             * cuanto se activa el chip, que es cuando de verdad hace falta
             * saber cual estas mirando.
             */}
            {active && <span style={{ color: hex ?? 'var(--color-gray-300)' }}>{tag.name}</span>}
          </button>
        );
      })}

      {activeIds.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-200"
        >
          <FiX size={9} />
          Clear
        </button>
      )}
    </div>
  );
}
