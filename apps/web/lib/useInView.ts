"use client";

import { useEffect, useState, useRef } from "react";

export interface UseInViewOptions {
  rootMargin?: string;
  threshold?: number | number[];
  once?: boolean;
}

export function useInView<T extends HTMLElement = HTMLDivElement>(
  options?: UseInViewOptions
) {
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(() => {
    // In SSR, testing, or environments without IntersectionObserver, default to true
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
          if (options?.once) {
            observer.disconnect();
          }
        } else if (!options?.once) {
          setIsInView(false);
        }
      },
      {
        rootMargin: options?.rootMargin ?? "300px 0px",
        threshold: options?.threshold ?? 0.01,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [options?.rootMargin, options?.threshold, options?.once]);

  return { ref, isInView };
}
