import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, genericOAuth } from "better-auth/plugins";
import { sso } from "@better-auth/sso";
import { eq } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { ac, owner, admin, member } from "~~/shared/permissions";
import { sendOrgInvitationEmail, sendPasswordResetEmail } from "./email";
import { deleteFromS3 } from "./s3";
import { readPositiveIntegerEnv } from "./rateLimitConfig";
import * as schema from "../database/schema";

type Auth = ReturnType<typeof betterAuth>;
let _auth: Auth | undefined;

const AUTH_RATE_LIMIT_WINDOW_SECONDS = readPositiveIntegerEnv(
  "BETTER_AUTH_RATE_LIMIT_WINDOW_SECONDS",
  60,
);
const AUTH_RATE_LIMIT_MAX_REQUESTS = readPositiveIntegerEnv(
  "BETTER_AUTH_RATE_LIMIT_MAX_REQUESTS",
  100,
);

const ORGANIZATION_DOCUMENT_DELETE_TTL_MS = 10 * 60 * 1000;

type PendingOrganizationDocumentDelete = {
  documents: Array<{ id: string; storageKey: string }>;
  cleanupTimer: ReturnType<typeof setTimeout>;
};

const pendingOrganizationDocumentDeletes = new Map<
  string,
  PendingOrganizationDocumentDelete
>();

function clearPendingOrganizationDocumentDelete(organizationId: string): void {
  const pending = pendingOrganizationDocumentDeletes.get(organizationId);
  if (pending) {
    clearTimeout(pending.cleanupTimer);
    pendingOrganizationDocumentDeletes.delete(organizationId);
  }
}

/**
 * Resolve trusted origins for CSRF checks and OIDC discovery.
 *
 * Combines:
 *  1. App origins (base URL, configured origins, dev defaults)
 *  2. Already-registered SSO provider issuers from the database
 *
 * SSO registration pre-discovers and stores explicit OIDC endpoint URLs, so
 * trusted origins only need app origins plus registered issuer origins.
 * For edge cases, add origins to the BETTER_AUTH_TRUSTED_ORIGINS env var.
 */
function resolveTrustedOrigins(baseUrl: string): (request?: Request) => Promise<string[]> {
  const configuredOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS;
  const baseOrigin = new URL(baseUrl);
  const isLocalBase =
    baseOrigin.hostname === "localhost" || baseOrigin.hostname === "127.0.0.1";
  const defaultDevOrigins =
    import.meta.dev || isLocalBase
      ? [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3333",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:3001",
          "http://127.0.0.1:3002",
          "http://127.0.0.1:3333",
        ]
      : [];

  const staticOrigins = Array.from(
    new Set([baseOrigin.origin, ...configuredOrigins, ...defaultDevOrigins]),
  );

  return async () => {
    const allOrigins = [...staticOrigins];

    // Load already-registered SSO provider issuers from the database
    try {
      const providers = await db
        .select({ issuer: schema.ssoProvider.issuer })
        .from(schema.ssoProvider);

      for (const p of providers) {
        try { allOrigins.push(new URL(p.issuer).origin); } catch {}
      }
    } catch {
      // Table may not exist yet (pre-migration)
    }

    return Array.from(new Set(allOrigins));
  };
}

