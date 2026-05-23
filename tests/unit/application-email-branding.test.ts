import { beforeEach, describe, expect, it, vi } from "vitest";

const resendSend = vi.fn();

vi.mock("resend", () => ({
	Resend: class {
		emails = { send: resendSend };
	},
}));

vi.mock("nodemailer", () => ({
	default: {
		createTransport: vi.fn(),
	},
}));

vi.stubGlobal("env", {
	SMTP_HOST: "",
	RESEND_API_KEY: "re_test",
	RESEND_FROM_EMAIL: "Factory Careers <careers@thefactoryhq.com>",
});
vi.stubGlobal("logError", vi.fn());

const { sendApplicationReceiptEmail } = await import(
	"../../server/utils/email"
);

describe("application receipt email branding", () => {
	beforeEach(() => {
		resendSend.mockReset();
		resendSend.mockResolvedValue({ error: null });
	});

	it("wraps the receipt email in the shared branded shell", async () => {
		await sendApplicationReceiptEmail({
			candidateEmail: "candidate@example.com",
			candidateName: "Taylor Candidate",
			jobTitle: "Product Engineer",
			organizationName: "Factory",
		});

		expect(resendSend).toHaveBeenCalledTimes(1);

		const payload = resendSend.mock.calls[0][0] as { html: string };
		expect(payload.html).toContain("Application received");
		expect(payload.html).toContain("Taylor Candidate");
		expect(payload.html).toContain("Product Engineer");
		expect(payload.html).toContain(
			"Sent by Factory Careers — Open-source applicant tracking",
		);
	});
});
