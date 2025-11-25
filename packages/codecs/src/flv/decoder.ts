/**
 * FLV (Flash Video) decoder
 * Parses FLV container and extracts streams
 */

import type { ImageData } from '@mconv/core'
import { decodeJpeg } from '../jpeg'
import {
	FLV_MAGIC,
	FlvAudioCodec,
	FlvFrameType,
	FlvTagType,
	FlvVideoCodec,
	type FlvAudioTag,
	type FlvHeader,
	type FlvInfo,
	type FlvMetadata,
	type FlvTag,
	type FlvVideo,
	type FlvVideoTag,
} from './types'

/**
 * Check if data is an FLV file
 */
export function isFlv(data: Uint8Array): boolean {
	if (data.length < 9) return false
	// Check 'FLV' signature
	return data[0] === 0x46 && data[1] === 0x4c && data[2] === 0x56
}

/**
 * Parse FLV header
 */
export function parseFlvHeader(data: Uint8Array): FlvHeader {
	if (!isFlv(data)) {
		throw new Error('Invalid FLV: bad magic number')
	}

	const version = data[3]!
	const flags = data[4]!
	const dataOffset = readU32BE(data, 5)

	return {
		version,
		hasAudio: (flags & 0x04) !== 0,
		hasVideo: (flags & 0x01) !== 0,
		dataOffset,
	}
}

/**
 * Parse FLV info
 */
export function parseFlvInfo(data: Uint8Array): FlvInfo {
	const header = parseFlvHeader(data)
	const tags = parseTags(data, header.dataOffset)

	// Find metadata
	let metadata: FlvMetadata = {}
	for (const tag of tags) {
		if (tag.type === FlvTagType.SCRIPT) {
			metadata = parseScriptData(tag.data) || {}
			break
		}
	}

	// Find video codec from first video tag
	let videoCodec: number | undefined
	let width = metadata.width || 0
	let height = metadata.height || 0
	let frameRate = metadata.framerate || 30

	for (const tag of tags) {
		if (tag.type === FlvTagType.VIDEO && tag.data.length > 0) {
			const videoTag = parseVideoTag(tag.data)
			videoCodec = videoTag.codecId
			break
		}
	}

	// Find audio codec from first audio tag
	let audioCodec: number | undefined
	for (const tag of tags) {
		if (tag.type === FlvTagType.AUDIO && tag.data.length > 0) {
			const audioTag = parseAudioTag(tag.data)
			audioCodec = audioTag.soundFormat
			break
		}
	}

	return {
		header,
		metadata,
		width,
		height,
		frameRate,
		duration: metadata.duration || 0,
		videoCodec,
		audioCodec,
		hasAudio: header.hasAudio,
		hasVideo: header.hasVideo,
	}
}

/**
 * Decode FLV file
 */
export function decodeFlv(data: Uint8Array): FlvVideo {
	const header = parseFlvHeader(data)
	const tags = parseTags(data, header.dataOffset)

	// Parse metadata
	let metadata: FlvMetadata = {}
	for (const tag of tags) {
		if (tag.type === FlvTagType.SCRIPT) {
			metadata = parseScriptData(tag.data) || {}
			break
		}
	}

	// Parse video tags
	const videoTags: FlvVideoTag[] = []
	for (const tag of tags) {
		if (tag.type === FlvTagType.VIDEO && tag.data.length > 0) {
			videoTags.push(parseVideoTag(tag.data))
		}
	}

	// Parse audio tags
	const audioTags: FlvAudioTag[] = []
	for (const tag of tags) {
		if (tag.type === FlvTagType.AUDIO && tag.data.length > 0) {
			audioTags.push(parseAudioTag(tag.data))
		}
	}

	// Determine dimensions from first video tag if not in metadata
	let width = metadata.width || 0
	let height = metadata.height || 0
	const frameRate = metadata.framerate || 30

	const info: FlvInfo = {
		header,
		metadata,
		width,
		height,
		frameRate,
		duration: metadata.duration || 0,
		videoCodec: videoTags[0]?.codecId,
		audioCodec: audioTags[0]?.soundFormat,
		hasAudio: header.hasAudio,
		hasVideo: header.hasVideo,
	}

	return { info, tags, videoTags, audioTags }
}

/**
 * Decode FLV video frames to RGBA (only for JPEG-like formats)
 */
export function decodeFlvFrames(data: Uint8Array): ImageData[] {
	const video = decodeFlv(data)
	const frames: ImageData[] = []

	// Only support JPEG-based extraction for now
	// H.264 and other codecs require complex decoders
	for (const tag of video.videoTags) {
		// Skip sequence headers and command frames
		if (tag.frameType === FlvFrameType.VIDEO_INFO) continue
		if (tag.codecId === FlvVideoCodec.AVC && tag.avcPacketType === 0) continue

		// Try to decode JPEG data (for Screen video which embeds JPEGs)
		if (tag.data.length > 2 && tag.data[0] === 0xff && tag.data[1] === 0xd8) {
			try {
				const frame = decodeJpeg(tag.data)
				frames.push(frame)
			} catch {
				// Not valid JPEG, skip
			}
		}
	}

	return frames
}

/**
 * Parse all FLV tags
 */
