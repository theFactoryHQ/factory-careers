import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
}))

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()

  return {
    ...original,
    S3Client: class {
      send = sendMock
    },
  }
})

vi.stubGlobal('env', {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
  S3_FORCE_PATH_STYLE: true,
  S3_BUCKET: 'test-bucket',
})

const { objectExistsInS3 } = await import('../../server/utils/s3')

function s3Error(name: string, message: string, statusCode?: number): Error {
  const error = new Error(message)
  error.name = name
  return Object.assign(error, {
    $metadata: statusCode === undefined ? undefined : { httpStatusCode: statusCode },
  })
}

describe('S3 object presence', () => {
  beforeEach(() => {
    sendMock.mockReset()
    vi.mocked(globalThis.logWarn).mockClear()
    vi.mocked(globalThis.logError).mockClear()
  })

  it('returns true when HeadObject succeeds', async () => {
    sendMock.mockResolvedValueOnce({ ContentLength: 42 })

    await expect(objectExistsInS3('organization/document.pdf')).resolves.toBe(true)

    const command = sendMock.mock.calls[0]?.[0]
    expect(command?.constructor.name).toBe('HeadObjectCommand')
    expect(command?.input).toEqual({
      Bucket: 'test-bucket',
      Key: 'organization/document.pdf',
    })
  })

  it('passes an abort signal to the storage request', async () => {
    sendMock.mockResolvedValueOnce({ ContentLength: 42 })
    const controller = new AbortController()

    await objectExistsInS3('organization/document.pdf', { abortSignal: controller.signal })

    expect(sendMock).toHaveBeenCalledWith(expect.anything(), {
      abortSignal: controller.signal,
    })
  })

  it.each([
    s3Error('S3Error', 'missing', 404),
    s3Error('NoSuchKey', 'missing'),
    s3Error('NotFound', 'missing'),
  ])('returns false only for a confirmed absent object', async (error) => {
    sendMock.mockRejectedValueOnce(error)

    await expect(objectExistsInS3('organization/document.pdf')).resolves.toBe(false)
  })

  it.each([
    s3Error('AccessDenied', 'object not found or access denied', 403),
    s3Error('NoSuchBucket', 'storage bucket does not exist', 404),
    s3Error('InternalError', 'provider unavailable', 500),
    s3Error('TimeoutError', 'socket timed out'),
    s3Error('NotFoundException', 'unknown provider error'),
    { message: 'unknown non-Error rejection' },
  ])('rethrows failures that do not prove absence without logging sensitive context', async (error) => {
    sendMock.mockRejectedValueOnce(error)

    await expect(objectExistsInS3('organization/document.pdf')).rejects.toBe(error)
    expect(globalThis.logWarn).not.toHaveBeenCalled()
    expect(globalThis.logError).not.toHaveBeenCalled()
  })
})
