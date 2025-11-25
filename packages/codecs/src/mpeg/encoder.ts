/**
 * MPEG-1/2 (Program Stream) encoder
 * Creates MPEG PS files from VideoData
 */

import type { VideoData } from '@sylphx/codec-core'
import {
	MpegStartCode,
	MpegVersion,
	PictureCodingType,
	type MpegEncodeOptions,
} from './types'

/**
 * Encode VideoData to MPEG Program Stream
 */
export function encodeMpeg(video: VideoData, options: MpegEncodeOptions = {}): Uint8Array {
	if (video.frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const {
		version = MpegVersion.MPEG2,
		frameRate = video.fps || 30,
		bitRate = 5000000, // 5 Mbps default
		gop = 15, // GOP size (keyframe every 15 frames)
	} = options

	const packets: Uint8Array[] = []

	// Build MPEG-2 Program Stream structure
	// Note: This is a simplified implementation that creates the PS container structure
	// Actual MPEG video encoding requires implementing the full MPEG-1/2 video codec

	const scr90kHz = 0 // System Clock Reference base
	const programMuxRate = Math.ceil(bitRate / 400) // In units of 50 bytes/second

	// Add initial pack header
	packets.push(buildPackHeader(version, scr90kHz, programMuxRate))

	// Add system header
	packets.push(buildSystemHeader(bitRate, 1, 1)) // 1 audio, 1 video stream

	// Encode video sequence
	const sequenceHeader = buildSequenceHeader(
		video.width,
		video.height,
		frameRate,
		bitRate,
		1.0 // aspect ratio
	)
	packets.push(buildPesPacket(0xe0, sequenceHeader, 0, 0)) // Video stream 0

	// Add GOP and picture headers for each frame
	for (let i = 0; i < video.frames.length; i++) {
		const frame = video.frames[i]!
		const isKeyframe = i % gop === 0
		const pts = Math.floor((frame.timestamp * 90)) // Convert ms to 90kHz units
		const temporalReference = i % gop

		// Add pack header periodically
		if (i % 10 === 0) {
			const currentScr = scr90kHz + pts
			packets.push(buildPackHeader(version, currentScr, programMuxRate))
		}

		// Add GOP header for keyframes
		if (isKeyframe) {
			const gopHeader = buildGopHeader(
				Math.floor(frame.timestamp / 1000), // seconds
				i % gop
			)
			packets.push(buildPesPacket(0xe0, gopHeader, pts, undefined))
		}

		// Add picture header
		const pictureType = isKeyframe ? PictureCodingType.I_FRAME : PictureCodingType.P_FRAME
		const pictureHeader = buildPictureHeader(temporalReference, pictureType)

		// For this stub, we'll create a minimal encoded frame
		// In a real implementation, this would be the actual MPEG-encoded video data
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
 * Build MPEG pack header (MPEG-1 or MPEG-2)
 */
function buildPackHeader(version: MpegVersion, scr: number, programMuxRate: number): Uint8Array {
	if (version === MpegVersion.MPEG2) {
		// MPEG-2 pack header (14 bytes)
		const header = new Uint8Array(14)

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
		header[13] = 0xf8 // No stuffing

		return header
	} else {
		// MPEG-1 pack header (12 bytes)
		const header = new Uint8Array(12)

		// Pack start code
		header[0] = 0x00
		header[1] = 0x00
		header[2] = 0x01
		header[3] = 0xba

		// SCR (33 bits)
		header[4] = 0x21 | ((scr >> 29) & 0x0e)
		header[5] = (scr >> 22) & 0xff
		header[6] = 0x01 | ((scr >> 14) & 0xfe)
		header[7] = (scr >> 7) & 0xff
		header[8] = 0x01 | ((scr << 1) & 0xfe)

		// Mux rate (22 bits)
		header[9] = 0x80 | ((programMuxRate >> 15) & 0x7f)
		header[10] = (programMuxRate >> 7) & 0xff
		header[11] = 0x01 | ((programMuxRate << 1) & 0xfe)

		return header
	}
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
	const aspectRatioCode = 1 // 1:1 (square pixels)
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
	// Remaining bits would continue, but this is sufficient for a stub

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
 * In a real implementation, this would perform actual MPEG video encoding
 */
function buildStubEncodedFrame(rgba: Uint8Array, width: number, height: number): Uint8Array {
	// This is a placeholder that creates a minimal "encoded" frame
	// Real MPEG encoding would include:
	// - DCT transformation
	// - Quantization
	// - Huffman/VLC encoding
	// - Motion compensation (for P/B frames)

	// For now, return a minimal slice data structure
	const sliceData = new Uint8Array(100)

	// Slice start code (0x00000101 - first slice)
	sliceData[0] = 0x00
	sliceData[1] = 0x00
	sliceData[2] = 0x01
	sliceData[3] = 0x01

	// Quantizer scale and placeholder data
	sliceData[4] = 0x08 // Quantizer scale

	// Fill with minimal coded block pattern
	for (let i = 5; i < sliceData.length; i++) {
		sliceData[i] = 0x00
	}

	return sliceData
}

/**
 * Get frame rate code for MPEG
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
	let bestCode = 5 // Default to 30 fps
	let bestDiff = Math.abs(frameRate - 30)

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
