import {
  BATCH1_MIN_YEARS,
  BATCH4_EXCLUDED_SECTORS,
  BATCH4_SECTOR_CAP_PERCENT,
  BATCH4_UNKNOWN_SECTORS,
} from '@/config/batches';

export const CF_DATE_MAILING      = 'datemailling';
export const CF_DATE_COMMANDE_NOM = 'datecommandendd';
export const CF_DATE_FIN_CONTRAT  = 'date-fin-contrat';
export const CF_DEPARTEMENT       = 'zip_code';

export function isUnknown(val: any): boolean {
  return val === null || val === undefined || val === '' || val === '0000-00-00';
}

export function subYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

export function subMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function applyBatch1(prospects: any[], dateSortie: Date): any[] {
  const limite        = subMonths(dateSortie, BATCH1_MIN_YEARS * 12);
  const limiteMailing = subYears(dateSortie, 2);

  return prospects.filter(p => {
    const dept = p[CF_DEPARTEMENT] ?? '';
    if (!dept.startsWith('29') && !dept.startsWith('56')) return false;

    const dateCommande = p[CF_DATE_COMMANDE_NOM];
    if (isUnknown(dateCommande)) return false;
    if (new Date(dateCommande) > limite) return false;

    if (!isUnknown(p[CF_DATE_FIN_CONTRAT])) return false;

    const dateMailing = p[CF_DATE_MAILING];
    if (!isUnknown(dateMailing) && new Date(dateMailing) > limiteMailing) return false;

    return true;
  });
}

export function applyBatch2(prospects: any[]): any[] {
  return prospects.filter(p => {
    if (!(p[CF_DEPARTEMENT] ?? '').startsWith('29')) return false;
    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    if (!isUnknown(p[CF_DATE_MAILING]))       return false;
    return true;
  });
}

export function applyBatch3(prospects: any[]): any[] {
  const limite2000 = new Date('2000-01-01');
  return prospects.filter(p => {
    if (!(p[CF_DEPARTEMENT] ?? '').startsWith('29')) return false;
    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    const dm = p[CF_DATE_MAILING];
    if (isUnknown(dm)) return false;
    if (new Date(dm) >= limite2000) return false;
    return true;
  });
}

export function applyBatch4(prospects: any[], nbTotal: number, nbRestant: number): any[] {
  const limite2000    = new Date('2000-01-01');
  const limiteMailing = subYears(new Date(), 2);
  const maxPerSector = Math.ceil(nbTotal * BATCH4_SECTOR_CAP_PERCENT);

  const eligible = prospects.filter(p => {
    if (!(p[CF_DEPARTEMENT] ?? '').startsWith('29')) return false;
    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    const dm = p[CF_DATE_MAILING];
    if (isUnknown(dm)) return false;
    const d = new Date(dm);
    if (d < limite2000 || d > limiteMailing) return false;
    if (BATCH4_EXCLUDED_SECTORS.includes(p.secteur_activite)) return false;
    return true;
  });

  const bySector: Record<string, any[]> = {};
  for (const p of eligible) {
    const key = p.secteur_activite ?? BATCH4_UNKNOWN_SECTORS[0];
    bySector[key] = bySector[key] ?? [];
    bySector[key].push(p);
  }

  for (const key in bySector) {
    bySector[key] = shuffle(bySector[key]);
  }

  const sectorCount: Record<string, number> = {};
  const result: any[] = [];

  while (result.length < nbRestant) {
    let added = false;
    for (const sector in bySector) {
      if (result.length >= nbRestant) break;
      const count = sectorCount[sector] ?? 0;
      if (count >= maxPerSector) continue;
      if (bySector[sector].length === 0) continue;
      result.push(bySector[sector].shift()!);
      sectorCount[sector] = count + 1;
      added = true;
    }
    if (!added) break;
  }

  if (result.length < nbRestant) {
    const selectedIds = new Set(result.map(p => String(p.id)));
    const fallback = shuffle(eligible.filter(p => !selectedIds.has(String(p.id))));
    for (const p of fallback.slice(0, nbRestant - result.length)) {
      const sector = p.secteur_activite ?? BATCH4_UNKNOWN_SECTORS[0];
      result.push(p);
      sectorCount[sector] = (sectorCount[sector] ?? 0) + 1;
    }
  }

  console.log('[BATCH4] Répartition secteurs:', sectorCount);
  return result;
}
