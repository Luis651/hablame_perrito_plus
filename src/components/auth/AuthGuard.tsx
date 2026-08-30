"use client";

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { Dog } from 'lucide-react';

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
  const { user, role, isUserLoading } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  useEffect(() => {
    if (isUserLoading) return;

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
        // Redirigir a la vista permitida según su rol
        if (role === 'WAITER') {
          router.replace('/comandas');
        } else {
          router.replace('/dashboard');
        }
      }
    }
  }, [user, role, isUserLoading, pathname, isPublicRoute, router]);

  // Pantalla de carga mientras se verifica el token de sesión
  if (isUserLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#1F262E] text-foreground">
        <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
          <div className="p-3.5 bg-primary rounded-2xl shadow-2xl animate-pulse">
            <Dog className="h-10 w-10 text-primary-foreground" />
          </div>
          <div className="flex flex-col items-center text-center">
            <h2 className="text-xl font-headline font-bold text-white tracking-tight">Hablame Perrito Plus</h2>
            <p className="text-xs text-muted-foreground mt-1">Verificando credenciales de acceso...</p>
          </div>
        </div>
      </div>
    );
  }

  // Si no está autenticado y está en ruta privada, no renderizar nada hasta que se complete el redirect
  if (!user && !isPublicRoute) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#1F262E]">
        <div className="animate-pulse text-muted-foreground text-xs font-bold uppercase tracking-widest">
          Redirigiendo al login...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
