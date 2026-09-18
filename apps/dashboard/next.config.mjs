/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "argon2", "pino", "@arbi/core"],
  experimental: {
    serverActions: {
      // Next applique sa limite par défaut de 1 Mo au corps des Server Actions
      // AVANT que l'action ne s'exécute : un fichier valide plante alors en 500
      // au lieu d'afficher le message d'erreur métier. La plus grosse limite
      // métier est la vidéo WhatsApp (OUTBOUND_MEDIA_MAX_BYTES.video = 16 Mo,
      // packages/core/src/media.ts) ; les documents plafonnent à 5 Mo. Marge
      // au-delà de 16 Mo pour l'overhead multipart.
      bodySizeLimit: "18mb",
    },
  },
  // Le back-office a déménagé sous /admin (la racine est le site public).
  // Redirections permanentes des anciennes URLs — notamment le bouton
  // « Reprendre la conversation » du template d'alerte Meta, qui pointe vers
  // <dashboard_url>/conversations/<waId>.
  async redirects() {
    const legacy = [
      "/login",
      "/conversations",
      "/conversations/:path*",
      "/leads",
      "/questions",
      "/catalogue",
      "/facturation",
      "/reglages",
    ];
    return legacy.map((source) => ({
      source,
      destination: `/admin${source}`,
      permanent: true,
    }));
  },
};

export default nextConfig;
