/**
 * Thin compatibility layer.
 * Re-exports the new shared-Resend + React Email implementation (same branding as main site)
 * while preserving every public symbol used by call sites and Better Auth.
 *
 * Old raw-HTML builders and SMTP transport have been removed.
 */

// @ts-nocheck - React casts for email templates (type resolution for server React Email is handled at runtime)
import React from "react";

import { emailClient } from "../lib/email/client";
import {
  ApplicationReceiptEmail,
  ApplicationTeamAlertEmail,
  InterviewInvitationEmail,
  OrgInvitationEmail,
  PasswordResetEmail,
  VerificationEmail,
  careersEmailConfig,
} from "../lib/email/templates";
import { logError } from "./logger";

// Re-export the client for any route that needs the canonical from address (e.g. ICS)
export { emailClient } from "../lib/email/client";

// ─────────────────────────────────────────────────────────────────────────────
// Public send functions (signatures identical to before — call sites unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendVerificationEmail(data: {
  user: { email: string; name: string };
  url: string;
  token: string;
}): Promise<void> {
  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: data.user.email,
      subject: "Verify your email address — Factory Careers",
      react: VerificationEmail({ url: data.url, config: careersEmailConfig }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.verification_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendPasswordResetEmail(data: {
  user: { email: string; name: string };
  url: string;
  token: string;
}): Promise<void> {
  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: data.user.email,
      subject: "Reset your password — Factory Careers",
      react: PasswordResetEmail({ url: data.url, config: careersEmailConfig }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.password_reset_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendOrgInvitationEmail(
  data: any, // Better Auth invitation payload (nested org/inviter/email)
  inviteLink: string
): Promise<void> {
  // Map the real Better Auth shape to our flat template props
  const recipientEmail = data.email || data.invitation?.email || "";
  const inviterName = data.inviter?.name || data.inviter?.email || "A team member";
  const orgName = data.organization?.name || "the organization";
  const role = data.role || "member";
  const inviteeName = data.user?.name; // may be undefined for new users

  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: recipientEmail,
      subject: `You're invited to join ${orgName} — Factory Careers`,
      react: OrgInvitationEmail({
        inviteeName,
        inviterName,
        organizationName: orgName,
        role,
        inviteUrl: inviteLink,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.org_invitation_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendApplicationReceiptEmail(data: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  organizationName: string;
  applicationUrl?: string;
}): Promise<void> {
  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: data.candidateEmail,
      subject: `Application received — ${data.jobTitle} at ${data.organizationName}`,
      react: ApplicationReceiptEmail({
        candidateName: data.candidateName,
        jobTitle: data.jobTitle,
        organizationName: data.organizationName,
        jobUrl: data.applicationUrl,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.application_receipt_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendApplicationTeamAlertEmail(data: {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  organizationName?: string;
  applicationUrl: string;
  to?: string;
  hasResume?: boolean; // legacy field from old template (ignored)
}): Promise<void> {
  const to = data.to || process.env.FACTORY_CAREERS_HIRING_INBOX || emailClient.defaultFrom;
  const orgName = data.organizationName || "your team";

  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to,
      subject: `New application: ${data.candidateName} for ${data.jobTitle}`,
      react: ApplicationTeamAlertEmail({
        candidateEmail: data.candidateEmail,
        candidateName: data.candidateName,
        jobTitle: data.jobTitle,
        organizationName: orgName,
        dashboardUrl: data.applicationUrl,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.application_team_alert_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interview invitation (keeps the renderTemplate + custom body flow exactly as before)
// ─────────────────────────────────────────────────────────────────────────────

export interface InterviewEmailData {
  candidateName: string;
  candidateFirstName: string;
  candidateLastName: string;
  candidateEmail: string;
  jobTitle: string;
  interviewTitle: string;
  interviewDate: string;
  interviewTime: string;
  interviewDuration: number;
  interviewType: string;
  interviewLocation: string | null;
  interviewers: string[] | null;
  organizationName: string;
  responseUrls?: {
    accepted: string;
    declined: string;
    tentative: string;
  };
  icsContent?: string;
}

/**
 * Replace {{variable}} placeholders — kept verbatim so the interview route
 * continues to work without any change.
 */
export function renderTemplate(template: string, data: InterviewEmailData): string {
  const variables: Record<string, string> = {
    candidateName: data.candidateName,
    candidateFirstName: data.candidateFirstName,
    candidateLastName: data.candidateLastName,
    candidateEmail: data.candidateEmail,
    jobTitle: data.jobTitle,
    interviewTitle: data.interviewTitle,
    interviewDate: data.interviewDate,
    interviewTime: data.interviewTime,
    interviewDuration: String(data.interviewDuration),
    interviewType: data.interviewType,
    interviewLocation: data.interviewLocation ?? "To be confirmed",
    interviewers: data.interviewers?.join(", ") ?? "To be confirmed",
    organizationName: data.organizationName,
  };

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key]! : match;
  });
}

export async function sendInterviewInvitationEmail(params: {
  subject: string;
  body: string;
  data: InterviewEmailData;
}): Promise<void> {
  // Render any {{placeholders}} in the recruiter-provided subject/body
  // before sending (the interview route still uses the placeholder system).
  const renderedSubject = renderTemplate(params.subject, params.data);
  const renderedBody = renderTemplate(params.body, params.data);

  const icsAttachment = params.data.icsContent
    ? [
        {
          filename: "interview.ics",
          content: Buffer.from(params.data.icsContent).toString("base64"),
          contentType: "text/calendar; method=REQUEST",
        },
      ]
    : undefined;

  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: [params.data.candidateEmail],
      subject: renderedSubject,
      react: InterviewInvitationEmail({
        candidateName: params.data.candidateName,
        jobTitle: params.data.jobTitle,
        interviewTitle: params.data.interviewTitle,
        interviewDate: params.data.interviewDate,
        interviewTime: params.data.interviewTime,
        interviewDuration: params.data.interviewDuration,
        interviewType: params.data.interviewType,
        interviewLocation: params.data.interviewLocation ?? undefined,
        interviewers: params.data.interviewers ?? undefined,
        organizationName: params.data.organizationName,
        customBody: renderedBody,
        responseUrls: params.data.responseUrls,
        config: careersEmailConfig,
      }) as React.ReactElement,
      ...(icsAttachment ? { attachments: icsAttachment } : {}),
    });
  } catch (err) {
    logError("email.interview_invitation_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// From address helper (still used by ICS generation in the interview route)
// ─────────────────────────────────────────────────────────────────────────────

export function getFromEmail(): string {
  // Preferred transactional from for careers/interview emails
  return emailClient.defaultFrom || "Factory <hello@interviews.thefactoryhq.com>";
}

// InterviewEmailData interface is already exported above via its declaration.
