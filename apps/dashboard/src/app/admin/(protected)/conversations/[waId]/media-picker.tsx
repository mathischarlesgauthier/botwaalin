"use client";

import { useState } from "react";

function formatMo(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Sélecteur de fichiers (plusieurs à la fois) avec contrôle de taille AVANT
 * l'envoi. Sans lui, un fichier trop gros est rejeté par Next (limite de corps
 * des Server Actions) avant même que l'action ne s'exécute : l'utilisateur
 * tombe sur une page d'erreur brute, perd sa légende, et a téléversé pour rien.
 *
 * Les limites arrivent en props : ce composant est envoyé au navigateur et ne
 * peut donc pas importer `@arbi/core`, qui dépend de modules Node. La
 * validation qui fait autorité reste `checkOutboundMedia`, côté serveur.
 */
export function MediaPicker({
  disabled,
  accept,
  maxImageBytes,
  maxVideoBytes,
  maxDocumentBytes,
  maxTotalBytes,
  maxFiles,
}: {
  disabled: boolean;
  accept: string;
  maxImageBytes: number;
  maxVideoBytes: number;
  maxDocumentBytes: number;
  maxTotalBytes: number;
  maxFiles: number;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisis, setChoisis] = useState(0);

  return (
    <>
      <input
        type="file"
        name="fichier"
        accept={accept}
        multiple
        required
        disabled={disabled}
        className="max-w-full flex-1 text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          setChoisis(files.length);
          if (files.length === 0) {
            setErreur(null);
            return;
          }
          if (files.length > maxFiles) {
            setErreur(`${maxFiles} fichiers maximum en une fois.`);
            event.target.value = "";
            setChoisis(0);
            return;
          }
          const trop = files.find((file) => {
            const max = file.type.startsWith("image/")
              ? maxImageBytes
              : file.type.startsWith("video/")
                ? maxVideoBytes
                : maxDocumentBytes;
            return file.size > max;
          });
          if (trop) {
            setErreur(`« ${trop.name} » fait ${formatMo(trop.size)} — trop lourd pour WhatsApp.`);
            event.target.value = "";
            setChoisis(0);
            return;
          }
          const total = files.reduce((sum, file) => sum + file.size, 0);
          if (total > maxTotalBytes) {
            setErreur(
              `${formatMo(total)} au total — envoie-les en plusieurs fois (maximum ${formatMo(maxTotalBytes)}).`,
            );
            event.target.value = "";
            setChoisis(0);
            return;
          }
          setErreur(null);
        }}
      />
      {choisis > 1 && !erreur && (
        <span className="text-xs text-neutral-500">{choisis} fichiers prêts</span>
      )}
      {erreur && <span className="w-full text-xs text-amber-600">⚠️ {erreur}</span>}
    </>
  );
}
