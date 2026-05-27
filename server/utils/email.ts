/**
 * Thin compatibility layer.
 * Re-exports the new shared-Resend + React Email implementation (same branding as main site)
 * while preserving every public symbol used by call sites and Better Auth.
 *
 * Old raw-HTML builders and SMTP transport have been removed.
 */

// @ts-nocheck - React casts for email templates (type resolution for server React Email is handled at runtime)
import React from "react";
import { and, eq } from "drizzle-orm";

import { emailTemplate, orgSettings } from "../database/schema";
import { emailClient } from "../lib/email/client";
import {
  ApplicationRejectionEmail,
  ApplicationReceiptEmail,
  ApplicationTeamAlertEmail,
  CandidateWorkflowEmail,
  InterviewInvitationEmail,
  OrgInvitationEmail,
  PasswordResetEmail,
  PrivacyRequestConfirmationEmail,
  PrivacyRequestInternalAlertEmail,
  PrivacyRequestVerificationEmail,
  VerificationEmail,
  careersEmailConfig,
} from "../lib/email/templates";
import { env } from "./env";
import { logError } from "./logger";
import { SYSTEM_TEMPLATES, type SystemTemplate } from "~~/shared/system-templates";

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

export async function sendApplicationRejectionEmail(data: {
  candidateName: string;
  candidateEmail: string;
  jobTitle: string;
  organizationName: string;
}): Promise<void> {
  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: data.candidateEmail,
      subject: `Update on your ${data.jobTitle} application`,
      react: ApplicationRejectionEmail({
        candidateName: data.candidateName,
        jobTitle: data.jobTitle,
        organizationName: data.organizationName,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.application_rejection_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

type CandidateWorkflowPurpose = "application_acknowledgement" | "application_rejection";

export interface CandidateWorkflowEmailData {
  organizationId: string;
  candidateName: string;
  candidateFirstName: string;
  candidateLastName: string;
  candidateEmail: string;
  jobTitle: string;
  organizationName: string;
  applicationDate: string;
  applicationStatus?: string;
  dashboardApplicationUrl?: string;
}

export function renderCandidateWorkflowTemplate(template: string, data: CandidateWorkflowEmailData): string {
  const variables: Record<string, string> = {
    candidateName: data.candidateName,
    candidateFirstName: data.candidateFirstName,
    candidateLastName: data.candidateLastName,
    candidateEmail: data.candidateEmail,
    jobTitle: data.jobTitle,
    organizationName: data.organizationName,
    applicationDate: data.applicationDate,
    applicationStatus: data.applicationStatus ?? "",
    dashboardApplicationUrl: data.dashboardApplicationUrl ?? "",
  };

  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return key in variables ? variables[key]! : match;
  });
}

async function getEmailWorkflowSettings(organizationId: string) {
  return await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, organizationId),
    columns: {
      sendApplicationAcknowledgement: true,
      applicationAcknowledgementTemplateId: true,
      applicationAcknowledgementDelayMinutes: true,
      applicationAcknowledgementBusinessHoursOnly: true,
      sendApplicationRejection: true,
      applicationRejectionTemplateId: true,
      applicationRejectionDelayMinutes: true,
      applicationRejectionBusinessHoursOnly: true,
      emailBusinessHoursTimezone: true,
      emailBusinessHoursStartHour: true,
      emailBusinessHoursEndHour: true,
    },
  });
}

async function resolveWorkflowTemplate(params: {
  organizationId: string;
  purpose: CandidateWorkflowPurpose;
  templateId?: string | null;
}): Promise<SystemTemplate | { id: string; purpose: CandidateWorkflowPurpose; name: string; subject: string; body: string } | null> {
  const fallbackId = params.purpose === "application_acknowledgement"
    ? "system-application-acknowledgement"
    : "system-application-rejection";
  const selectedId = params.templateId || fallbackId;

  const systemTemplate = SYSTEM_TEMPLATES.find(t => t.id === selectedId && t.purpose === params.purpose);
  if (systemTemplate) return systemTemplate;

  const customTemplate = await db.query.emailTemplate.findFirst({
    where: and(
      eq(emailTemplate.id, selectedId),
      eq(emailTemplate.organizationId, params.organizationId),
      eq(emailTemplate.purpose, params.purpose),
    ),
    columns: {
      id: true,
      purpose: true,
      name: true,
      subject: true,
      body: true,
    },
  });

  if (customTemplate) return customTemplate;
  return SYSTEM_TEMPLATES.find(t => t.id === fallbackId) ?? null;
}

