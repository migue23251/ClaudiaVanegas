import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { useLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Loader2, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

const loginSchema = z.object({
  email: z.string().email("Correo electrónico inválido"),
  password: z.string().min(1, "La contraseña es requerida"),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPass, setShowPass] = useState(false);

  const storedLogo = typeof localStorage !== "undefined" ? localStorage.getItem("pos_logo") : null;

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const loginMutation = useLogin();

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate({ data }, {
      onSuccess: (res) => {
        login(res.user, res.token);
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          title: "Error de autenticación",
          description: err.message || "Credenciales inválidas",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-background overflow-hidden">
      {/* Brand panel — full width on mobile (top), side panel on desktop (left) */}
      <div className="flex flex-col items-center justify-center bg-primary relative overflow-hidden p-8 md:p-12
                      w-full min-h-[38vh] md:min-h-screen md:w-[42%] lg:w-[48%] shrink-0">
        {/* Decorative circles — same palette as desktop */}
        <div className="absolute -top-24 -left-24 w-72 h-72 md:w-96 md:h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -right-24 w-72 h-72 md:w-96 md:h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] rounded-full bg-white/[0.03]" />
        <div className="absolute top-1/4 right-0 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute bottom-1/4 left-0 w-32 h-32 rounded-full bg-white/5" />

        {/* Brand content */}
        <div className="relative z-10 text-center text-primary-foreground">
          {storedLogo ? (
            <img
              src={storedLogo}
              alt="Logo"
              className="mx-auto h-16 w-16 md:h-24 md:w-24 rounded-2xl object-contain shadow-xl mb-4 md:mb-8 bg-white/10 p-2"
            />
          ) : (
            <div className="mx-auto mb-4 md:mb-8 flex h-16 w-16 md:h-24 md:w-24 items-center justify-center rounded-2xl bg-white/15 shadow-xl backdrop-blur-sm">
              <Store className="h-8 w-8 md:h-12 md:w-12 text-white" />
            </div>
          )}
          <h1 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 md:mb-3 leading-tight">
            Claudia<br />Vanegas
          </h1>
          <p className="text-white/70 text-sm font-medium tracking-wide uppercase">
            Sistema de Punto de Venta
          </p>
        </div>
      </div>

      {/* Login form */}
      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10 relative">
        <div className="w-full max-w-[380px]">
          <div className="mb-8">
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Bienvenida</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">Ingrese sus credenciales para continuar</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Correo Electrónico
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@correo.com"
                autoComplete="email"
                {...form.register("email")}
                className="h-11 text-sm bg-background border-border focus:border-primary focus:ring-primary/20 transition-all"
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Contraseña
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...form.register("password")}
                  className="h-11 text-sm bg-background border-border focus:border-primary focus:ring-primary/20 pr-10 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.formState.errors.password && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full mt-2"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                "Iniciar Sesión"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
