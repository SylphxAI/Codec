/**
 * MPEG-TS (Transport Stream) decoder
 * Fixed-size packet-based container parser
 */

import {
	TS_PACKET_SIZE,
	TS_SYNC_BYTE,
	TsPid,
	TsTableId,
	type TsAdaptationField,
	type TsDecodeResult,
	type TsInfo,
	type TsPacket,
	type TsPatEntry,
	type TsPesHeader,
	type TsPmt,
	type TsPmtStream,
} from './types'

/**
 * Check if data is MPEG-TS
 */
export function isTs(data: Uint8Array): boolean {
	if (data.length < TS_PACKET_SIZE) return false

	// Check for sync byte at start
	if (data[0] !== TS_SYNC_BYTE) return false

	// Verify sync byte appears at expected intervals
	if (data.length >= TS_PACKET_SIZE * 2) {
		if (data[TS_PACKET_SIZE] !== TS_SYNC_BYTE) return false
	}

	return true
}

/**
 * Parse TS info without full decode
 */
export function parseTsInfo(data: Uint8Array): TsInfo {
	const result = decodeTs(data)
	return result.info
}

/**
 * Decode MPEG-TS file
 */
export function decodeTs(data: Uint8Array): TsDecodeResult {
	if (!isTs(data)) {
		throw new Error('Invalid MPEG-TS: missing sync byte')
	}

	const packets: TsPacket[] = []
	const programs: TsPatEntry[] = []
	let pmt: TsPmt | undefined
	const videoFrames: Uint8Array[] = []
	const audioFrames: Uint8Array[] = []

	// PES assembly buffers
	const pesBuffers = new Map<number, Uint8Array[]>()
	const pesHeaders = new Map<number, TsPesHeader>()

	let offset = 0
	let videoPid = -1
	let audioPid = -1

	while (offset + TS_PACKET_SIZE <= data.length) {
		// Find sync byte
		if (data[offset] !== TS_SYNC_BYTE) {
			offset++
			continue
		}

		const packet = parsePacket(data, offset)
		if (!packet) {
			offset++
			continue
		}

		packets.push(packet)

		// Process payload
		if (packet.payload && packet.payload.length > 0) {
			switch (packet.pid) {
				case TsPid.PAT:
					parsePat(packet.payload, programs)
					break

				default:
					// Check if this is PMT
					const pmtEntry = programs.find(p => p.pid === packet.pid)
					if (pmtEntry && !pmt) {
						pmt = parsePmt(packet.payload)
						// Find video and audio PIDs
						for (const stream of pmt.streams) {
							if (isVideoStreamType(stream.streamType)) {
								videoPid = stream.pid
							} else if (isAudioStreamType(stream.streamType)) {
								audioPid = stream.pid
							}
						}
					}

					// Collect PES data for video/audio streams
					if (packet.pid === videoPid || packet.pid === audioPid) {
						assemblePes(packet, pesBuffers, pesHeaders,
							packet.pid === videoPid ? videoFrames : audioFrames)
					}
			}
		}

		offset += TS_PACKET_SIZE
	}

	// Flush remaining PES buffers
	if (videoPid !== -1) {
		const videoBuffer = pesBuffers.get(videoPid)
		if (videoBuffer && videoBuffer.length > 0) {
			const pesData = concatBuffers(videoBuffer)
			const header = pesHeaders.get(videoPid)
			if (header) {
				const frameData = pesData.slice(header.headerLength)
				if (frameData.length > 0) {
					videoFrames.push(frameData)
				}
			}
		}
	}

	if (audioPid !== -1) {
		const audioBuffer = pesBuffers.get(audioPid)
		if (audioBuffer && audioBuffer.length > 0) {
			const pesData = concatBuffers(audioBuffer)
			const header = pesHeaders.get(audioPid)
			if (header) {
				const frameData = pesData.slice(header.headerLength)
				if (frameData.length > 0) {
					audioFrames.push(frameData)
				}
			}
		}
	}

	// Calculate duration from PCR if available
	let duration = 0
	const pcrPackets = packets.filter(p => p.adaptationField?.pcrFlag)
	if (pcrPackets.length >= 2) {
		const firstPcr = pcrPackets[0]!.adaptationField!.pcr!
		const lastPcr = pcrPackets[pcrPackets.length - 1]!.adaptationField!.pcr!
		duration = (lastPcr - firstPcr) / 90000 // PCR in 90kHz
	}

	return {
		info: {
			programs,
			pmt,
			duration,
			hasVideo: videoPid !== -1,
			hasAudio: audioPid !== -1,
			videoStreamType: pmt?.streams.find(s => s.pid === videoPid)?.streamType,
			audioStreamType: pmt?.streams.find(s => s.pid === audioPid)?.streamType,
		},
		packets,
		videoFrames,
		audioFrames,
	}
}

/**
 * Parse a single TS packet
 */
