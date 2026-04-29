import type { BmpFileHeader, BmpImageData, BmpInfoHeader } from './types'
import { BmpCompression } from './types'

/**
 * Decode a BMP image buffer to RGBA pixel data.
 * Accepts either a `Uint8Array` or an `ArrayBuffer`.
 */
export function decode(buffer: Uint8Array | ArrayBuffer): BmpImageData {
  const data = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer

  // File header (14) + smallest info header (BITMAPCOREHEADER, 12) = 26 bytes minimum
  if (data.byteLength < 26)
    throw new Error(`Invalid BMP file: buffer too small (got ${data.byteLength} bytes, need at least 26)`)

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // Read file header
  const fileHeader = readFileHeader(view)
  if (fileHeader.signature !== 0x4D42) {
    throw new Error('Invalid BMP file: missing BM signature')
  }

  // Read info header
  const declaredHeaderSize = view.getUint32(14, true)
  if (data.byteLength < 14 + declaredHeaderSize) {
    throw new Error(
      `Invalid BMP file: buffer truncated (info header claims ${declaredHeaderSize} bytes, only ${data.byteLength - 14} available)`,
    )
  }
  const infoHeader = readInfoHeader(view, 14)

  // Handle different bit depths
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)
  const isBottomUp = infoHeader.height > 0

  // Create output buffer (RGBA)
  const pixels = new Uint8Array(width * height * 4)

  // Decode based on bit depth and compression
  switch (infoHeader.bitsPerPixel) {
    case 1:
      decode1Bit(data, view, fileHeader, infoHeader, pixels, isBottomUp)
      break
    case 4:
      if (infoHeader.compression === BmpCompression.RLE4) {
        decodeRLE4(data, fileHeader, infoHeader, pixels, isBottomUp)
      }
      else {
        decode4Bit(data, view, fileHeader, infoHeader, pixels, isBottomUp)
      }
      break
    case 8:
      if (infoHeader.compression === BmpCompression.RLE8) {
        decodeRLE8(data, fileHeader, infoHeader, pixels, isBottomUp)
      }
      else {
        decode8Bit(data, view, fileHeader, infoHeader, pixels, isBottomUp)
      }
      break
    case 16:
      decode16Bit(data, view, fileHeader, infoHeader, pixels, isBottomUp)
      break
    case 24:
      decode24Bit(data, fileHeader, infoHeader, pixels, isBottomUp)
      break
    case 32:
      decode32Bit(data, view, fileHeader, infoHeader, pixels, isBottomUp)
      break
    default:
      throw new Error(`Unsupported bit depth: ${infoHeader.bitsPerPixel}`)
  }

  return {
    data: pixels,
    width,
    height,
  }
}

function readFileHeader(view: DataView): BmpFileHeader {
  return {
    signature: view.getUint16(0, true),
    fileSize: view.getUint32(2, true),
    reserved1: view.getUint16(6, true),
    reserved2: view.getUint16(8, true),
    dataOffset: view.getUint32(10, true),
  }
}

function readInfoHeader(view: DataView, offset: number): BmpInfoHeader {
  const headerSize = view.getUint32(offset, true)

  // Support different header versions
  if (headerSize === 12) {
    // BITMAPCOREHEADER (OS/2 1.x)
    return {
      headerSize,
      width: view.getUint16(offset + 4, true),
      height: view.getInt16(offset + 6, true),
      planes: view.getUint16(offset + 8, true),
      bitsPerPixel: view.getUint16(offset + 10, true),
      compression: 0,
      imageSize: 0,
      xPixelsPerMeter: 0,
      yPixelsPerMeter: 0,
      colorsUsed: 0,
      colorsImportant: 0,
    }
  }

  // BITMAPINFOHEADER and later versions
  return {
    headerSize,
    width: view.getInt32(offset + 4, true),
    height: view.getInt32(offset + 8, true),
    planes: view.getUint16(offset + 12, true),
    bitsPerPixel: view.getUint16(offset + 14, true),
    compression: view.getUint32(offset + 16, true),
    imageSize: view.getUint32(offset + 20, true),
    xPixelsPerMeter: view.getInt32(offset + 24, true),
    yPixelsPerMeter: view.getInt32(offset + 28, true),
    colorsUsed: view.getUint32(offset + 32, true),
    colorsImportant: view.getUint32(offset + 36, true),
  }
}

