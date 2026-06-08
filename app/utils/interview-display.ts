export const INTERVIEW_TYPE_LABELS: Record<string, string> = {
  phone: 'Phone',
  video: 'Video',
  in_person: 'In-person',
  panel: 'Panel',
  technical: 'Technical',
  take_home: 'Take-home',
}

export function formatInterviewDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatInterviewStatusLabel(status: string) {
  return status === 'no_show' ? 'No show' : status
}