"use client";

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useUser, useAuth } from '@/firebase';
import { signOut } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';

// Rutas públicas que no requieren autenticación
const PUBLIC_ROUTES = ['/'];

// Restricciones de roles por ruta (alineadas estrictamente con firestore.rules)
const ROLE_ROUTE_ACCESS: Record<string, string[]> = {
  '/dashboard': ['ADMIN', 'CASHIER', 'WAITER'],
  '/comandas': ['ADMIN', 'CASHIER', 'WAITER'],
  '/cuadre': ['ADMIN', 'CASHIER'],
  '/historial': ['ADMIN', 'CASHIER'],
  '/inventario': ['ADMIN', 'CASHIER'],
  '/transferencias': ['ADMIN', 'CASHIER'],
  '/productos': ['ADMIN'],
  '/usuarios': ['ADMIN'],
  '/configuracion': ['ADMIN', 'CASHIER'],
};

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { user, profile, role, isUserLoading } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
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

    // 2. Si el usuario está autenticado pero su cuenta fue desactivada por el Admin
    if (user && profile && profile.active === false) {
      signOut(auth).then(() => {
        toast({
          variant: "destructive",
          title: "Acceso denegado",
          description: "Tu cuenta de empleado ha sido inhabilitada por la administración."
        });
        router.replace('/');
      });
      return;
    }

    // 3. Si ya hay usuario autenticado e intenta ir al Login (/) -> Mandar al Dashboard (/dashboard)
    if (user && isPublicRoute) {
      router.replace('/dashboard');
      return;
    }

    // 4. Verificación de permisos por rol
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
  }, [mounted, user, profile, role, isUserLoading, pathname, isPublicRoute, router, auth, toast]);

  return <>{children}</>;
}
