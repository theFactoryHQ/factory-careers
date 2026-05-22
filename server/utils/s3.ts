import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  DeleteBucketPolicyCommand,
} from '@aws-sdk/client-s3'

// ─────────────────────────────────────────────
// S3-compatible client for document storage
// ─────────────────────────────────────────────

let _s3Client: S3Client | undefined

/**
 * Lazily-initialized S3-compatible client for MinIO, Supabase Storage S3, or AWS S3.
 * The client is created on first access — not at import time — so build-time
 * prerendering doesn't crash when S3 env vars aren't available.
 *
 * `forcePathStyle` is controlled by `S3_FORCE_PATH_STYLE` env var:
 * - `true` (default) — required for MinIO (path-style URLs)
 * - `false` — required for AWS S3-style virtual-hosted URLs
 */
export function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    })
  }
  return _s3Client
}

/** @deprecated Use `getS3Client()` — kept for backward compatibility */
export const s3Client = new Proxy({} as S3Client, {
  get(_, prop: string | symbol) {
    const instance = getS3Client()
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop]
    return typeof value === 'function' ? (value as Function).bind(instance) : value
  },
})

/**
 * Upload a file to S3/MinIO.
 *
 * @param key - Server-generated storage key (e.g. `{orgId}/{candidateId}/{docId}.pdf`)
 * @param body - File content as Buffer or Uint8Array
 * @param contentType - Validated MIME type of the file
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

/**
 * Download a file from S3/MinIO and return the raw bytes.
 *
 * @param key - The storage key of the object to download
 * @returns File content as a Buffer
 */
export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  )

  if (!response.Body) {
    throw new Error(`S3 object body is empty: ${key}`)
  }

  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}

/**
 * Delete a file from S3/MinIO.
 * Silently succeeds if the object doesn't exist (S3 convention).
 *
 * @param key - The storage key of the object to delete
 */
export async function deleteFromS3(key: string): Promise<void> {
  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  )
}

/**
 * Check if the configured bucket exists.
 * @returns true if the bucket exists and is accessible
 */
export async function bucketExists(): Promise<boolean> {
  try {
    await getS3Client().send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
    return true
  } catch {
    return false
  }
}

/**
 * Create the configured bucket if it doesn't exist, then enforce
 * private access by deleting any public policy. Idempotent — safe
 * to call repeatedly.
 *
 * Security: MinIO buckets without a policy are private by default.
 * We delete any existing policy to ensure no accidental public access.
 */
export async function ensureBucketExists(): Promise<void> {
  if (!(await bucketExists())) {
    await getS3Client().send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
  }

  if (env.S3_SKIP_BUCKET_POLICY) {
    console.info(`[Factory Careers] S3 bucket "${env.S3_BUCKET}" — skipping bucket policy enforcement`)
    return
  }

  // Always enforce private policy (idempotent) when the S3 provider supports it.
  await enforcePrivateBucketPolicy()
}

/**
 * Set the bucket to private by removing any public policy.
 * MinIO buckets are private by default — this ensures no public
 * policy was added manually via the MinIO console.
 *
 * Note: We delete the bucket policy rather than setting a Deny rule
 * because MinIO doesn't support AWS-specific condition keys like
 * `aws:PrincipalType`. A bucket with no policy is private by default.
 */
async function enforcePrivateBucketPolicy(): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteBucketPolicyCommand({ Bucket: env.S3_BUCKET }),
    )
  } catch (error: unknown) {
    // Ignore "no policy exists" errors — that's the desired state
    if (error instanceof Error && 'name' in error && error.name === 'NoSuchBucketPolicy') {
      return
    }
    if (isUnsupportedBucketPolicyError(error)) {
      logWarn('s3.bucket_policy_unsupported', {
        bucket: env.S3_BUCKET,
        error_message: error instanceof Error ? error.message : String(error),
      })
      return
    }
    throw error
  }
}

export function isUnsupportedBucketPolicyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
  const statusCode = metadata?.httpStatusCode
  const name = error.name.toLowerCase()
  const compactName = name.replace(/[^a-z0-9]/g, '')
  const message = error.message.toLowerCase()

  return (
    statusCode === 405 ||
    statusCode === 501 ||
    compactName.includes('notimplemented') ||
    compactName.includes('notsupported') ||
    message.includes('not implemented') ||
    message.includes('not supported') ||
    message.includes('unsupported')
  )
}
