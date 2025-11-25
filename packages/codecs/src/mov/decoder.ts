/**
 * MOV/QuickTime decoder
 * Parses QuickTime container structure and extracts track info
 */

import type { ImageData, VideoData, VideoFrame } from '@sylphx/codec-core'
import { decodeJpeg } from '../jpeg'
import {
	MovHandlerType,
	type MovAtom,
	type MovFtyp,
	type MovHdlr,
	type MovInfo,
	type MovMdhd,
	type MovMvhd,
	type MovSampleEntry,
	type MovStscEntry,
	type MovSttsEntry,
	type MovTkhd,
	type MovTrack,
	type MovVideo,
} from './types'

// Container atom types that have children
const CONTAINER_ATOMS = new Set([
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
 * Check if data is a MOV/QuickTime file
 */
export function isMov(data: Uint8Array): boolean {
	if (data.length < 8) return false

	// Check for ftyp atom with QuickTime brand
	const size = readU32BE(data, 0)
	const type = readString(data, 4, 4)

	if (type === 'ftyp' && size >= 8) {
		// Check for QuickTime brand
		const brand = readString(data, 8, 4)
		if (brand.startsWith('qt') || brand === 'M4V ' || brand === 'M4A ') {
			return true
		}
	}

	// Some files start with mdat or free, check further
	if (type === 'mdat' || type === 'free' || type === 'skip' || type === 'wide') {
		// Look for moov or ftyp later in the file
		let offset = size
		while (offset < Math.min(data.length, 1024 * 1024)) {
			if (offset + 8 > data.length) break
			const nextType = readString(data, offset + 4, 4)
			if (nextType === 'ftyp') {
				const brand = readString(data, offset + 8, 4)
				if (brand.startsWith('qt') || brand === 'M4V ' || brand === 'M4A ') {
					return true
				}
			}
			if (nextType === 'moov') return true
			const nextSize = readU32BE(data, offset)
			if (nextSize < 8) break
			offset += nextSize
		}
	}

	return false
}

/**
 * Parse MOV file info
 */
export function parseMovInfo(data: Uint8Array): MovInfo {
	const atoms = parseAtoms(data, 0, data.length)

	// Find ftyp
	const ftypAtom = findAtom(atoms, 'ftyp')
	const ftyp = ftypAtom ? parseFtyp(ftypAtom.data!) : defaultFtyp()

	// Find moov
	const moovAtom = findAtom(atoms, 'moov')
	if (!moovAtom || !moovAtom.children) {
		throw new Error('Invalid MOV: missing moov atom')
	}

	// Parse mvhd
	const mvhdAtom = findAtom(moovAtom.children, 'mvhd')
	const mvhd = mvhdAtom ? parseMvhd(mvhdAtom.data!) : defaultMvhd()

	// Parse tracks
	const tracks: MovTrack[] = []
	for (const atom of moovAtom.children) {
		if (atom.type === 'trak' && atom.children) {
			const track = parseTrack(atom, data)
			if (track) tracks.push(track)
		}
	}

	// Find video and audio tracks
	const videoTrack = tracks.find((t) => t.type === 'video')
	const audioTrack = tracks.find((t) => t.type === 'audio')

	// Calculate frame rate from video track
	let frameRate = 30
	if (videoTrack && videoTrack.timeToSample.length > 0) {
		const firstEntry = videoTrack.timeToSample[0]!
		if (firstEntry.sampleDelta > 0) {
			frameRate = videoTrack.timescale / firstEntry.sampleDelta
		}
	}

	return {
		ftyp,
		mvhd,
		duration: mvhd.duration / mvhd.timescale,
		timescale: mvhd.timescale,
		tracks,
		hasVideo: videoTrack !== undefined,
		hasAudio: audioTrack !== undefined,
		videoTrack,
		audioTrack,
		width: videoTrack?.width || 0,
		height: videoTrack?.height || 0,
		frameRate,
	}
}

/**
 * Decode MOV file
 */
export function decodeMov(data: Uint8Array): MovVideo {
	const atoms = parseAtoms(data, 0, data.length)
	const info = parseMovInfo(data)

	// Find mdat
	const mdatAtom = findAtom(atoms, 'mdat')
	const mdatData = mdatAtom ? data.slice(mdatAtom.offset + 8, mdatAtom.offset + mdatAtom.size) : undefined

	return { info, atoms, mdatData }
}

/**
 * Decode MOV to VideoData
 */
export function decodeMovToVideo(data: Uint8Array): VideoData {
	const mov = decodeMov(data)
	const frames = decodeMovFrames(data)

	if (frames.length === 0) {
		throw new Error('No decodable video frames found in MOV file')
	}

	const { width, height, duration, frameRate } = mov.info

	// Calculate timestamps and durations for frames
	const frameDuration = 1000 / frameRate
	const videoFrames: VideoFrame[] = frames.map((image, i) => ({
		image,
		timestamp: i * frameDuration,
		duration: frameDuration,
	}))

	return {
		width,
		height,
		frames: videoFrames,
		duration: duration * 1000, // Convert to milliseconds
		fps: frameRate,
	}
}

/**
 * Decode MOV video frames to RGBA (only for MJPEG)
 */
export function decodeMovFrames(data: Uint8Array): ImageData[] {
	const video = decodeMov(data)
	const frames: ImageData[] = []

	if (!video.info.videoTrack || !video.mdatData) {
		return frames
	}

	const track = video.info.videoTrack
	const codec = track.codec?.toLowerCase()

	// Only support MJPEG
	if (codec !== 'jpeg' && codec !== 'mjpa' && codec !== 'mjpb') {
		return frames
	}

	// Get sample offsets and sizes
	const samples = getSampleInfo(track, data)

	for (const sample of samples) {
		try {
			const sampleData = data.slice(sample.offset, sample.offset + sample.size)

			// Check for JPEG marker
			if (sampleData.length > 2 && sampleData[0] === 0xff && sampleData[1] === 0xd8) {
				const frame = decodeJpeg(sampleData)
				frames.push(frame)
			}
		} catch {
			// Skip invalid frames
		}
	}

	return frames
}

/**
 * Get sample (frame) info from track
 */
function getSampleInfo(
	track: MovTrack,
	data: Uint8Array
): Array<{ offset: number; size: number }> {
	const samples: Array<{ offset: number; size: number }> = []

	// Build chunk-to-sample mapping
	let sampleIndex = 0

	for (let chunkIndex = 0; chunkIndex < track.chunkOffsets.length; chunkIndex++) {
		const chunkOffset = track.chunkOffsets[chunkIndex]!

		// Find how many samples in this chunk
		let samplesInChunk = 1
		for (const stsc of track.sampleToChunk) {
			if (chunkIndex + 1 >= stsc.firstChunk) {
				samplesInChunk = stsc.samplesPerChunk
			}
		}

		let offsetInChunk = 0
		for (let i = 0; i < samplesInChunk && sampleIndex < track.sampleSizes.length; i++) {
			const size = track.sampleSizes[sampleIndex]!
			samples.push({
				offset: chunkOffset + offsetInChunk,
				size,
			})
			offsetInChunk += size
			sampleIndex++
		}
	}

	return samples
}

/**
 * Parse all atoms in a range
 */
function parseAtoms(data: Uint8Array, start: number, end: number): MovAtom[] {
	const atoms: MovAtom[] = []
	let offset = start

	while (offset + 8 <= end) {
		let size = readU32BE(data, offset)
		const type = readString(data, offset + 4, 4)

		if (size === 0) {
			// Atom extends to end of file
			size = end - offset
		} else if (size === 1) {
			// 64-bit size
			if (offset + 16 > end) break
			size = Number(readU64BE(data, offset + 8))
		}

		if (size < 8 || offset + size > end) break

		const atom: MovAtom = {
			type,
			size,
			offset,
		}

		// Parse container atoms recursively
		if (CONTAINER_ATOMS.has(type)) {
			const headerSize = size === 1 ? 16 : 8
			atom.children = parseAtoms(data, offset + headerSize, offset + size)
		} else {
			// Store atom data
			const headerSize = size === 1 ? 16 : 8
			atom.data = data.slice(offset + headerSize, offset + size)
		}

		atoms.push(atom)
		offset += size
	}

	return atoms
}

/**
 * Find an atom by type
 */
function findAtom(atoms: MovAtom[], type: string): MovAtom | undefined {
	for (const atom of atoms) {
		if (atom.type === type) return atom
		if (atom.children) {
			const found = findAtom(atom.children, type)
			if (found) return found
		}
	}
	return undefined
}

/**
 * Parse ftyp atom
 */
function parseFtyp(data: Uint8Array): MovFtyp {
	const majorBrand = readString(data, 0, 4)
	const minorVersion = readU32BE(data, 4)

	const compatibleBrands: string[] = []
	for (let i = 8; i + 4 <= data.length; i += 4) {
		compatibleBrands.push(readString(data, i, 4))
	}

	return { majorBrand, minorVersion, compatibleBrands }
}

/**
 * Parse mvhd atom
 */
function parseMvhd(data: Uint8Array): MovMvhd {
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
function parseTrack(trakAtom: MovAtom, data: Uint8Array): MovTrack | null {
	if (!trakAtom.children) return null

	// Parse tkhd
	const tkhdAtom = findAtom(trakAtom.children, 'tkhd')
	if (!tkhdAtom || !tkhdAtom.data) return null

	const tkhd = parseTkhd(tkhdAtom.data)

	// Find mdia
	const mdiaAtom = findAtom(trakAtom.children, 'mdia')
	if (!mdiaAtom || !mdiaAtom.children) return null

	// Parse mdhd
	const mdhdAtom = findAtom(mdiaAtom.children, 'mdhd')
	const mdhd = mdhdAtom && mdhdAtom.data ? parseMdhd(mdhdAtom.data) : null

	// Parse hdlr
	const hdlrAtom = findAtom(mdiaAtom.children, 'hdlr')
	const hdlr = hdlrAtom && hdlrAtom.data ? parseHdlr(hdlrAtom.data) : null

	// Determine track type
	let trackType: 'video' | 'audio' | 'other' = 'other'
	if (hdlr) {
		if (hdlr.handlerType === MovHandlerType.VIDEO) trackType = 'video'
		else if (hdlr.handlerType === MovHandlerType.AUDIO) trackType = 'audio'
	}

	// Find stbl
	const minfAtom = findAtom(mdiaAtom.children, 'minf')
	const stblAtom = minfAtom && minfAtom.children ? findAtom(minfAtom.children, 'stbl') : null

	if (!stblAtom || !stblAtom.children) return null

	// Parse stsd (sample descriptions)
	const stsdAtom = findAtom(stblAtom.children, 'stsd')
	const sampleEntries = stsdAtom && stsdAtom.data ? parseStsd(stsdAtom.data, trackType) : []

	// Parse stts (time to sample)
	const sttsAtom = findAtom(stblAtom.children, 'stts')
	const timeToSample = sttsAtom && sttsAtom.data ? parseStts(sttsAtom.data) : []

	// Parse stsc (sample to chunk)
	const stscAtom = findAtom(stblAtom.children, 'stsc')
	const sampleToChunk = stscAtom && stscAtom.data ? parseStsc(stscAtom.data) : []

	// Parse stsz (sample sizes)
	const stszAtom = findAtom(stblAtom.children, 'stsz')
	const { sampleCount, sampleSizes } = stszAtom && stszAtom.data ? parseStsz(stszAtom.data) : { sampleCount: 0, sampleSizes: [] }

	// Parse stco/co64 (chunk offsets)
	const stcoAtom = findAtom(stblAtom.children, 'stco')
	const co64Atom = findAtom(stblAtom.children, 'co64')
	let chunkOffsets: number[] = []
	if (stcoAtom && stcoAtom.data) {
		chunkOffsets = parseStco(stcoAtom.data)
	} else if (co64Atom && co64Atom.data) {
		chunkOffsets = parseCo64(co64Atom.data)
	}

	// Parse stss (sync samples)
	const stssAtom = findAtom(stblAtom.children, 'stss')
	const syncSamples = stssAtom && stssAtom.data ? parseStss(stssAtom.data) : undefined

	const timescale = mdhd?.timescale || 1
	const duration = mdhd?.duration || 0

	return {
		trackId: tkhd.trackId,
		type: trackType,
		duration: duration / timescale,
		timescale,
		width: trackType === 'video' ? Math.round(tkhd.width) : undefined,
		height: trackType === 'video' ? Math.round(tkhd.height) : undefined,
		codec: sampleEntries[0]?.format,
		sampleRate: trackType === 'audio' ? sampleEntries[0]?.sampleRate : undefined,
		channelCount: trackType === 'audio' ? sampleEntries[0]?.channelCount : undefined,
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
 * Parse tkhd atom
 */
function parseTkhd(data: Uint8Array): MovTkhd {
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
	offset += 2
	offset += 2 // reserved
	offset += 36 // matrix

	const width = readU32BE(data, offset) / 65536
	offset += 4
	const height = readU32BE(data, offset) / 65536

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
		width,
		height,
	}
}

/**
 * Parse mdhd atom
 */
function parseMdhd(data: Uint8Array): MovMdhd {
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
 * Parse hdlr atom
 */
function parseHdlr(data: Uint8Array): MovHdlr {
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
 * Parse stsd atom (sample descriptions)
 */
function parseStsd(data: Uint8Array, trackType: 'video' | 'audio' | 'other'): MovSampleEntry[] {
	const entries: MovSampleEntry[] = []
	let offset = 4 // version + flags

	const entryCount = readU32BE(data, offset)
	offset += 4

	for (let i = 0; i < entryCount && offset + 8 <= data.length; i++) {
		const entrySize = readU32BE(data, offset)
		const format = readString(data, offset + 4, 4)
		offset += 8

		if (entrySize < 8) break

		const entry: MovSampleEntry = {
			format,
			dataReferenceIndex: readU16BE(data, offset + 6),
		}

		if (trackType === 'video') {
			// Video sample entry
			offset += 8 // reserved + data_reference_index
			offset += 16 // pre_defined + reserved
			entry.width = readU16BE(data, offset)
			entry.height = readU16BE(data, offset + 2)
			entry.horizResolution = readU32BE(data, offset + 4) / 65536
			entry.vertResolution = readU32BE(data, offset + 8) / 65536
			offset += 12
			offset += 4 // reserved
			entry.frameCount = readU16BE(data, offset)
			offset += 2

			// Compressor name (32 bytes)
			const nameLen = data[offset]!
			entry.compressorName = readString(data, offset + 1, Math.min(nameLen, 31))
			offset += 32

			entry.depth = readU16BE(data, offset)
			offset += 2
			offset += 2 // pre_defined
		} else if (trackType === 'audio') {
			// Audio sample entry
			offset += 8 // reserved + data_reference_index
			offset += 8 // reserved
			entry.channelCount = readU16BE(data, offset)
			entry.sampleSize = readU16BE(data, offset + 2)
			offset += 4
			offset += 4 // pre_defined + reserved
			entry.sampleRate = readU32BE(data, offset) / 65536
			offset += 4
		}

		entries.push(entry)
		offset = offset // Continue to next entry
	}

	return entries
}

/**
 * Parse stts atom (time to sample)
 */
function parseStts(data: Uint8Array): MovSttsEntry[] {
	const entries: MovSttsEntry[] = []
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
 * Parse stsc atom (sample to chunk)
 */
function parseStsc(data: Uint8Array): MovStscEntry[] {
	const entries: MovStscEntry[] = []
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
 * Parse stsz atom (sample sizes)
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
 * Parse stco atom (chunk offsets)
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
 * Parse co64 atom (64-bit chunk offsets)
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
 * Parse stss atom (sync samples)
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

function defaultFtyp(): MovFtyp {
	return {
		majorBrand: 'qt  ',
		minorVersion: 512,
		compatibleBrands: ['qt  '],
	}
}

function defaultMvhd(): MovMvhd {
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
