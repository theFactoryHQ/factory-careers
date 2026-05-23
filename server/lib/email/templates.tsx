// @ts-nocheck - server-only React Email templates; JSX namespace resolved at runtime via @react-email/components + react
import React from "react";
import type { EmailThemeConfig } from "@caffeinebounce/email";
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import { careersEmailConfig, careersEmailStyles as styles } from "./theme";

type EmailCta = {
  href: string;
  text: string;
};

type CareersShellProps = {
  preview: string;
  heading: string;
  body: string;
  subtext?: string;
  cta?: EmailCta;
  children?: ReactNode;
  footerNote?: string;
  config?: EmailThemeConfig;
};

/**
 * Careers-branded email shell.
 * Produces the exact same visual structure (dark theme, red accent, logo, typography, footer)
 * as emails sent from thefactoryhq.com main site.
 */
function CareersEmailShell({
  preview,
  heading,
  body,
  subtext,
  cta,
  children,
  footerNote,
  config = careersEmailConfig,
}: CareersShellProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.wrapper}>
          <Section style={styles.card}>
            <Section style={styles.accent} />
            <Section style={styles.content}>
              {config.logoUrl && (
                <Img
                  src={config.logoUrl}
                  alt={config.appName}
                  width="140"
                  style={styles.logo}
                />
              )}
              <Hr style={styles.logoDivider} />
              <Text style={styles.heading}>{heading}</Text>
              <Text style={styles.bodyText}>{body}</Text>
              {subtext && <Text style={styles.subtext}>{subtext}</Text>}
              {children}
              {cta && (
                <Section style={styles.ctaWrap}>
                  <Button href={cta.href} style={styles.cta}>
                    {cta.text}
                  </Button>
                </Section>
              )}
              <Hr style={styles.footerDivider} />
              <Text style={styles.footerText}>
                {new Date().getFullYear()} {config.companyName}
              </Text>
              <Text style={styles.footerText}>{config.address}</Text>
              {footerNote && (
                <Text style={styles.footerText}>{footerNote}</Text>
              )}
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification (Better Auth)
// ─────────────────────────────────────────────────────────────────────────────

type VerificationEmailProps = {
  url: string;
  config?: EmailThemeConfig;
};

