import { createEmailTheme } from "@caffeinebounce/email";

/**
 * Careers-specific email theme config.
 * Uses the exact same visual tokens (accent, dark palette, font stack, logo) as the main Factory site
 * so all transactional mail across Factory properties is visually consistent.
 */
export const careersEmailConfig = {
  appName: "Factory Careers",
  companyName: "Factory Holdings LLC.",
  address: "Los Angeles, CA",
  accentColor: "#FF4426",
  siteUrl: "https://careers.thefactoryhq.com",
  logoUrl:
    "https://nypetlcjkgntmkebnxbx.supabase.co/storage/v1/object/public/public-assets/factory-logo.png",
  logoMode: "full" as const,
  logoAlign: "left" as const,
  unsubscribeSecret:
    process.env.UNSUBSCRIBE_SECRET || "factory-careers-unsub-secret",
};

/**
 * The themed component factory (tokens, radii, etc.).
 */
export const careersEmails = createEmailTheme({
  theme: "factory",
  config: careersEmailConfig,
});

/**
 * Font stack matching the main site and Factory brand.
 */
export const careersEmailFontStack =
  "'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/**
 * Reusable style tokens for careers React Email templates.
 * Kept in sync with the main site's factoryEmailStyles.
 */
export const careersEmailStyles = {
  body: {
    backgroundColor: "#000000",
    fontFamily: careersEmailFontStack,
    margin: "0",
    padding: "0",
  },
  wrapper: {
    margin: "0 auto",
    maxWidth: "640px",
    padding: "40px 20px",
  },
  card: {
    backgroundColor: "#0A0A0A",
    border: "1px solid #222222",
    borderRadius: "0",
    overflow: "hidden",
  },
  accent: {
    backgroundColor: careersEmailConfig.accentColor,
    height: "3px",
    lineHeight: "3px",
    fontSize: "0",
  },
  content: {
    padding: "40px 36px 32px",
  },
  logo: {
    display: "block",
    margin: "0 0 24px 0",
  },
  logoDivider: {
    borderColor: "#222222",
    borderStyle: "solid",
    borderWidth: "1px 0 0 0",
    margin: "0 0 32px 0",
  },
  heading: {
    color: "#FFFFFF",
    fontFamily: careersEmailFontStack,
    fontSize: "24px",
    fontWeight: "700",
    letterSpacing: "-0.01em",
    lineHeight: "1.2",
    margin: "0 0 16px",
  },
  bodyText: {
    color: "#AAAAAA",
    fontFamily: careersEmailFontStack,
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 12px",
  },
  subtext: {
    color: "#666666",
    fontFamily: careersEmailFontStack,
    fontSize: "14px",
    lineHeight: "1.5",
    margin: "0 0 12px",
  },
  detailPanel: {
    backgroundColor: "#111111",
    border: "1px solid #222222",
    borderRadius: "0",
    margin: "20px 0 0",
    padding: "16px 18px 8px",
  },
  detailSectionLabel: {
    color: careersEmailConfig.accentColor,
    fontFamily: careersEmailFontStack,
    fontSize: "11px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    lineHeight: "1.3",
    margin: "0 0 10px",
  },
  detailItem: {
    color: "#FFFFFF",
    fontFamily: careersEmailFontStack,
    fontSize: "14px",
    lineHeight: "1.5",
    margin: "0 0 8px",
  },
  ctaWrap: {
    margin: "24px 0 8px",
  },
  cta: {
    backgroundColor: careersEmailConfig.accentColor,
    borderRadius: "0",
    color: "#FFFFFF",
    fontFamily: careersEmailFontStack,
    fontSize: "15px",
    fontWeight: "600",
    padding: "12px 20px",
    textDecoration: "none",
  },
  footerDivider: {
    borderColor: "#222222",
    borderStyle: "solid",
    borderWidth: "1px 0 0 0",
    margin: "32px 0 16px",
  },
  footerText: {
    color: "#555555",
    fontFamily: careersEmailFontStack,
    fontSize: "12px",
    lineHeight: "1.5",
    margin: "0 0 4px",
  },
  footerLink: {
    color: careersEmailConfig.accentColor,
    textDecoration: "underline",
  },
};