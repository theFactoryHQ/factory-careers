export const SCORING_CRITERION_CATEGORIES = [
  'technical',
  'experience',
  'soft_skills',
  'education',
  'culture',
  'custom',
] as const

export type ScoringCriterionCategory = typeof SCORING_CRITERION_CATEGORIES[number]

export const PREMADE_CRITERIA_TEMPLATE_KEYS = [
  'standard',
  'technical',
  'non_technical',
] as const

export type PremadeCriteriaTemplateKey = typeof PREMADE_CRITERIA_TEMPLATE_KEYS[number]

export interface PremadeScoringCriterion {
  key: string
  name: string
  description: string
  category: ScoringCriterionCategory
  maxScore: number
  weight: number
}

export const PREMADE_CRITERIA = {
  standard: [
    {
      key: 'technical_skills',
      name: 'Technical Skills',
      description: 'Evaluate the candidate\'s technical competencies, tools, programming languages, and frameworks mentioned in their resume against the job requirements.',
      category: 'technical',
      maxScore: 10,
      weight: 50,
    },
    {
      key: 'relevant_experience',
      name: 'Relevant Experience',
      description: 'Assess years and quality of experience directly relevant to the role. Consider industry, company size, and scope of responsibilities.',
      category: 'experience',
      maxScore: 10,
      weight: 50,
    },
    {
      key: 'education_fit',
      name: 'Education & Certifications',
      description: 'Evaluate educational background and professional certifications relevant to the position requirements.',
      category: 'education',
      maxScore: 10,
      weight: 30,
    },
  ],
  technical: [
    {
      key: 'core_tech_stack',
      name: 'Core Tech Stack Match',
      description: 'How well the candidate\'s technical skills match the primary technologies required for this role.',
      category: 'technical',
      maxScore: 10,
      weight: 70,
    },
    {
      key: 'system_design',
      name: 'System Design & Architecture',
      description: 'Evidence of system design experience, scalability thinking, and architectural decision-making.',
      category: 'technical',
      maxScore: 10,
      weight: 50,
    },
    {
      key: 'engineering_practices',
      name: 'Engineering Practices',
      description: 'Testing, CI/CD, code review, documentation, and software development lifecycle experience.',
      category: 'technical',
      maxScore: 10,
      weight: 40,
    },
    {
      key: 'relevant_experience',
      name: 'Relevant Experience',
      description: 'Years and depth of experience in similar roles, projects, or domains.',
      category: 'experience',
      maxScore: 10,
      weight: 50,
    },
    {
      key: 'leadership_collab',
      name: 'Leadership & Collaboration',
      description: 'Evidence of mentoring, tech leadership, cross-team collaboration, and communication skills.',
      category: 'soft_skills',
      maxScore: 10,
      weight: 30,
    },
  ],
  non_technical: [
    {
      key: 'relevant_experience',
      name: 'Relevant Experience',
      description: 'Depth and breadth of experience directly applicable to the role responsibilities.',
      category: 'experience',
      maxScore: 10,
      weight: 60,
    },
    {
      key: 'communication',
      name: 'Communication Skills',
      description: 'Evidence of written and verbal communication ability from resume quality, cover letter, and described accomplishments.',
      category: 'soft_skills',
      maxScore: 10,
      weight: 50,
    },
    {
      key: 'domain_knowledge',
      name: 'Domain Knowledge',
      description: 'Relevant industry or domain expertise that demonstrates understanding of the business context.',
      category: 'experience',
      maxScore: 10,
      weight: 40,
    },
    {
      key: 'education_fit',
      name: 'Education & Certifications',
      description: 'Educational background and certifications relevant to the position.',
      category: 'education',
      maxScore: 10,
      weight: 30,
    },
    {
      key: 'culture_fit',
      name: 'Culture & Values Alignment',
      description: 'Indicators of alignment with company values, work style, and team culture based on career trajectory and interests.',
      category: 'culture',
      maxScore: 10,
      weight: 30,
    },
  ],
} satisfies Record<PremadeCriteriaTemplateKey, PremadeScoringCriterion[]>

export function clonePremadeCriteria(
  template: PremadeCriteriaTemplateKey,
): PremadeScoringCriterion[] {
  return structuredClone(PREMADE_CRITERIA[template])
}
