"use client";

import { useEffect, useRef } from "react";

// Refetch live data on an interval, on window focus, and when the tab
// becomes visible again. The callback ref pattern keeps the timer stable
// across re-renders.
export function useLiveReload(refetch: () => void, ms = 5000) {
  const ref = useRef(refetch);
  ref.current = refetch;

  useEffect(() => {
    const tick = () => ref.current();
    const timer = setInterval(tick, ms);
    const onFocus = () => ref.current();
    const onVisible = () => {
      if (document.visibilityState === "visible") ref.current();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ms]);
}
