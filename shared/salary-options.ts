export const SALARY_UNIT_VALUES = ['YEAR', 'MONTH', 'HOUR'] as const

export type SalaryUnitValue = typeof SALARY_UNIT_VALUES[number]

export const SALARY_UNIT_OPTIONS = [
  { value: 'YEAR', label: 'Per year' },
  { value: 'MONTH', label: 'Per month' },
  { value: 'HOUR', label: 'Per hour' },
]
