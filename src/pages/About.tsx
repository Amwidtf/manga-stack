import { useNavigate } from 'react-router'
import { ArrowLeft, ShieldCheck, Info } from 'lucide-react'
import { APP_VERSION, APP_BUILD } from '@/lib/appmeta'

export default function AboutPage() {
  const navigate = useNavigate()
  // 与源浏览页一致：浏览器栈里有上一页就 pop 回设置页，栈空兜底 replace
  const back = () => {
    const st = window.history.state as { idx?: number } | null
    if (typeof st?.idx === 'number' && st.idx > 0) navigate(-1)
    else navigate('/settings', { replace: true })
  }

  return (
    <div className="fade-in mx-auto max-w-2xl px-4 pb-10 pt-5 lg:px-8 lg:pt-8">
      <div className="flex items-center gap-1">
        <button
          onClick={back}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full hover:bg-accent lg:hidden"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">关于</h1>
      </div>

      <div className="mt-5 flex items-center justify-between rounded-2xl border border-border/70 bg-card/50 p-4">
        <span className="flex items-center gap-2.5 font-medium">
          <img src="./favicon.png" alt="" className="h-8 w-8 rounded-lg" />
          <span>
            漫栈 MangaStack
            <span className="block text-xs font-normal text-muted-foreground">订阅式漫画阅读器</span>
          </span>
        </span>
        <span className="font-display text-xs tabular-nums text-muted-foreground">
          v{APP_VERSION}（构建 {APP_BUILD}）
        </span>
      </div>

      <Section title="权限说明" icon={<ShieldCheck className="h-4 w-4" />}>
        <ul className="list-inside space-y-1">
          <li>· 网络访问（必需）：访问你自行启用的源站、封面与章节图片，以及检查更新。</li>
          <li>· 安装未知来源应用（可选）：仅在你主动使用「内置更新」时用于安装下载完成的更新包，可随时在系统设置中关闭。</li>
          <li>
            · 不申请定位、通讯录、相册、麦克风、相机、通知等任何敏感权限；漫画缓存与安装包保存在应用私有目录，无需存储权限，卸载即自动删除。
          </li>
        </ul>
      </Section>

      <Section title="内容来源声明">
        <p>
          本应用是一款技术工具，自身不生产、不存储、不分发任何漫画内容，默认不内置任何可用内容源。所有漫画数据均来自用户自行启用的第三方公开源站，内容的合法性、准确性与版权归相应源站及原作者所有。请用户遵守所在地区的法律法规，支持正版，在合理范围内使用。
        </p>
      </Section>

      <Section title="隐私政策">
        <p>
          本应用不注册账号、无广告、无埋点统计，不收集任何个人身份信息。订阅、阅读进度、设置与下载缓存仅保存在本机存储中，不会上传至任何服务器；卸载应用或清除应用数据后即彻底删除。应用仅在用户主动浏览时访问所配置源站及其图片服务器，以及在用户主动检查更新时访问软件发布页。
        </p>
      </Section>

      <Section title="免责声明">
        <p>
          本应用按“现状”提供，仅供学习与技术交流使用。第三方源站的可用性、内容与本应用无关；若相关源站或版权方认为内容侵权，请联系相应源站处理。用户因使用本应用访问第三方内容产生的一切法律责任由用户自行承担。请于体验后
          24 小时内删除相关内容，并通过正版渠道支持喜欢的作品。
        </p>
      </Section>

      <Section title="开源软件">
        <p>
          本应用基于 React、Vite、Tailwind CSS、Capacitor
          等开源软件构建，感谢各开源社区；各组件版权归其作者所有，遵循其原始许可协议。
        </p>
      </Section>

      <div className="mt-6 flex gap-2.5 text-xs text-muted-foreground/70">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>漫画版权归原作者与出版社所有，喜欢请支持正版。</p>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-card/50 p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}
