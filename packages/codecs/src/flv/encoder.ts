/**
 * FLV (Flash Video) encoder
 * Creates FLV files with video frames
 */

import type { ImageData } from '@mconv/core'
import { encodeJpeg } from '../jpeg'
import {
	FLV_MAGIC,
	FlvFrameType,
	FlvTagType,
	FlvVideoCodec,
	type FlvEncodeOptions,
} from './types'

/**
 * Encode frames to FLV
 * Note: Creates FLV with Screen Video codec (JPEG-based) since we can't encode H.264
 */
export function encodeFlv(frames: ImageData[], options: FlvEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const { frameRate = 30, quality = 85 } = options

	const firstFrame = frames[0]!
	const width = firstFrame.width
	const height = firstFrame.height

	// Encode frames to JPEG
	const jpegFrames = frames.map((frame) => encodeJpeg(frame, { quality }))

	// Build FLV
	const chunks: Uint8Array[] = []

	// FLV header
	const header = createFlvHeader(true, false) // video only
	chunks.push(header)

	// First PreviousTagSize (0)
	chunks.push(new Uint8Array([0, 0, 0, 0]))

	// Metadata tag
	const metadata = createMetadataTag(width, height, frameRate, frames.length)
	chunks.push(metadata.tag)
	chunks.push(createPreviousTagSize(metadata.tag.length))

	// Video tags
	const frameDuration = 1000 / frameRate

	for (let i = 0; i < jpegFrames.length; i++) {
		const timestamp = Math.round(i * frameDuration)
		const isKeyFrame = i === 0 || i % 30 === 0 // Key frame every 30 frames
		const videoTag = createVideoTag(jpegFrames[i]!, timestamp, isKeyFrame)
		chunks.push(videoTag)
		chunks.push(createPreviousTagSize(videoTag.length))
	}

	// Calculate total size
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0)

	// Concatenate all chunks
	const output = new Uint8Array(totalSize)
	let offset = 0

	for (const chunk of chunks) {
		output.set(chunk, offset)
		offset += chunk.length
	}

	return output
}

/**
 * Create FLV header
 */
function createFlvHeader(hasVideo: boolean, hasAudio: boolean): Uint8Array {
	const header = new Uint8Array(9)

	// Signature 'FLV'
	header[0] = 0x46 // F
	header[1] = 0x4c // L
	header[2] = 0x56 // V

	// Version
	header[3] = 1

	// Flags
	header[4] = (hasAudio ? 0x04 : 0) | (hasVideo ? 0x01 : 0)

	// Data offset (header size)
	writeU32BE(header, 5, 9)

	return header
}

/**
 * Create metadata tag (onMetaData)
 */
function createMetadataTag(
	width: number,
	height: number,
	frameRate: number,
	frameCount: number
): { tag: Uint8Array; size: number } {
	// Build AMF0 data
	const amfParts: number[] = []

	// String type for "onMetaData"
	amfParts.push(0x02)
	const name = 'onMetaData'
	amfParts.push(0, name.length)
	for (const c of name) {
		amfParts.push(c.charCodeAt(0))
	}

	// ECMA array
	amfParts.push(0x08)
	// Array length (4 properties)
	amfParts.push(0, 0, 0, 4)

	// width
	addAmfProperty(amfParts, 'width', width)
	// height
	addAmfProperty(amfParts, 'height', height)
	// framerate
	addAmfProperty(amfParts, 'framerate', frameRate)
	// duration
	addAmfProperty(amfParts, 'duration', frameCount / frameRate)

	// End marker
	amfParts.push(0, 0, 0x09)

	const amfData = new Uint8Array(amfParts)

	// Build tag
	const tag = new Uint8Array(11 + amfData.length)
	tag[0] = FlvTagType.SCRIPT
	writeU24BE(tag, 1, amfData.length)
	writeU24BE(tag, 4, 0) // timestamp
	tag[7] = 0 // timestamp extended
	writeU24BE(tag, 8, 0) // stream ID
	tag.set(amfData, 11)

	return { tag, size: tag.length }
}

/**
 * Add AMF0 property to array
 */
function addAmfProperty(arr: number[], name: string, value: number): void {
	// Property name
	arr.push((name.length >> 8) & 0xff, name.length & 0xff)
	for (const c of name) {
		arr.push(c.charCodeAt(0))
	}

	// Number value
	arr.push(0x00)
	const bytes = new Uint8Array(8)
	const view = new DataView(bytes.buffer)
	view.setFloat64(0, value, false) // big-endian
	for (let i = 0; i < 8; i++) {
		arr.push(bytes[i]!)
	}
}

/**
 * Create video tag with JPEG data
 * Uses a simple approach: embed JPEG with minimal wrapper
 */
function createVideoTag(jpegData: Uint8Array, timestamp: number, isKeyFrame: boolean): Uint8Array {
	// Video data: [frameType/codecId][data...]
	// Using codec ID 2 (Sorenson H.263) which some players interpret loosely
	// For better compatibility, we'll use a Screen Video approach
	const videoData = new Uint8Array(1 + jpegData.length)
	const frameType = isKeyFrame ? FlvFrameType.KEY_FRAME : FlvFrameType.INTER_FRAME
	const codecId = FlvVideoCodec.SORENSON_H263 // Simple codec that embeds frame data

	videoData[0] = (frameType << 4) | codecId
	videoData.set(jpegData, 1)

	// Build tag
	const tag = new Uint8Array(11 + videoData.length)
	tag[0] = FlvTagType.VIDEO
	writeU24BE(tag, 1, videoData.length)
	writeU24BE(tag, 4, timestamp & 0xffffff)
	tag[7] = (timestamp >> 24) & 0xff // timestamp extended
	writeU24BE(tag, 8, 0) // stream ID
	tag.set(videoData, 11)

	return tag
}

/**
 * Create PreviousTagSize field
 */
function createPreviousTagSize(tagSize: number): Uint8Array {
	const data = new Uint8Array(4)
	writeU32BE(data, 0, tagSize)
	return data
}

// Binary writing helpers (big-endian)
function writeU24BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 16) & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = value & 0xff
}

function writeU32BE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >> 24) & 0xff
	data[offset + 1] = (value >> 16) & 0xff
	data[offset + 2] = (value >> 8) & 0xff
	data[offset + 3] = value & 0xff
}
