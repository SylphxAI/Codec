/**
 * RealMedia (RM/RMVB) decoder
 * Parses RealMedia container and extracts streams
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	CONT_MAGIC,
	DATA_MAGIC,
	MDPR_MAGIC,
	PROP_MAGIC,
	RM_MAGIC,
	RmStreamType,
	type RealAudioSpecific,
	type RealVideoSpecific,
	type RmContentDescription,
	type RmFileHeader,
	type RmInfo,
	type RmMediaProperties,
	type RmProperties,
	type RmStream,
	type RmVideo,
} from './types'

/**
 * Check if data is a RealMedia file
 */
export function isRm(data: Uint8Array): boolean {
	if (data.length < 10) return false
	const magic = readU32BE(data, 0)
	return magic === RM_MAGIC
}

/**
 * Parse RealMedia header info
 */
export function parseRmInfo(data: Uint8Array): RmInfo {
	if (!isRm(data)) {
		throw new Error('Invalid RealMedia: bad magic number')
	}

	const fileHeader = parseFileHeader(data)
	const properties = parseProperties(data)
	const contentDescription = parseContentDescription(data)
	const streams = parseStreams(data)

	// Find video stream
	const videoStream = streams.find((s) => s.isVideo)
	const audioStream = streams.find((s) => !s.isVideo)

	const width = videoStream?.videoInfo?.width ?? 0
	const height = videoStream?.videoInfo?.height ?? 0
	const frameRate = videoStream?.videoInfo
		? (videoStream.videoInfo.frameRate >> 16) / 1.0
		: 30

	return {
		fileHeader,
		properties,
		contentDescription,
		streams,
		width,
		height,
		frameRate,
		duration: properties.duration / 1000,
		hasAudio: audioStream !== undefined,
		audioSampleRate: audioStream?.audioInfo?.sampleRate,
		audioChannels: audioStream?.audioInfo?.channels,
	}
}

/**
 * Decode RealMedia file
 */
export function decodeRm(data: Uint8Array): RmVideo {
	const info = parseRmInfo(data)
	const { videoPackets, audioPackets } = extractPackets(data, info)

	return { info, videoPackets, audioPackets }
}

/**
 * Decode RealMedia video frames to RGBA
 * Note: This is a placeholder - full RealVideo decoding requires
 * proprietary codec implementation or external library
 */
export function decodeRmFrames(data: Uint8Array): ImageData[] {
	const video = decodeRm(data)

	// RealVideo decoding would require codec-specific decompression
	// This is a placeholder that returns empty frames
	const frames: ImageData[] = []

	for (const packet of video.videoPackets) {
		// In a real implementation, this would:
		// 1. Parse RealVideo packet structure
		// 2. Decompress video data using codec-specific algorithm
		// 3. Convert YUV to RGBA

		// For now, create a placeholder frame
		if (packet.data.length > 0) {
			const width = video.info.width
			const height = video.info.height
			const frameData = new Uint8Array(width * height * 4)

			// Fill with gray to indicate placeholder
			for (let i = 0; i < width * height; i++) {
				frameData[i * 4] = 128
				frameData[i * 4 + 1] = 128
				frameData[i * 4 + 2] = 128
				frameData[i * 4 + 3] = 255
			}

			frames.push({ width, height, data: frameData })
		}
	}

	return frames
}

/**
 * Get a specific frame as RGBA
 */
export function decodeRmFrame(data: Uint8Array, frameIndex: number): ImageData {
	const frames = decodeRmFrames(data)

	if (frameIndex < 0 || frameIndex >= frames.length) {
		throw new Error(`Invalid frame index: ${frameIndex}`)
	}

	return frames[frameIndex]!
}

/**
 * Parse file header (.RMF chunk)
 */
function parseFileHeader(data: Uint8Array): RmFileHeader {
	// .RMF header structure:
	// 0-3: magic '.RMF'
	// 4-7: size (10 - size of data after this field)
	// 8-9: version (0)
	// 10-13: file version (0)
	// 14-17: num headers

	const size = readU32BE(data, 4)
	if (size !== 10) {
		throw new Error(`Invalid RealMedia: bad file header size (expected 10, got ${size})`)
	}

	return {
		magic: readU32BE(data, 0),
		version: readU16BE(data, 8),
		numHeaders: readU32BE(data, 14),
	}
}

/**
 * Parse properties chunk (PROP)
 */
