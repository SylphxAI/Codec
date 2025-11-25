/**
 * OGV (Ogg Video) decoder
 * Ogg container with Theora video parser
 */

import type { VideoData, VideoFrame } from '@sylphx/codec-core'
import {
	OGV_MAGIC,
	OggPageFlag,
	THEORA_MAGIC,
	TheoraPacketType,
	type OgvDecodeResult,
	type OgvInfo,
	type OgvPage,
	type OgvStreamInfo,
	type TheoraInfo,
} from './types'

/**
 * Check if data is OGV
 */
export function isOgv(data: Uint8Array): boolean {
	if (data.length < 35) return false

	// Check for OggS magic
	if (data[0] !== 0x4f || data[1] !== 0x67 || data[2] !== 0x67 || data[3] !== 0x53) {
		return false
	}

	// Parse first page to check for Theora stream
	try {
		const page = parsePage(data, 0)
		if (!page || !(page.flags & OggPageFlag.BOS)) return false

		// Check for Theora identification header: "\x80theora"
		if (page.data.length < 7) return false
		return (
			page.data[0] === 0x80 &&
			page.data[1] === 0x74 && // 't'
			page.data[2] === 0x68 && // 'h'
			page.data[3] === 0x65 && // 'e'
			page.data[4] === 0x6f && // 'o'
			page.data[5] === 0x72 && // 'r'
			page.data[6] === 0x61    // 'a'
		)
	} catch {
		return false
	}
}

/**
 * Parse OGV info without full decode
 */
export function parseOgvInfo(data: Uint8Array): OgvInfo {
	const result = decodeOgv(data)
	return result.info
}

/**
 * Decode OGV file to VideoData
 */
export function decodeOgvToVideo(data: Uint8Array): VideoData {
	const result = decodeOgv(data)

	// For this pure TypeScript implementation, we can't decode Theora video frames
	// Return placeholder frames
	const frames: VideoFrame[] = []
	const { width, height, fps } = result.info
	const frameDuration = 1000 / fps

	// Create placeholder black frames based on packet count
	for (let i = 0; i < result.videoPackets.length; i++) {
		const imageData = new Uint8Array(width * height * 4)
		// All zeros = black transparent

		frames.push({
			image: {
				width,
				height,
				data: imageData,
			},
			timestamp: i * frameDuration,
			duration: frameDuration,
		})
	}

	return {
		width,
		height,
		frames,
		duration: result.info.duration,
		fps,
	}
}

/**
 * Decode OGV file structure
 */
export function decodeOgv(data: Uint8Array): OgvDecodeResult {
	if (!isOgv(data)) {
		throw new Error('Invalid OGV: missing magic or Theora stream')
	}

	const pages: OgvPage[] = []
	const streamPackets = new Map<number, Uint8Array[]>()
	const streamInfo = new Map<number, OgvStreamInfo>()
	let offset = 0

	// Parse all pages
	while (offset < data.length - 27) {
		// Check for OggS sync
		if (
			data[offset] !== 0x4f ||
			data[offset + 1] !== 0x67 ||
			data[offset + 2] !== 0x67 ||
			data[offset + 3] !== 0x53
		) {
			// Try to find next sync
			offset++
			continue
		}

		const page = parsePage(data, offset)
		if (!page) break

		pages.push(page)

		// Track packets per stream
		if (!streamPackets.has(page.serialNumber)) {
			streamPackets.set(page.serialNumber, [])
		}

		// Extract packets from page
		const packets = extractPackets(page)
		const streamPkts = streamPackets.get(page.serialNumber)!

		// Handle continuation
		if (page.flags & OggPageFlag.CONTINUATION && streamPkts.length > 0) {
			// Append to previous incomplete packet
			const lastPkt = streamPkts[streamPkts.length - 1]!
			const combined = new Uint8Array(lastPkt.length + packets[0]!.length)
			combined.set(lastPkt)
			combined.set(packets[0]!, lastPkt.length)
			streamPkts[streamPkts.length - 1] = combined
			packets.shift()
		}

		streamPkts.push(...packets)

		// Parse stream info from BOS page
		if (page.flags & OggPageFlag.BOS) {
			const info = parseStreamHeader(page.data, page.serialNumber)
			if (info) {
				streamInfo.set(page.serialNumber, info)
			}
		}

		// Calculate page size and move to next
		const pageSize = 27 + page.segmentCount + page.data.length
		offset += pageSize
	}

	// Find Theora stream
	let theoraStream: OgvStreamInfo | undefined
	let theoraSerial: number | undefined
	for (const [serial, info] of streamInfo) {
		if (info.codecId === 'theora') {
			theoraStream = info
			theoraSerial = serial
			break
		}
	}

	if (!theoraStream || !theoraStream.theoraInfo || theoraSerial === undefined) {
		throw new Error('No Theora video stream found')
	}

	// Extract video packets (skip header packets)
	const videoPackets = streamPackets.get(theoraSerial) || []
	const dataPackets: Uint8Array[] = []

	for (const packet of videoPackets) {
		// Skip header packets (0x80, 0x81, 0x82)
		if (packet.length > 0 && packet[0]! >= 0x80 && packet[0]! <= 0x82) {
			continue
		}
		dataPackets.push(packet)
	}

	// Calculate duration from last granule position and frame rate
	const lastPage = pages[pages.length - 1]
	const fps = theoraStream.theoraInfo.frameRateNumerator / theoraStream.theoraInfo.frameRateDenominator
	let duration = 0

	if (lastPage && lastPage.serialNumber === theoraSerial) {
		// Granule position for Theora is complex (keyframe + frame offset)
		// Simplified: use packet count
		duration = (dataPackets.length / fps) * 1000
	}

	const streams: OgvStreamInfo[] = []
	for (const [, info] of streamInfo) {
		streams.push(info)
	}

	return {
		info: {
			streams,
			duration,
			width: theoraStream.theoraInfo.pictureWidth,
			height: theoraStream.theoraInfo.pictureHeight,
			fps,
			hasVideo: true,
			hasAudio: streams.some((s) => s.codecId === 'vorbis' || s.codecId === 'opus'),
		},
		pages,
		videoPackets: dataPackets,
	}
}

