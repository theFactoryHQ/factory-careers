import {
  pgTable,
  text,
  index,
  integer,
  timestamp,
  uniqueIndex,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { user, organization } from './auth'

// ─────────────────────────────────────────────
// SSO Provider Table (Better Auth SSO Plugin)
// ─────────────────────────────────────────────

export const ssoProvider = pgTable('sso_provider', {
  id: text('id').primaryKey(),
  issuer: text('issuer').notNull(),
  domain: text('domain').notNull(),
  oidcConfig: text('oidc_config'),
  samlConfig: text('saml_config'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  providerId: text('provider_id').notNull(),
  organizationId: text('organization_id').references(() => organization.id, { onDelete: 'cascade' }),
}, (t) => ([
  index('sso_provider_domain_idx').on(t.domain),
  index('sso_provider_provider_id_idx').on(t.providerId),
  index('sso_provider_organization_id_idx').on(t.organizationId),
  uniqueIndex('sso_provider_id_organization_id_unique_idx').on(t.id, t.organizationId),
]))

export const ssoProviderCredentialMetadata = pgTable('sso_provider_credential_metadata', {
  id: text('id').primaryKey(),
  ssoProviderId: text('sso_provider_id').notNull(),
  organizationId: text('organization_id').notNull(),
  credentialKeyId: text('credential_key_id').notNull(),
  activatedAt: timestamp('activated_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSuccessfulProbeAt: timestamp('last_successful_probe_at', { withTimezone: true }),
  lastProbedAt: timestamp('last_probed_at', { withTimezone: true }),
  lastAlertedAt: timestamp('last_alerted_at', { withTimezone: true }),
  lastProbeStatus: text('last_probe_status'),
  consecutiveTransientFailures: integer('consecutive_transient_failures').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ([
  uniqueIndex('sso_provider_credential_metadata_provider_id_idx').on(t.ssoProviderId),
  index('sso_provider_credential_metadata_organization_id_idx').on(t.organizationId),
  index('sso_provider_credential_metadata_expires_at_idx').on(t.expiresAt),
  check(
    'sso_provider_credential_metadata_failures_check',
    sql`${t.consecutiveTransientFailures} >= 0`,
  ),
  foreignKey({
    name: 'sso_provider_credential_metadata_provider_organization_fk',
    columns: [t.ssoProviderId, t.organizationId],
    foreignColumns: [ssoProvider.id, ssoProvider.organizationId],
  }).onDelete('cascade'),
]))

export const ssoProviderRelations = relations(ssoProvider, ({ one }) => ({
  user: one(user, { fields: [ssoProvider.userId], references: [user.id] }),
  organization: one(organization, { fields: [ssoProvider.organizationId], references: [organization.id] }),
  credentialMetadata: one(ssoProviderCredentialMetadata),
}))

export const ssoProviderCredentialMetadataRelations = relations(
  ssoProviderCredentialMetadata,
  ({ one }) => ({
    provider: one(ssoProvider, {
      fields: [ssoProviderCredentialMetadata.ssoProviderId],
      references: [ssoProvider.id],
    }),
    organization: one(organization, {
      fields: [ssoProviderCredentialMetadata.organizationId],
      references: [organization.id],
    }),
  }),
)
