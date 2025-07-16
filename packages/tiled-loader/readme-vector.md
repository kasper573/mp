# Vector-based Tiled Loader

This implementation provides a schema-based approach using Valibot to parse Tiled JSON and transform it to a Vector-based data structure.

## Key Features

- **Schema Validation**: Uses Valibot to validate and transform Tiled JSON data
- **Vector Types**: Positions and sizes are transformed to Vector instances for better performance
- **Type Safety**: Strong TypeScript support with proper type inference
- **Zero Runtime Conversions**: Data is transformed once at load time, not during rendering
- **Backward Compatible**: Original interfaces remain available with deprecation warnings

## Usage

```typescript
import { createVectorTiledLoader } from "@mp/tiled-loader";

// Create the loader
const loader = createVectorTiledLoader({
  loadFile: async (path) => {
    const response = await fetch(path);
    return response.json();
  },
  basePath: "/assets/maps",
});

// Load a map
const result = await loader.load("level1.json");

if (result.isOk()) {
  const map = result.value;
  
  // Vector operations are now available!
  const mapSizeInPixels = map.mapSize.scale(map.tileSize);
  const center = mapSizeInPixels.scale({ x: 0.5, y: 0.5 });
  const distance = map.parallaxOrigin?.distance(center) ?? 0;
  
  console.log(`Map size: ${map.mapSize.toString()}`);
  console.log(`Tile size: ${map.tileSize.toString()}`);
  console.log(`Map size in pixels: ${mapSizeInPixels.toString()}`);
} else {
  console.error(formatValidationError(result.error));
}
```

## Data Structure Transformation

### Before (Raw Tiled JSON)
```json
{
  "width": 58,
  "height": 47,
  "tilewidth": 16,
  "tileheight": 16,
  "objects": [
    {
      "x": 632.137,
      "y": 476.046,
      "width": 17.0197,
      "height": 16
    }
  ]
}
```

### After (Vector-based)
```typescript
{
  mapSize: Vector<Tile>, // { x: 58, y: 47 }
  tileSize: Vector<Pixel>, // { x: 16, y: 16 }
  objects: [
    {
      position: Vector<Pixel>, // { x: 632.137, y: 476.046 }
      size: Vector<Pixel>, // { x: 17.0197, y: 16 }
    }
  ]
}
```

## Benefits

1. **Performance**: No runtime conversions during rendering
2. **Convenience**: Vector operations (distance, add, scale, etc.) available on positions/sizes  
3. **Type Safety**: Branded types distinguish Pixel vs Tile coordinates
4. **Modern**: Uses latest schema validation with Valibot
5. **Maintainable**: Schema-driven approach makes it easy to modify data structure

## Type System

```typescript
type Position = Vector<Pixel>;       // Pixel coordinates  
type Size = Vector<Pixel>;           // Pixel dimensions
type TilePosition = Vector<Tile>;    // Tile coordinates
type TileSize = Vector<Tile>;        // Tile dimensions
type CoordinatePath = readonly Position[]; // Polygon/polyline coordinates
```