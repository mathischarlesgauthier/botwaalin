import type { Metadata, Viewport } from "next";

// Layout racine minimal : le site public (`(site)/`) et le back-office
// (`admin/`) apportent chacun leur propre CSS et leurs propres metadata.
export const metadata: Metadata = {
  title: "ARBI JACOB",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `no-js` : fallback sans JavaScript du site public (retirée par un script
    // inline du layout (site) ; sans effet sur le back-office).
    <html lang="fr" className="no-js" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
