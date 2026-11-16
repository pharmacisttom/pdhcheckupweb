'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000, refetchOnWindowFocus: false } } }));
  useEffect(() => {
    const viewport = window.visualViewport;
    const syncHeight = () => {
      document.documentElement.style.setProperty(
        "--visual-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    };
    syncHeight();
    viewport?.addEventListener("resize", syncHeight);
    window.addEventListener("orientationchange", syncHeight);
    return () => {
      viewport?.removeEventListener("resize", syncHeight);
      window.removeEventListener("orientationchange", syncHeight);
      document.documentElement.style.removeProperty("--visual-viewport-height");
    };
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
