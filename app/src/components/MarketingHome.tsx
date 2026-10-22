import { useId, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { BrandMark } from "./BrandMark"
import { UIIcon } from "./UIIcon"
import { useT } from "~/lib/i18n"

const repository = "https://github.com/gentpan/LiteStats"

/** Public, illustrative content only: this page never loads site or visitor data. */
export function MarketingHome() {
  const {locale, setLocale} = useT()
  const c = (zh: string, en: string) => locale === "en" ? en : zh
  const [menu, setMenu] = useState(false)
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const features = [
    ["activity", c("流量，一目了然", "Traffic, at a glance"), c("访客、会话、浏览量和访问趋势。用清晰的指标，看懂网站每天的变化。", "Visitors, sessions, pageviews and trends. Clear metrics make daily changes easy to understand.")],
    ["globe", c("找到流量的来处", "Know where people come from"), c("从引荐来源到 UTM 活动，从国家地区到设备，了解谁在访问你的网站。", "Explore referrers, UTM campaigns, countries and devices to understand your audience.")],
    ["eye", c("看见受欢迎的内容", "See what resonates"), c("热门页面、进入页、退出页与页面标题，把注意力放在真正被浏览的内容上。", "Popular pages, entry pages, exit pages and titles help you focus on the content people actually visit.")],
    ["clock", c("跟上正在发生的事", "Keep up with the moment"), c("查看实时访问、最近访客与自定义事件，在活动日志里了解每一次互动。", "Follow live traffic, recent visitors and custom events, with interaction details in the activity log.")],
    ["search", c("搜索词，多一种视角", "Another view of search"), c("连接 Google Search Console 或 Bing 查看汇总关键词，也支持 CSV 导入与 AI SEO 建议。", "Connect Google Search Console or Bing for aggregated queries, or bring CSV reports and request AI SEO suggestions.")],
    ["shield", c("顺手检查网站状态", "A little peace of mind"), c("可选的 HTTP 可用性、域名与 SSL 到期检查，与你的流量统计放在一起。", "Optional HTTP availability, domain expiry and SSL certificate checks, alongside your analytics.")],
  ]
  return <div className="landing">
    <a className="landing-skip" href="#main-content">{c("跳到正文", "Skip to content")}</a>
    <header className="landing-header" onKeyDown={event => {if (event.key === "Escape" && menu) {setMenu(false); menuTrigger.current?.focus()}}}>
      <div className="landing-container landing-header-inner">
        <Link to="/" className="landing-brand" aria-label="LiteStats"><BrandMark/></Link>
        <nav className="landing-nav" aria-label={c("官网导航", "Main navigation")}>
          <a href="#features">{c("功能", "Features")}</a><a href="#privacy">{c("隐私与自托管", "Privacy & hosting")}</a><a href="#start">{c("开始使用", "Get started")}</a>
        </nav>
        <div className="landing-header-actions">
          <button type="button" className="landing-language" onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")} aria-label={c("Switch to English", "切换到中文")}>{locale === "en" ? "中" : "EN"}</button>
          <Link to="/dashboard" className="landing-console">{c("进入后台", "Dashboard")}<UIIcon name="arrow"/></Link>
          <button ref={menuTrigger} type="button" className="landing-menu-trigger" aria-label={menu ? c("关闭导航", "Close navigation") : c("打开导航", "Open navigation")} aria-expanded={menu} aria-controls="landing-mobile-menu" onClick={() => setMenu(value => !value)}><UIIcon name={menu ? "close" : "list"}/></button>
        </div>
        {menu ? <nav id="landing-mobile-menu" className="landing-mobile-menu" aria-label={c("手机导航", "Mobile navigation")} onClick={() => setMenu(false)}><a href="#features">{c("功能", "Features")}</a><a href="#privacy">{c("隐私与自托管", "Privacy & hosting")}</a><a href="#start">{c("开始使用", "Get started")}</a></nav> : null}
      </div>
    </header>
    <main id="main-content">
      <section className="landing-hero landing-container" aria-labelledby="hero-title">
        <p className="landing-eyebrow"><span/>{c("开源 · 自托管 · 简单好用", "OPEN SOURCE · SELF-HOSTED · SIMPLE")}</p>
        <h1 id="hero-title">{c("看清网站的每一次成长。", "A clearer view of your website.")}<br/><span>{c("让统计，回归简单。", "Analytics, made simple.")}</span></h1>
        <p className="landing-hero-description">{c("了解访客从哪里来、喜欢什么、正在做什么。", "Understand where visitors come from, what they enjoy and what they do.")}<br className="landing-desktop-break"/>{c("LiteStats 用轻盈的界面，让你专注网站本身。", "A lightweight experience that keeps the focus on your website.")}</p>
        <div className="landing-hero-actions"><Link to="/register" className="landing-button landing-button-primary">{c("开始使用 LiteStats", "Get started with LiteStats")}<UIIcon name="arrow"/></Link><a href="#preview" className="landing-button landing-button-secondary">{c("看看产品演示", "Explore the preview")}<UIIcon name="chevron-down"/></a></div>
        <div className="landing-hero-notes"><span><UIIcon name="check"/>{c("无 Cookie 访客采集", "Cookie-free visitor tracking")}</span><span><UIIcon name="check"/>{c("数据自己掌握", "Your data, your control")}</span><a href={repository} target="_blank" rel="noreferrer"><UIIcon name="code"/>{c("代码公开可查", "Open source on GitHub")}</a></div>
      </section>
      <section id="preview" className="landing-container landing-preview-section" aria-label={c("产品演示", "Product preview")}>
        <div className="landing-preview-glow" aria-hidden="true"/>
        <ProductPreview/>
        <p className="landing-demo-note">{c("交互演示 · 仅为示例数据，不读取任何真实站点。", "Interactive preview · Illustrative data only. No real website data is loaded.")}</p>
      </section>
      <section id="features" className="landing-container landing-features" aria-labelledby="features-title">
        <div className="landing-section-heading"><p className="landing-kicker">{c("少一点复杂，多一点清晰", "LESS NOISE, MORE CLARITY")}</p><h2 id="features-title">{c("你关心的，刚刚好都有。", "The things you care about. All here.")}</h2><p>{c("从一次访问，到一个有用的决定。无需在繁杂的报表里寻找答案。", "From a visit to a useful decision, without getting lost in a sea of reports.")}</p></div>
        <div className="landing-feature-grid">{features.map(([icon, title, text]) => <article key={icon}><span className="landing-feature-icon"><UIIcon name={icon}/></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        <p className="landing-feature-footnote">{c("搜索平台提供汇总搜索词，不对应每位访客；Google、Bing 与 AI 功能需配置相应服务。", "Search platforms provide aggregated queries, not an individual visitor’s searches. Google, Bing and AI features require their respective integrations.")}</p>
      </section>
      <section id="privacy" className="landing-container landing-privacy" aria-labelledby="privacy-title">
        <div className="landing-privacy-copy"><p className="landing-kicker">{c("数据在哪里，你说了算", "YOUR DATA, ON YOUR TERMS")}</p><h2 id="privacy-title">{c("你的网站。", "Your website.")}<br/>{c("你的数据。你的选择。", "Your data. Your choice.")}</h2><p>{c("把 LiteStats 部署在自己的服务器上，让数据留在自己的 PostgreSQL 和 ClickHouse 里。简单的统计，也应该有清晰的边界。", "Run LiteStats on your own server and keep your data in your PostgreSQL and ClickHouse databases. Simple analytics should come with clear boundaries.")}</p><a className="landing-text-link" href={repository} target="_blank" rel="noreferrer">{c("了解开源项目", "Explore the source")}<UIIcon name="external"/></a></div>
        <div className="landing-privacy-points">
          <article><UIIcon name="shield"/><div><h3>{c("不使用追踪 Cookie", "No tracking cookies")}</h3><p>{c("访客采集不写入追踪 Cookie，也不依赖浏览器 Cookie 来识别访问。", "Visitor tracking works without writing or relying on tracking cookies.")}</p></div></article>
          <article><UIIcon name="lock"/><div><h3>{c("访问权限自己设置", "Access you control")}</h3><p>{c("按站点管理访问权限，按需开启公开访问或创建分享链接。", "Manage access per website, make a site public when needed, or create a share link.")}</p></div></article>
          <article><UIIcon name="cloud"/><div><h3>{c("备份也有自己的去处", "Backups with a home")}</h3><p>{c("支持 R2 与 S3，测试存储连接、安排定时备份，在需要时恢复。", "Connect R2 or S3, test your storage, schedule backups and restore when needed.")}</p></div></article>
        </div>
      </section>
      <section id="start" className="landing-container landing-start" aria-labelledby="start-title">
        <div className="landing-section-heading"><p className="landing-kicker">{c("从这里开始", "A SIMPLE START")}</p><h2 id="start-title">{c("三步，让数据开口说话。", "Three steps to a clearer picture.")}</h2></div>
        <ol className="landing-steps"><li><span>01</span><h3>{c("部署并创建账号", "Deploy and create an account")}</h3><p>{c("按照开源文档部署实例；已有实例，直接注册或登录。", "Follow the open-source setup guide, or sign up and log in to an existing instance.")}</p></li><li><span>02</span><h3>{c("添加你的网站", "Add your website")}</h3><p>{c("填写域名，复制站点专属的轻量追踪脚本。", "Enter your domain and copy the lightweight tracker for your website.")}</p></li><li><span>03</span><h3>{c("开始了解你的访客", "Meet your audience")}</h3><p>{c("将脚本加入网页，收到访问后，就能在后台查看统计。", "Add the script to your pages. Your dashboard fills as visits arrive.")}</p></li></ol>
        <div className="landing-get-started"><Link to="/register" className="landing-button landing-button-primary">{c("创建账号", "Create an account")}<UIIcon name="arrow"/></Link><a href={repository + "#快速开始"} className="landing-text-link" target="_blank" rel="noreferrer">{c("查看部署文档", "Read the setup guide")}<UIIcon name="external"/></a></div>
      </section>
      <section className="landing-final"><div className="landing-container"><BrandMark/><h2>{c("少看复杂报表，多做喜欢的事。", "Less time in reports. More time creating.")}</h2><p>{c("让 LiteStats 帮你看清网站，下一步，由你决定。", "Let LiteStats bring your website into focus. The next step is yours.")}</p><Link to="/dashboard" className="landing-button landing-button-primary">{c("进入统计后台", "Open the dashboard")}<UIIcon name="arrow"/></Link></div></section>
    </main>
    <footer className="landing-footer landing-container"><span>© {new Date().getFullYear()} LiteStats</span><p>{c("轻量统计，数据自己掌握。", "Lightweight analytics. Your data stays yours.")}</p><div><a href={repository} target="_blank" rel="noreferrer">GitHub<UIIcon name="external"/></a><Link to="/login">{c("登录", "Log in")}</Link><a href="#main-content">{c("回到顶部", "Back to top")}<UIIcon name="chevron-up"/></a></div></footer>
  </div>
}

function ProductPreview() {
  const {locale} = useT()
  const c = (zh: string, en: string) => locale === "en" ? en : zh
  const [tab, setTab] = useState("overview")
  const [period, setPeriod] = useState("7")
  const graphId = useId().replace(/:/g, "")
  const tabs = [["overview", c("流量概览", "Overview")], ["sources", c("流量来源", "Sources")], ["pages", c("热门页面", "Pages")]]
  const sources = [["Google", 48], [c("直接访问", "Direct traffic"), 28], ["GitHub", 14], ["Bing", 7], [c("其他来源", "Other"), 3]] as const
  const pages = [["/", 52], ["/docs", 24], ["/blog", 14], ["/pricing", 7], ["/about", 3]] as const
  const rows = tab === "pages" ? pages : sources
  const points = period === "7" ? [48, 46, 51, 41, 49, 42, 40, 44, 31, 35, 42, 29, 31, 34, 24, 28, 21, 24, 17, 26, 22, 11, 17, 13, 18, 8, 16, 12, 5] : [53, 47, 51, 43, 46, 37, 43, 38, 45, 31, 36, 33, 22, 29, 20, 26, 18, 23, 15, 22, 13, 17, 10, 15, 7, 14, 8, 11, 3]
  const days = period === "7" ? [1, 2, 3, 4, 5, 6, 7] : [1, 6, 12, 18, 24, 30]
  const line = points.map((y, i) => (i ? "L" : "M") + (i * (720 / (points.length - 1))) + "," + (y * 2)).join(" ")
  return <div className="landing-product-preview">
    <div className="landing-preview-top"><div className="landing-demo-site"><span className="landing-demo-site-icon"><UIIcon name="globe"/></span><strong>your-site.com</strong></div><span className="landing-example-badge">{c("示例数据", "DEMO DATA")}</span><div className="landing-demo-period" role="group" aria-label={c("演示时间范围", "Preview date range")}>{["7", "30"].map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{c("近 " + value + " 天", "Last " + value + " days")}</button>)}</div></div>
    <div className="landing-demo-tabs" role="group" aria-label={c("演示报表", "Preview reports")}>{tabs.map(([id, label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div className="landing-demo-metrics"><div><span>{c("独立访客", "Visitors")}</span><strong>{period === "7" ? "12,804" : "48,216"}</strong><small><UIIcon name="arrow-up-right"/>18.6%</small></div><div><span>{c("页面浏览量", "Pageviews")}</span><strong>{period === "7" ? "28,672" : "96,542"}</strong><small><UIIcon name="arrow-up-right"/>24.2%</small></div><div><span>{c("跳出率", "Bounce rate")}</span><strong>{period === "7" ? "42%" : "38%"}</strong><small className="landing-demo-neutral">{c("示例指标", "Illustrative metric")}</small></div><div><span>{c("平均访问时长", "Average visit")}</span><strong>{period === "7" ? "2m 34s" : "2m 48s"}</strong><small className="landing-demo-neutral">{c("示例指标", "Illustrative metric")}</small></div></div>
    {tab === "overview" ? <div className="landing-demo-chart"><div><h3>{c("访问趋势", "Visitor trend")}</h3><span><i/>{c("独立访客", "Visitors")}</span></div><svg viewBox="0 0 720 142" role="img" aria-label={c("使用示例数据展示的访客趋势", "Visitor trend using illustrative data")} preserveAspectRatio="none"><defs><linearGradient id={graphId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent-color)" stopOpacity=".17"/><stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0"/></linearGradient></defs>{[20, 60, 100, 140].map(y => <line key={y} x1="0" y1={y} x2="720" y2={y} stroke="var(--landing-border)" strokeDasharray="3 5"/>)}<path d={line + " L720,142 L0,142 Z"} fill={"url(#" + graphId + ")"}/><path d={line} fill="none" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg><div className="landing-demo-axis">{days.map(day => <span key={day}>{c("第 " + day + " 天", "Day " + day)}</span>)}</div></div> : <div className="landing-demo-report" aria-live="polite"><div className="landing-demo-table-heading"><span>{tab === "pages" ? c("页面", "Page") : c("来源", "Source")}</span><span>{c("访客占比", "Visitor share")}</span></div>{rows.map(([label, value]) => <div className="landing-demo-report-row" key={label}><span><UIIcon name={tab === "pages" ? "code" : "link"}/>{label}</span><div><span style={{width: value + "%"}}/></div><strong>{value}%</strong></div>)}</div>}
    <div className="landing-demo-bottom"><div><span>{c("主要来源", "TOP SOURCE")}</span><strong><UIIcon name="brand-google"/> Google</strong></div><div><span>{c("热门页面", "TOP PAGE")}</span><strong>/</strong></div><div><span>{c("桌面设备", "DESKTOP")}</span><strong><UIIcon name="device-desktop"/> 68%</strong></div><div><span>{c("当前访客", "LIVE VISITORS")}</span><strong><i className="landing-live-dot"/>24</strong></div></div>
  </div>
}
