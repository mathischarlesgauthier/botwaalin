/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "argon2", "pino", "@arbi/core"],
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
