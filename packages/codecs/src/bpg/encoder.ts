import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	BPG_CS_YCbCr,
	BPG_FORMAT_444,
	BPG_MAGIC,
} from './types'

/**
 * Write 32-bit big-endian value
 */
function writeU32BE(value: number): number[] {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * Write unsigned variable-length integer (exponential golomb)
 */
function writeUE7(value: number): number[] {
	if (value === 0) {
		return [0]
	}

	const bytes: number[] = []
	let remaining = value

	// Determine how many bytes needed
	const numBytes = Math.ceil(Math.log2(value + 1) / 7)

	for (let i = numBytes - 1; i >= 0; i--) {
		const shift = i * 7
		let byte = (remaining >> shift) & 0x7f

		// Set continuation bit for all but last byte
		if (i > 0) {
			byte |= 0x80
		}

		bytes.push(byte)
		remaining &= (1 << shift) - 1
	}

	return bytes
}

/**
 * Encode ImageData to BPG
 */
export function encodeBpg(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image
	const quality = options?.quality ?? 80
	const lossless = options?.lossless ?? false

	// Encode HEVC intra frame
	const hevcData = encodeHevcIntraFrame(data, width, height, quality, lossless)

	// Build BPG file
	const output: number[] = []

	// 1. Magic number (4 bytes)
	output.push(...writeU32BE(BPG_MAGIC))

	// 2. Format flags (1 byte)
	// bit 0-2: format (444 = YCbCr 4:4:4)
	// bit 3: alpha plane flag (0 = no alpha)
	// bit 4-7: bit_depth_minus_8 (0 = 8 bits)
	const format = BPG_FORMAT_444
	const hasAlpha = false // For simplicity, no alpha in this implementation
	const bitDepthMinus8 = 0 // 8 bits
	const formatFlags = format | (hasAlpha ? 0x08 : 0) | (bitDepthMinus8 << 4)
	output.push(formatFlags)

	// 3. Picture width (variable length)
	output.push(...writeUE7(width))

	// 4. Picture height (variable length)
	output.push(...writeUE7(height))

	// 5. Picture data length (variable length)
	output.push(...writeUE7(hevcData.length))

	// 6. Extension flags (1 byte)
	// bit 0: has extensions (0 = no)
	// bit 1: alpha_plane_flag (0 = not first)
	// bit 2: premultiplied_alpha (0 = no)
	// bit 3: limited_range (0 = full range)
	// bit 4-7: color_space (0 = YCbCr)
	const hasExtensions = false
	const colorSpace = BPG_CS_YCbCr
	const extensionFlags = (hasExtensions ? 0x01 : 0) | (colorSpace << 4)
	output.push(extensionFlags)

	// 7. Extension data (if any)
	if (hasExtensions) {
		output.push(...writeUE7(0)) // No extensions
	}

	// 8. Picture data (HEVC bitstream)
	output.push(...Array.from(hevcData))

	return new Uint8Array(output)
}

/**
 * Encode HEVC intra frame from ImageData
 */
function encodeHevcIntraFrame(
	data: Uint8Array,
	width: number,
	height: number,
	quality: number,
	lossless: boolean
): Uint8Array {
	// HEVC encoding is extremely complex and requires:
	// 1. Convert RGB to YUV (based on color space)
	// 2. Split into coding tree units (CTUs)
	// 3. Perform intra prediction (multiple modes)
	// 4. Transform (DCT) and quantization (based on quality/QP)
	// 5. Entropy coding (CABAC or CAVLC)
	// 6. Build NAL units:
	//    - VPS (Video Parameter Set)
	//    - SPS (Sequence Parameter Set)
	//    - PPS (Picture Parameter Set)
	//    - Slice segments (coded image data)
	// 7. Apply in-loop filters (deblocking, SAO)
	// 8. Package as length-prefixed NAL units

	// This would require a full HEVC encoder implementation, which is beyond
	// the scope of a pure TypeScript codec. In production, you would use:
	// - A WASM-based HEVC encoder (e.g., x265 compiled to WASM)
	// - Hardware encoder APIs
	// - Existing encoder libraries

	throw new Error(
		'HEVC encoding is not yet implemented. ' +
			'BPG uses HEVC (H.265) compression which is extremely complex. ' +
			`Image dimensions: ${width}x${height}, ` +
			`quality: ${quality}, ` +
			`lossless: ${lossless}. ` +
			'HEVC encoding requires complex video codec implementation. ' +
			'Consider using a WASM-based encoder (e.g., x265) or system codec for production use.'
	)

	// Placeholder implementation would generate minimal HEVC headers:
	// const nalUnits: number[] = []
	//
	// // VPS NAL unit (minimal)
	// const vpsData = generateMinimalVPS(width, height)
	// nalUnits.push(...writeU32BE(vpsData.length), ...vpsData)
	//
	// // SPS NAL unit (minimal)
	// const spsData = generateMinimalSPS(width, height, quality)
	// nalUnits.push(...writeU32BE(spsData.length), ...spsData)
	//
	// // PPS NAL unit (minimal)
	// const ppsData = generateMinimalPPS()
	// nalUnits.push(...writeU32BE(ppsData.length), ...ppsData)
	//
	// // IDR slice (would contain actual image data)
	// const sliceData = new Uint8Array([
	// 	0x26, 0x01, // NAL header (IDR_W_RADL)
	// 	// ... coded slice data would go here
	// ])
	// nalUnits.push(...writeU32BE(sliceData.length), ...Array.from(sliceData))
	//
	// return new Uint8Array(nalUnits)
}
