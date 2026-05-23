import { describe, expect, it } from 'vitest'
import { isUnsupportedBucketPolicyError } from '../../server/utils/s3'

function s3Error(name: string, message: string, statusCode?: number): Error {
  const error = new Error(message)
  error.name = name
  return Object.assign(error, {
    $metadata: statusCode ? { httpStatusCode: statusCode } : undefined,
  })
}

describe('S3 bucket policy unsupported error detection', () => {
  it('recognizes tokenized unsupported and not-implemented errors', () => {
    expect(isUnsupportedBucketPolicyError(s3Error('NotSupported', 'operation failed'))).toBe(true)
    expect(isUnsupportedBucketPolicyError(s3Error('NotImplemented', 'operation failed'))).toBe(true)
    expect(isUnsupportedBucketPolicyError(s3Error('S3Error', 'Bucket policy is unsupported'))).toBe(true)
  })

  it('does not swallow generic bad-request S3 failures', () => {
    expect(isUnsupportedBucketPolicyError(s3Error('InvalidAccessKeyId', 'bad credentials', 400))).toBe(false)
    expect(isUnsupportedBucketPolicyError(s3Error('SignatureDoesNotMatch', 'bad signature', 400))).toBe(false)
  })

  it('treats provider-level unsupported HTTP statuses as unsupported', () => {
    expect(isUnsupportedBucketPolicyError(s3Error('S3Error', 'method unavailable', 405))).toBe(true)
    expect(isUnsupportedBucketPolicyError(s3Error('S3Error', 'not implemented by provider', 501))).toBe(true)
  })
})
