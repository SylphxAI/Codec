/**
 * MKV/WebM (Matroska) encoder
 * Creates MKV files with MJPEG video
 */

import type { ImageData } from '@mconv/core'
import { encodeJpeg } from '../jpeg'
import { EbmlId, MkvTrackType, type MkvEncodeOptions } from './types'

/**
 * Encode frames to MKV
 */
export function encodeMkv(frames: ImageData[], options: MkvEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const {
		frameRate = 30,
		timescale = 1000000, // nanoseconds, default 1ms
		quality = 85,
		codecId = 'V_MJPEG',
		docType = 'matroska',
	} = options

	const firstFrame = frames[0]!
	const width = firstFrame.width
	const height = firstFrame.height

	// Encode frames to JPEG
	const jpegFrames = frames.map((frame) => encodeJpeg(frame, { quality }))

	// Calculate duration in timescale units
	const frameDuration = Math.round(timescale / frameRate)
	const totalDuration = frameDuration * frames.length

	// Build EBML structure
	const parts: Uint8Array[] = []

	// EBML Header
	parts.push(buildEbmlHeader(docType))

	// Segment (with content)
	parts.push(buildSegment(width, height, codecId, frameDuration, totalDuration, timescale, jpegFrames))

	// Concatenate all parts
	return concatArrays(parts)
}

/**
 * Build EBML header
 */
function buildEbmlHeader(docType: string): Uint8Array {
	const elements: Uint8Array[] = []

	// EBMLVersion: 1
	elements.push(buildUintElement(EbmlId.EBMLVersion, 1))
	// EBMLReadVersion: 1
	elements.push(buildUintElement(EbmlId.EBMLReadVersion, 1))
	// EBMLMaxIDLength: 4
	elements.push(buildUintElement(EbmlId.EBMLMaxIDLength, 4))
	// EBMLMaxSizeLength: 8
	elements.push(buildUintElement(EbmlId.EBMLMaxSizeLength, 8))
	// DocType
	elements.push(buildStringElement(EbmlId.DocType, docType))
	// DocTypeVersion: 4
	elements.push(buildUintElement(EbmlId.DocTypeVersion, 4))
	// DocTypeReadVersion: 2
	elements.push(buildUintElement(EbmlId.DocTypeReadVersion, 2))

	return buildMasterElement(EbmlId.EBML, concatArrays(elements))
}

/**
 * Build Segment
 */
function buildSegment(
	width: number,
	height: number,
	codecId: string,
	frameDuration: number,
	totalDuration: number,
	timescale: number,
	jpegFrames: Uint8Array[]
): Uint8Array {
	const elements: Uint8Array[] = []

	// Info
	elements.push(buildInfo(timescale, totalDuration))

	// Tracks
	elements.push(buildTracks(width, height, codecId, frameDuration))

	// Clusters (one cluster per frame for simplicity)
	let timestamp = 0
	for (let i = 0; i < jpegFrames.length; i++) {
		elements.push(buildCluster(timestamp, 1, jpegFrames[i]!, i === 0))
		timestamp += frameDuration
	}

	return buildMasterElement(EbmlId.Segment, concatArrays(elements))
}

/**
 * Build Info element
 */
function buildInfo(timescale: number, duration: number): Uint8Array {
	const elements: Uint8Array[] = []

	// TimestampScale (nanoseconds per unit)
	elements.push(buildUintElement(EbmlId.TimestampScale, timescale))
	// Duration (as float)
	elements.push(buildFloatElement(EbmlId.Duration, duration))
	// MuxingApp
	elements.push(buildStringElement(EbmlId.MuxingApp, 'mconv'))
	// WritingApp
	elements.push(buildStringElement(EbmlId.WritingApp, 'mconv MKV encoder'))

	return buildMasterElement(EbmlId.Info, concatArrays(elements))
}

/**
 * Build Tracks element
 */
function buildTracks(width: number, height: number, codecId: string, frameDuration: number): Uint8Array {
	const trackEntry = buildVideoTrack(1, width, height, codecId, frameDuration)
	return buildMasterElement(EbmlId.Tracks, trackEntry)
}

/**
 * Build video TrackEntry
 */
