/**
 * M4A (MPEG-4 Audio) decoder
 * Parses M4A container structure and extracts audio track info
 */

import type { AudioData } from '@sylphx/codec-core'
import {
	M4aBoxType,
	M4aHandlerType,
	type M4aBox,
	type M4aFtyp,
	type M4aHdlr,
	type M4aInfo,
	type M4aMdhd,
	type M4aMvhd,
	type M4aSampleEntry,
	type M4aStscEntry,
	type M4aSttsEntry,
	type M4aTkhd,
	type M4aTrack,
	type M4aAudio,
} from './types'

// Container box types that have children
const CONTAINER_BOXES = new Set([
	'moov',
	'trak',
	'mdia',
	'minf',
	'stbl',
	'dinf',
	'edts',
	'udta',
	'meta',
	'ilst',
])

/**
 * Check if data is an M4A file
 */
export function isM4a(data: Uint8Array): boolean {
	if (data.length < 8) return false

	// Check for ftyp box
	const size = readU32BE(data, 0)
	const type = readString(data, 4, 4)

	if (type === 'ftyp' && size >= 8) {
		// Check major brand for M4A
		if (size >= 12) {
			const majorBrand = readString(data, 8, 4)
			// M4A files typically have M4A , mp42, or isom as major brand
			if (majorBrand === 'M4A ' || majorBrand === 'mp42' || majorBrand === 'isom') {
				return true
			}
			// Also check compatible brands for M4A
			if (size >= 16) {
				for (let offset = 16; offset < Math.min(size, 64); offset += 4) {
					const brand = readString(data, offset, 4)
					if (brand === 'M4A ') return true
				}
			}
		}
	}

	return false
}

/**
 * Parse M4A file info
 */
export function parseM4aInfo(data: Uint8Array): M4aInfo {
	const boxes = parseBoxes(data, 0, data.length)

	// Find ftyp
	const ftypBox = findBox(boxes, 'ftyp')
	const ftyp = ftypBox ? parseFtyp(ftypBox.data!) : defaultFtyp()

	// Find moov
	const moovBox = findBox(boxes, 'moov')
	if (!moovBox || !moovBox.children) {
		throw new Error('Invalid M4A: missing moov box')
	}

	// Parse mvhd
	const mvhdBox = findBox(moovBox.children, 'mvhd')
	const mvhd = mvhdBox ? parseMvhd(mvhdBox.data!) : defaultMvhd()

	// Parse tracks
	const tracks: M4aTrack[] = []
	for (const box of moovBox.children) {
		if (box.type === 'trak' && box.children) {
			const track = parseTrack(box, data)
			if (track) tracks.push(track)
		}
	}

	// Find audio track
	const audioTrack = tracks.find((t) => t.codec === 'mp4a' || t.codec === 'alac')

	if (!audioTrack) {
		throw new Error('Invalid M4A: no audio track found')
	}

	// Calculate bitrate if possible
	let bitrate: number | undefined
	if (audioTrack.duration > 0) {
		const mdatBox = findBox(boxes, 'mdat')
		if (mdatBox) {
			const dataSize = mdatBox.size - 8 // Subtract header
			bitrate = Math.round((dataSize * 8) / audioTrack.duration / 1000) // kbps
		}
	}

	return {
		ftyp,
		mvhd,
		duration: mvhd.duration / mvhd.timescale,
		timescale: mvhd.timescale,
		audioTrack,
		sampleRate: audioTrack.sampleRate || 44100,
		channels: audioTrack.channelCount || 2,
		codec: audioTrack.codec || 'unknown',
		bitrate,
	}
}

/**
 * Decode M4A file
 */
export function decodeM4a(data: Uint8Array): M4aAudio {
	const boxes = parseBoxes(data, 0, data.length)
	const info = parseM4aInfo(data)

	// Find mdat
	const mdatBox = findBox(boxes, 'mdat')
	const mdatData = mdatBox ? data.slice(mdatBox.offset + 8, mdatBox.offset + mdatBox.size) : undefined

	return { info, boxes, mdatData }
}

/**
 * Decode M4A audio samples (stub - requires AAC/ALAC decoder)
 * Returns empty AudioData as we don't decode the actual audio codec here
 */
export function decodeM4aAudio(data: Uint8Array): AudioData {
	const m4a = decodeM4a(data)

	// TODO: Implement AAC/ALAC decoding
	// For now, return empty audio data with correct metadata
	const { sampleRate, channels } = m4a.info

	const samples: Float32Array[] = []
	for (let i = 0; i < channels; i++) {
		samples.push(new Float32Array(0))
	}

	return { samples, sampleRate, channels }
}

