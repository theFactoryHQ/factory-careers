import { createAuthClient } from "better-auth/vue";
import {
  deviceAuthorizationClient,
  organizationClient,
} from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
import { ac, owner, admin, member } from "~~/shared/permissions";

export const authClient = createAuthClient({
  plugins: [
    deviceAuthorizationClient(),
    organizationClient({
      ac,
      roles: { owner, admin, member },
    }),
    ssoClient(),
  ],
});
