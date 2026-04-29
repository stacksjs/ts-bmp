# ts-bmp

A pure TypeScript BMP encoder and decoder with zero dependencies.

## Features

- 🚀 Pure TypeScript - no native dependencies
- 📦 Zero dependencies
- 🎨 Supports multiple bit depths: 1, 4, 8, 16, 24, 32 bits
- 🗜️ RLE compression support (RLE4 and RLE8)
- 🔄 Encode and decode BMP images
- 📐 Handles both bottom-up and top-down BMPs

## Installation

```bash
bun add ts-bmp
# or
npm install ts-bmp
```

## Usage

### Decoding

```typescript
import { decode } from 'ts-bmp'

const buffer = await Bun.file('image.bmp').arrayBuffer()
const { data, width, height } = decode(new Uint8Array(buffer))

// data is RGBA pixel data (4 bytes per pixel)
console.log(`Image size: ${width}x${height}`)
```

### Encoding

```typescript
import { encode } from 'ts-bmp'

const imageData = {
  data: new Uint8Array(width * height * 4), // RGBA pixel data
  width: 100,
  height: 100,
}

// Encode as 32-bit BMP (with alpha channel)
const bmpBuffer = encode(imageData, { bitsPerPixel: 32 })
await Bun.write('output.bmp', bmpBuffer)

// Or encode as 24-bit BMP (no alpha)
const bmp24 = encode(imageData, { bitsPerPixel: 24 })
```

## API

### `decode(buffer: Uint8Array | ArrayBuffer): BmpImageData`

Decodes a BMP image buffer to RGBA pixel data. Accepts either a `Uint8Array` or a raw `ArrayBuffer`.

**Returns:**
- `data: Uint8Array` - RGBA pixel data (4 bytes per pixel)
- `width: number` - Image width in pixels
- `height: number` - Image height in pixels

**Throws:** if the buffer is too short to contain a BMP header, lacks the `BM` signature, or has a bit depth that isn't supported.

### `encode(imageData: BmpImageData, options?: BmpEncodeOptions): Uint8Array`

Encodes RGBA pixel data to BMP format.

**Options:**
- `bitsPerPixel: 24 | 32` - Bits per pixel (default: 32)

**Throws:** if `bitsPerPixel` isn't 24 or 32, if `width`/`height` aren't positive integers, or if `data.length` doesn't equal `width * height * 4`.

## Supported Formats

### Decoding
- 1-bit monochrome
- 4-bit indexed (with RLE4 compression)
- 8-bit indexed (with RLE8 compression)
- 16-bit RGB (with bit field support)
- 24-bit RGB
- 32-bit RGBA

### Encoding
- 24-bit RGB
- 32-bit RGBA (with alpha channel support)

## License

MIT
