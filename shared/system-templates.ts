export interface SystemTemplate {
  id: string
  purpose: 'interview_invitation' | 'application_acknowledgement' | 'application_rejection'
  name: string
  description: string
  subject: string
  body: string
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: 'system-standard',
    purpose: 'interview_invitation',
    name: 'Standard Interview Invitation',
    description: 'A professional and formal invitation suitable for most interview types.',
    subject: 'Interview Invitation: {{jobTitle}} at {{organizationName}}',
    body: `Dear {{candidateName}},

We are pleased to invite you to an interview for the {{jobTitle}} position at {{organizationName}}.

Interview Details:
- Date: {{interviewDate}}
- Time: {{interviewTime}}
- Duration: {{interviewDuration}} minutes
- Type: {{interviewType}}
- Location: {{interviewLocation}}

Interviewers: {{interviewers}}

Please confirm your availability by replying to this email. If you need to reschedule, let us know as soon as possible.

We look forward to speaking with you!

Best regards,
{{organizationName}}`,
  },
  {
    id: 'system-friendly',
    purpose: 'interview_invitation',
    name: 'Friendly & Casual',
    description: 'A warm, conversational tone that puts candidates at ease.',
    subject: "Let's chat! Interview for {{jobTitle}}",
    body: `Hi {{candidateFirstName}},

Great news — we'd love to meet you for the {{jobTitle}} role at {{organizationName}}!

Here are the details:
- When: {{interviewDate}} at {{interviewTime}} ({{interviewDuration}} min)
- How: {{interviewType}}
- Where: {{interviewLocation}}

You'll be speaking with: {{interviewers}}

If this time doesn't work for you, just let us know and we'll find something that does.

Looking forward to it!

The {{organizationName}} Team`,
  },
  {
    id: 'system-technical',
    purpose: 'interview_invitation',
    name: 'Technical Interview',
    description: 'Tailored for technical interviews with preparation tips for candidates.',
    subject: 'Technical Interview: {{jobTitle}} — {{organizationName}}',
    body: `Dear {{candidateName}},

Thank you for your interest in the {{jobTitle}} position at {{organizationName}}. We'd like to invite you to a technical interview.

Interview Details:
- Title: {{interviewTitle}}
- Date: {{interviewDate}}
- Time: {{interviewTime}}
- Duration: {{interviewDuration}} minutes
- Format: {{interviewType}}
- Location: {{interviewLocation}}

Your interviewer(s): {{interviewers}}

To help you prepare:
- Be ready to discuss your technical experience and problem-solving approach
- You may be asked to write or review code during the session
- Feel free to ask questions about our tech stack and development practices

Please confirm your attendance by replying to this email.

Best regards,
{{organizationName}}`,
  },
  {
    id: 'system-application-acknowledgement',
    purpose: 'application_acknowledgement',
    name: 'Application Acknowledgement',
    description: 'Thanks candidates automatically after they submit an application.',
    subject: 'Application received: {{jobTitle}} at {{organizationName}}',
    body: `Hi {{candidateFirstName}},

Thank you for applying to the {{jobTitle}} role at {{organizationName}}. We received your application on {{applicationDate}}.

Our hiring team will review your materials and follow up if there is a match for the role.

Best regards,
{{organizationName}}`,
  },
  {
    id: 'system-application-rejection',
    purpose: 'application_rejection',
    name: 'Application Rejection',
    description: 'Notifies candidates when the team is not moving forward.',
    subject: 'Update on your {{jobTitle}} application',
    body: `Hi {{candidateFirstName}},

Thank you for your interest in the {{jobTitle}} role at {{organizationName}}.

After reviewing your application, we will not be moving forward at this time. We appreciate the time you took to apply and wish you the best in your search.

Best regards,
{{organizationName}}`,
  },
]
