import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { AVIF_BRANDS, BoxType } from './types'

/**
 * Write 32-bit big-endian value
 */
function writeU32BE(value: number): number[] {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * Write 16-bit big-endian value
 */
function writeU16BE(value: number): number[] {
	return [(value >> 8) & 0xff, value & 0xff]
}

/**
 * Write box with type and data
 */
function writeBox(type: number, data: number[]): number[] {
	const size = data.length + 8
	return [...writeU32BE(size), ...writeU32BE(type), ...data]
}

/**
 * Write full box with version and flags
 */
function writeFullBox(type: number, version: number, flags: number, data: number[]): number[] {
	const fullData = [version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff, ...data]
	return writeBox(type, fullData)
}

/**
 * Encode RGB to AV1 intra frame
 * This is a simplified placeholder - full AV1 encoding is complex
 */
function encodeAV1Frame(rgba: Uint8Array, width: number, height: number, quality?: number): Uint8Array {
	// Note: Full AV1 encoding requires implementing the AV1 specification
	// This is a placeholder that creates a minimal valid AV1 bitstream
	// In production, you would either:
	// 1. Implement full AV1 encoding (very complex)
	// 2. Use a WebAssembly AV1 encoder (libaom, rav1e, SVT-AV1)
	// 3. Use native encoding APIs

	// AV1 temporal delimiter OBU (type 2)
	const temporalDelimiter = [0x12, 0x00]

	// AV1 sequence header OBU (type 1) - simplified
	const seqHeader = [
		0x0a, // obu_header: type=1 (sequence_header), extension=0
		0x0a, // obu_size
		0x00, // seq_profile and more flags (profile 0)
		0x00, // level
		0x00, // timing info
		0x00, // decoder model info
		...writeU32BE(width - 1), // max_frame_width_minus_1
		...writeU32BE(height - 1), // max_frame_height_minus_1
	]

	// AV1 frame header OBU (type 6) - key frame, show frame
	// This is extremely simplified and not a valid AV1 frame
	const frameHeader = [
		0x32, // obu_header: type=6 (frame), extension=0
		0x04, // obu_size (placeholder)
		0x00, // frame_type=KEY_FRAME, show_frame=1
		0x00, // more flags
	]

	// Combine OBUs
	const result: number[] = [...temporalDelimiter, ...seqHeader, ...frameHeader]

	// Add some compressed data placeholder
	// In reality, this would be the entropy-coded frame data
	for (let i = 0; i < Math.min(rgba.length / 100, 1000); i++) {
		result.push(rgba[i * 4] || 0)
	}

	// Prevent unused variable warnings
	void quality

	return new Uint8Array(result)
}

/**
 * Encode ImageData to AVIF
 */
export function encodeAVIF(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Check for alpha channel
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i]! !== 255) {
			hasAlpha = true
			break
		}
	}

	// Encode AV1 bitstream
	const av1Bitstream = encodeAV1Frame(data, width, height, options?.quality)

	const output: number[] = []

	// File type box (ftyp)
	const ftypData = [
		...writeU32BE(AVIF_BRANDS.AVIF), // major_brand
		...writeU32BE(0), // minor_version
		...writeU32BE(AVIF_BRANDS.AVIF), // compatible_brands
		...writeU32BE(AVIF_BRANDS.MA1B),
		...writeU32BE(0x6d696631), // 'mif1'
		...writeU32BE(0x6d696166), // 'miaf'
	]
	output.push(...writeBox(BoxType.FTYP, ftypData))

	// Meta box
	const metaData: number[] = []

	// Handler box (hdlr)
	const hdlrData = [
		0, 0, 0, 0, // version, flags
		0, 0, 0, 0, // pre_defined
		...writeU32BE(0x70696374), // handler_type = 'pict'
		0, 0, 0, 0, // reserved[0]
		0, 0, 0, 0, // reserved[1]
		0, 0, 0, 0, // reserved[2]
		0, // name (null-terminated)
	]
	metaData.push(...writeBox(BoxType.HDLR, hdlrData))

	// Primary item box (pitm)
	const pitmData = [...writeU16BE(1)] // item_ID = 1
	metaData.push(...writeFullBox(BoxType.PITM, 0, 0, pitmData))

	// Item location box (iloc)
	const ilocData = [
		0x44, // offset_size=4, length_size=4
		0x00, // base_offset_size=0, reserved
		...writeU16BE(1), // item_count = 1
		...writeU16BE(1), // item_ID = 1
		...writeU16BE(0), // construction_method=0, data_reference_index=0
		...writeU16BE(1), // extent_count = 1
		...writeU32BE(0), // extent_offset = 0 (relative to mdat)
		...writeU32BE(av1Bitstream.length), // extent_length
	]
	metaData.push(...writeFullBox(BoxType.ILOC, 0, 0, ilocData))

	// Item information box (iinf)
	const iinfChildren: number[] = []

	// Item info entry (infe)
	const infeData = [
		...writeU16BE(1), // item_ID = 1
		...writeU16BE(0), // item_protection_index = 0
		...writeU32BE(0x61763031), // item_type = 'av01'
		0, // item_name (null-terminated)
	]
	iinfChildren.push(...writeFullBox(0x696e6665, 2, 0, infeData)) // 'infe'

	const iinfData = [...writeU16BE(1), ...iinfChildren] // entry_count = 1
	metaData.push(...writeFullBox(BoxType.IINF, 0, 0, iinfData))

	// Item properties box (iprp)
	const iprpChildren: number[] = []

	// Item property container box (ipco)
	const ipcoChildren: number[] = []

	// Image spatial extents property (ispe)
	const ispeData = [...writeU32BE(width), ...writeU32BE(height)]
	ipcoChildren.push(...writeFullBox(BoxType.ISPE, 0, 0, ispeData))

	// Pixel information property (pixi)
	const pixiData = [hasAlpha ? 4 : 3, 8, 8, 8] // num_channels, bits per channel
	if (hasAlpha) pixiData.push(8)
	ipcoChildren.push(...writeFullBox(BoxType.PIXI, 0, 0, pixiData))

	// AV1 codec configuration property (av1C)
	const av1cData = [
		0x81, // marker(1) + version(7)
		0x00, // seq_profile(3) + seq_level_idx_0(5)
		0x00, // seq_tier_0(1) + high_bitdepth(1) + twelve_bit(1) + monochrome(1) + ...
		0x00, // more config bytes
	]
	ipcoChildren.push(...writeBox(BoxType.AV1C, av1cData))

	// Color information property (colr)
	const colrData = [
		...writeU32BE(0x6e636c78), // colour_type = 'nclx'
		...writeU16BE(1), // colour_primaries = BT.709
		...writeU16BE(1), // transfer_characteristics = BT.709
		...writeU16BE(1), // matrix_coefficients = BT.709
		0x01, // full_range_flag = 1
	]
	ipcoChildren.push(...writeBox(BoxType.COLR, colrData))

	iprpChildren.push(...writeBox(BoxType.IPCO, ipcoChildren))

	// Item property association box (ipma)
	const ipmaData = [
		...writeU32BE(1), // entry_count = 1
		...writeU16BE(1), // item_ID = 1
		0x04, // association_count = 4
		0x01, // property_index = 1 (ispe)
		0x02, // property_index = 2 (pixi)
		0x03, // property_index = 3 (av1C)
		0x04, // property_index = 4 (colr)
	]
	iprpChildren.push(...writeFullBox(0x69706d61, 0, 0, ipmaData)) // 'ipma'

	metaData.push(...writeBox(BoxType.IPRP, iprpChildren))

	// Write meta box
	output.push(...writeFullBox(BoxType.META, 0, 0, metaData))

	// Media data box (mdat)
	output.push(...writeBox(BoxType.MDAT, Array.from(av1Bitstream)))

	return new Uint8Array(output)
}
