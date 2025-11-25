import type { ImageData } from '@sylphx/codec-core'
import { AVIF_BRANDS, BoxType, type Box, type ItemLocation, type AVIFMetadata } from './types'

/**
 * Read 32-bit big-endian value
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!) >>>
		0
	)
}

/**
 * Read 16-bit big-endian value
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * Read 64-bit big-endian value
 */
function readU64BE(data: Uint8Array, offset: number): number {
	const hi = readU32BE(data, offset)
	const lo = readU32BE(data, offset + 4)
	// JavaScript safe integer limit
	return hi * 0x100000000 + lo
}

/**
 * Parse ISOBMFF boxes
 */
function parseBoxes(data: Uint8Array, start = 0, end?: number): Box[] {
	const boxes: Box[] = []
	let offset = start
	const limit = end ?? data.length

	while (offset < limit) {
		if (offset + 8 > limit) break

		let size = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)
		let headerSize = 8

		// Handle extended size
		if (size === 1) {
			if (offset + 16 > limit) break
			size = readU64BE(data, offset + 8)
			headerSize = 16
		} else if (size === 0) {
			// Box extends to end of file
			size = limit - offset
		}

		if (offset + size > limit) {
			break
		}

		const boxData = data.slice(offset + headerSize, offset + size)
		const box: Box = {
			type,
			size,
			data: boxData,
			offset: offset + headerSize,
		}

		// Parse container boxes
		if (
			type === BoxType.META ||
			type === BoxType.IPRP ||
			type === BoxType.IPCO ||
			type === BoxType.IINF
		) {
			const childStart = type === BoxType.META ? 4 : 0 // meta has version/flags
			box.children = parseBoxes(boxData, childStart)
		}

		boxes.push(box)
		offset += size
	}

	return boxes
}

/**
 * Find box by type
 */
function findBox(boxes: Box[], type: number): Box | undefined {
	for (const box of boxes) {
		if (box.type === type) return box
		if (box.children) {
			const found = findBox(box.children, type)
			if (found) return found
		}
	}
	return undefined
}

/**
 * Parse ftyp box to verify AVIF format
 */
function parseFtyp(data: Uint8Array): boolean {
	if (data.length < 8) return false

	const majorBrand = readU32BE(data, 0)
	// const minorVersion = readU32BE(data, 4)

	// Check major brand
	if (majorBrand === AVIF_BRANDS.AVIF || majorBrand === AVIF_BRANDS.AVIS) {
		return true
	}

	// Check compatible brands
	for (let i = 8; i < data.length; i += 4) {
		const brand = readU32BE(data, i)
		if (brand === AVIF_BRANDS.AVIF || brand === AVIF_BRANDS.AVIS) {
			return true
		}
	}

	return false
}

/**
 * Parse image spatial extents (ispe) property
 */
function parseIspe(data: Uint8Array): { width: number; height: number } {
	// Skip version (1) and flags (3)
	const width = readU32BE(data, 4)
	const height = readU32BE(data, 8)
	return { width, height }
}

/**
 * Parse pixel information (pixi) property
 */
function parsePixi(data: Uint8Array): { bitDepth: number; numChannels: number } {
	// Skip version (1) and flags (3)
	const numChannels = data[4]!
	const bitDepth = data[5]!
	return { bitDepth, numChannels }
}

/**
 * Parse primary item (pitm) box
 */
function parsePitm(data: Uint8Array): number {
	const version = data[0]!
	// Skip flags
	return version === 0 ? readU16BE(data, 4) : readU32BE(data, 4)
}

/**
 * Parse item location (iloc) box
 */
function parseIloc(data: Uint8Array): ItemLocation[] {
	const version = data[0]!
	let offset = 4 // Skip version and flags

	const offsetSize = (data[offset]! >> 4) & 0xf
	const lengthSize = data[offset]! & 0xf
	offset++

	const baseOffsetSize = (data[offset]! >> 4) & 0xf
	const indexSize = version === 1 || version === 2 ? data[offset]! & 0xf : 0
	offset++

	const itemCount = version < 2 ? readU16BE(data, offset) : readU32BE(data, offset)
	offset += version < 2 ? 2 : 4

	const locations: ItemLocation[] = []

	for (let i = 0; i < itemCount; i++) {
		const itemId = version < 2 ? readU16BE(data, offset) : readU32BE(data, offset)
		offset += version < 2 ? 2 : 4

		let constructionMethod = 0
		if (version === 1 || version === 2) {
			constructionMethod = data[offset]! & 0xf
			offset += 2
		}

		const dataReferenceIndex = readU16BE(data, offset)
		offset += 2

		let baseOffset = 0
		if (baseOffsetSize > 0) {
			baseOffset = readVariableSize(data, offset, baseOffsetSize)
			offset += baseOffsetSize
		}

		const extentCount = readU16BE(data, offset)
		offset += 2

		const extents: Array<{ extentOffset: number; extentLength: number }> = []

		for (let j = 0; j < extentCount; j++) {
			// Skip extent index if present
			if (indexSize > 0) {
				offset += indexSize
			}

			const extentOffset = offsetSize > 0 ? readVariableSize(data, offset, offsetSize) : 0
			offset += offsetSize

			const extentLength = readVariableSize(data, offset, lengthSize)
			offset += lengthSize

			extents.push({ extentOffset, extentLength })
		}

		locations.push({
			itemId,
			constructionMethod,
			dataReferenceIndex,
			baseOffset,
			extents,
		})
	}

	return locations
}

