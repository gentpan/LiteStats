import world from "visionscarto-world-atlas/world/50m.json"
import type { WorldTopology } from "../src/lib/world-map-format"

export function packWorldMap(source: WorldTopology): Uint8Array<ArrayBuffer> {
  // Land geometry, names and other metadata are unused by the analytics map.
  const header = new TextEncoder().encode(JSON.stringify({
    type: "Topology",
    transform: source.transform,
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: source.objects.countries.geometries.map(({ type, arcs, id, properties }) => ({
          type, arcs, id, properties: { a3: properties.a3 },
        })),
      },
    },
  }))
  const output = [...new TextEncoder().encode("LSM1"), 0, 0, 0, 0, ...header]
  function uint(value: number) {
    while (value >= 128) {
      output.push((value & 127) | 128)
      value = Math.floor(value / 128)
    }
    output.push(value)
  }
  uint(source.arcs.length)
  for (const arc of source.arcs) {
    uint(arc.length)
    for (const [x, y] of arc) {
      uint(x < 0 ? -x * 2 - 1 : x * 2)
      uint(y < 0 ? -y * 2 - 1 : y * 2)
    }
  }
  const bytes = new Uint8Array(output)
  new DataView(bytes.buffer).setUint32(4, header.length, true)
  return bytes
}

if (import.meta.main) {
  const bytes = packWorldMap(world as unknown as WorldTopology)
  await Bun.write(new URL("../src/assets/world-50m.bin", import.meta.url), bytes)
  console.log(`World map: ${bytes.length} bytes (lossless 50m geometry)`)
}
