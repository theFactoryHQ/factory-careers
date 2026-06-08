import type { Command } from 'commander'
import { registerJsonCommand } from '../commandFactories'
import type { CliRuntime } from '../cliRuntime'

export function registerOrgCommands(program: Command, runtime: CliRuntime): Command {
  const org = program
    .command('org')
    .description('Manage organization settings and access')

  registerJsonCommand(runtime, org, {
    name: 'search',
    description: 'Search organizations by slug or name',
    method: 'GET',
    path: (query) => `/api/org-search?q=${encodeURIComponent(query)}`,
    args: [{ name: 'query', description: 'Organization slug or name query' }],
  })

  registerJsonCommand(runtime, org, {
    name: 'settings',
    description: 'Show organization settings',
    method: 'GET',
    path: '/api/org-settings',
  })

  registerJsonCommand(runtime, org, {
    name: 'update-settings',
    description: 'Update organization settings',
    method: 'PATCH',
    path: '/api/org-settings',
    mutation: true,
    stdin: true,
  })

  const inviteLinks = org
    .command('invite-links')
    .description('Manage invite links')

  registerJsonCommand(runtime, inviteLinks, {
    name: 'info',
    description: 'Show public metadata for an invite link token',
    method: 'GET',
    path: (tokenValue) => `/api/invite-links/info/${encodeURIComponent(tokenValue)}`,
    args: [{ name: 'token', description: 'Invite link token' }],
    requireAuth: false,
  })

  registerJsonCommand(runtime, inviteLinks, {
    name: 'list',
    description: 'List invite links',
    method: 'GET',
    path: '/api/invite-links',
  })

  registerJsonCommand(runtime, inviteLinks, {
    name: 'create',
    description: 'Create an invite link',
    method: 'POST',
    path: '/api/invite-links',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, inviteLinks, {
    name: 'accept',
    description: 'Accept an invite link from stdin JSON',
    method: 'POST',
    path: '/api/invite-links/accept',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, inviteLinks, {
    name: 'revoke',
    description: 'Revoke an invite link',
    method: 'DELETE',
    path: (id) => `/api/invite-links/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'Invite link ID' }],
    mutation: true,
  })

  const joinRequests = org
    .command('join-requests')
    .description('Manage join requests')

  registerJsonCommand(runtime, joinRequests, {
    name: 'list',
    description: 'List pending join requests',
    method: 'GET',
    path: '/api/join-requests',
  })

  registerJsonCommand(runtime, joinRequests, {
    name: 'create',
    description: 'Create a request to join an organization',
    method: 'POST',
    path: '/api/join-requests',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, joinRequests, {
    name: 'approve',
    description: 'Approve a join request',
    method: 'POST',
    path: (id) => `/api/join-requests/${encodeURIComponent(id)}/approve`,
    args: [{ name: 'id', description: 'Join request ID' }],
    mutation: true,
  })

  registerJsonCommand(runtime, joinRequests, {
    name: 'reject',
    description: 'Reject a join request',
    method: 'POST',
    path: (id) => `/api/join-requests/${encodeURIComponent(id)}/reject`,
    args: [{ name: 'id', description: 'Join request ID' }],
    mutation: true,
  })

  const ssoProviders = org
    .command('sso-providers')
    .description('Manage organization SSO providers')

  registerJsonCommand(runtime, ssoProviders, {
    name: 'list',
    description: 'List SSO providers',
    method: 'GET',
    path: '/api/sso/providers',
  })

  registerJsonCommand(runtime, ssoProviders, {
    name: 'register',
    description: 'Register an OIDC SSO provider',
    method: 'POST',
    path: '/api/sso/providers',
    mutation: true,
    stdin: true,
  })

  registerJsonCommand(runtime, ssoProviders, {
    name: 'delete',
    description: 'Delete an SSO provider',
    method: 'DELETE',
    path: (id) => `/api/sso/providers/${encodeURIComponent(id)}`,
    args: [{ name: 'id', description: 'SSO provider ID' }],
    alias: 'remove',
    mutation: true,
  })

  return org
}