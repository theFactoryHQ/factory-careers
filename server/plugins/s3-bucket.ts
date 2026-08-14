/**
 * Ensures the S3 bucket exists and is configured as private on startup.
 * Runs after migrations plugin. Idempotent — safe to run repeatedly.
 *
 * On managed providers (AWS S3 and similar), buckets are pre-provisioned
 * and always private — bucket creation and policy management are skipped.
 * This is detected via S3_FORCE_PATH_STYLE=false (managed providers use
 * virtual-hosted-style URLs).
 */
export default defineNitroPlugin(async () => {
  // Skip during build-time prerendering — S3 isn't available
  if (import.meta.prerender) return

  resetDependencyReadiness('storage')

  if (env.S3_SKIP_BUCKET_INIT) {
    if (env.NODE_ENV === 'production') throw new Error('Production storage readiness cannot be skipped')
    console.log(`[Factory Careers] S3 bucket initialization skipped`)
    logInfo('s3.bucket_init_skipped', { bucket: env.S3_BUCKET })
    markDependencyReady('storage')
    return
  }

  try {
    if (env.S3_FORCE_PATH_STYLE) await ensureBucketExists()
    await probeStorageReadiness({
      put: (key, signal) => uploadToS3(key, Buffer.from('ready'), 'application/octet-stream', { abortSignal: signal }),
      head: (key, signal) => objectExistsInS3(key, { abortSignal: signal }),
      remove: (key, signal) => deleteFromS3(key, { abortSignal: signal }),
    })
    markDependencyReady('storage')
    console.log(`[Factory Careers] S3 bucket "${env.S3_BUCKET}" is ready`)
    logInfo('s3.bucket_ready', { bucket: env.S3_BUCKET })
  } catch (error) {
    markDependencyFailed('storage', error)
    console.error('[Factory Careers] Storage readiness verification failed')
    logError('s3.bucket_init_failed', {
      bucket: env.S3_BUCKET,
      error_name: error instanceof Error ? error.name : 'UnknownError',
    })
    await sendCriticalOperationalAlert('storage.startup_failed')
    throw error
  }
})
