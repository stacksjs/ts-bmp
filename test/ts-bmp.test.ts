import { Buffer } from 'node:buffer'
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
      const arrayBuffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength)
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

    it('has correct info header for 32-bit', () => {
      const imageData = createTestImageData(10, 10, { r: 128, g: 128, b: 128, a: 255 })
      const encoded = bmp.encode(imageData, { bitsPerPixel: 32 })
      const view = new DataView(encoded.buffer)

      // Header size should be 108 for BITMAPV4HEADER
      const headerSize = view.getUint32(14, true)
      expect(headerSize).toBe(108)

      // Width and height
      expect(view.getInt32(18, true)).toBe(10) // Width
      expect(view.getInt32(22, true)).toBe(10) // Height

      // Planes should be 1
      expect(view.getUint16(26, true)).toBe(1)

      // Bits per pixel
      expect(view.getUint16(28, true)).toBe(32)
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
})
