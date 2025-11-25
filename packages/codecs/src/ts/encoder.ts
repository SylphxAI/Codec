/**
 * MPEG-TS (Transport Stream) encoder
 * Creates TS files with MJPEG video
 */

import type { ImageData } from '@mconv/core'
import { encodeJpeg } from '../jpeg'
import {
	TS_PACKET_SIZE,
	TS_SYNC_BYTE,
	TsPid,
	TsStreamType,
	TsTableId,
	type TsEncodeOptions,
} from './types'

/**
 * Encode frames to MPEG-TS
 */
export function encodeTs(frames: ImageData[], options: TsEncodeOptions = {}): Uint8Array {
	if (frames.length === 0) {
		throw new Error('No frames to encode')
	}

	const {
		programNumber = 1,
		pmtPid = 0x1000,
		videoPid = 0x100,
		pcrPid = 0x100,
		frameRate = 30,
	} = options

	const packets: Uint8Array[] = []
	let continuityCounters = new Map<number, number>()

	const getContinuityCounter = (pid: number): number => {
		const current = continuityCounters.get(pid) || 0
		continuityCounters.set(pid, (current + 1) & 0x0f)
		return current
	}

	// Encode frames to JPEG
	const jpegFrames = frames.map((frame, i) => ({
		data: encodeJpeg(frame, { quality: 85 }),
		pts: Math.floor((i * 90000) / frameRate), // PTS in 90kHz units
	}))

	// Build PAT packet
	packets.push(buildPatPacket(programNumber, pmtPid, getContinuityCounter(TsPid.PAT)))

	// Build PMT packet
	packets.push(buildPmtPacket(programNumber, pcrPid, videoPid, pmtPid, getContinuityCounter(pmtPid)))

	// Build video PES packets
	for (let i = 0; i < jpegFrames.length; i++) {
		const frame = jpegFrames[i]!
		const isFirst = i === 0
		const pcr = frame.pts * 300 // PCR = PTS * 300 (27MHz clock)

		const pesPackets = buildPesPackets(
			frame.data,
			videoPid,
			frame.pts,
			isFirst ? pcr : undefined,
			() => getContinuityCounter(videoPid)
		)

		packets.push(...pesPackets)
	}

	// Concatenate all packets
	return concatArrays(packets)
}

/**
 * Build PAT (Program Association Table) packet
 */
function buildPatPacket(programNumber: number, pmtPid: number, continuityCounter: number): Uint8Array {
	const packet = new Uint8Array(TS_PACKET_SIZE)

	// TS header
	packet[0] = TS_SYNC_BYTE
	packet[1] = 0x40 // Payload unit start
	packet[2] = TsPid.PAT & 0xff
	packet[3] = 0x10 | (continuityCounter & 0x0f) // Payload only

	// PAT payload
	let offset = 4
	packet[offset++] = 0 // Pointer field

	// PAT section
	packet[offset++] = TsTableId.PAT // Table ID
	packet[offset++] = 0xb0 // Section syntax + reserved + length high
	packet[offset++] = 13 // Section length (9 header + 4 program entry)

	packet[offset++] = 0x00 // Transport stream ID high
	packet[offset++] = 0x01 // Transport stream ID low
	packet[offset++] = 0xc1 // Reserved + version + current/next
	packet[offset++] = 0x00 // Section number
	packet[offset++] = 0x00 // Last section number

	// Program entry
	packet[offset++] = (programNumber >> 8) & 0xff
	packet[offset++] = programNumber & 0xff
	packet[offset++] = 0xe0 | ((pmtPid >> 8) & 0x1f)
	packet[offset++] = pmtPid & 0xff

	// CRC-32
	const crc = calculateCrc32(packet.slice(5, offset))
	packet[offset++] = (crc >> 24) & 0xff
	packet[offset++] = (crc >> 16) & 0xff
	packet[offset++] = (crc >> 8) & 0xff
	packet[offset++] = crc & 0xff

	// Fill rest with stuffing
	packet.fill(0xff, offset)

	return packet
}

/**
 * Build PMT (Program Map Table) packet
 */
function buildPmtPacket(
	programNumber: number,
	pcrPid: number,
	videoPid: number,
	pmtPid: number,
	continuityCounter: number
): Uint8Array {
	const packet = new Uint8Array(TS_PACKET_SIZE)

	// TS header
	packet[0] = TS_SYNC_BYTE
	packet[1] = 0x40 | ((pmtPid >> 8) & 0x1f) // Payload unit start + PID high
	packet[2] = pmtPid & 0xff
	packet[3] = 0x10 | (continuityCounter & 0x0f) // Payload only

	// PMT payload
	let offset = 4
	packet[offset++] = 0 // Pointer field

	// PMT section
	packet[offset++] = TsTableId.PMT // Table ID
	packet[offset++] = 0xb0 // Section syntax + reserved
	packet[offset++] = 18 // Section length

	packet[offset++] = (programNumber >> 8) & 0xff
	packet[offset++] = programNumber & 0xff
	packet[offset++] = 0xc1 // Reserved + version + current/next
	packet[offset++] = 0x00 // Section number
	packet[offset++] = 0x00 // Last section number

	packet[offset++] = 0xe0 | ((pcrPid >> 8) & 0x1f) // PCR PID high
	packet[offset++] = pcrPid & 0xff // PCR PID low
	packet[offset++] = 0xf0 // Reserved + program info length high
	packet[offset++] = 0x00 // Program info length low

	// Video stream entry
	packet[offset++] = TsStreamType.MJPEG // Stream type (Motion JPEG)
	packet[offset++] = 0xe0 | ((videoPid >> 8) & 0x1f) // Elementary PID high
	packet[offset++] = videoPid & 0xff // Elementary PID low
	packet[offset++] = 0xf0 // Reserved + ES info length high
	packet[offset++] = 0x00 // ES info length low

	// CRC-32
	const crc = calculateCrc32(packet.slice(5, offset))
	packet[offset++] = (crc >> 24) & 0xff
	packet[offset++] = (crc >> 16) & 0xff
	packet[offset++] = (crc >> 8) & 0xff
	packet[offset++] = crc & 0xff

	// Fill rest with stuffing
	packet.fill(0xff, offset)

	return packet
}

