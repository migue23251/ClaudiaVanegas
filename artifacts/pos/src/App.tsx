import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Router as WouterRouter } from 'wouter';
import { AppRouter } from './AppRouter';
import { initBrandColor } from '@/lib/brand-color';
import { useBrandSettings } from '@/hooks/use-brand-settings';

// Apply saved brand color immediately before first render (from local cache,
// avoids a flash of default styling while the network request below runs)
initBrandColor();

// Reconcile with the database — this is what keeps the logo/color correct on
// a browser or device that has no local cache yet (e.g. after re-login or on
// a different browser/device), instead of silently falling back to defaults.
useBrandSettings.getState().syncFromServer();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
