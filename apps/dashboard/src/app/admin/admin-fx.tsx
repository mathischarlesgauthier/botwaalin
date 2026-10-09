"use client";

import { useEffect } from "react";

/**
 * Effet visuel uniquement : les cartes du back-office s'inclinent en 3D
 * sous le pointeur (souris seulement) avec un reflet qui le suit. Aucun
 * rendu, aucune donnée : un seul écouteur délégué sur le document.
 * Désactivé si l'utilisateur demande moins d'animations, et sur une carte
 * dont un champ est en cours de saisie.
 */
export function AdminFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;

    const release = () => {
      if (!current) return;
      current.classList.remove("ajd-tilting");
      current.style.removeProperty("--ajd-rx");
      current.style.removeProperty("--ajd-ry");
      current = null;
    };

    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? e.target : null;
      const card = target?.closest<HTMLElement>(".ajd-main .card") ?? null;
      if (card !== current) release();
      if (!card) return;

      const active = document.activeElement;
      if (active && active !== document.body && card.contains(active) && active.matches("input, textarea, select")) {
        release();
        return;
      }

      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      // Les grandes cartes (formulaires, tableaux) bougent à peine.
      const amp = Math.max(0.6, Math.min(5, (5 * 240) / Math.max(r.height, 240)));
      card.style.setProperty("--ajd-rx", `${((0.5 - py) * amp).toFixed(2)}deg`);
      card.style.setProperty("--ajd-ry", `${((px - 0.5) * amp).toFixed(2)}deg`);
      card.style.setProperty("--ajd-mx", `${(px * 100).toFixed(1)}%`);
      card.style.setProperty("--ajd-my", `${(py * 100).toFixed(1)}%`);
      card.classList.add("ajd-tilting");
      current = card;
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => release();

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    document.addEventListener("focusin", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("focusin", onLeave);
      if (frame) cancelAnimationFrame(frame);
      release();
    };
  }, []);

  return null;
}
