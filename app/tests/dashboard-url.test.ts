import {expect,test} from 'bun:test'
import {compactDashSearch,parseDashSearch,rangeFromSearch,compareRange} from '../src/lib/range'
test('default dashboard URL has no parameters',()=>{
 expect(Object.keys(compactDashSearch(parseDashSearch({})))).toEqual([])
 expect(parseDashSearch({}).period).toBe('24h')
 expect(parseDashSearch({}).interval).toBe('hour')
 expect(rangeFromSearch({}).from).toBe('last24h')
 expect(compareRange(rangeFromSearch({})).from).toBe('last24h-prev')
 expect(compactDashSearch({period:'7d',days:7,from:'2026-09-07',to:'2026-09-13',interval:'day',tab:'overview',source:'',goal:0})).toMatchObject({period:'7d'})
 expect(parseDashSearch(compactDashSearch(parseDashSearch({period:'7d'}))).period).toBe('7d')
})
test('date choices, filters and child tabs survive URL compaction',()=>{
 const input=parseDashSearch({period:'custom',from:'2026-09-01',to:'2026-09-03',country:'CN',interval:'hour'})
 expect(parseDashSearch(compactDashSearch(input))).toEqual(input)
 expect(compactDashSearch({period:'today',source:'Google',tab:'general'})).toEqual({period:'today',source:'Google',tab:'general'})
})
