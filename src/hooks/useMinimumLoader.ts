import { useEffect, useRef, useState } from 'react';

export function useMinimumLoader(active: boolean, minDurationMs = 6000) {
  const [visible, setVisible] = useState(active);
  const startedAtRef = useRef<number | null>(active ? Date.now() : null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (active) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
      }
      setVisible(true);
      return;
    }

    if (startedAtRef.current === null) {
      setVisible(false);
      return;
    }

    const elapsed = Date.now() - startedAtRef.current;
    const waitMs = Math.max(0, minDurationMs - elapsed);
    timerRef.current = setTimeout(() => {
      startedAtRef.current = null;
      setVisible(false);
      timerRef.current = null;
    }, waitMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, minDurationMs]);

  return visible;
}
