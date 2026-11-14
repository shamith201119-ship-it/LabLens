export function getActiveNavId(pathname: string): string {
  if (pathname === '/app') return 'overview'
  if (pathname === '/app/settings') return 'settings'
  if (pathname === '/app/history') return 'history'
  if (pathname === '/app/upload' || pathname === '/app/reports/new') return 'new'
  if (pathname.startsWith('/app/reports')) return 'reports'
  return ''
}
