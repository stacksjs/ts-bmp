import type { BmpEncodeOptions, BmpImageData } from './types'

const FILE_HEADER_SIZE = 14
const BITMAPINFOHEADER_SIZE = 40
const BITMAPV4HEADER_SIZE = 108
const DPI_2835 = 2835 // 72 DPI in pixels-per-meter

/**
 * Encode RGBA pixel data to BMP format.
 *
 * Defaults to 32-bit. For 32-bit input where every alpha byte is 255, the
 * encoder transparently emits a compact BITMAPINFOHEADER instead of the
 * larger BITMAPV4HEADER, since alpha preservation is unnecessary in that
 * case and many legacy readers don't parse V4 headers.
 */
export function encode(imageData: BmpImageData, options: BmpEncodeOptions = {}): Uint8Array {
  const { width, height, data } = imageData
  const { bitsPerPixel = 32, palette: userPalette } = options

  if (bitsPerPixel !== 1 && bitsPerPixel !== 4 && bitsPerPixel !== 8 && bitsPerPixel !== 24 && bitsPerPixel !== 32)
    throw new Error(`Unsupported bitsPerPixel for encoding: ${bitsPerPixel} (must be 1, 4, 8, 24, or 32)`)

  if (!Number.isInteger(width) || width <= 0)
    throw new Error(`Invalid image width: must be a positive integer, got ${width}`)

  if (!Number.isInteger(height) || height <= 0)
    throw new Error(`Invalid image height: must be a positive integer, got ${height}`)

  const expectedDataLength = width * height * 4
  if (data.length !== expectedDataLength) {
    throw new Error(
      `Invalid image data length: expected ${expectedDataLength} bytes (${width}x${height}x4 RGBA), got ${data.length}`,
    )
  }

  if (userPalette && bitsPerPixel !== 1 && bitsPerPixel !== 4 && bitsPerPixel !== 8) {
    throw new Error(
      `palette option only applies to 1/4/8-bit encoding, not ${bitsPerPixel}-bit`,
    )
  }

  if (bitsPerPixel === 24 || bitsPerPixel === 32)
    return encodeRgb(imageData, bitsPerPixel)

  return encodeIndexed(imageData, bitsPerPixel, userPalette)
}

// ---------------------------------------------------------------------------
// 24/32-bit encoder
// ---------------------------------------------------------------------------

function encodeRgb(imageData: BmpImageData, bitsPerPixel: 24 | 32): Uint8Array {
  const { width, height, data } = imageData

  const bytesPerPixel = bitsPerPixel / 8
  const rowSize = width * bytesPerPixel
  const paddedRowSize = (rowSize + 3) & ~3
  const padding = paddedRowSize - rowSize
  const pixelDataSize = paddedRowSize * height

  // For 32-bit input where every alpha is 255, dropping V4+BITFIELDS in favor
  // of BITMAPINFOHEADER+BI_RGB produces a smaller file that more legacy
  // readers parse correctly. The 4th byte of each pixel still gets written as
  // 0xFF so that alpha-aware readers see "fully opaque" rather than
  // accidentally-zero alpha.
  const useV4 = bitsPerPixel === 32 && !isFullyOpaque(data)

  const infoHeaderSize = useV4 ? BITMAPV4HEADER_SIZE : BITMAPINFOHEADER_SIZE
  const dataOffset = FILE_HEADER_SIZE + infoHeaderSize
  const fileSize = dataOffset + pixelDataSize

  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  writeFileHeader(view, fileSize, dataOffset)

  if (useV4)
    writeV4Header(view, width, height, pixelDataSize)
  else
    writeInfoHeader(view, width, height, bitsPerPixel, pixelDataSize, /* colorsUsed */ 0)

  // Pixel data (bottom-up, BGR(A) byte order).
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y
    const dstRowOffset = dataOffset + y * paddedRowSize

    for (let x = 0; x < width; x++) {
      const srcOffset = (srcY * width + x) * 4
      const dstOffset = dstRowOffset + x * bytesPerPixel

      buffer[dstOffset] = data[srcOffset + 2] // B
      buffer[dstOffset + 1] = data[srcOffset + 1] // G
      buffer[dstOffset + 2] = data[srcOffset] // R

      if (bitsPerPixel === 32)
        buffer[dstOffset + 3] = data[srcOffset + 3] // A
    }

    // Padding bytes are already zero (Uint8Array default), but be explicit.
    for (let p = 0; p < padding; p++)
      buffer[dstRowOffset + rowSize + p] = 0
  }

  return buffer
}

