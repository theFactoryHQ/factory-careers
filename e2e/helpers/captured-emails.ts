import { readJsonlCapture } from './captured-jsonl'

export type CapturedEmail = {
  from?: string
  to: string[]
  subject: string
  html: string
  text: string
  renderError?: string
}

export async function readCapturedEmails(capturePath: string): Promise<CapturedEmail[]> {
  return readJsonlCapture<CapturedEmail>(capturePath)
}