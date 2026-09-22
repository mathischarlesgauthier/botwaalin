# ARBI JACOB v2 — Agent commercial WhatsApp + Back-office

Agent commercial IA sur WhatsApp Business (marque ARBI JACOB, pôle digital GHOST STUDIO) : personnalité calibrée, mémoire de conversation, routeur à 4 niveaux, moteur tarifaire centralisé, système d'alerte WhatsApp, et **dashboard web** (conversations, résumés, leads, questions, catalogue éditable, site vitrine, réglages), plus un **site vitrine public** dont les prix et textes sont pilotés depuis le back-office. LLM : Claude ou tout endpoint compatible Anthropic (config actuelle : **Kimi `kimi-k2.6`** via Moonshot).

## Architecture

```
apps/bot         Webhook Meta (HMAC), débounce 2,5 s, routeur 4 niveaux, agent tool-use,
                 garde-fou prix, anti-répétition de style, alertes, mode humain
apps/dashboard   Next.js 15 (App Router) : site vitrine public à la racine (/) et
                 back-office sous /admin (KPI, conversations, leads, questions,
                 catalogue & tarifs, site vitrine, réglages) — auth argon2 + cookie signé
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
# Site public → http://localhost:3001
# Dashboard   → http://localhost:3001/admin
```

Exposer le webhook en HTTPS et le brancher chez Meta automatiquement :

```bash
./scripts/expose.sh     # tunnel cloudflared + mise à jour du webhook Meta par API
```

Développement local : `npm install`, `npm test` (60+ tests), `npm run dev:bot`, `npm run dev:dashboard`.

## Première connexion au dashboard

1. Renseigne `DASHBOARD_USER`, `DASHBOARD_PASSWORD` et `DASHBOARD_SESSION_SECRET` dans `.env`.
2. Ouvre `http://localhost:3001/admin` → connexion. Au premier login réussi, le mot de passe est stocké **hashé (argon2)** en base ; l'env n'est plus consulté ensuite.
3. Va dans **Réglages** : vérifie le numéro WhatsApp d'alerte (bouton « Envoyer un message de test »), le contact Telegram, le lien du groupe privé.
4. **Site vitrine** : les prix et libellés du site public viennent de *Catalogue & tarifs* ; les textes marketing se règlent dans *Site vitrine* (`/admin/site`). Le site est servi à la racine du même domaine.

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

### Répondre à un client hors fenêtre 24 h

Le back-office ne verrouille **jamais** le champ de réponse : Jacob doit toujours pouvoir reprendre la main. Passé 24 h sans message du client, WhatsApp refuse le texte libre — la réponse tapée bascule alors automatiquement dans le **template de relance**, dont la variable `{{1}}` porte le texte, qui arrive donc intégralement.

La conversation propose en plus des **relances en un clic** dès que la fenêtre est fermée : des messages courts prêts à l'emploi (« Salut, je reviens vers toi… »), envoyés dans la même variable. Ils s'ajoutent et se suppriment dans **Réglages → Relancer un client après 24 h** : on écrit le message, on clique « Ajouter ».

Mise en place, une seule fois : **Réglages → « ✨ Créer le modèle automatiquement »**. Le modèle `relance_client` est soumis à Meta et enregistré tout seul ; l'approbation prend de quelques minutes à 24 h, et l'état (⚠️ à créer / ⏳ en attente / ✅ prêt) s'affiche en permanence sur la page. Sans modèle approuvé, aucun message ne peut partir hors fenêtre — c'est une règle Meta, pas une limite du code.

## Back-office : conversation

### Envoyer une photo ou une vidéo

Sous le champ de réponse, un second formulaire envoie un média au client, avec légende facultative. Le fichier est archivé sur le volume (même dossier que les médias reçus, donc visible dans le fil), déposé chez Meta, puis envoyé ; en cas d'échec il est supprimé, rien ne traîne sur le disque.

