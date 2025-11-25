/**
 * WMV (Windows Media Video) decoder
 * Parses ASF container and extracts video/audio streams
 */

import type { VideoData, VideoFrame, ImageData } from '@sylphx/codec-core'
import {
	ASF_GUID,
	ASF_STREAM_TYPE,
	type AsfFileProperties,
	type AsfHeader,
	type AsfStreamProperties,
	type WmvBitmapInfo,
	type WmvInfo,
	type WmvVideo,
	type WmvWaveFormat,
} from './types'

/**
 * Check if data is a WMV file
 */
export function isWmv(data: Uint8Array): boolean {
	if (data.length < 16) return false
	return guidsEqual(data.slice(0, 16), ASF_GUID.HEADER)
}

/**
 * Parse WMV header info
 */
export function parseWmvInfo(data: Uint8Array): WmvInfo {
	if (!isWmv(data)) {
		throw new Error('Invalid WMV: bad magic number')
	}

	const header = parseAsfHeader(data)

	// Find video stream
	const videoStream = header.streams.find((s) => s.isVideo)
	const audioStream = header.streams.find((s) => !s.isVideo)

	if (!videoStream || !videoStream.videoFormat) {
		throw new Error('Invalid WMV: no video stream found')
	}

	const width = videoStream.videoFormat.width
	const height = Math.abs(videoStream.videoFormat.height)
	const fileProps = header.fileProperties!

	// Calculate frame rate from duration and packet count
	const durationSec = Number(fileProps.playDuration) / 10000000 // 100-nanosecond units to seconds
	const totalPackets = Number(fileProps.dataPacketsCount)
	const frameRate = totalPackets > 0 && durationSec > 0 ? totalPackets / durationSec : 30

	return {
		header,
		width,
		height,
		frameRate,
		duration: durationSec,
		totalPackets,
		hasAudio: audioStream !== undefined,
		audioSampleRate: audioStream?.audioFormat?.samplesPerSec,
		audioChannels: audioStream?.audioFormat?.channels,
		videoCodec: videoStream.videoFormat.compression,
	}
}

/**
 * Decode WMV file
 */
export function decodeWmv(data: Uint8Array): WmvVideo {
	const info = parseWmvInfo(data)
	const { videoPackets, audioPackets } = extractPackets(data, info)

	return { info, videoPackets, audioPackets }
}

/**
 * Decode WMV to VideoData (placeholder - actual video decoding requires codec support)
 */
export function decodeWmvVideo(data: Uint8Array): VideoData {
	const video = decodeWmv(data)

	// Note: Actual WMV video decoding requires WMV codec implementation
	// This is a placeholder that returns empty frames
	const frames: VideoFrame[] = []
	const frameDuration = 1000 / video.info.frameRate

	for (let i = 0; i < video.videoPackets.length; i++) {
		const frame: VideoFrame = {
			image: createPlaceholderFrame(video.info.width, video.info.height),
			timestamp: i * frameDuration,
			duration: frameDuration,
		}
		frames.push(frame)
	}

	return {
		width: video.info.width,
		height: video.info.height,
		frames,
		duration: video.info.duration * 1000,
		fps: video.info.frameRate,
	}
}

/**
 * Parse ASF header
 */
function parseAsfHeader(data: Uint8Array): AsfHeader {
	let offset = 0

	// Read Header Object
	const headerGuid = data.slice(offset, offset + 16)
	if (!guidsEqual(headerGuid, ASF_GUID.HEADER)) {
		throw new Error('Invalid ASF: missing header object')
	}
	offset += 16

	const headerSize = readU64LE(data, offset)
	offset += 8

	const numberOfHeaderObjects = readU32LE(data, offset)
	offset += 4

	const reserved1 = data[offset]!
	offset += 1

	const reserved2 = data[offset]!
	offset += 1

	const headerEnd = Number(headerSize) + 0 // Header starts at 0

	const header: AsfHeader = {
		numberOfHeaderObjects,
		reserved1,
		reserved2,
		streams: [],
		headerSize,
	}

	// Parse header objects
	while (offset < headerEnd && offset < data.length - 24) {
		const objectGuid = data.slice(offset, offset + 16)
		const objectSize = readU64LE(data, offset + 16)
		const objectEnd = offset + Number(objectSize)

		if (guidsEqual(objectGuid, ASF_GUID.FILE_PROPERTIES)) {
			header.fileProperties = parseFileProperties(data, offset + 24)
		} else if (guidsEqual(objectGuid, ASF_GUID.STREAM_PROPERTIES)) {
			const stream = parseStreamProperties(data, offset + 24, objectEnd)
			if (stream) header.streams.push(stream)
		}

		offset = objectEnd
	}

	return header
}

