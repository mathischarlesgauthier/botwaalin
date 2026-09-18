"use client";

import { useState } from "react";

function formatMo(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Sélecteur de fichier avec contrôle de taille AVANT l'envoi. Sans lui, un
 * fichier trop gros est rejeté par Next (limite de corps des Server Actions)
 * avant même que l'action ne s'exécute : l'utilisateur tombe sur une page
 * d'erreur brute, perd sa légende, et a téléversé la vidéo pour rien — cas
 * courant avec une vidéo filmée au téléphone.
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
}: {
  disabled: boolean;
  accept: string;
  maxImageBytes: number;
  maxVideoBytes: number;
}) {
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <>
      <input
        type="file"
        name="fichier"
        accept={accept}
        required
        disabled={disabled}
        className="max-w-full flex-1 text-xs text-neutral-600 file:mr-2 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-xs file:font-medium"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            setErreur(null);
            return;
          }
          // Le navigateur ne renseigne pas toujours `type` : dans le doute on
          // laisse passer, le serveur tranchera à partir de l'extension.
          const estImage = file.type.startsWith("image/");
          const estVideo = file.type.startsWith("video/");
          if (!estImage && !estVideo) {
            setErreur(null);
            return;
          }
          const max = estImage ? maxImageBytes : maxVideoBytes;
          if (file.size > max) {
            setErreur(
              `${formatMo(file.size)} — trop lourd : WhatsApp plafonne ${
                estImage ? "les photos" : "les vidéos"
              } à ${formatMo(max)}. Raccourcis la vidéo ou compresse-la.`,
            );
            event.target.value = "";
            return;
          }
          setErreur(null);
        }}
      />
      {erreur && <span className="w-full text-xs text-amber-600">⚠️ {erreur}</span>}
    </>
  );
}
