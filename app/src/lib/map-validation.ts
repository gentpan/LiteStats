import { z } from "zod"
export const mapSettingsSchema = z.object({
  domain: z.string().trim().min(1).max(255),
  provider: z.enum(["default", "google", "mapbox"]),
  apiKey: z.string().trim().max(200).regex(/^[A-Za-z0-9_-]*$/),
  googleStyle: z.enum(["auto","standard","silver","dark","retro","aqua"]).default("auto"),
  mapboxToken: z.string().trim().max(2048).regex(/^(?:pk\.[A-Za-z0-9._-]+)?$/).default(""),
  mapboxStyle: z.enum(["auto","standard","light","dark","streets","outdoors","satellite","standard-satellite","custom"]).default("auto"),
  mapboxCustomStyle: z.string().trim().max(256).regex(/^(?:mapbox:\/\/styles\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)?$/).default(""),
}).superRefine((value, ctx) => {
  if (value.provider === "google" && !value.apiKey) ctx.addIssue({code:"custom",message:"Google Maps API Key is required",path:["apiKey"]})
  if (value.provider === "mapbox" && !value.mapboxToken) ctx.addIssue({code:"custom",message:"Mapbox public token is required",path:["mapboxToken"]})
  if (value.provider === "mapbox" && value.mapboxStyle === "custom" && !value.mapboxCustomStyle) ctx.addIssue({code:"custom",message:"Mapbox Studio style URL is required",path:["mapboxCustomStyle"]})
})
