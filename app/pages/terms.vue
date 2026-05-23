<script setup lang="ts">
definePageMeta({
  layout: 'public',
  publicWide: true,
  publicPinnedNav: true,
  publicFlushTop: true,
})

useSeoMeta({
  title: 'Terms of Service',
  description: 'Terms of Service for Factory Careers.',
  ogTitle: 'Terms of Service - Factory Careers',
  ogDescription: 'Terms governing use of Factory Careers.',
  ogType: 'website',
  robots: 'index, follow',
})

const sections = [
  {
    id: 'acceptance-of-terms',
    title: 'Acceptance of Terms',
    body: [
      'By accessing or using Factory Careers, you agree to these Terms of Service. If you do not agree, do not use the service.',
      'Factory Careers is operated for recruiting, applicant management, and hiring-team collaboration for Factory.',
    ],
  },
  {
    id: 'applicant-submissions',
    title: 'Applicant Submissions',
    body: [
      'You are responsible for the accuracy of the information you submit. Do not submit confidential information from a current or former employer unless you are authorized to do so.',
      'Submitting an application does not guarantee an interview, offer, employment, engagement, or future opportunity.',
    ],
  },
  {
    id: 'staff-accounts',
    title: 'Staff Accounts',
    body: [
      'Staff access is limited to authorized Factory users. You are responsible for keeping your account secure and for activity performed through your account.',
      'Factory may suspend or remove access at any time to protect candidates, staff, systems, or confidential hiring information.',
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable Use',
    body: [
      'You may not use Factory Careers to upload malicious content, violate law, interfere with the service, impersonate another person, or access data you are not authorized to access.',
      'Automated scraping, probing, or abuse of the public application flow is not permitted.',
    ],
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property',
    body: [
      'Factory Careers, including its branding, interface, and content, is owned by Factory or its licensors. You may not copy or reuse it except as permitted by law or with written permission.',
      'You retain ownership of materials you submit, but you grant Factory permission to use them for recruiting, evaluation, compliance, and related hiring purposes.',
    ],
  },
  {
    id: 'third-party-services',
    title: 'Third-Party Services',
    body: [
      'Factory Careers may rely on third-party providers for hosting, storage, email, authentication, analytics, calendar integrations, and related operations. Those services may have their own terms and policies.',
    ],
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: [
      'Factory Careers is provided as is and as available. We do not guarantee that the service will be uninterrupted, error-free, or available at all times.',
      'Job descriptions, role details, and hiring processes may change or be withdrawn at any time.',
    ],
  },
  {
    id: 'limitation-of-liability',
    title: 'Limitation of Liability',
    body: [
      'To the fullest extent permitted by law, Factory will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of Factory Careers.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes',
    body: [
      'We may update these terms from time to time. The updated version will be posted on this page with a revised last updated date.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: [
      'Questions about these Terms of Service can be sent to legal@thefactoryhq.com.',
    ],
  },
]

const tableOfContents = sections.map(({ id, title }) => ({ id, title }))
</script>

<template>
  <FactoryLegalLayout
    title="Terms of Service"
    last-updated="May 22, 2026"
    :sections="sections"
    :table-of-contents="tableOfContents"
  />
</template>
