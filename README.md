# EneXtract

Application web interne développée par **Titouan Perivier--Vigouroux** pour **e-Ness** (agence web, Quimper).

EneXtract automatise l'extraction de prospects depuis le CRM Sellsy, génère des fichiers CSV pour les campagnes de mailing, et gère les extractions planifiées ou ponctuelles.

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js 16.2.6 (App Router) |
| Runtime | Node.js 24 |
| Base de données | MariaDB 10.6 |
| Style | Tailwind CSS 4 |
| Auth | JWT (httpOnly cookie, 8h) |
| CRM | Sellsy API v2 (OAuth2 client_credentials) |
| Hébergement | Infomaniak (Node.js mutualisé) |
| CI | GitHub Actions (TypeScript + Lint + Build) |

---

## Prérequis

- Node.js 24+
- MariaDB 10.6+
- Compte Sellsy avec credentials OAuth2

---

## Installation

```bash
git clone https://github.com/titouvgx/enextract
cd enextract
npm install
```

Créer le fichier `.env.local` à la racine :

```env
# Base de données
DB_HOST=xxxx.myd.infomaniak.com
DB_NAME=xxxx_enextract
DB_USER=xxxx_enextract
DB_PASS=mot_de_passe

# JWT
JWT_SECRET=chaine_aleatoire_64_caracteres_minimum

# Sellsy
SELLSY_CLIENT_ID=votre_sellsy_client_id
SELLSY_CLIENT_SECRET=votre_sellsy_client_secret

# App
NEXT_PUBLIC_APP_URL=https://enextract.eness.fr

# CRON
CRON_SECRET=chaine_aleatoire

# Timezone
TZ=Europe/Paris
```

---

## Base de données

Exécuter le fichier `sql/schema.sql` depuis phpMyAdmin ou CLI.

| Table | Description |
|-------|-------------|
| `users` | Comptes utilisateurs |
| `extractions` | Historique des extractions |
| `extraction_prospects` | Détail des prospects par extraction |
| `schedules` | Planifications et récurrences |
| `notifications` | Notifications internes |
| `sellsy_cache` | Cache local des prospects Sellsy |

---

## Démarrage

```bash
# Développement
npm run dev

# Production
npm run build
npm start
```

---

## Structure du projet

```
app/
├── (protected)/
│   ├── layout.tsx                    # Layout avec sidebar + auth
│   ├── extraction/page.tsx           # Demande d'extraction
│   ├── planification/page.tsx        # Gestion des planifications
│   ├── telechargement/page.tsx       # Historique + téléchargement CSV
│   └── droits/page.tsx               # Gestion utilisateurs (admin)
├── api/
│   ├── auth/login/route.ts           # POST login
│   ├── auth/logout/route.ts          # POST logout
│   ├── extraction/route.ts           # POST extraction
│   ├── planification/route.ts        # POST gestion schedules
│   ├── sellsy-sync/route.ts          # GET statut cache / POST sync manuelle
│   ├── telechargement/[id]/route.ts  # GET détail + CSV
│   └── users/route.ts                # POST gestion utilisateurs
├── login/page.tsx
├── error.tsx
├── not-found.tsx
└── page.tsx
components/
├── Sidebar.tsx
├── Topbar.tsx
├── LogoutButton.tsx
├── Toast.tsx
├── DroitsClient.tsx
├── PlanificationClient.tsx
└── TelechargementClient.tsx
config/
└── batches.ts                        # Constantes métier des 4 batchs
lib/
├── auth.ts                           # JWT helpers
├── db.ts                             # Pool connexion MariaDB
├── sellsy.ts                         # Client API Sellsy + gestion quotas
├── sellsy-sync.ts                    # Sync complète cache nocturne
├── scheduler.ts                      # CRON (sync 2h + planifications)
└── useToast.ts                       # Hook notifications toast
proxy.ts                              # Protection des routes
```

---

## Flags de production

Dans `app/api/extraction/route.ts` et `lib/scheduler.ts` :

```ts
const MOCK_MODE = false; // true = données fictives (tests uniquement)
const DRY_RUN   = true;  // true = pas de MàJ datemailling dans Sellsy
```

> ⚠️ Avant la mise en production réelle : valider les extractions avec Rémi, puis passer `DRY_RUN = false` dans les deux fichiers.

---

## Règles métier — 4 batchs

Les prospects sont extraits en 4 batchs successifs. Seuls les prospects **non archivés** en département **29 ou 56** sont concernés.

