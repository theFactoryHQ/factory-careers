import { eq } from 'drizzle-orm'
import { privacyRequest } from '../../database/schema'
import { sendPrivacyRequestConfirmationEmail } from '../../utils/email'
import { verifyPrivacyRequestQuerySchema } from '../../utils/schemas/privacyRequest'
import { hashPrivacyRequestToken, verifyPrivacyRequestToken } from '../../utils/privacyRequests'

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, verifyPrivacyRequestQuerySchema.parse)
  const tokenHash = hashPrivacyRequestToken(query.token)

  const request = await db.query.privacyRequest.findFirst({
    where: eq(privacyRequest.verificationTokenHash, tokenHash),
  })

  if (request && verifyPrivacyRequestToken(query.token, request.verificationTokenHash) && !request.verifiedAt) {
    await db.update(privacyRequest)
      .set({
        status: request.status === 'submitted' ? 'verified' : request.status,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(privacyRequest.id, request.id))

    void sendPrivacyRequestConfirmationEmail({
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail,
    })
  }

  return {
    success: true,
    message: 'If the verification link is valid, your privacy request has been verified for review.',
  }
})
