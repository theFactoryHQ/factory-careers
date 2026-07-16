const changelogSections = new Set(['Added', 'Changed', 'Fixed', 'Removed'])

function normalizeNewlines(raw) {
  return raw.replace(/\r\n/g, '\n')
}

function getBodyAfterHeading(raw, headingEnd) {
  const bodyStart = raw[headingEnd] === '\n' ? headingEnd + 1 : headingEnd
  const remaining = raw.slice(bodyStart)
  const nextSection = /^##\s+\S.*$/m.exec(remaining)
  return remaining.slice(0, nextSection?.index ?? remaining.length).trim()
}

function getSectionBody(raw, heading) {
  const normalized = normalizeNewlines(raw)
  const match = new RegExp(`^${heading}$`, 'm').exec(normalized)

  if (!match)
    return null

  return getBodyAfterHeading(normalized, match.index + match[0].length)
}

function getChangelogItems(body) {
  const items = []
  let inSupportedSection = false

  for (const line of body.split('\n')) {
    const section = line.match(/^###\s+(.+?)\s*$/)
    if (section) {
      inSupportedSection = changelogSections.has(section[1])
      continue
    }

    const item = inSupportedSection ? line.match(/^\s*[-*]\s+(\S.*)$/) : null
    if (item)
      items.push(item[1].trim())
  }

  return items
}

function isRealDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false

  const parsed = new Date(`${date}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function getUnreleasedItems(raw) {
  const body = getSectionBody(raw, '## Unreleased')
  if (body === null)
    throw new Error('CHANGELOG.md must contain an exact ## Unreleased heading')

  return getChangelogItems(body)
}

export function getReleaseNotes(raw, version) {
  const escapedVersion = escapeRegExp(version)
  const heading = `## \\[${escapedVersion}\\]\\(https://github\\.com/theFactoryHQ/factory-careers/releases/tag/v${escapedVersion}\\) \\((\\d{4}-\\d{2}-\\d{2})\\)`
  const normalized = normalizeNewlines(raw)

  for (const match of normalized.matchAll(new RegExp(`^${heading}$`, 'gm'))) {
    if (!isRealDate(match[1]))
      continue

    return getBodyAfterHeading(normalized, match.index + match[0].length)
  }

  throw new Error(`CHANGELOG.md must contain a matching Factory release section for v${version}`)
}

export function hasChangelogItem(body) {
  return getChangelogItems(normalizeNewlines(body)).length > 0
}
