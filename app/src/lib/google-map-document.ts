import { googleMapStyles } from "./google-map-styles"
import type { GoogleStyle } from "./map-options"
export type MapPoint = { code: string, name: string, count: number, percent: string, lat: number, lng: number }

// srcdoc gives each site its own Maps loader, so keys never carry across sites.
export function googleMapDocument(config: { apiKey: string, style?: GoogleStyle, locale: string, dark: boolean, origin: string, points: MapPoint[] }) {
  const data = JSON.stringify({...config, styles:googleMapStyles(config.style || "auto",config.dark)}).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>.gm-style button,.mapboxgl-ctrl-group{border-radius:8px!important}
html,body,#map{height:100%;width:100%;margin:0;background:${config.dark ? "#242630" : "#eef8f8"};font-family:system-ui,sans-serif}
.flag{position:absolute;transform:translate(-50%,-100%);display:flex;align-items:center;gap:5px;border:0;border-radius:0;padding:0;background:transparent;color:${config.dark ? "#f4f5f8" : "#252936"};box-shadow:none;cursor:pointer;font:600 11px system-ui}.flag img{width:25px;height:18px;object-fit:cover}.flag:hover{z-index:100}.flag:focus-visible{z-index:100;outline:2px solid #6366f1;outline-offset:3px}
</style></head><body><div id="map"></div><script>
const config=${data};
const notify=(type,code)=>parent.postMessage({source:'litestats-google-map',type,code},config.origin);
window.gm_authFailure=()=>notify('error');
window.initLiteMap=()=>{try {
const styles=config.styles;
const map=new google.maps.Map(document.getElementById('map'),{center:{lat:25,lng:145},zoom:2,minZoom:1,maxZoom:7,renderingType:google.maps.RenderingType.RASTER,styles,streetViewControl:false,mapTypeControl:false,fullscreenControl:true,gestureHandling:'cooperative'});
class Flag extends google.maps.OverlayView {
constructor(point){super();this.point=point;this.setMap(map)}
onAdd(){const p=this.point;const el=document.createElement('button');el.className='flag';el.type='button';el.title=p.name+' · '+p.count+' · '+p.percent+'%';el.setAttribute('aria-label',el.title);const img=document.createElement('img');img.src=config.origin+'/flags/'+p.code.toLowerCase()+'.svg';img.alt=p.name;el.append(img);const count=document.createElement('span');count.textContent=String(p.count);el.append(count);el.onclick=()=>notify('country',p.code);google.maps.OverlayView.preventMapHitsAndGesturesFrom(el);this.getPanes().overlayMouseTarget.append(el);this.el=el;}
draw(){if(!this.el)return;const pos=this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(this.point.lat,this.point.lng));if(pos){this.el.style.left=pos.x+'px';this.el.style.top=pos.y+'px';}}
onRemove(){this.el?.remove();}
}
config.points.forEach(point=>new Flag(point));
google.maps.event.addListenerOnce(map,'tilesloaded',()=>notify('ready'));
}catch(error){notify('error')}};
const script=document.createElement('script');script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';
script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key:config.apiKey,callback:'initLiteMap',loading:'async',v:'quarterly',language:config.locale==='en'?'en':'zh-CN'});
script.onerror=()=>notify('error');document.head.append(script);
</script></body></html>`
}
