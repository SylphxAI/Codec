/**
 * OGG container encoder
 * Creates OGG files with FLAC audio
 */

import { encodeFlac } from '../flac'
import { OggPageFlag, type OggAudioData, type OggEncodeOptions } from './types'

/**
 * Encode audio to OGG container
 */
export function encodeOgg(audio: OggAudioData, options: OggEncodeOptions = {}): Uint8Array {
	const { codec = 'flac', serialNumber = Math.floor(Math.random() * 0xffffffff) } = options

	if (codec !== 'flac') {
		throw new Error(`Unsupported codec: ${codec}`)
	}

	return encodeOggFlac(audio, serialNumber)
}

/**
 * Encode audio to OGG FLAC
 */
function encodeOggFlac(audio: OggAudioData, serialNumber: number): Uint8Array {
	const { samples, sampleRate, bitsPerSample } = audio
	const channels = samples.length
	const totalSamples = samples[0]!.length

	const pages: Uint8Array[] = []
	let pageSequence = 0

	// Build FLAC STREAMINFO
	const streamInfo = buildFlacStreamInfo(sampleRate, channels, bitsPerSample, totalSamples)

	// First page: OGG FLAC header (BOS)
	const headerPacket = buildOggFlacHeader(sampleRate, channels, bitsPerSample, totalSamples)
	pages.push(buildPage(
		headerPacket,
		serialNumber,
		pageSequence++,
		OggPageFlag.BOS,
		0n
	))

	// Encode FLAC frames and wrap in OGG pages
	const flacData = encodeFlac({ samples, sampleRate, bitsPerSample })

	// Skip FLAC header (4 bytes magic + metadata blocks) to get frames
	let flacOffset = 4 // Skip "fLaC"

	// Skip metadata blocks
	while (flacOffset < flacData.length) {
		const blockHeader = flacData[flacOffset]!
		const isLast = (blockHeader & 0x80) !== 0
		const blockLength = (flacData[flacOffset + 1]! << 16) |
		                    (flacData[flacOffset + 2]! << 8) |
		                    flacData[flacOffset + 3]!
		flacOffset += 4 + blockLength
		if (isLast) break
	}

	// Extract FLAC frames and build OGG pages
	let granulePosition = 0n
	const maxPageSize = 65025 // Max OGG page size (255 segments * 255 bytes)

	while (flacOffset < flacData.length) {
		// Find FLAC frame sync (0xFFF8 or 0xFFF9)
		if (flacData[flacOffset] !== 0xff ||
		    (flacData[flacOffset + 1]! & 0xfc) !== 0xf8) {
			flacOffset++
			continue
		}

		// Find end of frame (next sync or EOF)
		let frameEnd = flacOffset + 1
		while (frameEnd < flacData.length - 1) {
			if (flacData[frameEnd] === 0xff &&
			    (flacData[frameEnd + 1]! & 0xfc) === 0xf8) {
				break
			}
			frameEnd++
		}

		const frameData = flacData.slice(flacOffset, frameEnd)

		// Parse frame header to get block size
		const blockSize = parseFlacFrameBlockSize(frameData, sampleRate)
		granulePosition += BigInt(blockSize)

		// Check if this is the last frame
		const isLastFrame = frameEnd >= flacData.length - 1
		const flags = isLastFrame ? OggPageFlag.EOS : 0

		pages.push(buildPage(
			frameData,
			serialNumber,
			pageSequence++,
			flags,
			granulePosition
		))

		flacOffset = frameEnd
	}

	// If no frames were added, ensure we have at least an EOS page
	if (pages.length === 1) {
		pages.push(buildPage(
			new Uint8Array(0),
			serialNumber,
			pageSequence++,
			OggPageFlag.EOS,
			BigInt(totalSamples)
		))
	}

	// Concatenate all pages
	return concatArrays(pages)
}

/**
 * Build OGG FLAC header packet
 */