/**
 * Parse all boxes in a range
 */
function parseBoxes(data: Uint8Array, start: number, end: number): M4aBox[] {
	const boxes: M4aBox[] = []
	let offset = start

	while (offset + 8 <= end) {
		let size = readU32BE(data, offset)
		const type = readString(data, offset + 4, 4)

		if (size === 0) {
			// Box extends to end of file
			size = end - offset
		} else if (size === 1) {
			// 64-bit size
			if (offset + 16 > end) break
			size = Number(readU64BE(data, offset + 8))
		}

		if (size < 8 || offset + size > end) break

		const box: M4aBox = {
			type,
			size,
			offset,
		}

		// Parse container boxes recursively
		if (CONTAINER_BOXES.has(type)) {
			const headerSize = size === 1 ? 16 : 8
			box.children = parseBoxes(data, offset + headerSize, offset + size)
		} else {
			// Store box data
			const headerSize = size === 1 ? 16 : 8
			box.data = data.slice(offset + headerSize, offset + size)
		}

		boxes.push(box)
		offset += size
	}

	return boxes
}

/**
 * Find a box by type
 */
function findBox(boxes: M4aBox[], type: string): M4aBox | undefined {
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
 * Parse ftyp box
 */
function parseFtyp(data: Uint8Array): M4aFtyp {
	const majorBrand = readString(data, 0, 4)
	const minorVersion = readU32BE(data, 4)

	const compatibleBrands: string[] = []
	for (let i = 8; i + 4 <= data.length; i += 4) {
		compatibleBrands.push(readString(data, i, 4))
	}

	return { majorBrand, minorVersion, compatibleBrands }
}

/**
 * Parse mvhd box
 */
function parseMvhd(data: Uint8Array): M4aMvhd {
	const version = data[0]!
	let offset = 4

	let creationTime: number
	let modificationTime: number
	let timescale: number
	let duration: number

	if (version === 1) {
		creationTime = Number(readU64BE(data, offset))
		offset += 8
		modificationTime = Number(readU64BE(data, offset))
		offset += 8
		timescale = readU32BE(data, offset)
		offset += 4
		duration = Number(readU64BE(data, offset))
		offset += 8
	} else {
		creationTime = readU32BE(data, offset)
		offset += 4
		modificationTime = readU32BE(data, offset)
		offset += 4
		timescale = readU32BE(data, offset)
		offset += 4
		duration = readU32BE(data, offset)
		offset += 4
	}

	const rate = readU32BE(data, offset) / 65536
	offset += 4
	const volume = readU16BE(data, offset) / 256
	offset += 2

	// Skip reserved + matrix
	offset += 10 + 36

	// Skip pre_defined
	offset += 24

	const nextTrackId = readU32BE(data, offset)

	return {
		version,
		creationTime,
		modificationTime,
		timescale,
		duration,
		rate,
		volume,
		nextTrackId,
	}
}

/**
 * Parse a track
 */
function parseTrack(trakBox: M4aBox, data: Uint8Array): M4aTrack | null {
	if (!trakBox.children) return null

	// Parse tkhd
	const tkhdBox = findBox(trakBox.children, 'tkhd')
	if (!tkhdBox || !tkhdBox.data) return null

	const tkhd = parseTkhd(tkhdBox.data)

	// Find mdia
	const mdiaBox = findBox(trakBox.children, 'mdia')
	if (!mdiaBox || !mdiaBox.children) return null

	// Parse mdhd
	const mdhdBox = findBox(mdiaBox.children, 'mdhd')
	const mdhd = mdhdBox && mdhdBox.data ? parseMdhd(mdhdBox.data) : null

	// Parse hdlr
	const hdlrBox = findBox(mdiaBox.children, 'hdlr')
	const hdlr = hdlrBox && hdlrBox.data ? parseHdlr(hdlrBox.data) : null

	// Only process audio tracks
	if (hdlr?.handlerType !== M4aHandlerType.AUDIO) {
		return null
	}

	// Find stbl
	const minfBox = findBox(mdiaBox.children, 'minf')
	const stblBox = minfBox && minfBox.children ? findBox(minfBox.children, 'stbl') : null

	if (!stblBox || !stblBox.children) return null

	// Parse stsd (sample descriptions)
	const stsdBox = findBox(stblBox.children, 'stsd')
	const sampleEntries = stsdBox && stsdBox.data ? parseStsd(stsdBox.data) : []

	// Parse stts (time to sample)
	const sttsBox = findBox(stblBox.children, 'stts')
	const timeToSample = sttsBox && sttsBox.data ? parseStts(sttsBox.data) : []

	// Parse stsc (sample to chunk)
	const stscBox = findBox(stblBox.children, 'stsc')
	const sampleToChunk = stscBox && stscBox.data ? parseStsc(stscBox.data) : []

	// Parse stsz (sample sizes)
	const stszBox = findBox(stblBox.children, 'stsz')
	const { sampleCount, sampleSizes } = stszBox && stszBox.data ? parseStsz(stszBox.data) : { sampleCount: 0, sampleSizes: [] }

	// Parse stco/co64 (chunk offsets)
	const stcoBox = findBox(stblBox.children, 'stco')
	const co64Box = findBox(stblBox.children, 'co64')
	let chunkOffsets: number[] = []
	if (stcoBox && stcoBox.data) {
		chunkOffsets = parseStco(stcoBox.data)
	} else if (co64Box && co64Box.data) {
		chunkOffsets = parseCo64(co64Box.data)
	}

	// Parse stss (sync samples)
	const stssBox = findBox(stblBox.children, 'stss')
	const syncSamples = stssBox && stssBox.data ? parseStss(stssBox.data) : undefined

	const timescale = mdhd?.timescale || 1
	const duration = mdhd?.duration || 0

	return {
		trackId: tkhd.trackId,
		duration: duration / timescale,
		timescale,
		codec: sampleEntries[0]?.format,
		sampleRate: sampleEntries[0]?.sampleRate,
		channelCount: sampleEntries[0]?.channelCount,
		sampleEntries,
		sampleCount,
		sampleSizes,
		chunkOffsets,
		timeToSample,
		sampleToChunk,
		syncSamples,
	}
}

/**
 * Parse tkhd box
 */
function parseTkhd(data: Uint8Array): M4aTkhd {
	const version = data[0]!
	const flags = (data[1]! << 16) | (data[2]! << 8) | data[3]!
	let offset = 4

	let creationTime: number
	let modificationTime: number
	let trackId: number
	let duration: number

	if (version === 1) {
		creationTime = Number(readU64BE(data, offset))
		offset += 8
		modificationTime = Number(readU64BE(data, offset))
		offset += 8
		trackId = readU32BE(data, offset)
		offset += 4
		offset += 4 // reserved
		duration = Number(readU64BE(data, offset))
		offset += 8
	} else {
		creationTime = readU32BE(data, offset)
		offset += 4
		modificationTime = readU32BE(data, offset)
		offset += 4
		trackId = readU32BE(data, offset)
		offset += 4
		offset += 4 // reserved
		duration = readU32BE(data, offset)
		offset += 4
	}

	offset += 8 // reserved
	const layer = readI16BE(data, offset)
	offset += 2
	const alternateGroup = readI16BE(data, offset)
	offset += 2
	const volume = readI16BE(data, offset) / 256

	return {
		version,
		flags,
		creationTime,
		modificationTime,
		trackId,
		duration,
		layer,
		alternateGroup,
		volume,
	}
}

/**
 * Parse mdhd box
 */
function parseMdhd(data: Uint8Array): M4aMdhd {
	const version = data[0]!
	let offset = 4

	let creationTime: number
	let modificationTime: number
	let timescale: number
	let duration: number

	if (version === 1) {
		creationTime = Number(readU64BE(data, offset))
		offset += 8
		modificationTime = Number(readU64BE(data, offset))
		offset += 8
		timescale = readU32BE(data, offset)
		offset += 4
		duration = Number(readU64BE(data, offset))
		offset += 8
	} else {
		creationTime = readU32BE(data, offset)
		offset += 4
		modificationTime = readU32BE(data, offset)
		offset += 4
		timescale = readU32BE(data, offset)
		offset += 4
		duration = readU32BE(data, offset)
		offset += 4
	}

	// Language (packed ISO-639-2/T)
	const langCode = readU16BE(data, offset)
	const language = String.fromCharCode(
		((langCode >> 10) & 0x1f) + 0x60,
		((langCode >> 5) & 0x1f) + 0x60,
		(langCode & 0x1f) + 0x60
	)

	return {
		version,
		creationTime,
		modificationTime,
		timescale,
		duration,
		language,
	}
}

/**
 * Parse hdlr box
 */
function parseHdlr(data: Uint8Array): M4aHdlr {
	const version = data[0]!
	let offset = 4

	offset += 4 // pre_defined
	const handlerType = readString(data, offset, 4)
	offset += 4
	offset += 12 // reserved

	// Name (null-terminated string)
	let name = ''
	while (offset < data.length && data[offset] !== 0) {
		name += String.fromCharCode(data[offset]!)
		offset++
	}

	return { version, handlerType, name }
}

/**
 * Parse stsd box (sample descriptions)
 */
function parseStsd(data: Uint8Array): M4aSampleEntry[] {
	const entries: M4aSampleEntry[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 8 <= data.length; i++) {
		const entrySize = readU32BE(data, offset)
		const format = readString(data, offset + 4, 4)
		const entryStart = offset
		offset += 8

		if (entrySize < 8) break

		const entry: M4aSampleEntry = {
			format,
			dataReferenceIndex: 0,
		}

		// Audio sample entry
		offset += 6 // reserved
		entry.dataReferenceIndex = readU16BE(data, offset)
		offset += 2

		offset += 8 // reserved (2 x 4 bytes)

		entry.channelCount = readU16BE(data, offset)
		entry.sampleSize = readU16BE(data, offset + 2)
		offset += 4

		offset += 4 // pre_defined + reserved

		entry.sampleRate = readU32BE(data, offset) >>> 16 // 16.16 fixed point (high 16 bits)
		offset += 4

		entries.push(entry)

		// Move to next entry
		offset = entryStart + entrySize
	}

	return entries
}

/**
 * Parse stts box (time to sample)
 */
function parseStts(data: Uint8Array): M4aSttsEntry[] {
	const entries: M4aSttsEntry[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 8 <= data.length; i++) {
		entries.push({
			sampleCount: readU32BE(data, offset),
			sampleDelta: readU32BE(data, offset + 4),
		})
		offset += 8
	}

	return entries
}

/**
 * Parse stsc box (sample to chunk)
 */
function parseStsc(data: Uint8Array): M4aStscEntry[] {
	const entries: M4aStscEntry[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 12 <= data.length; i++) {
		entries.push({
			firstChunk: readU32BE(data, offset),
			samplesPerChunk: readU32BE(data, offset + 4),
			sampleDescriptionIndex: readU32BE(data, offset + 8),
		})
		offset += 12
	}

	return entries
}

/**
 * Parse stsz box (sample sizes)
 */
function parseStsz(data: Uint8Array): { sampleCount: number; sampleSizes: number[] } {
	let offset = 4 // version + flags

	const sampleSize = readU32BE(data, offset)
	offset += 4
	const sampleCount = readU32BE(data, offset)
	offset += 4

	const sampleSizes: number[] = []

	if (sampleSize === 0) {
		// Variable size samples
		for (let i = 0; i < sampleCount && offset + 4 <= data.length; i++) {
			sampleSizes.push(readU32BE(data, offset))
			offset += 4
		}
	} else {
		// Fixed size samples
		for (let i = 0; i < sampleCount; i++) {
			sampleSizes.push(sampleSize)
		}
	}

	return { sampleCount, sampleSizes }
}

/**
 * Parse stco box (chunk offsets)
 */
function parseStco(data: Uint8Array): number[] {
	const offsets: number[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 4 <= data.length; i++) {
		offsets.push(readU32BE(data, offset))
		offset += 4
	}

	return offsets
}

/**
 * Parse co64 box (64-bit chunk offsets)
 */
function parseCo64(data: Uint8Array): number[] {
	const offsets: number[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 8 <= data.length; i++) {
		offsets.push(Number(readU64BE(data, offset)))
		offset += 8
	}

	return offsets
}

/**
 * Parse stss box (sync samples)
 */
function parseStss(data: Uint8Array): number[] {
	const samples: number[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 4 <= data.length; i++) {
		samples.push(readU32BE(data, offset))
		offset += 4
	}

	return samples
}

function defaultFtyp(): M4aFtyp {
	return {
		majorBrand: 'M4A ',
		minorVersion: 0,
		compatibleBrands: ['M4A ', 'mp42', 'isom'],
	}
}

function defaultMvhd(): M4aMvhd {
	return {
		version: 0,
		creationTime: 0,
		modificationTime: 0,
		timescale: 1000,
		duration: 0,
		rate: 1,
		volume: 1,
		nextTrackId: 1,
	}
}

// Binary reading helpers
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readI16BE(data: Uint8Array, offset: number): number {
	const u = readU16BE(data, offset)
	return u > 0x7fff ? u - 0x10000 : u
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readU64BE(data: Uint8Array, offset: number): bigint {
	const high = BigInt(readU32BE(data, offset))
	const low = BigInt(readU32BE(data, offset + 4))
	return (high << 32n) | low
}

function readString(data: Uint8Array, offset: number, length: number): string {
	let str = ''
	for (let i = 0; i < length && offset + i < data.length; i++) {
		str += String.fromCharCode(data[offset + i]!)
	}
	return str
}