function parseProperties(data: Uint8Array): RmProperties {
	// Skip .RMF header (18 bytes)
	const propOffset = findChunk(data, 18, PROP_MAGIC)
	if (propOffset < 0) {
		throw new Error('Invalid RealMedia: missing PROP chunk')
	}

	const offset = propOffset + 8 // Skip chunk header

	return {
		maxBitRate: readU32BE(data, offset),
		avgBitRate: readU32BE(data, offset + 4),
		maxPacketSize: readU32BE(data, offset + 8),
		avgPacketSize: readU32BE(data, offset + 12),
		numPackets: readU32BE(data, offset + 16),
		duration: readU32BE(data, offset + 20),
		preroll: readU32BE(data, offset + 24),
		indexOffset: readU32BE(data, offset + 28),
		dataOffset: readU32BE(data, offset + 32),
		numStreams: readU16BE(data, offset + 36),
		flags: readU16BE(data, offset + 38),
	}
}

/**
 * Parse content description (CONT)
 */
function parseContentDescription(data: Uint8Array): RmContentDescription | undefined {
	// Skip .RMF header (18 bytes)
	const contOffset = findChunk(data, 18, CONT_MAGIC)
	if (contOffset < 0) return undefined

	let offset = contOffset + 8 // Skip chunk header

	const titleLen = readU16BE(data, offset)
	offset += 2
	const title = titleLen > 0 ? readString(data, offset, titleLen) : undefined
	offset += titleLen

	const authorLen = readU16BE(data, offset)
	offset += 2
	const author = authorLen > 0 ? readString(data, offset, authorLen) : undefined
	offset += authorLen

	const copyrightLen = readU16BE(data, offset)
	offset += 2
	const copyright = copyrightLen > 0 ? readString(data, offset, copyrightLen) : undefined
	offset += copyrightLen

	const commentLen = readU16BE(data, offset)
	offset += 2
	const comment = commentLen > 0 ? readString(data, offset, commentLen) : undefined

	return { title, author, copyright, comment }
}

/**
 * Parse all stream headers (MDPR)
 */
function parseStreams(data: Uint8Array): RmStream[] {
	const streams: RmStream[] = []
	// Skip .RMF header (18 bytes)
	let searchOffset = 18

	while (true) {
		const mdprOffset = findChunk(data, searchOffset, MDPR_MAGIC)
		if (mdprOffset < 0) break

		const stream = parseMediaProperties(data, mdprOffset)
		if (stream) streams.push(stream)

		searchOffset = mdprOffset + readU32BE(data, mdprOffset + 4) + 8
		if (searchOffset >= data.length) break
	}

	return streams
}

/**
 * Parse media properties (MDPR chunk)
 */
function parseMediaProperties(data: Uint8Array, chunkOffset: number): RmStream | null {
	let offset = chunkOffset + 8 // Skip chunk header

	const streamNumber = readU16BE(data, offset)
	offset += 2

	const maxBitRate = readU32BE(data, offset)
	offset += 4
	const avgBitRate = readU32BE(data, offset)
	offset += 4
	const maxPacketSize = readU32BE(data, offset)
	offset += 4
	const avgPacketSize = readU32BE(data, offset)
	offset += 4
	const startTime = readU32BE(data, offset)
	offset += 4
	const preroll = readU32BE(data, offset)
	offset += 4
	const duration = readU32BE(data, offset)
	offset += 4

	const streamNameLen = data[offset]!
	offset += 1
	const streamName = readString(data, offset, streamNameLen)
	offset += streamNameLen

	const mimeTypeLen = data[offset]!
	offset += 1
	const mimeType = readString(data, offset, mimeTypeLen)
	offset += mimeTypeLen

	const typeSpecificLen = readU32BE(data, offset)
	offset += 4
	const typeSpecificData = data.slice(offset, offset + typeSpecificLen)

	const properties: RmMediaProperties = {
		streamNumber,
		maxBitRate,
		avgBitRate,
		maxPacketSize,
		avgPacketSize,
		startTime,
		preroll,
		duration,
		streamName,
		mimeType,
		typeSpecificData,
	}

	// Determine stream type and parse type-specific data
	const isVideo = mimeType.includes('video')
	let videoInfo: RealVideoSpecific | undefined
	let audioInfo: RealAudioSpecific | undefined

	if (isVideo && typeSpecificData.length >= 26) {
		videoInfo = parseVideoSpecific(typeSpecificData)
	} else if (!isVideo && typeSpecificData.length >= 12) {
		audioInfo = parseAudioSpecific(typeSpecificData)
	}

	return {
		properties,
		isVideo,
		videoInfo,
		audioInfo,
		packets: [],
	}
}

