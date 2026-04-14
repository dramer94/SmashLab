import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const COUNTRY_FLAGS: Record<string, string> = {
  MAS: '🇲🇾', DEN: '🇩🇰', THA: '🇹🇭', CHN: '🇨🇳', INA: '🇮🇩',
  JPN: '🇯🇵', SGP: '🇸🇬', TPE: '🇹🇼', KOR: '🇰🇷', IND: '🇮🇳',
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', GER: '🇩🇪', FRA: '🇫🇷', AUS: '🇦🇺', CAN: '🇨🇦',
  USA: '🇺🇸', NED: '🇳🇱', HKG: '🇭🇰', VIE: '🇻🇳', PHI: '🇵🇭',
  MYA: '🇲🇲', SRI: '🇱🇰', PAK: '🇵🇰', BAN: '🇧🇩', NZL: '🇳🇿',
  RSA: '🇿🇦', ESP: '🇪🇸', SUI: '🇨🇭', SWE: '🇸🇪', POL: '🇵🇱',
  SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', IRL: '🇮🇪', WAL: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', BEL: '🇧🇪', RUS: '🇷🇺',
  UKR: '🇺🇦', BUL: '🇧🇬', ROU: '🇷🇴', CZE: '🇨🇿', SVK: '🇸🇰',
  HUN: '🇭🇺', AUT: '🇦🇹', SLO: '🇸🇮', CRO: '🇭🇷', SRB: '🇷🇸',
  NOR: '🇳🇴', FIN: '🇫🇮', POR: '🇵🇹', ITA: '🇮🇹', GBR: '🇬🇧',
  MEX: '🇲🇽', BRA: '🇧🇷', ARG: '🇦🇷', CHI: '🇨🇱', PER: '🇵🇪',
  COL: '🇨🇴', ECU: '🇪🇨', GUA: '🇬🇹', PAN: '🇵🇦', MRI: '🇲🇺',
  NGR: '🇳🇬', KEN: '🇰🇪', EGY: '🇪🇬', TUN: '🇹🇳', MGL: '🇲🇳',
  KAZ: '🇰🇿', UZB: '🇺🇿', GEO: '🇬🇪', ARM: '🇦🇲', IRN: '🇮🇷',
  QAT: '🇶🇦', UAE: '🇦🇪', JOR: '🇯🇴', KUW: '🇰🇼',
}

export function getFlag(country: string): string {
  return COUNTRY_FLAGS[country] || country
}

export function formatDate(
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }
): string {
  return new Date(date).toLocaleDateString('en-US', options)
}
