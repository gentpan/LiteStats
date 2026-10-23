/** CSS squircle = superellipse(2), i.e. x^4 + y^4 = r^4. */
export function squirclePath(width: number, height: number, corners: number[], inset = 0) {
  const w = Math.max(0, width - inset * 2), h = Math.max(0, height - inset * 2)
  const r = corners.map(value => Math.max(0, value - inset))
  const scale = Math.min(1, w / (r[0] + r[1] || 1), w / (r[2] + r[3] || 1), h / (r[0] + r[3] || 1), h / (r[1] + r[2] || 1))
  const radii = r.map(value => value * scale)
  const number = (v: number) => (v + inset).toFixed(3)
  let path = `M${number(radii[0])},${number(0)}`
  // Clockwise quarter-superellipses; sample in angle space, never stretch corners.
  const centers = [[w-radii[1],radii[1]], [w-radii[2],h-radii[2]], [radii[3],h-radii[3]], [radii[0],radii[0]]]
  for (let corner = 0; corner < 4; corner++) {
    const radius = radii[(corner + 1) % 4], [cx,cy] = centers[corner]
    for (let step = 0; step <= 32; step++) {
      const angle = -Math.PI / 2 + corner * Math.PI / 2 + step / 32 * Math.PI / 2
      const cos = Math.cos(angle), sin = Math.sin(angle)
      const x = cx + radius * Math.sign(cos) * Math.sqrt(Math.abs(cos))
      const y = cy + radius * Math.sign(sin) * Math.sqrt(Math.abs(sin))
      path += `L${number(x)},${number(y)}`
    }
  }
  return path + 'Z'
}

const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!))

/** Paint only the surface: descendants, popovers and native form behavior stay intact. */
export function startSquircleFallback(force = false) {
  if (!force && CSS.supports('corner-shape', 'squircle')) return () => {}
  const elements = new Set<HTMLElement>(), written = new WeakMap<HTMLElement,string>()
  let frame = 0
  const paint = (el: HTMLElement) => {
    const transition = el.style.getPropertyValue('transition'), priority = el.style.getPropertyPriority('transition')
    el.style.setProperty('transition','none','important')
    el.removeAttribute('data-sq-painted')
    const restoreTransition = () => transition ? el.style.setProperty('transition',transition,priority) : el.style.removeProperty('transition')
    const style = getComputedStyle(el), width = el.offsetWidth, height = el.offsetHeight
    if (!width || !height) { restoreTransition(); return }
    const corners = [style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(value => parseFloat(value) || 0)
    const widths = [style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth].map(value => parseFloat(value) || 0)
    const colors = [style.borderTopColor,style.borderRightColor,style.borderBottomColor,style.borderLeftColor]
    const outline = el.matches(':focus-visible') && style.outlineStyle !== 'none' ? parseFloat(style.outlineWidth) || 0 : 0
    const triangles = [`M0,0H${width}L${width/2},${height/2}Z`,`M${width},0V${height}L${width/2},${height/2}Z`,`M${width},${height}H0L${width/2},${height/2}Z`,`M0,${height}V0L${width/2},${height/2}Z`]
    const borders = widths.map((border,index) => border ? `<clipPath id="side${index}"><path d="${triangles[index]}"/></clipPath><path clip-path="url(#side${index})" d="${squirclePath(width,height,corners,border/2)}" fill="none" stroke="${escapeXml(colors[index])}" stroke-width="${border}"/>` : '').join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${squirclePath(width,height,corners)}" fill="${escapeXml(style.backgroundColor)}"/>${borders}${outline ? `<path d="${squirclePath(width,height,corners,outline/2)}" fill="none" stroke="${escapeXml(style.outlineColor)}" stroke-width="${outline}"/>` : ''}</svg>`
    const image = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    el.style.setProperty('--sq-images', `${style.backgroundImage},${image}`)
    for (const [key,value] of [['size',style.backgroundSize],['position',style.backgroundPosition],['repeat',style.backgroundRepeat],['origin',style.backgroundOrigin],['clip',style.backgroundClip]]) {
      const last = {size:'100% 100%',position:'0 0',repeat:'no-repeat',origin:'border-box',clip:'border-box'}[key]!
      el.style.setProperty(`--sq-image-${key}`,`${value},${last}`)
    }
    // Clip native control/autofill painting and media, never container descendants.
    if (el.matches('img,video,canvas,input,textarea,button,select')) el.style.setProperty('--sq-content-clip',`path('${squirclePath(width,height,corners)}')`)
    el.setAttribute('data-sq-painted','')
    restoreTransition()
    written.set(el,el.getAttribute('style') || '')
  }
  const update = () => {
    frame = 0
    document.querySelectorAll<HTMLElement>('.squircle').forEach(el => {
      if (!elements.has(el)) { elements.add(el); resize.observe(el) }
    })
    for (const el of elements) {
      if (!el.isConnected || !el.matches('.squircle')) {
        resize.unobserve(el); elements.delete(el); el.removeAttribute('data-sq-painted')
      } else paint(el)
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
  const resize = new ResizeObserver(schedule)
  const changes = new MutationObserver(records => {
    if (records.some(record => record.type === 'childList' || record.attributeName !== 'style' || record.target instanceof HTMLElement && written.get(record.target) !== record.target.getAttribute('style'))) schedule()
  })
  changes.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','disabled','data-theme','data-accent','data-radius','aria-pressed','aria-expanded']})
  const events = ['pointerover','pointerout','pointerdown','pointerup','focusin','focusout','transitionend','animationend']
  for (const name of events) document.addEventListener(name,schedule,true)
  update()
  return () => {
    changes.disconnect(); resize.disconnect(); cancelAnimationFrame(frame)
    for (const name of events) document.removeEventListener(name,schedule,true)
    for (const el of elements) {
      el.removeAttribute('data-sq-painted')
      for (const key of ['--sq-images','--sq-content-clip',...['size','position','repeat','origin','clip'].map(key => `--sq-image-${key}`)]) el.style.removeProperty(key)
    }
  }
}
