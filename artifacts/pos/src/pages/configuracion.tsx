import { useEffect } from "react";
import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings, SettingsInput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Store, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Configuracion() {
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset } = useForm<SettingsInput>();

  useEffect(() => {
    if (settings) {
      // Convert null to undefined to satisfy form types
      const formValues = Object.fromEntries(
        Object.entries(settings).map(([k, v]) => [k, v === null ? undefined : v])
      ) as SettingsInput;
      reset(formValues);
    }
  }, [settings, reset]);

  const onSubmit = (data: SettingsInput) => {
    // Convert string port to number if provided
    if (data.smtpPort && typeof data.smtpPort === 'string') {
      data.smtpPort = Number(data.smtpPort);
    }

    updateSettings.mutate({ data }, {
      onSuccess: () => {
        toast({ title: "Configuración guardada exitosamente" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  if (isLoading) return <div>Cargando...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-serif font-bold">Configuración</h1>
        <p className="text-muted-foreground mt-1">Ajustes globales del sistema</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <CardTitle>Información de la Tienda</CardTitle>
            </div>
            <CardDescription>Datos que aparecerán en los tickets y recibos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombre de la Tienda</label>
                <Input {...register("storeName")} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Correo Electrónico</label>
                <Input {...register("storeEmail")} type="email" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Dirección Física</label>
              <Input {...register("storeAddress")} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Teléfono</label>
              <Input {...register("storePhone")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle>Servidor SMTP</CardTitle>
            </div>
            <CardDescription>Configuración para el envío de correos y reportes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Servidor Host</label>
                <Input {...register("smtpHost")} placeholder="smtp.gmail.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Puerto</label>
                <Input {...register("smtpPort")} type="number" placeholder="587" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Usuario SMTP</label>
                <Input {...register("smtpUser")} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Contraseña SMTP</label>
                <Input {...register("smtpPass")} type="password" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Remitente (From)</label>
              <Input {...register("smtpFrom")} placeholder="noreply@claudiavanegas.com" />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={updateSettings.isPending}>
            Guardar Cambios
          </Button>
        </div>
      </form>
    </div>
  );
}
