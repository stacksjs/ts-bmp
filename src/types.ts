/**
 * BMP image data.
 *
 * `data` is RGBA pixel bytes (4 per pixel). Both `Uint8Array` and
 * `Uint8ClampedArray` are accepted on input so Canvas `ImageData` (whose
 * `.data` is `Uint8ClampedArray`) can be passed straight to `encode()`.
 * `decode()` always returns a `Uint8Array`.
 */
export interface BmpImageData {
  /** Pixel data in RGBA format (4 bytes per pixel) */
  data: Uint8Array | Uint8ClampedArray
  /** Image width in pixels */
  width: number
  /** Image height in pixels */
  height: number
}

/**
 * BMP encoding options
 */
export interface BmpEncodeOptions {
  /**
   * Bits per pixel. Default: 32.
   *
   * - `1` / `4` / `8`: indexed (palette-based). The palette is built from the
   *   image's unique colors unless one is supplied via `palette`. Alpha is
   *   discarded for indexed encodings.
   * - `24`: BGR, no alpha.
   * - `32`: BGRA. If every alpha byte is 255 the encoder writes a compact
   *   `BITMAPINFOHEADER` (40 bytes) for maximum reader compatibility;
   *   otherwise it writes a `BITMAPV4HEADER` with explicit BITFIELDS masks
   *   so transparency is preserved.
   */
  bitsPerPixel?: 1 | 4 | 8 | 24 | 32
  /**
   * Optional palette for 1/4/8-bit encoding. RGBA bytes (alpha is ignored —
   * use 255 in each entry's alpha slot). Length must be a multiple of 4 and
   * must not exceed 2^bitsPerPixel entries.
   *
   * If supplied, every pixel's RGB must match an entry exactly, otherwise
   * encoding throws (this library does not perform color quantization).
   */
  palette?: Uint8Array | Uint8ClampedArray
}

/**
 * BMP file header (14 bytes)
 */
export interface BmpFileHeader {
  /** Magic number ('BM') */
  signature: number
  /** File size in bytes */
  fileSize: number
  /** Reserved (should be 0) */
  reserved1: number
  /** Reserved (should be 0) */
  reserved2: number
  /** Offset to pixel data */
  dataOffset: number
}

/**
 * BMP info header (BITMAPINFOHEADER - 40 bytes)
 */
export interface BmpInfoHeader {
  /** Header size (40 for BITMAPINFOHEADER) */
  headerSize: number
  /** Image width */
  width: number
  /** Image height (positive = bottom-up, negative = top-down) */
  height: number
  /** Number of color planes (always 1) */
  planes: number
  /** Bits per pixel (1, 4, 8, 16, 24, 32) */
  bitsPerPixel: number
  /** Compression method */
  compression: number
  /** Image size (can be 0 for uncompressed) */
  imageSize: number
  /** Horizontal resolution (pixels per meter) */
  xPixelsPerMeter: number
  /** Vertical resolution (pixels per meter) */
  yPixelsPerMeter: number
  /** Number of colors in palette (0 = max) */
  colorsUsed: number
  /** Number of important colors (0 = all) */
  colorsImportant: number
}

/**
 * BMP compression types
 */
export enum BmpCompression {
  /** No compression */
  RGB = 0,
  /** RLE 8-bit/pixel */
  RLE8 = 1,
  /** RLE 4-bit/pixel */
  RLE4 = 2,
  /** Bit field (16 or 32 bit) */
  BITFIELDS = 3,
  /** JPEG compression (for printers) */
  JPEG = 4,
  /** PNG compression (for printers) */
  PNG = 5,
  /** RGBA bit field masks */
  ALPHABITFIELDS = 6,
}
