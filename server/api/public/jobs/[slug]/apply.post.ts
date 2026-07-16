import { eq, and, asc, isNull, or, sql } from 'drizzle-orm'
import { job, jobQuestion, organization, applicationSource, trackingLink, orgSettings } from '../../../../database/schema'
import { publicApplicationSchema, publicJobSlugSchema } from '../../../../utils/schemas/publicApplication'
import { createPreviewReadOnlyError } from '../../../../utils/previewReadOnly'
import { autoScoreApplication } from '../../../../utils/ai/autoScore'
import { sendApplicationTeamAlertEmail, sendConfiguredApplicationAcknowledgementEmail } from '../../../../utils/email'
import { parseDocument } from '../../../../utils/resume-parser'
import { assertUploadContentLength } from '../../../../utils/uploadLimits'
import { readPositiveIntegerEnv } from '../../../../utils/rateLimitConfig'
import { detectAllowedDocumentMimeType } from '../../../../utils/documentMime'
import { getPublicJobScopeCondition } from '../../../../utils/publicJobScope'
import { getPublicJobVisibilityCondition } from '../../../../utils/publicJobVisibility'
import { isBuiltInLocationQuestion } from '~~/shared/built-in-application-fields'
import { isRequiredCustomQuestionAnswered } from '~~/shared/custom-question-validation'
import { resolveFactoryCareersBaseUrl } from '../../../../utils/baseUrl'
import {
  createPublicApplication,
  DuplicatePublicApplicationError,
  PublicApplicationDocumentLimitError,
} from '../../../../utils/createPublicApplication'
import { rollbackPublicApplicationSubmission } from '../../../../utils/rollbackPublicApplicationSubmission'
import { finalizeCandidateDocumentUpload } from '../../../../utils/candidateDocumentReservation'
import {
  MAX_FILE_SIZE,
  MAX_DOCUMENTS_PER_CANDIDATE,
  MIME_TO_EXTENSION,
  sanitizeFilename,
} from '../../../../utils/schemas/document'

const APPLICATION_RATE_LIMIT_WINDOW_MS = readPositiveIntegerEnv(
  'PUBLIC_APPLICATION_RATE_LIMIT_WINDOW_MS',
  15 * 60 * 1000,
)
const APPLICATION_RATE_LIMIT_MAX_REQUESTS = readPositiveIntegerEnv(
  'PUBLIC_APPLICATION_RATE_LIMIT_MAX_REQUESTS',
  5,
)

/** Rate limit: max 5 applications per IP per 15 minutes by default. */
const applyRateLimit = createRateLimiter({
  windowMs: APPLICATION_RATE_LIMIT_WINDOW_MS,
  maxRequests: APPLICATION_RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many applications submitted. Please try again later.',
})

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024
const MAX_PUBLIC_APPLICATION_MULTIPART_BYTES = (MAX_DOCUMENTS_PER_CANDIDATE * MAX_FILE_SIZE) + MULTIPART_OVERHEAD_BYTES

/**
 * POST /api/public/jobs/:slug/apply
 * Public application submission endpoint. No auth required.
 *
 * Supports two content types:
 *   - `application/json` — standard form submission (no files)
 *   - `multipart/form-data` — form with file uploads
 *
 * Security:
 *   - IP-based rate limiting (5 requests per 15 minutes)
 *   - Honeypot field for basic bot detection
 *
 * Flow:
 * 1. Enforce rate limit
 * 2. Validate the job exists and is open (resolve by slug)
 * 3. Parse request body (JSON or multipart)
 * 4. Validate all required custom questions are answered
 * 5. Upsert candidate (deduplicate by email within the org)
 * 6. Create application linking candidate → job
 * 7. Store question responses
 * 8. Upload files to S3 and create document records
 */
