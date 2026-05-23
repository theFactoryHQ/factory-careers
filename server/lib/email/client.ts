import { createEmailClient } from "@caffeinebounce/email";

import { env } from "../../utils/env";

/**
 * Shared Resend-backed email client (same infrastructure as thefactoryhq.com main site).
 * Initialized once; falls back gracefully when RESEND_API_KEY is absent (dev / console mode).
 */
export const emailClient = createEmailClient({
  apiKey: env.RESEND_API_KEY,
  defaultFrom:
    env.EMAIL_FROM ||
    env.RESEND_FROM_EMAIL ||
    "Factory <hello@interviews.thefactoryhq.com>",
});