export function VerificationEmail({ url, config }: VerificationEmailProps) {
  return (
    <CareersEmailShell
      preview="Verify your email address for Factory Careers"
      heading="Verify your email"
      body="Thanks for signing up for Factory Careers. Please confirm your email address to activate your account."
      subtext="This link expires in 24 hours."
      cta={{ href: url, text: "Verify Email Address" }}
      config={config}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Password Reset (Better Auth)
// ─────────────────────────────────────────────────────────────────────────────

type PasswordResetEmailProps = {
  url: string;
  config?: EmailThemeConfig;
};

export function PasswordResetEmail({ url, config }: PasswordResetEmailProps) {
  return (
    <CareersEmailShell
      preview="Reset your Factory Careers password"
      heading="Reset your password"
      body="We received a request to reset your password. Click the button below to choose a new one."
      subtext="If you did not request this, you can safely ignore the email."
      cta={{ href: url, text: "Reset Password" }}
      config={config}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Org Invitation
// ─────────────────────────────────────────────────────────────────────────────

type OrgInvitationEmailProps = {
  inviteeName?: string;
  inviterName: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  config?: EmailThemeConfig;
};

export function OrgInvitationEmail({
  inviteeName,
  inviterName,
  organizationName,
  role,
  inviteUrl,
  config,
}: OrgInvitationEmailProps) {
  const greeting = inviteeName ? `Hi ${inviteeName}, ` : "";
  return (
    <CareersEmailShell
      preview={`You've been invited to join ${organizationName} on Factory Careers`}
      heading="You're invited"
      body={`${greeting}${inviterName} has invited you to join ${organizationName} as a ${role} on Factory Careers.`}
      cta={{ href: inviteUrl, text: "Accept Invitation" }}
      config={config}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Receipt (candidate)
// ─────────────────────────────────────────────────────────────────────────────

type ApplicationReceiptEmailProps = {
  candidateName: string;
  jobTitle: string;
  organizationName: string;
  jobUrl?: string;
  config?: EmailThemeConfig;
};

export function ApplicationReceiptEmail({
  candidateName,
  jobTitle,
  organizationName,
  jobUrl,
  config,
}: ApplicationReceiptEmailProps) {
  const greeting = candidateName ? `Hi ${candidateName}, ` : "";
  return (
    <CareersEmailShell
      preview={`Application received for ${jobTitle}`}
      heading="Application received"
      body={`${greeting}thank you for applying to ${jobTitle} at ${organizationName}. Your application has been received and the hiring team will review it shortly.`}
      subtext="We'll notify you when there are updates."
      cta={jobUrl ? { href: jobUrl, text: "View Job Posting" } : undefined}
      config={config}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Application Team Alert (hiring team)
// ─────────────────────────────────────────────────────────────────────────────

type ApplicationTeamAlertEmailProps = {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  organizationName: string;
  dashboardUrl: string;
  config?: EmailThemeConfig;
};

export function ApplicationTeamAlertEmail({
  candidateEmail,
  candidateName,
  jobTitle,
  organizationName,
  dashboardUrl,
  config,
}: ApplicationTeamAlertEmailProps) {
  return (
    <CareersEmailShell
      preview={`New application for ${jobTitle}`}
      heading="New application"
      body={`A new candidate has applied to ${jobTitle} at ${organizationName}.`}
      config={config}
    >
      <Section style={styles.detailPanel}>
        <Text style={styles.detailSectionLabel}>CANDIDATE</Text>
        <Text style={styles.detailItem}>{candidateName || candidateEmail}</Text>
        <Text style={styles.detailItem}>{candidateEmail}</Text>
      </Section>
      <Section style={{ marginTop: 16 }}>
        <Button href={dashboardUrl} style={styles.cta}>
          Review in Dashboard
        </Button>
      </Section>
    </CareersEmailShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interview Invitation (with optional custom body + .ics + response links)
// ─────────────────────────────────────────────────────────────────────────────

export interface InterviewInvitationEmailProps {
  candidateName: string;
  jobTitle: string;
  interviewTitle: string;
  interviewDate: string;
  interviewTime: string;
  interviewDuration: number;
  interviewType: string;
  interviewLocation?: string;
  interviewers?: string[];
  organizationName: string;
  customBody?: string; // recruiter-written free text (already rendered)
  responseUrls?: {
    accepted: string;
    declined: string;
    tentative: string;
  };
  /** Public job or interview detail URL for context */
  detailUrl?: string;
  config?: EmailThemeConfig;
}

export function InterviewInvitationEmail({
  candidateName,
  jobTitle,
  interviewTitle,
  interviewDate,
  interviewTime,
  interviewDuration,
  interviewType,
  interviewLocation,
  interviewers,
  organizationName,
  customBody,
  responseUrls,
  detailUrl,
  config,
}: InterviewInvitationEmailProps) {
  const greeting = candidateName ? `Hi ${candidateName}, ` : "";
  const location = interviewLocation || "To be confirmed";
  const interviewersList = interviewers?.length ? interviewers.join(", ") : "To be confirmed";

  return (
    <CareersEmailShell
      preview={`Interview invitation: ${interviewTitle}`}
      heading="Interview invitation"
      body={`${greeting}you have been invited to an interview for ${jobTitle} at ${organizationName}.`}
      config={config}
    >
      {/* Core details */}
      <Section style={styles.detailPanel}>
        <Text style={styles.detailSectionLabel}>INTERVIEW</Text>
        <Text style={styles.detailItem}><strong>{interviewTitle}</strong></Text>
        <Text style={styles.detailItem}>{interviewDate} at {interviewTime} ({interviewDuration} min)</Text>
        <Text style={styles.detailItem}>{interviewType} — {location}</Text>
        <Text style={styles.detailItem}>Interviewers: {interviewersList}</Text>
      </Section>

      {/* Custom recruiter message (if provided) */}
      {customBody && (
        <Section style={{ marginTop: 20 }}>
          <Text style={styles.bodyText}>{customBody}</Text>
        </Section>
      )}

      {/* Response actions - using the original careers interview button treatment for familiarity */}
      {responseUrls && (
        <Section style={{ marginTop: 24 }}>
          <Text style={styles.subtext}>Can you make it?</Text>
          <table role="presentation" cellSpacing="0" cellPadding="0" style={{ marginTop: 8 }}>
            <tr>
              <td style={{ padding: "0 4px" }}>
                <Button
                  href={responseUrls.accepted}
                  style={{
                    display: "inline-block",
                    padding: "10px 20px",
                    backgroundColor: "#16a34a",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: "600",
                    borderRadius: "0",
                    lineHeight: "1",
                  }}
                >
                  ✓ Accept
                </Button>
              </td>
              <td style={{ padding: "0 4px" }}>
                <Button
                  href={responseUrls.tentative}
                  style={{
                    display: "inline-block",
                    padding: "10px 20px",
                    backgroundColor: "#ca8a04",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: "600",
                    borderRadius: "0",
                    lineHeight: "1",
                  }}
                >
                  ? Maybe
                </Button>
              </td>
              <td style={{ padding: "0 4px" }}>
                <Button
                  href={responseUrls.declined}
                  style={{
                    display: "inline-block",
                    padding: "10px 20px",
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: "600",
                    borderRadius: "0",
                    lineHeight: "1",
                  }}
                >
                  ✕ Decline
                </Button>
              </td>
            </tr>
          </table>
        </Section>
      )}

      {detailUrl && (
        <Section style={{ marginTop: 16 }}>
          <Button href={detailUrl} style={{ ...styles.cta, backgroundColor: "#222" }}>
            View Details
          </Button>
        </Section>
      )}
    </CareersEmailShell>
  );
}

// Re-export the config for convenience in send helpers
export { careersEmailConfig } from "./theme";