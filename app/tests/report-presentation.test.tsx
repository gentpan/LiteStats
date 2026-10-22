import {expect, test} from "bun:test"
import {renderToStaticMarkup} from "react-dom/server"
import {ReportValue} from "../src/components/ReportValue"
import {ReportFilter} from "../src/components/ReportFilter"
import {List} from "../src/components/ui"
import {I18nProvider, type Locale} from "../src/lib/i18n"

test("searching details preserves the original percentage and bar scale for every checked dimension", () => {
  for (const [kind, names] of [["source",["Direct","Google"]],["language",["zh-CN","en-US"]],["browser",["Chrome","Safari"]],["os",["Windows","macOS"]]] as const) {
    const rows = [{name:names[0],value:7},{name:names[1],value:3}]
    for (const locale of ["zh-CN","en"] as const) {
      const html = renderToStaticMarkup(<I18nProvider locale={locale}><List plain expanded kind={kind} rows={[rows[1]]} referenceRows={rows}/></I18nProvider>)
      expect(html).toContain(">3</span>")
      expect(html).toContain(">30%</span>")
      expect(html).not.toContain(">100%</span>")
      expect(html).toContain('width:42.857142857142854%')
      expect(rows).toEqual([{name:names[0],value:7},{name:names[1],value:3}])
    }
  }
})

test("shared values render current language names, square flags and original platform icons", () => {
  const render = (locale: Locale, kind: string, name: string, label?: string) => renderToStaticMarkup(<I18nProvider locale={locale}><ReportValue kind={kind} name={name} label={label} wrap/></I18nProvider>)
  expect(render("en","language","zh_cn","中文")).toContain("Chinese")
  expect(render("en","language","zh_cn","中文")).not.toContain("中文")
  expect(render("zh-CN","language","zh_TW")).toContain('/images/flags/1x1/tw.svg')
  expect(render("zh-CN","language","zh_TW")).toContain('lang="en">zh-TW</span>')
  expect(render("zh-CN","source","Direct")).toContain("直接访问")
  expect(render("en","source","Direct")).toContain("Direct traffic")
  expect(render("en","source","Direct")).toContain("fa-arrow-pointer")
  expect(render("en","browser","Chrome")).toContain('/brands/platforms/chrome.svg')
  expect(render("en","os","Windows 11")).toContain('/brands/platforms/windows11.svg')
  expect(render("en","os","(none)")).toContain("Unknown")
  expect(render("zh-CN","browser","(none)")).toContain("未知")
})

test("filter choices reuse report icons and localize an active direct filter even without candidates", () => {
  for (const locale of ["zh-CN","en"] as const) {
    const label = locale === "en" ? "Direct traffic" : "直接访问"
    const direct = renderToStaticMarkup(<I18nProvider locale={locale}><ReportFilter kind="source" options={[{name:"Google"}]} initialValue="Direct" onApply={()=>{}}/></I18nProvider>)
    expect(direct).toContain(`value="${label}"`)
    expect(direct).not.toContain('value="Direct"')
    expect(direct).not.toContain("<datalist")
    for (const [kind,name,icon] of [["source","Direct","fa-arrow-pointer"],["browser","Chrome","/brands/platforms/chrome.svg"],["os","Windows 11","/brands/platforms/windows11.svg"]]) {
      const html = renderToStaticMarkup(<I18nProvider locale={locale}><ReportFilter kind={kind} options={[{name}]} initialValue="" onApply={()=>{}}/></I18nProvider>)
      expect(html).toContain(icon)
    }
  }
})
