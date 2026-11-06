import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const libraryMeta = sqliteTable('library_meta', {
  id: integer('id').primaryKey(), revision: integer('revision').notNull().default(0),
});
export const libraryRecords = sqliteTable('library_records', {
  key: text('key').primaryKey(), kind: text('kind').notNull(),
  data: text('data'), revision: integer('revision').notNull(),
});
export const proposals = sqliteTable('proposals', {
  id: text('id').primaryKey(), actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(), createdAt: text('created_at').notNull(),
  kind: text('kind').notNull(), payload: text('payload').notNull(),
  baseRevision: integer('base_revision').notNull(), status: text('status').notNull(),
  reviewedAt: text('reviewed_at'), reviewerName: text('reviewer_name'), reviewNote: text('review_note'),
  requestId: text('request_id').notNull(),
}, t => [uniqueIndex('proposal_request').on(t.actorId,t.requestId)]);
export const libraryEvents = sqliteTable('library_events', {
  id: text('id').primaryKey(), revision: integer('revision').notNull().unique(),
  groupId: text('group_id').notNull(), actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(), createdAt: text('created_at').notNull(),
  action: text('action').notNull(), recordKey: text('record_key'), recordKind: text('record_kind'),
  before: text('before'), after: text('after'), note: text('note').notNull(),
  proposalId: text('proposal_id'), requestId: text('request_id').notNull(),
}, t => [uniqueIndex('event_request').on(t.actorId,t.requestId)]);