Limites imposées par WhatsApp, vérifiées avant tout envoi : **photo JPEG/PNG ≤ 5 Mo, vidéo MP4/3GP ≤ 16 Mo**. Le webp, le gif et le PDF sont refusés à l'envoi (WhatsApp ne les accepte pas sur un message image/vidéo). Hors fenêtre 24 h un média ne peut pas partir du tout — aucun template ne peut le porter : écris d'abord un message, et attends que le client réponde.

⚠️ `MEDIA_DIR` doit pointer vers le **même dossier absolu** pour le bot et pour le dashboard (`/app/data/media` sur Railway). Le serveur Next standalone change de répertoire courant au démarrage : sans variable explicite, il écrirait et relirait les médias ailleurs que le bot.

### Résumé automatique

Le résumé se régénère **tout seul** à l'ouverture d'une conversation dès qu'un message est arrivé depuis le dernier calcul (colonne `conversation_state.resume_message_id`). La page s'affiche immédiatement et le résumé se met à jour en arrière-plan ; le bouton « 🔄 Régénérer » reste disponible pour forcer. Les appels LLM sont bornés à 60 s (avant, un endpoint lent pouvait bloquer une demi-heure sans rien afficher).

### Autonomie du bot

**Réglages → Autonomie du bot** règle la fréquence du message « je transmets à Jacob » :

- **Autonome** (défaut) — il ne passe la main que si le client demande un humain, s'il faut un devis ferme ou un paiement, ou si l'information est réellement introuvable dans la grille, le catalogue et les documents. Une comparaison d'offres, une objection commerciale ou une question sur ce qui est inclus, il les traite seul.
- **Équilibrée** — il passe la main dès qu'il n'est pas sûr.
- **Prudente** — il passe la main au moindre doute (ancien comportement).

Le réglage ne touche aucun garde-fou : quel que soit le niveau, les prix viennent de la grille, rien n'est inventé, et réclamations, litiges et paiements partent toujours en alerte. Le compteur « échanges sans progression » qui déclenche une alerte automatique se règle juste au-dessus (défaut : 5).

### Abonnement

**Facturation** affiche la date du **prochain prélèvement** et le nombre de jours restants, calculés sur la date anniversaire de l'abonnement (même règle que Stripe, jour clampé en fin de mois).

Le débit mensuel de 50 € fait passer le solde en négatif jusqu'au paiement : c'est normal, mais le client dispose alors de **7 jours** (`GRACE_DAYS`) pour régler, sinon le service est suspendu. Tant que le solde est négatif, un **bandeau s'affiche sur toutes les pages du back-office** avec le solde, les jours restants, la date de coupure et le bouton de paiement Stripe. Il devient rouge une fois le service suspendu.

### Questions par sujet

L'onglet « Par sujet » range les questions clients sous un **thème général** — « Tarifs et devis », « Délais de livraison » — au lieu de lister des formulations quasi identiques. Le classement est fait par le LLM, stocké en base (`questions.sujet`) et relancé avec « 🧠 Classer les nouvelles » (incrémental) ou « ♻️ Tout reclasser ». L'onglet « Formulations exactes » conserve l'ancien regroupement par similarité, qui sert aussi de repli si le LLM est indisponible.

## Déployer sur Railway

```bash
railway up --detach          # depuis la racine du dépôt
curl https://arbi-jacob-production.up.railway.app/api/version   # vérifier ce qui est RÉELLEMENT en ligne
```

⚠️ **Ne jamais lancer `railway up` depuis un worktree git** (`.claude/worktrees/…`) : le CLI n'y trouve pas les fichiers, envoie un contexte vide, et le build repart entièrement du cache. Le déploiement s'affiche alors **SUCCESS** avec un healthcheck vert, mais l'image ne contient aucune modification. Deux signaux : un build de ~40 s (un vrai build en prend ~200), et `/api/version` qui ne liste pas la nouveauté attendue. Depuis un worktree, copier d'abord le code dans un dossier normal (`rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git ./ /tmp/deploy/`) et déployer depuis là.

