import { createEmailClient } from "@caffeinebounce/email";
import { render } from "@react-email/render";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReactNode } from "react";

import { env } from "../../utils/env";

type EmailClient = ReturnType<typeof createEmailClient>;
type EmailSendPayload = Parameters<EmailClient["send"]>[0] & {
  html?: string;
  text?: string;
  react?: ReactNode;
};

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    return [value];
  }

  return [];
}

function serializeReactPayload(value: unknown): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(value, (key, nestedValue) => {
    if (key === "_owner" || key === "_store") {
      return undefined;
    }

    if (typeof nestedValue === "function") {
      return `[function ${nestedValue.name || "anonymous"}]`;
    }

    if (typeof nestedValue === "symbol") {
      return nestedValue.toString();
    }

    if (typeof nestedValue === "object" && nestedValue !== null) {
      if (seen.has(nestedValue)) {
        return "[circular]";
      }
      seen.add(nestedValue);
    }

    return nestedValue;
  });
}

async function renderEmailPayload(payload: EmailSendPayload): Promise<{
  html: string;
  text: string;
  renderError?: string;
}> {
  if (!payload.react) {
    return {
      html: payload.html ?? "",
      text: payload.text ?? payload.html ?? "",
    };
  }

  try {
    const html = payload.html ?? await render(payload.react);
    const text = payload.text ?? await render(payload.react, { plainText: true });
    return { html, text };
  } catch (error) {
    const fallback = serializeReactPayload(payload.react);

    return {
      html: payload.html ?? fallback,
      text: payload.text ?? fallback,
      renderError: error instanceof Error ? error.message : String(error),
    };
  }
}

const FALLBACK_FROM = "Factory <hello@interviews.thefactoryhq.com>";

function resolveDefaultFrom(): string {
  return env.EMAIL_FROM || env.RESEND_FROM_EMAIL || FALLBACK_FROM;
}

function createCaptureEmailClient(defaultFrom: string): EmailClient {
  const capturePath = env.FACTORY_EMAIL_CAPTURE_PATH;
  if (!capturePath) {
    throw new Error("FACTORY_EMAIL_CAPTURE_PATH is required when FACTORY_EMAIL_TEST_MODE=capture");
  }

  return {
    resend: null,
    defaultFrom,
    send: (async (payload: EmailSendPayload) => {
      const { html, text, renderError } = await renderEmailPayload(payload);
      const captured = {
        id: `capture_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        from: payload.from ?? defaultFrom,
        to: normalizeRecipients(payload.to),
        subject: payload.subject ?? "",
        html,
        text,
        renderError,
        attachments: Array.isArray(payload.attachments)
          ? payload.attachments.map((attachment) => ({
              filename: typeof attachment === "object" && attachment !== null && "filename" in attachment
                ? String(attachment.filename)
                : undefined,
              contentType: typeof attachment === "object" && attachment !== null && "contentType" in attachment
                ? String(attachment.contentType)
                : undefined,
            }))
          : [],
      };

      await mkdir(dirname(capturePath), { recursive: true });
      await appendFile(capturePath, `${JSON.stringify(captured)}\n`, "utf8");

      return {
        data: { id: captured.id },
        error: null,
        headers: null,
      };
    }) as EmailClient["send"],
  };
}

/**
 * Shared Resend-backed email client (same infrastructure as thefactoryhq.com main site).
 * Initialized once; falls back gracefully when RESEND_API_KEY is absent (dev / console mode).
 */
const resendEmailClient = createEmailClient({
  apiKey: env.RESEND_API_KEY,
  defaultFrom: resolveDefaultFrom(),
});

export const emailClient: EmailClient = {
  get resend() {
    return resendEmailClient.resend;
  },
  get defaultFrom() {
    return resolveDefaultFrom();
  },
  send: (async (...args: Parameters<EmailClient["send"]>) => {
    if (env.FACTORY_EMAIL_TEST_MODE === "capture") {
      return createCaptureEmailClient(resolveDefaultFrom()).send(...args);
    }

    return resendEmailClient.send(...args);
  }) as EmailClient["send"],
};