/**
 * Parse File Properties Object
 */
function parseFileProperties(data: Uint8Array, offset: number): AsfFileProperties {
	return {
		fileId: data.slice(offset, offset + 16),
		fileSize: readU64LE(data, offset + 16),
		creationDate: readU64LE(data, offset + 24),
		dataPacketsCount: readU64LE(data, offset + 32),
		playDuration: readU64LE(data, offset + 40),
		sendDuration: readU64LE(data, offset + 48),
		preroll: readU64LE(data, offset + 56),
		flags: readU32LE(data, offset + 64),
		minDataPacketSize: readU32LE(data, offset + 68),
		maxDataPacketSize: readU32LE(data, offset + 72),
		maxBitrate: readU32LE(data, offset + 76),
	}
}

/**
 * Parse Stream Properties Object
 */
function parseStreamProperties(
	data: Uint8Array,
	offset: number,
	objectEnd: number
): AsfStreamProperties | null {
	const streamType = data.slice(offset, offset + 16)
	const errorCorrectionType = data.slice(offset + 16, offset + 32)
	const timeOffset = readU64LE(data, offset + 32)
	const typeSpecificDataLength = readU32LE(data, offset + 40)
	const errorCorrectionDataLength = readU32LE(data, offset + 44)
	const flags = readU16LE(data, offset + 48)
	const streamNumber = flags & 0x7f
	const reserved = readU32LE(data, offset + 50)

	offset += 54

	const typeSpecificData = data.slice(offset, offset + typeSpecificDataLength)
	offset += typeSpecificDataLength

	const errorCorrectionData = data.slice(offset, offset + errorCorrectionDataLength)

	const isVideo = guidsEqual(streamType, ASF_STREAM_TYPE.VIDEO)

	const stream: AsfStreamProperties = {
		streamType,
		errorCorrectionType,
		timeOffset,
		typeSpecificDataLength,
		errorCorrectionDataLength,
		flags,
		streamNumber,
		typeSpecificData,
		errorCorrectionData,
		isVideo,
	}

	// Parse type-specific data
	if (isVideo && typeSpecificDataLength >= 40) {
		stream.videoFormat = parseBitmapInfo(typeSpecificData, 0)
	} else if (!isVideo && typeSpecificDataLength >= 16) {
		stream.audioFormat = parseWaveFormat(typeSpecificData, 0)
	}

	return stream
}

/**
 * Parse BITMAPINFOHEADER
 */
function parseBitmapInfo(data: Uint8Array, offset: number): WmvBitmapInfo {
	return {
		size: readU32LE(data, offset),
		width: readI32LE(data, offset + 4),
		height: readI32LE(data, offset + 8),
		planes: readU16LE(data, offset + 12),
		bitCount: readU16LE(data, offset + 14),
		compression: readU32LE(data, offset + 16),
		sizeImage: readU32LE(data, offset + 20),
		xPelsPerMeter: readI32LE(data, offset + 24),
		yPelsPerMeter: readI32LE(data, offset + 28),
		clrUsed: readU32LE(data, offset + 32),
		clrImportant: readU32LE(data, offset + 36),
	}
}

/**
 * Parse WAVEFORMATEX
 */
function parseWaveFormat(data: Uint8Array, offset: number): WmvWaveFormat {
	const cbSize = data.length >= offset + 18 ? readU16LE(data, offset + 16) : 0
	const extraData = cbSize > 0 ? data.slice(offset + 18, offset + 18 + cbSize) : undefined

	return {
		formatTag: readU16LE(data, offset),
		channels: readU16LE(data, offset + 2),
		samplesPerSec: readU32LE(data, offset + 4),
		avgBytesPerSec: readU32LE(data, offset + 8),
		blockAlign: readU16LE(data, offset + 12),
		bitsPerSample: readU16LE(data, offset + 14),
		cbSize,
		extraData,
	}
}

