import { useState } from "react";
import { useListUsers, getListUsersQueryKey, useCreateUser, useUpdateUser, useDeleteUser, UserInput, User } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function Usuarios() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: users, isLoading } = useListUsers({ query: { queryKey: getListUsersQueryKey() } });
  
  const createU = useCreateUser();
  const updateU = useUpdateUser();
  const deleteU = useDeleteUser();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: any = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      role: formData.get("role") as "admin" | "cajero",
    };
    
    const pwd = formData.get("password") as string;
    if (pwd) data.password = pwd;

    if (editingUser) {
      updateU.mutate({ id: editingUser.id, data }, {
        onSuccess: () => {
          toast({ title: "Usuario actualizado" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    } else {
      if (!pwd) {
        toast({ title: "La contraseña es requerida", variant: "destructive" });
        return;
      }
      createU.mutate({ data: data as UserInput }, {
        onSuccess: () => {
          toast({ title: "Usuario creado" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (id === currentUser?.id) {
      toast({ title: "No puedes eliminar tu propio usuario", variant: "destructive" });
      return;
    }
    if (confirm("¿Estás seguro de eliminar este usuario?")) {
      deleteU.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Usuario eliminado" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Usuarios del Sistema</h1>
          <p className="text-muted-foreground mt-1">Gestión de accesos y roles</p>
        </div>
        <Button onClick={() => { setEditingUser(null); setIsDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Usuario
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : (
              users?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {u.name}
                      {u.id === currentUser?.id && <Badge variant="outline" className="text-[10px]">Tú</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? "default" : "secondary"} className="capitalize">
                      {u.role === 'admin' && <ShieldAlert className="h-3 w-3 mr-1" />}
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingUser(u); setIsDialogOpen(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive" 
                      onClick={() => handleDelete(u.id)}
                      disabled={u.id === currentUser?.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre</label>
              <Input name="name" defaultValue={editingUser?.name} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correo Electrónico</label>
              <Input name="email" type="email" defaultValue={editingUser?.email} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Rol</label>
              <Select name="role" defaultValue={editingUser?.role || "cajero"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Contraseña {editingUser && <span className="text-muted-foreground text-xs font-normal">(Dejar en blanco para no cambiar)</span>}
              </label>
              <Input name="password" type="password" required={!editingUser} />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createU.isPending || updateU.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
