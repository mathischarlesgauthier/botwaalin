import Link from "next/link";
import { billingStatus } from "@arbi/core";
import { logoutAction } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { getRuntime } from "@/lib/core";
import { Logo3D } from "../logo-3d";
import { BillingBanner } from "./billing-banner";
import { NavLink } from "./nav-link";

export const dynamic = "force-dynamic";

// Tout le back-office vit sous /admin ; la racine du domaine est le site public.
const NAV = [
  { href: "/admin", label: "Vue d'ensemble", icon: "📊" },
  { href: "/admin/conversations", label: "Conversations", icon: "💬" },
  { href: "/admin/leads", label: "Demandes / Leads", icon: "🎯" },
  { href: "/admin/questions", label: "Questions", icon: "❓" },
  { href: "/admin/apprentissage", label: "Apprentissage", icon: "🎓" },
  { href: "/admin/catalogue", label: "Catalogue & tarifs", icon: "🗂️" },
  { href: "/admin/fichiers", label: "Fichiers du bot", icon: "📎" },
  { href: "/admin/site", label: "Site vitrine", icon: "🌐" },
  { href: "/admin/facturation", label: "Abonnement", icon: "💳" },
  { href: "/admin/reglages", label: "Réglages", icon: "⚙️" },
];

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const { core } = getRuntime();
  const openAlerts = core.alerts.countOpen();
  const nouveauxLeads = core.leads.countNouveaux();
  const botActif = core.settings.get("bot_actif");
  const billing = billingStatus(core);
  const billingWarn = !billing.active || billing.balanceCents < 0;
  const paymentLink = core.settings.get("stripe_payment_link_url");

  return (
    <div className="flex min-h-screen flex-col">
      <div className="ajd-scene" aria-hidden="true">
        <div className="ajd-scene-orb" />
        <div className="ajd-scene-orb ajd-orb-2" />
        <div className="ajd-scene-floor" />
      </div>
      <header className="ajd-head text-neutral-900">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <Link href="/admin" className="flex items-center gap-3">
              <Logo3D size={52} small />
              <div>
                <div className="ajd-brand-title text-lg md:text-xl">
                  <span className="ajd-chrome-text">ARBI</span> <span className="ajd-red-text">JACOB</span>
                </div>
                <div className="text-xs text-neutral-500">
                  Bot {botActif ? "🟢 actif" : "🔴 désactivé"}
                </div>
              </div>
            </Link>
            <div className="flex items-center gap-3 text-sm text-neutral-500">
              <span className="hidden sm:inline">👤 {user}</span>
              <form action={logoutAction}>
                <button type="submit" className="btn btn-secondary">
                  Déconnexion
                </button>
              </form>
            </div>
          </div>
          <nav className="ajd-nav flex gap-x-1 overflow-x-auto px-2 pt-1 lg:flex-wrap lg:overflow-visible">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href}>
                <span className="ajd-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
                {item.href === "/admin/conversations" && openAlerts > 0 && (
                  <span className="ajd-pill ajd-pill-red">{openAlerts}</span>
                )}
                {item.href === "/admin/leads" && nouveauxLeads > 0 && (
                  <span className="ajd-pill ajd-pill-amber">{nouveauxLeads}</span>
                )}
                {item.href === "/admin/facturation" && billingWarn && (
                  <span className="ajd-pill ajd-pill-amber">!</span>
                )}
              </NavLink>
            ))}
            <a href="/" target="_blank" rel="noopener" className="ajd-nav-link ajd-ext">
              <span className="ajd-nav-icon">↗</span>
              <span>Voir le site</span>
            </a>
          </nav>
        </div>
      </header>
      <main className="ajd-main ajd-layer mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 md:px-6">
        <BillingBanner billing={billing} paymentLink={paymentLink} />
        <div className="ajd-page">{children}</div>
      </main>
    </div>
  );
}
