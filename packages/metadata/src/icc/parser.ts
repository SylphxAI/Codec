/**
 * ICC profile parser
 * Extracts color profile information from ICC/ICM files
 */

import type { IccHeader, IccProfile, IccRenderingIntent, IccTag } from './types'

const ICC_SIGNATURE = 'acsp'

/**
 * Check if data is an ICC profile
 */
export function isIcc(data: Uint8Array): boolean {
	if (data.length < 128) return false
	// Check 'acsp' signature at offset 36
	return (
		data[36] === 0x61 && // 'a'
		data[37] === 0x63 && // 'c'
		data[38] === 0x73 && // 's'
		data[39] === 0x70 // 'p'
	)
}

/**
 * Parse ICC profile from data
 */
export function parseIcc(data: Uint8Array): IccProfile | null {
	if (!isIcc(data)) return null

	const header = parseHeader(data)
	const tags = parseTags(data)

	const profile: IccProfile = {
		header,
		tags,
	}

	// Extract common values
	const descTag = tags.get('desc')
	if (descTag) {
		profile.description = parseTextTag(data, descTag)
	}

	const cprtTag = tags.get('cprt')
	if (cprtTag) {
		profile.copyright = parseTextTag(data, cprtTag)
	}

	const dmndTag = tags.get('dmnd')
	if (dmndTag) {
		profile.manufacturer = parseTextTag(data, dmndTag)
	}

	const dmddTag = tags.get('dmdd')
	if (dmddTag) {
		profile.model = parseTextTag(data, dmddTag)
	}

	// Parse color primaries
	const rXYZ = tags.get('rXYZ')
	if (rXYZ) {
		profile.redPrimary = parseXYZTag(data, rXYZ)
	}

	const gXYZ = tags.get('gXYZ')
	if (gXYZ) {
		profile.greenPrimary = parseXYZTag(data, gXYZ)
	}

	const bXYZ = tags.get('bXYZ')
	if (bXYZ) {
		profile.bluePrimary = parseXYZTag(data, bXYZ)
	}

	const wtpt = tags.get('wtpt')
	if (wtpt) {
		profile.whitePoint = parseXYZTag(data, wtpt)
	}

	// Parse TRCs
	const rTRC = tags.get('rTRC')
	if (rTRC) {
		profile.redTRC = parseTRCTag(data, rTRC)
	}

	const gTRC = tags.get('gTRC')
	if (gTRC) {
		profile.greenTRC = parseTRCTag(data, gTRC)
	}

	const bTRC = tags.get('bTRC')
	if (bTRC) {
		profile.blueTRC = parseTRCTag(data, bTRC)
	}

	const kTRC = tags.get('kTRC')
	if (kTRC) {
		profile.grayTRC = parseTRCTag(data, kTRC)
	}

	return profile
}

/**
 * Extract ICC profile from JPEG APP2 segments
 */
export function parseIccFromJpeg(data: Uint8Array): IccProfile | null {
	const chunks: Uint8Array[] = []
	let offset = 2 // Skip SOI

	while (offset < data.length - 4) {
		if (data[offset] !== 0xff) {
			offset++
			continue
		}

		const marker = data[offset + 1]!

		// APP2 marker
		if (marker === 0xe2) {
			const length = (data[offset + 2]! << 8) | data[offset + 3]!
			const segmentData = data.slice(offset + 4, offset + 2 + length)

			// Check for ICC_PROFILE header
			const header = String.fromCharCode(...segmentData.slice(0, 12))
			if (header.startsWith('ICC_PROFILE\x00')) {
				const chunkNumber = segmentData[12]!
				const totalChunks = segmentData[13]!
				chunks[chunkNumber - 1] = segmentData.slice(14)
			}
		}

		if (marker === 0xd8 || marker === 0xd9) {
			offset += 2
		} else {
			const length = (data[offset + 2]! << 8) | data[offset + 3]!
			offset += 2 + length
		}
	}

	if (chunks.length === 0) return null

	// Combine chunks
	let totalLen = 0
	for (const chunk of chunks) {
		if (chunk) totalLen += chunk.length
	}

	const combined = new Uint8Array(totalLen)
	let pos = 0
	for (const chunk of chunks) {
		if (chunk) {
			combined.set(chunk, pos)
			pos += chunk.length
		}
	}

	return parseIcc(combined)
}

/**
 * Extract ICC profile from PNG
 */
export function parseIccFromPng(data: Uint8Array): IccProfile | null {
	// Skip PNG signature
	let offset = 8

	while (offset < data.length - 8) {
		const length = readU32BE(data, offset)
		const type = String.fromCharCode(
			data[offset + 4]!,
			data[offset + 5]!,
			data[offset + 6]!,
			data[offset + 7]!
		)

		if (type === 'iCCP') {
			// Find null terminator after profile name
			let nameEnd = offset + 8
			while (nameEnd < offset + 8 + length && data[nameEnd] !== 0) {
				nameEnd++
			}

			// Skip name, null, and compression method byte
			const compressedData = data.slice(nameEnd + 2, offset + 8 + length)

			// Decompress using zlib (inflate)
			// Note: In a real implementation, you'd use zlib decompression
			// For now, we'll return null if compressed
			return null
		}

		offset += 12 + length // length + type + data + crc
	}

	return null
}