/**
 * Parse a single OGV page
 */
function parsePage(data: Uint8Array, offset: number): OgvPage | null {
	if (offset + 27 > data.length) return null

	// Verify capture pattern
	if (
		data[offset] !== 0x4f ||
		data[offset + 1] !== 0x67 ||
		data[offset + 2] !== 0x67 ||
		data[offset + 3] !== 0x53
	) {
		return null
	}

	const version = data[offset + 4]!
	const flags = data[offset + 5]!

	// Granule position (64-bit little-endian)
	const granuleLow =
		data[offset + 6]! |
		(data[offset + 7]! << 8) |
		(data[offset + 8]! << 16) |
		(data[offset + 9]! << 24)
	const granuleHigh =
		data[offset + 10]! |
		(data[offset + 11]! << 8) |
		(data[offset + 12]! << 16) |
		(data[offset + 13]! << 24)
	const granulePosition = BigInt(granuleLow >>> 0) | (BigInt(granuleHigh >>> 0) << 32n)

	// Serial number (32-bit little-endian)
	const serialNumber =
		data[offset + 14]! |
		(data[offset + 15]! << 8) |
		(data[offset + 16]! << 16) |
		(data[offset + 17]! << 24)

	// Page sequence number
	const pageSequence =
		data[offset + 18]! |
		(data[offset + 19]! << 8) |
		(data[offset + 20]! << 16) |
		(data[offset + 21]! << 24)

	// CRC checksum
	const checksum =
		data[offset + 22]! |
		(data[offset + 23]! << 8) |
		(data[offset + 24]! << 16) |
		(data[offset + 25]! << 24)

	// Segment count
	const segmentCount = data[offset + 26]!

	if (offset + 27 + segmentCount > data.length) return null

	// Segment table
	const segmentTable: number[] = []
	let totalSize = 0
	for (let i = 0; i < segmentCount; i++) {
		const size = data[offset + 27 + i]!
		segmentTable.push(size)
		totalSize += size
	}

	// Page data
	const dataStart = offset + 27 + segmentCount
	if (dataStart + totalSize > data.length) return null

	const pageData = data.slice(dataStart, dataStart + totalSize)

	return {
		version,
		flags,
		granulePosition,
		serialNumber,
		pageSequence,
		checksum,
		segmentCount,
		segmentTable,
		data: pageData,
	}
}

/**
 * Extract packets from page data
 */
function extractPackets(page: OgvPage): Uint8Array[] {
	const packets: Uint8Array[] = []
	let offset = 0
	let currentPacket: number[] = []

	for (let i = 0; i < page.segmentTable.length; i++) {
		const segSize = page.segmentTable[i]!

		// Add segment to current packet
		for (let j = 0; j < segSize; j++) {
			currentPacket.push(page.data[offset + j]!)
		}
		offset += segSize

		// Segment size < 255 means end of packet
		if (segSize < 255) {
			if (currentPacket.length > 0) {
				packets.push(new Uint8Array(currentPacket))
				currentPacket = []
			}
		}
	}

	// Handle incomplete packet at end
	if (currentPacket.length > 0) {
		packets.push(new Uint8Array(currentPacket))
	}

	return packets
}

