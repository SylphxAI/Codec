import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	BRAND_HEIC,
	BRAND_MIF1,
	COLR,
	FTYP,
	HDLR,
	HANDLER_PICT,
	IINF,
	ILOC,
	INFE,
	IPCO,
	IPMA,
	IPRP,
	ISPE,
	ITEM_TYPE_HVC1,
	MDAT,
	META,
	PITM,
	PIXI,
} from './types'

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
 * Write box header
 */
function writeBoxHeader(type: number, size: number): number[] {
	return [...writeU32BE(size), ...writeU32BE(type)]
}

/**
 * Write full box header (with version and flags)
 */
function writeFullBoxHeader(type: number, size: number, version: number, flags: number): number[] {
	return [...writeBoxHeader(type, size), version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]
}

/**
 * Encode ImageData to HEIC
 */
export function encodeHeic(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image
	const quality = options?.quality ?? 80

	// Encode HEVC intra frame
	const hevcData = encodeHevcIntraFrame(data, width, height, quality)

	// Build HEIF container
	const output: number[] = []

	// 1. ftyp box
	output.push(...writeFtypBox())

	// 2. meta box (contains all metadata and item info)
	const metaData = writeMetaBox(width, height)
	output.push(...metaData)

	// 3. mdat box (contains actual HEVC data)
	const mdatData = writeMdatBox(hevcData)
	output.push(...mdatData)

	return new Uint8Array(output)
}

/**
 * Write ftyp (file type) box
 */
function writeFtypBox(): number[] {
	const majorBrand = BRAND_HEIC
	const minorVersion = 0
	const compatibleBrands = [BRAND_MIF1, BRAND_HEIC]

	const data = [
		...writeU32BE(majorBrand),
		...writeU32BE(minorVersion),
		...compatibleBrands.flatMap((b) => writeU32BE(b)),
	]

	return writeBoxHeader(FTYP, 8 + data.length).concat(data)
}

/**
 * Write meta box
 */
function writeMetaBox(width: number, height: number): number[] {
	const children: number[] = []

	// hdlr box (handler)
	children.push(...writeHdlrBox())

	// pitm box (primary item)
	children.push(...writePitmBox(1))

	// iloc box (item location)
	children.push(...writeIlocBox())

	// iinf box (item information)
	children.push(...writeIinfBox())

	// iprp box (item properties)
	children.push(...writeIprpBox(width, height))

	const data = [...writeU32BE(0), ...children] // version=0, flags=0

	return writeBoxHeader(META, 8 + data.length).concat(data)
}

/**
 * Write hdlr (handler) box
 */
function writeHdlrBox(): number[] {
	const data = [
		0,
		0,
		0,
		0, // version + flags
		...writeU32BE(0), // pre_defined
		...writeU32BE(HANDLER_PICT), // handler_type
		...writeU32BE(0), // reserved
		...writeU32BE(0), // reserved
		...writeU32BE(0), // reserved
		0, // name (empty null-terminated string)
	]

	return writeBoxHeader(HDLR, 8 + data.length).concat(data)
}

/**
 * Write pitm (primary item) box
 */
function writePitmBox(itemId: number): number[] {
	const data = [
		0,
		0,
		0,
		0, // version=0, flags=0
		...writeU16BE(itemId),
	]

	return writeBoxHeader(PITM, 8 + data.length).concat(data)
}

/**
 * Write iloc (item location) box
 */
function writeIlocBox(): number[] {
	const version = 0
	const offsetSize = 4
	const lengthSize = 4
	const baseOffsetSize = 0
	const indexSize = 0

	const data = [
		version,
		0,
		0,
		0, // version + flags
		(offsetSize << 4) | lengthSize, // offset_size and length_size
		(baseOffsetSize << 4) | indexSize, // base_offset_size and index_size
		...writeU16BE(1), // item_count = 1
		...writeU16BE(1), // item_id = 1
		...writeU16BE(0), // data_reference_index = 0 (same file)
		...writeU16BE(1), // extent_count = 1
		...writeU32BE(0), // extent_offset = 0 (from start of mdat)
		...writeU32BE(0), // extent_length (will be updated)
	]

	return writeBoxHeader(ILOC, 8 + data.length).concat(data)
}

/**
 * Write iinf (item information) box
 */
function writeIinfBox(): number[] {
	const infeData = writeInfeBox()
	const data = [
		0,
		0,
		0,
		0, // version=0, flags=0
		...writeU16BE(1), // entry_count = 1
		...infeData,
	]

	return writeBoxHeader(IINF, 8 + data.length).concat(data)
}

/**
 * Write infe (item info entry) box
 */
