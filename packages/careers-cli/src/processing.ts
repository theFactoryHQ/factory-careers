import { z } from 'zod'
import type { Command } from 'commander'
import { requestJson, type FetchLike } from './api'
import { CliExitCode } from './errors'

const processingCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  attempted: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
}).strict().superRefine((counts, context) => {
  const represented = counts.pending
    + counts.processing
    + counts.succeeded
    + counts.failed
    + counts.cancelled
  if (represented !== counts.total) {
    context.addIssue({ code: 'custom', message: 'Task counts do not equal total' })
  }
  if (counts.attempted > counts.total) {
    context.addIssue({ code: 'custom', message: 'Attempted count exceeds total' })
  }
})

const processingBatchSchema = z.object({
  batchId: z.string().min(1),
  type: z.enum(['application_analysis', 'document_parse', 'document_upload_reconciliation']),
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'cancelled']),
  counts: processingCountsSchema,
  errorsByCode: z.record(z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/), z.number().int().positive()),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  retryAfterMs: z.number().int().nonnegative().nullable(),
}).strict()

export type ProcessingBatchResponse = z.infer<typeof processingBatchSchema>

export function parseProcessingBatchResponse(value: unknown): ProcessingBatchResponse {
  const result = processingBatchSchema.safeParse(value)
  if (!result.success) {
    throw new Error('Invalid processing batch response')
  }
  return result.data
}

export function isTerminalProcessingBatch(batch: ProcessingBatchResponse): boolean {
  return batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled'
}

type PollProcessingBatchOptions = {
  drain: (batchId: string, signal?: AbortSignal) => Promise<unknown>
  sleep: (ms: number) => Promise<void>
  timeoutMs: number
  pollIntervalMs: number
  now?: () => number
  deadline?: ProcessingDeadline
}

const MIN_CLI_POLL_INTERVAL_MS = 250
const MAX_CLI_RETRY_MS = 30_000

function timeoutError(batchId?: string): {
  status: number
  code: string
  message: string
  details?: { batchId: string }
} {
  return {
    status: 1,
    code: 'PROCESSING_TIMEOUT',
    message: batchId
      ? 'Processing did not finish before the timeout. Resume it with processing drain.'
      : 'The processing request did not finish before the timeout. Retry the command.',
    ...(batchId ? { details: { batchId } } : {}),
  }
}

export type ProcessingDeadline = {
  startedAt: number
  timeoutMs: number
  now: () => number
}

export function createProcessingDeadline(
  timeoutMs: number,
  now: () => number = Date.now,
): ProcessingDeadline {
  return { startedAt: now(), timeoutMs, now }
}

function remainingProcessingTime(deadline: ProcessingDeadline): number {
  return deadline.timeoutMs - (deadline.now() - deadline.startedAt)
}

async function withDeadline<T>(
  promise: Promise<T>,
  remainingMs: number,
  batchId?: string,
  controller?: AbortController,
): Promise<T> {
  if (remainingMs <= 0) throw timeoutError(batchId)

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller?.abort()
      reject(timeoutError(batchId))
    }, remainingMs)
  })
  try {
    return await Promise.race([promise, timeout])
  }
  finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runWithinProcessingDeadline<T>(
  deadline: ProcessingDeadline,
  operation: (signal: AbortSignal) => Promise<T>,
  batchId?: string,
): Promise<T> {
  const remainingMs = remainingProcessingTime(deadline)
  if (remainingMs <= 0) throw timeoutError(batchId)

  const controller = new AbortController()
  return await withDeadline(operation(controller.signal), remainingMs, batchId, controller)
}

function retryDelay(batch: ProcessingBatchResponse, pollIntervalMs: number): number {
  const minimum = Math.max(MIN_CLI_POLL_INTERVAL_MS, pollIntervalMs)
  return Math.min(MAX_CLI_RETRY_MS, Math.max(minimum, batch.retryAfterMs ?? minimum))
}

export async function pollProcessingBatch(
  initial: ProcessingBatchResponse,
  options: PollProcessingBatchOptions,
): Promise<ProcessingBatchResponse> {
  if (isTerminalProcessingBatch(initial)) return initial

  const deadline = options.deadline
    ?? createProcessingDeadline(options.timeoutMs, options.now)
  let current = initial

  while (!isTerminalProcessingBatch(current)) {
    const next = parseProcessingBatchResponse(await runWithinProcessingDeadline(
      deadline,
      signal => options.drain(initial.batchId, signal),
      initial.batchId,
    ))
    if (next.batchId !== initial.batchId) {
      throw new Error('Invalid processing batch response')
    }
    current = next
    if (!isTerminalProcessingBatch(current)) {
      const remainingBeforeSleep = remainingProcessingTime(deadline)
      if (remainingBeforeSleep <= 0) throw timeoutError(initial.batchId)
      await withDeadline(
        options.sleep(Math.min(
          retryDelay(current, options.pollIntervalMs),
          remainingBeforeSleep,
        )),
        remainingBeforeSleep,
        initial.batchId,
      )
    }
  }

  return current
}

