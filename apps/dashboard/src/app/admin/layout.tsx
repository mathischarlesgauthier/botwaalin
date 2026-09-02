import type { Metadata } from "next";
import "../globals.css";

// Layout du back-office : Tailwind + metadata Dashboard. Le <html>/<body>
// reste dans le layout racine.
export const metadata: Metadata = {
  title: "ARBI JACOB — Dashboard",
  description: "Back-office de l'agent commercial WhatsApp",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
