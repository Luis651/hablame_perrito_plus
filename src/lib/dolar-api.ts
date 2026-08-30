export interface OfficialRate {
  moneda: 'USD' | 'EUR';
  fuente: 'oficial';
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

export interface HistoricalRate {
  fuente: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fecha: string; // YYYY-MM-DD
  moneda?: 'USD' | 'EUR';
}

const BASE_URL = 'https://ve.dolarapi.com/v1';

/**
 * Obtiene la cotización oficial más reciente del Banco Central de Venezuela (BCV).
 */
export async function fetchOfficialRates(): Promise<{
  usd: OfficialRate | null;
  eur: OfficialRate | null;
}> {
  try {
    const [usdRes, eurRes] = await Promise.all([
      fetch(`${BASE_URL}/dolares/oficial`, { next: { revalidate: 300 } }).catch(() => null),
      fetch(`${BASE_URL}/euros/oficial`, { next: { revalidate: 300 } }).catch(() => null)
    ]);

    const usd: OfficialRate | null = usdRes && usdRes.ok ? await usdRes.json() : null;
    const eur: OfficialRate | null = eurRes && eurRes.ok ? await eurRes.json() : null;

    return { usd, eur };
  } catch (error) {
    console.error('Error fetching official BCV rates:', error);
    return { usd: null, eur: null };
  }
}

/**
 * Obtiene el historial completo de cotizaciones oficiales del BCV (Dólar o Euro).
 */
export async function fetchHistoricalRates(currency: 'USD' | 'EUR' = 'USD'): Promise<HistoricalRate[]> {
  try {
    const endpoint = currency === 'EUR' ? `${BASE_URL}/historicos/euros/oficial` : `${BASE_URL}/historicos/dolares/oficial`;
    const res = await fetch(endpoint, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data: HistoricalRate[] = await res.json();
    return data.sort((a, b) => b.fecha.localeCompare(a.fecha)); // Orden descendente (más reciente primero)
  } catch (error) {
    console.error(`Error fetching historical ${currency} rates:`, error);
    return [];
  }
}

/**
 * Busca la tasa oficial del BCV para una fecha específica (YYYY-MM-DD).
 * Si la fecha cae en fin de semana o feriado, toma la tasa bancaria hábil previa más cercana.
 */
export function findRateByDate(
  history: HistoricalRate[],
  targetDate: string
): HistoricalRate | null {
  if (!history || history.length === 0 || !targetDate) return null;

  // Buscar coincidencia exacta
  const exact = history.find(h => h.fecha === targetDate);
  if (exact) return exact;

  // Si no hay coincidencia exacta (fin de semana o feriado), buscar la fecha anterior más cercana
  const sorted = [...history].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const previous = sorted.find(h => h.fecha <= targetDate);
  return previous || history[0] || null;
}