function parseHeader(data: Uint8Array): IccHeader {
	const size = readU32BE(data, 0)
	const preferredCMM = readString(data, 4, 4)
	const versionMajor = data[8]!
	const versionMinor = (data[9]! >> 4) & 0x0f
	const versionPatch = data[9]! & 0x0f
	const version = `${versionMajor}.${versionMinor}.${versionPatch}`

	const profileClass = readString(data, 12, 4)
	const colorSpace = readString(data, 16, 4)
	const pcs = readString(data, 20, 4)

	const year = readU16BE(data, 24)
	const month = readU16BE(data, 26)
	const day = readU16BE(data, 28)
	const hour = readU16BE(data, 30)
	const minute = readU16BE(data, 32)
	const second = readU16BE(data, 34)
	const dateTime = new Date(year, month - 1, day, hour, minute, second)

	const signature = readString(data, 36, 4)
	const platform = readString(data, 40, 4)
	const flags = readU32BE(data, 44)
	const manufacturer = readString(data, 48, 4)
	const model = readU32BE(data, 52)

	const attr1 = readU32BE(data, 56)
	const attr2 = readU32BE(data, 60)
	const attributes = (BigInt(attr1) << 32n) | BigInt(attr2)

	const renderingIntent = readU32BE(data, 64) as IccRenderingIntent

	const illuminant = {
		x: readS15Fixed16(data, 68),
		y: readS15Fixed16(data, 72),
		z: readS15Fixed16(data, 76),
	}

	const creator = readString(data, 80, 4)

	return {
		size,
		preferredCMM,
		version,
		profileClass,
		colorSpace,
		pcs,
		dateTime,
		signature,
		platform,
		flags,
		manufacturer,
		model,
		attributes,
		renderingIntent,
		illuminant,
		creator,
	}
}

function parseTags(data: Uint8Array): Map<string, IccTag> {
	const tags = new Map<string, IccTag>()
	const tagCount = readU32BE(data, 128)

	for (let i = 0; i < tagCount; i++) {
		const tagOffset = 132 + i * 12
		const signature = readString(data, tagOffset, 4)
		const offset = readU32BE(data, tagOffset + 4)
		const size = readU32BE(data, tagOffset + 8)

		tags.set(signature, { signature, offset, size })
	}

	return tags
}

function parseTextTag(data: Uint8Array, tag: IccTag): string {
	const typeSignature = readString(data, tag.offset, 4)

	if (typeSignature === 'desc') {
		// textDescriptionType
		const length = readU32BE(data, tag.offset + 8)
		return readString(data, tag.offset + 12, length - 1)
	}

	if (typeSignature === 'mluc') {
		// multiLocalizedUnicodeType
		const recordCount = readU32BE(data, tag.offset + 8)
		if (recordCount > 0) {
			const recordSize = readU32BE(data, tag.offset + 12)
			const stringLength = readU32BE(data, tag.offset + 20)
			const stringOffset = readU32BE(data, tag.offset + 24)
			// Read UTF-16BE string
			let str = ''
			for (let i = 0; i < stringLength; i += 2) {
				const code = readU16BE(data, tag.offset + stringOffset + i)
				if (code === 0) break
				str += String.fromCharCode(code)
			}
			return str
		}
	}

	if (typeSignature === 'text') {
		// textType
		return readString(data, tag.offset + 8, tag.size - 8)
	}

	return ''
}

function parseXYZTag(data: Uint8Array, tag: IccTag): { x: number; y: number; z: number } {
	return {
		x: readS15Fixed16(data, tag.offset + 8),
		y: readS15Fixed16(data, tag.offset + 12),
		z: readS15Fixed16(data, tag.offset + 16),
	}
}

function parseTRCTag(data: Uint8Array, tag: IccTag): number[] | number {
	const typeSignature = readString(data, tag.offset, 4)

	if (typeSignature === 'curv') {
		const count = readU32BE(data, tag.offset + 8)

		if (count === 0) {
			// Linear (gamma = 1.0)
			return 1.0
		}

		if (count === 1) {
			// Single gamma value (u8Fixed8Number)
			return readU16BE(data, tag.offset + 12) / 256
		}

		// LUT
		const curve: number[] = []
		for (let i = 0; i < count; i++) {
			curve.push(readU16BE(data, tag.offset + 12 + i * 2) / 65535)
		}
		return curve
	}

	if (typeSignature === 'para') {
		// Parametric curve
		const funcType = readU16BE(data, tag.offset + 8)
		const gamma = readS15Fixed16(data, tag.offset + 12)
		// For simplicity, just return gamma
		return gamma
	}

	return 1.0
}

// Binary reading helpers
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	)
}

function readS15Fixed16(data: Uint8Array, offset: number): number {
	const value = readU32BE(data, offset)
	// Convert to signed
	const signed = value > 0x7fffffff ? value - 0x100000000 : value
	return signed / 65536
}

function readString(data: Uint8Array, offset: number, length: number): string {
	let str = ''
	for (let i = 0; i < length; i++) {
		const char = data[offset + i]!
		if (char === 0) break
		str += String.fromCharCode(char)
	}
	return str.trim()
}
