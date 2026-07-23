import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm'
import {
  candidateWorkflowEmailQueue,
  emailTemplate,
  orgSettings,
  type CandidateWorkflowEmailSnapshot,
} from '../database/schema'
import {
  calculateCandidateWorkflowAvailableAt,
  getCandidateWorkflowEmailDedupeKey,
  getCandidateWorkflowEmailFailureOutcome,
  type CandidateWorkflowEmailPurpose,
  type CandidateWorkflowEmailTiming,
} from '~~/shared/candidate-workflow-email'
import { SYSTEM_TEMPLATES } from '~~/shared/system-templates'
import type { CandidateWorkflowEmailData } from './email'
import { db } from './db'
import { logError, logWarn } from './logger'

export const CANDIDATE_WORKFLOW_EMAIL_CLAIM_LIMIT = 25
const LEASE_DURATION_MS = 2 * 60_000

type QueueExecutor = Pick<typeof db, 'insert'>
type QueueRecord = typeof candidateWorkflowEmailQueue.$inferSelect
type CandidateWorkflowEmailSender = (input: {
  purpose: CandidateWorkflowEmailPurpose
  template: { subject: string, body: string }
  data: CandidateWorkflowEmailData
  idempotencyKey: string
}) => Promise<string | null>

export type PreparedCandidateWorkflowEmail = {
  purpose: CandidateWorkflowEmailPurpose
  recipientEmail: string
  templateId: string
  templateSubject: string
  templateBody: string
  snapshot: CandidateWorkflowEmailSnapshot
  scheduledFor: Date
  availableAt: Date
}

export type CandidateWorkflowEmailQueueLogger = {
  logError(body: string, attributes: Record<string, string | number | boolean>): void
  logWarn(body: string, attributes: Record<string, string | number | boolean>): void
}

function workflowSettingsForPurpose(
  purpose: CandidateWorkflowEmailPurpose,
  settings: Awaited<ReturnType<typeof getEmailWorkflowSettings>>,
): {
  enabled: boolean
  templateId: string | null | undefined
  timing: CandidateWorkflowEmailTiming
} {
  if (purpose === 'application_acknowledgement') {
    return {
      enabled: settings?.sendApplicationAcknowledgement !== false,
      templateId: settings?.applicationAcknowledgementTemplateId,
      timing: {
        delayMinutes: settings?.applicationAcknowledgementDelayMinutes,
        businessHoursOnly: settings?.applicationAcknowledgementBusinessHoursOnly,
        businessHoursTimezone: settings?.emailBusinessHoursTimezone,
        businessHoursStartHour: settings?.emailBusinessHoursStartHour,
        businessHoursEndHour: settings?.emailBusinessHoursEndHour,
      },
    }
  }
  return {
    enabled: settings?.sendApplicationRejection === true,
    templateId: settings?.applicationRejectionTemplateId,
    timing: {
      delayMinutes: settings?.applicationRejectionDelayMinutes,
      businessHoursOnly: settings?.applicationRejectionBusinessHoursOnly,
      businessHoursTimezone: settings?.emailBusinessHoursTimezone,
      businessHoursStartHour: settings?.emailBusinessHoursStartHour,
      businessHoursEndHour: settings?.emailBusinessHoursEndHour,
    },
  }
}

async function getEmailWorkflowSettings(organizationId: string) {
  return await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, organizationId),
    columns: {
      sendApplicationAcknowledgement: true,
      applicationAcknowledgementTemplateId: true,
      applicationAcknowledgementDelayMinutes: true,
      applicationAcknowledgementBusinessHoursOnly: true,
      sendApplicationRejection: true,
      applicationRejectionTemplateId: true,
      applicationRejectionDelayMinutes: true,
      applicationRejectionBusinessHoursOnly: true,
      emailBusinessHoursTimezone: true,
      emailBusinessHoursStartHour: true,
      emailBusinessHoursEndHour: true,
    },
  })
}

async function resolveWorkflowTemplate(input: {
  organizationId: string
  purpose: CandidateWorkflowEmailPurpose
  templateId?: string | null
}) {
  const fallbackId = input.purpose === 'application_acknowledgement'
    ? 'system-application-acknowledgement'
    : 'system-application-rejection'
  const selectedId = input.templateId || fallbackId
  const systemTemplate = SYSTEM_TEMPLATES.find(
    template => template.id === selectedId && template.purpose === input.purpose,
  )
  if (systemTemplate) return systemTemplate

  const customTemplate = await db.query.emailTemplate.findFirst({
    where: and(
      eq(emailTemplate.id, selectedId),
      eq(emailTemplate.organizationId, input.organizationId),
      eq(emailTemplate.purpose, input.purpose),
    ),
    columns: {
      id: true,
      purpose: true,
      name: true,
      subject: true,
      body: true,
    },
  })
  return customTemplate
    ?? SYSTEM_TEMPLATES.find(template => template.id === fallbackId && template.purpose === input.purpose)
    ?? null
}

