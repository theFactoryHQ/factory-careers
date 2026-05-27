export type CustomQuestionResponseValue = string | string[] | number | boolean | null | undefined

export function isRequiredCustomQuestionAnswered(
  questionType: string,
  value: CustomQuestionResponseValue,
  hasUploadedFile = false,
): boolean {
  if (questionType === 'file_upload') return hasUploadedFile
  if (questionType === 'checkbox') return value === true
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0

  return value !== undefined && value !== null
}