## Procédure Meta Business

1. **Vérification de l'entreprise** : business.facebook.com → Centre de sécurité → Vérification (Kbis, 1-5 j). Sans elle : 250 conversations/jour max.
2. **App + numéro** : developers.facebook.com → app Business → produit WhatsApp → ajouter le numéro (⚠️ le numéro ne doit pas être actif dans l'app WhatsApp d'un téléphone). Récupérer `PHONE_NUMBER_ID` et `WABA_ID`.
3. **Jeton permanent** : Business Manager → Utilisateurs système → admin → Générer un token (`whatsapp_business_messaging` + `whatsapp_business_management`, expiration jamais) → `WHATSAPP_TOKEN`.
4. **Webhook** : `./scripts/expose.sh` le configure par API (ou manuellement : URL HTTPS `/webhook`, `VERIFY_TOKEN`, champ **messages** abonné). `APP_SECRET` = Paramètres de l'app → Général.
5. **Enregistrement du numéro** : si la console échoue (« Échec de l'enregistrement »), `./scripts/connect-meta.sh` fait vérification SMS + register par API.
6. **Moyen de paiement** : à ajouter dans Business Manager pour l'envoi de messages.

## Déploiement du dashboard

- **Docker (inclus)** : service `dashboard` du compose, port 3001 (site public à la racine, back-office sous `/admin`). Mets un reverse proxy HTTPS devant et reporte l'URL publique **avec `/admin`** dans Réglages → « URL publique du dashboard » (une URL sans `/admin` reste acceptée : les anciennes routes `/login`, `/conversations/…`, etc. sont redirigées en 308 vers `/admin/…`). Variable facultative `SITE_URL` = URL publique du site vitrine (sitemap, Open Graph).
- **Vercel (alternatif)** : le dashboard exige un accès disque à la SQLite partagée — sur Vercel il faut migrer `packages/core` vers Postgres (Drizzle rend le changement de driver contenu). Le déploiement recommandé reste Docker sur le même hôte que le bot.
- Sur un hôte **Linux** : `sudo chown -R 1000:1000 data/` avant le premier lancement.

## Tests (`npm test`)

La commande lance les trois suites : `packages/core`, `apps/bot` et `apps/dashboard`.

- **Mémoire contextuelle** : l'enchaînement exact « Je cherche un agent. » → « Des casquettes. » → « Et les prix ? » reste sur China Accès.
- **Prix hors catalogue** : montants de la grille (dont anciens prix v1 retirés) — le garde-fou bloque tout le reste.
- **Anti-répétition** : jamais deux fois la même expression familière, espacement de 4 réponses minimum.
- **Alertes** : création, résumé, cascade template → texte → aucune, déduplication, déclencheurs (réclamation, 3 sans progression).
- **Mode humain** : bot totalement silencieux, réactivation auto après délai.
- **Numéro admin** : seed env → base autorité, historique des modifications, validation E.164.
- **Envoi de médias** : formats et plafonds WhatsApp (photo 5 Mo, vidéo 16 Mo), refus du webp/gif/pdf.
- **Questions par sujet** : classement LLM, nettoyage des libellés, robustesse du parsing (ids inventés, lignes parasites, panne LLM).
- Plus : signature HMAC du webhook, débounce, opt-out STOP/START, fenêtre 24 h, dédup wamid, boutons interactifs.

## Sécurité

`X-Hub-Signature-256` vérifiée sur le body brut (401 sinon) · secrets hors repo (`.env` gitignoré) · rate limit login (5/15 min) + argon2 + cookie httpOnly signé · rate limit sortant WhatsApp + retry 429/5xx · opt-out STOP définitif · fenêtre de service 24 h (hors fenêtre : templates uniquement) · logs JSON structurés de chaque décision.
