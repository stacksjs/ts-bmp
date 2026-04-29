import type { BmpEncodeOptions, BmpImageData } from './types'

/**
 * Encode RGBA pixel data to BMP format
 */
export function encode(imageData: BmpImageData, options: BmpEncodeOptions = {}): Uint8Array {
  const { width, height, data } = imageData
  const { bitsPerPixel = 32 } = options

  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error('Only 24 and 32 bits per pixel are supported for encoding')
  }

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

  const hasAlpha = bitsPerPixel === 32

  // Calculate row size (must be padded to 4-byte boundary)
  const bytesPerPixel = bitsPerPixel / 8
  const rowSize = width * bytesPerPixel
  const paddedRowSize = Math.ceil(rowSize / 4) * 4
  const padding = paddedRowSize - rowSize

  // Calculate file size
  const headerSize = 14 // File header
  const infoHeaderSize = hasAlpha ? 108 : 40 // BITMAPV4HEADER for alpha, BITMAPINFOHEADER otherwise
  const pixelDataSize = paddedRowSize * height
  const fileSize = headerSize + infoHeaderSize + pixelDataSize

  // Create buffer
  const buffer = new Uint8Array(fileSize)
  const view = new DataView(buffer.buffer)

  // Write file header (14 bytes)
  view.setUint16(0, 0x4D42, true) // 'BM' signature
  view.setUint32(2, fileSize, true) // File size
  view.setUint16(6, 0, true) // Reserved
  view.setUint16(8, 0, true) // Reserved
  view.setUint32(10, headerSize + infoHeaderSize, true) // Data offset

  if (hasAlpha) {
    // Write BITMAPV4HEADER (108 bytes) for 32-bit with alpha
    view.setUint32(14, 108, true) // Header size
    view.setInt32(18, width, true) // Width
    view.setInt32(22, height, true) // Height (positive = bottom-up)
    view.setUint16(26, 1, true) // Planes
    view.setUint16(28, 32, true) // Bits per pixel
    view.setUint32(30, 3, true) // Compression (BI_BITFIELDS)
    view.setUint32(34, pixelDataSize, true) // Image size
    view.setInt32(38, 2835, true) // X pixels per meter (72 DPI)
    view.setInt32(42, 2835, true) // Y pixels per meter (72 DPI)
    view.setUint32(46, 0, true) // Colors used
    view.setUint32(50, 0, true) // Important colors

    // Bit masks for BGRA
    view.setUint32(54, 0x00FF0000, true) // Red mask
    view.setUint32(58, 0x0000FF00, true) // Green mask
    view.setUint32(62, 0x000000FF, true) // Blue mask
    view.setUint32(66, 0xFF000000, true) // Alpha mask

    // Color space type (LCS_sRGB)
    view.setUint32(70, 0x73524742, true) // 'sRGB'

    // CIEXYZTRIPLE endpoints (36 bytes of zeros)
    for (let i = 74; i < 110; i++) {
      buffer[i] = 0
    }

    // Gamma values (12 bytes of zeros)
    for (let i = 110; i < 122; i++) {
      buffer[i] = 0
    }
  }
  else {
    // Write BITMAPINFOHEADER (40 bytes) for 24-bit
    view.setUint32(14, 40, true) // Header size
    view.setInt32(18, width, true) // Width
    view.setInt32(22, height, true) // Height (positive = bottom-up)
    view.setUint16(26, 1, true) // Planes
    view.setUint16(28, 24, true) // Bits per pixel
    view.setUint32(30, 0, true) // Compression (BI_RGB = no compression)
    view.setUint32(34, pixelDataSize, true) // Image size
    view.setInt32(38, 2835, true) // X pixels per meter (72 DPI)
    view.setInt32(42, 2835, true) // Y pixels per meter (72 DPI)
    view.setUint32(46, 0, true) // Colors used
    view.setUint32(50, 0, true) // Important colors
  }

  // Write pixel data (bottom-up)
  const dataOffset = headerSize + infoHeaderSize

  for (let y = 0; y < height; y++) {
    const srcY = height - 1 - y // BMP is bottom-up
    const dstRowOffset = dataOffset + y * paddedRowSize

    for (let x = 0; x < width; x++) {
      const srcOffset = (srcY * width + x) * 4
      const dstOffset = dstRowOffset + x * bytesPerPixel

      // Write BGR(A) - BMP uses BGR order
      buffer[dstOffset] = data[srcOffset + 2] // B
      buffer[dstOffset + 1] = data[srcOffset + 1] // G
      buffer[dstOffset + 2] = data[srcOffset] // R

      if (hasAlpha) {
        buffer[dstOffset + 3] = data[srcOffset + 3] // A
      }
    }

    // Add padding
    for (let p = 0; p < padding; p++) {
      buffer[dstRowOffset + rowSize + p] = 0
    }
  }

  return buffer
}