export default defineEventHandler(async (event) => {
  // Enforce rate limit before any processing.
  // Skipped outside production so local dev and test environments are not throttled.
  // CI flags must not bypass this when NODE_ENV=production because several
  // deployment platforms set them.
  if (process.env.NODE_ENV === 'production') {
    await applyRateLimit(event)
  }

  const { slug } = await getValidatedRouterParams(event, publicJobSlugSchema.parse)

  // ─────────────────────────────────────────────
  // 1. Detect content type and parse request
  // ─────────────────────────────────────────────

  const contentType = getHeader(event, 'content-type') ?? ''
  const isMultipart = contentType.includes('multipart/form-data')

  if (isMultipart) {
    assertUploadContentLength(event, MAX_PUBLIC_APPLICATION_MULTIPART_BYTES)
  }

  let firstName: string
  let lastName: string
  let email: string
  let phone: string | undefined
  let country: string
  let state: string
  let website: string | undefined
  let responseArray: { questionId: string; value: string | string[] | number | boolean }[] = []
  let coverLetterText: string | undefined
  let compliance: {
    sex?: 'male' | 'female' | 'prefer_not_to_answer'
    raceEthnicity?: 'hispanic_or_latino' | 'white' | 'black_or_african_american' | 'asian' | 'native_hawaiian_or_pacific_islander' | 'american_indian_or_alaska_native' | 'two_or_more_races' | 'prefer_not_to_answer'
    veteranStatus?: 'protected_veteran' | 'not_protected_veteran' | 'prefer_not_to_answer'
    disabilityStatus?: 'yes' | 'no' | 'prefer_not_to_answer'
  } | undefined
  let sourceRef: string | undefined
  let utmSource: string | undefined
  let utmMedium: string | undefined
  let utmCampaign: string | undefined
  let utmTerm: string | undefined
  let utmContent: string | undefined
  const uploadedFiles: Map<string, { data: Buffer; filename: string; type?: string }> = new Map()
  let resumeUpload: { data: Buffer; filename: string; type?: string } | null = null

  if (isMultipart) {
    // Parse multipart form data
    const formData = await readMultipartFormData(event)
    if (!formData) {
      throw createError({ statusCode: 400, statusMessage: 'No form data received' })
    }

    const fields: Record<string, string> = {}

    for (const part of formData) {
      if (!part.name) continue

      if (part.name === 'resume') {
        // Built-in resume file
        if (part.data && part.filename) {
          resumeUpload = { data: Buffer.from(part.data), filename: part.filename, type: part.type }
        }
      } else if (part.name.startsWith('file:')) {
        // File field: "file:<questionId>"
        const questionId = part.name.slice(5)
        if (part.data && part.filename) {
          uploadedFiles.set(questionId, {
            data: Buffer.from(part.data),
            filename: part.filename,
            type: part.type,
          })
        }
      } else {
        // Text field
        fields[part.name] = part.data.toString()
      }
    }

    // Parse responses from JSON string before validation
    let rawResponses: unknown[] = []
    if (fields.responses) {
      try {
        rawResponses = JSON.parse(fields.responses)
      } catch {
        throw createError({ statusCode: 400, statusMessage: 'Invalid responses format' })
      }
    }

    let rawCompliance: unknown
    if (fields.compliance) {
      try {
        rawCompliance = JSON.parse(fields.compliance)
      } catch {
        throw createError({ statusCode: 400, statusMessage: 'Invalid compliance format' })
      }
    }

    // Validate all multipart text fields through the same Zod schema as JSON
    const validated = publicApplicationSchema.parse({
      firstName: fields.firstName?.trim() ?? '',
      lastName: fields.lastName?.trim() ?? '',
      email: fields.email?.trim() ?? '',
      phone: fields.phone?.trim() || undefined,
      country: fields.country?.trim() ?? '',
      state: fields.state?.trim() ?? '',
      website: fields.website || undefined,
      coverLetterText: fields.coverLetterText?.trim() || undefined,
      responses: rawResponses,
      compliance: rawCompliance,
      ref: fields.ref || undefined,
      utmSource: fields.utmSource || undefined,
      utmMedium: fields.utmMedium || undefined,
      utmCampaign: fields.utmCampaign || undefined,
      utmTerm: fields.utmTerm || undefined,
      utmContent: fields.utmContent || undefined,
    })

    firstName = validated.firstName
    lastName = validated.lastName
    email = validated.email
    phone = validated.phone
    country = validated.country
    state = validated.state
    website = validated.website
    coverLetterText = validated.coverLetterText
    responseArray = validated.responses
    compliance = validated.compliance
    sourceRef = validated.ref
    utmSource = validated.utmSource
    utmMedium = validated.utmMedium
    utmCampaign = validated.utmCampaign
    utmTerm = validated.utmTerm
    utmContent = validated.utmContent
  } else {
    // Standard JSON body
    const body = await readValidatedBody(event, publicApplicationSchema.parse)
    firstName = body.firstName
    lastName = body.lastName
    email = body.email
    phone = body.phone
    country = body.country
    state = body.state
    website = body.website
    coverLetterText = body.coverLetterText
    responseArray = body.responses
    compliance = body.compliance
    sourceRef = body.ref
    utmSource = body.utmSource
    utmMedium = body.utmMedium
    utmCampaign = body.utmCampaign
    utmTerm = body.utmTerm
    utmContent = body.utmContent
  }

  // Honeypot check — if the hidden `website` field is filled, silently reject
  if (website) {
    setResponseStatus(event, 200)
    return { success: true }
  }

  // ─────────────────────────────────────────────
  // 2. Fetch the job by slug and verify it's open
  // ─────────────────────────────────────────────

  const organizationScope = await getPublicJobScopeCondition()
  const jobConditions = [eq(job.slug, slug), getPublicJobVisibilityCondition()]
  if (organizationScope) jobConditions.push(organizationScope)

  const existingJob = await db.query.job.findFirst({
    where: and(...jobConditions),
    columns: {
      id: true,
      title: true,
      organizationId: true,
      requireResume: true,
      requireCoverLetter: true,
      autoScoreOnApply: true,
      applicationComplianceEnabled: true,
      includeEeo: true,
      includeVeteran: true,
      includeDisability: true,
    },
  })

  if (!existingJob) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found or not accepting applications' })
  }

  // Validate required resume
  if (existingJob.requireResume && !resumeUpload) {
    throw createError({ statusCode: 422, statusMessage: 'Resume/CV is required for this position' })
  }

  // Validate required cover letter
  if (existingJob.requireCoverLetter && !coverLetterText?.trim()) {
    throw createError({ statusCode: 422, statusMessage: 'Cover letter is required for this position' })
  }

  const orgId = existingJob.organizationId
  const jobId = existingJob.id
  const settings = await db.query.orgSettings.findFirst({
    where: eq(orgSettings.organizationId, orgId),
    columns: {
      applicationComplianceEnabled: true,
      includeEeo: true,
      includeVeteran: true,
      includeDisability: true,
    },
  })
  const complianceEnabled = (settings?.applicationComplianceEnabled ?? true) && existingJob.applicationComplianceEnabled
  const complianceConfig = {
    enabled: complianceEnabled,
    includeEeo: complianceEnabled && (settings?.includeEeo ?? true) && existingJob.includeEeo,
    includeVeteran: complianceEnabled && (settings?.includeVeteran ?? true) && existingJob.includeVeteran,
    includeDisability: complianceEnabled && (settings?.includeDisability ?? true) && existingJob.includeDisability,
  }

  // Demo org is strictly read-only (defense in depth; middleware also blocks this route)
  if (env.DEMO_ORG_SLUG) {
    const [demoOrg] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, env.DEMO_ORG_SLUG))
      .limit(1)

    if (demoOrg?.id === orgId) {
      throw createPreviewReadOnlyError()
    }
  }

  // ─────────────────────────────────────────────
  // 3. Fetch questions and validate responses
  // ─────────────────────────────────────────────

  const rawQuestions = await db.query.jobQuestion.findMany({
    where: and(eq(jobQuestion.jobId, jobId), eq(jobQuestion.organizationId, orgId)),
    orderBy: [asc(jobQuestion.displayOrder)],
  })
  const questions = rawQuestions.filter((q) => !isBuiltInLocationQuestion(q))

  const responseValuesByQuestionId = new Map(responseArray.map((r) => [r.questionId, r.value]))

  const unanswered = questions
    .filter((q) => q.required)
    .filter((q) => !isRequiredCustomQuestionAnswered(
      q.type,
      responseValuesByQuestionId.get(q.id),
      uploadedFiles.has(q.id),
    ))
    .map((q) => q.id)

  if (unanswered.length > 0) {
    const unansweredLabels = questions
      .filter((q) => unanswered.includes(q.id))
      .map((q) => q.label)

    throw createError({
      statusCode: 422,
      statusMessage: `Missing required answers: ${unansweredLabels.join(', ')}`,
    })
  }

  // Filter out responses for questions that don't belong to this job
  const validQuestionIds = new Set(questions.map((q) => q.id))
  const fileQuestionIds = new Set(questions.filter((q) => q.type === 'file_upload').map((q) => q.id))
  const validResponses = responseArray.filter((r) => validQuestionIds.has(r.questionId))
  const validNonFileResponses = validResponses.filter((r) => !fileQuestionIds.has(r.questionId))

  // ─────────────────────────────────────────────
  // 4. Validate uploaded files (MIME via magic bytes, size)
  // ─────────────────────────────────────────────

  for (const [questionId, file] of uploadedFiles) {
    // Only accept files for valid file_upload questions
    if (!fileQuestionIds.has(questionId)) {
      uploadedFiles.delete(questionId)
      continue
    }

    // Check file size
    if (file.data.length > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 413,
        statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      })
    }

    // Validate MIME from magic bytes (not Content-Type header)
    const mimeType = await detectAllowedDocumentMimeType(file.data)
    if (!mimeType) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid file type. Allowed: PDF, DOC, DOCX',
      })
    }

    // Store the validated MIME type back on the file object
    file.type = mimeType
  }

  // ─────────────────────────────────────────────
  // 5. Validate resume MIME type early (before any DB writes)
  // ─────────────────────────────────────────────

  let resumeMimeType: string | undefined
  if (resumeUpload) {
    if (resumeUpload.data.length > MAX_FILE_SIZE) {
      throw createError({
        statusCode: 413,
        statusMessage: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      })
    }

    resumeMimeType = await detectAllowedDocumentMimeType(resumeUpload.data) ?? undefined
    if (!resumeMimeType) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid file type for resume. Allowed: PDF, DOC, DOCX',
      })
    }
  }

  // ─────────────────────────────────────────────
  // 6. Persist the relational application core in one transaction
  // ─────────────────────────────────────────────

  type PlannedDocumentUpload = {
    id: string
    kind: 'custom' | 'resume'
    questionId?: string
    type: 'resume' | 'cover_letter' | 'other'
    storageKey: string
    originalFilename: string
    mimeType: string
    sizeBytes: number
    data: Buffer
  }

  const plannedDocumentUploads: PlannedDocumentUpload[] = []
  for (const [questionId, file] of uploadedFiles) {
    const id = crypto.randomUUID()
    const mimeType = file.type!
    const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin'
    const question = questions.find(candidateQuestion => candidateQuestion.id === questionId)
    const label = question?.label?.toLowerCase() ?? ''
    const type = label.includes('resume') || label.includes('cv')
      ? 'resume'
      : label.includes('cover letter')
        ? 'cover_letter'
        : 'other'

    plannedDocumentUploads.push({
      id,
      kind: 'custom',
      questionId,
      type,
      storageKey: `${orgId}/applications/${id}.${extension}`,
      originalFilename: sanitizeFilename(file.filename),
      mimeType,
      sizeBytes: file.data.length,
      data: file.data,
    })
  }

  if (resumeUpload) {
    const id = crypto.randomUUID()
    const mimeType = resumeMimeType!
    const extension = MIME_TO_EXTENSION[mimeType] ?? 'bin'
    plannedDocumentUploads.push({
      id,
      kind: 'resume',
      type: 'resume',
      storageKey: `${orgId}/applications/${id}.${extension}`,
      originalFilename: sanitizeFilename(resumeUpload.filename),
      mimeType,
      sizeBytes: resumeUpload.data.length,
      data: resumeUpload.data,
    })
  }

  const normalizedCompliance = complianceConfig.enabled
    ? {
        sex: complianceConfig.includeEeo ? compliance?.sex : undefined,
        raceEthnicity: complianceConfig.includeEeo ? compliance?.raceEthnicity : undefined,
        veteranStatus: complianceConfig.includeVeteran ? compliance?.veteranStatus : undefined,
        disabilityStatus: complianceConfig.includeDisability ? compliance?.disabilityStatus : undefined,
      }
    : undefined

  let createdApplication: Awaited<ReturnType<typeof createPublicApplication>>
  try {
    createdApplication = await createPublicApplication({
      organizationId: orgId,
      jobId,
      candidate: {
        firstName,
        lastName,
        email,
        phone,
        country,
        state,
      },
      coverLetterText,
      compliance: hasComplianceResponse(normalizedCompliance)
        ? {
            ...normalizedCompliance,
            jurisdiction: 'US',
            formVersion: 'US-SELF-ID-2026-05',
          }
        : undefined,
      responses: validNonFileResponses,
      documents: plannedDocumentUploads.map(({ data: _data, kind: _kind, ...reservedDocument }) => reservedDocument),
      maxDocumentsPerCandidate: MAX_DOCUMENTS_PER_CANDIDATE,
    })
  } catch (error) {
    if (error instanceof DuplicatePublicApplicationError) {
      throw createError({
        statusCode: 409,
        statusMessage: 'You have already applied to this position',
      })
    }
    if (error instanceof PublicApplicationDocumentLimitError) {
      throw createError({
        statusCode: 409,
        statusMessage: error.message,
      })
    }
    throw error
  }

  const { applicationId, candidateId, documentProcessingTasks } = createdApplication
  const newApplication = { id: applicationId }

  // ─────────────────────────────────────────────
  // 9. Upload reserved documents and persist parsed content
  // ─────────────────────────────────────────────
  const attemptedStorageKeys: string[] = []
  let failedDocument: PlannedDocumentUpload | undefined
  try {
    for (const plannedDocument of plannedDocumentUploads) {
      failedDocument = plannedDocument
      attemptedStorageKeys.push(plannedDocument.storageKey)
      await uploadToS3(plannedDocument.storageKey, plannedDocument.data, plannedDocument.mimeType)

      // Parsing is best-effort and returns null when extraction is unavailable.
      const parsedContent = await parseDocument(plannedDocument.data, plannedDocument.mimeType)
      const processingTaskId = documentProcessingTasks[plannedDocument.id]
      if (!processingTaskId) throw new Error('Reserved application document task was not found')
      await finalizeCandidateDocumentUpload({
        documentId: plannedDocument.id,
        organizationId: orgId,
        candidateId,
        processingTaskId,
        parsedContent,
      })
    }
  } catch (uploadError) {
    const isResume = failedDocument?.kind === 'resume'
    logError(isResume ? 'application.resume_upload_failed' : 'application.file_upload_failed', {
      job_id: jobId,
      application_id: applicationId,
      question_id: failedDocument?.questionId,
      document_id: failedDocument?.id,
      error_message: uploadError instanceof Error ? uploadError.message : String(uploadError),
    })

    const rollback = await rollbackPublicApplicationSubmission({
      applicationId,
      organizationId: orgId,
      storageKeys: attemptedStorageKeys,
    })
    if (!rollback.relationalCleanupSucceeded) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Your application was received, but a document could not be processed. Please contact support before retrying.',
      })
    }

    throw createError({
      statusCode: 502,
      statusMessage: isResume
        ? 'Failed to upload your resume. Please try again.'
        : 'Failed to upload an application document. Please try again.',
    })
  }

  // ─────────────────────────────────────────────
  // 10. Record source attribution after required uploads succeed
  // ─────────────────────────────────────────────

  try {
    const refererHeader = getHeader(event, 'referer') || getHeader(event, 'referrer')
    const referrerDomain = refererHeader ? extractDomain(refererHeader) : null

    await db.transaction(async (tx) => {
      let resolvedLink: { id: string; channel: typeof trackingLink.$inferSelect['channel'] } | null = null
      if (sourceRef) {
        const [found] = await tx.update(trackingLink)
          .set({ applicationCount: sql`${trackingLink.applicationCount} + 1` })
          .where(and(
            eq(trackingLink.organizationId, orgId),
            eq(trackingLink.code, sourceRef),
            eq(trackingLink.isActive, true),
            or(isNull(trackingLink.jobId), eq(trackingLink.jobId, jobId)),
          ))
          .returning({ id: trackingLink.id, channel: trackingLink.channel })
        resolvedLink = found ?? null
      }

      const channel = resolvedLink?.channel
        ?? mapUtmToChannel(utmSource)
        ?? mapReferrerToChannel(referrerDomain)
        ?? 'direct'

      await tx.insert(applicationSource).values({
        organizationId: orgId,
        applicationId,
        channel: channel as typeof applicationSource.$inferInsert.channel,
        trackingLinkId: resolvedLink?.id ?? null,
        utmSource: utmSource ?? null,
        utmMedium: utmMedium ?? null,
        utmCampaign: utmCampaign ?? null,
        utmTerm: utmTerm ?? null,
        utmContent: utmContent ?? null,
        referrerDomain,
      })
    })
  } catch (sourceErr) {
    logWarn('application.source_tracking_failed', {
      application_id: applicationId,
      error_message: sourceErr instanceof Error ? sourceErr.message : String(sourceErr),
    })
  }

  // ─────────────────────────────────────────────
  // 12. Send application emails
  // ─────────────────────────────────────────────

  if (newApplication) {
    const candidateName = `${firstName} ${lastName}`.trim()
    const applicationUrl = `${resolveFactoryCareersBaseUrl()}/dashboard/applications/${newApplication.id}`

    const receiptEmail = sendConfiguredApplicationAcknowledgementEmail({
      organizationId: orgId,
      candidateEmail: email.toLowerCase(),
      candidateName,
      candidateFirstName: firstName,
      candidateLastName: lastName,
      jobTitle: existingJob.title,
      organizationName: env.FACTORY_ORG_NAME,
      applicationDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      applicationStatus: 'new',
    }).catch((err) => {
      logError('application.receipt_email_failed', {
        application_id: newApplication.id,
        job_id: jobId,
        error_message: err instanceof Error ? err.message : String(err),
      })
      if (env.FACTORY_EMAIL_TEST_MODE === 'capture') {
        throw err
      }
    })

    const teamAlertEmail = sendApplicationTeamAlertEmail({
      candidateEmail: email.toLowerCase(),
      candidateName,
      jobTitle: existingJob.title,
      applicationUrl,
      hasResume: !!resumeUpload,
    }).catch((err) => {
      logError('application.team_alert_email_failed', {
        application_id: newApplication.id,
        job_id: jobId,
        error_message: err instanceof Error ? err.message : String(err),
      })
      if (env.FACTORY_EMAIL_TEST_MODE === 'capture') {
        throw err
      }
    })

    if (env.FACTORY_EMAIL_TEST_MODE === 'capture') {
      await Promise.all([receiptEmail, teamAlertEmail])
    }
  }

  // ─────────────────────────────────────────────
  // 13. Fire-and-forget auto AI scoring if enabled
  // ─────────────────────────────────────────────

  if (existingJob.autoScoreOnApply && newApplication) {
    autoScoreApplication(newApplication.id, orgId).catch((err) => {
      logError('application.auto_score_failed', {
        application_id: newApplication.id,
        job_id: jobId,
        error_message: err instanceof Error ? err.message : String(err),
      })
    })
  }

  // Track public application on the server side (no auth session)
  trackEvent(event, null, 'application received', {
    job_slug: slug,
    job_id: existingJob.id,
    application_id: newApplication?.id,
    has_resume: !!resumeUpload,
    auto_score_enabled: !!existingJob.autoScoreOnApply,
  })

  logApiRequest(event, null, 'application.received', {
    job_slug: slug,
    job_id: existingJob.id,
    application_id: newApplication?.id,
    has_resume: !!resumeUpload,
    question_count: validResponses.length,
    file_count: uploadedFiles.size,
    auto_score_enabled: !!existingJob.autoScoreOnApply,
  })

  await invalidateOrgScopedDashboardCacheForOrg(orgId)

  setResponseStatus(event, 201)
  return { success: true }
})

