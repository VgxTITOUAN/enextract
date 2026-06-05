# EneXtract

Application web interne e-Ness pour extraire des prospects depuis Sellsy, appliquer les règles métier (4 batchs), mettre à jour le champ `datemailling` et exporter un CSV.

**Production :** [https://enextract.eness.fr](https://enextract.eness.fr)

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Stack technique](#stack-technique)
- [Configuration](#configuration)
- [Base de données](#base-de-données)
- [Lancement](#lancement)
- [Structure du projet](#structure-du-projet)
- [Fonctionnalités](#fonctionnalités)
- [Règles métier — 4 batchs](#règles-métier--4-batchs)
- [Cache Sellsy & synchronisation](#cache-sellsy--synchronisation)
- [Quotas API Sellsy](#quotas-api-sellsy)
- [Flags de test / production](#flags-de-test--production)
- [CI/CD](#cicd)
- [Déploiement (Infomaniak)](#déploiement-infomaniak)
- [Workflow Git](#workflow-git)
- [Champs custom Sellsy](#champs-custom-sellsy)
- [Dépannage](#dépannage)

---

## Démarrage rapide

```bash
git clone https://github.com/VgxTITOUAN/enextract.git
cd enextract
npm install
```

1. Créer `.env.local` (voir [Configuration](#configuration)).
2. Préparer la base MariaDB et appliquer les [migrations](#base-de-données).
3. Lancer `npm run dev` → [http://localhost:3000](http://localhost:3000).

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 16 (App Router) |
| Runtime | Node.js 24 |
| Base de données | MariaDB / MySQL |
| UI | React 19, Tailwind CSS 4 |
| Auth | JWT (cookie httpOnly, 8 h) |
| CRM | Sellsy API v2 (OAuth2 `client_credentials`) |
| Tâches planifiées | `node-cron` (via `instrumentation.ts`) |
| Hébergement | Infomaniak (Node.js mutualisé) |
| CI | GitHub Actions |

---

## Configuration

Créer `.env.local` à la racine :

```env
# Base de données
DB_HOST=
DB_NAME=
DB_USER=
DB_PASS=

# JWT (chaîne aléatoire longue)
JWT_SECRET=

# Sellsy OAuth2
SELLSY_CLIENT_ID=
SELLSY_CLIENT_SECRET=

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Protection route cron HTTP (optionnelle)
CRON_SECRET=

# Fuseau horaire des crons
TZ=Europe/Paris
```

Ne jamais committer `.env.local` ni de secrets dans le dépôt.

---

## Base de données

### Tables utilisées

| Table | Rôle |
|-------|------|
| `users` | Comptes (admin / commercial), soft delete via `deleted_at` |
| `extractions` | Historique des extractions |
| `extraction_prospects` | Détail des prospects par extraction |
| `schedules` | Extractions planifiées et récurrentes |
| `sellsy_cache` | Cache local des prospects Sellsy |
| `notifications` | Notifications internes par utilisateur |

### Migrations

Les évolutions de schéma sont versionnées dans `sql/migrations/`.

```bash
# Exemple : appliquer une migration (CLI ou phpMyAdmin)
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < sql/migrations/add_deleted_at_users.sql
```

| Fichier | Description |
|---------|-------------|
| `add_deleted_at_users.sql` | Ajoute `deleted_at` sur `users` (suppression logique) |
| `add_csv_fields_extraction_prospects.sql` | Ajoute `secteur_activite`, `date_fin_contrat`, `date_commande_ndd` sur `extraction_prospects` |

> La création initiale des tables doit déjà exister sur l'environnement cible. Ce dépôt ne contient pas de dump complet du schéma initial.

---

## Lancement

```bash
# Développement
npm run dev

# Vérifications locales
npx tsc --noEmit
npm run lint

# Production
npm run build
npm start
```

---

## Structure du projet

```
app/
├── (protected)/                      # Pages authentifiées
│   ├── layout.tsx
│   ├── error.tsx
│   ├── extraction/
│   ├── planification/
│   ├── telechargement/
│   ├── notifications/
│   └── droits/                       # Admin uniquement
├── api/
│   ├── auth/login/route.ts
│   ├── auth/logout/route.ts
│   ├── deploy/route.ts               # Déploiement admin (git pull + build + restart)
│   ├── extraction/route.ts
│   ├── notifications/route.ts        # GET + PATCH (marquer lu)
│   ├── notifications/[id]/read/route.ts
│   ├── planification/route.ts
│   ├── sellsy-sync/route.ts
│   ├── sellsy-sync/cron/route.ts
│   ├── sellsy-test/route.ts          # Debug Sellsy — restreindre ou désactiver en prod
│   ├── telechargement/[id]/route.ts
│   └── users/route.ts
components/
├── ErrorDisplay.tsx
├── Sidebar.tsx
├── Topbar.tsx
├── DroitsClient.tsx
├── PlanificationClient.tsx
├── TelechargementClient.tsx
├── Toast.tsx
└── LogoutButton.tsx
config/
└── batches.ts                        # Constantes métier des 4 batchs
lib/
├── auth.ts
├── db.ts
├── extraction/
│   └── batches.ts                    # Logique des 4 filtres batch (source unique)
├── notifications.ts                  # createNotification, notifyAdmins
├── sellsy.ts
├── sellsy-sync.ts
├── scheduler.ts
└── useToast.ts
sql/migrations/
proxy.ts                              # Protection des routes
instrumentation.ts                    # Démarrage scheduler au boot
.github/workflows/ci.yml
```

---

## Fonctionnalités

| Page | Rôle | Accès |
|------|------|-------|
| Extraction | Lancer une extraction immédiate, planifiée ou récurrente | Tous |
| Planification | Voir et gérer les planifications actives | Tous |
| Téléchargement | Historique des extractions et export CSV | Tous |
| Notifications | Notifications internes (extractions, sync, erreurs) | Tous |
| Droits d'accès | Utilisateurs, sync Sellsy, déploiement | **Admin** |

**Admin** (`users.role = 'admin'`) : gestion des comptes, synchronisation du cache Sellsy, déploiement de l'application.

**Commercial** : extraction, planification et téléchargement uniquement.

Les utilisateurs supprimés (`deleted_at` renseigné) ne peuvent plus se connecter. Leur token JWT est invalidé à la prochaine requête. L'historique de leurs extractions est conservé.

---

## Règles métier — 4 batchs

Prospects **non archivés** depuis `sellsy_cache`. Les secteurs exclus (`BATCH4_EXCLUDED_SECTORS`) sont filtrés **en amont de tous les batchs** — ces prospects ne sont jamais sélectionnés. Les constantes (délais, limites, secteurs exclus) sont dans `config/batches.ts`. La logique de filtrage est centralisée dans `lib/extraction/batches.ts`.

| Batch | Dépt. | Date commande NDD | Date fin contrat | Date mailing | Limite |
|-------|-------|-------------------|------------------|--------------|--------|
| **1 — Priorité** | 29 ou 56 | Connue, antérieure à 2,5 ans | Inconnue | Inconnue ou antérieure à 2 ans | Aucune |
| **2** | 29 | Inconnue | Inconnue | Inconnue | 10 max |
| **3** | 29 | Inconnue | Inconnue | Connue, avant le 01/01/2000 | 10 max |
| **4 — Complétion** | 29 | Inconnue | Inconnue | Entre 01/01/2000 et il y a 2 ans | Quota restant |

**Batch 4** : sélection en round-robin avec plafond de **7 %** par secteur (calculé sur le total demandé). Secteurs exclus : `config/batches.ts` → `BATCH4_EXCLUDED_SECTORS`.

---

## Cache Sellsy & synchronisation

| Mode | Déclencheur |
|------|-------------|
| Automatique | `node-cron` — tous les jours à **2h** (`lib/scheduler.ts`, fuseau `Europe/Paris`) |
| Manuel | Page **Droits d'accès** → **Synchroniser Sellsy** |
| HTTP | `POST /api/sellsy-sync/cron` avec header `x-cron-secret` |

La sync dure généralement **20 à 40 minutes**. Ne pas fermer l'onglet pendant une sync manuelle.

---

## Quotas API Sellsy

| Header | Seuil | Action |
|--------|-------|--------|
| `X-Quota-Remaining-By-Second` | ≤ 5 | Pause 60 s |
| `X-Quota-Remaining-By-Minute` | ≤ 30 | Pause 60 s |
| `X-Quota-Remaining-By-Day` | ≤ 100 | Arrêt + erreur HTTP 503 |

---

## Flags de test / production

Dans `app/api/extraction/route.ts` et `lib/scheduler.ts` :

```ts
const MOCK_MODE = false; // true = prospects fictifs (tests)
const DRY_RUN   = true;  // true = pas de mise à jour datemailling dans Sellsy
```

| Flag | Effet |
|------|-------|
| `MOCK_MODE` | Données de test, sans cache réel |
| `DRY_RUN` | Extraction réelle depuis le cache, **sans** écriture Sellsy |

> Avant la mise en production avec écriture Sellsy : valider le comportement métier avec Rémi, puis passer `DRY_RUN = false` dans **les deux fichiers**.

---

## CI/CD

### CI — GitHub Actions

Workflow `.github/workflows/ci.yml` déclenché sur chaque push / PR vers `main` :

1. `npx tsc --noEmit`
2. `npx eslint . --ext .ts,.tsx --max-warnings 999`
3. `npm run build`

**Ne pas merger si le CI est rouge.**

### CD — Déploiement via l'interface admin

Le déploiement se fait depuis la page **Droits d'accès** (admin uniquement) → section **Déploiement** → bouton **Mettre à jour l'application**.

La séquence exécutée :

```
git pull origin main
→ npm install && npm run build
→ touch restart.txt  (redémarrage Infomaniak)
```

Les logs s'affichent en temps réel dans l'interface. Ne pas fermer l'onglet pendant le build (~2-3 minutes).

---

## Déploiement (Infomaniak)

### Procédure standard

```bash
# 1. Merger develop → main et pousser
git checkout main
git pull origin main
git merge develop
git push origin main

# 2. Attendre le CI vert sur GitHub Actions

# 3. Depuis la page Droits d'accès (admin)
#    → Cliquer sur "Mettre à jour l'application"
#    → Attendre la fin du build
```

### Migrations SQL

Si de nouveaux fichiers existent dans `sql/migrations/`, les appliquer sur la base de production avant ou après le déploiement selon le cas.

### Vérifications post-déploiement

- Flags `DRY_RUN` / `MOCK_MODE` corrects
- Cache Sellsy à jour (sync si nécessaire)
- Page Notifications accessible

---

## Workflow Git

```
main     ← production (enextract.eness.fr)
develop  ← intégration
feature/* ← développement
```

**Convention de commits (Conventional Commits)**

| Préfixe | Usage |
|---------|--------|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `refactor:` | Refactor sans changement de comportement |
| `chore:` | Dépendances, config |
| `style:` | UI uniquement |
| `ci:` | Pipeline CI/CD |
| `docs:` | Documentation |

```bash
git checkout develop
git checkout -b feature/ma-feature
# … commits …
git push origin feature/ma-feature
# PR ou merge vers develop, puis develop → main après CI vert
```

---

## Champs custom Sellsy

| Champ | Code | ID Sellsy |
|-------|------|-----------|
| Date mailing | `datemailling` | 32239 |
| Date commande NDD | `datecommandendd` | 264244 |
| Date fin contrat | `date-fin-contrat` | 264245 |
| Secteur d'activité | `secteuractivite` | 47599 |

Le secteur est stocké en libellé dans `sellsy_cache.secteur_activite` (mapping ID → label dans `lib/sellsy-sync.ts`).

---

## Dépannage

| Symptôme | Piste |
|----------|-------|
| CI rouge au build | Vérifier les secrets GitHub (`DB_*`, `JWT_SECRET`, `SELLSY_*`) |
| Erreur 503 à l'extraction | Quota journalier Sellsy presque épuisé |
| Cache vide | Lancer une sync depuis Droits d'accès |
| Extraction partielle | Stock insuffisant pour les critères des 4 batchs |
| Login impossible | Compte inactif, supprimé (`deleted_at`) ou identifiants incorrects |
| Cron sync ne tourne pas | Vérifier que l'app Node tourne en continu (`instrumentation.ts`) |
| Build échoue sur `@tailwindcss/postcss` | Vérifier que `tailwindcss` et `@tailwindcss/postcss` sont dans `dependencies` (pas `devDependencies`) |
| `next: not found` au démarrage | Relancer `npm install` depuis le terminal SSH |

---

## Auteur

**Titouan Perivier--Vigouroux** — Chef de projet EneXtract, e-Ness (Quimper).