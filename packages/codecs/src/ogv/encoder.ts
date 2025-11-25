/**
 * OGV (Ogg Video) encoder
 * Creates OGV files with Theora video
 */

import type { VideoData } from '@sylphx/codec-core'
import { OggPageFlag, type OgvEncodeOptions } from './types'

/**
 * Encode video to OGV format
 */
export function encodeOgv(video: VideoData, options: OgvEncodeOptions = {}): Uint8Array {
	const {
		frameRate = video.fps,
		quality = 48,
		keyframeInterval = 64,
		serialNumber = Math.floor(Math.random() * 0xffffffff),
	} = options

	// For this pure TypeScript implementation, we can't encode actual Theora video
	// Create a minimal valid OGV structure with header packets only

	const pages: Uint8Array[] = []
	let pageSequence = 0

	// Build Theora identification header
	const identHeader = buildTheoraIdentHeader(video.width, video.height, frameRate, quality, keyframeInterval)

	// First page: Theora identification header (BOS)
	pages.push(
		buildPage(identHeader, serialNumber, pageSequence++, OggPageFlag.BOS, 0n)
	)

	// Second page: Theora comment header
	const commentHeader = buildTheoraCommentHeader()
	pages.push(buildPage(commentHeader, serialNumber, pageSequence++, 0, 0n))

	// Third page: Theora setup header
	const setupHeader = buildTheoraSetupHeader()
	pages.push(buildPage(setupHeader, serialNumber, pageSequence++, 0, 0n))

	// Create placeholder frame packets
	// In a real implementation, frames would be Theora-encoded here
	let granulePosition = 0n
	const frameDuration = BigInt(Math.round(1000 / frameRate))

	for (let i = 0; i < video.frames.length; i++) {
		const isKeyframe = i % keyframeInterval === 0
		const framePacket = createPlaceholderFrame(isKeyframe)

		granulePosition += frameDuration
		const isLast = i === video.frames.length - 1
		const flags = isLast ? OggPageFlag.EOS : 0

		pages.push(buildPage(framePacket, serialNumber, pageSequence++, flags, granulePosition))
	}

	// If no frames, add empty EOS page
	if (video.frames.length === 0) {
		pages.push(buildPage(new Uint8Array(0), serialNumber, pageSequence++, OggPageFlag.EOS, 0n))
	}

	return concatArrays(pages)
}

/**
 * Build Theora identification header
 */
function buildTheoraIdentHeader(
	width: number,
	height: number,
	frameRate: number,
	quality: number,
	keyframeInterval: number
): Uint8Array {
	// Round dimensions to multiple of 16 for frame size
	const frameWidth = Math.ceil(width / 16) * 16
	const frameHeight = Math.ceil(height / 16) * 16

	// Frame rate as numerator/denominator
	const frameRateNum = Math.round(frameRate * 1000)
	const frameRateDen = 1000

	// Keyframe granule shift (log2 of keyframe interval)
	const kfgs = Math.min(31, Math.floor(Math.log2(keyframeInterval)))

	const header = new Uint8Array(42)

	// Packet type and signature
	header[0] = 0x80 // Identification header
	header[1] = 0x74 // 't'
	header[2] = 0x68 // 'h'
	header[3] = 0x65 // 'e'
	header[4] = 0x6f // 'o'
	header[5] = 0x72 // 'r'
	header[6] = 0x61 // 'a'

	// Version (3.2.1)
	header[7] = 3
	header[8] = 2
	header[9] = 1

	// Frame width and height (16-bit big-endian)
	header[10] = (frameWidth >> 8) & 0xff
	header[11] = frameWidth & 0xff
	header[12] = (frameHeight >> 8) & 0xff
	header[13] = frameHeight & 0xff

	// Picture width and height (24-bit big-endian)
	header[14] = (width >> 16) & 0xff
	header[15] = (width >> 8) & 0xff
	header[16] = width & 0xff
	header[17] = (height >> 16) & 0xff
	header[18] = (height >> 8) & 0xff
	header[19] = height & 0xff

	// Picture offset (0, 0)
	header[20] = 0
	header[21] = 0

	// Frame rate numerator (32-bit big-endian)
	header[22] = (frameRateNum >> 24) & 0xff
	header[23] = (frameRateNum >> 16) & 0xff
	header[24] = (frameRateNum >> 8) & 0xff
	header[25] = frameRateNum & 0xff

	// Frame rate denominator (32-bit big-endian)
	header[26] = (frameRateDen >> 24) & 0xff
	header[27] = (frameRateDen >> 16) & 0xff
	header[28] = (frameRateDen >> 8) & 0xff
	header[29] = frameRateDen & 0xff

	// Pixel aspect ratio (1:1) - 24-bit big-endian
	header[30] = 0
	header[31] = 0
	header[32] = 1
	header[33] = 0
	header[34] = 0
	header[35] = 1

	// Colorspace (0 = undefined)
	header[36] = 0

	// Target bitrate (0 = VBR) - 24-bit big-endian
	header[37] = 0
	header[38] = 0
	header[39] = 0

	// Quality (6 bits) + keyframe granule shift (5 bits)
	const qualityBits = Math.min(63, Math.max(0, quality)) & 0x3f
	header[40] = (qualityBits << 2) | (kfgs & 0x1f)

	// Pixel format (0 = 4:2:0) + reserved
	header[41] = 0

	return header
}

/**
 * Build Theora comment header
 */