function parsePacket(data: Uint8Array, offset: number): TsPacket | null {
	if (data[offset] !== TS_SYNC_BYTE) return null

	const byte1 = data[offset + 1]!
	const byte2 = data[offset + 2]!
	const byte3 = data[offset + 3]!

	const transportError = (byte1 & 0x80) !== 0
	const payloadUnitStart = (byte1 & 0x40) !== 0
	const transportPriority = (byte1 & 0x20) !== 0
	const pid = ((byte1 & 0x1f) << 8) | byte2
	const scrambling = (byte3 >> 6) & 0x03
	const adaptationFieldControl = (byte3 >> 4) & 0x03
	const continuityCounter = byte3 & 0x0f

	let payloadOffset = offset + 4
	let adaptationField: TsAdaptationField | undefined

	// Parse adaptation field if present
	if (adaptationFieldControl === 2 || adaptationFieldControl === 3) {
		const afLength = data[payloadOffset]!
		if (afLength > 0) {
			adaptationField = parseAdaptationField(data, payloadOffset)
		}
		payloadOffset += 1 + afLength
	}

	// Extract payload
	let payload: Uint8Array | undefined
	if (adaptationFieldControl === 1 || adaptationFieldControl === 3) {
		const payloadLength = offset + TS_PACKET_SIZE - payloadOffset
		if (payloadLength > 0) {
			payload = data.slice(payloadOffset, payloadOffset + payloadLength)
		}
	}

	return {
		syncByte: TS_SYNC_BYTE,
		transportError,
		payloadUnitStart,
		transportPriority,
		pid,
		scrambling,
		adaptationFieldControl,
		continuityCounter,
		adaptationField,
		payload,
	}
}

/**
 * Parse adaptation field
 */
function parseAdaptationField(data: Uint8Array, offset: number): TsAdaptationField {
	const length = data[offset]!
	const flags = data[offset + 1] || 0

	const af: TsAdaptationField = {
		length,
		discontinuity: (flags & 0x80) !== 0,
		randomAccess: (flags & 0x40) !== 0,
		priority: (flags & 0x20) !== 0,
		pcrFlag: (flags & 0x10) !== 0,
		opcrFlag: (flags & 0x08) !== 0,
		splicingPointFlag: (flags & 0x04) !== 0,
		privateDataFlag: (flags & 0x02) !== 0,
		extensionFlag: (flags & 0x01) !== 0,
		stuffingBytes: 0,
	}

	let pos = offset + 2

	// Parse PCR if present
	if (af.pcrFlag && pos + 6 <= offset + 1 + length) {
		const pcrBase = (data[pos]! << 25) | (data[pos + 1]! << 17) |
		                (data[pos + 2]! << 9) | (data[pos + 3]! << 1) |
		                ((data[pos + 4]! >> 7) & 0x01)
		const pcrExt = ((data[pos + 4]! & 0x01) << 8) | data[pos + 5]!
		af.pcr = pcrBase * 300 + pcrExt
		pos += 6
	}

	// Parse OPCR if present
	if (af.opcrFlag && pos + 6 <= offset + 1 + length) {
		const opcrBase = (data[pos]! << 25) | (data[pos + 1]! << 17) |
		                 (data[pos + 2]! << 9) | (data[pos + 3]! << 1) |
		                 ((data[pos + 4]! >> 7) & 0x01)
		const opcrExt = ((data[pos + 4]! & 0x01) << 8) | data[pos + 5]!
		af.opcr = opcrBase * 300 + opcrExt
		pos += 6
	}

	return af
}

/**
 * Parse Program Association Table
 */
function parsePat(data: Uint8Array, programs: TsPatEntry[]): void {
	// Skip pointer field if present
	let offset = 0
	if (data.length > 0) {
		const pointerField = data[0]!
		offset = 1 + pointerField
	}

	if (offset >= data.length) return

	const tableId = data[offset]!
	if (tableId !== TsTableId.PAT) return

	const sectionLength = ((data[offset + 1]! & 0x0f) << 8) | data[offset + 2]!
	// const transportStreamId = (data[offset + 3]! << 8) | data[offset + 4]!

	// Skip header (8 bytes) to program entries
	let pos = offset + 8

	// Parse program entries (4 bytes each)
	const endPos = offset + 3 + sectionLength - 4 // Exclude CRC
	while (pos + 4 <= endPos) {
		const programNumber = (data[pos]! << 8) | data[pos + 1]!
		const pid = ((data[pos + 2]! & 0x1f) << 8) | data[pos + 3]!

		if (programNumber !== 0) {
			programs.push({ programNumber, pid })
		}

		pos += 4
	}
}

/**
 * Parse Program Map Table
 */
