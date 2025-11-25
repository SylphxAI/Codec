import type { ImageData } from '@sylphx/codec-core'
import {
	BRAND_HEIC,
	BRAND_HEIX,
	BRAND_MIF1,
	COLR,
	FTYP,
	HDLR,
	type HeifContainer,
	type HeifItem,
	type HevcBitstream,
	HevcNalUnitType,
	type HevcSPS,
	IINF,
	ILOC,
	INFE,
	IPCO,
	IPMA,
	IPRP,
	IROT,
	ISPE,
	ITEM_TYPE_HVC1,
	type ItemInfo,
	type ItemLocation,
	type ItemProperties,
	MDAT,
	META,
	PITM,
	PIXI,
} from './types'

/**
 * Read 32-bit big-endian value
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
}

/**
 * Read 16-bit big-endian value
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * Read 64-bit big-endian value (as number, may lose precision for very large values)
 */
function readU64BE(data: Uint8Array, offset: number): number {
	const high = readU32BE(data, offset)
	const low = readU32BE(data, offset + 4)
	return high * 0x100000000 + low
}

/**
 * Decode HEIC/HEIF to ImageData
 */
export function decodeHeic(data: Uint8Array): ImageData {
	// Parse HEIF container
	const container = parseHeifContainer(data)

	// Get primary item
	const primaryItem = container.items.get(container.primaryItemId)
	if (!primaryItem) {
		throw new Error('Primary item not found')
	}

	// Ensure it's an HEVC image
	if (primaryItem.type !== ITEM_TYPE_HVC1) {
		throw new Error(`Unsupported item type: 0x${primaryItem.type.toString(16)}`)
	}

	// Decode HEVC bitstream
	return decodeHevcItem(primaryItem)
}

/**
 * Parse HEIF container structure
 */
function parseHeifContainer(data: Uint8Array): HeifContainer {
	let offset = 0
	let ftyp: any = null
	let primaryItemId = 0
	const items = new Map<number, HeifItem>()
	const itemInfos = new Map<number, ItemInfo>()
	const itemLocations = new Map<number, ItemLocation>()
	const itemProperties = new Map<number, ItemProperties>()
	let mdatOffset = 0
	let mdatSize = 0

	// Parse top-level boxes
	while (offset < data.length) {
		const boxSize = readU32BE(data, offset)
		const boxType = readU32BE(data, offset + 4)

		if (boxSize === 0) break // Rest of file
		if (boxSize === 1) {
			// Extended size
			throw new Error('Extended box sizes not yet supported')
		}

		const boxData = data.slice(offset + 8, offset + boxSize)

		switch (boxType) {
			case FTYP:
				ftyp = parseFtyp(boxData)
				break

			case META:
				const metaResult = parseMeta(boxData)
				primaryItemId = metaResult.primaryItemId
				Object.assign(itemInfos, metaResult.itemInfos)
				Object.assign(itemLocations, metaResult.itemLocations)
				Object.assign(itemProperties, metaResult.itemProperties)
				break

			case MDAT:
				mdatOffset = offset + 8
				mdatSize = boxSize - 8
				break
		}

		offset += boxSize
	}

	if (!ftyp) {
		throw new Error('Invalid HEIF: missing ftyp box')
	}

	// Verify it's a HEIC file
	if (
		ftyp.majorBrand !== BRAND_HEIC &&
		ftyp.majorBrand !== BRAND_HEIX &&
		!ftyp.compatibleBrands.includes(BRAND_HEIC) &&
		!ftyp.compatibleBrands.includes(BRAND_MIF1)
	) {
		throw new Error('Not a HEIC/HEIF file')
	}

	// Extract item data from mdat
	for (const [itemId, location] of itemLocations.entries()) {
		const info = itemInfos.get(itemId)
		if (!info) continue

		// Read item data from extents
		const chunks: Uint8Array[] = []
		for (const extent of location.extents) {
			const dataOffset = mdatOffset + location.baseOffset + extent.extentOffset
			const dataEnd = dataOffset + extent.extentLength
			if (dataEnd > mdatOffset + mdatSize) {
				throw new Error(`Item ${itemId} extent exceeds mdat bounds`)
			}
			chunks.push(data.slice(dataOffset, dataEnd))
		}

		// Combine chunks
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
		const itemData = new Uint8Array(totalLength)
		let pos = 0
		for (const chunk of chunks) {
			itemData.set(chunk, pos)
			pos += chunk.length
		}

		items.set(itemId, {
			id: itemId,
			type: info.itemType,
			data: itemData,
			properties: itemProperties.get(itemId) || {},
		})
	}

	return { ftyp, primaryItemId, items }
}

/**
 * Parse ftyp box
 */
