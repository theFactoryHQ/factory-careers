import { describe, expect, it } from 'vitest'
import { isRequiredCustomQuestionAnswered } from '../../shared/custom-question-validation'

describe('required custom question validation', () => {
  it('requires checkbox questions to be checked', () => {
    expect(isRequiredCustomQuestionAnswered('checkbox', true)).toBe(true)
    expect(isRequiredCustomQuestionAnswered('checkbox', false)).toBe(false)
    expect(isRequiredCustomQuestionAnswered('checkbox', undefined)).toBe(false)
  })

  it('treats blank text and empty multi-select answers as unanswered', () => {
    expect(isRequiredCustomQuestionAnswered('short_text', '  ')).toBe(false)
    expect(isRequiredCustomQuestionAnswered('short_text', '5')).toBe(true)
    expect(isRequiredCustomQuestionAnswered('multi_select', [])).toBe(false)
    expect(isRequiredCustomQuestionAnswered('multi_select', ['Vue'])).toBe(true)
  })

  it('validates file upload questions from the uploaded file map', () => {
    expect(isRequiredCustomQuestionAnswered('file_upload', undefined, false)).toBe(false)
    expect(isRequiredCustomQuestionAnswered('file_upload', undefined, true)).toBe(true)
  })
})