function parsePmt(data: Uint8Array): TsPmt {
	// Skip pointer field if present
	let offset = 0
	if (data.length > 0) {
		const pointerField = data[0]!
		offset = 1 + pointerField
	}

	const tableId = data[offset]!
	const sectionLength = ((data[offset + 1]! & 0x0f) << 8) | data[offset + 2]!
	const programNumber = (data[offset + 3]! << 8) | data[offset + 4]!
	const pcrPid = ((data[offset + 8]! & 0x1f) << 8) | data[offset + 9]!
	const programInfoLength = ((data[offset + 10]! & 0x0f) << 8) | data[offset + 11]!

	const streams: TsPmtStream[] = []
	let pos = offset + 12 + programInfoLength
	const endPos = offset + 3 + sectionLength - 4 // Exclude CRC

	while (pos + 5 <= endPos) {
		const streamType = data[pos]!
		const pid = ((data[pos + 1]! & 0x1f) << 8) | data[pos + 2]!
		const esInfoLength = ((data[pos + 3]! & 0x0f) << 8) | data[pos + 4]!

		streams.push({
			streamType,
			pid,
			descriptors: [],
		})

		pos += 5 + esInfoLength
	}

	return { programNumber, pcrPid, streams }
}

/**
 * Assemble PES packets from TS packets
 */
function assemblePes(
	packet: TsPacket,
	buffers: Map<number, Uint8Array[]>,
	headers: Map<number, TsPesHeader>,
	frames: Uint8Array[]
): void {
	if (!packet.payload) return

	const pid = packet.pid

	// Start of new PES packet
	if (packet.payloadUnitStart) {
		// Flush previous buffer
		const prevBuffer = buffers.get(pid)
		if (prevBuffer && prevBuffer.length > 0) {
			const pesData = concatBuffers(prevBuffer)
			const header = headers.get(pid)
			if (header) {
				const frameData = pesData.slice(header.headerLength)
				if (frameData.length > 0) {
					frames.push(frameData)
				}
			}
		}

		// Parse PES header
		const pesHeader = parsePesHeader(packet.payload)
		if (pesHeader) {
			headers.set(pid, pesHeader)
			buffers.set(pid, [packet.payload])
		}
	} else {
		// Continuation of PES packet
		const buffer = buffers.get(pid)
		if (buffer) {
			buffer.push(packet.payload)
		}
	}
}

/**
 * Parse PES packet header
 */
function parsePesHeader(data: Uint8Array): TsPesHeader | null {
	if (data.length < 9) return null

	// Check start code prefix (0x000001)
	if (data[0] !== 0x00 || data[1] !== 0x00 || data[2] !== 0x01) {
		return null
	}

	const streamId = data[3]!
	const packetLength = (data[4]! << 8) | data[5]!

	// Check if this is a PES with optional header
	if (streamId < 0xbc) return null

	const byte6 = data[6]!
	const byte7 = data[7]!
	const headerDataLength = data[8]!

	const header: TsPesHeader = {
		streamId,
		packetLength,
		scramblingControl: (byte6 >> 4) & 0x03,
		priority: (byte6 & 0x08) !== 0,
		dataAlignment: (byte6 & 0x04) !== 0,
		copyright: (byte6 & 0x02) !== 0,
		original: (byte6 & 0x01) !== 0,
		ptsFlag: (byte7 & 0x80) !== 0,
		dtsFlag: (byte7 & 0x40) !== 0,
		headerLength: 9 + headerDataLength,
	}

	let pos = 9

	// Parse PTS if present
	if (header.ptsFlag && pos + 5 <= data.length) {
		header.pts = parseTimestamp(data, pos)
		pos += 5
	}

	// Parse DTS if present
	if (header.dtsFlag && pos + 5 <= data.length) {
		header.dts = parseTimestamp(data, pos)
		pos += 5
	}

	return header
}

/**
 * Parse 33-bit timestamp from PES header
 */
function parseTimestamp(data: Uint8Array, offset: number): number {
	const byte0 = data[offset]!
	const byte1 = data[offset + 1]!
	const byte2 = data[offset + 2]!
	const byte3 = data[offset + 3]!
	const byte4 = data[offset + 4]!

	return (
		((byte0 & 0x0e) << 29) |
		(byte1 << 22) |
		((byte2 & 0xfe) << 14) |
		(byte3 << 7) |
		((byte4 & 0xfe) >> 1)
	)
}

/**
 * Check if stream type is video
 */
function isVideoStreamType(type: number): boolean {
	return [0x01, 0x02, 0x1b, 0x24, 0x1c, 0x21].includes(type)
}

/**
 * Check if stream type is audio
 */
function isAudioStreamType(type: number): boolean {
	return [0x03, 0x04, 0x0f, 0x11, 0x81].includes(type)
}

/**
 * Concatenate buffers
 */
function concatBuffers(buffers: Uint8Array[]): Uint8Array {
	const totalLength = buffers.reduce((sum, b) => sum + b.length, 0)
	const result = new Uint8Array(totalLength)
	let offset = 0
	for (const buffer of buffers) {
		result.set(buffer, offset)
		offset += buffer.length
	}
	return result
}
