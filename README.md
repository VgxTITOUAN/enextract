# EneXtract



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

### Migrations

Les évolutions de schéma sont versionnées dans `sql/migrations/`.

```bash
# Exemple : appliquer une migration (CLI ou phpMyAdmin)
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < sql/migrations/add_deleted_at_users.sql
```

| Fichier | Description |
|---------|-------------|
| `add_deleted_at_users.sql` | Ajoute `deleted_at` sur `users` (suppression logique) |

> La création initiale des tables (`users`, `extractions`, etc.) doit déjà exister sur l’environnement cible. Ce dépôt ne contient pas de dump complet du schéma initial.

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
├── (protected)/                 # Pages authentifiées
│   ├── layout.tsx
│   ├── error.tsx
│   ├── extraction/
│   ├── planification/
│   ├── telechargement/
│   └── droits/                  # Admin uniquement
├── api/
│   ├── auth/login/route.ts
│   ├── auth/logout.ts/route.ts
│   ├── extraction/route.ts
│   ├── planification/route.ts
│   ├── sellsy-sync/route.ts     # Statut + sync manuelle
│   ├── sellsy-sync/cron/route.ts
│   ├── sellsy-test/route.ts     # Debug Sellsy (à désactiver en prod si besoin)
│   ├── telechargement/[id]/route.ts
│   └── users/route.ts           # POST admin + DELETE soft delete
├── login/page.tsx
├── error.tsx
└── not-found.tsx
components/
├── ErrorDisplay.tsx             # UI erreurs partagée
├── Sidebar.tsx
├── Topbar.tsx
├── DroitsClient.tsx
├── PlanificationClient.tsx
├── TelechargementClient.tsx
├── Toast.tsx
└── LogoutButton.tsx
config/
└── batches.ts                   # Constantes métier des 4 batchs
lib/
├── auth.ts
├── db.ts
├── sellsy.ts
├── sellsy-sync.ts
├── scheduler.ts
└── useToast.ts
sql/migrations/
proxy.ts                         # Protection des routes
instrumentation.ts               # Démarrage du scheduler au boot
.github/workflows/ci.yml
```

---

## Fonctionnalités

| Page | Rôle | Accès |
|------|------|-------|
| Extraction | Lancer une extraction immédiate ou planifiée | Tous les utilisateurs actifs |
| Planification | Voir / gérer les planifications | Tous |
| Téléchargement | Historique et export CSV | Tous |
| Droits d'accès | Utilisateurs, sync Sellsy, reset MDP | **Admin** |

**Admin** (`users.role = 'admin'`) : gestion des comptes, synchronisation du cache, correction de statuts d’extraction.

**Commercial** : extraction, planification et téléchargement uniquement.

Les utilisateurs supprimés (`deleted_at` renseigné) n’apparaissent plus dans les listes et ne peuvent plus se connecter. L’historique de leurs extractions est conservé.

---

## Règles métier — 4 batchs

Prospects **non archivés**, départements **29** ou **56** (selon le batch). Les constantes (délais, limites, secteurs exclus) sont dans `config/batches.ts`.

| Batch | Dépt. | Date commande NDD | Date fin contrat | Date mailing | Limite |
|-------|-------|-------------------|------------------|--------------|--------|
| **1 — Priorité** | 29 ou 56 | Connue, antérieure à 2,5 ans | Inconnue | Inconnue ou antérieure à 2 ans | Aucune |
| **2** | 29 | Inconnue | Inconnue | Inconnue | 10 max |
| **3** | 29 | Inconnue | Inconnue | Connue, avant le 01/01/2000 | 10 max |
| **4 — Complétion** | 29 | Inconnue | Inconnue | Entre 01/01/2000 et il y a 2 ans | Selon quota restant |

**Batch 4** : exclusion de certains secteurs d’activité, puis sélection en round-robin avec un plafond de **7 %** par secteur (cap calculé sur le nombre total demandé). Liste des secteurs exclus : `config/batches.ts` → `BATCH4_EXCLUDED_SECTORS`.

Les extractions lisent le cache `sellsy_cache` (rapide). Hors `DRY_RUN`, le champ `datemailling` est mis à jour dans Sellsy et dans le cache.

---

## Cache Sellsy & synchronisation

Les prospects sont synchronisés dans `sellsy_cache` (y compris `secteur_activite`, dates custom, coordonnées).

| Mode | Déclencheur |
|------|-------------|
| Automatique | `node-cron` — tous les jours à **2h** (`lib/scheduler.ts`, fuseau `Europe/Paris`) |
| Manuel | Page **Droits d'accès** → **Synchroniser Sellsy** |
| HTTP (alternative) | `POST /api/sellsy-sync/cron` avec header `x-cron-secret` |

La sync pagine l’API Sellsy (~100 prospects par page). La durée dépend du volume (souvent **20 à 40 minutes**). Ne pas fermer l’onglet pendant une sync manuelle lancée depuis l’UI.

Les extractions immédiates et planifiées s’appuient sur le cache : pas d’appel Sellsy massif à chaque extraction.

---

## Quotas API Sellsy

Gestion dans `lib/sellsy.ts` (headers de quota) :

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
|------|--------|
| `MOCK_MODE` | Données de test, sans cache réel |
| `DRY_RUN` | Extraction réelle depuis le cache, **sans** écriture Sellsy |

Avant une mise en production avec écriture Sellsy : valider le comportement métier, puis passer `DRY_RUN = false` dans **les deux fichiers**.

---

## CI/CD

Workflow `.github/workflows/ci.yml` sur chaque push / PR vers `main` :

1. `npx tsc --noEmit`
2. `npx eslint . --ext .ts,.tsx --max-warnings 999`
3. `npm run build` (secrets GitHub pour les variables d’environnement)

**Ne pas déployer si le CI est rouge.**

Le job de déploiement SSH (CD) est préparé mais **commenté** : Infomaniak ne permet pas encore l’usage de clés SSH privées pour l’automatisation GitHub Actions sur l’offre mutualisée actuelle.

---

## Déploiement (Infomaniak)

```bash
# 1. Merger develop → main et pousser
git checkout main
git pull origin main
git merge develop
git push origin main

# 2. Attendre le CI vert sur GitHub

# 3. Sur le serveur (console SSH Infomaniak)
cd /srv/customer/sites/enextract.eness.fr
git stash
git pull origin main

# 4. Manager Infomaniak
# → Lancer la construction (build)
# → Redémarrer l’application Node.js
```

Appliquer les migrations SQL sur la base de production si de nouveaux fichiers existent dans `sql/migrations/`.

Vérifier les flags `DRY_RUN` / `MOCK_MODE` avant redémarrage.

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

Exemple de flux :

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
|----------|--------|
| CI rouge au build | Vérifier les secrets GitHub (`DB_*`, `JWT_SECRET`, `SELLSY_*`) |
| Erreur 503 à l’extraction | Quota journalier Sellsy presque épuisé |
| Cache vide | Lancer une sync depuis Droits d'accès (admin) |
| Extraction partielle | Stock insuffisant pour les critères des 4 batchs |
| Login impossible | Compte inactif, supprimé (`deleted_at`) ou identifiants incorrects |
| Cron sync ne tourne pas | Vérifier que l’app Node tourne en continu (`instrumentation.ts`) ou utiliser la route `/api/sellsy-sync/cron` |

Pages d’erreur : composant partagé `components/ErrorDisplay.tsx` (boundaries `error.tsx` à la racine et sous `(protected)/`).

---

## Auteur

**Titouan Perivier--Vigouroux** — Chef de projet EneXtract, e-Ness (Quimper).