function isFullyOpaque(data: Uint8Array | Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255)
      return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Indexed (1/4/8-bit) encoder
// ---------------------------------------------------------------------------

function encodeIndexed(
  imageData: BmpImageData,
  bitsPerPixel: 1 | 4 | 8,
  userPalette: Uint8Array | Uint8ClampedArray | undefined,
): Uint8Array {
  const { width, height, data } = imageData
  const maxColors = 1 << bitsPerPixel

  // Build an RGB → palette-index map. With a user palette we honor exactly
  // what they passed; without one we accumulate unique colors as we walk the
  // image, throwing if the image doesn't fit the requested bit depth.
  const { palette, lookup, numColors } = userPalette
    ? prepareUserPalette(userPalette, maxColors, data, bitsPerPixel)
    : buildPaletteFromImage(data, maxColors, bitsPerPixel)

  const rowSizeBytes = bitsPerPixel === 8
    ? width
    : bitsPerPixel === 4
      ? (width + 1) >> 1
      : (width + 7) >> 3
  const paddedRowSize = (rowSizeBytes + 3) & ~3
  const pixelDataSize = paddedRowSize * height

  // BMP convention: always allocate the full 2^bpp palette in the file,
  // regardless of how many colors are actually used. `colorsUsed` records the
  // real count so decoders can render efficiently.
  const paletteBytes = maxColors * 4
  const dataOffset = FILE_HEADER_SIZE + BITMAPINFOHEADER_SIZE + paletteBytes
  const fileSize = dataOffset + pixelDataSize

  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  writeFileHeader(view, fileSize, dataOffset)
  writeInfoHeader(view, width, height, bitsPerPixel, pixelDataSize, numColors)

  // Palette: stored as B, G, R, reserved=0.
  const paletteOffset = FILE_HEADER_SIZE + BITMAPINFOHEADER_SIZE
  for (let i = 0; i < numColors; i++) {
    buffer[paletteOffset + i * 4] = palette[i * 4 + 2] // B
    buffer[paletteOffset + i * 4 + 1] = palette[i * 4 + 1] // G
    buffer[paletteOffset + i * 4 + 2] = palette[i * 4] // R
    buffer[paletteOffset + i * 4 + 3] = 0
  }

  // Pixel data (bottom-up).
  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y
    const dstRowOffset = dataOffset + y * paddedRowSize

    if (bitsPerPixel === 8) {
      for (let x = 0; x < width; x++) {
        const src = (srcY * width + x) * 4
        const key = packRgb(data[src], data[src + 1], data[src + 2])
        buffer[dstRowOffset + x] = lookup.get(key)!
      }
    }
    else if (bitsPerPixel === 4) {
      for (let x = 0; x < width; x++) {
        const src = (srcY * width + x) * 4
        const idx = lookup.get(packRgb(data[src], data[src + 1], data[src + 2]))!
        const byteOffset = dstRowOffset + (x >> 1)
        if ((x & 1) === 0)
          buffer[byteOffset] = idx << 4 // high nibble
        else
          buffer[byteOffset] |= idx & 0x0F // low nibble
      }
    }
    else {
      // 1-bit: 8 pixels per byte, MSB first. Bytes start at zero, so we only
      // need to set the bit when the index is 1.
      for (let x = 0; x < width; x++) {
        const src = (srcY * width + x) * 4
        const idx = lookup.get(packRgb(data[src], data[src + 1], data[src + 2]))!
        if (idx) {
          const byteOffset = dstRowOffset + (x >> 3)
          buffer[byteOffset] |= 1 << (7 - (x & 7))
        }
      }
    }
  }

  return buffer
}

interface PaletteResult {
  /** RGBA bytes, length = maxColors * 4 (zero-padded entries past `numColors`). */
  palette: Uint8Array
  /** Map from packed RGB (24-bit uint) → palette index. */
  lookup: Map<number, number>
  /** Actual number of palette entries in use. */
  numColors: number
}

