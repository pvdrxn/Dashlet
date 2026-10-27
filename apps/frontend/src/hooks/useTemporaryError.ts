import { useState, useRef, useEffect, useCallback } from 'react';

export function useTemporaryError(timeoutMs = 3000) {
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setError = useCallback((key: string | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setErrorKey(key);
    if (key) {
      timerRef.current = setTimeout(() => {
        setErrorKey(null);
      }, timeoutMs);
    }
  }, [timeoutMs]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return [errorKey, setError] as const;
}
