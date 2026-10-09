"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/actions";
import { Logo3D } from "../logo-3d";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="ajd-scene ajd-scene-login" aria-hidden="true">
        <div className="ajd-scene-orb" />
        <div className="ajd-scene-floor" />
      </div>
      <form action={formAction} className="card ajd-login-card ajd-layer w-full max-w-sm space-y-4 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo3D size={220} />
          <h1 className="sr-only">ARBI JACOB</h1>
          <p className="ajd-login-sub">Back-office de l&apos;agent WhatsApp</p>
        </div>
        <div>
          <label className="label" htmlFor="username">
            Identifiant
          </label>
          <input id="username" name="username" className="input" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
          />
        </div>
        {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
        <button type="submit" className="btn btn-primary w-full py-2.5 text-base" disabled={pending}>
          {pending ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
