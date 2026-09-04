/**
 * Formatage de durées pour l'indicateur de fenêtre de service 24 h (§4.1).
 * Ex. 3h12 restantes → "3 h 12", 2 jours écoulés → "2 j".
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  if (days >= 1) return `${days} j`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours} h ${String(minutes).padStart(2, "0")}`;
  return `${minutes} min`;
}
