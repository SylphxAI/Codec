import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeJxl } from './decoder'
import { encodeJxl } from './encoder'
import type { JxlEncodeOptions } from './types'

/**
 * JPEG XL (JXL) codec implementation
 *
 * Note: This is a simplified pure TypeScript implementation that demonstrates
 * JXL structure and basic encoding/decoding principles. For production use
 * with full JXL features (ANS entropy coding, advanced transforms, etc.),
 * consider using libjxl via WebAssembly.
 *
 * Features:
 * - Container and naked codestream format support
 * - Header parsing for dimensions and metadata
 * - Basic lossless and lossy encoding
 * - VarInt encoding/decoding
 *
 * Limitations:
 * - Simplified entropy coding (not ANS)
 * - No XYB color space conversion
 * - No advanced prediction or transforms
 * - Limited compression efficiency
 */
export const JxlCodec: ImageCodec = {
	format: 'jxl' as const,

	decode(data: Uint8Array): ImageData {
		return decodeJxl(data)
	},

	encode(image: ImageData, options?: EncodeOptions & JxlEncodeOptions): Uint8Array {
		return encodeJxl(image, options)
	},
}
