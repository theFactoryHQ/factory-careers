#!/usr/bin/env tsx
/**
 * One-off test script.
 * Sends a real branded email using the new shared Resend + React Email templates
 * to verify that hello@interviews.thefactoryhq.com works and the visual template matches the main site.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx npx tsx scripts/send-test-interview-email.ts
 *
 * The key is NOT stored anywhere.
 */

import { Resend } from "resend";
import { render } from "@react-email/render";
import { InterviewInvitationEmail } from "../server/lib/email/templates";

const key = process.env.RESEND_API_KEY || process.argv[2];
const to = process.env.TEST_EMAIL_TO || process.argv[3];

if (!key || !to) {
  console.error(
    "Usage: RESEND_API_KEY=... TEST_EMAIL_TO=you@example.com npx tsx scripts/send-test-interview-email.ts\n" +
    "   or: RESEND_API_KEY=... npx tsx scripts/send-test-interview-email.ts <to-email>"
  );
  process.exit(1);
}

const resend = new Resend(key);

const from = "Factory <hello@interviews.thefactoryhq.com>";

async function main() {
  const html = await render(
    InterviewInvitationEmail({
      candidateName: "Doug Ebanks",
      jobTitle: "Senior Platform Engineer",
      interviewTitle: "Final Interview - Platform Team",
      interviewDate: "Thursday, May 29, 2026",
      interviewTime: "2:00 PM – 3:00 PM PT",
      interviewDuration: 60,
      interviewType: "Video Call (Google Meet)",
      interviewLocation: "https://meet.google.com/xxx-xxxx-xxx",
      interviewers: ["Sarah Chen (Eng)", "Marcus Rodriguez (Hiring Manager)"],
      organizationName: "Factory",
      customBody:
        "Thanks again for the great conversation last week. We're excited to move forward. " +
        "Please let us know if any of the times below don't work and we'll find another slot.",
      responseUrls: {
        accepted: "https://careers.thefactoryhq.com/respond/accept/TEST123",
        declined: "https://careers.thefactoryhq.com/respond/decline/TEST123",
        tentative: "https://careers.thefactoryhq.com/respond/tentative/TEST123",
      },
    })
  );

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: "Interview invitation: Final Interview - Platform Team",
    html,
    text: "Doug, you've been invited to a final interview for Senior Platform Engineer at Factory. " +
          "Thursday, May 29, 2026 at 2:00 PM PT. Reply to accept or decline.",
    tags: [
      { name: "category", value: "test" },
      { name: "test", value: "doug-email-verification" },
    ],
  });

  if (error) {
    console.error("❌ Send failed:", error);
    process.exit(1);
  }

  console.log("✅ Test email sent successfully!");
  console.log("   Message ID:", data?.id);
  console.log("   From:", from);
  console.log("   To:", to);
  console.log("   Check your inbox (and Resend dashboard for delivery status).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});