export type ProcessingWaitCommandOptions = {
  wait?: boolean
  timeout?: string
  pollInterval?: string
}

export type ProcessingWaitOptions = {
  wait: boolean
  timeoutMs: number
  pollIntervalMs: number
}

const DEFAULT_PROCESSING_TIMEOUT_SECONDS = 15 * 60
const DEFAULT_PROCESSING_POLL_INTERVAL_MS = 1_000

function positiveNumberOption(
  value: string | undefined,
  fallback: number,
  option: string,
): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw {
      status: 400,
      code: 'INVALID_PROCESSING_OPTION',
      message: `${option} must be a positive number.`,
    }
  }
  return parsed
}

export function resolveProcessingWaitOptions(
  options: ProcessingWaitCommandOptions,
): ProcessingWaitOptions {
  return {
    wait: options.wait !== false,
    timeoutMs: positiveNumberOption(
      options.timeout,
      DEFAULT_PROCESSING_TIMEOUT_SECONDS,
      '--timeout',
    ) * 1_000,
    pollIntervalMs: positiveNumberOption(
      options.pollInterval,
      DEFAULT_PROCESSING_POLL_INTERVAL_MS,
      '--poll-interval',
    ),
  }
}

export function addProcessingWaitOptions(command: Command, allowNoWait = true): Command {
  command
    .option('--timeout <seconds>', 'Maximum seconds to wait for terminal batch status', String(DEFAULT_PROCESSING_TIMEOUT_SECONDS))
    .option('--poll-interval <ms>', 'Minimum milliseconds between drain attempts', String(DEFAULT_PROCESSING_POLL_INTERVAL_MS))
  if (allowNoWait) {
    command.option('--no-wait', 'Return the created batch immediately for later processing drain')
  }
  return command
}

type ProcessingApiContext = {
  fetch: FetchLike
  baseUrl: string
  token: string
}

export async function getProcessingBatch(
  context: ProcessingApiContext,
  batchId: string,
  signal?: AbortSignal,
): Promise<ProcessingBatchResponse> {
  return parseProcessingBatchResponse(await requestJson<unknown>({
    fetch: context.fetch,
    url: `${context.baseUrl}/api/processing/${encodeURIComponent(batchId)}`,
    method: 'GET',
    token: context.token,
    signal,
  }))
}

export async function drainProcessingBatch(
  context: ProcessingApiContext,
  batchId: string,
  signal?: AbortSignal,
): Promise<ProcessingBatchResponse> {
  return parseProcessingBatchResponse(await requestJson<unknown>({
    fetch: context.fetch,
    url: `${context.baseUrl}/api/processing/${encodeURIComponent(batchId)}/drain`,
    method: 'POST',
    token: context.token,
    body: { limit: 5 },
    signal,
  }))
}

export async function waitForProcessingBatch(
  initialValue: unknown,
  input: ProcessingApiContext & {
    sleep: (ms: number) => Promise<void>
    options: ProcessingWaitOptions
    deadline?: ProcessingDeadline
  },
): Promise<ProcessingBatchResponse> {
  const initial = parseProcessingBatchResponse(initialValue)
  if (!input.options.wait) return initial
  return await pollProcessingBatch(initial, {
    drain: (batchId, signal) => drainProcessingBatch(input, batchId, signal),
    sleep: input.sleep,
    timeoutMs: input.options.timeoutMs,
    pollIntervalMs: input.options.pollIntervalMs,
    deadline: input.deadline,
  })
}

export async function executeProcessingBatch(
  initialRequest: (signal: AbortSignal) => Promise<unknown>,
  input: ProcessingApiContext & {
    sleep: (ms: number) => Promise<void>
    options: ProcessingWaitOptions
    timeoutBatchId?: string
  },
): Promise<ProcessingBatchResponse> {
  const deadline = createProcessingDeadline(input.options.timeoutMs)
  const initial = await runWithinProcessingDeadline(
    deadline,
    initialRequest,
    input.timeoutBatchId,
  )

  return await waitForProcessingBatch(initial, {
    ...input,
    deadline,
  })
}

export function exitForUnsuccessfulBatch(batch: ProcessingBatchResponse): void {
  if (batch.status === 'failed' || batch.status === 'cancelled') {
    throw new CliExitCode(1)
  }
}
