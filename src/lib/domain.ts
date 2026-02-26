export const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]

export const toHostWildcard = (domain: string) => `*://${domain}/*`

export const nowPlusMinutes = (minutes: number) => Date.now() + minutes * 60_000

export const formatDueDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
