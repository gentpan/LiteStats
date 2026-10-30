// Prefer familiar representatives. Keep the stored zone when it shares an offset,
// so simplifying the picker never changes an existing site's DST rules.
const REPRESENTATIVES = [
  'Etc/GMT+12', 'Pacific/Pago_Pago', 'Pacific/Honolulu', 'Pacific/Marquesas',
  'America/Anchorage', 'America/Los_Angeles', 'America/Denver', 'America/Chicago',
  'America/New_York', 'America/Caracas', 'America/St_Johns', 'America/Sao_Paulo',
  'Atlantic/South_Georgia', 'Atlantic/Cape_Verde', 'UTC', 'Europe/Paris',
  'Africa/Cairo', 'Europe/Moscow', 'Asia/Tehran', 'Asia/Dubai', 'Asia/Kabul',
  'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Yangon',
  'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Darwin',
  'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Lord_Howe',
  'Pacific/Noumea', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Tongatapu',
  'Pacific/Kiritimati',
]

export function timezoneOptions(current?: string, now = new Date()) {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const offsets = new Map<number, {value:string;label:string}>()
  for (const value of [...(current ? [current] : []), ...REPRESENTATIVES, ...all]) {
    try {
      const offset = new Intl.DateTimeFormat('en-US', {timeZone:value,timeZoneName:'longOffset'}).formatToParts(now).find(part=>part.type==='timeZoneName')?.value || 'GMT'
      const match = offset.match(/GMT([+-])(\d{2}):(\d{2})/)
      const minutes = match ? (match[1] === '-' ? -1 : 1) * (Number(match[2])*60+Number(match[3])) : 0
      if(!offsets.has(minutes)) offsets.set(minutes,{value,label:`(${offset.replace('GMT','UTC')}) ${value}`})
    } catch { /* Ignore time zones unsupported by this runtime. */ }
  }
  return [...offsets.entries()].sort(([a],[b])=>a-b).map(([,option])=>option)
}
