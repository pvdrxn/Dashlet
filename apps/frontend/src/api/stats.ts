import type { StatsOverviewResponseDto } from '@widget-master/shared';
import { request } from './request';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/stats'
  : '/api/v1/stats';

/**
 * Obtiene el resumen de métricas y analíticas de productividad para el rango indicado.
 * @param from Fecha inicial (YYYY-MM-DD, opcional)
 * @param to Fecha final (YYYY-MM-DD, opcional)
 * @param tabId ID de pestaña para filtrar métricas de widgets específicos (opcional)
 */
export async function fetchStatsOverview(
  from?: string,
  to?: string,
  tabId?: string,
): Promise<StatsOverviewResponseDto> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (tabId) params.set('tabId', tabId);
  const qs = params.toString();
  return request<StatsOverviewResponseDto>(`${BASE}/overview${qs ? `?${qs}` : ''}`);
}
