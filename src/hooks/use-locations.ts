'use client';

import { useMemo } from 'react';
import { collection } from 'firebase/firestore';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { Location } from '@/lib/types';
import { MOCK_LOCATIONS } from '@/lib/mock-data';

export function useLocations() {
  const firestore = useFirestore();

  const locationsQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'locations');
  }, [firestore]);

  const { data: firestoreLocations, isLoading, error } = useCollection<Location>(locationsQuery);

  const locations: Location[] = useMemo(() => {
    if (firestoreLocations && firestoreLocations.length > 0) {
      return firestoreLocations;
    }
    // Fallback a MOCK_LOCATIONS si no hay registros aún en Firestore
    return MOCK_LOCATIONS;
  }, [firestoreLocations]);

  const branches = useMemo(() => {
    return locations.filter((loc: Location) => loc.type === 'BRANCH');
  }, [locations]);

  const warehouses = useMemo(() => {
    return locations.filter((loc: Location) => loc.type === 'WAREHOUSE');
  }, [locations]);

  const getLocationName = (id?: string | null): string => {
    if (!id) return 'Sin Sede';
    const loc = locations.find((l: Location) => l.id === id);
    return loc ? loc.name : id;
  };

  const isBranch = (id?: string | null): boolean => {
    if (!id) return false;
    const loc = locations.find((l: Location) => l.id === id);
    return loc?.type === 'BRANCH';
  };

  return {
    locations,
    branches,
    warehouses,
    getLocationName,
    isBranch,
    isLoading,
    error,
    isUsingFallback: !firestoreLocations || firestoreLocations.length === 0,
  };
}
