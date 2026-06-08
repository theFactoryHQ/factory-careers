import { readFile, rm } from 'node:fs/promises'

export async function readJsonlCapture<T>(
  path: string,
  filter?: (entry: T) => boolean,
): Promise<T[]> {
  try {
    const contents = await readFile(path, 'utf8')
    const lines = contents.split('\n').filter(Boolean)
    const entries = lines.flatMap((line, index) => {
      try {
        return [JSON.parse(line) as T]
      }
      catch (error) {
        if (index === lines.length - 1) {
          return []
        }

        throw error
      }
    })

    return filter ? entries.filter(filter) : entries
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export async function setupCaptureFile(envVar: string, label?: string): Promise<string> {
  const { expect } = await import('@playwright/test')
  const capturePath = process.env[envVar]
  expect(
    capturePath,
    `${envVar} must be set${label ? ` for ${label}` : ''}`,
  ).toBeTruthy()
  await rm(capturePath!, { force: true })
  return capturePath!
}