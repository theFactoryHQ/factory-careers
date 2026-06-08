import type { Component } from 'vue'
import {
  Building2, Users, UserCircle, Plug, Brain, ShieldCheck, Globe, FileCheck2,
} from 'lucide-vue-next'

export type SettingsNavItem = {
  label: string
  /** Shorter label for the mobile tab strip. Falls back to `label`. */
  mobileLabel?: string
  description: string
  to: string
  icon: Component
  exact: boolean
  badge?: string
}

export const settingsNavItems: SettingsNavItem[] = [
  {
    label: 'General',
    description: 'Organization profile',
    to: '/dashboard/settings',
    icon: Building2,
    exact: true,
  },
  {
    label: 'Localization',
    description: 'Names & date formats',
    to: '/dashboard/settings/localization',
    icon: Globe,
    exact: true,
  },
  {
    label: 'Members',
    description: 'Team & invitations',
    to: '/dashboard/settings/members',
    icon: Users,
    exact: true,
  },
  {
    label: 'Integrations',
    description: 'Calendar & services',
    to: '/dashboard/settings/integrations',
    icon: Plug,
    exact: true,
  },
  {
    label: 'AI Configuration',
    mobileLabel: 'AI',
    description: 'Models & API keys',
    to: '/dashboard/settings/ai',
    icon: Brain,
    exact: true,
  },
  {
    label: 'Single Sign-On',
    mobileLabel: 'SSO',
    description: 'Enterprise SSO',
    to: '/dashboard/settings/sso',
    icon: ShieldCheck,
    exact: true,
  },
  {
    label: 'Privacy Requests',
    mobileLabel: 'Privacy',
    description: 'Deletion reviews',
    to: '/dashboard/settings/privacy-requests',
    icon: FileCheck2,
    exact: true,
  },
  {
    label: 'Account',
    description: 'Profile & security',
    to: '/dashboard/settings/account',
    icon: UserCircle,
    exact: true,
  },
]

export function filterVisibleSettingsNav(
  items: SettingsNavItem[],
  languageFeatureEnabled: boolean,
) {
  return items.filter((item) => languageFeatureEnabled || item.to !== '/dashboard/settings/localization')
}

export function settingsNavMobileLabel(item: SettingsNavItem) {
  return item.mobileLabel ?? item.label
}