/**
 * Read BITFIELDS masks for a 16/32-bit BMP.
 *
 * Why: For BITMAPINFOHEADER (40 bytes), masks live in the file *after* the
 * header at file offset 14 + 40 = 54. For BITMAPV2/V3/V4/V5 headers (52, 56,
 * 108, 124 bytes), the masks are *inside* the header at the same file offset
 * (14 + 40 = 54). So the file offset is always 54 when masks are present.
 */
function readBitfieldMasks(
  view: DataView,
  headerSize: number,
  compression: number,
): { rMask: number, gMask: number, bMask: number, aMask: number } {
  const maskOffset = 14 + 40
  const rMask = view.getUint32(maskOffset, true)
  const gMask = view.getUint32(maskOffset + 4, true)
  const bMask = view.getUint32(maskOffset + 8, true)
  // Alpha mask is part of V3+ headers (>= 56 bytes) or signaled by ALPHABITFIELDS.
  const aMask = headerSize >= 56 || compression === BmpCompression.ALPHABITFIELDS
    ? view.getUint32(maskOffset + 12, true)
    : 0
  return { rMask, gMask, bMask, aMask }
}

function readPalette(
  view: DataView,
  offset: number,
  numColors: number,
  entrySize: number = 4,
): Uint8Array {
  const palette = new Uint8Array(numColors * 4)

  for (let i = 0; i < numColors; i++) {
    const base = offset + i * entrySize
    palette[i * 4] = view.getUint8(base + 2) // R (BMP stores BGR)
    palette[i * 4 + 1] = view.getUint8(base + 1) // G
    palette[i * 4 + 2] = view.getUint8(base) // B
    palette[i * 4 + 3] = 255 // A
  }

  return palette
}

function decode1Bit(
  data: Uint8Array,
  view: DataView,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)
  const paletteOffset = 14 + infoHeader.headerSize
  const numColors = Math.min(infoHeader.colorsUsed || 2, 2)
  const palette = readPalette(view, paletteOffset, numColors, infoHeader.headerSize === 12 ? 3 : 4)

  const rowSize = Math.ceil(width / 32) * 4 // Rows are padded to 4-byte boundaries
  const dataOffset = fileHeader.dataOffset

  for (let y = 0; y < height; y++) {
    const srcY = isBottomUp ? height - 1 - y : y
    const rowOffset = dataOffset + srcY * rowSize

    for (let x = 0; x < width; x++) {
      const byteIndex = Math.floor(x / 8)
      const bitIndex = 7 - (x % 8)
      const colorIndex = (data[rowOffset + byteIndex] >> bitIndex) & 1

      const pixelOffset = (y * width + x) * 4
      pixels[pixelOffset] = palette[colorIndex * 4]
      pixels[pixelOffset + 1] = palette[colorIndex * 4 + 1]
      pixels[pixelOffset + 2] = palette[colorIndex * 4 + 2]
      pixels[pixelOffset + 3] = 255
    }
  }
}