function parseTags(data: Uint8Array, startOffset: number): FlvTag[] {
	const tags: FlvTag[] = []
	let offset = startOffset

	// Skip first PreviousTagSize (always 0)
	if (offset + 4 <= data.length) {
		offset += 4
	}

	while (offset + 11 <= data.length) {
		const tagType = data[offset]! as FlvTag['type']
		const dataSize = readU24BE(data, offset + 1)
		const timestamp = readU24BE(data, offset + 4) | (data[offset + 7]! << 24)
		const streamId = readU24BE(data, offset + 8) // Always 0

		if (offset + 11 + dataSize > data.length) break

		const tagData = data.slice(offset + 11, offset + 11 + dataSize)
		tags.push({
			type: tagType,
			dataSize,
			timestamp,
			streamId,
			data: tagData,
		})

		// Skip to next tag (tag header + data + PreviousTagSize)
		offset += 11 + dataSize + 4
	}

	return tags
}

/**
 * Parse video tag data
 */
function parseVideoTag(data: Uint8Array): FlvVideoTag {
	const firstByte = data[0]!
	const frameType = (firstByte >> 4) as FlvVideoTag['frameType']
	const codecId = (firstByte & 0x0f) as FlvVideoTag['codecId']

	let videoData: Uint8Array
	let avcPacketType: number | undefined
	let compositionTime: number | undefined

	if (codecId === FlvVideoCodec.AVC) {
		// AVC/H.264 specific
		avcPacketType = data[1]
		compositionTime = readI24BE(data, 2)
		videoData = data.slice(5)
	} else {
		videoData = data.slice(1)
	}

	return {
		frameType,
		codecId,
		avcPacketType,
		compositionTime,
		data: videoData,
	}
}

/**
 * Parse audio tag data
 */
function parseAudioTag(data: Uint8Array): FlvAudioTag {
	const firstByte = data[0]!
	const soundFormat = (firstByte >> 4) as FlvAudioTag['soundFormat']
	const soundRate = ((firstByte >> 2) & 0x03) as FlvAudioTag['soundRate']
	const soundSize = (firstByte >> 1) & 0x01
	const soundType = firstByte & 0x01

	let audioData: Uint8Array
	let aacPacketType: number | undefined

	if (soundFormat === FlvAudioCodec.AAC) {
		aacPacketType = data[1]
		audioData = data.slice(2)
	} else {
		audioData = data.slice(1)
	}

	return {
		soundFormat,
		soundRate,
		soundSize,
		soundType,
		aacPacketType,
		data: audioData,
	}
}

/**
 * Parse script data (AMF0 encoded metadata)
 */
function parseScriptData(data: Uint8Array): FlvMetadata | null {
	try {
		// Simple AMF0 parser for onMetaData
		let offset = 0

		// First should be string "onMetaData"
		if (data[offset] !== 0x02) return null // String type
		offset++

		const nameLength = readU16BE(data, offset)
		offset += 2

		const name = String.fromCharCode(...data.slice(offset, offset + nameLength))
		offset += nameLength

		if (name !== 'onMetaData') return null

		// Next should be ECMA array or object
		if (data[offset] !== 0x08 && data[offset] !== 0x03) return null

		const isArray = data[offset] === 0x08
		offset++

		if (isArray) {
			// Skip array length
			offset += 4
		}

		// Parse properties
		const metadata: FlvMetadata = {}

		while (offset < data.length - 3) {
			// Check for end marker
			if (data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 0x09) {
				break
			}

			// Read property name
			const propNameLength = readU16BE(data, offset)
			offset += 2

			if (propNameLength === 0 || offset + propNameLength > data.length) break

			const propName = String.fromCharCode(...data.slice(offset, offset + propNameLength))
			offset += propNameLength

			// Read value
			const valueType = data[offset++]

			switch (valueType) {
				case 0x00: {
					// Number (IEEE 754 double)
					const value = readF64BE(data, offset)
					offset += 8
					metadata[propName] = value
					break
				}
				case 0x01: {
					// Boolean
					metadata[propName] = data[offset++] !== 0
					break
				}
				case 0x02: {
					// String
					const strLength = readU16BE(data, offset)
					offset += 2
					metadata[propName] = String.fromCharCode(...data.slice(offset, offset + strLength))
					offset += strLength
					break
				}
				default:
					// Skip unknown types
					return metadata
			}
		}

		return metadata
	} catch {
		return null
	}
}

// Binary reading helpers (big-endian)
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readU24BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 16) | (data[offset + 1]! << 8) | data[offset + 2]!
}

function readI24BE(data: Uint8Array, offset: number): number {
	const u = readU24BE(data, offset)
	return u > 0x7fffff ? u - 0x1000000 : u
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) >>> 0) |
		(data[offset + 1]! << 16) |
		(data[offset + 2]! << 8) |
		data[offset + 3]!
	)
}

function readF64BE(data: Uint8Array, offset: number): number {
	const buffer = new ArrayBuffer(8)
	const view = new DataView(buffer)
	for (let i = 0; i < 8; i++) {
		view.setUint8(i, data[offset + i]!)
	}
	return view.getFloat64(0, false) // big-endian
}
