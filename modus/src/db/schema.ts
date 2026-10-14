/**
 * MODUS schema. Every fact-bearing row carries a source and, where it is a claim, a tier.
 * Totals are never stored for an offender: see sql/views.sql (offender_totals).
 */
import {
  pgTable, pgEnum, serial, text, integer, boolean, timestamp, jsonb, real, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

export const TIERS = [
  'convicted_at_trial', 'guilty_plea', 'charged_pending', 'charged_died_before_trial',
  'cleared_by_exception', 'confessed_uncharged', 'investigator_attributed', 'named_in_reporting',
  'researcher_suspected', 'rumored',
] as const;
export type Tier = (typeof TIERS)[number];
export const tierEnum = pgEnum('tier', TIERS);

export const legalStatusEnum = pgEnum('legal_status', [
  'convicted', 'guilty_plea', 'charged', 'died_uncharged', 'unidentified', 'named_in_reporting',
]);
export const outcomeEnum = pgEnum('proceeding_outcome', [
  'conviction', 'guilty_plea', 'acquittal', 'vacated', 'dismissed', 'charged_pending', 'died_pending',
]);
export const basisEnum = pgEnum('conviction_basis', ['physical', 'led_to_remains', 'confession', 'witness', 'other']);
export const dispositionEnum = pgEnum('count_disposition', ['guilty', 'acquitted', 'vacated', 'pending']);
export const laneEnum = pgEnum('event_lane', ['investigation', 'forensics', 'court']);
export const sourceKindEnum = pgEnum('source_kind', [
  'charging_document', 'plea', 'judgment', 'evidence_summary', 'opinion', 'agency', 'dataset',
  'reporting', 'reporting_archive', 'book', 'encyclopedia', 'other',
]);
export const howCaughtEnum = pgEnum('how_caught', [
  'forensic_science', 'traffic_stop', 'survivor_or_witness', 'records', 'investigation', 'surrendered', 'still_open',
]);
export const reviewStatusEnum = pgEnum('review_status', ['open', 'resolved', 'dismissed']);

export const sources = pgTable('sources', {
  id: text('id').primaryKey(),
  kind: sourceKindEnum('kind').notNull(),
  title: text('title').notNull(),
  publisher: text('publisher'),
  date: text('date'),          // ISO date, YYYY-MM or YYYY; null when not established
  pages: integer('pages'),
  url: text('url'),
  archiveUrl: text('archive_url'),
  note: text('note'),
});

export const offenders = pgTable('offenders', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name'),       // for tight chart rows; null = use name
  alias: text('alias'),
  legalStatus: legalStatusEnum('legal_status').notNull(),
  caption: text('caption'),
  caseNumber: text('case_number'),
  court: text('court'),
  lede: text('lede'),
  firstKillingYear: integer('first_killing_year'),
  lastKillingYear: integer('last_killing_year'),
  caughtYear: integer('caught_year'),
  diedYear: integer('died_year'),
  living: boolean('living'),                 // null = not established
  states: text('states').array().notNull().default([]),
  statesNote: text('states_note'),
  methods: text('methods').array().notNull().default([]),
  victimology: text('victimology'),
  howCaught: howCaughtEnum('how_caught'),
  howCaughtText: text('how_caught_text'),
  mobility: text('mobility'),
  homeBaseCounty: text('home_base_county'),
  homeBaseState: text('home_base_state'),
  vitals: jsonb('vitals').$type<{ k: string; v: string; sourceId?: string | null }[]>().default([]),
  chain: jsonb('chain').$type<{ y: string; h: string; t: string; key: boolean }[]>().default([]),
  notes: jsonb('notes').$type<Record<string, unknown>>().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const proceedings = pgTable('proceedings', {
  id: text('id').primaryKey(),
  offenderId: integer('offender_id').notNull().references(() => offenders.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  court: text('court'),
  caseNumber: text('case_number'),
  date: text('date'),
  outcome: outcomeEnum('outcome').notNull(),
  counts: integer('counts').notNull(),      // number of murder counts this outcome covers
  tier: tierEnum('tier').notNull(),
  sourceId: text('source_id').references(() => sources.id),
  note: text('note'),
}, (t) => [index('proceedings_offender_idx').on(t.offenderId)]);

export const counts = pgTable('counts', {
  id: serial('id').primaryKey(),
  offenderId: integer('offender_id').notNull().references(() => offenders.id, { onDelete: 'cascade' }),
  proceedingId: text('proceeding_id').notNull().references(() => proceedings.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  label: text('label').notNull(),           // 'I' … 'XLVIII', '2011'
  victimName: text('victim_name'),
  ageAtDeath: integer('age_at_death'),
  lastSeen: text('last_seen'),              // ISO / YYYY-MM / null
  found: text('found'),
  recoverySite: text('recovery_site'),
  basis: basisEnum('basis').notNull(),
  dna: boolean('dna').notNull().default(false),
  paint: boolean('paint').notNull().default(false),
  ledToRemains: boolean('led_to_remains').notNull().default(false),
  partialRemains: boolean('partial_remains').notNull().default(false),
  janeDoeLabel: text('jane_doe_label'),
  identifiedYear: integer('identified_year'),
  schematicX: real('schematic_x'),
  schematicY: real('schematic_y'),
  disposition: dispositionEnum('disposition').notNull().default('guilty'),
  narrative: jsonb('narrative').$type<{ establishes: string[] }>(),
  sourceId: text('source_id').references(() => sources.id),
  pinpoint: text('pinpoint'),               // page cite inside the source; null = to be added
}, (t) => [uniqueIndex('counts_offender_label_idx').on(t.offenderId, t.label)]);

export const attributions = pgTable('attributions', {
  id: serial('id').primaryKey(),
  offenderId: integer('offender_id').notNull().references(() => offenders.id, { onDelete: 'cascade' }),
  totalCount: integer('total_count').notNull(),   // a total attributed figure (includes any proven counts)
  tier: tierEnum('tier').notNull(),
  sourceId: text('source_id').references(() => sources.id),
  note: text('note'),
});

/** A sourced value for one field of one subject. Several claims on one field = a conflict (view). */
export const claims = pgTable('claims', {
  id: serial('id').primaryKey(),
  subjectType: text('subject_type').notNull(),   // 'offender' | 'count' | 'cluster'
  subjectId: integer('subject_id').notNull(),
  field: text('field').notNull(),
  value: text('value').notNull(),
  tier: tierEnum('tier').notNull(),
  sourceId: text('source_id').references(() => sources.id),
  note: text('note'),
}, (t) => [index('claims_subject_idx').on(t.subjectType, t.subjectId, t.field)]);

export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  offenderId: integer('offender_id').notNull().references(() => offenders.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  date: text('date').notNull(),
  lane: laneEnum('lane').notNull(),
  text: text('text').notNull(),
  sourceId: text('source_id').references(() => sources.id),
});

export const documents = pgTable('documents', {
  offenderId: integer('offender_id').notNull().references(() => offenders.id, { onDelete: 'cascade' }),
  sourceId: text('source_id').notNull().references(() => sources.id),
  seq: integer('seq').notNull(),
}, (t) => [uniqueIndex('documents_pk').on(t.offenderId, t.sourceId)]);

export const mapClusters = pgTable('map_clusters', {
  id: serial('id').primaryKey(),
  lens: text('lens').notNull(),           // 'full' | 'decade'
  decade: integer('decade'),
  county: text('county').notNull(),
  state: text('state').notNull(),
  weapon: text('weapon').notNull(),
  weaponClass: text('weapon_class'),
  victims: integer('victims').notNull(),
  solved: integer('solved').notNull(),
  firstYear: integer('first_year'),
  lastYear: integer('last_year'),
  fips: text('fips'),
  note: text('note'),
  sourceId: text('source_id').references(() => sources.id),
}, (t) => [index('map_clusters_lens_idx').on(t.lens)]);

export const mapStats = pgTable('map_stats', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  sourceId: text('source_id').references(() => sources.id),
});

export const reviewQueue = pgTable('review_queue', {
  id: serial('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  subjectType: text('subject_type').notNull(),
  subjectId: integer('subject_id'),
  subjectLabel: text('subject_label'),
  kind: text('kind').notNull(),           // 'missing_citation' | 'missing_pinpoint' | 'source_conflict' | 'unverified_count' | ...
  message: text('message').notNull(),
  status: reviewStatusEnum('status').notNull().default('open'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

/** Second-pass verification verdicts, written by the verifier skill (never by the researcher). */
export const verdictEnum = pgEnum('verdict', ['confirmed', 'mismatch', 'unverifiable']);
export const verifications = pgTable('verifications', {
  id: serial('id').primaryKey(),
  subjectType: text('subject_type').notNull(),   // 'proceeding' | 'count' | 'attribution' | 'claim'
  subjectId: text('subject_id').notNull(),       // proceedings.id is text; others are numeric ids as text
  field: text('field'),
  verdict: verdictEnum('verdict').notNull(),
  expected: text('expected'),
  found: text('found'),
  sourceId: text('source_id').references(() => sources.id),
  note: text('note'),
  verifier: text('verifier').notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('verifications_subject_idx').on(t.subjectType, t.subjectId)]);