function decode4Bit(
  data: Uint8Array,
  view: DataView,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)
  const paletteOffset = 14 + infoHeader.headerSize
  const numColors = Math.min(infoHeader.colorsUsed || 16, 16)
  const palette = readPalette(view, paletteOffset, numColors, infoHeader.headerSize === 12 ? 3 : 4)

  const rowSize = Math.ceil(width / 2)
  const paddedRowSize = Math.ceil(rowSize / 4) * 4
  const dataOffset = fileHeader.dataOffset

  for (let y = 0; y < height; y++) {
    const srcY = isBottomUp ? height - 1 - y : y
    const rowOffset = dataOffset + srcY * paddedRowSize

    for (let x = 0; x < width; x++) {
      const byteIndex = Math.floor(x / 2)
      const nibbleIndex = 1 - (x % 2)
      const colorIndex = (data[rowOffset + byteIndex] >> (nibbleIndex * 4)) & 0x0F

      const pixelOffset = (y * width + x) * 4
      pixels[pixelOffset] = palette[colorIndex * 4]
      pixels[pixelOffset + 1] = palette[colorIndex * 4 + 1]
      pixels[pixelOffset + 2] = palette[colorIndex * 4 + 2]
      pixels[pixelOffset + 3] = 255
    }
  }
}

function decode8Bit(
  data: Uint8Array,
  view: DataView,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)
  const paletteOffset = 14 + infoHeader.headerSize
  const numColors = Math.min(infoHeader.colorsUsed || 256, 256)
  const palette = readPalette(view, paletteOffset, numColors, infoHeader.headerSize === 12 ? 3 : 4)

  const paddedRowSize = Math.ceil(width / 4) * 4
  const dataOffset = fileHeader.dataOffset

  for (let y = 0; y < height; y++) {
    const srcY = isBottomUp ? height - 1 - y : y
    const rowOffset = dataOffset + srcY * paddedRowSize

    for (let x = 0; x < width; x++) {
      const colorIndex = data[rowOffset + x]

      const pixelOffset = (y * width + x) * 4
      pixels[pixelOffset] = palette[colorIndex * 4]
      pixels[pixelOffset + 1] = palette[colorIndex * 4 + 1]
      pixels[pixelOffset + 2] = palette[colorIndex * 4 + 2]
      pixels[pixelOffset + 3] = 255
    }
  }
}

function decode16Bit(
  _data: Uint8Array,
  view: DataView,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)

  const paddedRowSize = Math.ceil((width * 2) / 4) * 4
  const dataOffset = fileHeader.dataOffset

  // Default masks for 16-bit (5-5-5 RGB)
  let rMask = 0x7C00
  let gMask = 0x03E0
  let bMask = 0x001F
  let rShift = 10
  let gShift = 5
  let bShift = 0

  // Check for bit fields compression
  if (
    infoHeader.compression === BmpCompression.BITFIELDS
    || infoHeader.compression === BmpCompression.ALPHABITFIELDS
  ) {
    const masks = readBitfieldMasks(view, infoHeader.headerSize, infoHeader.compression)
    rMask = masks.rMask
    gMask = masks.gMask
    bMask = masks.bMask

    rShift = countTrailingZeros(rMask)
    gShift = countTrailingZeros(gMask)
    bShift = countTrailingZeros(bMask)
  }

  const rScale = 255 / (rMask >> rShift)
  const gScale = 255 / (gMask >> gShift)
  const bScale = 255 / (bMask >> bShift)

  for (let y = 0; y < height; y++) {
    const srcY = isBottomUp ? height - 1 - y : y
    const rowOffset = dataOffset + srcY * paddedRowSize

    for (let x = 0; x < width; x++) {
      const pixel = view.getUint16(rowOffset + x * 2, true)

      const pixelOffset = (y * width + x) * 4
      pixels[pixelOffset] = Math.round(((pixel & rMask) >> rShift) * rScale)
      pixels[pixelOffset + 1] = Math.round(((pixel & gMask) >> gShift) * gScale)
      pixels[pixelOffset + 2] = Math.round(((pixel & bMask) >> bShift) * bScale)
      pixels[pixelOffset + 3] = 255
    }
  }
}

function decode24Bit(
  data: Uint8Array,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)

  const paddedRowSize = Math.ceil((width * 3) / 4) * 4
  const dataOffset = fileHeader.dataOffset

  for (let y = 0; y < height; y++) {
    const srcY = isBottomUp ? height - 1 - y : y
    const rowOffset = dataOffset + srcY * paddedRowSize

    for (let x = 0; x < width; x++) {
      const srcOffset = rowOffset + x * 3
      const pixelOffset = (y * width + x) * 4

      // BMP stores BGR
      pixels[pixelOffset] = data[srcOffset + 2] // R
      pixels[pixelOffset + 1] = data[srcOffset + 1] // G
      pixels[pixelOffset + 2] = data[srcOffset] // B
      pixels[pixelOffset + 3] = 255 // A
    }
  }
}

