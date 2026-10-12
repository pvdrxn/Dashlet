import { useEffect, useRef, useState, type ReactNode } from 'react';

/*
 * Barra de pestañas sin logica de pestañas.
 *
 * Es la pieza VISUAL que comparten las dos vistas: la de dashboards y la de
 * meses del calendario. Se extrajo de `TabBar` porque el calendario necesita la
 * misma barra -- misma regla de activo, mismo degradado de nombre largo, misma
 * mascara de recorte -- pero sin su chrome de pestañas: aca los meses no se
 * renombran, no se borran y no se reordenan arrastrando.
 *
 * Lo que NO vive aca, a proposito:
 *   - la edicion en linea del nombre (solo dashboards)
 *   - el delete y el "+" (solo dashboards)
 *   - el reordenamiento con dnd-kit (solo dashboards)
 * esas tres cosas las monta el padre, que es quien sabe si aplican.
 */

export interface TabStripProps {
  items: { id: string; label: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Nodo pegado a la izquierda de la fila: el boton que abre la sidebar. */
  leading?: ReactNode;
  /** Nodo al final de la fila: en el calendario, las flechas de mes y "Hoy". */
  trailing?: ReactNode;
}

/**
 * El nombre de una pestaña, con mascara cuando no entra.
 *
 * Es un componente y no un inline porque necesita `ResizeObserver`: cada
 * pestaña mide su propio `scrollWidth`, que es distinto segun cuanto texto
 * lleva. Si se midiera desde el padre habria un observer por fila.
 */
function StripName({ label }: { label: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [label]);

  return (
    <span
      ref={ref}
      className={`min-w-0 whitespace-nowrap overflow-hidden ${
        overflowing ? '[mask-image:linear-gradient(to_right,black_70%,transparent_96%)]' : ''
      }`}
    >
      {label}
    </span>
  );
}

export function TabStrip({ items, activeId, onSelect, leading, trailing }: TabStripProps) {
  return (
    <div className="sticky top-0 z-[var(--z-sticky)] flex items-center gap-1.5 overflow-hidden border-b border-gray-700/60 bg-gray-900/90 px-4 backdrop-blur-sm">
      {leading}
      {/*
         * `min-w-0 flex-1 overflow-hidden` en la fila de items es lo que evita que
         * se monte ENCIMA del `trailing` cuando no entran: sin `min-w-0`, un item
         * flex no baja de su ancho de contenido, la fila desborda y las flechas
         * de mes quedan dibujadas encima de "dec 2026". Con esto la fila se recorta
         * justo antes de llegar al `trailing`, que queda siempre legible.
         */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <div
              key={item.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(item.id)}
              className={`group relative flex h-9 shrink-0 cursor-pointer select-none items-center px-3 text-sm transition-colors ${
                isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {/* Indicador de activo: la misma regla de 2px en p2 del TabBar. */}
              {isActive && (
                <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-p2" />
              )}
              <StripName label={item.label} />
            </div>
          );
        })}
      </div>
      {trailing && <div className="shrink-0 pl-2">{trailing}</div>}
    </div>
  );
}
