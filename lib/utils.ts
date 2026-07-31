export function formatDate(date: Date | string) {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (days === 1) return 'Вчера'
  if (days < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function generateUsername(email: string): string {
  const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  const suffix = Math.random().toString(36).substring(2, 6)
  return `${prefix}_${suffix}`
}

export function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

export function formatLastSeen(date: Date | string) {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'был(а) только что'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `был(а) ${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `был(а) ${hours} ч назад`
  return `был(а) ${formatDate(d)}`
}