function decode32Bit(
  data: Uint8Array,
  view: DataView,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)

  const rowSize = width * 4
  const dataOffset = fileHeader.dataOffset

  // BI_RGB 32-bit: standard BGRA layout, copy bytes directly.
  if (
    infoHeader.compression !== BmpCompression.BITFIELDS
    && infoHeader.compression !== BmpCompression.ALPHABITFIELDS
  ) {
    for (let y = 0; y < height; y++) {
      const srcY = isBottomUp ? height - 1 - y : y
      const rowOffset = dataOffset + srcY * rowSize

      for (let x = 0; x < width; x++) {
        const srcOffset = rowOffset + x * 4
        const pixelOffset = (y * width + x) * 4

        // BMP stores BGRA
        pixels[pixelOffset] = data[srcOffset + 2] // R
        pixels[pixelOffset + 1] = data[srcOffset + 1] // G
        pixels[pixelOffset + 2] = data[srcOffset] // B
        pixels[pixelOffset + 3] = data[srcOffset + 3] // A
      }
    }
    return
  }

  // BI_BITFIELDS / BI_ALPHABITFIELDS: channel positions are defined by masks.
  const masks = readBitfieldMasks(view, infoHeader.headerSize, infoHeader.compression)
  const { rMask, gMask, bMask, aMask } = masks

  const rShift = countTrailingZeros(rMask)
  const gShift = countTrailingZeros(gMask)
  const bShift = countTrailingZeros(bMask)
  const aShift = aMask ? countTrailingZeros(aMask) : 0

  // Use unsigned shift so a top-bit mask like 0xFF000000 doesn't sign-extend.
  const rRange = (rMask >>> rShift) || 1
  const gRange = (gMask >>> gShift) || 1
  const bRange = (bMask >>> bShift) || 1
  const aRange = aMask ? ((aMask >>> aShift) || 1) : 0

  const rScale = 255 / rRange
  const gScale = 255 / gRange
  const bScale = 255 / bRange
  const aScale = aRange ? 255 / aRange : 0

  for (let y = 0; y < height; y++) {
    const srcY = isBottomUp ? height - 1 - y : y
    const rowOffset = dataOffset + srcY * rowSize

    for (let x = 0; x < width; x++) {
      const pixel = view.getUint32(rowOffset + x * 4, true)
      const pixelOffset = (y * width + x) * 4

      pixels[pixelOffset] = Math.round(((pixel & rMask) >>> rShift) * rScale)
      pixels[pixelOffset + 1] = Math.round(((pixel & gMask) >>> gShift) * gScale)
      pixels[pixelOffset + 2] = Math.round(((pixel & bMask) >>> bShift) * bScale)
      pixels[pixelOffset + 3] = aMask
        ? Math.round(((pixel & aMask) >>> aShift) * aScale)
        : 255
    }
  }
}

