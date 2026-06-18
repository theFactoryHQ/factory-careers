type PublicSalaryFields = {
  salaryDisplayOnListing?: boolean | null
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  salaryUnit?: string | null
  salaryNegotiable?: boolean | null
}

export function stripSalaryForHiddenListing<T extends PublicSalaryFields>(job: T): T {
  if (job.salaryDisplayOnListing) return job

  return {
    ...job,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryUnit: null,
    salaryNegotiable: false,
  }
}