function parseFtyp(data: Uint8Array): any {
	const majorBrand = readU32BE(data, 0)
	const minorVersion = readU32BE(data, 4)
	const compatibleBrands: number[] = []

	for (let i = 8; i < data.length; i += 4) {
		compatibleBrands.push(readU32BE(data, i))
	}

	return { majorBrand, minorVersion, compatibleBrands }
}

/**
 * Parse meta box
 */
function parseMeta(data: Uint8Array): any {
	let offset = 0

	// Check for full box header (version + flags)
	const version = data[offset]!
	offset += 4 // version + flags

	let primaryItemId = 0
	const itemInfos = new Map<number, ItemInfo>()
	const itemLocations = new Map<number, ItemLocation>()
	const itemProperties = new Map<number, ItemProperties>()

	// Parse child boxes
	while (offset < data.length) {
		const boxSize = readU32BE(data, offset)
		const boxType = readU32BE(data, offset + 4)

		if (boxSize === 0 || offset + boxSize > data.length) break

		const boxData = data.slice(offset + 8, offset + boxSize)

		switch (boxType) {
			case HDLR:
				// Handler box - skip for now
				break

			case PITM:
				primaryItemId = parsePitm(boxData)
				break

			case ILOC:
				const locations = parseIloc(boxData)
				for (const loc of locations) {
					itemLocations.set(loc.itemId, loc)
				}
				break

			case IINF:
				const infos = parseIinf(boxData)
				for (const info of infos) {
					itemInfos.set(info.itemId, info)
				}
				break

			case IPRP:
				const props = parseIprp(boxData)
				Object.assign(itemProperties, props)
				break
		}

		offset += boxSize
	}

	return { primaryItemId, itemInfos, itemLocations, itemProperties }
}

/**
 * Parse pitm (primary item) box
 */
function parsePitm(data: Uint8Array): number {
	const version = data[0]!
	if (version === 0) {
		return readU16BE(data, 4)
	}
	return readU32BE(data, 4)
}

/**
 * Parse iloc (item location) box
 */
