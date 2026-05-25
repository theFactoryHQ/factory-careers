<script setup lang="ts">
definePageMeta({
  layout: 'public',
  publicWide: true,
  publicPinnedNav: true,
  publicFlushTop: true,
})

useSeoMeta({
  title: 'Privacy Policy',
  description: 'Privacy Policy for Factory Careers.',
  ogTitle: 'Privacy Policy - Factory Careers',
  ogDescription: 'How Factory Careers collects, uses, and protects applicant and staff information.',
  ogType: 'website',
  robots: 'index, follow',
})

const sections = [
  {
    id: 'information-we-collect',
    title: 'Information We Collect',
    body: [
      'When you apply for a role, we collect the information you submit, such as your name, email address, resume, portfolio links, location, responses to application questions, source tracking details, and related communications.',
      'For staff users, we collect account information needed to operate the hiring dashboard, including identity data from Microsoft SSO, role permissions, activity logs, and calendar or interview metadata when integrations are enabled.',
    ],
  },
  {
    id: 'how-we-use-information',
    title: 'How We Use Information',
    body: [
      'We use applicant information to evaluate applications, manage interviews, communicate about opportunities, maintain candidate records, and improve the hiring process.',
      'We use staff account information to authenticate users, secure the service, audit important changes, and provide recruiting workflow features.',
    ],
  },
  {
    id: 'how-we-share-information',
    title: 'How We Share Information',
    body: [
      'We share applicant information with Factory team members and service providers who help us operate Factory Careers, such as hosting, storage, email, analytics, calendar, and authentication providers.',
      'We do not sell applicant personal information. We may disclose information if required by law, to protect our rights, or in connection with a corporate transaction.',
    ],
  },
  {
    id: 'storage-and-security',
    title: 'Storage and Security',
    body: [
      'Applicant documents are stored in private storage and are only available through authenticated staff workflows. We use administrative, technical, and organizational safeguards designed to protect information.',
      'No internet service can be guaranteed to be perfectly secure, but we limit access to hiring information to authorized users and operational providers.',
    ],
  },
  {
    id: 'retention',
    title: 'Retention',
    body: [
      'We keep applicant information for as long as needed for hiring, talent pool, compliance, and business purposes. You may contact us to request deletion or correction of your information, subject to legal and operational limits.',
    ],
  },
  {
    id: 'your-choices',
    title: 'Your Choices and CCPA Rights',
    body: [
      {
        parts: [
          { text: 'California residents may have rights under the California Consumer Privacy Act (CCPA), including the right to request access, correction, deletion, or restriction of personal information. You may ' },
          { text: 'submit a deletion request', href: '/privacy/delete-request' },
          { text: '. Some requests require email verification before we can act on them.' },
        ],
      },
      'If you receive hiring emails from us, you can reply to the message or contact us directly to update your communication preferences.',
    ],
  },
  {
    id: 'cookies-and-analytics',
    title: 'Cookies and Analytics',
    body: [
      'Factory Careers may use essential cookies for authentication and security. We may also use privacy-conscious analytics to understand product usage and improve the site.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [
      {
        parts: [
          { text: 'Questions about this Privacy Policy or Factory Careers privacy practices can be sent to ' },
          { text: 'legal@thefactoryhq.com', href: 'mailto:legal@thefactoryhq.com' },
          { text: '.' },
        ],
      },
    ],
  },
]

const tableOfContents = sections.map(({ id, title }) => ({ id, title }))
</script>

<template>
  <FactoryLegalLayout
    title="Privacy Policy"
    last-updated="May 22, 2026"
    :sections="sections"
    :table-of-contents="tableOfContents"
  />
</template>
