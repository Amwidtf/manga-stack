import { Link } from 'react-router'
import { sourceName, type NManga } from '@/lib/sources'
import { CoverImg } from './CoverImg'
import { cn } from '@/lib/utils'

interface Props {
  manga: NManga
  badge?: number
  subtitle?: string
  className?: string
}

export function MangaCard({ manga, badge, subtitle, className }: Props) {
  return (
    <Link to={`/manga/${manga.key}`} className={cn('group block focus:outline-none', className)}>
      <div className="relative">
        <CoverImg
          src={manga.cover}
          title={manga.title}
          className="aspect-[2/3] w-full rounded-xl cover-shadow ring-1 ring-foreground/5 transition-transform duration-[400ms] ease-[cubic-bezier(0.15,0,0.45,1)] group-hover:scale-[1.03]"
        />
        {/* source badge: subscriptions can mix sources, keep provenance visible */}
        <span className="absolute bottom-1.5 left-1.5 max-w-[85%] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
          {sourceName(manga.source)}
        </span>
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <div className="mt-2.5 space-y-0.5 px-0.5">
        <p className="line-clamp-2 text-[13px] font-medium leading-snug group-hover:text-primary transition-colors">
          {manga.title}
        </p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{subtitle ?? manga.author ?? '\u00A0'}</p>
      </div>
    </Link>
  )
}