function hasComplianceResponse(value: {
  sex?: string
  raceEthnicity?: string
  veteranStatus?: string
  disabilityStatus?: string
} | undefined): value is {
  sex?: string
  raceEthnicity?: string
  veteranStatus?: string
  disabilityStatus?: string
} {
  return !!value && Object.values(value).some((answer) => answer !== undefined && answer !== null && answer !== '')
}

// ─────────────────────────────────────────────
// Source attribution helpers
// ─────────────────────────────────────────────

/** Extract domain from a URL, stripping www. prefix. Returns null on invalid URLs. */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/** Map common utm_source values to canonical source channels */
function mapUtmToChannel(utmSource: string | undefined): string | null {
  if (!utmSource) return null
  const source = utmSource.toLowerCase().trim()
  const mapping: Record<string, string> = {
    linkedin: 'linkedin',
    indeed: 'indeed',
    glassdoor: 'glassdoor',
    ziprecruiter: 'ziprecruiter',
    monster: 'monster',
    handshake: 'handshake',
    angellist: 'angellist',
    wellfound: 'wellfound',
    dice: 'dice',
    stackoverflow: 'stackoverflow',
    'stack overflow': 'stackoverflow',
    weworkremotely: 'weworkremotely',
    remoteok: 'remoteok',
    'remote ok': 'remoteok',
    builtin: 'builtin',
    hired: 'hired',
    lever: 'lever',
    greenhouse: 'greenhouse_board',
    'google jobs': 'google_jobs',
    google_jobs: 'google_jobs',
    facebook: 'facebook',
    twitter: 'twitter',
    x: 'twitter',
    instagram: 'instagram',
    tiktok: 'tiktok',
    reddit: 'reddit',
    referral: 'referral',
    email: 'email',
    newsletter: 'email',
    event: 'event',
    agency: 'agency',
  }
  return mapping[source] ?? null
}