Les constantes (délais, limites, secteurs exclus) sont centralisées dans `config/batches.ts`.

| Batch | Département | Date commande NDD | Date fin contrat | Date mailing | Limite |
|-------|-------------|-------------------|------------------|--------------|--------|
| 1 — Priorité | 29 ou 56 | > 2,5 ans | Inconnue | Inconnue ou > 2 ans | Aucune |
| 2 | 29 | Inconnue | Inconnue | Inconnue | 10 max |
| 3 | 29 | Inconnue | Inconnue | Connue, avant 01/01/2000 | 10 max |
| 4 — Complétion | 29 | Inconnue | Inconnue | Entre 01/01/2000 et now-2ans | Illimitée |

Le batch 4 exclut certains secteurs d'activité et applique un cap de 7% par secteur pour maximiser la diversité. Voir `config/batches.ts` pour la liste complète.

---

## Cache Sellsy

Pour des raisons de performance et de quota API, les prospects sont mis en cache dans `sellsy_cache`.

- **Sync automatique** : chaque nuit à 2h via `node-cron`
- **Sync manuelle** : page Droits d'accès → **↻ Synchroniser Sellsy**

La sync récupère tous les prospects non archivés en 29/56 (~600 pages × 100 prospects, durée ~5 min). Les extractions lisent uniquement la BDD locale — résultat en moins de 2 secondes.

Après chaque extraction, le `datemailling` est mis à jour dans Sellsy et dans le cache simultanément.

---

## Gestion des quotas Sellsy

| Header | Seuil | Action |
|--------|-------|--------|
| `X-Quota-Remaining-By-Second` | ≤ 5 | Pause 60 secondes |
| `X-Quota-Remaining-By-Minute` | ≤ 30 | Pause 60 secondes |
| `X-Quota-Remaining-By-Day` | ≤ 100 | Stop + erreur 503 |

---

## CI — GitHub Actions

Un workflow CI tourne automatiquement à chaque push ou merge sur `main` :

1. Vérification TypeScript (`tsc --noEmit`)
2. Lint ESLint
3. Build Next.js

Si le CI est rouge → ne pas déployer.

> ℹ️ Le déploiement automatique (CD) n'est pas encore disponible sur Infomaniak Node.js mutualisé (clés SSH privées non supportées). Il sera activé dès qu'Infomaniak déploiera cette fonctionnalité.

---

## Déploiement (Infomaniak)

```bash
# 1. Depuis le poste dev — merger et pusher sur main
git checkout main
git merge develop
git push origin main

# 2. Attendre que le CI GitHub Actions soit vert ✅

# 3. Sur le serveur via console SSH Infomaniak
cd /srv/customer/sites/enextract.eness.fr
git stash
git pull origin main

# 4. Depuis le Manager Infomaniak
# → Build → Lancer la construction
# → Redémarrer l'application
```

---

## Workflow Git

```
main        ← production (enextract.eness.fr)
develop     ← intégration
feature/xxx ← développement d'une fonctionnalité
```

```bash
# Nouvelle fonctionnalité
git checkout develop
git checkout -b feature/ma-feature
# ... développement ...
git add .
git commit -m "feat: description"
git push origin feature/ma-feature

# Merge vers production
git checkout develop
git merge feature/ma-feature
git push origin develop
git checkout main
git pull origin main --rebase
git merge develop
git push origin main
git checkout develop
```

**Convention des commits**

| Préfixe | Usage |
|---------|-------|
| `feat:` | Nouvelle fonctionnalité |
| `fix:` | Correction de bug |
| `refactor:` | Refactorisation sans changement de comportement |
| `chore:` | Tâche technique (dépendances, config) |
| `style:` | Changement visuel uniquement |
| `ci:` | Modification du pipeline CI/CD |

---

## Comptes

| Email | Rôle | Accès |
|-------|------|-------|
| remi@eness.fr | Admin | Toutes les pages + gestion utilisateurs + sync Sellsy |
| elodie@eness.fr | Commercial | Extraction, planification, téléchargement |

---

## Champs custom Sellsy

| Champ | Code | ID |
|-------|------|----|
| Date mailing | `datemailling` | 32239 |
| Date commande NDD | `datecommandendd` | 264244 |
| Date fin contrat | `date-fin-contrat` | 264245 |

---

## Auteur

**Titouan Perivier--Vigouroux**  
Chef de projet — EneXtract  
e-Ness, Quimper  
Alternant CESI — 2025/2026