-- Colonnes pour export CSV complet depuis extraction_prospects
ALTER TABLE extraction_prospects
  ADD COLUMN secteur_activite  VARCHAR(255) NULL DEFAULT NULL AFTER zip_code,
  ADD COLUMN date_fin_contrat    DATE         NULL DEFAULT NULL AFTER date_mailing_after,
  ADD COLUMN date_commande_ndd   DATE         NULL DEFAULT NULL AFTER date_fin_contrat;