/** Map referrer domains to canonical source channels */
function mapReferrerToChannel(domain: string | null): string | null {
  if (!domain) return null
  const d = domain.toLowerCase()
  const mapping: Record<string, string> = {
    'linkedin.com': 'linkedin',
    'indeed.com': 'indeed',
    'glassdoor.com': 'glassdoor',
    'ziprecruiter.com': 'ziprecruiter',
    'monster.com': 'monster',
    'joinhandshake.com': 'handshake',
    'angel.co': 'angellist',
    'wellfound.com': 'wellfound',
    'dice.com': 'dice',
    'stackoverflow.com': 'stackoverflow',
    'weworkremotely.com': 'weworkremotely',
    'remoteok.com': 'remoteok',
    'builtin.com': 'builtin',
    'hired.com': 'hired',
    'lever.co': 'lever',
    'boards.greenhouse.io': 'greenhouse_board',
    'jobs.google.com': 'google_jobs',
    'google.com': 'google_jobs',
    'facebook.com': 'facebook',
    'twitter.com': 'twitter',
    'x.com': 'twitter',
    'instagram.com': 'instagram',
    'tiktok.com': 'tiktok',
    'reddit.com': 'reddit',
  }
  // Check for exact match first, then suffix match for subdomains
  if (mapping[d]) return mapping[d]!
  for (const [key, channel] of Object.entries(mapping)) {
    if (d.endsWith(`.${key}`) || d === key) return channel
  }
  return null
}
