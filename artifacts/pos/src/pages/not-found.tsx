import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
      <h1 className="font-serif text-6xl font-bold text-primary mb-4">404</h1>
      <h2 className="text-2xl font-semibold mb-2">Página no encontrada</h2>
      <p className="text-muted-foreground mb-8">La página que busca no existe o fue movida.</p>
      <Link href="/dashboard">
        <Button>Volver al Inicio</Button>
      </Link>
    </div>
  );
}