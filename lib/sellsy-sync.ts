import pool from '@/lib/db';
import { getProspectsEnriched } from '@/lib/sellsy';

const SECTEUR_ACTIVITE_MAP: Record<string, string> = {
  "3223393": "N/C",
  "3483135": "Cabinet infirmier",
  "3483136": "Coiffeur",
  "3484189": "Élevage animaux",
  "3493003": "Restaurateur",
  "3425003": "Peintre",
  "3425005": "Paysagiste",
  "3483813": "Menuiserie",
  "3424999": "Électricien",
  "3425004": "Couvreur",
  "3425001": "Chauffagiste",
  "3505816": "Psychologue",
  "3479861": "Mairie",
  "3424998": "Maçon",
  "3519887": "Bateau",
  "3739178": "Isolation",
  "3951112": "Podologue",
  "3483134": "Ambulances / Taxi / Pompe-funèbres",
  "3425000": "Plombier",
  "3739179": "Lavage",
  "3519937": "Loisirs",
  "3519936": "Ostréiculture",
  "3482485": "Magasin de vêtement",
  "3479860": "Garage",
  "3482484": "Géomètre",
  "3482483": "Fleuriste",
  "3482482": "Boucherie",
  "3482481": "Bijouterie",
  "3489372": "Agence immobilière",
  "3489373": "Charpentier",
  "3489374": "Magasin de lingerie",
  "3482937": "Constructeur de maison",
  "3482938": "Opticien",
  "3482939": "Audioprothésiste",
  "3482954": "Déménageur",
  "3482955": "Expert comptable",
  "3483137": "Collège / Lycée",
  "3483138": "Cuisiniste",
  "3483139": "Photographe",
  "3483140": "Vétérinaire",
  "3484085": "Hotel",
  "3484190": "Ferronnerie",
  "3484545": "Motoculture",
  "3485232": "Maitre d'œuvre",
  "3485562": "Couturier",
  "3485563": "Épicier",
  "3485785": "Carrossier",
  "3485786": "Magasin de décoration",
  "3485787": "Terrassier",
  "3486887": "Crêperie",
  "3486888": "École",
  "3479450": "Bar / Café",
  "3479492": "Architecte",
  "3479858": "Avocat",
  "3479859": "Camping",
  "3519888": "Fabricant métallique",
  "3519912": "Diagnostique immobilier",
  "3519939": "Pisciniste",
  "3519940": "Société de courtage",
  "3519941": "Thérapeute",
  "3571798": "Évènementiel",
  "3571799": "Ravalement",
  "3739171": "Alarmes",
  "3739172": "Brasserie",
  "3739173": "Camping Car",
  "3739174": "Climatisation",
  "3739175": "Décorateur",
  "3739176": "Ébéniste",
  "3739177": "Façade",
  "3739180": "Meubles",
  "3739181": "Moto",
  "3739182": "Nettoyage",
  "3739183": "Pizzeria",
  "3739184": "Rénovation",
  "3739185": "Store",
  "3739186": "Usinage",
  "3951111": "Coursier",
  "3951113": "Relooking",
  "3951114": "Tatoueur",
  "3949622": "Cave à vins",
  "3949623": "Coaching",
  "3425002": "Plaquiste",
  "3425006": "Carreleur",
  "3519938": "Ingenierie",
};

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  // Supprimer tout sauf les chiffres
  const digits = phone.replace(/\D/g, '');
  // Si commence par 33, remplacer par 0
  const local = digits.startsWith('33') ? '0' + digits.slice(2) : digits;
  // Formater en 0X XX XX XX XX
  if (local.length === 10) {
    return local.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
  }
  return phone; // retourner tel quel si format inconnu
}

export async function syncSellsyCache(): Promise<void> {
  console.log('[SYNC] Démarrage synchronisation cache Sellsy');

  let cursor: string | null = null;
  let pageNum = 0;
  let total = 0;

  do {
    try {
      // Délai de 500ms entre chaque page pour respecter les quotas
      if (pageNum > 0) {
        await new Promise(r => setTimeout(r, 500));
      }

      const { prospects: page, nextCursor } = await getProspectsEnriched(100, cursor);
      if (nextCursor === cursor) {
        console.log('[SYNC] Curseur identique — fin de la synchronisation');
        break;
      }

      cursor = nextCursor;
      pageNum++;

      if (page.length === 0) continue;

      // INSERT ou UPDATE en batch pour toute la page
      for (const p of page) {
        const rawSecteur = p._embed?.custom_fields?.find((f: any) => f.id === 47599)?.value ?? null;
        const secteur = rawSecteur ? (SECTEUR_ACTIVITE_MAP[String(rawSecteur)] ?? rawSecteur) : null;

        await pool.execute(
          `INSERT INTO sellsy_cache 
            (sellsy_id, name, email, phone, phone_mobile, website, address, city, zip_code, 
             datemailling, datecommandendd, date_fin_contrat, secteur_activite, is_archived, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())
           ON DUPLICATE KEY UPDATE
             name              = VALUES(name),
             email             = VALUES(email),
             phone             = VALUES(phone),
             phone_mobile      = VALUES(phone_mobile),
             website           = VALUES(website),
             address           = VALUES(address),
             city              = VALUES(city),
             zip_code          = VALUES(zip_code),
             datemailling      = VALUES(datemailling),
             datecommandendd   = VALUES(datecommandendd),
             date_fin_contrat  = VALUES(date_fin_contrat),
             secteur_activite  = VALUES(secteur_activite),
             is_archived       = 0,
             synced_at         = NOW()`,
          [
            String(p.id),
            p.name                                          ?? null,
            p.email                                         ?? null,
            formatPhone(p.phone_number)                     ?? null,
            formatPhone(p.mobile_number)                    ?? null,
            p.website                                       ?? null,
            p._embed?.invoicing_address?.address_line_1     ?? null,
            p._embed?.invoicing_address?.city               ?? null,
            p.zip_code                                      ?? null,
            p.datemailling                                  ?? null,
            p.datecommandendd                               ?? null,
            p['date-fin-contrat']                           ?? null,
            secteur,
          ]
        );
      }

      total += page.length;
      console.log(`[SYNC] Page ${pageNum} — ${page.length} prospects synchro (total: ${total})`);

    } catch (error: any) {
      console.error(`[SYNC] Erreur page ${pageNum}:`, error.message);
      // Continue sur la page suivante
      continue;
    }

  } while (cursor !== null);

  console.log(`[SYNC] Terminé — ${total} prospects synchronisés en ${pageNum} pages`);
}
