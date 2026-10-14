import { NavLink, Outlet } from 'react-router'
import { Library, Compass, History, Settings, Moon, Sun } from 'lucide-react'
import { useLibrary, useSettings } from '@/lib/store'
import { LOCAL_SOURCE_ID } from '@/lib/local/model'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: '书架', icon: Library, end: true },
  { to: '/browse', label: '发现', icon: Compass },
  { to: '/history', label: '历史', icon: History },
  { to: '/settings', label: '设置', icon: Settings },
]

function Logo() {
  return (
    <div className="flex items-baseline gap-2 select-none">
      <span className="text-xl font-bold tracking-tight">
        漫<span className="text-primary">栈</span>
      </span>
      <span className="font-display text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
        MangaStack
      </span>
    </div>
  )
}

function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useSettings()
  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className
      )}
      aria-label="切换主题"
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" strokeWidth={1.75} /> : <Moon className="h-5 w-5" strokeWidth={1.75} />}
    </button>
  )
}

export default function AppShell() {
  const onlineEnabled = useSettings((s) => s.onlineEnabled)
  const totalUnread = Object.values(useLibrary((s) => s.subs)).reduce(
    (a, b) => a + (onlineEnabled || b.manga.source === LOCAL_SOURCE_ID ? b.unread : 0),
    0
  )
  const enabledCount = useSettings((s) => s.sourceConfigs.filter((c) => c.enabled).length)
  const navItems = onlineEnabled ? NAV : NAV.filter((n) => n.to !== '/browse')

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col border-r border-border/70 bg-background lg:flex">
        <div className="px-6 pt-8 pb-10">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors',
                  isActive
                    ? 'bg-accent font-semibold text-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.25 : 1.75} />
                  <span>{label}</span>
                  {label === '书架' && totalUnread > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between px-5 py-5">
          {onlineEnabled ? (
            <span className="text-xs text-muted-foreground/60 font-display tracking-widest uppercase">
              {enabledCount > 0 ? `Sources · ${enabledCount}` : 'No Source'}
            </span>
          ) : (
            <span />
          )}
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="glass safe-t sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/50 px-4 lg:hidden">
        <Logo />
        <ThemeToggle />
      </header>

      {/* Content */}
      <main className="pb-32 lg:pb-10 lg:pl-[232px]">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav
        className={cn('glass fixed inset-x-0 bottom-0 z-40 grid border-t border-border/50 lg:hidden', navItems.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.25 : 1.75} />
                  {label === '书架' && totalUnread > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                      {totalUnread > 99 ? '99' : totalUnread}
                    </span>
                  )}
                </span>
                <span className={cn(isActive && 'font-semibold')}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
