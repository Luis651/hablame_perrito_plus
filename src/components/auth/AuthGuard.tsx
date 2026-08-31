"use client";

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

// Rutas públicas que no requieren autenticación
const PUBLIC_ROUTES = ['/'];

// Restricciones de roles por ruta
const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  '/dashboard': ['ADMIN', 'CASHIER', 'WAITER'],
  '/comandas': ['ADMIN', 'CASHIER', 'WAITER'],
  '/cuadre': ['ADMIN', 'CASHIER'],
  '/historial': ['ADMIN', 'CASHIER'],
  '/inventario': ['ADMIN', 'CASHIER'],
  '/transferencias': ['ADMIN', 'CASHIER', 'WAITER'],
  '/productos': ['ADMIN'],
  '/usuarios': ['ADMIN'],
  '/configuracion': ['ADMIN', 'CASHIER'],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { user, role, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || isUserLoading) return;

    // 1. Si no hay usuario y trata de entrar a una ruta protegida -> Mandar al Login (/)
    if (!user && !isPublicRoute) {
      router.replace('/');
      return;
    }

    // 2. Si ya hay usuario autenticado e intenta ir al Login (/) -> Mandar al Dashboard (/dashboard)
    if (user && isPublicRoute) {
      router.replace('/dashboard');
      return;
    }

    // 3. Verificación de permisos por rol
    if (user && role && ROLE_ROUTE_ACCESS[pathname]) {
      const allowedRoles = ROLE_ROUTE_ACCESS[pathname];
      if (!allowedRoles.includes(role)) {
        if (role === 'WAITER') {
          router.replace('/comandas');
        } else {
          router.replace('/dashboard');
        }
      }
    }
  }, [mounted, user, role, isUserLoading, pathname, isPublicRoute, router]);

  return <>{children}</>;
}
