export type NormalizedCliError = {
  status: number
  code: string
  message: string
  details?: unknown
}

export function normalizeCliError(error: unknown): NormalizedCliError {
  if (error && typeof error === 'object') {
    const candidate = error as {
      status?: unknown
      statusCode?: unknown
      code?: unknown
      error?: unknown
      message?: unknown
      error_description?: unknown
      details?: unknown
    }

    return {
      status: typeof candidate.status === 'number'
        ? candidate.status
        : typeof candidate.statusCode === 'number'
          ? candidate.statusCode
          : 1,
      code: typeof candidate.code === 'string'
        ? candidate.code
        : typeof candidate.error === 'string'
          ? candidate.error
          : 'CLI_ERROR',
      message: typeof candidate.message === 'string'
        ? candidate.message
        : typeof candidate.error_description === 'string'
          ? candidate.error_description
          : 'Factory Careers CLI failed.',
      ...(candidate.details === undefined ? {} : { details: candidate.details }),
    }
  }

  return {
    status: 1,
    code: 'CLI_ERROR',
    message: error instanceof Error ? error.message : 'Factory Careers CLI failed.',
  }
}
