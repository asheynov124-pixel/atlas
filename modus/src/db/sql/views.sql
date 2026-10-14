-- Computed totals. Never store a proven total on an offender.
CREATE OR REPLACE VIEW offender_totals AS
SELECT o.id AS offender_id, o.slug,
  COALESCE(SUM(CASE WHEN p.outcome IN ('conviction','guilty_plea') THEN p.counts
                    WHEN p.outcome IN ('vacated') THEN -p.counts ELSE 0 END), 0)::int AS proven,
  GREATEST(
    COALESCE(SUM(CASE WHEN p.outcome IN ('conviction','guilty_plea') THEN p.counts
                      WHEN p.outcome IN ('vacated') THEN -p.counts ELSE 0 END), 0),
    COALESCE((SELECT MAX(a.total_count) FROM attributions a WHERE a.offender_id = o.id), 0)
  )::int AS attributed
FROM offenders o
LEFT JOIN proceedings p ON p.offender_id = o.id
GROUP BY o.id, o.slug;

-- Proceedings whose victim-level rows do not add up. Must be empty.
CREATE OR REPLACE VIEW proceeding_reconciliation AS
SELECT p.id AS proceeding_id, p.counts AS declared, COUNT(c.id)::int AS rows_present
FROM proceedings p JOIN counts c ON c.proceeding_id = p.id
GROUP BY p.id, p.counts
HAVING COUNT(c.id) <> p.counts;

-- Fields with more than one distinct sourced value.
CREATE OR REPLACE VIEW source_conflicts AS
SELECT subject_type, subject_id, field, COUNT(DISTINCT value)::int AS values_n,
  json_agg(json_build_object('value', value, 'tier', tier, 'source_id', source_id, 'note', note) ORDER BY
    array_position(ARRAY['convicted_at_trial','guilty_plea','charged_pending','charged_died_before_trial',
      'cleared_by_exception','confessed_uncharged','investigator_attributed','named_in_reporting',
      'researcher_suspected','rumored']::text[], tier::text)) AS claims
FROM claims
GROUP BY subject_type, subject_id, field
HAVING COUNT(DISTINCT value) > 1;

-- Per-count basis split for a dossier.
CREATE OR REPLACE VIEW count_basis_split AS
SELECT offender_id, basis, COUNT(*)::int AS n FROM counts WHERE disposition = 'guilty' GROUP BY offender_id, basis;
