import { readFile } from "node:fs/promises";

export type CapturedEmail = {
  from?: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  renderError?: string;
};

export async function readCapturedEmails(capturePath: string): Promise<CapturedEmail[]> {
  try {
    const contents = await readFile(capturePath, "utf8");
    return contents
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as CapturedEmail);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
