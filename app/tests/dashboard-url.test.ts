import {expect,test} from 'bun:test'
import {compactDashSearch,parseDashSearch} from '../src/lib/range'
test('default dashboard URL has no parameters',()=>{
 expect(Object.keys(compactDashSearch(parseDashSearch({})))).toEqual([])
 expect(Object.keys(compactDashSearch({period:'7d',days:7,from:'2026-09-07',to:'2026-09-13',interval:'day',tab:'overview',source:'',goal:0}))).toEqual([])
})
test('date choices, filters and child tabs survive URL compaction',()=>{
 const input=parseDashSearch({period:'custom',from:'2026-09-01',to:'2026-09-03',country:'CN',interval:'hour'})
 expect(parseDashSearch(compactDashSearch(input))).toEqual(input)
 expect(compactDashSearch({period:'today',source:'Google',tab:'general'})).toEqual({period:'today',source:'Google',tab:'general'})
})