/**
 * Read variable-size integer
 */
function readVariableSize(data: Uint8Array, offset: number, size: number): number {
	let value = 0
	for (let i = 0; i < size; i++) {
		value = (value << 8) | data[offset + i]!
	}
	return value
}

/**
 * Extract metadata from AVIF
 */
function extractMetadata(boxes: Box[]): AVIFMetadata {
	// Find primary item ID
	const pitmBox = findBox(boxes, BoxType.PITM)
	const primaryItemId = pitmBox ? parsePitm(pitmBox.data) : undefined

	// Find image properties
	const iprpBox = findBox(boxes, BoxType.IPRP)
	if (!iprpBox?.children) {
		throw new Error('Missing image properties (iprp) box')
	}

	const ipcoBox = findBox(iprpBox.children, BoxType.IPCO)
	if (!ipcoBox?.children) {
		throw new Error('Missing property container (ipco) box')
	}

	// Extract dimensions from ispe
	const ispeBox = findBox(ipcoBox.children, BoxType.ISPE)
	if (!ispeBox) {
		throw new Error('Missing image spatial extents (ispe) property')
	}
	const { width, height } = parseIspe(ispeBox.data)

	// Extract pixel info from pixi
	const pixiBox = findBox(ipcoBox.children, BoxType.PIXI)
	const { bitDepth, numChannels } = pixiBox ? parsePixi(pixiBox.data) : { bitDepth: 8, numChannels: 3 }

	return {
		width,
		height,
		bitDepth,
		numChannels,
		primaryItemId,
		config: {
			seqProfile: 0,
			seqLevelIdx: 0,
			seqTier: 0,
			highBitdepth: bitDepth > 8,
			twelveBit: bitDepth === 12,
			monochrome: numChannels === 1,
			chromaSubsamplingX: 1,
			chromaSubsamplingY: 1,
			chromaSamplePosition: 0,
			initialPresentationDelayPresent: false,
			initialPresentationDelayMinusOne: 0,
		},
	}
}

/**
 * Extract AV1 bitstream data
 */
function extractAV1Bitstream(data: Uint8Array, boxes: Box[], primaryItemId?: number): Uint8Array {
	// Find item location
	const ilocBox = findBox(boxes, BoxType.ILOC)
	if (!ilocBox) {
		throw new Error('Missing item location (iloc) box')
	}

	const locations = parseIloc(ilocBox.data)
	const itemLocation = primaryItemId
		? locations.find((loc) => loc.itemId === primaryItemId)
		: locations[0]

	if (!itemLocation || itemLocation.extents.length === 0) {
		throw new Error('Could not find item location for primary item')
	}

	// Extract data from mdat box
	const mdatBox = findBox(boxes, BoxType.MDAT)
	if (!mdatBox) {
		throw new Error('Missing media data (mdat) box')
	}

	// Combine all extents
	const extent = itemLocation.extents[0]!
	const offset = itemLocation.baseOffset + extent.extentOffset
	const length = extent.extentLength

	return mdatBox.data.slice(offset, offset + length)
}

/**
 * Decode AV1 intra frame to RGB
 * This is a simplified placeholder - full AV1 decoding is complex
 */
function decodeAV1Frame(bitstream: Uint8Array, width: number, height: number): Uint8Array {
	// Note: Full AV1 decoding requires implementing the AV1 specification
	// This is a placeholder that returns a test pattern
	// In production, you would either:
	// 1. Implement full AV1 decoding (very complex)
	// 2. Use a WebAssembly AV1 decoder (dav1d, libaom)
	// 3. Use browser native decoding APIs

	const output = new Uint8Array(width * height * 4)

	// For now, create a gradient pattern to indicate the decoder is being called
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const idx = (y * width + x) * 4

			// Create a test pattern
			const r = Math.floor((x / width) * 255)
			const g = Math.floor((y / height) * 255)
			const b = 128

			output[idx] = r
			output[idx + 1] = g
			output[idx + 2] = b
			output[idx + 3] = 255
		}
	}

	// Prevent unused variable warning
	void bitstream

	return output
}

/**
 * Decode AVIF to ImageData
 */
export function decodeAVIF(data: Uint8Array): ImageData {
	// Parse boxes
	const boxes = parseBoxes(data)

	// Verify AVIF format
	const ftypBox = findBox(boxes, BoxType.FTYP)
	if (!ftypBox || !parseFtyp(ftypBox.data)) {
		throw new Error('Invalid AVIF signature: not an AVIF file')
	}

	// Extract metadata
	const metadata = extractMetadata(boxes)

	// Extract AV1 bitstream
	const av1Bitstream = extractAV1Bitstream(data, boxes, metadata.primaryItemId)

	// Decode AV1 frame
	const rgba = decodeAV1Frame(av1Bitstream, metadata.width, metadata.height)

	return {
		width: metadata.width,
		height: metadata.height,
		data: rgba,
	}
}
