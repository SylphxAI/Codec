/**
 * OGG container decoder
 * Page-based multimedia container parser
 */

import {
	OGG_MAGIC,
	OggPageFlag,
	type OggDecodeResult,
	type OggInfo,
	type OggPage,
	type OggStreamInfo,
} from './types'

/**
 * Check if data is OGG
 */
export function isOgg(data: Uint8Array): boolean {
	if (data.length < 4) return false
	// "OggS" magic
	return data[0] === 0x4f && data[1] === 0x67 && data[2] === 0x67 && data[3] === 0x53
}

/**
 * Parse OGG info without full decode
 */
export function parseOggInfo(data: Uint8Array): OggInfo {
	const result = decodeOgg(data)
	return result.info
}

/**
 * Decode OGG file
 */
export function decodeOgg(data: Uint8Array): OggDecodeResult {
	if (!isOgg(data)) {
		throw new Error('Invalid OGG: missing magic')
	}

	const pages: OggPage[] = []
	const streamPackets = new Map<number, Uint8Array[]>()
	const streamInfo = new Map<number, OggStreamInfo>()
	let offset = 0

	while (offset < data.length - 27) {
		// Check for OggS sync
		if (data[offset] !== 0x4f || data[offset + 1] !== 0x67 ||
		    data[offset + 2] !== 0x67 || data[offset + 3] !== 0x53) {
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
		if ((page.flags & OggPageFlag.CONTINUATION) && streamPkts.length > 0) {
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

	// Build stream info array
	const streams: OggStreamInfo[] = []
	for (const [serial, info] of streamInfo) {
		streams.push(info)
	}

	// Calculate duration from last granule position
	let duration = 0
	if (pages.length > 0) {
		const lastPage = pages[pages.length - 1]!
		const stream = streamInfo.get(lastPage.serialNumber)
		if (stream?.flacInfo) {
			duration = Number(lastPage.granulePosition) / stream.flacInfo.sampleRate
		}
	}

	// Convert packet map to array
	const packets: Uint8Array[][] = []
	for (const [, pkts] of streamPackets) {
		packets.push(pkts)
	}

	return {
		info: {
			streams,
			duration,
			hasAudio: streams.some(s => s.flacInfo !== undefined),
			hasVideo: false,
		},
		pages,
		packets,
	}
}

/**
 * Parse a single OGG page
 */
function parsePage(data: Uint8Array, offset: number): OggPage | null {
	if (offset + 27 > data.length) return null

	// Verify capture pattern
	if (data[offset] !== 0x4f || data[offset + 1] !== 0x67 ||
	    data[offset + 2] !== 0x67 || data[offset + 3] !== 0x53) {
		return null
	}

	const version = data[offset + 4]!
	const flags = data[offset + 5]!

	// Granule position (64-bit little-endian)
	const granuleLow = data[offset + 6]! | (data[offset + 7]! << 8) |
	                   (data[offset + 8]! << 16) | (data[offset + 9]! << 24)
	const granuleHigh = data[offset + 10]! | (data[offset + 11]! << 8) |
	                    (data[offset + 12]! << 16) | (data[offset + 13]! << 24)
	const granulePosition = BigInt(granuleLow >>> 0) | (BigInt(granuleHigh >>> 0) << 32n)

	// Serial number (32-bit little-endian)
	const serialNumber = data[offset + 14]! | (data[offset + 15]! << 8) |
	                     (data[offset + 16]! << 16) | (data[offset + 17]! << 24)

	// Page sequence number
	const pageSequence = data[offset + 18]! | (data[offset + 19]! << 8) |
	                     (data[offset + 20]! << 16) | (data[offset + 21]! << 24)

	// CRC checksum
	const checksum = data[offset + 22]! | (data[offset + 23]! << 8) |
	                 (data[offset + 24]! << 16) | (data[offset + 25]! << 24)

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
function extractPackets(page: OggPage): Uint8Array[] {
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
function parseStreamHeader(data: Uint8Array, serialNumber: number): OggStreamInfo | null {
	if (data.length < 5) return null

	// Check for FLAC: "\x7fFLAC"
	if (data[0] === 0x7f && data[1] === 0x46 && data[2] === 0x4c &&
	    data[3] === 0x41 && data[4] === 0x43) {
		return parseFlacHeader(data, serialNumber)
	}

	// Check for Vorbis: "\x01vorbis"
	if (data[0] === 0x01 && data[1] === 0x76 && data[2] === 0x6f &&
	    data[3] === 0x72 && data[4] === 0x62 && data[5] === 0x69 && data[6] === 0x73) {
		return parseVorbisHeader(data, serialNumber)
	}

	// Check for Opus: "OpusHead"
	if (data[0] === 0x4f && data[1] === 0x70 && data[2] === 0x75 && data[3] === 0x73 &&
	    data[4] === 0x48 && data[5] === 0x65 && data[6] === 0x61 && data[7] === 0x64) {
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
 * Parse FLAC header in OGG
 */
function parseFlacHeader(data: Uint8Array, serialNumber: number): OggStreamInfo {
	// OGG FLAC format:
	// 0: 0x7f
	// 1-4: "FLAC"
	// 5: major version
	// 6: minor version
	// 7-8: header packets count (big-endian)
	// 9-12: "fLaC" (native FLAC signature)
	// 13: block header (type + last flag)
	// 14-16: block length (3 bytes)
	// 17+: STREAMINFO data (34 bytes)

	const info: OggStreamInfo = {
		serialNumber,
		codecId: 'flac',
		codecName: 'FLAC',
	}

	// STREAMINFO data starts at offset 17
	if (data.length >= 17 + 34) {
		const siOffset = 17

		// STREAMINFO layout:
		// 0-1: min block size
		// 2-3: max block size
		// 4-6: min frame size
		// 7-9: max frame size
		// 10-17: sample rate (20 bits), channels-1 (3 bits), bps-1 (5 bits), total samples (36 bits)
		// 18-33: MD5

		const sr = (data[siOffset + 10]! << 12) | (data[siOffset + 11]! << 4) | (data[siOffset + 12]! >> 4)
		const ch = ((data[siOffset + 12]! >> 1) & 0x07) + 1
		const bps = (((data[siOffset + 12]! & 0x01) << 4) | (data[siOffset + 13]! >> 4)) + 1
		const samplesHigh = data[siOffset + 13]! & 0x0f
		const samplesLow = (data[siOffset + 14]! << 24) | (data[siOffset + 15]! << 16) |
		                   (data[siOffset + 16]! << 8) | data[siOffset + 17]!

		info.flacInfo = {
			sampleRate: sr,
			channels: ch,
			bitsPerSample: bps,
			totalSamples: (samplesHigh * 0x100000000 + (samplesLow >>> 0)) >>> 0,
		}
	}

	return info
}

/**
 * Parse Vorbis header
 */
function parseVorbisHeader(data: Uint8Array, serialNumber: number): OggStreamInfo {
	const info: OggStreamInfo = {
		serialNumber,
		codecId: 'vorbis',
		codecName: 'Vorbis',
	}

	// Vorbis identification header:
	// 0: packet type (0x01)
	// 1-6: "vorbis"
	// 7-10: vorbis version
	// 11: channels
	// 12-15: sample rate (little-endian)
	// 16-19: bitrate max
	// 20-23: bitrate nominal
	// 24-27: bitrate min

	if (data.length >= 28) {
		const channels = data[11]!
		const sampleRate = data[12]! | (data[13]! << 8) | (data[14]! << 16) | (data[15]! << 24)
		const bitrateMax = data[16]! | (data[17]! << 8) | (data[18]! << 16) | (data[19]! << 24)
		const bitrateNominal = data[20]! | (data[21]! << 8) | (data[22]! << 16) | (data[23]! << 24)
		const bitrateMin = data[24]! | (data[25]! << 8) | (data[26]! << 16) | (data[27]! << 24)

		info.vorbisInfo = {
			channels,
			sampleRate,
			bitrateMax,
			bitrateNominal,
			bitrateMin,
		}
	}

	return info
}

/**
 * Extract FLAC frames from OGG FLAC stream
 */
export function extractOggFlacFrames(data: Uint8Array): Uint8Array[] {
	const result = decodeOgg(data)
	const frames: Uint8Array[] = []

	// Find FLAC stream
	const flacStream = result.info.streams.find(s => s.codecId === 'flac')
	if (!flacStream) return frames

	// Get packets for FLAC stream
	const packets = result.packets[0]
	if (!packets) return frames

	// Skip header packets, extract audio frames
	// First packet is OGG FLAC header
	// Following packets are FLAC frames
	for (let i = 1; i < packets.length; i++) {
		frames.push(packets[i]!)
	}

	return frames
}
