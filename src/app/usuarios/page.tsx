
"use client";

import { useState } from 'react';
import { AppSidebar } from '@/components/layout/Sidebar';
import { 
  useCollection, 
  useFirestore, 
  useMemoFirebase, 
  useUser,
  updateDocumentNonBlocking
} from '@/firebase';
import { collection, doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Users, ShieldCheck, MapPin, UserCog } from 'lucide-react';
import { MOCK_LOCATIONS } from '@/lib/mock-data';
import { Role } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

export default function UsuariosPage() {
  const firestore = useFirestore();
  const { role: currentUserRole } = useUser();
  const { toast } = useToast();

  const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading } = useCollection(usersQuery);

  const handleUpdateRole = (userId: string, newRole: Role) => {
    const userRef = doc(firestore, 'users', userId);
    updateDocumentNonBlocking(userRef, { role: newRole });
    toast({ title: "Rol actualizado", description: `Nuevo rol: ${newRole}` });
  };

  const handleUpdateLocation = (userId: string, locationId: string) => {
    const userRef = doc(firestore, 'users', userId);
    updateDocumentNonBlocking(userRef, { locationId });
    toast({ title: "Sede asignada", description: "Cambio guardado exitosamente." });
  };

  if (currentUserRole !== 'ADMIN') {
    return <div className="p-8 text-center">Acceso denegado. Solo administradores.</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar role="ADMIN" />
      
      <main className="flex-1 overflow-y-auto bg-background p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <header>
            <h1 className="text-4xl font-headline font-bold text-foreground">Gestión de Personal</h1>
            <p className="text-muted-foreground">Administra los roles y sedes asignadas a tu equipo.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4"/> Total Personal</CardTitle>
                <p className="text-3xl font-headline font-bold">{users?.length || 0}</p>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-border bg-card shadow-xl overflow-hidden">
            <CardHeader className="bg-muted/30 border-b border-border">
              <CardTitle className="text-lg">Directorio de Empleados</CardTitle>
              <CardDescription>Solo los usuarios registrados aquí pueden acceder a las funciones del sistema.</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Rol en Sistema</TableHead>
                  <TableHead>Sede Asignada</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-10">Cargando personal...</TableCell></TableRow>
                ) : users?.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold">{u.firstName} {u.lastName}</span>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select 
                        defaultValue={u.role} 
                        onValueChange={(v) => handleUpdateRole(u.id, v as Role)}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">ADMIN</SelectItem>
                          <SelectItem value="CASHIER">CAJERO</SelectItem>
                          <SelectItem value="WAITER">MESERO</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select 
                        defaultValue={u.locationId} 
                        onValueChange={(v) => handleUpdateLocation(u.id, v)}
                      >
                        <SelectTrigger className="w-48 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MOCK_LOCATIONS.map(loc => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/20">ACTIVO</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </main>
    </div>
  );
}
