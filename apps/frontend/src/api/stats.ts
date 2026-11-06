import type { StatsOverviewResponseDto } from '@widget-master/shared';
import { request } from './request';

const BASE = import.meta.env.PROD
  ? 'http://localhost:3001/api/v1/stats'
  : '/api/v1/stats';

/**
 * Obtiene el resumen de métricas y analíticas de productividad para el rango indicado.
 * @param from Fecha inicial (YYYY-MM-DD, opcional)
 * @param to Fecha final (YYYY-MM-DD, opcional)
 */
export async function fetchStatsOverview(
  from?: string,
  to?: string,
): Promise<StatsOverviewResponseDto> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return request<StatsOverviewResponseDto>(`${BASE}/overview${qs ? `?${qs}` : ''}`);
}
