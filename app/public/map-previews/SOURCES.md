# Mapbox style previews

These 3 images (Standard, Streets, Dark) are actual Mapbox GL JS 3.33.0 screenshots captured in local Chrome on 2026-10-22, then converted to WebP (quality 90) without cropping, recoloring, compositing, or changing map content. They contain no visitor data. Mapbox logos and the renderer's complete attribution remain visible.

- Source: the corresponding `mapbox://styles/mapbox/{styleId}` from the fixed application catalog.
- Viewport: 720 × 440 pixels.
- Camera: longitude -122.44, latitude 37.77, zoom 11.3, bearing 0, pitch 0.
- Projection: Mercator.
- Standard: monochrome theme, day lighting, 3D objects and POI/transit/road labels disabled, matching the application configuration.
- Classic styles: unmodified default style configuration.

The preview uses an urban view to make basemap differences easier to compare; the statistics page initially shows a wider geographic view. Neither the images nor this file contain an access token. Regenerating them requires an authorized public Mapbox token at runtime; never commit that token or a credentialed API URL.

Official references:

- [Mapbox style catalog](https://docs.mapbox.com/map-styles/reference/)
- [Standard styles](https://docs.mapbox.com/map-styles/guides/standard-styles/)
- [Classic styles](https://docs.mapbox.com/map-styles/guides/classic-styles/)
- [Map attribution](https://docs.mapbox.com/help/dive-deeper/attribution/)
