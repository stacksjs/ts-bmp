import { describe, expect, it } from 'bun:test'
import bmp from '../src'

// Helper to create test image data
function createTestImageData(width: number, height: number, color: { r: number, g: number, b: number, a: number }): { data: Uint8Array, width: number, height: number } {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color.r
    data[i * 4 + 1] = color.g
    data[i * 4 + 2] = color.b
    data[i * 4 + 3] = color.a
  }
  return { data, width, height }
}

// Helper to create gradient image
function createGradientImage(width: number, height: number): { data: Uint8Array, width: number, height: number } {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = Math.floor((x / width) * 255)
      data[i + 1] = Math.floor((y / height) * 255)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }
  return { data, width, height }
}

describe('ts-bmp', () => {
  describe('bmp.encode', () => {
    it('encodes a simple image to 32-bit BMP', () => {
      const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 })
      const encoded = bmp.encode(imageData)

      // Check BMP signature 'BM'
      expect(encoded[0]).toBe(0x42) // 'B'
      expect(encoded[1]).toBe(0x4D) // 'M'

      // File should have valid size
      expect(encoded.length).toBeGreaterThan(54) // At least headers
    })

    it('encodes to 24-bit BMP', () => {
      const imageData = createTestImageData(10, 10, { r: 0, g: 255, b: 0, a: 255 })
      const encoded = bmp.encode(imageData, { bitsPerPixel: 24 })

      // Check BMP signature
      expect(encoded[0]).toBe(0x42)
      expect(encoded[1]).toBe(0x4D)
    })

    it('encodes to 32-bit BMP with alpha', () => {
      const imageData = createTestImageData(5, 5, { r: 0, g: 0, b: 255, a: 128 })
      const encoded = bmp.encode(imageData, { bitsPerPixel: 32 })

      // Check BMP signature
      expect(encoded[0]).toBe(0x42)
      expect(encoded[1]).toBe(0x4D)
    })

    it('handles various image sizes', () => {
      const sizes = [
        { width: 1, height: 1 },
        { width: 2, height: 2 },
        { width: 16, height: 16 },
        { width: 100, height: 50 },
        { width: 50, height: 100 },
        { width: 256, height: 256 },
      ]

      for (const size of sizes) {
        const imageData = createTestImageData(size.width, size.height, { r: 128, g: 128, b: 128, a: 255 })
        const encoded = bmp.encode(imageData)

        expect(encoded[0]).toBe(0x42)
        expect(encoded[1]).toBe(0x4D)
        expect(encoded.length).toBeGreaterThan(0)
      }
    })

    it('throws on invalid bits per pixel', () => {
      const imageData = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 })
      // @ts-expect-error Testing invalid input
      expect(() => bmp.encode(imageData, { bitsPerPixel: 16 })).toThrow()
    })
  })

  describe('bmp.decode', () => {
    it('decodes an encoded 32-bit BMP', () => {
      const original = createTestImageData(10, 10, { r: 255, g: 0, b: 0, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(10)
      expect(decoded.height).toBe(10)
      expect(decoded.data.length).toBe(10 * 10 * 4)
    })

    it('decodes an encoded 24-bit BMP', () => {
      const original = createTestImageData(10, 10, { r: 0, g: 255, b: 0, a: 255 })
      const encoded = bmp.encode(original, { bitsPerPixel: 24 })
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(10)
      expect(decoded.height).toBe(10)
      expect(decoded.data.length).toBe(10 * 10 * 4)
    })

    it('throws on invalid BMP signature', () => {
      // Create a buffer large enough for header but with invalid signature
      const invalidData = new Uint8Array(100)
      invalidData[0] = 0x00 // Not 'B'
      invalidData[1] = 0x00 // Not 'M'
      expect(() => bmp.decode(invalidData)).toThrow('Invalid BMP file: missing BM signature')
    })

    it('decodes from ArrayBuffer', () => {
      const original = createTestImageData(5, 5, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(original)
      const arrayBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
      const decoded = bmp.decode(arrayBuffer)

      expect(decoded.width).toBe(5)
      expect(decoded.height).toBe(5)
    })
  })

  describe('round-trip encoding', () => {
    it('preserves dimensions through encode/decode', () => {
      const original = createTestImageData(32, 32, { r: 100, g: 150, b: 200, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(original.width)
      expect(decoded.height).toBe(original.height)
    })

    it('preserves pixel data through 32-bit encode/decode', () => {
      const original = createTestImageData(16, 16, { r: 255, g: 128, b: 64, a: 200 })
      const encoded = bmp.encode(original, { bitsPerPixel: 32 })
      const decoded = bmp.decode(encoded)

      // Check first pixel
      expect(decoded.data[0]).toBe(255) // R
      expect(decoded.data[1]).toBe(128) // G
      expect(decoded.data[2]).toBe(64)  // B
      expect(decoded.data[3]).toBe(200) // A

      // Check that all pixels match
      for (let i = 0; i < original.data.length; i++) {
        expect(decoded.data[i]).toBe(original.data[i])
      }
    })

    it('preserves RGB through 24-bit encode/decode (alpha becomes 255)', () => {
      const original = createTestImageData(16, 16, { r: 255, g: 128, b: 64, a: 100 })
      const encoded = bmp.encode(original, { bitsPerPixel: 24 })
      const decoded = bmp.decode(encoded)

      // Check first pixel - RGB should match, alpha becomes 255
      expect(decoded.data[0]).toBe(255) // R
      expect(decoded.data[1]).toBe(128) // G
      expect(decoded.data[2]).toBe(64)  // B
      expect(decoded.data[3]).toBe(255) // A (24-bit doesn't preserve alpha)
    })

    it('preserves gradient image through encode/decode', () => {
      const original = createGradientImage(32, 32)
      const encoded = bmp.encode(original, { bitsPerPixel: 32 })
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(32)
      expect(decoded.height).toBe(32)

      // Check a few sample pixels
      for (let y = 0; y < 32; y += 8) {
        for (let x = 0; x < 32; x += 8) {
          const i = (y * 32 + x) * 4
          expect(decoded.data[i]).toBe(original.data[i])
          expect(decoded.data[i + 1]).toBe(original.data[i + 1])
          expect(decoded.data[i + 2]).toBe(original.data[i + 2])
        }
      }
    })
  })

  describe('edge cases', () => {
    it('handles 1x1 image', () => {
      const original = createTestImageData(1, 1, { r: 255, g: 0, b: 0, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(1)
      expect(decoded.height).toBe(1)
      expect(decoded.data[0]).toBe(255)
      expect(decoded.data[1]).toBe(0)
      expect(decoded.data[2]).toBe(0)
      expect(decoded.data[3]).toBe(255)
    })

    it('handles wide image (100x1)', () => {
      const original = createTestImageData(100, 1, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(100)
      expect(decoded.height).toBe(1)
    })

    it('handles tall image (1x100)', () => {
      const original = createTestImageData(1, 100, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(1)
      expect(decoded.height).toBe(100)
    })

    it('handles non-power-of-2 dimensions', () => {
      const original = createTestImageData(17, 23, { r: 200, g: 100, b: 50, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(17)
      expect(decoded.height).toBe(23)
    })

    it('handles fully transparent image (32-bit)', () => {
      const original = createTestImageData(10, 10, { r: 0, g: 0, b: 0, a: 0 })
      const encoded = bmp.encode(original, { bitsPerPixel: 32 })
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(10)
      expect(decoded.height).toBe(10)
      // Check that alpha is preserved
      expect(decoded.data[3]).toBe(0)
    })

    it('handles image with varying alpha values', () => {
      const width = 10
      const height = 10
      const data = new Uint8Array(width * height * 4)

      // Create image with varying alpha
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = 255
        data[i * 4 + 1] = 128
        data[i * 4 + 2] = 64
        data[i * 4 + 3] = Math.floor((i / (width * height)) * 255)
      }

      const original = { data, width, height }
      const encoded = bmp.encode(original, { bitsPerPixel: 32 })
      const decoded = bmp.decode(encoded)

      // Check that alpha values are preserved
      for (let i = 0; i < width * height; i++) {
        expect(decoded.data[i * 4 + 3]).toBe(original.data[i * 4 + 3])
      }
    })
  })

  describe('color accuracy', () => {
    it('preserves pure red', () => {
      const original = createTestImageData(2, 2, { r: 255, g: 0, b: 0, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.data[0]).toBe(255)
      expect(decoded.data[1]).toBe(0)
      expect(decoded.data[2]).toBe(0)
    })

    it('preserves pure green', () => {
      const original = createTestImageData(2, 2, { r: 0, g: 255, b: 0, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.data[0]).toBe(0)
      expect(decoded.data[1]).toBe(255)
      expect(decoded.data[2]).toBe(0)
    })

    it('preserves pure blue', () => {
      const original = createTestImageData(2, 2, { r: 0, g: 0, b: 255, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.data[0]).toBe(0)
      expect(decoded.data[1]).toBe(0)
      expect(decoded.data[2]).toBe(255)
    })

    it('preserves white', () => {
      const original = createTestImageData(2, 2, { r: 255, g: 255, b: 255, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.data[0]).toBe(255)
      expect(decoded.data[1]).toBe(255)
      expect(decoded.data[2]).toBe(255)
    })

    it('preserves black', () => {
      const original = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.data[0]).toBe(0)
      expect(decoded.data[1]).toBe(0)
      expect(decoded.data[2]).toBe(0)
    })
  })

  describe('BMP file structure', () => {
    it('has correct file header structure', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(imageData)
      const view = new DataView(encoded.buffer)

      // Signature
      expect(view.getUint16(0, true)).toBe(0x4D42) // 'BM'

      // File size should be > 0
      const fileSize = view.getUint32(2, true)
      expect(fileSize).toBeGreaterThan(0)
      expect(fileSize).toBe(encoded.length)

      // Reserved should be 0
      expect(view.getUint16(6, true)).toBe(0)
      expect(view.getUint16(8, true)).toBe(0)

      // Data offset should be reasonable
      const dataOffset = view.getUint32(10, true)
      expect(dataOffset).toBeGreaterThan(14) // At least file header size
    })

    it('has correct info header for 32-bit with varying alpha (BITMAPV4HEADER)', () => {
      // Use a non-opaque alpha somewhere so the encoder picks V4+BITFIELDS.
      const data = new Uint8Array(10 * 10 * 4)
      for (let i = 0; i < 10 * 10; i++) {
        data[i * 4] = 128
        data[i * 4 + 1] = 128
        data[i * 4 + 2] = 128
        data[i * 4 + 3] = i === 0 ? 0 : 255 // first pixel transparent → forces V4
      }
      const encoded = bmp.encode({ data, width: 10, height: 10 }, { bitsPerPixel: 32 })
      const view = new DataView(encoded.buffer)

      // Header size should be 108 for BITMAPV4HEADER
      expect(view.getUint32(14, true)).toBe(108)
      expect(view.getInt32(18, true)).toBe(10)
      expect(view.getInt32(22, true)).toBe(10)
      expect(view.getUint16(26, true)).toBe(1)
      expect(view.getUint16(28, true)).toBe(32)
    })

    it('falls back to BITMAPINFOHEADER for fully-opaque 32-bit', () => {
      // Every alpha is 255 → encoder should emit a 40-byte BITMAPINFOHEADER
      // with BI_RGB compression (smaller file, broader reader compatibility).
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(imageData, { bitsPerPixel: 32 })
      const view = new DataView(encoded.buffer)

      expect(view.getUint32(14, true)).toBe(40) // BITMAPINFOHEADER
      expect(view.getUint16(28, true)).toBe(32) // bpp still 32
      expect(view.getUint32(30, true)).toBe(0) // BI_RGB

      // Round-trip still works through our own decoder.
      const decoded = bmp.decode(encoded)
      expect(decoded.data[0]).toBe(128)
      expect(decoded.data[3]).toBe(255)
    })

    it('has correct info header for 24-bit', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(imageData, { bitsPerPixel: 24 })
      const view = new DataView(encoded.buffer)

      // Header size should be 40 for BITMAPINFOHEADER
      const headerSize = view.getUint32(14, true)
      expect(headerSize).toBe(40)

      // Bits per pixel
      expect(view.getUint16(28, true)).toBe(24)
    })
  })

  describe('large images', () => {
    it('handles 500x500 image', () => {
      const original = createGradientImage(500, 500)
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(500)
      expect(decoded.height).toBe(500)
      expect(decoded.data.length).toBe(500 * 500 * 4)
    })

    it('handles 1000x1000 image', () => {
      const original = createTestImageData(1000, 1000, { r: 100, g: 150, b: 200, a: 255 })
      const encoded = bmp.encode(original)
      const decoded = bmp.decode(encoded)

      expect(decoded.width).toBe(1000)
      expect(decoded.height).toBe(1000)
      expect(decoded.data.length).toBe(1000 * 1000 * 4)
    }, 10000)
  })

  describe('input validation', () => {
    describe('encode', () => {
      it('rejects zero width', () => {
        expect(() => bmp.encode({ data: new Uint8Array(0), width: 0, height: 10 }))
          .toThrow(/positive integer/)
      })

      it('rejects negative height', () => {
        expect(() => bmp.encode({ data: new Uint8Array(40), width: 10, height: -1 }))
          .toThrow(/positive integer/)
      })

      it('rejects non-integer dimensions', () => {
        expect(() => bmp.encode({ data: new Uint8Array(40), width: 10.5, height: 10 }))
          .toThrow(/positive integer/)
      })

      it('rejects mismatched data length', () => {
        // 10x10 RGBA needs 400 bytes; supply 100.
        expect(() => bmp.encode({ data: new Uint8Array(100), width: 10, height: 10 }))
          .toThrow(/expected 400 bytes/)
      })

      it('accepts exact-length data', () => {
        const data = new Uint8Array(10 * 10 * 4)
        expect(() => bmp.encode({ data, width: 10, height: 10 })).not.toThrow()
      })
    })

    describe('decode', () => {
      it('rejects buffers smaller than the minimum header size', () => {
        expect(() => bmp.decode(new Uint8Array(4)))
          .toThrow(/buffer too small/)
      })

      it('rejects buffers truncated mid-header', () => {
        // Valid BM signature + claimed 108-byte info header but actual buffer too short.
        const buf = new Uint8Array(40)
        buf[0] = 0x42 // 'B'
        buf[1] = 0x4D // 'M'
        const view = new DataView(buf.buffer)
        view.setUint32(14, 108, true) // headerSize = 108 (BITMAPV4HEADER)
        expect(() => bmp.decode(buf)).toThrow(/truncated/)
      })

      it('still rejects bad signatures with a clear error', () => {
        const buf = new Uint8Array(64)
        buf[0] = 0x00
        buf[1] = 0x00
        const view = new DataView(buf.buffer)
        view.setUint32(14, 40, true) // pretend a 40-byte header so length check passes
        expect(() => bmp.decode(buf)).toThrow(/missing BM signature/)
      })
    })
  })

  describe('decode32Bit honors BITFIELDS masks', () => {
    // Build a 32-bit BMP with a non-default channel layout so that a decoder
    // which hardcodes BGRA will visibly swap channels. We use BITMAPV4HEADER
    // and store pixels as RGBA in memory order (R first instead of B first).
    function buildRgbaBitfieldsBmp(width: number, height: number, pixelsRgba: Uint8Array): Uint8Array {
      const headerSize = 14
      const infoHeaderSize = 108
      const rowSize = width * 4
      const fileSize = headerSize + infoHeaderSize + rowSize * height
      const buf = new Uint8Array(fileSize)
      const view = new DataView(buf.buffer)

      // File header
      view.setUint16(0, 0x4D42, true)
      view.setUint32(2, fileSize, true)
      view.setUint32(10, headerSize + infoHeaderSize, true)

      // BITMAPV4HEADER
      view.setUint32(14, 108, true)
      view.setInt32(18, width, true)
      view.setInt32(22, height, true)
      view.setUint16(26, 1, true)
      view.setUint16(28, 32, true)
      view.setUint32(30, 3, true) // BI_BITFIELDS
      view.setUint32(34, rowSize * height, true)
      // Masks for in-memory order R, G, B, A (i.e. when read as little-endian
      // uint32 the layout is A<<24 | B<<16 | G<<8 | R).
      view.setUint32(54, 0x000000FF, true) // R mask
      view.setUint32(58, 0x0000FF00, true) // G mask
      view.setUint32(62, 0x00FF0000, true) // B mask
      view.setUint32(66, 0xFF000000, true) // A mask

      // Pixel data, bottom-up, RGBA byte order.
      const dataOffset = headerSize + infoHeaderSize
      for (let y = 0; y < height; y++) {
        const srcY = height - 1 - y
        for (let x = 0; x < width; x++) {
          const src = (srcY * width + x) * 4
          const dst = dataOffset + y * rowSize + x * 4
          buf[dst] = pixelsRgba[src] // R
          buf[dst + 1] = pixelsRgba[src + 1] // G
          buf[dst + 2] = pixelsRgba[src + 2] // B
          buf[dst + 3] = pixelsRgba[src + 3] // A
        }
      }
      return buf
    }

    it('decodes RGBA-ordered 32-bit BITFIELDS without swapping channels', () => {
      const width = 4
      const height = 4
      const pixels = new Uint8Array(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        pixels[i * 4] = 200 // R
        pixels[i * 4 + 1] = 100 // G
        pixels[i * 4 + 2] = 50 // B
        pixels[i * 4 + 3] = 180 // A
      }

      const decoded = bmp.decode(buildRgbaBitfieldsBmp(width, height, pixels))

      expect(decoded.width).toBe(width)
      expect(decoded.height).toBe(height)
      expect(decoded.data[0]).toBe(200)
      expect(decoded.data[1]).toBe(100)
      expect(decoded.data[2]).toBe(50)
      expect(decoded.data[3]).toBe(180)
    })
  })

  describe('palette clamping', () => {
    // Builds a tiny 8-bit BMP with a deliberately-bogus colorsUsed to make
    // sure we don't read past the palette into pixel data.
    function build8BitBmpWithBadColorsUsed(): Uint8Array {
      const width = 2
      const height = 2
      const headerSize = 14
      const infoHeaderSize = 40
      const paletteSize = 256 * 4
      const paddedRow = Math.ceil(width / 4) * 4
      const pixelDataSize = paddedRow * height
      const fileSize = headerSize + infoHeaderSize + paletteSize + pixelDataSize
      const buf = new Uint8Array(fileSize)
      const view = new DataView(buf.buffer)

      view.setUint16(0, 0x4D42, true)
      view.setUint32(2, fileSize, true)
      view.setUint32(10, headerSize + infoHeaderSize + paletteSize, true)

      view.setUint32(14, 40, true)
      view.setInt32(18, width, true)
      view.setInt32(22, height, true)
      view.setUint16(26, 1, true)
      view.setUint16(28, 8, true)
      view.setUint32(30, 0, true)
      view.setUint32(34, pixelDataSize, true)
      // Lie about colorsUsed: claim 9999 even though max for 8-bit is 256.
      view.setUint32(46, 9999, true)

      // Palette: index 0 = black, index 1 = pure red (BGRA in BMP order).
      const palOffset = headerSize + infoHeaderSize
      buf[palOffset + 4 + 0] = 0 // B
      buf[palOffset + 4 + 1] = 0 // G
      buf[palOffset + 4 + 2] = 255 // R
      buf[palOffset + 4 + 3] = 0 // reserved

      // Fill 2x2 pixels with index 1 (red).
      const pixOffset = palOffset + paletteSize
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          buf[pixOffset + y * paddedRow + x] = 1
        }
      }
      return buf
    }

    it('clamps oversized colorsUsed without crashing or corrupting output', () => {
      const decoded = bmp.decode(build8BitBmpWithBadColorsUsed())
      expect(decoded.width).toBe(2)
      expect(decoded.height).toBe(2)
      // All four pixels should decode to red (palette index 1).
      for (let i = 0; i < 4; i++) {
        expect(decoded.data[i * 4]).toBe(255)
        expect(decoded.data[i * 4 + 1]).toBe(0)
        expect(decoded.data[i * 4 + 2]).toBe(0)
        expect(decoded.data[i * 4 + 3]).toBe(255)
      }
    })
  })

  describe('malformed input rejection', () => {
    // A byte-level "patch" helper. Writes a small set of fields into a copy of
    // an otherwise-valid BMP so each test can express *one* malformation
    // cheaply without rebuilding a whole BMP from scratch.
    type Patch
      = | { offset: number, type: 'u16', value: number }
        | { offset: number, type: 'u32', value: number }
        | { offset: number, type: 'i32', value: number }

    function patch(buf: Uint8Array, patches: Patch[]): Uint8Array {
      const copy = new Uint8Array(buf)
      const view = new DataView(copy.buffer)
      for (const p of patches) {
        if (p.type === 'u16')
          view.setUint16(p.offset, p.value, true)
        else if (p.type === 'u32')
          view.setUint32(p.offset, p.value, true)
        else
          view.setInt32(p.offset, p.value, true)
      }
      return copy
    }

    function validBmp(): Uint8Array {
      return bmp.encode(createTestImageData(4, 4, { r: 1, g: 2, b: 3, a: 255 }))
    }

    it('rejects negative width', () => {
      // Field offsets: width @ 18 (i32), height @ 22 (i32).
      const bad = patch(validBmp(), [{ offset: 18, type: 'i32', value: -5 }])
      expect(() => bmp.decode(bad)).toThrow(/non-positive width/)
    })

    it('rejects zero width', () => {
      const bad = patch(validBmp(), [{ offset: 18, type: 'i32', value: 0 }])
      expect(() => bmp.decode(bad)).toThrow(/non-positive width/)
    })

    it('rejects zero height', () => {
      const bad = patch(validBmp(), [{ offset: 22, type: 'i32', value: 0 }])
      expect(() => bmp.decode(bad)).toThrow(/zero height/)
    })

    it('accepts top-down orientation (negative height)', () => {
      // Negative height is legal — it just means top-down. Patch height to -4
      // and the row order in the buffer no longer matches, but the decoder
      // shouldn't *reject* the file based on the sign alone. We only check
      // that no error is thrown; pixel layout will be mirrored, which is
      // expected behavior given how BMP top-down works.
      const bad = patch(validBmp(), [{ offset: 22, type: 'i32', value: -4 }])
      expect(() => bmp.decode(bad)).not.toThrow()
    })

    it('rejects dimensions over the maximum', () => {
      const bad = patch(validBmp(), [{ offset: 18, type: 'i32', value: 100000 }])
      expect(() => bmp.decode(bad)).toThrow(/exceed maximum/)
    })

    it('rejects unknown info header sizes', () => {
      // headerSize @ 14 (u32). A claimed 13-byte header is nonsense.
      const bad = patch(validBmp(), [{ offset: 14, type: 'u32', value: 13 }])
      expect(() => bmp.decode(bad)).toThrow(/unknown info header size/)
    })

    it('rejects embedded JPEG compression', () => {
      // compression @ 30 (u32). Set to 4 (JPEG) and bpp to 24 to avoid the
      // "BITFIELDS requires 16/32 bpp" check firing first.
      const bad = patch(validBmp(), [
        { offset: 30, type: 'u32', value: 4 }, // BI_JPEG
        { offset: 28, type: 'u16', value: 24 }, // bpp
      ])
      expect(() => bmp.decode(bad)).toThrow(/JPEG compression is not supported/)
    })

    it('rejects embedded PNG compression', () => {
      const bad = patch(validBmp(), [
        { offset: 30, type: 'u32', value: 5 }, // BI_PNG
        { offset: 28, type: 'u16', value: 24 },
      ])
      expect(() => bmp.decode(bad)).toThrow(/PNG compression is not supported/)
    })

    it('rejects unknown compression values', () => {
      const bad = patch(validBmp(), [
        { offset: 30, type: 'u32', value: 99 },
        { offset: 28, type: 'u16', value: 24 },
      ])
      expect(() => bmp.decode(bad)).toThrow(/Unsupported BMP compression value/)
    })

    it('rejects RLE8 paired with non-8 bpp', () => {
      const bad = patch(validBmp(), [
        { offset: 30, type: 'u32', value: 1 }, // RLE8
        { offset: 28, type: 'u16', value: 24 },
      ])
      expect(() => bmp.decode(bad)).toThrow(/RLE8 compression requires 8 bpp/)
    })

    it('rejects BITFIELDS paired with 8 bpp', () => {
      const bad = patch(validBmp(), [
        { offset: 30, type: 'u32', value: 3 }, // BITFIELDS
        { offset: 28, type: 'u16', value: 8 },
      ])
      expect(() => bmp.decode(bad)).toThrow(/BITFIELDS compression requires 16 or 32 bpp/)
    })

    it('rejects dataOffset past end of buffer', () => {
      // dataOffset @ 10 (u32).
      const buf = validBmp()
      const bad = patch(buf, [{ offset: 10, type: 'u32', value: buf.length + 100 }])
      expect(() => bmp.decode(bad)).toThrow(/past end of buffer/)
    })

    it('rejects dataOffset overlapping headers', () => {
      const bad = patch(validBmp(), [{ offset: 10, type: 'u32', value: 20 }])
      expect(() => bmp.decode(bad)).toThrow(/overlaps headers/)
    })
  })

  describe('RLE truncation', () => {
    function buildRle8Header(rlePayload: Uint8Array): Uint8Array {
      const headerSize = 14
      const infoHeaderSize = 40
      const paletteSize = 256 * 4
      const dataOffset = headerSize + infoHeaderSize + paletteSize
      const buf = new Uint8Array(dataOffset + rlePayload.length)
      const view = new DataView(buf.buffer)

      view.setUint16(0, 0x4D42, true)
      view.setUint32(2, buf.length, true)
      view.setUint32(10, dataOffset, true)
      view.setUint32(14, 40, true)
      view.setInt32(18, 4, true) // width
      view.setInt32(22, 1, true) // height
      view.setUint16(26, 1, true)
      view.setUint16(28, 8, true) // 8 bpp
      view.setUint32(30, 1, true) // RLE8
      view.setUint32(34, rlePayload.length, true)
      // Palette index 0 = black; rest left as zeros, fine for this test.
      buf.set(rlePayload, dataOffset)
      return buf
    }

    it('throws on a single-byte RLE8 stream (incomplete opcode)', () => {
      const truncated = buildRle8Header(new Uint8Array([0x05]))
      expect(() => bmp.decode(truncated)).toThrow(/Truncated BMP RLE8 stream/)
    })

    it('throws on an RLE8 absolute run that runs past EOF', () => {
      // count=0, value=10 → absolute mode reading 10 bytes, but only 0 follow.
      const truncated = buildRle8Header(new Uint8Array([0x00, 0x0A]))
      expect(() => bmp.decode(truncated)).toThrow(/Truncated BMP RLE8 stream: absolute run/)
    })

    it('throws on an RLE8 delta escape with no payload', () => {
      // count=0, value=2 (delta) needs 2 more bytes; we provide none.
      const truncated = buildRle8Header(new Uint8Array([0x00, 0x02]))
      expect(() => bmp.decode(truncated)).toThrow(/Truncated BMP RLE8 stream: delta escape/)
    })

    it('throws when RLE8 stream lacks an end-of-bitmap marker', () => {
      // A run that "consumes" all data without ever emitting the (0,1) marker.
      // count=4, value=0 (palette idx 0) — valid run, but no terminator after.
      const truncated = buildRle8Header(new Uint8Array([0x04, 0x00]))
      expect(() => bmp.decode(truncated)).toThrow(/Truncated BMP RLE8 stream: opcode/)
    })
  })

  describe('Uint8ClampedArray support', () => {
    it('accepts Uint8ClampedArray as encode input', () => {
      const width = 8
      const height = 8
      const data = new Uint8ClampedArray(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        data[i * 4] = 200
        data[i * 4 + 1] = 100
        data[i * 4 + 2] = 50
        data[i * 4 + 3] = 255
      }

      const encoded = bmp.encode({ data, width, height })
      const decoded = bmp.decode(encoded)
      expect(decoded.width).toBe(width)
      expect(decoded.height).toBe(height)
      expect(decoded.data[0]).toBe(200)
      expect(decoded.data[1]).toBe(100)
      expect(decoded.data[2]).toBe(50)
      expect(decoded.data[3]).toBe(255)
    })

    it('produces identical output for Uint8Array and Uint8ClampedArray inputs', () => {
      const width = 4
      const height = 4
      const u8 = new Uint8Array(width * height * 4)
      for (let i = 0; i < u8.length; i++) u8[i] = (i * 13) & 0xFF
      const clamped = new Uint8ClampedArray(u8)

      const a = bmp.encode({ data: u8, width, height })
      const b = bmp.encode({ data: clamped, width, height })
      expect(a.length).toBe(b.length)
      for (let i = 0; i < a.length; i++)
        expect(b[i]).toBe(a[i])
    })
  })

  describe('planes validation', () => {
    it('rejects BMPs with planes != 1', () => {
      // Encode a valid BMP, then patch the planes field (offset 26, u16) to 2.
      const valid = bmp.encode(createTestImageData(4, 4, { r: 1, g: 2, b: 3, a: 255 }))
      const bad = new Uint8Array(valid)
      new DataView(bad.buffer).setUint16(26, 2, true)
      expect(() => bmp.decode(bad)).toThrow(/planes must be 1/)
    })
  })

  describe('indexed encoding (1/4/8-bit)', () => {
    // Helper to build an image whose pixels cycle through a known palette.
    function buildPalettizedImage(
      width: number,
      height: number,
      palette: Array<{ r: number, g: number, b: number }>,
    ): { data: Uint8Array, width: number, height: number } {
      const data = new Uint8Array(width * height * 4)
      for (let i = 0; i < width * height; i++) {
        const c = palette[i % palette.length]
        data[i * 4] = c.r
        data[i * 4 + 1] = c.g
        data[i * 4 + 2] = c.b
        data[i * 4 + 3] = 255
      }
      return { data, width, height }
    }

    it('round-trips a 1-bit BMP (2-color image)', () => {
      const original = buildPalettizedImage(8, 4, [
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
      ])
      const encoded = bmp.encode(original, { bitsPerPixel: 1 })

      // Header sanity: bpp=1, headerSize=40, palette has 2*4=8 bytes after header.
      const view = new DataView(encoded.buffer)
      expect(view.getUint32(14, true)).toBe(40)
      expect(view.getUint16(28, true)).toBe(1)
      expect(view.getUint32(30, true)).toBe(0) // BI_RGB

      const decoded = bmp.decode(encoded)
      expect(decoded.width).toBe(8)
      expect(decoded.height).toBe(4)
      for (let i = 0; i < original.data.length; i += 4) {
        expect(decoded.data[i]).toBe(original.data[i])
        expect(decoded.data[i + 1]).toBe(original.data[i + 1])
        expect(decoded.data[i + 2]).toBe(original.data[i + 2])
      }
    })

    it('round-trips a 4-bit BMP (16-color image)', () => {
      const palette: Array<{ r: number, g: number, b: number }> = []
      for (let i = 0; i < 16; i++)
        palette.push({ r: i * 16, g: 255 - i * 16, b: 128 })
      const original = buildPalettizedImage(16, 4, palette)
      const encoded = bmp.encode(original, { bitsPerPixel: 4 })

      const view = new DataView(encoded.buffer)
      expect(view.getUint16(28, true)).toBe(4)

      const decoded = bmp.decode(encoded)
      for (let i = 0; i < original.data.length; i += 4) {
        expect(decoded.data[i]).toBe(original.data[i])
        expect(decoded.data[i + 1]).toBe(original.data[i + 1])
        expect(decoded.data[i + 2]).toBe(original.data[i + 2])
      }
    })

    it('round-trips an 8-bit BMP (≤256 unique colors)', () => {
      const palette: Array<{ r: number, g: number, b: number }> = []
      for (let i = 0; i < 64; i++)
        palette.push({ r: (i * 4) & 0xFF, g: (i * 7) & 0xFF, b: (i * 11) & 0xFF })
      const original = buildPalettizedImage(8, 8, palette)
      const encoded = bmp.encode(original, { bitsPerPixel: 8 })

      const view = new DataView(encoded.buffer)
      expect(view.getUint16(28, true)).toBe(8)
      // colorsUsed should reflect actual unique color count (64).
      expect(view.getUint32(46, true)).toBe(64)

      const decoded = bmp.decode(encoded)
      for (let i = 0; i < original.data.length; i += 4) {
        expect(decoded.data[i]).toBe(original.data[i])
        expect(decoded.data[i + 1]).toBe(original.data[i + 1])
        expect(decoded.data[i + 2]).toBe(original.data[i + 2])
      }
    })

    it('handles row-padding correctly for awkward widths in 1-bit', () => {
      // Width 9 → ceil(9/8)=2 row bytes → padded to 4 bytes per row.
      const palette = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]
      const original = buildPalettizedImage(9, 3, palette)
      const decoded = bmp.decode(bmp.encode(original, { bitsPerPixel: 1 }))
      for (let i = 0; i < original.data.length; i += 4) {
        expect(decoded.data[i]).toBe(original.data[i])
        expect(decoded.data[i + 1]).toBe(original.data[i + 1])
        expect(decoded.data[i + 2]).toBe(original.data[i + 2])
      }
    })

    it('handles row-padding correctly for awkward widths in 4-bit', () => {
      // Width 5 → ceil(5/2)=3 row bytes → padded to 4 bytes.
      const palette = Array.from({ length: 8 }, (_, i) => ({ r: i * 32, g: 0, b: 0 }))
      const original = buildPalettizedImage(5, 3, palette)
      const decoded = bmp.decode(bmp.encode(original, { bitsPerPixel: 4 }))
      for (let i = 0; i < original.data.length; i += 4) {
        expect(decoded.data[i]).toBe(original.data[i])
        expect(decoded.data[i + 1]).toBe(original.data[i + 1])
        expect(decoded.data[i + 2]).toBe(original.data[i + 2])
      }
    })

    it('throws when a 1-bit image has more than 2 unique colors', () => {
      const original = buildPalettizedImage(4, 4, [
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 },
        { r: 128, g: 128, b: 128 },
      ])
      expect(() => bmp.encode(original, { bitsPerPixel: 1 }))
        .toThrow(/more than 2 unique colors/)
    })

    it('throws when an 8-bit image has more than 256 unique colors', () => {
      // 257 distinct colors: a row of i=0..256 with R=i (i wraps at 256 to 0,
      // so we tweak G to keep them unique).
      const data = new Uint8Array(257 * 1 * 4)
      for (let i = 0; i < 257; i++) {
        data[i * 4] = i & 0xFF
        data[i * 4 + 1] = i >> 8 // 0 for first 256, 1 for last → makes #257 unique
        data[i * 4 + 2] = 0
        data[i * 4 + 3] = 255
      }
      expect(() => bmp.encode({ data, width: 257, height: 1 }, { bitsPerPixel: 8 }))
        .toThrow(/more than 256 unique colors/)
    })

    it('uses a user-supplied palette and matches each pixel exactly', () => {
      // Build an image using only colors from a specific palette.
      const palette = new Uint8Array([
        10, 20, 30, 255,
        200, 100, 50, 255,
        0, 0, 0, 255,
        255, 255, 255, 255,
      ])
      const original = buildPalettizedImage(6, 3, [
        { r: 10, g: 20, b: 30 },
        { r: 200, g: 100, b: 50 },
      ])
      const encoded = bmp.encode(original, { bitsPerPixel: 4, palette })

      // colorsUsed should be 4 (palette size), not the number actually
      // referenced by pixels.
      expect(new DataView(encoded.buffer).getUint32(46, true)).toBe(4)

      const decoded = bmp.decode(encoded)
      for (let i = 0; i < original.data.length; i += 4) {
        expect(decoded.data[i]).toBe(original.data[i])
        expect(decoded.data[i + 1]).toBe(original.data[i + 1])
        expect(decoded.data[i + 2]).toBe(original.data[i + 2])
      }
    })

    it('throws when a pixel color is missing from the user-supplied palette', () => {
      const palette = new Uint8Array([
        0, 0, 0, 255,
        255, 255, 255, 255,
      ])
      // Image uses (128,128,128) which is not in the palette.
      const original = buildPalettizedImage(4, 4, [{ r: 128, g: 128, b: 128 }])
      expect(() => bmp.encode(original, { bitsPerPixel: 1, palette }))
        .toThrow(/not present in supplied palette/)
    })

    it('throws when supplied palette length is not a multiple of 4', () => {
      const palette = new Uint8Array([0, 0, 0])
      const original = buildPalettizedImage(2, 2, [{ r: 0, g: 0, b: 0 }])
      expect(() => bmp.encode(original, { bitsPerPixel: 1, palette }))
        .toThrow(/multiple of 4/)
    })

    it('throws when supplied palette has more entries than the bit depth allows', () => {
      // 3 entries for 1-bit (max 2).
      const palette = new Uint8Array(3 * 4)
      const original = buildPalettizedImage(2, 2, [{ r: 0, g: 0, b: 0 }])
      expect(() => bmp.encode(original, { bitsPerPixel: 1, palette }))
        .toThrow(/exceeds maximum 2 for 1-bit/)
    })

    it('throws when palette option is combined with 24-bit encoding', () => {
      const palette = new Uint8Array([0, 0, 0, 255])
      const original = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 })
      expect(() => bmp.encode(original, { bitsPerPixel: 24, palette }))
        .toThrow(/only applies to 1\/4\/8-bit/)
    })

    it('rejects unsupported bitsPerPixel values', () => {
      const original = createTestImageData(2, 2, { r: 0, g: 0, b: 0, a: 255 })
      // @ts-expect-error testing invalid input
      expect(() => bmp.encode(original, { bitsPerPixel: 16 }))
        .toThrow(/Unsupported bitsPerPixel/)
    })
  })
})