function buildVideoTrack(
	trackNumber: number,
	width: number,
	height: number,
	codecId: string,
	defaultDuration: number
): Uint8Array {
	const elements: Uint8Array[] = []

	// TrackNumber
	elements.push(buildUintElement(EbmlId.TrackNumber, trackNumber))
	// TrackUID
	elements.push(buildUintElement(EbmlId.TrackUID, trackNumber))
	// TrackType (video = 1)
	elements.push(buildUintElement(EbmlId.TrackType, MkvTrackType.VIDEO))
	// FlagEnabled
	elements.push(buildUintElement(EbmlId.FlagEnabled, 1))
	// FlagDefault
	elements.push(buildUintElement(EbmlId.FlagDefault, 1))
	// FlagLacing
	elements.push(buildUintElement(EbmlId.FlagLacing, 0))
	// DefaultDuration (nanoseconds)
	elements.push(buildUintElement(EbmlId.DefaultDuration, defaultDuration * 1000))
	// CodecID
	elements.push(buildStringElement(EbmlId.CodecID, codecId))
	// Video settings
	elements.push(buildVideoSettings(width, height))

	return buildMasterElement(EbmlId.TrackEntry, concatArrays(elements))
}

/**
 * Build Video settings element
 */
function buildVideoSettings(width: number, height: number): Uint8Array {
	const elements: Uint8Array[] = []

	// PixelWidth
	elements.push(buildUintElement(EbmlId.PixelWidth, width))
	// PixelHeight
	elements.push(buildUintElement(EbmlId.PixelHeight, height))

	return buildMasterElement(EbmlId.Video, concatArrays(elements))
}

/**
 * Build Cluster element
 */
function buildCluster(timestamp: number, trackNumber: number, frameData: Uint8Array, keyframe: boolean): Uint8Array {
	const elements: Uint8Array[] = []

	// Cluster Timestamp
	elements.push(buildUintElement(EbmlId.Timestamp, timestamp))

	// SimpleBlock
	elements.push(buildSimpleBlock(trackNumber, 0, frameData, keyframe))

	return buildMasterElement(EbmlId.Cluster, concatArrays(elements))
}

/**
 * Build SimpleBlock element
 */
function buildSimpleBlock(
	trackNumber: number,
	relativeTimestamp: number,
	data: Uint8Array,
	keyframe: boolean
): Uint8Array {
	// SimpleBlock format:
	// - Track number (VINT)
	// - Timestamp (signed 16-bit, relative to cluster)
	// - Flags (1 byte)
	// - Frame data

	const trackVint = encodeVint(trackNumber)
	const blockSize = trackVint.length + 2 + 1 + data.length

	const block = new Uint8Array(blockSize)
	let offset = 0

	// Track number
	block.set(trackVint, offset)
	offset += trackVint.length

	// Relative timestamp (signed 16-bit big-endian)
	block[offset] = (relativeTimestamp >> 8) & 0xff
	block[offset + 1] = relativeTimestamp & 0xff
	offset += 2

	// Flags: keyframe (0x80) | no lacing (0x00)
	block[offset] = keyframe ? 0x80 : 0x00
	offset += 1

	// Frame data
	block.set(data, offset)

	return buildBinaryElement(EbmlId.SimpleBlock, block)
}

/**
 * Build master element (contains other elements)
 */
function buildMasterElement(id: number, content: Uint8Array): Uint8Array {
	const idBytes = encodeElementId(id)
	const sizeBytes = encodeVintSize(content.length)

	const result = new Uint8Array(idBytes.length + sizeBytes.length + content.length)
	let offset = 0

	result.set(idBytes, offset)
	offset += idBytes.length

	result.set(sizeBytes, offset)
	offset += sizeBytes.length

	result.set(content, offset)

	return result
}

/**
 * Build unsigned integer element
 */
function buildUintElement(id: number, value: number): Uint8Array {
	const idBytes = encodeElementId(id)
	const valueBytes = encodeUint(value)
	const sizeBytes = encodeVintSize(valueBytes.length)

	const result = new Uint8Array(idBytes.length + sizeBytes.length + valueBytes.length)
	let offset = 0

	result.set(idBytes, offset)
	offset += idBytes.length

	result.set(sizeBytes, offset)
	offset += sizeBytes.length

	result.set(valueBytes, offset)

	return result
}

/**
 * Build float element (64-bit)
 */
function buildFloatElement(id: number, value: number): Uint8Array {
	const idBytes = encodeElementId(id)
	const valueBytes = new Uint8Array(8)
	const view = new DataView(valueBytes.buffer)
	view.setFloat64(0, value, false) // Big-endian
	const sizeBytes = encodeVintSize(8)

	const result = new Uint8Array(idBytes.length + sizeBytes.length + 8)
	let offset = 0

	result.set(idBytes, offset)
	offset += idBytes.length

	result.set(sizeBytes, offset)
	offset += sizeBytes.length

	result.set(valueBytes, offset)

	return result
}

