import {expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'

const appCss=readFileSync(new URL('../src/styles/radius-system.css',import.meta.url),'utf8')
const marketingCss=readFileSync(new URL('../../marketing/styles.css',import.meta.url),'utf8')

test('native squircle uses the original radius with a 0.54 round fallback',()=>{
  for(const css of [appCss,marketingCss]){
    expect(css).toMatch(/@supports \(corner-shape:\s*squircle\)/)
    expect(css).toMatch(/corner-shape:\s*squircle/)
    expect(css).toMatch(/border-radius:[^;]*\.54/)
  }
  expect(appCss).toContain('calc(var(--sq-tl) * .54)')
  expect(marketingCss).toContain('.button.squircle{--sq-r:22px}')
  expect(marketingCss).toContain('.feature-card.squircle{--sq-r:20px}')
})

test('squircle has no SVG, mask, clip-path or JavaScript fallback',()=>{
  expect(appCss).not.toContain('data-sq-painted')
  expect(appCss).not.toContain('clip-path')
  expect(marketingCss).not.toContain('clip-path')
})
