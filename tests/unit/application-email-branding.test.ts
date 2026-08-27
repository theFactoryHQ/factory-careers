import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@react-email/render";
import React from "react";

const { emailSend, logErrorMock } = vi.hoisted(() => ({
	emailSend: vi.fn(),
	logErrorMock: vi.fn(),
}));

vi.mock("@caffeinebounce/email", () => ({
	createEmailClient: vi.fn(() => ({
		defaultFrom: "Factory Careers <careers@thefactoryhq.com>",
		send: emailSend,
	})),
	createEmailTheme: vi.fn((theme) => theme),
}));

vi.mock("nodemailer", () => ({
	default: {
		createTransport: vi.fn(),
	},
}));

vi.mock("../../server/utils/logger", () => ({
	logError: logErrorMock,
}));

vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test");
vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(32));
vi.stubEnv("BETTER_AUTH_URL", "https://careers.thefactoryhq.com");
vi.stubEnv("S3_ENDPOINT", "https://s3.example.com");
vi.stubEnv("S3_ACCESS_KEY", "test-key");
vi.stubEnv("S3_SECRET_KEY", "test-secret");
vi.stubEnv("S3_BUCKET", "test-bucket");
vi.stubEnv("RESEND_API_KEY", "re_test");
vi.stubEnv("RESEND_FROM_EMAIL", "Factory Careers <careers@thefactoryhq.com>");
delete (globalThis as Record<string, unknown>).__env;

vi.stubGlobal("h", React.createElement);
vi.stubGlobal("env", {
	SMTP_HOST: "",
	RESEND_API_KEY: "re_test",
	RESEND_FROM_EMAIL: "Factory Careers <careers@thefactoryhq.com>",
});
vi.stubGlobal("logError", vi.fn());

const { sendApplicationReceiptEmail, sendOperationalAlertEmail, sendSsoOperationalAlertEmail } = await import(
	"../../server/utils/email"
);

describe("application receipt email branding", () => {
	beforeEach(() => {
		emailSend.mockReset();
		emailSend.mockResolvedValue({ error: null });
		logErrorMock.mockReset();
	});

	it("wraps the receipt email in the shared branded shell", async () => {
		await sendApplicationReceiptEmail({
			candidateEmail: "candidate@example.com",
			candidateName: "Taylor Candidate",
			jobTitle: "Product Engineer",
			organizationName: "Factory",
		});

		expect(logErrorMock).not.toHaveBeenCalled();
		expect(emailSend).toHaveBeenCalledTimes(1);

		const payload = emailSend.mock.calls[0][0] as {
			react: Parameters<typeof render>[0];
		};
		const html = await render(payload.react);
		expect(html).toContain("Application received");
		expect(html).toContain("Taylor Candidate");
		expect(html).toContain("Product Engineer");
		expect(html).toContain("Factory Holdings LLC.");
		expect(html).toContain("5431 W 104th St, Los Angeles, CA 90045");
	});

  it("sends a sanitized branded operational alert", async () => {
		await sendSsoOperationalAlertEmail({
			to: "operations@example.com",
			code: "invalid_client",
			checkedAt: "2026-08-10T12:00:00.000Z",
		});

		expect(emailSend).toHaveBeenCalledTimes(1);
		const payload = emailSend.mock.calls[0][0] as {
			to: string;
			subject: string;
			react: Parameters<typeof render>[0];
		};
		expect(payload.to).toBe("operations@example.com");
    expect(payload.subject).toContain("Factory Careers operational alert");
		const html = await render(payload.react);
		expect(html).toContain("invalid_client");
		expect(html).toContain("Factory Careers SSO alert");
		expect(html).toContain("The automated Microsoft sign-in credential check reported an unhealthy state.");
		expect(html).toContain("2026-08-10T12:00:00.000Z");
		expect(html).toContain(
			'src="https://careers.thefactoryhq.com/factory-logo.png"',
		);
		expect(html).toContain('alt="Factory Careers"');
	});

	it.each(['storage.startup_failed', 'readiness.request_failed', 'migration.startup_failed'])(
		'keeps %s from looking like a credential failure',
		async (code) => {
			await sendOperationalAlertEmail({
				to: 'operations@example.com',
				code,
				checkedAt: '2026-08-14T23:07:25.893Z',
			})

			const payload = emailSend.mock.calls[0][0] as {
				subject: string
				react: Parameters<typeof render>[0]
			}
			expect(payload.subject).toContain(code)
			const html = await render(payload.react)
			expect(html).toContain('Factory Careers operational alert')
			expect(html).toContain('An automated production check reported an unhealthy state.')
			expect(html).toContain(code)
			expect(html).not.toContain('Factory Careers SSO alert')
			expect(html).not.toContain('Microsoft sign-in credential check')
		},
	)
});
