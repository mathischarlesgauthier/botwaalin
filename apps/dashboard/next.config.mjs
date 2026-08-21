/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "argon2", "pino", "@arbi/core"],
};

export default nextConfig;