/**
 * Build PES packets for video frame
 */
function buildPesPackets(
	frameData: Uint8Array,
	pid: number,
	pts: number,
	pcr: number | undefined,
	getContinuityCounter: () => number
): Uint8Array[] {
	const packets: Uint8Array[] = []

	// Build PES header
	const pesHeader = buildPesHeader(0xe0, frameData.length, pts) // Video stream ID

	// Combine PES header and frame data
	const pesData = new Uint8Array(pesHeader.length + frameData.length)
	pesData.set(pesHeader)
	pesData.set(frameData, pesHeader.length)

	// Split into TS packets
	let offset = 0
	let isFirst = true

	while (offset < pesData.length) {
		const packet = new Uint8Array(TS_PACKET_SIZE)
		let packetOffset = 0

		// TS header
		packet[packetOffset++] = TS_SYNC_BYTE
		packet[packetOffset++] = (isFirst ? 0x40 : 0x00) | ((pid >> 8) & 0x1f)
		packet[packetOffset++] = pid & 0xff

		// Determine if we need adaptation field
		const remainingData = pesData.length - offset
		let adaptationLength = 0

		if (isFirst && pcr !== undefined) {
			// Add adaptation field with PCR
			adaptationLength = 8 // 1 length + 1 flags + 6 PCR
			packet[packetOffset++] = 0x30 | (getContinuityCounter() & 0x0f) // Both AF and payload

			const payloadSpace = TS_PACKET_SIZE - 4 - adaptationLength
			const dataSize = Math.min(remainingData, payloadSpace)

			// Adaptation field
			packet[packetOffset++] = adaptationLength - 1 // AF length (excluding length byte)
			packet[packetOffset++] = 0x10 // PCR flag

			// PCR (33-bit base + 9-bit extension in 48 bits)
			const pcrBase = Math.floor(pcr / 300)
			const pcrExt = pcr % 300

			packet[packetOffset++] = (pcrBase >> 25) & 0xff
			packet[packetOffset++] = (pcrBase >> 17) & 0xff
			packet[packetOffset++] = (pcrBase >> 9) & 0xff
			packet[packetOffset++] = (pcrBase >> 1) & 0xff
			packet[packetOffset++] = ((pcrBase & 0x01) << 7) | 0x7e | ((pcrExt >> 8) & 0x01)
			packet[packetOffset++] = pcrExt & 0xff

			// Copy payload
			packet.set(pesData.slice(offset, offset + dataSize), packetOffset)
			offset += dataSize
		} else {
			const payloadSpace = TS_PACKET_SIZE - 4
			const dataSize = Math.min(remainingData, payloadSpace)

			if (dataSize < payloadSpace) {
				// Need adaptation field for stuffing
				adaptationLength = payloadSpace - dataSize
				packet[3] = 0x30 | (getContinuityCounter() & 0x0f)

				packet[packetOffset++] = adaptationLength - 1 // AF length
				if (adaptationLength > 1) {
					packet[packetOffset++] = 0x00 // No flags
					// Fill with stuffing
					packet.fill(0xff, packetOffset, packetOffset + adaptationLength - 2)
					packetOffset += adaptationLength - 2
				}
			} else {
				packet[3] = 0x10 | (getContinuityCounter() & 0x0f) // Payload only
			}

			// Copy payload
			packet.set(pesData.slice(offset, offset + dataSize), packetOffset)
			offset += dataSize
		}

		packets.push(packet)
		isFirst = false
	}

	return packets
}

/**
 * Build PES header
 */
function buildPesHeader(streamId: number, dataLength: number, pts: number): Uint8Array {
	const headerLength = 14 // 6 basic + 3 PES header + 5 PTS
	const header = new Uint8Array(headerLength)

	// Start code prefix
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x01

	// Stream ID
	header[3] = streamId

	// PES packet length (0 for video streams)
	const pesLength = dataLength + 8 // data + 3 header bytes + 5 PTS bytes
	if (pesLength <= 0xffff) {
		header[4] = (pesLength >> 8) & 0xff
		header[5] = pesLength & 0xff
	} else {
		header[4] = 0
		header[5] = 0
	}

	// PES header flags
	header[6] = 0x80 // '10' marker bits
	header[7] = 0x80 // PTS flag
	header[8] = 5 // Header data length

	// PTS (33 bits in 5 bytes)
	header[9] = 0x21 | ((pts >> 29) & 0x0e) // '0010' + PTS[32:30] + marker
	header[10] = (pts >> 22) & 0xff
	header[11] = 0x01 | ((pts >> 14) & 0xfe) // PTS[22:15] + marker
	header[12] = (pts >> 7) & 0xff
	header[13] = 0x01 | ((pts << 1) & 0xfe) // PTS[7:0] + marker

	return header
}

/**
 * Calculate CRC-32 for MPEG-TS (polynomial 0x04c11db7)
 */
function calculateCrc32(data: Uint8Array): number {
	let crc = 0xffffffff

	for (let i = 0; i < data.length; i++) {
		crc ^= data[i]! << 24
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
