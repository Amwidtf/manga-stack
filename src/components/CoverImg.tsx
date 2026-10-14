import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { evictCachedImage } from '@/lib/cache'

interface Props {
  src: string | null
  /** 封面缺失/加载失败时用名称填充占位，避免裂图观感 */
  title?: string
  className?: string
  eager?: boolean
}

// 封面偶发加载失败多为瞬时网络抖动，一次失败就定格占位会让用户以为封面丢了
const MAX_RETRY = 2

export function CoverImg({ src, title, className, eager }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [prevSrc, setPrevSrc] = useState(src)
  const retryTimer = useRef<number | undefined>(undefined)

  // 组件复用于不同封面时（列表项复用等）在渲染期同步回到初始态；
  // 此时若有未触发的重试定时器，放任其触发也只是一次多余的重挂载，卸载时统一清理
  if (prevSrc !== src) {
    setPrevSrc(src)
    setLoaded(false)
    setError(false)
    setAttempt(0)
  }
  // 卸载时清理重试定时器（effect 内不含 setState，规避 set-state-in-effect）
  useEffect(() => () => {
    if (retryTimer.current !== undefined) clearTimeout(retryTimer.current)
  }, [])

  const handleError = () => {
    // 失败可能是瞬时抖动，也可能是 SW 缓存里的坏响应（不透明响应看不到状态码）：
    // 先清掉该 URL 的缓存再重试，保证下一次请求重新走网络；重试用尽才定格占位
    if (src) void evictCachedImage(src)
    if (attempt < MAX_RETRY) {
      retryTimer.current = window.setTimeout(() => setAttempt((a) => a + 1), 700)
    } else {
      setError(true)
    }
  }

  return (
    <div className={cn('relative overflow-hidden bg-secondary', className)}>
      {src && !error ? (
        <img
          key={attempt}
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className={cn(
            'h-full w-full object-cover transition-all duration-[400ms] ease-[cubic-bezier(0.15,0,0.45,1)]',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
          draggable={false}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center overflow-hidden p-2">
          <span className="line-clamp-5 break-words text-center text-xs font-medium leading-relaxed text-muted-foreground/75">
            {title}
          </span>
        </div>
      )}
    </div>
  )
}
