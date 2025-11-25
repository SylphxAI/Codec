/**
 * MPEG-PS (Program Stream) encoder
 * Creates PS files with MJPEG video
 */

import type { ImageData } from '@sylphx/codec-core'
import { encodeJpeg } from '../jpeg'
import { type PsEncodeOptions } from './types'

/**
 * Encode frames to MPEG-PS
 */
export function encodePs(frames: ImageData[], options: PsEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const {
		muxRate = 10080000, // ~10 Mbps default
		frameRate = 30,
		videoStreamId = 0xe0,
	} = options

	const packs: Uint8Array[] = []

	// Encode frames to JPEG
	const jpegFrames = frames.map((frame, i) => ({
		data: encodeJpeg(frame, { quality: 85 }),
		scr: Math.floor((i * 90000) / frameRate), // SCR in 90kHz units
		pts: Math.floor((i * 90000) / frameRate),
	}))

	// Build system header for first pack
	const systemHeader = buildSystemHeader(muxRate, videoStreamId)

	// Build packs with PES packets
	for (let i = 0; i < jpegFrames.length; i++) {
		const frame = jpegFrames[i]!
		const isFirst = i === 0

		// Build pack header
		const packHeader = buildPackHeader(frame.scr, muxRate)

		// Build PES packet for video frame
		const pesPacket = buildPesPacket(frame.data, videoStreamId, frame.pts)

		// Combine pack
		if (isFirst) {
			packs.push(concatArrays([packHeader, systemHeader, pesPacket]))
		} else {
			packs.push(concatArrays([packHeader, pesPacket]))
		}
	}

	// Add program end code
	const endCode = new Uint8Array([0x00, 0x00, 0x01, 0xb9])
	packs.push(endCode)

	return concatArrays(packs)
}

/**
 * Build MPEG-2 pack header
 */
function buildPackHeader(scr: number, muxRate: number): Uint8Array {
	const header = new Uint8Array(14)

	// Pack start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0xba

	// SCR (System Clock Reference) - 33-bit base, 9-bit extension
	const scrBase = scr
	const scrExt = 0

	// MPEG-2 format: '01' + SCR[32:30] + marker + SCR[29:15] + marker + SCR[14:0] + marker + SCR_ext + marker
	header[4] = 0x44 | ((scrBase >> 27) & 0x38) | ((scrBase >> 28) & 0x03)
	header[5] = (scrBase >> 20) & 0xff
	header[6] = 0x04 | ((scrBase >> 12) & 0xf8) | ((scrBase >> 13) & 0x03)
	header[7] = (scrBase >> 5) & 0xff
	header[8] = 0x04 | ((scrBase << 3) & 0xf8) | ((scrExt >> 7) & 0x03)
	header[9] = ((scrExt << 1) & 0xfe) | 0x01

	// Mux rate (in units of 50 bytes/second)
	const muxRateUnits = Math.floor(muxRate / 50)
	header[10] = (muxRateUnits >> 14) & 0xff
	header[11] = (muxRateUnits >> 6) & 0xff
	header[12] = ((muxRateUnits << 2) & 0xfc) | 0x03

	// Reserved + stuffing length
	header[13] = 0xf8 // No stuffing

	return header
}

/**
 * Build system header
 */
function buildSystemHeader(muxRate: number, videoStreamId: number): Uint8Array {
	// System header with one video stream
	const headerLength = 6 + 3 // Base + one stream entry

	const header = new Uint8Array(6 + headerLength)

	// System header start code
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01
	header[3] = 0xbb

	// Header length
	header[4] = (headerLength >> 8) & 0xff
	header[5] = headerLength & 0xff

	// Rate bound (in 50 bytes/sec units)
	const rateBound = Math.floor(muxRate / 50)
	header[6] = 0x80 | ((rateBound >> 15) & 0x7f)
	header[7] = (rateBound >> 7) & 0xff
	header[8] = ((rateBound << 1) & 0xfe) | 0x01

	// Audio bound (0) + fixed flag (0) + CSPS flag (0)
	header[9] = 0x00

	// System audio lock (0) + system video lock (0) + video bound (1)
	header[10] = 0xe1 // marker bit + video bound = 1

	// Packet rate restriction (0) + reserved
	header[11] = 0x7f

	// Video stream entry
	header[12] = videoStreamId
	header[13] = 0xe0 | 0x00 // P-STD buffer bound scale = 0
	header[14] = 0xe0 // Buffer size bound (high bits)

	return header
}

/**
 * Build PES packet
 */
function buildPesPacket(data: Uint8Array, streamId: number, pts: number): Uint8Array {
	// PES header: 6 bytes base + 3 bytes optional header + 5 bytes PTS
	const pesHeaderLength = 14
	const packetLength = 8 + data.length // Optional header + PTS + data

	// For large packets, use 0 length (unbounded)
	const useZeroLength = packetLength > 0xffff

	const packet = new Uint8Array(pesHeaderLength + data.length)

	// PES start code
	packet[0] = 0x00
	packet[1] = 0x00
	packet[2] = 0x01

	// Stream ID
	packet[3] = streamId

	// PES packet length
	if (useZeroLength) {
		packet[4] = 0x00
		packet[5] = 0x00
	} else {
		packet[4] = (packetLength >> 8) & 0xff
		packet[5] = packetLength & 0xff
	}

	// PES header flags
	packet[6] = 0x80 // '10' marker bits
	packet[7] = 0x80 // PTS flag
	packet[8] = 5 // PES header data length

	// PTS (33 bits in 5 bytes)
	packet[9] = 0x21 | ((pts >> 29) & 0x0e) // '0010' + PTS[32:30] + marker
	packet[10] = (pts >> 22) & 0xff
	packet[11] = 0x01 | ((pts >> 14) & 0xfe) // PTS[22:15] + marker
	packet[12] = (pts >> 7) & 0xff
	packet[13] = 0x01 | ((pts << 1) & 0xfe) // PTS[7:0] + marker

	// Copy payload
	packet.set(data, pesHeaderLength)

	return packet
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