function parseIloc(data: Uint8Array): ItemLocation[] {
	const version = data[0]!
	let offset = 4 // version + flags

	const offsetSize = (data[offset]! >> 4) & 0x0f
	const lengthSize = data[offset]! & 0x0f
	offset++

	const baseOffsetSize = (data[offset]! >> 4) & 0x0f
	const indexSize = version === 1 || version === 2 ? data[offset]! & 0x0f : 0
	offset++

	const itemCount = version < 2 ? readU16BE(data, offset) : readU32BE(data, offset)
	offset += version < 2 ? 2 : 4

	const locations: ItemLocation[] = []

	for (let i = 0; i < itemCount; i++) {
		const itemId = version < 2 ? readU16BE(data, offset) : readU32BE(data, offset)
		offset += version < 2 ? 2 : 4

		let constructionMethod = 0
		if (version === 1 || version === 2) {
			constructionMethod = data[offset]! & 0x0f
			offset += 2
		}

		const dataReferenceIndex = readU16BE(data, offset)
		offset += 2

		const baseOffset = readVariableInt(data, offset, baseOffsetSize)
		offset += baseOffsetSize

		const extentCount = readU16BE(data, offset)
		offset += 2

		const extents: any[] = []
		for (let j = 0; j < extentCount; j++) {
			let extentIndex
			if (version === 1 || version === 2) {
				if (indexSize > 0) {
					extentIndex = readVariableInt(data, offset, indexSize)
					offset += indexSize
				}
			}

			const extentOffset = readVariableInt(data, offset, offsetSize)
			offset += offsetSize

			const extentLength = readVariableInt(data, offset, lengthSize)
			offset += lengthSize

			extents.push({ extentIndex, extentOffset, extentLength })
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
 * Parse iinf (item information) box
 */
function parseIinf(data: Uint8Array): ItemInfo[] {
	const version = data[0]!
	let offset = 4 // version + flags

	const entryCount = version === 0 ? readU16BE(data, offset) : readU32BE(data, offset)
	offset += version === 0 ? 2 : 4

	const infos: ItemInfo[] = []

	while (offset < data.length && infos.length < entryCount) {
		const boxSize = readU32BE(data, offset)
		const boxType = readU32BE(data, offset + 4)

		if (boxType === INFE) {
			const infeData = data.slice(offset + 8, offset + boxSize)
			infos.push(parseInfe(infeData))
		}

		offset += boxSize
	}

	return infos
}

/**
 * Parse infe (item info entry) box
 */
function parseInfe(data: Uint8Array): ItemInfo {
	const version = data[0]!
	let offset = 4 // version + flags

	const itemId = version >= 2 ? (version === 2 ? readU16BE(data, offset) : readU32BE(data, offset)) : 0
	offset += version >= 2 ? (version === 2 ? 2 : 4) : 0

	const itemProtectionIndex = readU16BE(data, offset)
	offset += 2

	const itemType = readU32BE(data, offset)
	offset += 4

	// Item name (null-terminated string)
	let itemName = ''
	while (offset < data.length && data[offset] !== 0) {
		itemName += String.fromCharCode(data[offset]!)
		offset++
	}
	offset++ // Skip null terminator

	return {
		itemId,
		itemProtectionIndex,
		itemType,
		itemName,
	}
}

/**
 * Parse iprp (item properties) box
 */
function parseIprp(data: Uint8Array): Map<number, ItemProperties> {
	const properties = new Map<number, ItemProperties>()
	let offset = 0

	// Parse child boxes (ipco and ipma)
	const propertyContainers: any[] = []
	const associations: any[] = []

	while (offset < data.length) {
		const boxSize = readU32BE(data, offset)
		const boxType = readU32BE(data, offset + 4)

		if (boxSize === 0 || offset + boxSize > data.length) break

		const boxData = data.slice(offset + 8, offset + boxSize)

		switch (boxType) {
			case IPCO:
				propertyContainers.push(...parseIpco(boxData))
				break

			case IPMA:
				associations.push(...parseIpma(boxData))
				break
		}

		offset += boxSize
	}

	// Build item properties from associations
	for (const assoc of associations) {
		const props: ItemProperties = {}

		for (const propIdx of assoc.properties) {
			const prop = propertyContainers[propIdx - 1] // 1-indexed
			if (!prop) continue

			Object.assign(props, prop)
		}

		properties.set(assoc.itemId, props)
	}

	return properties
}

/**
 * Parse ipco (item property container) box
 */
function parseIpco(data: Uint8Array): any[] {
	const properties: any[] = []
	let offset = 0

	while (offset < data.length) {
		const boxSize = readU32BE(data, offset)
		const boxType = readU32BE(data, offset + 4)

		if (boxSize === 0 || offset + boxSize > data.length) break

		const boxData = data.slice(offset + 8, offset + boxSize)

		switch (boxType) {
			case ISPE:
				properties.push({ size: parseIspe(boxData) })
				break

			case IROT:
				properties.push({ rotation: parseIrot(boxData) })
				break

			case COLR:
				properties.push({ colorInfo: parseColr(boxData) })
				break

			case PIXI:
				properties.push({ pixelInfo: parsePixi(boxData) })
				break

			default:
				// Unknown property
				properties.push({})
				break
		}

		offset += boxSize
	}

	return properties
}

/**
 * Parse ipma (item property association) box
 */
function parseIpma(data: Uint8Array): any[] {
	const version = data[0]!
	const flags = (data[1]! << 16) | (data[2]! << 8) | data[3]!
	let offset = 4

	const entryCount = readU32BE(data, offset)
	offset += 4

	const associations: any[] = []

	for (let i = 0; i < entryCount; i++) {
		const itemId = version < 1 ? readU16BE(data, offset) : readU32BE(data, offset)
		offset += version < 1 ? 2 : 4

		const associationCount = data[offset]!
		offset++

		const properties: number[] = []
		for (let j = 0; j < associationCount; j++) {
			const essential = flags & 1
			const propIndex = essential ? readU16BE(data, offset) & 0x7fff : data[offset]!
			offset += essential ? 2 : 1

			properties.push(propIndex)
		}

		associations.push({ itemId, properties })
	}

	return associations
}

/**
 * Parse ispe (image spatial extents) property
 */
function parseIspe(data: Uint8Array): any {
	// version + flags
	const width = readU32BE(data, 4)
	const height = readU32BE(data, 8)
	return { width, height }
}

/**
 * Parse irot (image rotation) property
 */
function parseIrot(data: Uint8Array): number {
	return data[0]! & 0x03
}

/**
 * Parse colr (color information) property
 */
function parseColr(data: Uint8Array): any {
	const colorType = readU32BE(data, 0)
	return { colorType }
}

/**
 * Parse pixi (pixel information) property
 */
function parsePixi(data: Uint8Array): any {
	let offset = 4 // version + flags
	const numChannels = data[offset]!
	offset++

	const bitsPerChannel: number[] = []
	for (let i = 0; i < numChannels; i++) {
		bitsPerChannel.push(data[offset]!)
		offset++
	}

	return { bitsPerChannel }
}

/**
 * Read variable-length integer
 */
function readVariableInt(data: Uint8Array, offset: number, size: number): number {
	let value = 0
	for (let i = 0; i < size; i++) {
		value = (value << 8) | data[offset + i]!
	}
	return value
}

/**
 * Decode HEVC item to ImageData
 */
function decodeHevcItem(item: HeifItem): ImageData {
	// Parse HEVC bitstream
	const bitstream = parseHevcBitstream(item.data)

	// Get dimensions from SPS or item properties
	const width = item.properties.size?.width || bitstream.sps?.width || 0
	const height = item.properties.size?.height || bitstream.sps?.height || 0

	if (width === 0 || height === 0) {
		throw new Error('Unable to determine image dimensions')
	}

	// Decode HEVC intra frame
	return decodeHevcIntraFrame(bitstream, width, height)
}

/**
 * Parse HEVC bitstream into NAL units
 */
function parseHevcBitstream(data: Uint8Array): HevcBitstream {
	const nalUnits: any[] = []
	let sps: HevcSPS | undefined

	// Check for HEVC configuration record (hvcC) format
	if (data.length > 23 && data[0] === 1) {
		// hvcC format
		const numOfArrays = data[22]!

		let offset = 23
		for (let i = 0; i < numOfArrays; i++) {
			const arrayCompleteness = (data[offset]! >> 7) & 1
			const nalUnitType = data[offset]! & 0x3f
			offset++

			const numNalus = readU16BE(data, offset)
			offset += 2

			for (let j = 0; j < numNalus; j++) {
				const naluLength = readU16BE(data, offset)
				offset += 2

				const naluData = data.slice(offset, offset + naluLength)
				offset += naluLength

				nalUnits.push({ type: nalUnitType, data: naluData })

				if (nalUnitType === HevcNalUnitType.SPS_NUT) {
					sps = parseHevcSPS(naluData)
				}
			}
		}
	} else {
		// Annex B format (start codes)
		let offset = 0
		while (offset < data.length) {
			// Find start code (0x000001 or 0x00000001)
			let startCodeLen = 0
			if (
				offset + 3 < data.length &&
				data[offset] === 0 &&
				data[offset + 1] === 0 &&
				data[offset + 2] === 1
			) {
				startCodeLen = 3
			} else if (
				offset + 4 < data.length &&
				data[offset] === 0 &&
				data[offset + 1] === 0 &&
				data[offset + 2] === 0 &&
				data[offset + 3] === 1
			) {
				startCodeLen = 4
			}

			if (startCodeLen === 0) {
				offset++
				continue
			}

			offset += startCodeLen

			// Find next start code
			let nextOffset = offset
			while (nextOffset < data.length - 3) {
				if (
					data[nextOffset] === 0 &&
					data[nextOffset + 1] === 0 &&
					(data[nextOffset + 2] === 1 || (data[nextOffset + 2] === 0 && data[nextOffset + 3] === 1))
				) {
					break
				}
				nextOffset++
			}

			if (nextOffset >= data.length - 3) {
				nextOffset = data.length
			}

			// Parse NAL unit header
			const naluData = data.slice(offset, nextOffset)
			if (naluData.length > 0) {
				const nalUnitType = (naluData[0]! >> 1) & 0x3f

				nalUnits.push({ type: nalUnitType, data: naluData })

				if (nalUnitType === HevcNalUnitType.SPS_NUT) {
					sps = parseHevcSPS(naluData)
				}
			}

			offset = nextOffset
		}
	}

	return { nalUnits, sps }
}

/**
 * Parse HEVC Sequence Parameter Set (simplified)
 */
function parseHevcSPS(data: Uint8Array): HevcSPS {
	// This is a simplified parser - full HEVC SPS parsing is very complex
	// For now, return defaults
	return {
		width: 0,
		height: 0,
		bitDepth: 8,
		chromaFormat: 1, // 4:2:0
	}
}

/**
 * Decode HEVC intra frame to ImageData (simplified placeholder)
 */
function decodeHevcIntraFrame(_bitstream: HevcBitstream, width: number, height: number): ImageData {
	// HEVC decoding is extremely complex and typically requires hardware acceleration
	// or a full HEVC decoder library. For a pure TypeScript implementation,
	// this is a placeholder that would need a complete HEVC decoder.
	//
	// In practice, you would:
	// 1. Parse VPS, SPS, PPS parameter sets
	// 2. Decode slice headers
	// 3. Perform inverse quantization
	// 4. Perform inverse transform (DCT)
	// 5. Perform intra prediction
	// 6. Apply deblocking filter
	// 7. Convert from YUV to RGB

	throw new Error(
		'HEVC decoding is not yet implemented. ' +
			'HEVC is a complex codec requiring significant implementation. ' +
			'Consider using a WASM-based decoder or system codec for production use.'
	)

	// Placeholder: return a solid gray image
	// const data = new Uint8Array(width * height * 4)
	// for (let i = 0; i < width * height; i++) {
	// 	data[i * 4] = 128     // R
	// 	data[i * 4 + 1] = 128 // G
	// 	data[i * 4 + 2] = 128 // B
	// 	data[i * 4 + 3] = 255 // A
	// }
	// return { width, height, data }
}
