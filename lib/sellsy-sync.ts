import pool from '@/lib/db';
import { getProspectsEnriched } from '@/lib/sellsy';

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
            p._embed?.custom_fields?.find((f: any) => f.id === 47599)?.value ?? null,
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
