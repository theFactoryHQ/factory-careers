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

export function getChangelogItems(body) {
  const items = []
  let inSupportedSection = false
  let currentItem = null
  let fence = null
  let inHtmlComment = false

  function finishItem() {
    if (!currentItem)
      return

    while (currentItem.length > 1 && currentItem.at(-1).trim() === '')
      currentItem.pop()

    items.push(currentItem.map(line => line.trimEnd()).join('\n'))
    currentItem = null
  }

  function appendToItem(line) {
    if (currentItem)
      currentItem.push(line)
  }

  function updateHtmlCommentState(line) {
    let offset = 0

    while (offset < line.length) {
      if (inHtmlComment) {
        const commentEnd = line.indexOf('-->', offset)
        if (commentEnd === -1)
          return

        inHtmlComment = false
        offset = commentEnd + 3
        continue
      }

      const commentStart = line.indexOf('<!--', offset)
      if (commentStart === -1)
        return

      inHtmlComment = true
      offset = commentStart + 4
    }
  }

  function isFenceEnd(line) {
    const trimmed = line.trim()
    return trimmed.length >= fence.length && [...trimmed].every(character => character === fence.marker)
  }

  for (const line of normalizeNewlines(body).split('\n')) {
    if (fence) {
      appendToItem(line)
      if (isFenceEnd(line))
        fence = null
      continue
    }

    if (inHtmlComment) {
      appendToItem(line)
      updateHtmlCommentState(line)
      continue
    }

    const section = line.match(/^###\s+(.+?)\s*$/)
    if (section) {
      finishItem()
      inSupportedSection = changelogSections.has(section[1])
      continue
    }

    const item = inSupportedSection ? line.match(/^[-*][ \t]+(\S.*)$/) : null
    if (item) {
      finishItem()
      currentItem = [item[1].trim()]
      updateHtmlCommentState(line)
      continue
    }

    const fenceStart = line.match(/^[ \t]*(`{3,}|~{3,}).*$/)
    if (fenceStart) {
      appendToItem(line)
      fence = {
        marker: fenceStart[1][0],
        length: fenceStart[1].length,
      }
      continue
    }

    appendToItem(line)
    updateHtmlCommentState(line)
  }

  finishItem()

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

function findReleaseVersionClaims(raw, version) {
  const escapedVersion = escapeRegExp(version)
  const normalized = normalizeNewlines(raw)
  return [...normalized.matchAll(new RegExp(`^ {0,3}##[ \\t]+\\[${escapedVersion}\\].*$`, 'gm'))]
}

export function hasReleaseVersionClaim(raw, version) {
  return findReleaseVersionClaims(raw, version).length > 0
}

export function getUnreleasedItems(raw) {
  const normalized = normalizeNewlines(raw)
  const headings = [...normalized.matchAll(/^## Unreleased$/gm)]

  if (headings.length === 0)
    throw new Error('CHANGELOG.md must contain an exact ## Unreleased heading')
  if (headings.length > 1)
    throw new Error('CHANGELOG.md must contain exactly one ## Unreleased heading')

  const heading = headings[0]
  return getChangelogItems(getBodyAfterHeading(normalized, heading.index + heading[0].length))
}

export function getReleaseNotes(raw, version) {
  const escapedVersion = escapeRegExp(version)
  const heading = `## \\[${escapedVersion}\\]\\(https://github\\.com/theFactoryHQ/factory-careers/releases/tag/v${escapedVersion}\\) \\((\\d{4}-\\d{2}-\\d{2})\\)`
  const normalized = normalizeNewlines(raw)
  const claims = findReleaseVersionClaims(normalized, version)

  if (claims.length > 1)
    throw new Error(`CHANGELOG.md must contain exactly one Factory release section claim for v${version}`)

  const claim = claims[0]
  if (claim) {
    const match = new RegExp(`^${heading}$`).exec(claim[0])
    if (match && isRealDate(match[1]))
      return getBodyAfterHeading(normalized, claim.index + claim[0].length)
  }

  throw new Error(`CHANGELOG.md must contain a matching Factory release section for v${version}`)
}

export function hasChangelogItem(body) {
  return getChangelogItems(normalizeNewlines(body)).length > 0
}
