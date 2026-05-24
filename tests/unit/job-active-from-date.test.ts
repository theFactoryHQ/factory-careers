import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('job active-from date', () => {
  it('stores and validates an active-from date for jobs', () => {
    const schema = readProjectFile('server/database/schema/app.ts')
    const validation = readProjectFile('server/utils/schemas/job.ts')
    const post = readProjectFile('server/api/jobs/index.post.ts')
    const get = readProjectFile('server/api/jobs/[id].get.ts')
    const patch = readProjectFile('server/api/jobs/[id].patch.ts')

    expect(schema).toContain("activeFrom: timestamp('active_from').notNull().defaultNow()")
    expect(validation).toContain('activeFrom: z.coerce.date().optional().default(() => new Date())')
    expect(validation).toContain('activeFrom: z.coerce.date().optional()')
    expect(post).toContain('activeFrom: body.activeFrom')
    expect(get).toContain('activeFrom: true')
    expect(patch).toContain('activeFrom: job.activeFrom')
  })

  it('shows active-from in the application form and defaults new jobs to today', () => {
    const applicationForm = readProjectFile('app/pages/dashboard/jobs/[id]/application-form.vue')
    const newJob = readProjectFile('app/pages/dashboard/jobs/new.vue')
    const useJobs = readProjectFile('app/composables/useJobs.ts')

    expect(applicationForm).toContain('Active From')
    expect(applicationForm).toContain('id="application-active-from"')
    expect(applicationForm).toContain('activeFrom: todayDateInputValue()')
    expect(applicationForm).toContain('activeFrom: j.activeFrom ? toDateInputValue(j.activeFrom) : todayDateInputValue()')
    expect(applicationForm).toContain('activeFrom: form.value.activeFrom ? new Date(form.value.activeFrom) : new Date(todayDateInputValue())')
    expect(newJob).toContain('activeFrom: todayDateInputValue()')
    expect(newJob).toContain('activeFrom: form.value.activeFrom ? new Date(form.value.activeFrom) : new Date(todayDateInputValue())')
    expect(useJobs).toContain('activeFrom?: Date')
  })

  it('uses active-from for public visibility and posted dates', () => {
    const publicList = readProjectFile('server/api/public/jobs/index.get.ts')
    const publicDetail = readProjectFile('server/api/public/jobs/[slug].get.ts')
    const publicApply = readProjectFile('server/api/public/jobs/[slug]/apply.post.ts')
    const publicIndexPage = readProjectFile('app/pages/jobs/index.vue')
    const publicJobPage = readProjectFile('app/pages/jobs/[slug]/index.vue')
    const migration = readProjectFile('server/database/migrations/0038_job_active_from.sql')
    const journal = readProjectFile('server/database/migrations/meta/_journal.json')

    expect(publicList).toContain('lte(job.activeFrom, new Date())')
    expect(publicList).toContain('orderBy: [includeActiveFrom ? desc(job.activeFrom) : desc(job.createdAt)]')
    expect(publicList).toContain('activeFrom: true')
    expect(publicList).toContain('isMissingActiveFromColumn')
    expect(publicList).toContain('activeFrom: j.activeFrom ?? j.createdAt')
    expect(publicDetail).toContain('lte(job.activeFrom, new Date())')
    expect(publicDetail).toContain('activeFrom: true')
    expect(publicApply).toContain('lte(job.activeFrom, new Date())')
    expect(publicIndexPage).toContain('formatPostedDate(j.activeFrom, j.createdAt)')
    expect(publicJobPage).toContain("'datePosted': j.activeFrom ?? j.createdAt")
    expect(publicJobPage).toContain(':datetime="job.activeFrom ?? job.createdAt"')
    expect(migration).toContain('ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "active_from" timestamp')
    expect(journal).toContain('"tag": "0038_job_active_from"')
  })
})
