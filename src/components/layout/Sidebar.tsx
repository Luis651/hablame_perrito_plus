
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Package, 
  Settings, 
  ArrowRightLeft, 
  Users, 
  LogOut, 
  Dog, 
  ShoppingBasket, 
  History, 
  Scale, 
  Menu, 
  MoreHorizontal,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Role } from '@/lib/types';
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription 
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth, useUser } from '@/firebase';
import { signOut } from 'firebase/auth';
import { MOCK_LOCATIONS } from '@/lib/mock-data';

interface SidebarProps {
  role?: Role | null;
}

export function AppSidebar({ role: propRole }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const auth = useAuth();
  const { user, profile, role: contextRole, isUserLoading } = useUser();

  // Usamos el rol que venga del contexto si no se pasa por prop
  const activeRole = propRole || contextRole;

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error("Error logging out", error);
    }
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', roles: ['ADMIN', 'CASHIER', 'WAITER'], icon: LayoutDashboard },
    { name: 'Comandas', href: '/comandas', roles: ['ADMIN', 'CASHIER', 'WAITER'], icon: ClipboardList },
    { name: 'Cuadre', href: '/cuadre', roles: ['ADMIN', 'CASHIER'], icon: Scale },
    { name: 'Historial', href: '/historial', roles: ['ADMIN', 'CASHIER'], icon: History },
    { name: 'Productos', href: '/productos', roles: ['ADMIN'], icon: ShoppingBasket },
    { name: 'Inventario', href: '/inventario', roles: ['ADMIN', 'CASHIER'], icon: Package },
    { name: 'Traslados', href: '/transferencias', roles: ['ADMIN', 'CASHIER', 'WAITER'], icon: ArrowRightLeft },
    { name: 'Usuarios', href: '/usuarios', roles: ['ADMIN'], icon: Users },
    { name: 'Ajustes', href: '/configuracion', roles: ['ADMIN', 'CASHIER'], icon: Settings },
  ];

  const filteredNav = mounted && activeRole 
    ? navigation.filter(item => item.roles.includes(activeRole))
    : [];

  // Accesos directos principales en la barra inferior móvil
  const mobileBottomItems = [
    { name: 'Comandas', href: '/comandas', icon: ClipboardList },
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Cuadre', href: '/cuadre', icon: Scale },
    { name: 'Traslados', href: '/transferencias', icon: ArrowRightLeft },
  ].filter(item => {
    if (!mounted || !activeRole) return true;
    const found = navigation.find(n => n.href === item.href);
    return found ? found.roles.includes(activeRole) : true;
  });

  const locationName = MOCK_LOCATIONS.find(l => l.id === profile?.locationId)?.name || "Sucursal";

  const SidebarContent = () => (
    <div className="flex h-full flex-col bg-card">
      <div className="flex h-16 lg:h-20 items-center px-6 gap-3 border-b border-border bg-primary/5 shrink-0">
        <div className="p-1.5 bg-primary rounded-lg">
          <Dog className="h-6 w-6 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-headline font-bold text-primary leading-none">Hablame Perrito</span>
          <span className="text-[10px] uppercase tracking-widest font-bold opacity-50">Plus Management</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {!mounted || isUserLoading ? (
          <div className="space-y-3 px-4 py-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 w-full bg-muted/50 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredNav.length > 0 ? (
          filteredNav.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all mb-1 active:scale-[0.98]",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "mr-3 h-5 w-5 flex-shrink-0",
                  isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                )} />
                {item.name}
              </Link>
            );
          })
        ) : (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground italic">
            No tienes acceso a ningún módulo. Contacta al administrador.
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border bg-muted/20 shrink-0">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold shadow-inner shrink-0">
            {profile?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{profile?.firstName || user?.email?.split('@')[0] || 'Usuario'}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold truncate">
              {activeRole || 'S/R'} • {locationName}
            </p>
          </div>
        </div>
        <button 
          onClick={handleLogout}
          className="flex w-full items-center px-4 py-2.5 text-sm font-bold text-destructive hover:bg-destructive/10 rounded-xl transition-colors border border-transparent hover:border-destructive/20 active:scale-[0.98]"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden lg:flex h-full w-64 flex-col bg-card border-r border-border shrink-0">
        <SidebarContent />
      </aside>

      {/* MOBILE TOP BAR (Fijo en la parte superior para móviles) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card/95 backdrop-blur-md border-b border-border z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-primary rounded-lg">
            <Dog className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-headline font-bold text-sm text-foreground">Hablame Perrito</span>
          <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">
            {activeRole || 'APP'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border border-border bg-card">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-r-border">
              <SheetHeader className="sr-only">
                <SheetTitle>Menú de Navegación</SheetTitle>
                <SheetDescription>Acceso a los módulos de gestión.</SheetDescription>
              </SheetHeader>
              <SidebarContent />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR (Barra de pulgar para uso en teléfono) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-md border-t border-border z-40 px-2 flex items-center justify-around safe-area-bottom shadow-lg">
        {mobileBottomItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all select-none touch-manipulation",
                isActive ? "text-primary font-bold scale-105" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-all",
                isActive && "bg-primary/15 text-primary"
              )}>
                <item.icon className="h-5 w-5" />
              </div>
              <span className="text-[10px] mt-0.5 leading-tight tracking-tight">
                {item.name}
              </span>
            </Link>
          );
        })}

        {/* Botón "Más" para abrir el menú completo */}
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-muted-foreground hover:text-foreground transition-all select-none touch-manipulation",
            open && "text-primary font-bold"
          )}
        >
          <div className="p-1.5 rounded-xl">
            <MoreHorizontal className="h-5 w-5" />
          </div>
          <span className="text-[10px] mt-0.5 leading-tight tracking-tight">Más</span>
        </button>
      </nav>
    </>
  );
}
