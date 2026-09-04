/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "argon2", "pino", "@arbi/core"],
  experimental: {
    serverActions: {
      // La limite métier (DOCUMENT_MAX_BYTES, packages/core/src/documents.ts)
      // est 5 Mo : sans ceci, Next applique sa limite par défaut de 1 Mo au
      // corps des Server Actions AVANT que uploadDocumentAction ne s'exécute
      // — un fichier valide entre 1 et 5 Mo plante en 500 au lieu du message
      // d'erreur métier. Marge au-delà de 5 Mo pour l'overhead multipart.
      bodySizeLimit: "6mb",
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
