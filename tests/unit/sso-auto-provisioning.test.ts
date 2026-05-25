import { sso } from "@better-auth/sso";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createEnterpriseSsoOptions,
  enterpriseSsoOrganizationProvisioning,
  enterpriseSsoProvisionUserOnEveryLogin,
} from "../../server/utils/ssoProvisioning";

const require = createRequire(import.meta.url);

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
    const betterAuthSsoSource = readFileSync(require.resolve("@better-auth/sso"), "utf8");

    expect(betterAuthSsoSource).toMatch(/assignOrganizationFromProvider/);
    expect(betterAuthSsoSource).toMatch(/provider\.organizationId\)\s*return/);
    expect(betterAuthSsoSource).toMatch(/provisioningOptions\?\.disabled\)\s*return/);
    expect(betterAuthSsoSource).toMatch(/model:\s*["']member["']/);
    expect(betterAuthSsoSource).toMatch(/organizationId:\s*provider\.organizationId/);
    expect(betterAuthSsoSource).toMatch(/userId:\s*user\.id/);
    expect(betterAuthSsoSource).toMatch(
      /provisioningOptions\?\.defaultRole\s*\|\|\s*["']member["']/,
    );
    expect(betterAuthSsoSource).toMatch(
      /provisioningOptions:\s*options\?\.organizationProvisioning/,
    );
  });
});
