import { sso } from "@better-auth/sso";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createEnterpriseSsoOptions,
  enterpriseSsoOrganizationProvisioning,
  enterpriseSsoProvisionUserOnEveryLogin,
} from "../../server/utils/ssoProvisioning";

describe("enterprise SSO auto-provisioning", () => {
  it("uses the real app SSO options to auto-provision org members only", () => {
    const provisionUser = vi.fn();
    const options = createEnterpriseSsoOptions({ provisionUser });

    expect(options.organizationProvisioning).toEqual({
      disabled: false,
      defaultRole: "member",
    });
    expect(options.organizationProvisioning?.defaultRole).not.toBe("admin");
    expect(options.organizationProvisioning?.defaultRole).not.toBe("owner");
    expect(options.provisionUserOnEveryLogin).toBe(true);
    expect(options.provisionUser).toBe(provisionUser);
  });

  it("wires those options into Better Auth SSO callback endpoints", () => {
    const plugin = sso(createEnterpriseSsoOptions({ provisionUser: vi.fn() }));

    expect(plugin.id).toBe("sso");
    expect(plugin.endpoints).toHaveProperty("callbackSSO");
    expect(plugin.endpoints).toHaveProperty("callbackSSOShared");
    expect(plugin.endpoints).toHaveProperty("callbackSSOSAML");
  });

  it("keeps app provisioning constants locked to member-only org access", () => {
    expect(enterpriseSsoOrganizationProvisioning.disabled).toBe(false);
    expect(enterpriseSsoOrganizationProvisioning.defaultRole).toBe("member");
    expect(enterpriseSsoProvisionUserOnEveryLogin).toBe(true);
  });

  it("matches the installed Better Auth SSO contract for SSO-created org membership", () => {
    const betterAuthSsoSource = readFileSync(
      join(process.cwd(), "node_modules/@better-auth/sso/dist/index.mjs"),
      "utf8",
    );

    expect(betterAuthSsoSource).toContain("async function assignOrganizationFromProvider");
    expect(betterAuthSsoSource).toContain("if (!provider.organizationId) return");
    expect(betterAuthSsoSource).toContain("if (provisioningOptions?.disabled) return");
    expect(betterAuthSsoSource).toContain('model: "member"');
    expect(betterAuthSsoSource).toContain("organizationId: provider.organizationId");
    expect(betterAuthSsoSource).toContain("userId: user.id");
    expect(betterAuthSsoSource).toContain('provisioningOptions?.defaultRole || "member"');
    expect(betterAuthSsoSource).toContain(
      "provisioningOptions: options?.organizationProvisioning",
    );
  });
});