function writeInfeBox(): number[] {
	const data = [
		2,
		0,
		0,
		0, // version=2, flags=0
		...writeU16BE(1), // item_id = 1
		...writeU16BE(0), // item_protection_index = 0
		...writeU32BE(ITEM_TYPE_HVC1), // item_type = 'hvc1'
		...Array.from('Image').map((c) => c.charCodeAt(0)), // item_name
		0, // null terminator
	]

	return writeBoxHeader(INFE, 8 + data.length).concat(data)
}

/**
 * Write iprp (item properties) box
 */
function writeIprpBox(width: number, height: number): number[] {
	const ipcoData = writeIpcoBox(width, height)
	const ipmaData = writeIpmaBox()

	const data = [...ipcoData, ...ipmaData]

	return writeBoxHeader(IPRP, 8 + data.length).concat(data)
}

/**
 * Write ipco (item property container) box
 */
function writeIpcoBox(width: number, height: number): number[] {
	const properties: number[] = []

	// ispe (image spatial extents)
	properties.push(...writeIspeBox(width, height))

	// pixi (pixel information)
	properties.push(...writePixiBox())

	// colr (color information)
	properties.push(...writeColrBox())

	return writeBoxHeader(IPCO, 8 + properties.length).concat(properties)
}

/**
 * Write ispe (image spatial extents) property
 */
function writeIspeBox(width: number, height: number): number[] {
	const data = [
		0,
		0,
		0,
		0, // version=0, flags=0
		...writeU32BE(width),
		...writeU32BE(height),
	]

	return writeBoxHeader(ISPE, 8 + data.length).concat(data)
}

/**
 * Write pixi (pixel information) property
 */
function writePixiBox(): number[] {
	const data = [
		0,
		0,
		0,
		0, // version=0, flags=0
		3, // num_channels = 3 (RGB)
		8,
		8,
		8, // bits_per_channel
	]

	return writeBoxHeader(PIXI, 8 + data.length).concat(data)
}

/**
 * Write colr (color information) property
 */
function writeColrBox(): number[] {
	const data = [
		...writeU32BE(0x6e636c78), // 'nclx' - color type
		...writeU16BE(1), // color_primaries = BT.709
		...writeU16BE(1), // transfer_characteristics = BT.709
		...writeU16BE(1), // matrix_coefficients = BT.709
		0x80, // full_range_flag = 1
	]

	return writeBoxHeader(COLR, 8 + data.length).concat(data)
}

/**
 * Write ipma (item property association) box
 */
function writeIpmaBox(): number[] {
	const data = [
		0,
		0,
		0,
		0, // version=0, flags=0
		...writeU32BE(1), // entry_count = 1
		...writeU16BE(1), // item_id = 1
		3, // association_count = 3
		1, // property_index = 1 (ispe)
		2, // property_index = 2 (pixi)
		3, // property_index = 3 (colr)
	]

	return writeBoxHeader(IPMA, 8 + data.length).concat(data)
}

/**
 * Write mdat (media data) box
 */
function writeMdatBox(hevcData: Uint8Array): number[] {
	const data = Array.from(hevcData)
	return writeBoxHeader(MDAT, 8 + data.length).concat(data)
}

/**
 * Encode HEVC intra frame from ImageData (placeholder)
 */
function encodeHevcIntraFrame(data: Uint8Array, width: number, height: number, quality: number): Uint8Array {
	// HEVC encoding is extremely complex and typically requires hardware acceleration
	// or a full HEVC encoder library. For a pure TypeScript implementation,
	// this is a placeholder that would need a complete HEVC encoder.
	//
	// In practice, you would:
	// 1. Convert RGB to YUV
	// 2. Perform intra prediction
	// 3. Transform (DCT)
	// 4. Quantization (based on quality)
	// 5. Entropy coding
	// 6. Build NAL units (VPS, SPS, PPS, slices)
	// 7. Package as hvcC configuration or Annex B format

	throw new Error(
		'HEVC encoding is not yet implemented. ' +
			'HEVC is a complex codec requiring significant implementation. ' +
			'Consider using a WASM-based encoder or system codec for production use.'
	)

	// Placeholder: generate minimal HEVC header
	// In reality, this would be a complete HEVC bitstream
	// const output: number[] = []
	//
	// // hvcC configuration box format
	// output.push(
	// 	1, // configurationVersion
	// 	0, 0, // general_profile_space, tier, profile_idc
	// 	0, 0, 0, 0, // general_profile_compatibility_flags
	// 	0, 0, 0, 0, 0, 0, // general_constraint_indicator_flags
	// 	0, // general_level_idc
	// 	0xf0, 0, // min_spatial_segmentation_idc
	// 	0xfc, // parallelismType
	// 	0xfd, // chromaFormat
	// 	0xf8, // bitDepthLumaMinus8
	// 	0xf8, // bitDepthChromaMinus8
	// 	0, 0, // avgFrameRate
	// 	0, // constantFrameRate, numTemporalLayers, etc.
	// 	0, // numOfArrays
	// )
	//
	// return new Uint8Array(output)
}
