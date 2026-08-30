import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Redondeo matemático seguro a 2 decimales evitando errores de punto flotante de JavaScript.
 * Ejemplo: round2(10.000000000000002) => 10
 * Ejemplo: round2(0.1 + 0.2) => 0.3
 */
export function round2(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Redondeo seguro para cantidades de inventario (hasta 4 decimales: gramos, mililitros).
 */
export function round4(value: number): number {
  if (isNaN(value) || !isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Convierte un monto en Bolívares (BS) a Dólares (USD) con protección de saldo exacto.
 * Si el monto en USD calculado está dentro del margen de 1 céntimo del saldo pendiente restante,
 * lo ajusta exactamente al saldo restante para evitar residuos de $0.01 por céntimos de redondeo.
 */
export function convertBsToUsd(amountBS: number, exchangeRate: number, targetPendingUSD?: number): number {
  if (!exchangeRate || exchangeRate <= 0 || !amountBS || amountBS <= 0) return 0;
  const rawUSD = amountBS / exchangeRate;
  const roundedUSD = round2(rawUSD);

  if (targetPendingUSD !== undefined && targetPendingUSD > 0) {
    const diff = Math.abs(targetPendingUSD - roundedUSD);
    // Si la diferencia es menor o igual a 1 centavo (0.01$) atribuible al redondeo cambiario
    if (diff <= 0.015) {
      return targetPendingUSD;
    }
  }

  return roundedUSD;
}

/**
 * Convierte un monto en Dólares (USD) a Bolívares (BS) redondeado a 2 decimales.
 */
export function convertUsdToBs(amountUSD: number, exchangeRate: number): number {
  if (!exchangeRate || exchangeRate <= 0 || !amountUSD || amountUSD <= 0) return 0;
  return round2(amountUSD * exchangeRate);
}

/**
 * Formatea un número como moneda USD estándar: $10.00
 */
export function formatUSD(value: number): string {
  const num = round2(value);
  return `$${num.toFixed(2)}`;
}

/**
 * Formatea un número como moneda venezolana BS estándar: 7.916,70 BS
 */
export function formatBS(value: number): string {
  const num = round2(value);
  return `${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BS`;
}