function decodeRLE8(
  data: Uint8Array,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)
  const paletteOffset = 14 + infoHeader.headerSize
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const numColors = Math.min(infoHeader.colorsUsed || 256, 256)
  const palette = readPalette(view, paletteOffset, numColors)

  let x = 0
  let y = isBottomUp ? height - 1 : 0
  let i = fileHeader.dataOffset

  while (i < data.length) {
    const count = data[i++]
    const value = data[i++]

    if (count === 0) {
      // Escape sequence
      if (value === 0) {
        // End of line
        x = 0
        y = isBottomUp ? y - 1 : y + 1
      }
      else if (value === 1) {
        // End of bitmap
        break
      }
      else if (value === 2) {
        // Delta
        x += data[i++]
        const dy = data[i++]
        y = isBottomUp ? y - dy : y + dy
      }
      else {
        // Absolute mode
        for (let j = 0; j < value && y >= 0 && y < height; j++) {
          const colorIndex = data[i++]
          if (x < width) {
            const pixelOffset = (y * width + x) * 4
            pixels[pixelOffset] = palette[colorIndex * 4]
            pixels[pixelOffset + 1] = palette[colorIndex * 4 + 1]
            pixels[pixelOffset + 2] = palette[colorIndex * 4 + 2]
            pixels[pixelOffset + 3] = 255
            x++
          }
        }
        // Pad to word boundary
        if (value % 2 !== 0) {
          i++
        }
      }
    }
    else {
      // Run-length encoded
      for (let j = 0; j < count && y >= 0 && y < height; j++) {
        if (x < width) {
          const pixelOffset = (y * width + x) * 4
          pixels[pixelOffset] = palette[value * 4]
          pixels[pixelOffset + 1] = palette[value * 4 + 1]
          pixels[pixelOffset + 2] = palette[value * 4 + 2]
          pixels[pixelOffset + 3] = 255
          x++
        }
      }
    }
  }
}

function decodeRLE4(
  data: Uint8Array,
  fileHeader: BmpFileHeader,
  infoHeader: BmpInfoHeader,
  pixels: Uint8Array,
  isBottomUp: boolean,
): void {
  const { width } = infoHeader
  const height = Math.abs(infoHeader.height)
  const paletteOffset = 14 + infoHeader.headerSize
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const numColors = Math.min(infoHeader.colorsUsed || 16, 16)
  const palette = readPalette(view, paletteOffset, numColors)

  let x = 0
  let y = isBottomUp ? height - 1 : 0
  let i = fileHeader.dataOffset

  while (i < data.length) {
    const count = data[i++]
    const value = data[i++]

    if (count === 0) {
      if (value === 0) {
        // End of line
        x = 0
        y = isBottomUp ? y - 1 : y + 1
      }
      else if (value === 1) {
        // End of bitmap
        break
      }
      else if (value === 2) {
        // Delta
        x += data[i++]
        const dy = data[i++]
        y = isBottomUp ? y - dy : y + dy
      }
      else {
        // Absolute mode
        for (let j = 0; j < value && y >= 0 && y < height; j++) {
          const byteIndex = Math.floor(j / 2)
          const nibbleIndex = 1 - (j % 2)
          const colorIndex = (data[i + byteIndex] >> (nibbleIndex * 4)) & 0x0F

          if (x < width) {
            const pixelOffset = (y * width + x) * 4
            pixels[pixelOffset] = palette[colorIndex * 4]
            pixels[pixelOffset + 1] = palette[colorIndex * 4 + 1]
            pixels[pixelOffset + 2] = palette[colorIndex * 4 + 2]
            pixels[pixelOffset + 3] = 255
            x++
          }
        }
        // Advance past the data
        i += Math.ceil(value / 2)
        // Pad to word boundary
        if (Math.ceil(value / 2) % 2 !== 0) {
          i++
        }
      }
    }
    else {
      // Run-length encoded (alternating nibbles)
      const color1 = (value >> 4) & 0x0F
      const color2 = value & 0x0F

      for (let j = 0; j < count && y >= 0 && y < height; j++) {
        const colorIndex = j % 2 === 0 ? color1 : color2
        if (x < width) {
          const pixelOffset = (y * width + x) * 4
          pixels[pixelOffset] = palette[colorIndex * 4]
          pixels[pixelOffset + 1] = palette[colorIndex * 4 + 1]
          pixels[pixelOffset + 2] = palette[colorIndex * 4 + 2]
          pixels[pixelOffset + 3] = 255
          x++
        }
      }
    }
  }
}

function countTrailingZeros(n: number): number {
  if (n === 0)
    return 32
  let count = 0
  while ((n & 1) === 0) {
    n >>= 1
    count++
  }
  return count
}
