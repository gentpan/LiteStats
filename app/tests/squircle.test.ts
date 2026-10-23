import {expect,test} from 'bun:test'
import {squirclePath} from '../src/lib/squircle'
const points = (path:string) => [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m=>[Number(m[1]),Number(m[2])])
test('corners follow a fourth-power superellipse instead of a circular radius',()=>{
  const ps=points(squirclePath(400,40,[18,18,18,18]))
  for(const [x,y] of ps.slice(1,34)) expect(Math.abs(((x-382)/18)**4+((y-18)/18)**4-1)).toBeLessThan(.001)
  const [x,y]=ps[17]
  expect(x).toBeGreaterThan(382+18*.8)
  expect(y).toBeLessThan(18-18*.8)
})
test('large radii fit narrow controls and joined corners stay square',()=>{
  for(const [w,h] of [[32,32],[10,8],[448,330],[1200,800]]){
    const ps=points(squirclePath(w,h,[22,22,0,0]))
    expect(ps.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<=w&&y<=h)).toBe(true)
    expect(ps.some(([x,y])=>x===w&&y===h)).toBe(true)
    expect(ps.some(([x,y])=>x===0&&y===h)).toBe(true)
  }
})
test('inset borders stay inside the original surface',()=>{
  expect(points(squirclePath(80,40,[18,18,18,18],1)).every(([x,y])=>x>=1&&y>=1&&x<=79&&y<=39)).toBe(true)
})