async function sendCandidateWorkflowEmail(params: {
  purpose: CandidateWorkflowPurpose;
  templateId?: string | null;
  data: CandidateWorkflowEmailData;
}) {
  const template = await resolveWorkflowTemplate({
    organizationId: params.data.organizationId,
    purpose: params.purpose,
    templateId: params.templateId,
  });
  if (!template) return;

  const subject = renderCandidateWorkflowTemplate(template.subject, params.data);
  const body = renderCandidateWorkflowTemplate(template.body, params.data);
  const heading = params.purpose === "application_acknowledgement"
    ? "Application received"
    : "Application update";

  await emailClient.send({
    from: emailClient.defaultFrom,
    to: params.data.candidateEmail,
    subject,
    react: CandidateWorkflowEmail({
      preview: subject,
      heading,
      body,
      cta: params.data.dashboardApplicationUrl && params.purpose === "application_acknowledgement"
        ? { href: params.data.dashboardApplicationUrl, text: "View Job Posting" }
        : undefined,
      config: careersEmailConfig,
    }) as React.ReactElement,
  });
}

type CandidateWorkflowTiming = {
  delayMinutes?: number | null;
  businessHoursOnly?: boolean | null;
  businessHoursTimezone?: string | null;
  businessHoursStartHour?: number | null;
  businessHoursEndHour?: number | null;
};

type BusinessHoursWindow = {
  timeZone: string;
  startHour: number;
  endHour: number;
};

function normalizeBusinessHoursWindow(timing: CandidateWorkflowTiming): BusinessHoursWindow {
  const timeZone = timing.businessHoursTimezone || "America/New_York";
  const startHour = Math.min(23, Math.max(0, Number(timing.businessHoursStartHour ?? 9)));
  const endHour = Math.min(24, Math.max(startHour + 1, Number(timing.businessHoursEndHour ?? 17)));
  return { timeZone, startHour, endHour };
}

function getZonedDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday,
    hour: Number(values.hour === "24" ? "0" : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedDateParts(date, timeZone);
  const zonedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return zonedAsUtc - date.getTime();
}

function dateFromZonedParts(parts: { year: number; month: number; day: number; hour: number; minute?: number; second?: number }, timeZone: string): Date {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute ?? 0, parts.second ?? 0, 0);
  const firstPass = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - getTimeZoneOffsetMs(firstPass, timeZone));
}

function weekdayIndex(weekday: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
}

function nextBusinessDateAtStart(parts: ReturnType<typeof getZonedDateParts>, window: BusinessHoursWindow, addDays = 0): Date {
  let cursor = dateFromZonedParts({
    year: parts.year,
    month: parts.month,
    day: parts.day + addDays,
    hour: window.startHour,
  }, window.timeZone);

  while (true) {
    const cursorParts = getZonedDateParts(cursor, window.timeZone);
    const day = weekdayIndex(cursorParts.weekday);
    if (day >= 1 && day <= 5) return cursor;
    cursor = dateFromZonedParts({
      year: cursorParts.year,
      month: cursorParts.month,
      day: cursorParts.day + 1,
      hour: window.startHour,
    }, window.timeZone);
  }
}

function nextBusinessSendTime(target: Date, timing: CandidateWorkflowTiming = {}): Date {
  const window = normalizeBusinessHoursWindow(timing);
  const parts = getZonedDateParts(target, window.timeZone);
  const day = weekdayIndex(parts.weekday);

  if (day === 0 || day === 6) {
    return nextBusinessDateAtStart(parts, window, 1);
  }

  if (parts.hour < window.startHour) {
    return nextBusinessDateAtStart(parts, window);
  }

  if (parts.hour >= window.endHour) {
    return nextBusinessDateAtStart(parts, window, 1);
  }

  return target;
}

function workflowSendDelayMs(timing: CandidateWorkflowTiming): number {
  const delayMinutes = Math.max(0, Number(timing.delayMinutes ?? 0));
  const requestedSendTime = new Date(Date.now() + delayMinutes * 60_000);
  const scheduledSendTime = timing.businessHoursOnly ? nextBusinessSendTime(requestedSendTime, timing) : requestedSendTime;
  return Math.max(0, scheduledSendTime.getTime() - Date.now());
}

