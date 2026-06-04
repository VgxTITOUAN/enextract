// ─── Délais d'exclusion ───────────────────────────────────────────
export const BATCH1_MIN_YEARS = 2.5;      // datecommandendd > 2.5 ans
export const BATCH2_MAX_MONTHS = 48;      // datemailling < 4 ans
export const BATCH3_MAX_MONTHS = 48;      // idem batch 2

// ─── Limites par batch ───────────────────────────────────────────
export const BATCH2_MAX_PROSPECTS = 10;
export const BATCH3_MAX_PROSPECTS = 10;

// ─── Batch 4 — diversification secteurs ──────────────────────────
export const BATCH4_SECTOR_CAP_PERCENT = 0.07;  // 7% max par secteur

export const BATCH4_EXCLUDED_SECTORS: string[] = [
  'Bar / Café',
  'Cave à vins',
  'Coaching',
  'Coursier',
  'École',
  'Élevage animaux',
  'Mairie',
  'Podologue',
  'Relooking',
  'Tatoueur',
  'Thérapeute',
];

// Secteurs considérés comme "inconnus" → on garde le prospect
export const BATCH4_UNKNOWN_SECTORS: string[] = [
  'NC',
  'Inconnu',
  '',
];
