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

// 32-bit BMP. If every alpha byte is 255 the encoder emits a compact
// BITMAPINFOHEADER for max reader compatibility; otherwise it emits a
// BITMAPV4HEADER with explicit BITFIELDS masks so transparency is preserved.
const bmpBuffer = encode(imageData, { bitsPerPixel: 32 })
await Bun.write('output.bmp', bmpBuffer)

// 24-bit BMP (no alpha)
const bmp24 = encode(imageData, { bitsPerPixel: 24 })

// Indexed encodings (1/4/8-bit). The palette is built automatically from the
// image's unique colors; encoding throws if the image has more colors than
// the bit depth allows.
const bmp8 = encode(imageData, { bitsPerPixel: 8 })

// Or supply a palette explicitly (RGBA bytes; alpha is ignored). Every pixel's
// RGB must match a palette entry — this library does not perform color
// quantization.
const palette = new Uint8Array([
  0, 0, 0, 255,
  255, 255, 255, 255,
])
const bmp1 = encode(imageData, { bitsPerPixel: 1, palette })
```

`Uint8ClampedArray` is also accepted for `data`, so Canvas `ImageData` works
directly:

```typescript
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
const buf = encode(imageData) // imageData.data is Uint8ClampedArray
```

### Optimizing file size

The smallest BMP for a given image is the one with the lowest bit depth its
colors fit into. You can pick that depth by scanning the image yourself — the
encoder doesn't quantize, but it'll happily emit a 1-bit BMP for two-color
input.

```typescript
import { decode, encode } from 'ts-bmp'

const original = decode(new Uint8Array(await Bun.file('input.bmp').arrayBuffer()))

// Count unique RGB colors and check whether alpha matters at all.
const colors = new Set<number>()
let needsAlpha = false
for (let i = 0; i < original.data.length; i += 4) {
  colors.add((original.data[i] << 16) | (original.data[i + 1] << 8) | original.data[i + 2])
  if (original.data[i + 3] !== 255) needsAlpha = true
}

// Pick the smallest depth that fits.
const bpp = needsAlpha
  ? 32
  : colors.size <= 2
    ? 1
    : colors.size <= 16
      ? 4
      : colors.size <= 256
        ? 8
        : 24

const optimized = encode(original, { bitsPerPixel: bpp })
console.log(`${original.width}x${original.height}: ${bpp}-bit, ${optimized.length} bytes`)
```

A few things worth knowing when optimizing:

- **32-bit auto-fallback.** If you don't bother computing `needsAlpha` and
  always encode at 32-bit, the encoder still detects fully-opaque input and
  drops the 68-byte `BITMAPV4HEADER` overhead automatically. You only *need*
  to pick a smaller depth to shrink pixel data, not header bytes.
- **Indexed encodings discard alpha.** A semi-transparent pixel encoded at
  1/4/8-bit will round-trip as opaque. If `needsAlpha` is true, stay at
  32-bit (or strip alpha intentionally with 24-bit).
- **No quantization.** If `colors.size` is, say, 300, this library refuses to
  encode at 8-bit. To get there you need to quantize externally (median cut,
  octree, etc.) and pass the resulting palette via `options.palette`.

## API

### `decode(buffer: Uint8Array | ArrayBuffer): BmpImageData`

Decodes a BMP image buffer to RGBA pixel data. Accepts either a `Uint8Array` or a raw `ArrayBuffer`.

**Returns:**
- `data: Uint8Array` - RGBA pixel data (4 bytes per pixel)
- `width: number` - Image width in pixels
- `height: number` - Image height in pixels

**Throws:** if the buffer is too short for a BMP header, lacks the `BM`
signature, has an unknown header size, declares a bit depth or compression
that isn't supported, has invalid dimensions or `planes != 1`, has a pixel
data offset that overlaps the headers or runs past EOF, or contains a
truncated RLE stream.

### `encode(imageData: BmpImageData, options?: BmpEncodeOptions): Uint8Array`

Encodes RGBA pixel data to BMP format.

**Options:**
- `bitsPerPixel: 1 | 4 | 8 | 24 | 32` — Bits per pixel (default: `32`).
- `palette?: Uint8Array | Uint8ClampedArray` — Optional palette for 1/4/8-bit
  encoding (RGBA bytes; alpha ignored). Length must be a multiple of 4 and
  no more than `2^bitsPerPixel` entries.

**Throws:** if `bitsPerPixel` isn't one of the supported values, if
`width`/`height` aren't positive integers, if `data.length` doesn't equal
`width * height * 4`, if a palette-based encoding has more unique colors than
the bit depth allows (and no palette was supplied), if a supplied palette has
a bad length or contains too many entries, or if a pixel's RGB doesn't appear
in the supplied palette.

## Supported Formats

### Decoding
- 1-bit monochrome
- 4-bit indexed (with RLE4 compression)
- 8-bit indexed (with RLE8 compression)
- 16-bit RGB (with bit field support)
- 24-bit RGB
- 32-bit RGBA (with BITFIELDS / V4 header masks)

### Encoding
- 1-bit / 4-bit / 8-bit indexed (with auto-built or user-supplied palette)
- 24-bit RGB
- 32-bit RGBA (auto-selects BITMAPINFOHEADER or BITMAPV4HEADER based on whether alpha is uniform)

## License

MIT
