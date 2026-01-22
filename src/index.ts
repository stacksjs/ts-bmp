export { decode } from './decoder'
export { encode } from './encoder'
export type { BmpImageData, BmpEncodeOptions, BmpFileHeader, BmpInfoHeader } from './types'
export { BmpCompression } from './types'

// Default export
import { decode } from './decoder'
import { encode } from './encoder'

export default {
  decode,
  encode,
}
