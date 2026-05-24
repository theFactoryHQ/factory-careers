export const CURRENCY_VALUES = [
  'USD',
  'CAD',
  'EUR',
  'GBP',
  'AUD',
  'NZD',
  'NOK',
  'SEK',
  'DKK',
  'CHF',
  'JPY',
  'SGD',
  'MXN',
] as const

const CURRENCY_LABELS: Record<typeof CURRENCY_VALUES[number], string> = {
  USD: 'USD - US Dollar',
  CAD: 'CAD - Canadian Dollar',
  EUR: 'EUR - Euro',
  GBP: 'GBP - British Pound',
  AUD: 'AUD - Australian Dollar',
  NZD: 'NZD - New Zealand Dollar',
  NOK: 'NOK - Norwegian Krone',
  SEK: 'SEK - Swedish Krona',
  DKK: 'DKK - Danish Krone',
  CHF: 'CHF - Swiss Franc',
  JPY: 'JPY - Japanese Yen',
  SGD: 'SGD - Singapore Dollar',
  MXN: 'MXN - Mexican Peso',
}

export const CURRENCY_OPTIONS = CURRENCY_VALUES.map((value) => ({
  value,
  label: CURRENCY_LABELS[value],
}))
