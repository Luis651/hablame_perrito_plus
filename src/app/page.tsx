
"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dog, ShieldCheck, Zap, BarChart3, Mail, Lock, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "reset">("login");
  
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const { toast } = useToast();

  const ensureUserProfile = async (uid: string, userEmail: string | null) => {
    const userRef = doc(firestore, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      // El primer usuario que entre por Auth será Admin para facilitar las pruebas
      // En producción esto se gestionaría manualmente desde la consola.
      await setDoc(userRef, {
        id: uid,
        email: userEmail || 'personal@hablameperrito.com',
        firstName: 'Usuario',
        lastName: 'Interno',
        role: 'ADMIN', 
        locationId: 'br-1'
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      try {
        await ensureUserProfile(userCredential.user.uid, userCredential.user.email);
      } catch (profileErr) {
        console.warn("Could not ensure profile, continuing:", profileErr);
      }
      toast({ title: "Acceso Exitoso", description: "Bienvenido a Hablame Perrito Plus." });
      router.push('/dashboard');
    } catch (error: any) {
      let message = "Credenciales inválidas.";
      if (error.code === 'auth/user-not-found') message = "Usuario no registrado.";
      if (error.code === 'auth/wrong-password') message = "Contraseña incorrecta.";
      if (error.code === 'auth/invalid-credential') message = "Correo o contraseña incorrectos.";
      toast({ variant: "destructive", title: "Error de acceso", description: message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Correo enviado", description: "Revisa tu bandeja de entrada para restablecer tu contraseña." });
      setAuthMode("login");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-primary font-headline text-2xl">Hablame Perrito Plus...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#1F262E]">
        <div className="absolute inset-0 z-0 opacity-20">
          <img 
            src="https://picsum.photos/seed/swift1/1920/1080" 
            alt="Kitchen background" 
            className="w-full h-full object-cover"
            data-ai-hint="modern kitchen"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#1F262E] via-transparent to-primary/20" />
        </div>
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="p-2 bg-primary rounded-lg shadow-lg">
            <Dog className="h-8 w-8 text-primary-foreground" />
          </div>
          <span className="text-3xl font-headline font-bold text-white tracking-tight">Hablame Perrito Plus</span>
        </div>

        <div className="relative z-10 space-y-6 max-w-lg">
          <h1 className="text-6xl font-headline font-bold text-white leading-tight">
            Gestión Inteligente de <span className="text-primary">Sucursales.</span>
          </h1>
          <p className="text-xl text-muted-foreground/80 leading-relaxed">
            Control de inventario, cuadre de caja y gestión de créditos para CIMA y TRAGO SPREXX.
          </p>
          <div className="grid grid-cols-1 gap-4 pt-8">
            <FeatureItem icon={ShieldCheck} title="Solo Personal" description="Acceso restringido a empleados autorizados." />
            <FeatureItem icon={Zap} title="Multi-Sede" description="Operación independiente para cada punto de venta." />
            <FeatureItem icon={BarChart3} title="Auditoría Real" description="Control total de abonos y deudas de clientes." />
          </div>
        </div>

        <div className="relative z-10 text-muted-foreground/50 text-sm">
          &copy; {new Date().getFullYear()} Hablame Perrito Plus.
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-background relative overflow-hidden">
        <Card className="w-full max-w-md border-border shadow-2xl bg-card/50 backdrop-blur-sm z-10">
          <CardHeader className="space-y-1 pb-8 text-center lg:text-left">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <Dog className="h-8 w-8 text-primary" />
              <span className="text-2xl font-headline font-bold">Hablame Perrito</span>
            </div>
            <CardTitle className="text-3xl font-headline font-bold">
              {authMode === 'login' ? 'Panel de Operaciones' : 'Recuperar Acceso'}
            </CardTitle>
            <CardDescription>
              {authMode === 'login' 
                ? 'Ingresa tus credenciales corporativas.' 
                : 'Ingresa tu correo para recibir un enlace de recuperación.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Correo Corporativo</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="email" 
                      placeholder="usuario@hablameperrito.com" 
                      className="h-12 pl-10" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Contraseña</label>
                    <button 
                      type="button" 
                      onClick={() => setAuthMode("reset")}
                      className="text-[10px] text-primary hover:underline font-bold uppercase"
                    >
                      ¿Olvidaste tu clave?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="password" 
                      className="h-12 pl-10" 
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-12 text-lg font-headline transition-all" disabled={loading}>
                  {loading ? "Autenticando..." : "Ingresar"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-muted-foreground">Tu Correo Electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      type="email" 
                      placeholder="ejemplo@correo.com" 
                      className="h-12 pl-10" 
                      required 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={handleResetPassword} className="w-full h-12 gap-2" variant="secondary" disabled={loading}>
                  <KeyRound className="h-4 w-4" /> Enviar Instrucciones
                </Button>
                <Button variant="ghost" onClick={() => setAuthMode("login")} className="w-full">Volver al Login</Button>
              </div>
            )}
            
            <p className="mt-8 text-center text-[10px] text-muted-foreground uppercase font-bold tracking-widest italic">
              Sistema de uso exclusivo para Hablame Perrito Plus
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureItem({ icon: Icon, title, description }: any) {
  return (
    <div className="flex gap-4 items-start bg-white/5 p-4 rounded-xl border border-white/10">
      <div className="mt-1 p-2 rounded-lg bg-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="font-bold text-white">{title}</h3>
        <p className="text-sm text-muted-foreground/70">{description}</p>
      </div>
    </div>
  );
}