/**
 * Build string element
 */
function buildStringElement(id: number, value: string): Uint8Array {
	const idBytes = encodeElementId(id)
	const valueBytes = new Uint8Array(value.length)
	for (let i = 0; i < value.length; i++) {
		valueBytes[i] = value.charCodeAt(i)
	}
	const sizeBytes = encodeVintSize(valueBytes.length)

	const result = new Uint8Array(idBytes.length + sizeBytes.length + valueBytes.length)
	let offset = 0

	result.set(idBytes, offset)
	offset += idBytes.length

	result.set(sizeBytes, offset)
	offset += sizeBytes.length

	result.set(valueBytes, offset)

	return result
}

/**
 * Build binary element
 */
function buildBinaryElement(id: number, data: Uint8Array): Uint8Array {
	const idBytes = encodeElementId(id)
	const sizeBytes = encodeVintSize(data.length)

	const result = new Uint8Array(idBytes.length + sizeBytes.length + data.length)
	let offset = 0

	result.set(idBytes, offset)
	offset += idBytes.length

	result.set(sizeBytes, offset)
	offset += sizeBytes.length

	result.set(data, offset)

	return result
}

/**
 * Encode element ID (IDs already include VINT marker bits)
 * 1-byte: 1xxx xxxx (0x80-0xFF)
 * 2-byte: 01xx xxxx (0x4000-0x7FFF)
 * 3-byte: 001x xxxx (0x200000-0x3FFFFF)
 * 4-byte: 0001 xxxx (0x10000000-0x1FFFFFFF)
 */
function encodeElementId(id: number): Uint8Array {
	if (id >= 0x80 && id <= 0xff) {
		return new Uint8Array([id])
	} else if (id >= 0x4000 && id <= 0x7fff) {
		return new Uint8Array([(id >> 8) & 0xff, id & 0xff])
	} else if (id >= 0x200000 && id <= 0x3fffff) {
		return new Uint8Array([(id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff])
	} else {
		return new Uint8Array([(id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff])
	}
}

/**
 * Encode VINT for size (with marker bit)
 */
function encodeVintSize(size: number): Uint8Array {
	if (size < 0x7f) {
		return new Uint8Array([0x80 | size])
	} else if (size < 0x3fff) {
		return new Uint8Array([0x40 | ((size >> 8) & 0x3f), size & 0xff])
	} else if (size < 0x1fffff) {
		return new Uint8Array([0x20 | ((size >> 16) & 0x1f), (size >> 8) & 0xff, size & 0xff])
	} else if (size < 0x0fffffff) {
		return new Uint8Array([0x10 | ((size >> 24) & 0x0f), (size >> 16) & 0xff, (size >> 8) & 0xff, size & 0xff])
	} else {
		// 5+ byte size
		return new Uint8Array([
			0x08 | ((size / 0x100000000) & 0x07),
			(size >> 24) & 0xff,
			(size >> 16) & 0xff,
			(size >> 8) & 0xff,
			size & 0xff,
		])
	}
}

/**
 * Encode VINT (for track number in block)
 */
function encodeVint(value: number): Uint8Array {
	if (value < 0x7f) {
		return new Uint8Array([0x80 | value])
	} else if (value < 0x3fff) {
		return new Uint8Array([0x40 | ((value >> 8) & 0x3f), value & 0xff])
	} else {
		return new Uint8Array([0x20 | ((value >> 16) & 0x1f), (value >> 8) & 0xff, value & 0xff])
	}
}

/**
 * Encode unsigned integer (minimal bytes)
 */
function encodeUint(value: number): Uint8Array {
	if (value === 0) {
		return new Uint8Array([0])
	}

	const bytes: number[] = []
	let v = value

	while (v > 0) {
		bytes.unshift(v & 0xff)
		v = Math.floor(v / 256)
	}

	return new Uint8Array(bytes)
}

/**
 * Concatenate arrays
 */
function concatArrays(arrays: Uint8Array[]): Uint8Array {
	const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
	const result = new Uint8Array(totalLength)

	let offset = 0
	for (const arr of arrays) {
		result.set(arr, offset)
		offset += arr.length
	}

	return result
}
