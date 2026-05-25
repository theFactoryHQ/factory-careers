import type { SSOOptions } from "@better-auth/sso";

export const enterpriseSsoOrganizationProvisioning = {
  disabled: false,
  defaultRole: "member",
} as const satisfies NonNullable<SSOOptions["organizationProvisioning"]>;

export const enterpriseSsoProvisionUserOnEveryLogin = true;

export type EnterpriseSsoProvisionUser = NonNullable<SSOOptions["provisionUser"]>;

export function createEnterpriseSsoOptions(
  options: { provisionUser: EnterpriseSsoProvisionUser },
): SSOOptions {
  return {
    organizationProvisioning: enterpriseSsoOrganizationProvisioning,
    provisionUserOnEveryLogin: enterpriseSsoProvisionUserOnEveryLogin,
    provisionUser: options.provisionUser,
  };
}
