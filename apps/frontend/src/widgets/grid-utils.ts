import type { WidgetData } from './types';

export const CELL_W = 260;
export const CELL_H = 180;

export function snapX(value: number): number {
  return Math.round(value / CELL_W) * CELL_W;
}

export function snapY(value: number): number {
  return Math.round(value / CELL_H) * CELL_H;
}

export function snapW(value: number): number {
  return Math.max(Math.round(value / CELL_W) * CELL_W, CELL_W);
}

export function snapH(value: number): number {
  return Math.max(Math.round(value / CELL_H) * CELL_H, CELL_H);
}

export function snapUpW(value: number): number {
  return Math.ceil(value / CELL_W) * CELL_W;
}

export function snapUpH(value: number): number {
  return Math.ceil(value / CELL_H) * CELL_H;
}

export function hasCollision(
  id: string, x: number, y: number, w: number, h: number,
  widgets: WidgetData[],
): boolean {
  return widgets.some((wgt) =>
    wgt.id !== id &&
    x < wgt.position.x + wgt.position.w &&
    x + w > wgt.position.x &&
    y < wgt.position.y + wgt.position.h &&
    y + h > wgt.position.y,
  );
}

export function findFreeGridSlot(widgets: WidgetData[], defW: number, defH: number): { x: number; y: number } {
  const cols = Math.ceil(defW / CELL_W);
  const rows = Math.ceil(defH / CELL_H);
  const gridW = cols * CELL_W;
  const gridH = rows * CELL_H;

  const LIMIT = 40;
  for (let dist = 0; dist < LIMIT * 2; dist++) {
    for (let cy = 0; cy <= dist && cy < LIMIT; cy++) {
      const cx = dist - cy;
      if (cx >= LIMIT) continue;
      const x = cx * CELL_W;
      const y = cy * CELL_H;
      if (!hasCollision('', x, y, gridW, gridH, widgets)) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 };
}
