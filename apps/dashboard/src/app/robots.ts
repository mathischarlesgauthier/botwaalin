import type { MetadataRoute } from "next";
import { siteBaseUrl } from "@/lib/site/server";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: new URL("/sitemap.xml", siteBaseUrl()).toString(),
  };
}