function buildPaletteFromImage(
  data: Uint8Array | Uint8ClampedArray,
  maxColors: number,
  bitsPerPixel: number,
): PaletteResult {
  const palette = new Uint8Array(maxColors * 4)
  const lookup = new Map<number, number>()

  for (let i = 0; i < data.length; i += 4) {
    const key = packRgb(data[i], data[i + 1], data[i + 2])
    if (lookup.has(key))
      continue

    const idx = lookup.size
    if (idx >= maxColors) {
      throw new Error(
        `Image has more than ${maxColors} unique colors; cannot encode as ${bitsPerPixel}-bit BMP. `
        + `Either use a higher bit depth or supply a quantized palette via options.palette.`,
      )
    }
    lookup.set(key, idx)
    palette[idx * 4] = data[i]
    palette[idx * 4 + 1] = data[i + 1]
    palette[idx * 4 + 2] = data[i + 2]
    palette[idx * 4 + 3] = 255
  }

  return { palette, lookup, numColors: lookup.size }
}

function prepareUserPalette(
  userPalette: Uint8Array | Uint8ClampedArray,
  maxColors: number,
  data: Uint8Array | Uint8ClampedArray,
  bitsPerPixel: number,
): PaletteResult {
  if (userPalette.length % 4 !== 0)
    throw new Error(`Palette length must be a multiple of 4 (RGBA), got ${userPalette.length}`)

  const numColors = userPalette.length / 4
  if (numColors === 0)
    throw new Error('Palette must contain at least one color')

  if (numColors > maxColors) {
    throw new Error(
      `Palette has ${numColors} colors, exceeds maximum ${maxColors} for ${bitsPerPixel}-bit encoding`,
    )
  }

  const palette = new Uint8Array(maxColors * 4)
  const lookup = new Map<number, number>()
  for (let i = 0; i < numColors; i++) {
    const r = userPalette[i * 4]
    const g = userPalette[i * 4 + 1]
    const b = userPalette[i * 4 + 2]
    palette[i * 4] = r
    palette[i * 4 + 1] = g
    palette[i * 4 + 2] = b
    palette[i * 4 + 3] = 255
    // Last writer wins on duplicate entries — silently ignore.
    lookup.set(packRgb(r, g, b), i)
  }

  // Verify every image color is in the palette before committing to encode.
  for (let i = 0; i < data.length; i += 4) {
    const key = packRgb(data[i], data[i + 1], data[i + 2])
    if (!lookup.has(key)) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      throw new Error(
        `Pixel at byte offset ${i} has color (${r}, ${g}, ${b}) not present in supplied palette`,
      )
    }
  }

  return { palette, lookup, numColors }
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)
}

// ---------------------------------------------------------------------------
// Header writers (shared)
// ---------------------------------------------------------------------------

function writeFileHeader(view: DataView, fileSize: number, dataOffset: number): void {
  view.setUint16(0, 0x4D42, true) // 'BM'
  view.setUint32(2, fileSize, true)
  view.setUint16(6, 0, true) // reserved1
  view.setUint16(8, 0, true) // reserved2
  view.setUint32(10, dataOffset, true)
}

function writeInfoHeader(
  view: DataView,
  width: number,
  height: number,
  bitsPerPixel: number,
  pixelDataSize: number,
  colorsUsed: number,
): void {
  view.setUint32(14, BITMAPINFOHEADER_SIZE, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true) // planes
  view.setUint16(28, bitsPerPixel, true)
  view.setUint32(30, 0, true) // BI_RGB (no compression)
  view.setUint32(34, pixelDataSize, true)
  view.setInt32(38, DPI_2835, true)
  view.setInt32(42, DPI_2835, true)
  view.setUint32(46, colorsUsed, true)
  view.setUint32(50, 0, true) // colorsImportant (0 = all)
}

function writeV4Header(
  view: DataView,
  width: number,
  height: number,
  pixelDataSize: number,
): void {
  view.setUint32(14, BITMAPV4HEADER_SIZE, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true) // planes
  view.setUint16(28, 32, true) // bpp
  view.setUint32(30, 3, true) // BI_BITFIELDS
  view.setUint32(34, pixelDataSize, true)
  view.setInt32(38, DPI_2835, true)
  view.setInt32(42, DPI_2835, true)
  view.setUint32(46, 0, true) // colorsUsed
  view.setUint32(50, 0, true) // colorsImportant

  // Channel masks (BGRA byte layout → ARGB when read as little-endian uint32)
  view.setUint32(54, 0x00FF0000, true) // R
  view.setUint32(58, 0x0000FF00, true) // G
  view.setUint32(62, 0x000000FF, true) // B
  view.setUint32(66, 0xFF000000, true) // A

  view.setUint32(70, 0x73524742, true) // 'sRGB' color space

  // Endpoints (36 bytes) and gamma (12 bytes) intentionally left as zero
  // — Uint8Array initializes to zero, so no explicit writes needed.
}