function buildTheoraCommentHeader(): Uint8Array {
	const vendor = 'mconv'
	const vendorBytes = new TextEncoder().encode(vendor)

	const header = new Uint8Array(7 + 4 + vendorBytes.length + 4)
	let offset = 0

	// Packet type and signature
	header[offset++] = 0x81 // Comment header
	header[offset++] = 0x74 // 't'
	header[offset++] = 0x68 // 'h'
	header[offset++] = 0x65 // 'e'
	header[offset++] = 0x6f // 'o'
	header[offset++] = 0x72 // 'r'
	header[offset++] = 0x61 // 'a'

	// Vendor string length (32-bit little-endian)
	header[offset++] = vendorBytes.length & 0xff
	header[offset++] = (vendorBytes.length >> 8) & 0xff
	header[offset++] = (vendorBytes.length >> 16) & 0xff
	header[offset++] = (vendorBytes.length >> 24) & 0xff

	// Vendor string
	header.set(vendorBytes, offset)
	offset += vendorBytes.length

	// User comment list length (0 comments) - 32-bit little-endian
	header[offset++] = 0
	header[offset++] = 0
	header[offset++] = 0
	header[offset++] = 0

	return header
}

/**
 * Build Theora setup header (minimal)
 */
function buildTheoraSetupHeader(): Uint8Array {
	// Minimal setup header: packet type + signature only
	// Real implementation would include codebook and quantization tables
	const header = new Uint8Array(7)

	header[0] = 0x82 // Setup header
	header[1] = 0x74 // 't'
	header[2] = 0x68 // 'h'
	header[3] = 0x65 // 'e'
	header[4] = 0x6f // 'o'
	header[5] = 0x72 // 'r'
	header[6] = 0x61 // 'a'

	return header
}

/**
 * Create placeholder frame packet
 */
function createPlaceholderFrame(isKeyframe: boolean): Uint8Array {
	// Real Theora frame would be encoded video data
	// For placeholder, use minimal data
	const frame = new Uint8Array(8)

	// First byte indicates frame type (bit 6: 0=keyframe, 1=interframe)
	frame[0] = isKeyframe ? 0x00 : 0x40

	return frame
}

/**
 * Build an Ogg page
 */
function buildPage(
	data: Uint8Array,
	serialNumber: number,
	pageSequence: number,
	flags: number,
	granulePosition: bigint
): Uint8Array {
	// Calculate segment table
	const segmentTable: number[] = []
	let remaining = data.length

	while (remaining > 0) {
		const segSize = Math.min(remaining, 255)
		segmentTable.push(segSize)
		remaining -= segSize

		// If segment is 255, we need another segment (possibly 0)
		if (segSize === 255 && remaining === 0) {
			segmentTable.push(0)
		}
	}

	// Handle empty data
	if (segmentTable.length === 0) {
		segmentTable.push(0)
	}

	const pageSize = 27 + segmentTable.length + data.length
	const page = new Uint8Array(pageSize)

	// Capture pattern "OggS"
	page[0] = 0x4f // 'O'
	page[1] = 0x67 // 'g'
	page[2] = 0x67 // 'g'
	page[3] = 0x53 // 'S'

	// Version
	page[4] = 0

	// Flags
	page[5] = flags

	// Granule position (64-bit little-endian)
	const granuleLow = Number(granulePosition & 0xffffffffn)
	const granuleHigh = Number((granulePosition >> 32n) & 0xffffffffn)
	page[6] = granuleLow & 0xff
	page[7] = (granuleLow >> 8) & 0xff
	page[8] = (granuleLow >> 16) & 0xff
	page[9] = (granuleLow >> 24) & 0xff
	page[10] = granuleHigh & 0xff
	page[11] = (granuleHigh >> 8) & 0xff
	page[12] = (granuleHigh >> 16) & 0xff
	page[13] = (granuleHigh >> 24) & 0xff

	// Serial number (32-bit little-endian)
	page[14] = serialNumber & 0xff
	page[15] = (serialNumber >> 8) & 0xff
	page[16] = (serialNumber >> 16) & 0xff
	page[17] = (serialNumber >> 24) & 0xff

	// Page sequence number
	page[18] = pageSequence & 0xff
	page[19] = (pageSequence >> 8) & 0xff
	page[20] = (pageSequence >> 16) & 0xff
	page[21] = (pageSequence >> 24) & 0xff

	// CRC placeholder (will be filled in)
	page[22] = 0
	page[23] = 0
	page[24] = 0
	page[25] = 0

	// Segment count
	page[26] = segmentTable.length

	// Segment table
	for (let i = 0; i < segmentTable.length; i++) {
		page[27 + i] = segmentTable[i]!
	}

	// Page data
	page.set(data, 27 + segmentTable.length)

	// Calculate and set CRC
	const crc = calculateCrc32(page)
	page[22] = crc & 0xff
	page[23] = (crc >> 8) & 0xff
	page[24] = (crc >> 16) & 0xff
	page[25] = (crc >> 24) & 0xff

	return page
}

/**
 * Calculate OGG CRC-32 (polynomial 0x04c11db7)
 */
function calculateCrc32(data: Uint8Array): number {
	let crc = 0

	for (let i = 0; i < data.length; i++) {
		// Skip CRC bytes in calculation
		const byte = i >= 22 && i <= 25 ? 0 : data[i]!

		crc ^= byte << 24
		for (let j = 0; j < 8; j++) {
			if (crc & 0x80000000) {
				crc = ((crc << 1) ^ 0x04c11db7) >>> 0
			} else {
				crc = (crc << 1) >>> 0
			}
		}
	}

	return crc >>> 0
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
