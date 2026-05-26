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
    const lines = contents
      .split("\n")
      .filter(Boolean);

    return lines.flatMap((line, index) => {
      try {
        return [JSON.parse(line) as CapturedEmail];
      } catch {
        if (index === lines.length - 1) {
          return [];
        }

        throw error;
      }
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}