function resolveBetterAuthUrl(): string {
  const explicitUrl = env.BETTER_AUTH_URL?.trim();
  const railwayDomain = env.RAILWAY_PUBLIC_DOMAIN?.trim();

  // Explicit URL always wins (Render custom domain, local dev, etc.)
  if (explicitUrl) {
    return explicitUrl;
  }

  // Retain upstream Railway preview-app compatibility.
  if (railwayDomain) {
    const domain = railwayDomain.replace(/^https?:\/\//, "");
    const url = `https://${domain}`;
    console.info(
      `[Factory Careers] Using platform public-domain BETTER_AUTH_URL: ${url}`,
    );
    return url;
  }

  throw new Error(
    "BETTER_AUTH_URL is required. On Render, set it to https://careers.thefactoryhq.com and redeploy.",
  );
}

function isMicrosoftSsoIssuer(issuer?: string): boolean {
  if (!issuer) return false;
  try {
    const hostname = new URL(issuer).hostname.toLowerCase();
    return hostname === "login.microsoftonline.com" || hostname === "sts.windows.net";
  } catch {
    return false;
  }
}

async function fetchMicrosoftSsoProfileImage(options: {
  accessToken?: string;
  providerIssuer?: string;
  userId: string;
}): Promise<string | null> {
  if (!options.accessToken || !isMicrosoftSsoIssuer(options.providerIssuer)) return null;

  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/me/photos/96x96/$value", {
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) return null;

    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch (err) {
    logError("auth.microsoft_sso_profile_image_failed", {
      posthog_distinct_id: options.userId,
      error_message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Lazily create the Better Auth instance on first access.
 * Prevents build-time prerendering from crashing when auth env vars
 * aren't available during build/prerender.
 */
function getAuth(): Auth {
  if (!_auth) {
    const baseURL = resolveBetterAuthUrl();

    _auth = betterAuth({
      baseURL,
      trustedOrigins: resolveTrustedOrigins(baseURL),
      database: drizzleAdapter(db, {
        provider: "pg",
        schema,
      }),
      secret: env.BETTER_AUTH_SECRET,

      // ── Session Hardening ────────────────────────────────────
      // Explicit session duration for an ATS handling sensitive hiring data.
      // Default Better Auth values (7 days / 1 day) are too permissive.
      session: {
        expiresIn: 60 * 60 * 24, // 24 hours
        updateAge: 60 * 60,      // Refresh session every 1 hour
      },

      emailAndPassword: {
        enabled: true,
        // Server-side password policy — prevents bypass via direct API calls.
        // Client-side validation (sign-up.vue) is UX only; this is the enforcement.
        minPasswordLength: 8,
        maxPasswordLength: 128,
        // Password reset via email.
        async sendResetPassword({ user, url, token }, request) {
          void sendPasswordResetEmail({ user, url, token });
        },
      },

      // ── OAuth Token Encryption at Rest ──────────────────────
      // Better Auth's built-in AES encryption for OAuth tokens (access, refresh, id).
      // Handles both encryption on write and automatic decryption on read,
      // using BETTER_AUTH_SECRET as the encryption key.
      account: {
        encryptOAuthTokens: true,
        accountLinking: {
          enabled: true,
          trustedProviders: ["thefactoryhq-sso"],
        },
      },

      // ── Rate Limiting (built-in, database-backed) ──────────
      // Uses DB storage so limits persist across restarts and share
      // state across instances (horizontal scaling).
      // Complements the external IP-based rate limiter in api-rate-limit.ts
      // with account-level throttling for auth-sensitive endpoints.
      // CI flags must not disable this when NODE_ENV=production because several
      // deployment platforms set them.
      rateLimit: {
        enabled: process.env.NODE_ENV === "production",
        window: AUTH_RATE_LIMIT_WINDOW_SECONDS,
        max: AUTH_RATE_LIMIT_MAX_REQUESTS, // 100 requests per minute per IP by default.
        storage: "database",
      },

      socialProviders: {
        // ── Social Sign-In (Google, GitHub, Microsoft) ────────────
        // Each provider is enabled only when its client ID + secret are set.
        ...(env.AUTH_GOOGLE_CLIENT_ID && env.AUTH_GOOGLE_CLIENT_SECRET
          ? {
              google: {
                clientId: env.AUTH_GOOGLE_CLIENT_ID,
                clientSecret: env.AUTH_GOOGLE_CLIENT_SECRET,
                prompt: "select_account",
              },
            }
          : {}),
        ...(env.AUTH_GITHUB_CLIENT_ID && env.AUTH_GITHUB_CLIENT_SECRET
          ? {
              github: {
                clientId: env.AUTH_GITHUB_CLIENT_ID,
                clientSecret: env.AUTH_GITHUB_CLIENT_SECRET,
              },
            }
          : {}),
        ...(env.AUTH_MICROSOFT_CLIENT_ID && env.AUTH_MICROSOFT_CLIENT_SECRET
          ? {
              microsoft: {
                clientId: env.AUTH_MICROSOFT_CLIENT_ID,
                clientSecret: env.AUTH_MICROSOFT_CLIENT_SECRET,
                tenantId: env.AUTH_MICROSOFT_TENANT_ID || "common",
                prompt: "select_account",
              },
            }
          : {}),
      },
      plugins: [
        organization({
          // ── Access Control ──────────────────────────────────────
          // Declarative RBAC — permissions defined once in shared/permissions.ts,
          // enforced on every API route via requirePermission().
          ac,
          roles: {
            owner,
            admin,
            member,
          },

          // ── Invitation Email ────────────────────────────────────
          // Required for Better Auth's built-in invitation flow.
          // Constructs a link the invitee clicks to accept.
          // Uses Resend when RESEND_API_KEY is configured, otherwise logs to console.
          async sendInvitationEmail(data) {
            const inviteLink = `${baseURL}/auth/accept-invitation/${data.id}`;
            await sendOrgInvitationEmail(data, inviteLink);
          },

          // ── Security Hardening ──────────────────────────────────
          // Cancel stale invitations when a new one is sent to the same email.
          cancelPendingInvitationsOnReInvite: true,
          // 48 hours (default) — explicitly stated for auditability.
          invitationExpiresIn: 48 * 60 * 60,

          organizationHooks: {
            async beforeDeleteOrganization({ organization }) {
              const documentsToDelete = await db.query.document.findMany({
                where: eq(schema.document.organizationId, organization.id),
                columns: {
                  id: true,
                  storageKey: true,
                },
              });

              clearPendingOrganizationDocumentDelete(organization.id);

              const cleanupTimer = setTimeout(() => {
                pendingOrganizationDocumentDeletes.delete(organization.id);
              }, ORGANIZATION_DOCUMENT_DELETE_TTL_MS);
              (cleanupTimer as ReturnType<typeof setTimeout> & {
                unref?: () => void;
              }).unref?.();

              pendingOrganizationDocumentDeletes.set(
                organization.id,
                {
                  documents: documentsToDelete,
                  cleanupTimer,
                },
              );
            },

            async afterDeleteOrganization({ organization }) {
              const pending =
                pendingOrganizationDocumentDeletes.get(organization.id);
              clearPendingOrganizationDocumentDelete(organization.id);
              const documentsToDelete = pending?.documents ?? [];

              for (const doc of documentsToDelete) {
                try {
                  await deleteFromS3(doc.storageKey);
                } catch (s3Error) {
                  logWarn("organization.document_s3_delete_failed", {
                    organization_id: organization.id,
                    document_id: doc.id,
                    storage_key: doc.storageKey,
                    error_message:
                      s3Error instanceof Error
                        ? s3Error.message
                        : String(s3Error),
                  });
                }
              }
            },
          },
        }),

        // ── OIDC SSO (Keycloak, Authentik, Authelia, Okta, Azure AD, etc.) ──
        // Activated only when all three OIDC env vars are set.
        // Uses better-auth's genericOAuth plugin with OIDC discovery.
        ...(env.OIDC_CLIENT_ID &&
        env.OIDC_CLIENT_SECRET &&
        env.OIDC_DISCOVERY_URL
          ? [
              genericOAuth({
                config: [
                  {
                    providerId: "oidc",
                    clientId: env.OIDC_CLIENT_ID,
                    clientSecret: env.OIDC_CLIENT_SECRET,
                    discoveryUrl: env.OIDC_DISCOVERY_URL,
                    scopes: ["openid", "email", "profile"],
                    pkce: true,
                    requireIssuerValidation: true,
                    async mapProfileToUser(profile) {
                      if (!profile.email) {
                        throw new Error(
                          "Email is required but was not provided by the identity provider. Ensure the 'email' scope is granted and the user has a verified email.",
                        );
                      }
                      return {
                        name:
                          profile.name ||
                          [profile.given_name, profile.family_name]
                            .filter(Boolean)
                            .join(" ") ||
                          profile.preferred_username ||
                          profile.email,
                        email: profile.email,
                        image: profile.picture,
                      };
                    },
                  },
                ],
              }),
            ]
          : []),

        // ── Enterprise SSO (per-organization OIDC, cloud-hosted) ─────────
        // Each organization can register their own Identity Provider (Okta,
        // Azure AD, Google Workspace, etc.). Users are auto-provisioned into
        // the linked organization on first SSO login.
        sso({
          // Auto-provision SSO users into the linked organization
          organizationProvisioning: {
            disabled: false,
            defaultRole: "member",
          },
          // Run provisioning on every login to keep profile data in sync
          provisionUserOnEveryLogin: true,
          provisionUser: async ({ user, userInfo, token, provider }) => {
            // Sync name/image from IdP on each login
            const providerName = typeof userInfo.name === "string" ? userInfo.name : null;
            const providerImage = typeof userInfo.image === "string" ? userInfo.image : null;
            const microsoftImage = await fetchMicrosoftSsoProfileImage({
              accessToken: token?.accessToken,
              providerIssuer: provider.issuer,
              userId: user.id,
            });
            const nextImage = microsoftImage || providerImage;

            if (providerName || nextImage) {
              await db
                .update(schema.user)
                .set({
                  ...(providerName ? { name: providerName } : {}),
                  ...(nextImage ? { image: nextImage } : {}),
                  updatedAt: new Date(),
                })
                .where(eq(schema.user.id, user.id));
            }
          },
        }),
      ],
    }) as unknown as Auth;
  }
  return _auth!;
}

/**
 * Lazily-initialized Better Auth instance.
 * The auth configuration is created on first property access — not at import time.
 * This prevents build-time prerendering from failing when BETTER_AUTH_SECRET
 * and BETTER_AUTH_URL aren't available.
 */
export const auth: Auth = new Proxy({} as Auth, {
  get(_, prop) {
    const instance = getAuth();
    const value = (instance as Record<string | symbol, unknown>)[prop];
    return typeof value === "function"
      ? (value as Function).bind(instance)
      : value;
  },
});
