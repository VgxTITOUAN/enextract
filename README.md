# EneXtract

Application web interne développée par **Titouan Perivier--Vigouroux** pour **e-Ness** (agence web, Quimper).

Ma solution EneXtract automatise l'extraction de prospects depuis le CRM Sellsy selon des règles métier précises, génère des fichiers CSV prêts à l'emploi pour les campagnes de mailing, et planifie les extractions récurrentes ou ponctuelles.

---

## Stack technique

| Composant | Technologie |
|-----------|-------------|
| Framework | Next.js (App Router) |
| Runtime | Node.js 24 |
| Base de données | MariaDB 10.6 |
| Style | Tailwind CSS |
| Auth | JWT (httpOnly cookie, 8h) |
| CRM | Sellsy API v2 (OAuth2 client_credentials) |
| Hébergement | Infomaniak (Node.js mutualisé) |

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
DB_HOST=your_host
DB_NAME=your_db
DB_USER=your_user
DB_PASS=your_password

# JWT
JWT_SECRET=your_jwt_secret_long_random_string

# Sellsy
SELLSY_CLIENT_ID=your_sellsy_client_id
SELLSY_CLIENT_SECRET=your_sellsy_client_secret

# App
NEXT_PUBLIC_BASE_URL=https://your-domain.fr

# CRON (sync nocturne Sellsy)
CRON_SECRET=your_random_secret_string
```

---

## Base de données

Exécuter les migrations dans l'ordre :

```sql
-- Table utilisateurs
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role ENUM('admin','commercial') DEFAULT 'commercial',
  active TINYINT DEFAULT 1,
  sellsy_token TEXT NULL,
  sellsy_refresh TEXT NULL,
  sellsy_token_exp DATETIME NULL,
  derniere_connexion DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table extractions
CREATE TABLE extractions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  schedule_id INT NULL,
  type ENUM('immediate','planifiee','recurrente','cron_sync') NOT NULL,
  date_lancement DATETIME NOT NULL,
  nb_demande INT DEFAULT 0,
  nb_sortie INT DEFAULT 0,
  nb_maj_sellsy INT DEFAULT 0,
  chemin_fichier VARCHAR(500) NULL,
  status ENUM('pending','done','partial','error') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table prospects extraits
CREATE TABLE extraction_prospects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  extraction_id INT NOT NULL,
  sellsy_id VARCHAR(50) NOT NULL,
  company_name VARCHAR(255) NULL,
  website VARCHAR(255) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  phone_mobile VARCHAR(30) NULL,
  date_mailing_before DATE NULL,
  date_mailing_after DATE NULL,
  sellsy_updated TINYINT DEFAULT 0
);

-- Table notifications
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NULL,
  lien_redirection VARCHAR(255) NULL,
  lu TINYINT DEFAULT 0,
  date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table planifications
CREATE TABLE schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('planifiee','recurrente') NOT NULL,
  rythme ENUM('semaine','demi-semaine') NULL,
  date_lancement DATETIME NOT NULL,
  heure VARCHAR(5) DEFAULT '00:00',
  nb_prospects INT NOT NULL,
  actif TINYINT DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cache prospects Sellsy
CREATE TABLE sellsy_cache (
  id INT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  website VARCHAR(255) NULL,
  zip_code VARCHAR(10) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  phone VARCHAR(30) NULL,
  phone_mobile VARCHAR(30) NULL,
  datemailling DATE NULL,
  datecommandendd DATE NULL,
  date_fin_contrat DATE NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_zip (zip_code),
  INDEX idx_synced (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

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
│   ├── extraction/page.tsx       # Demande d'extraction
│   ├── planification/page.tsx    # Gestion des planifications
│   ├── telechargement/page.tsx   # Historique + téléchargement CSV
│   └── droits/page.tsx           # Gestion utilisateurs (admin)
├── api/
│   ├── auth/login/route.ts
│   ├── auth/logout/route.ts
│   ├── extraction/route.ts
│   ├── planification/route.ts
│   ├── sellsy-sync/
│   │   ├── route.ts              # Sync manuelle (admin)
│   │   └── cron/route.ts         # Sync automatique (CRON_SECRET)
│   ├── telechargement/[id]/route.ts
│   └── users/route.ts
├── login/page.tsx
└── page.tsx
components/
├── Sidebar.tsx
├── Topbar.tsx
├── DroitsClient.tsx
├── PlanificationClient.tsx
└── TelechargementClient.tsx
lib/
├── db.ts
├── auth.ts
├── sellsy.ts                     # Client Sellsy + lecture cache BDD
└── scheduler.ts                  # CRON node-cron (sync 2h/nuit)
instrumentation.ts                # Init scheduler au démarrage Next.js
```

---

## Règles métier — extraction

Les prospects sont filtrés en 4 batches successifs, tous sur des prospects **non archivés** :

| Batch | Département | Date commande nom | Date fin contrat | Date mailing | Limite |
|-------|-------------|-------------------|------------------|--------------|--------|
| 1 (priorité) | 29 ou 56 | > 2,5 ans | Inconnue | Inconnue ou > 2 ans | Aucune |
| 2 | 29 | Inconnue | Inconnue | Inconnue | 10 max |
| 3 | 29 | Inconnue | Inconnue | Connue, avant 01/01/2000 | 10 max |
| 4 | 29 | Inconnue | Inconnue | Entre 01/01/2000 et now-2ans | Complète |

> Les règles métier sont accessibles et modifiables uniquement par les administrateurs.

---

## Cache Sellsy

Pour des raisons de performance, les données Sellsy sont mises en cache dans la table `sellsy_cache`.

**Sync manuelle** : page Droits → bouton "Synchroniser Sellsy"  
**Sync automatique** : chaque nuit à 2h via `node-cron` (initialisé dans `instrumentation.ts`)

La sync charge les ~42 000 prospects non archivés depuis l'API Sellsy (durée : 20-40 min).  
Les extractions lisent uniquement la BDD locale → < 1 seconde.

---

## Déploiement (Infomaniak)

```bash
# Sur le serveur via SSH
cd /srv/customer/sites/enextract.eness.fr
git stash
git pull origin main
npm install
npm run build
# Redémarrer via le Manager Infomaniak → Redémarrer
```

---

## Comptes

| Email | Rôle | Usage |
|-------|------|-------|
| remi@eness.fr | Admin | Gestion complète |
| elodie@eness.fr | Commercial | Extraction + téléchargement |

---

## Workflow Git

```
main          ← production
develop       ← intégration
feature/xxx   ← développement fonctionnalité
```

```bash
# Toujours travailler sur develop ou feature/
git checkout develop
# ... développement ...
git add .
git commit -m "feat(scope): description"
git push origin develop
git checkout main
git pull origin main --rebase
git merge develop
git push origin main
git checkout develop
```

---

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `DB_HOST` | Hôte MariaDB |
| `DB_NAME` | Nom de la base |
| `DB_USER` | Utilisateur BDD |
| `DB_PASS` | Mot de passe BDD |
| `JWT_SECRET` | Clé de signature JWT |
| `SELLSY_CLIENT_ID` | OAuth2 Client ID Sellsy |
| `SELLSY_CLIENT_SECRET` | OAuth2 Client Secret Sellsy |
| `NEXT_PUBLIC_BASE_URL` | URL publique de l'app |
| `CRON_SECRET` | Clé secrète endpoint sync CRON |

---

## Auteur

**Titouan Perivier--Vigouroux**  
Chef de projet — EneXtract  
e-Ness, Quimper  
Alternant CESI