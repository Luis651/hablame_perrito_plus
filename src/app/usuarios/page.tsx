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
import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Users, UserPlus, ShieldCheck, MapPin, UserCog, Trash2 } from 'lucide-react';
import { useLocations } from '@/hooks/use-locations';
import { Role, Location } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, deleteUser } from 'firebase/auth';

export default function UsuariosPage() {
  const firestore = useFirestore();
  const { user: currentAuthUser, role: currentUserRole } = useUser();
  const { locations } = useLocations();
  const { toast } = useToast();

  const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users, isLoading } = useCollection(usersQuery);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'CASHIER' as Role,
    locationId: 'br-1'
  });

  const handleUpdateRole = (userId: string, newRole: Role) => {
    if (userId === currentAuthUser?.uid && newRole !== 'ADMIN') {
      toast({ variant: "destructive", title: "Acción no permitida", description: "No puedes quitarte el rol de Administrador a ti mismo." });
      return;
    }
    const userRef = doc(firestore, 'users', userId);
    updateDocumentNonBlocking(userRef, { role: newRole });
    toast({ title: "Rol actualizado", description: `Nuevo rol: ${newRole}` });
  };

  const handleUpdateLocation = (userId: string, locationId: string) => {
    const userRef = doc(firestore, 'users', userId);
    updateDocumentNonBlocking(userRef, { locationId });
    toast({ title: "Sede asignada", description: "Cambio guardado exitosamente." });
  };

  const handleToggleActive = (userId: string, currentActive: boolean = true) => {
    if (userId === currentAuthUser?.uid) {
      toast({ variant: "destructive", title: "Acción no permitida", description: "No puedes inhabilitar tu propia cuenta administradora." });
      return;
    }
    const newActive = !currentActive;
    const userRef = doc(firestore, 'users', userId);
    updateDocumentNonBlocking(userRef, { active: newActive });
    toast({ 
      title: newActive ? "Empleado Habilitado" : "Empleado Inhabilitado", 
      description: newActive ? "El empleado ahora puede acceder al sistema." : "El acceso del empleado ha sido revocado." 
    });
  };

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentAuthUser?.uid) {
      toast({ variant: "destructive", title: "Acción no permitida", description: "No puedes eliminar tu propia cuenta administradora." });
      return;
    }
    if (confirm("¿Estás seguro de inhabilitar y eliminar a este empleado del sistema?")) {
      try {
        await deleteDoc(doc(firestore, 'users', userId));
        toast({ title: "Usuario eliminado", description: "El registro ha sido removido del sistema." });
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar al usuario." });
      }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    let createdAuthUser: any = null;
    let secondaryAuth: any = null;
    try {
      // Create secondary app to avoid logging out the current admin
      const secondaryAppName = 'SecondaryAuthApp';
      const secondaryApp = getApps().find(app => app.name === secondaryAppName) || initializeApp(firebaseConfig, secondaryAppName);
      secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, newUser.password);
      createdAuthUser = userCredential.user;
      const uid = userCredential.user.uid;

      await setDoc(doc(firestore, 'users', uid), {
        id: uid,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        role: newUser.role,
        locationId: newUser.locationId,
        active: true,
        createdAt: new Date().toISOString()
      });

      await signOut(secondaryAuth);

      toast({ title: "Usuario Creado", description: "El empleado ha sido registrado exitosamente." });
      setIsCreateModalOpen(false);
      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: 'CASHIER', locationId: 'br-1' });
    } catch (error: any) {
      console.error(error);
      if (createdAuthUser) {
        try {
          await deleteUser(createdAuthUser);
        } catch (cleanupErr) {
          console.warn("No se pudo limpiar auth user:", cleanupErr);
        }
      }
      let msg = "Hubo un error al registrar el usuario.";
      if (error.code === 'auth/email-already-in-use') msg = "Este correo ya está registrado en el sistema de autenticación.";
      if (error.code === 'auth/weak-password') msg = "La contraseña debe tener al menos 6 caracteres.";
      if (error.code === 'permission-denied') msg = "Permiso denegado por Firestore. Verifica los permisos de Administrador.";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      if (secondaryAuth) {
        try {
          await signOut(secondaryAuth);
        } catch (_) {}
      }
      setIsCreating(false);
    }
  };

  if (currentUserRole !== 'ADMIN') {
    return <div className="p-8 text-center">Acceso denegado. Solo administradores.</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar role={currentUserRole} />
      
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 pt-16 pb-24 lg:pt-8 lg:pb-8">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-bold text-foreground">Gestión de Personal</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Administra los roles y sedes asignadas a tu equipo.</p>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 h-11 sm:h-10 text-xs sm:text-sm font-bold w-full sm:w-auto">
              <UserPlus className="h-4 w-4" /> Nuevo Empleado
            </Button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-xs sm:text-sm flex items-center gap-2"><Users className="h-4 w-4"/> Total Personal</CardTitle>
                <p className="text-2xl sm:text-3xl font-headline font-bold">{users?.length || 0}</p>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-border bg-card shadow-xl overflow-hidden">
            <CardHeader className="p-4 sm:p-6 bg-muted/30 border-b border-border">
              <CardTitle className="text-base sm:text-lg">Directorio de Empleados</CardTitle>
              <CardDescription className="text-xs">Solo los usuarios registrados aquí pueden acceder a las funciones del sistema.</CardDescription>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empleado</TableHead>
                  <TableHead>Rol en Sistema</TableHead>
                  <TableHead>Sede Asignada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
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
                          {locations.map((loc: Location) => (
                            <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(u.id, u.active !== false)}
                        className={cn(
                          "h-7 px-2.5 text-[11px] font-bold mr-1 transition-colors",
                          u.active !== false 
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" 
                            : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
                        )}
                      >
                        {u.active !== false ? "ACTIVO" : "INACTIVO"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteUser(u.id)} className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        </div>

        {/* DIALOGO: CREAR USUARIO */}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent className="max-w-md bg-card">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" /> Agregar Empleado
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input required value={newUser.firstName} onChange={e => setNewUser({...newUser, firstName: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input required value={newUser.lastName} onChange={e => setNewUser({...newUser, lastName: e.target.value})} />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Correo Electrónico</Label>
                <Input type="email" required value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
              </div>

              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input type="password" required minLength={6} value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label>Rol Inicial</Label>
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({...newUser, role: v as Role})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASHIER">CAJERO</SelectItem>
                      <SelectItem value="WAITER">MESERO</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sede</Label>
                  <Select value={newUser.locationId} onValueChange={(v) => setNewUser({...newUser, locationId: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc: Location) => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isCreating}>{isCreating ? "Creando..." : "Crear Usuario"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
