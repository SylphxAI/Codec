/**
 * VOB (DVD Video) encoder
 * Creates VOB files from VideoData with DVD navigation
 */

import type { VideoData } from '@sylphx/codec-core'
import {
	VobStartCode,
	VobVersion,
	PictureCodingType,
	type VobEncodeOptions,
	type VobNavigationPack,
} from './types'

/**
 * Encode VideoData to VOB (MPEG-2 PS)
 */
export function encodeVob(video: VideoData, options: VobEncodeOptions = {}): Uint8Array {
	if (video.frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const {
		frameRate = video.fps || 29.97, // NTSC DVD default
		bitRate = 6000000, // 6 Mbps (DVD video max is ~9.8 Mbps)
		gop = 15, // GOP size (keyframe every 15 frames)
		includeNavigation = true,
		aspectRatio = 1.33, // 4:3 default (16:9 = 1.77)
	} = options

	const packets: Uint8Array[] = []

	// Build MPEG-2 Program Stream structure with DVD extensions
	const scr90kHz = 0 // System Clock Reference base
	const programMuxRate = Math.ceil(bitRate / 400) // In units of 50 bytes/second

	// Add initial pack header
	packets.push(buildPackHeader(scr90kHz, programMuxRate, 0))

	// Add system header
	packets.push(buildSystemHeader(bitRate, 1, 1)) // 1 audio, 1 video stream

	// Encode video sequence
	const sequenceHeader = buildSequenceHeader(video.width, video.height, frameRate, bitRate, aspectRatio)
	packets.push(buildPesPacket(0xe0, sequenceHeader, 0, 0)) // Video stream 0

	// Add frames with optional DVD navigation packs
	let vobuStartFrame = 0

	for (let i = 0; i < video.frames.length; i++) {
		const frame = video.frames[i]!
		const isKeyframe = i % gop === 0
		const pts = Math.floor(frame.timestamp * 90) // Convert ms to 90kHz units
		const temporalReference = i % gop

		// Add pack header periodically
		if (i % 10 === 0) {
			const currentScr = scr90kHz + pts
			packets.push(buildPackHeader(currentScr, programMuxRate, 0))
		}

		// Add navigation pack at VOBU boundaries (every ~0.4-1.0 seconds)
		if (includeNavigation && (i % 15 === 0 || isKeyframe)) {
			const navPack = buildNavigationPack(i, pts, vobuStartFrame)
			packets.push(buildNavigationPesPacket(navPack))
			vobuStartFrame = i
		}

		// Add GOP header for keyframes
		if (isKeyframe) {
			const gopHeader = buildGopHeader(Math.floor(frame.timestamp / 1000), i % gop)
			packets.push(buildPesPacket(0xe0, gopHeader, pts, undefined))
		}

		// Add picture header
		const pictureType = isKeyframe ? PictureCodingType.I_FRAME : PictureCodingType.P_FRAME
		const pictureHeader = buildPictureHeader(temporalReference, pictureType)

		// Create stub encoded frame
		const encodedFrame = buildStubEncodedFrame(frame.image.data, video.width, video.height)

		// Combine picture header and encoded data
		const frameData = concatArrays([pictureHeader, encodedFrame])

		// Add as PES packet
		packets.push(buildPesPacket(0xe0, frameData, pts, undefined))
	}

	// Add program end code
	packets.push(buildProgramEndCode())

	return concatArrays(packets)
}

/**
 * Build MPEG-2 pack header
 */
function buildPackHeader(scr: number, programMuxRate: number, stuffingLength: number): Uint8Array {
	const header = new Uint8Array(14 + stuffingLength)

	// Pack start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0xba

	// SCR (System Clock Reference) - 33 bits base + 9 bits extension
	const scrBase = Math.floor(scr / 300)
	const scrExt = scr % 300

	header[4] = 0x44 | ((scrBase >> 27) & 0x38) | ((scrBase >> 28) & 0x03)
	header[5] = (scrBase >> 20) & 0xff
	header[6] = 0x04 | ((scrBase >> 12) & 0xf8) | ((scrBase >> 13) & 0x03)
	header[7] = (scrBase >> 5) & 0xff
	header[8] = 0x04 | ((scrBase << 3) & 0xf8) | ((scrExt >> 7) & 0x03)
	header[9] = 0x01 | ((scrExt << 1) & 0xfe)

	// Program mux rate (22 bits)
	header[10] = (programMuxRate >> 14) & 0xff
	header[11] = (programMuxRate >> 6) & 0xff
	header[12] = 0x03 | ((programMuxRate << 2) & 0xfc)

	// Pack stuffing length (5 bits) + reserved (3 bits)
	header[13] = 0xf8 | (stuffingLength & 0x07)

	// Stuffing bytes (0xff)
	for (let i = 0; i < stuffingLength; i++) {
		header[14 + i] = 0xff
	}

	return header
}

/**
 * Build system header
 */
function buildSystemHeader(bitRate: number, audioBound: number, videoBound: number): Uint8Array {
	const header = new Uint8Array(18) // Minimum size

	// System header start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0xbb

	// Header length (12 bytes after this field)
	header[4] = 0x00
	header[5] = 0x0c

	// Rate bound (22 bits)
	const rateBound = Math.ceil(bitRate / 400)
	header[6] = 0x80 | ((rateBound >> 15) & 0x7f)
	header[7] = (rateBound >> 7) & 0xff
	header[8] = 0x01 | ((rateBound << 1) & 0xfe)

	// Audio bound (6 bits) + fixed flag (1 bit) + CSPS flag (1 bit)
	header[9] = ((audioBound & 0x1f) << 2) | 0x03

	// System audio lock (1 bit) + system video lock (1 bit) + marker (1 bit) + video bound (5 bits)
	header[10] = 0x20 | (videoBound & 0x1f)

	// Packet rate restriction flag (1 bit) + reserved (7 bits)
	header[11] = 0x7f

	// Stream info for video stream (3 bytes)
	header[12] = 0xe0 // Video stream 0
	header[13] = 0xc0 | 0x20 // STD buffer bound scale (1) + STD buffer size bound (high 5 bits)
	header[14] = 0x00 // STD buffer size bound (low 8 bits)

	// Stream info for audio stream (3 bytes)
	header[15] = 0xc0 // Audio stream 0
	header[16] = 0xc0 | 0x10 // STD buffer bound scale (1) + STD buffer size bound (high 5 bits)
	header[17] = 0x00 // STD buffer size bound (low 8 bits)

	return header
}

/**
 * Build sequence header
 */
function buildSequenceHeader(
	width: number,
	height: number,
	frameRate: number,
	bitRate: number,
	aspectRatio: number
): Uint8Array {
	const header = new Uint8Array(12)

	// Sequence header start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0xb3

	// Width (12 bits)
	header[4] = (width >> 4) & 0xff
	header[5] = ((width & 0x0f) << 4) | ((height >> 8) & 0x0f)

	// Height (12 bits, lower 8 bits)
	header[6] = height & 0xff

	// Aspect ratio (4 bits) + frame rate code (4 bits)
	const aspectRatioCode = getAspectRatioCode(aspectRatio)
	const frameRateCode = getFrameRateCode(frameRate)
	header[7] = (aspectRatioCode << 4) | frameRateCode

	// Bit rate (18 bits, in units of 400 bps)
	const bitRateValue = Math.floor(bitRate / 400)
	header[8] = (bitRateValue >> 10) & 0xff
	header[9] = (bitRateValue >> 2) & 0xff
	header[10] = ((bitRateValue & 0x03) << 6) | 0x10 // Marker bit

	// VBV buffer size (10 bits) + constrained parameters flag (1 bit)
	const vbvBufferSize = 112 // Default value
	header[11] = ((vbvBufferSize >> 5) & 0x1f) | 0x20

	return header
}

/**
 * Build GOP header
 */
function buildGopHeader(timeInSeconds: number, pictures: number): Uint8Array {
	const header = new Uint8Array(8)

	// GOP start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0xb8

	// Time code
	const hours = Math.floor(timeInSeconds / 3600)
	const minutes = Math.floor((timeInSeconds % 3600) / 60)
	const seconds = timeInSeconds % 60

	header[4] = ((hours & 0x1f) << 2) | ((minutes >> 4) & 0x03)
	header[5] = ((minutes & 0x0f) << 4) | ((seconds >> 3) & 0x07)
	header[6] = ((seconds & 0x07) << 5) | ((pictures >> 1) & 0x1f)
	header[7] = ((pictures & 0x01) << 7) | 0x40 // Closed GOP

	return header
}

/**
 * Build picture header
 */
function buildPictureHeader(temporalReference: number, pictureCodingType: PictureCodingType): Uint8Array {
	const header = new Uint8Array(8)

	// Picture start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0x00

	// Temporal reference (10 bits)
	header[4] = (temporalReference >> 2) & 0xff
	header[5] = ((temporalReference & 0x03) << 6) | ((pictureCodingType & 0x07) << 3)

	// VBV delay (16 bits) - 0xFFFF for variable bitrate
	header[6] = 0xff
	header[7] = 0xff

	return header
}

/**
 * Build navigation pack (PCI + DSI)
 */
function buildNavigationPack(frameIndex: number, pts: number, vobuStartFrame: number): Uint8Array {
	const navPack = new Uint8Array(1024)

	// PCI (Presentation Control Information) - 980 bytes
	const pci = navPack.subarray(0, 980)
	// Logical block number (simplified - frame based)
	const lbn = frameIndex * 2 // Approximate 2KB per frame
	pci[0] = (lbn >> 24) & 0xff
	pci[1] = (lbn >> 16) & 0xff
	pci[2] = (lbn >> 8) & 0xff
	pci[3] = lbn & 0xff

	// VOBU category
	pci[4] = 0x00
	pci[5] = 0x00

	// VOBU start PTM (Presentation Time)
	const vobu_s_ptm = pts
	pci[8] = (vobu_s_ptm >> 24) & 0xff
	pci[9] = (vobu_s_ptm >> 16) & 0xff
	pci[10] = (vobu_s_ptm >> 8) & 0xff
	pci[11] = vobu_s_ptm & 0xff

	// VOBU end PTM (approximate)
	const vobu_e_ptm = pts + 135000 // ~1.5 seconds at 90kHz
	pci[12] = (vobu_e_ptm >> 24) & 0xff
	pci[13] = (vobu_e_ptm >> 16) & 0xff
	pci[14] = (vobu_e_ptm >> 8) & 0xff
	pci[15] = vobu_e_ptm & 0xff

	// VOBU sequence end PTM
	pci[16] = (vobu_e_ptm >> 24) & 0xff
	pci[17] = (vobu_e_ptm >> 16) & 0xff
	pci[18] = (vobu_e_ptm >> 8) & 0xff
	pci[19] = vobu_e_ptm & 0xff

	// DSI (Data Search Information) - 1024 bytes (44 used)
	const dsi = navPack.subarray(980)
	// NV_PCK_SCR
	const scr = pts
	dsi[0] = (scr >> 24) & 0xff
	dsi[1] = (scr >> 16) & 0xff
	dsi[2] = (scr >> 8) & 0xff
	dsi[3] = scr & 0xff

	// NV_PCK_LBN
	dsi[4] = (lbn >> 24) & 0xff
	dsi[5] = (lbn >> 16) & 0xff
	dsi[6] = (lbn >> 8) & 0xff
	dsi[7] = lbn & 0xff

	// VOBU_EA (end address)
	const vobu_ea = 100 // Approximate blocks per VOBU
	dsi[8] = (vobu_ea >> 24) & 0xff
	dsi[9] = (vobu_ea >> 16) & 0xff
	dsi[10] = (vobu_ea >> 8) & 0xff
	dsi[11] = vobu_ea & 0xff

	return navPack
}

/**
 * Build navigation PES packet (Private Stream 2)
 */
function buildNavigationPesPacket(navPack: Uint8Array): Uint8Array {
	const packet = new Uint8Array(6 + navPack.length)

	// PES start code prefix
	packet[0] = 0x00
	packet[1] = 0x00
	packet[2] = 0x01
	packet[3] = 0xbf // Private stream 2

	// PES packet length
	const length = navPack.length
	packet[4] = (length >> 8) & 0xff
	packet[5] = length & 0xff

	// Copy navigation pack
	packet.set(navPack, 6)

	return packet
}

/**
 * Build PES packet
 */
function buildPesPacket(
	streamId: number,
	payload: Uint8Array,
	pts: number | undefined,
	dts: number | undefined
): Uint8Array {
	// Calculate header size
	let headerSize = 9 // Basic MPEG-2 PES header
	if (pts !== undefined) headerSize += 5
	if (dts !== undefined) headerSize += 5

	const packetLength = headerSize - 6 + payload.length
	const packet = new Uint8Array(headerSize + payload.length)

	// PES start code prefix
	packet[0] = 0x00
	packet[1] = 0x00
	packet[2] = 0x01
	packet[3] = streamId

	// PES packet length (may be 0 for video)
	if (packetLength <= 0xffff) {
		packet[4] = (packetLength >> 8) & 0xff
		packet[5] = packetLength & 0xff
	} else {
		packet[4] = 0
		packet[5] = 0
	}

	// PES header flags
	packet[6] = 0x80 // '10' marker bits
	packet[7] = (pts !== undefined ? 0x80 : 0) | (dts !== undefined ? 0x40 : 0)
	packet[8] = headerSize - 9 // PES header data length

	let offset = 9

	// Write PTS if present
	if (pts !== undefined) {
		const marker = dts !== undefined ? 0x30 : 0x20
		packet[offset++] = marker | ((pts >> 29) & 0x0e) | 0x01
		packet[offset++] = (pts >> 22) & 0xff
		packet[offset++] = ((pts >> 14) & 0xfe) | 0x01
		packet[offset++] = (pts >> 7) & 0xff
		packet[offset++] = ((pts << 1) & 0xfe) | 0x01
	}

	// Write DTS if present
	if (dts !== undefined) {
		packet[offset++] = 0x10 | ((dts >> 29) & 0x0e) | 0x01
		packet[offset++] = (dts >> 22) & 0xff
		packet[offset++] = ((dts >> 14) & 0xfe) | 0x01
		packet[offset++] = (dts >> 7) & 0xff
		packet[offset++] = ((dts << 1) & 0xfe) | 0x01
	}

	// Copy payload
	packet.set(payload, offset)

	return packet
}

/**
 * Build program end code
 */
function buildProgramEndCode(): Uint8Array {
	const code = new Uint8Array(4)
	code[0] = 0x00
	code[1] = 0x00
	code[2] = 0x01
	code[3] = 0xb9
	return code
}

/**
 * Build stub encoded frame (placeholder)
 */
function buildStubEncodedFrame(rgba: Uint8Array, width: number, height: number): Uint8Array {
	// Placeholder for actual MPEG-2 video encoding
	const sliceData = new Uint8Array(100)

	// Slice start code (0x00000101 - first slice)
	sliceData[0] = 0x00
	sliceData[1] = 0x00
	sliceData[2] = 0x01
	sliceData[3] = 0x01

	// Quantizer scale and placeholder data
	sliceData[4] = 0x08

	// Fill with minimal coded block pattern
	for (let i = 5; i < sliceData.length; i++) {
		sliceData[i] = 0x00
	}

	return sliceData
}

/**
 * Get aspect ratio code for DVD
 */
function getAspectRatioCode(aspectRatio: number): number {
	// DVD uses specific aspect ratios
	// 2 = 4:3 (1.33:1)
	// 3 = 16:9 (1.77:1)
	if (aspectRatio >= 1.7) {
		return 3 // 16:9
	}
	return 2 // 4:3
}

/**
 * Get frame rate code for MPEG-2
 */
function getFrameRateCode(frameRate: number): number {
	const codes: Record<number, number> = {
		23.976: 1,
		24: 2,
		25: 3,
		29.97: 4,
		30: 5,
		50: 6,
		59.94: 7,
		60: 8,
	}

	// Find closest match
	let bestCode = 4 // Default to 29.97 fps (NTSC)
	let bestDiff = Math.abs(frameRate - 29.97)

	for (const [fps, code] of Object.entries(codes)) {
		const diff = Math.abs(frameRate - Number(fps))
		if (diff < bestDiff) {
			bestDiff = diff
			bestCode = code
		}
	}

	return bestCode
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