/**
 * Extract video and audio packets from ASF Data Object
 */
function extractPackets(
	data: Uint8Array,
	info: WmvInfo
): { videoPackets: Uint8Array[]; audioPackets?: Uint8Array[] } {
	const videoPackets: Uint8Array[] = []
	const audioPackets: Uint8Array[] = []

	// Find Data Object
	let offset = Number(info.header.headerSize)
	if (offset >= data.length - 50) {
		return { videoPackets }
	}

	const dataGuid = data.slice(offset, offset + 16)
	if (!guidsEqual(dataGuid, ASF_GUID.DATA)) {
		return { videoPackets }
	}

	const dataSize = readU64LE(data, offset + 16)
	const fileId = data.slice(offset + 24, offset + 40)
	const totalDataPackets = readU64LE(data, offset + 40)

	offset += 50 // Skip Data Object header

	// Parse data packets - simplified format
	// Our encoder creates packets with: error correction (1 byte) + payload flags (1 byte) + frame data
	const maxPackets = Number(totalDataPackets)
	const dataEnd = data.length

	for (let packetCount = 0; packetCount < maxPackets && offset < dataEnd - 2; packetCount++) {
		// Read error correction flags
		const errorCorrectionFlags = data[offset]!
		offset += 1

		// Read payload parsing flags
		const payloadParsingFlags = data[offset]!
		offset += 1

		// Find the next packet or end of data
		let packetEnd = offset

		// Look for the next packet start (error correction byte = 0x00, payload flags = 0x00)
		// or use the remaining data for the last packet
		if (packetCount < maxPackets - 1) {
			// Search for next packet marker
			let found = false
			for (let i = offset + 1; i < dataEnd - 1; i++) {
				// Look for JPEG marker (0xFF, 0xD8) to find frame boundaries
				if (data[i] === 0xff && data[i + 1] === 0xd8 && i > offset + 100) {
					packetEnd = i
					found = true
					break
				}
			}
			if (!found) {
				packetEnd = dataEnd
			}
		} else {
			packetEnd = dataEnd
		}

		const packetData = data.slice(offset, packetEnd)
		if (packetData.length > 0) {
			videoPackets.push(packetData)
		}

		offset = packetEnd
	}

	return { videoPackets, audioPackets: audioPackets.length > 0 ? audioPackets : undefined }
}

/**
 * Create placeholder frame (used when codec is not available)
 */
function createPlaceholderFrame(width: number, height: number): ImageData {
	const data = new Uint8Array(width * height * 4)

	// Create gray frame with message
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = 128 // R
		data[i * 4 + 1] = 128 // G
		data[i * 4 + 2] = 128 // B
		data[i * 4 + 3] = 255 // A
	}

	return { width, height, data }
}

/**
 * Compare two GUIDs for equality
 */
function guidsEqual(guid1: Uint8Array, guid2: Uint8Array): boolean {
	if (guid1.length !== 16 || guid2.length !== 16) return false
	for (let i = 0; i < 16; i++) {
		if (guid1[i] !== guid2[i]) return false
	}
	return true
}

// Binary reading helpers (little-endian)
function readU16LE(data: Uint8Array, offset: number): number {
	return data[offset]! | (data[offset + 1]! << 8)
}

function readU32LE(data: Uint8Array, offset: number): number {
	return (
		data[offset]! | (data[offset + 1]! << 8) | (data[offset + 2]! << 16) | (data[offset + 3]! << 24)
	) >>> 0
}

function readI32LE(data: Uint8Array, offset: number): number {
	const u = readU32LE(data, offset)
	return u > 0x7fffffff ? u - 0x100000000 : u
}

function readU64LE(data: Uint8Array, offset: number): bigint {
	const low = BigInt(readU32LE(data, offset))
	const high = BigInt(readU32LE(data, offset + 4))
	return (high << 32n) | low
}
