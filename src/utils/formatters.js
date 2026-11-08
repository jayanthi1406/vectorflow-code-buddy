export function formatCurrency(amount, currency = 'INR', locale = 'en-IN') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount ?? 0)
}

export function formatDuration(seconds = 0) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  if (minutes && remainder) return `${minutes} min ${remainder} sec`
  if (minutes) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  return `${remainder} ${remainder === 1 ? 'second' : 'seconds'}`
}

export function formatClock(seconds = 0) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
