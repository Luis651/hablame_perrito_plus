"use client";

import { useEffect, useRef } from 'react';
import { useFirestore, useDoc, useMemoFirebase, setDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { fetchOfficialRates } from '@/lib/dolar-api';
import { useToast } from '@/hooks/use-toast';

export function ExchangeRateSyncProvider({ children }: { children: React.ReactNode }) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const configRef = useMemoFirebase(() => doc(firestore, 'config', 'exchangeRate'), [firestore]);
  const { data: exchangeData } = useDoc(configRef);
  const lastSyncAttemptRef = useRef<number>(0);

  useEffect(() => {
    if (!firestore || !configRef) return;

    const performSync = async () => {
      const now = Date.now();
      // Throttle: no ejecutar más de 1 vez cada 3 minutos por pestaña
      if (now - lastSyncAttemptRef.current < 3 * 60 * 1000) {
        return;
      }
      lastSyncAttemptRef.current = now;

      try {
        const { usd } = await fetchOfficialRates();
        if (!usd || !usd.promedio || usd.promedio <= 0) return;

        // Verificar si está en modo manual explícito
        const isManual = exchangeData?.rateSource === 'MANUAL' && exchangeData?.autoSync === false;
        if (isManual) {
          return;
        }

        const currentRate = exchangeData?.exchangeRate || 0;
        const currentCurrency = (exchangeData as any)?.currencySymbol || 'USD';
        const rateDiff = Math.abs(currentRate - usd.promedio);

        // Si la tasa en la base de datos difiere por más de 0.005 o es 0/inexistente, actualizar automáticamente
        if (currentCurrency === 'USD' && (rateDiff >= 0.005 || currentRate === 0)) {
          setDocumentNonBlocking(configRef, {
            exchangeRate: usd.promedio,
            currencySymbol: 'USD',
            currencyName: 'Dólar Oficial BCV',
            rateSource: 'BCV_USD',
            autoSync: true,
            lastBcvDate: usd.fechaActualizacion || new Date().toISOString().slice(0, 10),
            lastUpdated: serverTimestamp()
          }, { merge: true });

          toast({
            title: "⚡ Tasa BCV Sincronizada",
            description: `Tasa oficial del día aplicada automáticamente: ${usd.promedio.toFixed(2)} BS/$`
          });
        }
      } catch (err) {
        console.error("Auto-sync BCV error:", err);
      }
    };

    // Ejecutar al iniciar
    performSync();

    // Ejecutar al regresar a la pestaña del navegador
    const handleFocus = () => {
      performSync();
    };
    window.addEventListener('focus', handleFocus);

    // Revisar periódicamente cada 10 minutos
    const interval = setInterval(performSync, 10 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [firestore, configRef, exchangeData, toast]);

  return <>{children}</>;
}
