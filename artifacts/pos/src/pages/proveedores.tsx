import { useState } from "react";
import { useListSuppliers, getListSuppliersQueryKey, useCreateSupplier, useUpdateSupplier, SupplierInput, Supplier } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Edit } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Proveedores() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: suppliers, isLoading } = useListSuppliers({
    query: { queryKey: getListSuppliersQueryKey() }
  });

  const createSupp = useCreateSupplier();
  const updateSupp = useUpdateSupplier();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: SupplierInput = {
      name: formData.get("name") as string,
      contact: formData.get("contact") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
    };

    if (editingSupplier) {
      updateSupp.mutate({ id: editingSupplier.id, data }, {
        onSuccess: () => {
          toast({ title: "Proveedor actualizado" });
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    } else {
      createSupp.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Proveedor creado" });
          queryClient.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Proveedores</h1>
          <p className="text-muted-foreground mt-1">Gestión de proveedores de mercancía</p>
        </div>
        <Button onClick={() => { setEditingSupplier(null); setIsDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Proveedor
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : suppliers?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No hay proveedores registrados</TableCell></TableRow>
            ) : (
              suppliers?.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-medium font-serif">{supplier.name}</TableCell>
                  <TableCell>{supplier.contact || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{supplier.email || "-"}</TableCell>
                  <TableCell>{supplier.phone || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingSupplier(supplier); setIsDialogOpen(true); }}>
                      <Edit className="h-4 w-4" />
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
            <DialogTitle>{editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre de la Empresa</label>
              <Input name="name" defaultValue={editingSupplier?.name} required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Persona de Contacto</label>
              <Input name="contact" defaultValue={editingSupplier?.contact || ""} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Correo Electrónico</label>
                <Input name="email" type="email" defaultValue={editingSupplier?.email || ""} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Teléfono</label>
                <Input name="phone" defaultValue={editingSupplier?.phone || ""} />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createSupp.isPending || updateSupp.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
