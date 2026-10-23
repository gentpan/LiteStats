import {expect,test} from "bun:test"
import {chineseCityName} from "../src/lib/city-names.server"
import {reportValueLabel,reportSearchText,resolveReportFilter} from "../src/lib/report-values"

test("historical and provider city names resolve within country and province", () => {
  for (const [country,name,region,expected] of [
    ["CN","Suzhou","JS","苏州市"],["CN","Suzhou","AH","宿州市"],
    ["CN","Shenzhen","GD","深圳"],["CN","Jining","SD","济宁市"],
    ["US","Los Angeles","CA","洛杉矶"],["UZ","Tashkent","TK","塔什干"],
    ["US","Mountain View","California","芒廷维尤"],
    ["CN","南京","江苏省","南京"],["CA","維多利亞市","BC","维多利亚市"],
  ]) expect(chineseCityName(country!,name!,region!)).toBe(expected!)
  expect(chineseCityName("CN","Jilin","JL")).not.toBe("吉林省")
})

test("GeoNames IDs are country scoped; unresolvable cities never leak English", () => {
  expect(chineseCityName("US","5809844")).toBe("西雅图")
  expect(chineseCityName("CN","5809844")).toBe("暂无中文名称")
  const label=chineseCityName("US","Unknown hamlet","CA")
  expect(reportValueLabel("city","Unknown hamlet","zh-CN",label,"US")).toBe("美国 · 暂无中文名称")
})

test("translated display leaves historical keys, English and visitor totals intact", () => {
  const row={name:"Tashkent",code:"UZ",value:326,label:chineseCityName("UZ","Tashkent","TK")}
  expect(reportValueLabel("city",row.name,"zh-CN",row.label,row.code)).toBe("乌兹别克斯坦 · 塔什干")
  expect(reportValueLabel("city",row.name,"en",row.label,row.code)).toBe("Uzbekistan · Tashkent")
  expect(reportSearchText("city",row,"zh-CN")).toContain("Tashkent")
  expect(reportSearchText("city",row,"zh-CN")).toContain("塔什干")
  expect(resolveReportFilter("city","乌兹别克斯坦 · 塔什干",[row],"zh-CN")).toBe("Tashkent")
  expect(row).toMatchObject({name:"Tashkent",value:326})
})
