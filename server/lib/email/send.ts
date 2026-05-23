/**
 * Barrel for the email sending layer.
 * The actual send* implementations live in server/utils/email.ts (for zero call-site diff)
 * while the React templates + client + theme live here for easy sharing / future extraction.
 */

export * from "./client";
export * from "./templates";
export * from "./theme";