/**
 * Parse stream header to identify codec
 */
function parseStreamHeader(data: Uint8Array, serialNumber: number): OgvStreamInfo | null {
	if (data.length < 7) return null

	// Check for Theora: "\x80theora"
	if (
		data[0] === 0x80 &&
		data[1] === 0x74 &&
		data[2] === 0x68 &&
		data[3] === 0x65 &&
		data[4] === 0x6f &&
		data[5] === 0x72 &&
		data[6] === 0x61
	) {
		return parseTheoraHeader(data, serialNumber)
	}

	// Check for Vorbis: "\x01vorbis"
	if (
		data[0] === 0x01 &&
		data[1] === 0x76 &&
		data[2] === 0x6f &&
		data[3] === 0x72 &&
		data[4] === 0x62 &&
		data[5] === 0x69 &&
		data[6] === 0x73
	) {
		return {
			serialNumber,
			codecId: 'vorbis',
			codecName: 'Vorbis',
		}
	}

	// Check for Opus: "OpusHead"
	if (
		data[0] === 0x4f &&
		data[1] === 0x70 &&
		data[2] === 0x75 &&
		data[3] === 0x73 &&
		data[4] === 0x48 &&
		data[5] === 0x65 &&
		data[6] === 0x61 &&
		data[7] === 0x64
	) {
		return {
			serialNumber,
			codecId: 'opus',
			codecName: 'Opus',
		}
	}

	return {
		serialNumber,
		codecId: 'unknown',
		codecName: 'Unknown',
	}
}

/**
 * Parse Theora identification header
 */
function parseTheoraHeader(data: Uint8Array, serialNumber: number): OgvStreamInfo {
	// Theora identification header (42 bytes minimum):
	// 0: 0x80 (packet type)
	// 1-6: "theora"
	// 7: version major
	// 8: version minor
	// 9: version revision
	// 10-11: frame width (big-endian, multiple of 16)
	// 12-13: frame height (big-endian, multiple of 16)
	// 14-16: picture width (24-bit big-endian)
	// 17-19: picture height (24-bit big-endian)
	// 20: picture offset X
	// 21: picture offset Y
	// 22-25: frame rate numerator (32-bit big-endian)
	// 26-29: frame rate denominator (32-bit big-endian)
	// 30-32: pixel aspect numerator (24-bit big-endian)
	// 33-35: pixel aspect denominator (24-bit big-endian)
	// 36: colorspace
	// 37-39: target bitrate (24-bit big-endian)
	// 40: quality (6 bits) + keyframe granule shift (5 bits)
	// 41: pixel format (2 bits) + reserved (6 bits)

	const info: OgvStreamInfo = {
		serialNumber,
		codecId: 'theora',
		codecName: 'Theora',
	}

	if (data.length >= 42) {
		const versionMajor = data[7]!
		const versionMinor = data[8]!
		const versionRevision = data[9]!

		const frameWidth = (data[10]! << 8) | data[11]!
		const frameHeight = (data[12]! << 8) | data[13]!

		const pictureWidth = (data[14]! << 16) | (data[15]! << 8) | data[16]!
		const pictureHeight = (data[17]! << 16) | (data[18]! << 8) | data[19]!

		const pictureX = data[20]!
		const pictureY = data[21]!

		const frameRateNumerator =
			(data[22]! << 24) | (data[23]! << 16) | (data[24]! << 8) | data[25]!
		const frameRateDenominator =
			(data[26]! << 24) | (data[27]! << 16) | (data[28]! << 8) | data[29]!

		const pixelAspectNumerator = (data[30]! << 16) | (data[31]! << 8) | data[32]!
		const pixelAspectDenominator = (data[33]! << 16) | (data[34]! << 8) | data[35]!

		const colorspace = data[36]!
		const targetBitrate = (data[37]! << 16) | (data[38]! << 8) | data[39]!

		const qualityAndKfgs = data[40]!
		const quality = (qualityAndKfgs >> 2) & 0x3f
		const keyframeGranuleShift = qualityAndKfgs & 0x1f

		info.theoraInfo = {
			versionMajor,
			versionMinor,
			versionRevision,
			frameWidth,
			frameHeight,
			pictureWidth,
			pictureHeight,
			pictureX,
			pictureY,
			frameRateNumerator,
			frameRateDenominator,
			pixelAspectNumerator,
			pixelAspectDenominator,
			colorspace,
			targetBitrate,
			quality,
			keyframeGranuleShift,
		}
	}

	return info
}
