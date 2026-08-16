# Agent commercial WhatsApp — ARBI JACOB (GHOST STUDIO)

Agent commercial IA sur WhatsApp Business (+33 7 78 70 37 01) : accueil, qualification, présentation des offres du catalogue, closing avec enregistrement du lead et handoff humain vers **@Jacob13013** (Telegram). Propulsé par Claude (`claude-sonnet-4-6`) via une boucle tool-use.

## Architecture

```
Meta Cloud API ──POST /webhook──▶ Fastify ──▶ DebounceQueue (2,5 s / contact)
   (signature HMAC vérifiée)                        │
                                                    ▼
                                              Handler (STOP/START, opt-out)
                                                    │
                                                    ▼
                                    SalesAgent (Claude + tools + garde-fou prix)
                                     │ get_offer · save_lead · handoff_human · send_menu
                                     ▼
                        WhatsAppClient (fenêtre 24 h, rate limit, retry 429/5xx)
                                     │                    │
                                     ▼                    ▼
                                  Client WhatsApp    Admin Telegram (handoff)
```

- **SQLite** (`better-sqlite3`) : `contacts`, `messages` (avec dédup `wamid`), `leads`, `handoffs`.
- **Catalogue** : `data/catalogue.md`, injecté intégralement dans le system prompt. Unique source de vérité produit/prix.
- **Garde-fou prix** : tout prix cité par le modèle est vérifié contre l'index des prix du catalogue ; un prix inconnu remplace la réponse par un renvoi vers Jacob + trace `handoffs`.
- **Conformité WhatsApp** : fenêtre de service 24 h (hors fenêtre → uniquement `sendTemplate()` avec template approuvé, refus explicite sinon), opt-out STOP définitif avec confirmation unique, réactivation START.
- **Logs** : toutes les décisions en JSON structuré (pino) — `inbound_queued`, `opt_out`, `send_blocked`, `tool_call`, `handoff`, `price_guard_blocked`, `message_sent`, `send_retry`…

## Démarrage

```bash
cp .env.example .env   # remplir les variables (voir procédure Meta ci-dessous)
docker compose up --build
```

Le webhook écoute sur `http://<hôte>:3000/webhook` (santé : `/health`). En production, place un reverse proxy HTTPS devant (Meta exige une URL HTTPS avec certificat valide).

Développement local :

```bash
npm install
npm run dev        # tsx watch
npm test           # Vitest : signature, débounce, opt-out, prix hors catalogue
npm run build && npm start
```

Pour exposer le port 3000 en local pendant les tests Meta : `ngrok http 3000` (ou Cloudflare Tunnel).

## Procédure Meta Business (obligatoire)

### 1. Vérification de l'entreprise
1. [business.facebook.com](https://business.facebook.com) → **Paramètres de l'entreprise → Centre de sécurité → Vérification de l'entreprise**.
2. Fournir raison sociale, adresse, document officiel (Kbis…). Compter 1 à 5 jours. Sans vérification : limite de 250 conversations/jour et pas de nom d'affichage validé.

### 2. Créer l'app et ajouter le numéro
1. [developers.facebook.com](https://developers.facebook.com) → **Créer une app** → type **Business** → lier au Business Manager vérifié.
2. Ajouter le produit **WhatsApp** à l'app.
3. **WhatsApp → Configuration de l'API** → **Ajouter un numéro de téléphone** : +33 7 78 70 37 01, validation par SMS/appel. ⚠️ Le numéro ne doit pas être actif sur l'app WhatsApp/WhatsApp Business classique (sinon le supprimer du compte d'abord).
4. Noter le **Phone number ID** (≠ numéro) → `PHONE_NUMBER_ID`.
5. **Jeton permanent** : Business Manager → **Utilisateurs système** → créer un utilisateur système admin → **Générer un token** avec les permissions `whatsapp_business_messaging` + `whatsapp_business_management`, sans expiration → `WHATSAPP_TOKEN`. (Le token affiché dans « Configuration de l'API » expire en 24 h — dev uniquement.)
6. **App Secret** : Paramètres de l'app → Général → `APP_SECRET`.

### 3. Configurer le webhook
1. **WhatsApp → Configuration → Webhook** : URL = `https://ton-domaine/webhook`, verify token = la valeur que tu mets dans `VERIFY_TOKEN` (chaîne libre choisie par toi).
2. Lancer le serveur **avant** de valider (Meta appelle `GET /webhook` avec `hub.challenge`).
3. S'abonner au champ **messages**.

### 4. Templates de messages (hors fenêtre 24 h)
1. **WhatsApp Manager → Outils de compte → Modèles de message** → créer les templates (ex. `relance_lead`, catégorie *Marketing* ou *Utility*), en français.
2. Attendre l'approbation Meta (minutes à 24 h).
3. Côté code : `sendTemplate(waId, "relance_lead", "fr", components)` — c'est le **seul** envoi autorisé hors fenêtre de service ; tout envoi libre hors fenêtre est refusé et loggé (`send_blocked` / `outside_24h_window`).

### 5. Notification admin Telegram (handoff)
1. Créer un bot via **@BotFather** → `TELEGRAM_BOT_TOKEN`.
2. L'admin envoie `/start` au bot, puis récupère son chat id via **@userinfobot** → `ADMIN_TG_CHAT_ID`.
3. Chaque `handoff_human` envoie au client le contact **@Jacob13013** et notifie ce chat.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `WHATSAPP_TOKEN` | Jeton Graph API (permanent conseillé) |
| `PHONE_NUMBER_ID` | ID du numéro WhatsApp Business |
| `VERIFY_TOKEN` | Jeton de vérification du webhook (choisi par toi) |
| `APP_SECRET` | App Secret Meta — vérification `X-Hub-Signature-256` |
| `ANTHROPIC_API_KEY` | Clé API Anthropic |
| `ADMIN_TG_CHAT_ID` | Chat Telegram de l'admin notifié au handoff |
| `TELEGRAM_BOT_TOKEN` | Bot Telegram utilisé pour la notification |
| `PORT` / `DB_PATH` / `CATALOGUE_PATH` / `LOG_LEVEL` / `DEBOUNCE_MS` / `GRAPH_API_BASE` / `ANTHROPIC_MODEL` | Optionnels (défauts sains) |

## Règles métier codées en dur

- Prix uniquement issus de `data/catalogue.md`, toujours « à partir de » ; prix inconnu → réponse remplacée + handoff (`prix_hors_catalogue`).
- Aucune promesse de revenu/résultat sur les formations ; aucun conseil fiscal/juridique/comptable personnalisé (Créa Société → professionnel + handoff).
- L'agent ne prend jamais de paiement et n'envoie aucun lien de paiement.
- Handoff systématique : devis, paiement, négociation, litige, réclamation, client agressif, incertitude, 3 messages sans progression.
- Réponses courtes (3-6 lignes), une question à la fois, tutoiement.

## Tests

```bash
npm test
```

- `signature.test.ts` — HMAC `X-Hub-Signature-256` (valide / secret erroné / absent), challenge `GET /webhook`, dédup des retries Meta.
- `queue.test.ts` — débounce 2,5 s : 3 messages → 1 seul traitement, isolation par contact, sérialisation des batchs.
- `optout.test.ts` — STOP → `opt_out=1` + confirmation unique, plus aucun envoi, réactivation START, gate fenêtre 24 h (message libre refusé hors fenêtre, template autorisé).
- `prices.test.ts` — index des prix du catalogue, détection de prix inventés, garde-fou `guardReply` (remplacement + handoff), sections `get_offer`, contenu du system prompt.