async function sendCandidateWorkflowEmailWithTiming(params: {
  purpose: CandidateWorkflowPurpose;
  templateId?: string | null;
  timing: CandidateWorkflowTiming;
  data: CandidateWorkflowEmailData;
}) {
  const delayMs = workflowSendDelayMs(params.timing);

  if (delayMs <= 0) {
    await sendCandidateWorkflowEmail(params);
    return;
  }

  setTimeout(() => {
    void sendCandidateWorkflowEmail(params).catch((err) => {
      logError("email.workflow_delayed_send_failed", {
        provider: "resend",
        purpose: params.purpose,
        organization_id: params.data.organizationId,
        error_message: err instanceof Error ? err.message : String(err),
      });
    });
  }, delayMs);
}

export async function sendConfiguredApplicationAcknowledgementEmail(data: CandidateWorkflowEmailData): Promise<void> {
  const settings = await getEmailWorkflowSettings(data.organizationId);
  if (settings?.sendApplicationAcknowledgement === false) return;

  await sendCandidateWorkflowEmailWithTiming({
    purpose: "application_acknowledgement",
    templateId: settings?.applicationAcknowledgementTemplateId,
    timing: {
      delayMinutes: settings?.applicationAcknowledgementDelayMinutes,
      businessHoursOnly: settings?.applicationAcknowledgementBusinessHoursOnly,
      businessHoursTimezone: settings?.emailBusinessHoursTimezone,
      businessHoursStartHour: settings?.emailBusinessHoursStartHour,
      businessHoursEndHour: settings?.emailBusinessHoursEndHour,
    },
    data,
  });
}

export async function sendConfiguredApplicationRejectionEmail(data: CandidateWorkflowEmailData): Promise<void> {
  const settings = await getEmailWorkflowSettings(data.organizationId);
  if (settings?.sendApplicationRejection !== true) return;

  await sendCandidateWorkflowEmailWithTiming({
    purpose: "application_rejection",
    templateId: settings.applicationRejectionTemplateId,
    timing: {
      delayMinutes: settings.applicationRejectionDelayMinutes,
      businessHoursOnly: settings.applicationRejectionBusinessHoursOnly,
      businessHoursTimezone: settings.emailBusinessHoursTimezone,
      businessHoursStartHour: settings.emailBusinessHoursStartHour,
      businessHoursEndHour: settings.emailBusinessHoursEndHour,
    },
    data,
  });
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

export async function sendPrivacyRequestVerificationEmail(data: {
  requesterName: string;
  requesterEmail: string;
  verifyUrl: string;
}): Promise<void> {
  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: data.requesterEmail,
      subject: "Verify your deletion request — Factory Careers",
      react: PrivacyRequestVerificationEmail({
        requesterName: data.requesterName,
        verifyUrl: data.verifyUrl,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.privacy_request_verification_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendPrivacyRequestConfirmationEmail(data: {
  requesterName: string;
  requesterEmail: string;
}): Promise<void> {
  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to: data.requesterEmail,
      subject: "Deletion request verified — Factory Careers",
      react: PrivacyRequestConfirmationEmail({
        requesterName: data.requesterName,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.privacy_request_confirmation_send_failed", {
      provider: "resend",
      error_message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendPrivacyRequestInternalAlertEmail(data: {
  requesterName: string;
  requesterEmail: string;
  stateOfResidence: string;
  dashboardUrl: string;
  to?: string;
}): Promise<void> {
  const to = data.to || env.FACTORY_CAREERS_PRIVACY_INBOX || "legal@thefactoryhq.com";

  try {
    await emailClient.send({
      from: emailClient.defaultFrom,
      to,
      subject: `Privacy deletion request: ${data.requesterEmail}`,
      react: PrivacyRequestInternalAlertEmail({
        requesterName: data.requesterName,
        requesterEmail: data.requesterEmail,
        stateOfResidence: data.stateOfResidence,
        dashboardUrl: data.dashboardUrl,
        config: careersEmailConfig,
      }) as React.ReactElement,
    });
  } catch (err) {
    logError("email.privacy_request_internal_alert_send_failed", {
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
