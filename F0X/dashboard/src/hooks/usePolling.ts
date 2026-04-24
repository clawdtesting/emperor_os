import { useEffect, useRef } from 'react';

export function usePolling(cb: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (!mounted.current) return;
      void cb();
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [cb, intervalMs, enabled]);
}
