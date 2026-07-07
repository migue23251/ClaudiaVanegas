import { useState } from "react";
import { useListCustomers, getListCustomersQueryKey, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, CustomerInput, Customer } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Clientes() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const queryParams = { search: search || undefined };
  
  const { data: customers, isLoading } = useListCustomers(
    queryParams,
    { query: { queryKey: getListCustomersQueryKey(queryParams) } }
  );

  const createCust = useCreateCustomer();
  const updateCust = useUpdateCustomer();
  const deleteCust = useDeleteCustomer();

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: CustomerInput = {
      cedula: formData.get("cedula") as string,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
    };

    if (editingCustomer) {
      updateCust.mutate({ id: editingCustomer.id, data }, {
        onSuccess: () => {
          toast({ title: "Cliente actualizado" });
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    } else {
      createCust.mutate({ data }, {
        onSuccess: () => {
          toast({ title: "Cliente creado" });
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          setIsDialogOpen(false);
        }
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("¿Estás seguro de eliminar este cliente?")) {
      deleteCust.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Cliente eliminado" });
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold">Clientes</h1>
          <p className="text-muted-foreground mt-1">Directorio de clientes de la tienda</p>
        </div>
        <Button onClick={() => { setEditingCustomer(null); setIsDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Cliente
        </Button>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por cédula o nombre..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cédula</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Apellidos</TableHead>
              <TableHead>Correo Electrónico</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : customers?.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">No se encontraron clientes</TableCell></TableRow>
            ) : (
              customers?.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-mono text-xs">{customer.cedula}</TableCell>
                  <TableCell className="font-medium">{customer.firstName}</TableCell>
                  <TableCell>{customer.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">{customer.email}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditingCustomer(customer); setIsDialogOpen(true); }}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(customer.id)}>
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
            <DialogTitle>{editingCustomer ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Cédula</label>
              <Input name="cedula" defaultValue={editingCustomer?.cedula} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nombres</label>
                <Input name="firstName" defaultValue={editingCustomer?.firstName} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Apellidos</label>
                <Input name="lastName" defaultValue={editingCustomer?.lastName} required />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Correo Electrónico</label>
              <Input name="email" type="email" defaultValue={editingCustomer?.email} required />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createCust.isPending || updateCust.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
