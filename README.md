# ARBI JACOB v2 — Agent commercial WhatsApp + Back-office

Agent commercial IA sur WhatsApp Business (marque ARBI JACOB, pôle digital GHOST STUDIO) : personnalité calibrée, mémoire de conversation, routeur à 4 niveaux, moteur tarifaire centralisé, système d'alerte WhatsApp, et **dashboard web** (conversations, résumés, leads, questions, catalogue éditable, réglages). LLM : Claude ou tout endpoint compatible Anthropic (config actuelle : **Kimi `kimi-k2.6`** via Moonshot).

## Architecture

```
apps/bot         Webhook Meta (HMAC), débounce 2,5 s, routeur 4 niveaux, agent tool-use,
                 garde-fou prix, anti-répétition de style, alertes, mode humain
apps/dashboard   Next.js 15 (App Router + Tailwind) : KPI, conversations, leads,
                 questions, catalogue & tarifs, réglages — auth argon2 + cookie signé
packages/core    Drizzle + better-sqlite3 (migrations auto v1→v2), moteur tarifaire
                 (FIXED/FROM/QUOTE/RANGE), intentions (synonymes + Levenshtein),
                 registre de style, alertes (template → texte → e-mail), client WhatsApp
data/catalogue.md  Seed du catalogue (ensuite versionné EN BASE, éditable au dashboard)
```

Le bot et le dashboard partagent la même base SQLite (WAL) via le volume `./data`. **La base fait autorité** sur le catalogue, les tarifs, les réglages et le numéro admin : toute modification au dashboard prend effet immédiatement, sans redéploiement.

## Démarrage

```bash
cp .env.example .env    # remplir (voir procédure Meta ci-dessous)
docker compose up --build -d
# Bot        → http://localhost:3000  (webhook /webhook, santé /health)
# Dashboard  → http://localhost:3001
```

Exposer le webhook en HTTPS et le brancher chez Meta automatiquement :

```bash
./scripts/expose.sh     # tunnel cloudflared + mise à jour du webhook Meta par API
```

Développement local : `npm install`, `npm test` (60+ tests), `npm run dev:bot`, `npm run dev:dashboard`.

## Première connexion au dashboard

1. Renseigne `DASHBOARD_USER`, `DASHBOARD_PASSWORD` et `DASHBOARD_SESSION_SECRET` dans `.env`.
2. Ouvre `http://localhost:3001` → connexion. Au premier login réussi, le mot de passe est stocké **hashé (argon2)** en base ; l'env n'est plus consulté ensuite.
3. Va dans **Réglages** : vérifie le numéro WhatsApp d'alerte (bouton « Envoyer un message de test »), le contact Telegram, le lien du groupe privé.

## Logique du bot (résumé)

- **Niveau 1** : l'info est dans la base → réponse directe.
- **Niveau 2** : service connu, besoin flou → une question de qualification (3 max : objectif, budget, délai).
- **Niveau 3** : demande personnalisée → prix de départ « dès » + explication devis.
- **Niveau 4** : message standard + boutons **⚡ Réponse rapide** (contact Telegram) / **🔔 Laisser une alerte**.
- **Alertes immédiates** : réclamation, litige, paiement, client agressif, 3 échanges sans progression, prix hors grille (garde-fou déterministe).
- **Mode humain** : dès que Jacob répond depuis le dashboard (ou clique « Reprendre »), le bot se tait ; réactivation manuelle ou automatique après N heures (réglable).
- Le bot **n'encaisse jamais** (aucun lien de paiement) et n'invente ni prix, ni délai, ni promesse de résultat.

## Système d'alerte

1. Enregistrement en base (motif, catégorie, intention, dernier message) + **résumé automatique** par le LLM.
2. Notification WhatsApp vers **tous les numéros admin actifs** (Réglages) :
   - via le **template approuvé `alerte_admin`** (seul canal fiable hors fenêtre 24 h) ;
   - repli **texte libre** (fonctionne si l'admin a écrit au bot dans les 24 h — envoie « START » au bot depuis le numéro admin pour ouvrir la fenêtre) ;
   - repli **e-mail** (si `RESEND_API_KEY` + e-mail configurés).
3. La conversation passe en statut « alerte » (badge rouge au dashboard) jusqu'à « Marquer traitée ».

### Créer le template `alerte_admin`

```bash
./scripts/create-template.sh   # soumet le template au WABA (approbation Meta : minutes → 24 h)
```

Si Meta rejette le template, reformule-le dans WhatsApp Manager → Modèles de message (catégorie *Utility*) en gardant les 6 variables `{{1}}…{{6}}` et le bouton URL ; le nom est configurable en base (`alert_template_name`).

## Procédure Meta Business

1. **Vérification de l'entreprise** : business.facebook.com → Centre de sécurité → Vérification (Kbis, 1-5 j). Sans elle : 250 conversations/jour max.
2. **App + numéro** : developers.facebook.com → app Business → produit WhatsApp → ajouter le numéro (⚠️ le numéro ne doit pas être actif dans l'app WhatsApp d'un téléphone). Récupérer `PHONE_NUMBER_ID` et `WABA_ID`.
3. **Jeton permanent** : Business Manager → Utilisateurs système → admin → Générer un token (`whatsapp_business_messaging` + `whatsapp_business_management`, expiration jamais) → `WHATSAPP_TOKEN`.
4. **Webhook** : `./scripts/expose.sh` le configure par API (ou manuellement : URL HTTPS `/webhook`, `VERIFY_TOKEN`, champ **messages** abonné). `APP_SECRET` = Paramètres de l'app → Général.
5. **Enregistrement du numéro** : si la console échoue (« Échec de l'enregistrement »), `./scripts/connect-meta.sh` fait vérification SMS + register par API.
6. **Moyen de paiement** : à ajouter dans Business Manager pour l'envoi de messages.

## Déploiement du dashboard

- **Docker (inclus)** : service `dashboard` du compose, port 3001. Mets un reverse proxy HTTPS devant et reporte l'URL publique dans Réglages → « URL publique du dashboard ».
- **Vercel (alternatif)** : le dashboard exige un accès disque à la SQLite partagée — sur Vercel il faut migrer `packages/core` vers Postgres (Drizzle rend le changement de driver contenu). Le déploiement recommandé reste Docker sur le même hôte que le bot.
- Sur un hôte **Linux** : `sudo chown -R 1000:1000 data/` avant le premier lancement.

## Tests (`npm test`)

- **Mémoire contextuelle** : l'enchaînement exact « Je cherche un agent. » → « Des casquettes. » → « Et les prix ? » reste sur China Accès.
- **Prix hors catalogue** : montants de la grille (dont anciens prix v1 retirés) — le garde-fou bloque tout le reste.
- **Anti-répétition** : jamais deux fois la même expression familière, espacement de 4 réponses minimum.
- **Alertes** : création, résumé, cascade template → texte → aucune, déduplication, déclencheurs (réclamation, 3 sans progression).
- **Mode humain** : bot totalement silencieux, réactivation auto après délai.
- **Numéro admin** : seed env → base autorité, historique des modifications, validation E.164.
- Plus : signature HMAC du webhook, débounce, opt-out STOP/START, fenêtre 24 h, dédup wamid, boutons interactifs.

## Sécurité

`X-Hub-Signature-256` vérifiée sur le body brut (401 sinon) · secrets hors repo (`.env` gitignoré) · rate limit login (5/15 min) + argon2 + cookie httpOnly signé · rate limit sortant WhatsApp + retry 429/5xx · opt-out STOP définitif · fenêtre de service 24 h (hors fenêtre : templates uniquement) · logs JSON structurés de chaque décision.
