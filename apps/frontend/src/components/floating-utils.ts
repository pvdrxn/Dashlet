export function clampButtonPosition(
  pos: { x: number; y: number },
  buttonWidth = 48,
  buttonHeight = 48,
): { x: number; y: number } {
  const metrics = window.electronAPI?.getMetricsSync?.();
  const topOffset = metrics?.topOffset ?? 0;
  const bottomExtra = metrics?.bottomExtra ?? 0;
  const taskbarHeight = metrics?.taskbarHeight ?? 0;
  const bottomInset = bottomExtra + taskbarHeight;

  // Min Y: topOffset (25px en Electron) para que no entre en la zona oculta fuera de pantalla
  const minY = topOffset;

  // Max Y: borde superior de la barra de tareas menos el alto del botón y 16px de margen
  const maxY = Math.max(minY, window.innerHeight - bottomInset - buttonHeight - 16);

  const minX = 16;
  const maxX = Math.max(minX, window.innerWidth - buttonWidth - 16);

  return {
    x: Math.max(minX, Math.min(maxX, Math.round(pos.x))),
    y: Math.max(minY, Math.min(maxY, Math.round(pos.y))),
  };
}
