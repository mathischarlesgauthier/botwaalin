"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Lien du menu, souligné de rouge quand c'est la page en cours. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link href={href} className="ajd-nav-link" aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
