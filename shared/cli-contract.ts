export const CLI_API_CONTRACT_VERSION = '1.0.0'
export const MINIMUM_SUPPORTED_CLI_VERSION = '1.0.0'
export const CLI_CAPABILITIES_ROUTE = '/api/cli/capabilities'

export const CLI_RESOURCE_GROUPS = [
  'auth',
  'jobs',
  'candidates',
  'applications',
  'interviews',
  'comments',
  'source-tracking',
  'email-templates',
  'properties',
  'org',
  'calendar',
  'ai-config',
  'dashboard',
  'chatbot',
  'feedback',
  'system',
  'public',
] as const

export type CliResourceGroup = typeof CLI_RESOURCE_GROUPS[number]