/**
 * Parse video-specific data
 */
function parseVideoSpecific(data: Uint8Array): RealVideoSpecific {
	// Video-specific structure varies by version
	// Common fields:
	let offset = 0

	// Skip variable header (size prefix)
	const size = readU32BE(data, offset)
	offset += 4

	if (data.length < 26) {
		throw new Error('Invalid video-specific data')
	}

	const codec = readU32BE(data, offset)
	offset += 4
	const width = readU16BE(data, offset)
	offset += 2
	const height = readU16BE(data, offset)
	offset += 2
	const bitsPerPixel = readU16BE(data, offset)
	offset += 2

	// Skip padding/reserved
	offset += 2

	const frameRate = readU32BE(data, offset)

	return {
		codec,
		width,
		height,
		frameRate,
		bitsPerPixel,
	}
}

/**
 * Parse audio-specific data
 */
function parseAudioSpecific(data: Uint8Array): RealAudioSpecific {
	let offset = 0

	const codec = readU32BE(data, offset)
	offset += 4

	// Format depends on codec, but common fields:
	const sampleRate = readU16BE(data, offset)
	offset += 2
	const sampleSize = readU16BE(data, offset)
	offset += 2
	const channels = readU16BE(data, offset)
	offset += 2

	const interleaverId = data.length > offset ? readU32BE(data, offset) : 0
	offset += 4

	const codecData = data.slice(offset)

	return {
		codec,
		sampleRate,
		sampleSize,
		channels,
		interleaverId,
		codecData,
	}
}

/**
 * Extract packets from DATA chunk
 */
function extractPackets(
	data: Uint8Array,
	info: RmInfo
): { videoPackets: Array<{ timestamp: number; data: Uint8Array }>; audioPackets?: Array<{ timestamp: number; data: Uint8Array }> } {
	const videoPackets: Array<{ timestamp: number; data: Uint8Array }> = []
	const audioPackets: Array<{ timestamp: number; data: Uint8Array }> = []

	// Skip .RMF header (18 bytes)
	const dataOffset = findChunk(data, 18, DATA_MAGIC)
	if (dataOffset < 0) {
		return { videoPackets }
	}

	const chunkSize = readU32BE(data, dataOffset + 4)
	let offset = dataOffset + 8

	// DATA header
	const numPackets = readU32BE(data, offset)
	offset += 4
	const nextDataHeader = readU32BE(data, offset)
	offset += 4

	// Read packets
	for (let i = 0; i < numPackets && offset < dataOffset + chunkSize; i++) {
		if (offset + 12 > data.length) break

		const version = readU16BE(data, offset)
		offset += 2
		const length = readU16BE(data, offset)
		offset += 2
		const streamNumber = readU16BE(data, offset)
		offset += 2
		const timestamp = readU32BE(data, offset)
		offset += 4

		// Skip reserved byte
		offset += 1

		const flags = data[offset]!
		offset += 1

		// Read packet data
		if (offset + length > data.length) break
		const packetData = data.slice(offset, offset + length)
		offset += length

		// Assign to appropriate stream
		const stream = info.streams.find((s) => s.properties.streamNumber === streamNumber)
		if (stream) {
			if (stream.isVideo) {
				videoPackets.push({ timestamp, data: packetData })
			} else {
				audioPackets.push({ timestamp, data: packetData })
			}
		}
	}

	return {
		videoPackets,
		audioPackets: audioPackets.length > 0 ? audioPackets : undefined,
	}
}

/**
 * Find a RealMedia chunk by type
 */
function findChunk(data: Uint8Array, startOffset: number, chunkType: number): number {
	let offset = startOffset

	while (offset < data.length - 8) {
		const type = readU32BE(data, offset)
		const size = readU32BE(data, offset + 4)

		if (type === chunkType) {
			return offset
		}

		offset += size + 8
		if (size === 0 || offset >= data.length) break
	}

	return -1
}

/**
 * Read string from data
 */
function readString(data: Uint8Array, offset: number, length: number): string {
	const bytes = data.slice(offset, offset + length)
	return new TextDecoder('utf-8').decode(bytes)
}

// Binary reading helpers (big-endian)
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!) >>> 0
	)
}
