import { useState, useMemo } from "react";
import { useListProducts, getListProductsQueryKey, useListCustomers, getListCustomersQueryKey, useCreateSale, Product, Customer } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ShoppingCart, Plus, Minus, Trash2, UserSearch, Receipt, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface CartItem extends Product {
  cartQty: number;
  cartPrice: number;
}

export default function Pos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentType, setPaymentType] = useState<"contado" | "credito">("contado");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products } = useListProducts(
    { search: searchTerm },
    { query: { queryKey: getListProductsQueryKey({ search: searchTerm }) } }
  );

  const { data: customers } = useListCustomers(
    { search: customerSearch },
    { query: { queryKey: getListCustomersQueryKey({ search: customerSearch }) } }
  );

  const createSale = useCreateSale();

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) {
        if (existing.cartQty >= product.stock) {
          toast({ title: "Stock insuficiente", variant: "destructive" });
          return prev;
        }
        return prev.map(p => p.id === product.id ? { ...p, cartQty: p.cartQty + 1 } : p);
      }
      if (product.stock <= 0) {
        toast({ title: "Producto sin stock", variant: "destructive" });
        return prev;
      }
      return [...prev, { ...product, cartQty: 1, cartPrice: product.salePrice }];
    });
  };

  const updateCartQty = (id: number, delta: number) => {
    setCart(prev => prev.map(p => {
      if (p.id === id) {
        const newQty = p.cartQty + delta;
        if (newQty < 1) return p;
        if (newQty > p.stock) {
          toast({ title: "Stock máximo alcanzado", variant: "destructive" });
          return p;
        }
        return { ...p, cartQty: newQty };
      }
      return p;
    }));
  };

  const updateCartPrice = (id: number, price: number) => {
    setCart(prev => prev.map(p => p.id === id ? { ...p, cartPrice: price } : p));
  };

  const removeFromCart = (id: number) => {
    setCart(prev => prev.filter(p => p.id !== id));
  };

  const total = useMemo(() => cart.reduce((acc, item) => acc + (item.cartQty * item.cartPrice), 0), [cart]);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    if (paymentType === "credito" && !selectedCustomer) {
      toast({ title: "Seleccione un cliente para ventas a crédito", variant: "destructive" });
      return;
    }

    const payload = {
      customerId: selectedCustomer?.id,
      paymentType,
      items: cart.map(item => ({
        productId: item.id,
        qty: item.cartQty,
        unitPrice: item.cartPrice
      }))
    };

    createSale.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "Venta registrada con éxito", className: "bg-emerald-500 text-white border-none" });
        setCart([]);
        setSelectedCustomer(null);
        setCustomerSearch("");
        setSearchTerm("");
        setPaymentType("contado");
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Error registrando la venta", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] gap-6">
      {/* Products Section */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar productos (código, nombre)..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-12 text-lg bg-card"
          />
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products?.map(product => (
            <Card 
              key={product.id} 
              className="cursor-pointer hover-elevate transition-all border-transparent hover:border-primary"
              onClick={() => addToCart(product)}
            >
              <div className="aspect-square w-full bg-muted rounded-t-xl overflow-hidden flex items-center justify-center">
                {product.images && product.images[0] ? (
                  <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                )}
              </div>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground mb-1 font-mono">{product.code}</div>
                <h3 className="font-semibold text-sm line-clamp-2 leading-tight mb-2 h-8">{product.name}</h3>
                <div className="flex justify-between items-end">
                  <span className="font-serif font-bold text-primary">{formatCurrency(product.salePrice)}</span>
                  <span className={`text-xs ${product.stock > 0 ? "text-muted-foreground" : "text-destructive font-semibold"}`}>
                    Stock: {product.stock}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {products?.length === 0 && (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              No se encontraron productos
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="w-96 flex flex-col gap-4">
        {/* Customer Selection */}
        <Card className="bg-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <UserSearch className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-sm">Cliente</h3>
            </div>
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-accent p-2 rounded-md">
                <div>
                  <p className="font-medium text-sm">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.cedula}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedCustomer(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input 
                  placeholder="Buscar cliente..." 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
                {customerSearch && customers && customers.length > 0 && (
                  <div className="absolute top-full left-0 w-full mt-1 bg-popover border shadow-md rounded-md z-50 max-h-48 overflow-y-auto">
                    {customers.map(c => (
                      <div 
                        key={c.id} 
                        className="p-2 hover:bg-accent cursor-pointer text-sm"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch("");
                        }}
                      >
                        <div className="font-medium">{c.firstName} {c.lastName}</div>
                        <div className="text-xs text-muted-foreground">{c.cedula}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cart items */}
        <Card className="flex-1 flex flex-col overflow-hidden bg-card">
          <div className="p-4 border-b flex justify-between items-center bg-muted/30">
            <h3 className="font-serif font-bold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Orden Actual
            </h3>
            <Badge variant="secondary">{cart.length} items</Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.map(item => (
              <div key={item.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-background">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm leading-none">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.code}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-2 border rounded-md p-0.5">
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateCartQty(item.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm font-medium w-4 text-center">{item.cartQty}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-sm" onClick={() => updateCartQty(item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={item.cartPrice}
                      onChange={(e) => updateCartPrice(item.id, Number(e.target.value))}
                      className="w-24 h-8 text-right font-serif text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 space-y-4">
                <Receipt className="h-12 w-12" />
                <p>Carrito vacío</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-muted/30">
            <div className="mb-4">
              <Select value={paymentType} onValueChange={(v: "contado"|"credito") => setPaymentType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de Pago" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contado">Contado</SelectItem>
                  <SelectItem value="credito">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium">Total</span>
              <span className="text-3xl font-serif font-bold text-primary">{formatCurrency(total)}</span>
            </div>
            
            <Button 
              className="w-full h-14 text-lg font-bold" 
              onClick={handleCheckout}
              disabled={cart.length === 0 || createSale.isPending}
            >
              {createSale.isPending ? "Procesando..." : "Cobrar"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

// X icon helper
function X(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}
import { Badge } from "@/components/ui/badge";
import { ShoppingBag as ShoppingBagIcon } from "lucide-react";
