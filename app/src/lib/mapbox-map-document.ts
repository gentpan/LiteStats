import type { MapPoint } from "./google-map-document"
import { mapboxStyleUrl, type MapboxStyle } from "./map-options"

export function mapboxMapDocument(config: {token:string, style:MapboxStyle, customStyle:string, locale:string, dark:boolean, origin:string, points:MapPoint[]}) {
  const data = JSON.stringify({...config, styleUrl:mapboxStyleUrl(config.style,config.customStyle,config.dark)}).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://api.mapbox.com/mapbox-gl-js/v3.30.0/mapbox-gl.css">
<style>.gm-style button,.mapboxgl-ctrl-group{border-radius:8px!important}html,body,#map{width:100%;height:100%;margin:0;background:${config.dark ? "#242630" : "#eef1f5"}}.flag{border:0;background:transparent;padding:0;cursor:pointer}.flag img{display:block;width:28px;height:21px;object-fit:contain}.flag:focus-visible{outline:2px solid #6366f1;outline-offset:3px}</style></head><body><div id="map"></div><script>
const config=${data};const notify=(type,code)=>parent.postMessage({source:'litestats-mapbox-map',type,code},config.origin);
const script=document.createElement('script');script.src='https://api.mapbox.com/mapbox-gl-js/v3.30.0/mapbox-gl.js';script.async=true;script.onerror=()=>notify('error');
script.onload=()=>{try {
if(!mapboxgl.supported()){notify('error');return;}
const map=new mapboxgl.Map({container:'map',accessToken:config.token,style:config.styleUrl,center:[145,25],zoom:1.5,minZoom:0,maxZoom:8,projection:'mercator',cooperativeGestures:true,language:config.locale==='en'?'en':'zh-Hans'});
map.addControl(new mapboxgl.NavigationControl(),'top-right');map.addControl(new mapboxgl.FullscreenControl(),'top-right');
map.on('error',()=>notify('error'));
map.on('load',()=>{
config.points.forEach(point=>{const button=document.createElement('button');button.type='button';button.className='flag';button.title=point.name+' · '+point.count+' · '+point.percent+'%';button.setAttribute('aria-label',button.title);const image=document.createElement('img');image.src=config.origin+'/flags/'+point.code.toLowerCase()+'.svg';image.alt=point.name;button.append(image);button.onclick=()=>notify('country',point.code);new mapboxgl.Marker({element:button,anchor:'center'}).setLngLat([point.lng,point.lat]).addTo(map);});notify('ready');
});
}catch(error){notify('error')}};document.head.append(script);
</script></body></html>`
}
