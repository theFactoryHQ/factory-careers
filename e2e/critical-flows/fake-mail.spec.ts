import { rm } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { test, expect, selectFactorySelectOption } from "../fixtures";
import { readCapturedEmails } from "../helpers/captured-emails";

const JOB_TITLE = "Email Capture Test Job";

async function advanceToSubmitButton(page: Page) {
  const submitButton = page.getByRole("button", { name: /submit/i });

  for (let step = 0; step < 3; step += 1) {
    if (await submitButton.isVisible()) {
      return submitButton;
    }

    const continueButton = page.getByRole("button", { name: "Continue" }).first();
    await expect(continueButton).toBeVisible({ timeout: 10_000 });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
  }

  await expect(submitButton).toBeVisible({ timeout: 10_000 });
  return submitButton;
}

test.describe("Fake mail capture", () => {
  test("captures application receipt and hiring-team alert without external delivery", async ({ authenticatedPage, browser }, testInfo) => {
    const capturePath = process.env.FACTORY_EMAIL_CAPTURE_PATH;
    expect(capturePath, "FACTORY_EMAIL_CAPTURE_PATH must be set for fake-mail E2E").toBeTruthy();
    expect(process.env.FACTORY_EMAIL_TEST_MODE, "E2E mail must use capture mode, not a real provider").toBe("capture");

    await rm(capturePath!, { force: true });

    const recruiterPage = authenticatedPage;
    const jobTitle = `${JOB_TITLE} ${Date.now()} r${testInfo.retry}`;
    const applicant = {
      firstName: "Email",
      lastName: "Candidate",
      email: `email.candidate.${Date.now()}.r${testInfo.retry}@example.com`,
    };
    const applicantName = `${applicant.firstName} ${applicant.lastName}`;
    const hiringInbox = process.env.FACTORY_CAREERS_HIRING_INBOX || "careers@thefactoryhq.com";
    const organizationName = process.env.FACTORY_ORG_NAME || "Factory";

    await recruiterPage.goto("/dashboard/jobs/new");
    await recruiterPage.waitForLoadState("networkidle");
    await recruiterPage.getByLabel("Job title").waitFor({ state: "visible", timeout: 15_000 });
    await recruiterPage.getByLabel("Job title").fill(jobTitle);

    await recruiterPage.locator("form").getByRole("button", { name: "Save & continue" }).first().waitFor({ state: "attached", timeout: 10_000 });
    await expect(recruiterPage.locator("form").getByRole("button", { name: "Save & continue" }).first()).toBeEnabled({ timeout: 10_000 });
    await recruiterPage.locator("form").getByRole("button", { name: "Save & continue" }).first().click();

    const resumeRadioGroup = recruiterPage.getByRole("radiogroup", { name: /Resume requirement/i });
    await resumeRadioGroup.waitFor({ state: "visible", timeout: 10_000 });
    await resumeRadioGroup.getByRole("radio", { name: "Off" }).click();

    await recruiterPage.locator("form").getByRole("button", { name: "Save & continue" }).first().click();
    await recruiterPage.locator("form").getByRole("button", { name: "Save & continue" }).first().waitFor({ state: "visible", timeout: 10_000 });
    await recruiterPage.locator("form").getByRole("button", { name: "Save & continue" }).first().click();

    await expect(recruiterPage.getByRole("heading", { name: /Ready to go\?/i })).toBeVisible({ timeout: 10_000 });
    const publishButton = recruiterPage.locator("form").getByRole("button", { name: /Publish & copy link/i });
    await publishButton.waitFor({ state: "visible", timeout: 10_000 });

    const [publishResponse] = await Promise.all([
      recruiterPage.waitForResponse(
        (resp) => resp.url().includes("/api/jobs/") && resp.request().method() === "PATCH",
        { timeout: 30_000 },
      ),
      publishButton.click(),
    ]);
    expect([200, 201], `Publish API returned ${publishResponse.status()}`).toContain(publishResponse.status());
    const publishedJob = await publishResponse.json() as { id: string; slug: string };
    expect(publishedJob.slug, "published job slug must be present").toBeTruthy();
    await expect(recruiterPage.getByRole("heading", { name: "Your job is live!" })).toBeVisible({ timeout: 30_000 });

    const candidateContext = await browser.newContext();
    const candidatePage = await candidateContext.newPage();
    await candidatePage.goto(`/jobs/${publishedJob.slug}/apply`);
    await candidatePage.waitForLoadState("networkidle");
    await candidatePage.getByLabel("First name").fill(applicant.firstName);
    await candidatePage.getByLabel("Last name").fill(applicant.lastName);
    await candidatePage.getByLabel("Email").fill(applicant.email);
    await selectFactorySelectOption(candidatePage, /Country/, "United States");
    await selectFactorySelectOption(candidatePage, /State/, "California");

    const submitButton = await advanceToSubmitButton(candidatePage);
    const [applyResponse] = await Promise.all([
      candidatePage.waitForResponse(
        (resp) => resp.url().includes(`/api/public/jobs/${publishedJob.slug}/apply`) && resp.request().method() === "POST",
        { timeout: 30_000 },
      ),
      submitButton.click(),
    ]);
    expect(applyResponse.status(), `Apply API returned ${applyResponse.status()}`).toBe(201);
    await candidatePage.waitForURL(`**/jobs/${publishedJob.slug}/confirmation`, { waitUntil: "commit", timeout: 15_000 });
    await expect(candidatePage.getByRole("heading", { name: "Application submitted" })).toBeVisible();

    await expect.poll(async () => (await readCapturedEmails(capturePath!)).length, {
      message: "application submission should capture receipt and team alert emails",
      timeout: 10_000,
    }).toBeGreaterThanOrEqual(2);

    const capturedEmails = await readCapturedEmails(capturePath!);
    const receipt = capturedEmails.find((email) => email.subject === `Application received: ${jobTitle} at ${organizationName}`);
    expect(receipt, "candidate receipt email should be captured").toBeTruthy();
    expect(receipt?.renderError, "candidate receipt email should render successfully").toBeUndefined();
    expect(receipt?.to).toContain(applicant.email);
    expect(receipt?.text).toContain(`Hi ${applicant.firstName}`);
    expect(receipt?.text).toContain(jobTitle);
    expect(receipt?.text).toContain(organizationName);

    const teamAlert = capturedEmails.find((email) => email.subject === `New application: ${applicantName} for ${jobTitle}`);
    expect(teamAlert, "hiring-team alert email should be captured").toBeTruthy();
    expect(teamAlert?.renderError, "hiring-team alert email should render successfully").toBeUndefined();
    expect(teamAlert?.to).toContain(hiringInbox);
    expect(teamAlert?.text).toContain(applicantName);
    expect(teamAlert?.text).toContain(applicant.email);
    expect(teamAlert?.text).toContain(jobTitle);
    expect(teamAlert?.text).toContain(`/dashboard/applications/`);

    await candidateContext.close();
  });
});
