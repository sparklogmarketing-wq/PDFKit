"use client";

import { useEffect, useState, useRef } from "react";
import { renderPdfPage } from "./pdfjs";
import { useInView } from "./useInView";

export interface UsePdfThumbnailOptions {
  readonly file: File | null | undefined;
  readonly pageNum?: number;
  readonly targetWidth?: number;
  readonly rootMargin?: string;
  readonly enabled?: boolean;
  readonly priority?: boolean;
  readonly onPageLoaded?: (numPages: number) => void;
}

export function usePdfThumbnail({
  file,
  pageNum = 1,
  targetWidth = 180,
  rootMargin = "300px 0px",
  enabled = true,
  priority = false,
  onPageLoaded,
}: UsePdfThumbnailOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [hasRendered, setHasRendered] = useState(false);
  const { ref: containerRef, isInView } = useInView<HTMLDivElement>({ rootMargin });

  useEffect(() => {
    if (!enabled || !file) {
      setLoading(false);
      return;
    }
    if (!isInView && !hasRendered) return;
    if (hasRendered) return;

    let active = true;
    const controller = new AbortController();
    setLoading(true);

    if (canvasRef.current) {
      void renderPdfPage(file, canvasRef.current, pageNum, targetWidth, {
        signal: controller.signal,
        priority,
      })
        .then((res) => {
          if (!active) return;
          setLoading(false);
          if (res) {
            setHasRendered(true);
            if (res.numPages) {
              onPageLoaded?.(res.numPages);
            }
          }
        })
        .catch(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [file, pageNum, targetWidth, enabled, isInView, hasRendered, priority, onPageLoaded]);

  return {
    canvasRef,
    containerRef,
    loading,
    hasRendered,
    isInView,
  };
}
