import type { GoogleStyle } from "./map-options"
export function googleMapStyles(style: GoogleStyle, dark: boolean) {
  const resolved = style === "auto" ? (dark ? "dark" : "aqua") : style
  if (resolved === "standard") return []
  const palette = {
    silver: {land:"#f3f4f6",water:"#d6dce2",text:"#59616b",road:"#ffffff"},
    dark: {land:"#151515",water:"#050505",text:"#b5b5b5",road:"#303030"},
    retro: {land:"#ebe3cd",water:"#b9d3c2",text:"#756650",road:"#f7f2e5"},
    aqua: {land:"#edf2e8",water:"#6bd1df",text:"#50645c",road:"#ffffff"},
  }[resolved]
  return [
    {elementType:"geometry",stylers:[{color:palette.land}]},
    {elementType:"labels.text.fill",stylers:[{color:palette.text}]},
    {elementType:"labels.text.stroke",stylers:[{color:palette.land}]},
    {featureType:"water",elementType:"geometry",stylers:[{color:palette.water}]},
    {featureType:"road",elementType:"geometry",stylers:[{color:palette.road}]},
    {featureType:"poi",stylers:[{visibility:"off"}]},
    {featureType:"transit",stylers:[{visibility:"off"}]},
  ]
}
