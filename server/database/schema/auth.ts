import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─────────────────────────────────────────────
// Better Auth Core Tables
// ─────────────────────────────────────────────

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Organization plugin: tracks the active tenant for this session
  activeOrganizationId: text('active_organization_id'),
}, (t) => ([
  index('session_user_id_idx').on(t.userId),
]))

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('account_user_id_idx').on(t.userId),
]))

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ([
  index('verification_identifier_idx').on(t.identifier),
]))

// ─────────────────────────────────────────────
// Better Auth Device Authorization Tables
// ─────────────────────────────────────────────
// Required by the deviceAuthorization plugin. This backs CLI sign-in via
// OAuth 2.0 Device Authorization without weakening the existing web session
// and organization permission checks.

export const deviceCode = pgTable('device_code', {
  id: text('id').primaryKey(),
  deviceCode: text('device_code').notNull(),
  userCode: text('user_code').notNull(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
  clientId: text('client_id'),
  scope: text('scope'),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  lastPolledAt: timestamp('last_polled_at'),
  pollingInterval: integer('polling_interval'),
}, (t) => ([
  index('device_code_device_code_idx').on(t.deviceCode),
  index('device_code_user_code_idx').on(t.userCode),
  index('device_code_user_id_idx').on(t.userId),
]))

// ─────────────────────────────────────────────
// Organization Plugin Tables (Multi-tenancy)
// ─────────────────────────────────────────────

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logo: text('logo'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const member = pgTable('member', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('member_user_id_idx').on(t.userId),
  index('member_organization_id_idx').on(t.organizationId),
  uniqueIndex('member_user_org_unique_idx').on(t.userId, t.organizationId),
]))

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  inviterId: text('inviter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ([
  index('invitation_organization_id_idx').on(t.organizationId),
  index('invitation_email_idx').on(t.email),
]))

// ─────────────────────────────────────────────
// Better Auth Rate Limit Table (database-backed)
// ─────────────────────────────────────────────
// Required when rateLimit.storage is set to "database" in the Better Auth config.
// Stores per-IP request counts with sliding window timestamps.

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'bigint' }).notNull(),
}, (t) => ([
  index('rate_limit_key_idx').on(t.key),
]))

// ─────────────────────────────────────────────
// Relations (enables Drizzle relational queries)
// ─────────────────────────────────────────────

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  deviceCodes: many(deviceCode),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}))

export const memberRelations = relations(member, ({ one }) => ({
  user: one(user, { fields: [member.userId], references: [user.id] }),
  organization: one(organization, { fields: [member.organizationId], references: [organization.id] }),
}))

export const invitationRelations = relations(invitation, ({ one }) => ({
  inviter: one(user, { fields: [invitation.inviterId], references: [user.id] }),
  organization: one(organization, { fields: [invitation.organizationId], references: [organization.id] }),
}))

export const deviceCodeRelations = relations(deviceCode, ({ one }) => ({
  user: one(user, { fields: [deviceCode.userId], references: [user.id] }),
}))
