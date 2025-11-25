import type { EncodeOptions, ImageCodec, ImageData } from '@sylphx/codec-core'
import { decodeBpg } from './decoder'
import { encodeBpg } from './encoder'

/**
 * BPG (Better Portable Graphics) codec implementation
 *
 * BPG is a high-efficiency image format based on HEVC (H.265) intra-frame compression.
 * It was created by Fabrice Bellard and provides superior compression compared to JPEG,
 * PNG, and WebP while supporting high bit depths, alpha channels, and various color spaces.
 *
 * Key features:
 * - Uses HEVC/H.265 intra-frame encoding
 * - Supports lossless and lossy compression
 * - Supports 8-14 bit color depth
 * - Supports alpha channel
 * - Multiple color spaces (YCbCr, RGB, YCgCo, BT.709, BT.2020)
 * - Multiple chroma subsampling formats (4:2:0, 4:2:2, 4:4:4, grayscale)
 * - Optional metadata (EXIF, ICC, XMP)
 * - Animation support
 *
 * File structure:
 * 1. Magic: 0x425047FB (4 bytes)
 * 2. Format flags: format, alpha, bit depth (1 byte)
 * 3. Picture dimensions: width, height (variable length)
 * 4. Picture data length (variable length)
 * 5. Extension flags: color space, etc. (1 byte)
 * 6. Extension data: EXIF, ICC, etc. (optional, variable length)
 * 7. Picture data: HEVC bitstream (variable length)
 *
 * Note: Full HEVC encoding/decoding is extremely complex and typically
 * requires hardware acceleration or specialized libraries. This implementation
 * provides the BPG container parsing but HEVC codec implementation is a placeholder.
 */
export const BpgCodec: ImageCodec = {
	format: 'bpg',

	decode(data: Uint8Array): ImageData {
		return decodeBpg(data)
	},

	encode(image: ImageData, options?: EncodeOptions): Uint8Array {
		return encodeBpg(image, options)
	},
}
