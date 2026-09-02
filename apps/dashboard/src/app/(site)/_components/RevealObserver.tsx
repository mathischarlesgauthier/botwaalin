"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Révélation au scroll des blocs [data-reveal] — seul composant client du
 * site. Même réglage que le design : rootMargin "0px 0px -12% 0px",
 * threshold .08 → opacity 1 / transform none, puis unobserve. Relancé à
 * chaque changement de page (navigation client).
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (nodes.length === 0) return;
    const show = (el: HTMLElement) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    };
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach(show);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          show(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