export async function prepareConfiguredCandidateWorkflowEmail(input: {
  purpose: CandidateWorkflowEmailPurpose
  data: CandidateWorkflowEmailData
  now?: Date
}): Promise<PreparedCandidateWorkflowEmail | null> {
  const now = input.now ?? new Date()
  const settings = await getEmailWorkflowSettings(input.data.organizationId)
  const configuration = workflowSettingsForPurpose(input.purpose, settings)
  if (!configuration.enabled) return null

  const template = await resolveWorkflowTemplate({
    organizationId: input.data.organizationId,
    purpose: input.purpose,
    templateId: configuration.templateId,
  })
  if (!template) throw new Error('candidate_workflow_template_unavailable')

  const scheduledFor = calculateCandidateWorkflowAvailableAt(configuration.timing, now)
  return {
    purpose: input.purpose,
    recipientEmail: input.data.candidateEmail.trim().toLowerCase(),
    templateId: template.id,
    templateSubject: template.subject,
    templateBody: template.body,
    snapshot: {
      candidateName: input.data.candidateName,
      candidateFirstName: input.data.candidateFirstName,
      candidateLastName: input.data.candidateLastName,
      jobTitle: input.data.jobTitle,
      organizationName: input.data.organizationName,
      applicationDate: input.data.applicationDate,
      applicationStatus: input.data.applicationStatus ?? '',
      dashboardApplicationUrl: input.data.dashboardApplicationUrl,
    },
    scheduledFor,
    availableAt: scheduledFor,
  }
}

export async function enqueueCandidateWorkflowEmail(
  executor: QueueExecutor,
  input: {
    prepared: PreparedCandidateWorkflowEmail
    organizationId: string
    applicationId: string
    candidateId: string
    jobId: string
    transitionAt: Date
  },
): Promise<{ id: string } | null> {
  const [inserted] = await executor.insert(candidateWorkflowEmailQueue).values({
    organizationId: input.organizationId,
    applicationId: input.applicationId,
    candidateId: input.candidateId,
    jobId: input.jobId,
    purpose: input.prepared.purpose,
    recipientEmail: input.prepared.recipientEmail,
    templateId: input.prepared.templateId,
    templateSubject: input.prepared.templateSubject,
    templateBody: input.prepared.templateBody,
    snapshot: input.prepared.snapshot,
    scheduledFor: input.prepared.scheduledFor,
    availableAt: input.prepared.availableAt,
    dedupeKey: getCandidateWorkflowEmailDedupeKey({
      applicationId: input.applicationId,
      purpose: input.prepared.purpose,
      transitionAt: input.transitionAt,
    }),
  }).onConflictDoNothing({
    target: candidateWorkflowEmailQueue.dedupeKey,
  }).returning({ id: candidateWorkflowEmailQueue.id })
  return inserted ?? null
}

function leaseExpiresAt(now: Date): Date {
  return new Date(now.getTime() + LEASE_DURATION_MS)
}

async function claimCandidateWorkflowEmails(now: Date): Promise<{
  claimed: QueueRecord[]
  exhausted: QueueRecord[]
}> {
  return db.transaction(async (tx) => {
    const exhausted = await tx.select().from(candidateWorkflowEmailQueue)
      .where(and(
        eq(candidateWorkflowEmailQueue.status, 'processing'),
        lte(candidateWorkflowEmailQueue.leaseExpiresAt, now),
        sql`${candidateWorkflowEmailQueue.attemptCount} >= ${candidateWorkflowEmailQueue.maxAttempts}`,
      ))
      .orderBy(asc(candidateWorkflowEmailQueue.availableAt), asc(candidateWorkflowEmailQueue.createdAt))
      .limit(CANDIDATE_WORKFLOW_EMAIL_CLAIM_LIMIT)
      .for('update', { skipLocked: true })

    if (exhausted.length > 0) {
      await tx.update(candidateWorkflowEmailQueue).set({
        status: 'failed',
        leaseExpiresAt: null,
        resultCode: 'lease_expired',
        completedAt: now,
        updatedAt: now,
      }).where(inArray(candidateWorkflowEmailQueue.id, exhausted.map(row => row.id)))
    }

    // Drizzle emits SELECT ... FOR UPDATE SKIP LOCKED for this bounded claim.
    const claimable = await tx.select().from(candidateWorkflowEmailQueue)
      .where(and(
        sql`${candidateWorkflowEmailQueue.attemptCount} < ${candidateWorkflowEmailQueue.maxAttempts}`,
        or(
          and(
            eq(candidateWorkflowEmailQueue.status, 'pending'),
            lte(candidateWorkflowEmailQueue.availableAt, now),
          ),
          and(
            eq(candidateWorkflowEmailQueue.status, 'processing'),
            lte(candidateWorkflowEmailQueue.leaseExpiresAt, now),
          ),
        ),
        sql`(
          ${candidateWorkflowEmailQueue.purpose} <> 'application_acknowledgement'
          OR NOT EXISTS (
            SELECT 1 FROM "document"
            WHERE "document"."application_id" = ${candidateWorkflowEmailQueue.applicationId}
              AND "document"."upload_status" = 'pending'
          )
        )`,
      ))
      .orderBy(asc(candidateWorkflowEmailQueue.availableAt), asc(candidateWorkflowEmailQueue.createdAt))
      .limit(CANDIDATE_WORKFLOW_EMAIL_CLAIM_LIMIT)
      .for('update', { skipLocked: true })

    if (claimable.length === 0) return { claimed: [], exhausted }
    const claimed = await tx.update(candidateWorkflowEmailQueue).set({
      status: 'processing',
      attemptCount: sql`${candidateWorkflowEmailQueue.attemptCount} + 1`,
      leaseExpiresAt: leaseExpiresAt(now),
      resultCode: null,
      updatedAt: now,
    }).where(inArray(candidateWorkflowEmailQueue.id, claimable.map(row => row.id))).returning()
    return { claimed, exhausted }
  })
}

