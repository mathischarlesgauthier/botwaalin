export const dynamic = "force-dynamic";

/**
 * Version réellement en ligne, lisible sans être connecté. Sert à vérifier
 * qu'un déploiement est bien arrivé : sans ça, impossible de distinguer « le
 * code n'est pas déployé » de « la page affichée vient du cache ».
 * N'expose rien de sensible : ni secret, ni identifiant de compte.
 */
export async function GET(): Promise<Response> {
  return Response.json({
    demarreLe: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    fonctionnalites: [
      "relances-24h-en-un-clic",
      "creation-template-auto",
      "prochain-paiement",
      "envoi-photo-video",
      "resume-auto",
      "questions-par-sujet",
    ],
  });
}
