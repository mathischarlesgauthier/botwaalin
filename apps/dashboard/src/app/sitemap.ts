import type { MetadataRoute } from "next";
import { getSiteData, siteBaseUrl } from "@/lib/site/server";

export const dynamic = "force-dynamic";

/** Sitemap = accueil + pages de pôles + pages de services (pôles sans service actif exclus). */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSiteData();
  const base = siteBaseUrl();
  const abs = (path: string) => new URL(path, base).toString();
  const now = new Date();
  return [
    { url: abs("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...site.poles.map((pole) => ({
      url: abs(pole.href),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...site.services.map((service) => ({
      url: abs(service.href),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