function telemetryAttributes(row: QueueRecord, resultCode: string, retryable: boolean) {
  return {
    org_id: row.organizationId,
    queue_id: row.id,
    purpose: row.purpose,
    attempt_count: row.attemptCount,
    max_attempts: row.maxAttempts,
    result_code: resultCode,
    retryable,
  }
}

async function processCandidateWorkflowEmail(
  row: QueueRecord,
  now: Date,
  sendWorkflow: CandidateWorkflowEmailSender,
  logger: CandidateWorkflowEmailQueueLogger,
): Promise<void> {
  try {
    const providerMessageId = await sendWorkflow({
      purpose: row.purpose as CandidateWorkflowEmailPurpose,
      template: {
        subject: row.templateSubject,
        body: row.templateBody,
      },
      data: {
        organizationId: row.organizationId,
        candidateEmail: row.recipientEmail,
        ...row.snapshot,
      },
      idempotencyKey: `candidate-workflow-email:${row.id}`,
    })
    await db.update(candidateWorkflowEmailQueue).set({
      status: 'completed',
      leaseExpiresAt: null,
      providerMessageId,
      resultCode: 'sent',
      completedAt: now,
      updatedAt: now,
    }).where(and(
      eq(candidateWorkflowEmailQueue.id, row.id),
      eq(candidateWorkflowEmailQueue.status, 'processing'),
      eq(candidateWorkflowEmailQueue.attemptCount, row.attemptCount),
    ))
  }
  catch (error) {
    const outcome = getCandidateWorkflowEmailFailureOutcome({
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      now,
      failureCode: error instanceof Error ? error.name : 'provider_failed',
    })
    const [transitioned] = await db.update(candidateWorkflowEmailQueue).set({
      ...outcome,
      leaseExpiresAt: null,
      updatedAt: now,
    }).where(and(
      eq(candidateWorkflowEmailQueue.id, row.id),
      eq(candidateWorkflowEmailQueue.status, 'processing'),
      eq(candidateWorkflowEmailQueue.attemptCount, row.attemptCount),
    )).returning({ id: candidateWorkflowEmailQueue.id })
    if (!transitioned) return

    const attributes = telemetryAttributes(
      row,
      outcome.resultCode,
      outcome.status === 'pending',
    )
    if (outcome.status === 'pending') {
      logger.logWarn('candidate_workflow_email.retry_scheduled', attributes)
    }
    else {
      logger.logError('candidate_workflow_email.failed', attributes)
    }
  }
}

export async function processCandidateWorkflowEmailCycle(
  now = new Date(),
  dependencies: {
    sendWorkflow?: CandidateWorkflowEmailSender
    logger?: CandidateWorkflowEmailQueueLogger
  } = {},
): Promise<void> {
  const logger = dependencies.logger ?? { logError, logWarn }
  const sendWorkflow = dependencies.sendWorkflow
    ?? (await import('./email')).sendCandidateWorkflowEmail
  const { claimed, exhausted } = await claimCandidateWorkflowEmails(now)
  for (const row of exhausted) {
    logger.logError(
      'candidate_workflow_email.failed',
      telemetryAttributes(row, 'lease_expired', false),
    )
  }
  await Promise.all(claimed.map(row => processCandidateWorkflowEmail(
    row,
    now,
    sendWorkflow,
    logger,
  )))
}