function buildOggFlacHeader(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	totalSamples: number
): Uint8Array {
	// OGG FLAC mapping header:
	// 0: 0x7f (packet type)
	// 1-4: "FLAC"
	// 5: major version (1)
	// 6: minor version (0)
	// 7-8: number of header packets (big-endian, 0 for streaming)
	// 9-12: "fLaC" (native FLAC signature)
	// 13+: STREAMINFO block

	const streamInfo = buildFlacStreamInfo(sampleRate, channels, bitsPerSample, totalSamples)
	const header = new Uint8Array(13 + streamInfo.length)

	header[0] = 0x7f
	header[1] = 0x46 // 'F'
	header[2] = 0x4c // 'L'
	header[3] = 0x41 // 'A'
	header[4] = 0x43 // 'C'
	header[5] = 1    // Major version
	header[6] = 0    // Minor version
	header[7] = 0    // Header packets (high byte)
	header[8] = 0    // Header packets (low byte)
	header[9] = 0x66  // 'f'
	header[10] = 0x4c // 'L'
	header[11] = 0x61 // 'a'
	header[12] = 0x43 // 'C'

	header.set(streamInfo, 13)

	return header
}

/**
 * Build FLAC STREAMINFO metadata block
 */
function buildFlacStreamInfo(
	sampleRate: number,
	channels: number,
	bitsPerSample: number,
	totalSamples: number
): Uint8Array {
	// STREAMINFO block: type (1) + length (3) + data (34) = 38 bytes
	const block = new Uint8Array(38)

	// Block header
	block[0] = 0x80 | 0 // Last block flag + STREAMINFO type
	block[1] = 0
	block[2] = 0
	block[3] = 34 // STREAMINFO length

	// Min/max block size (using 4096)
	block[4] = 0x10
	block[5] = 0x00
	block[6] = 0x10
	block[7] = 0x00

	// Min/max frame size (0 = unknown)
	block[8] = 0
	block[9] = 0
	block[10] = 0
	block[11] = 0
	block[12] = 0
	block[13] = 0

	// Sample rate (20 bits), channels-1 (3 bits), bps-1 (5 bits), total samples (36 bits)
	block[14] = (sampleRate >> 12) & 0xff
	block[15] = (sampleRate >> 4) & 0xff
	block[16] = ((sampleRate & 0x0f) << 4) | (((channels - 1) & 0x07) << 1) | (((bitsPerSample - 1) >> 4) & 0x01)
	block[17] = (((bitsPerSample - 1) & 0x0f) << 4) | ((totalSamples / 0x100000000) & 0x0f)
	block[18] = (totalSamples >> 24) & 0xff
	block[19] = (totalSamples >> 16) & 0xff
	block[20] = (totalSamples >> 8) & 0xff
	block[21] = totalSamples & 0xff

	// MD5 signature (16 bytes of zeros)

	return block
}

/**
 * Build an OGG page
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

	// Capture pattern
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
 * Parse FLAC frame block size from header
 */
function parseFlacFrameBlockSize(frame: Uint8Array, sampleRate: number): number {
	if (frame.length < 4) return 4096

	// Block size is in bits 12-15 of frame header
	const blockSizeCode = (frame[2]! >> 4) & 0x0f

	switch (blockSizeCode) {
		case 0: return 0 // Reserved
		case 1: return 192
		case 2: return 576
		case 3: return 1152
		case 4: return 2304
		case 5: return 4608
		case 6: return (frame[4]! || 0) + 1 // 8-bit at end of header
		case 7: return ((frame[4]! || 0) << 8 | (frame[5]! || 0)) + 1 // 16-bit at end of header
		case 8: return 256
		case 9: return 512
		case 10: return 1024
		case 11: return 2048
		case 12: return 4096
		case 13: return 8192
		case 14: return 16384
		case 15: return 32768
		default: return 4096
	}
}

/**
 * Calculate OGG CRC-32 (polynomial 0x04c11db7)
 */
function calculateCrc32(data: Uint8Array): number {
	let crc = 0

	for (let i = 0; i < data.length; i++) {
		// Skip CRC bytes in calculation
		const byte = (i >= 22 && i <= 25) ? 0 : data[i]!

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
