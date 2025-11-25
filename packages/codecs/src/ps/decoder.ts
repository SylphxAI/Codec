/**
 * MPEG-PS (Program Stream) decoder
 * Variable-length pack-based container parser
 */

import {
	PsStartCode,
	type PsDecodeResult,
	type PsInfo,
	type PsPack,
	type PsPackHeader,
	type PsPesHeader,
	type PsPesPacket,
	type PsStreamInfo,
	type PsSystemHeader,
	type PsSystemHeaderStream,
} from './types'

/**
 * Check if data is MPEG-PS
 */
export function isPs(data: Uint8Array): boolean {
	if (data.length < 14) return false

	// Check for pack start code (0x000001BA)
	if (data[0] !== 0x00 || data[1] !== 0x00 || data[2] !== 0x01 || data[3] !== 0xba) {
		return false
	}

	// Check MPEG version bits
	const byte4 = data[4]!
	// MPEG-2: bits 7-6 = 01
	// MPEG-1: bits 7-4 = 0010
	if ((byte4 & 0xc0) === 0x40 || (byte4 & 0xf0) === 0x20) {
		return true
	}

	return false
}

/**
 * Parse PS info without full decode
 */
export function parsePsInfo(data: Uint8Array): PsInfo {
	const result = decodePs(data)
	return result.info
}

/**
 * Decode MPEG-PS file
 */
export function decodePs(data: Uint8Array): PsDecodeResult {
	if (!isPs(data)) {
		throw new Error('Invalid MPEG-PS: missing pack start code')
	}

	const packs: PsPack[] = []
	const videoFrames: Uint8Array[] = []
	const audioFrames: Uint8Array[] = []
	const streamMap = new Map<number, PsStreamInfo>()

	let offset = 0
	let muxRate = 0
	let isMpeg2 = false
	let firstScr = -1
	let lastScr = -1

	// PES assembly buffers per stream
	const pesBuffers = new Map<number, Uint8Array[]>()

	while (offset < data.length - 4) {
		// Find next start code
		const startCode = findStartCode(data, offset)
		if (startCode < 0) break

		offset = startCode

		const code = readStartCode(data, offset)

		if (code === PsStartCode.PACK_HEADER) {
			const packResult = parsePackHeader(data, offset)
			if (!packResult) {
				offset += 4
				continue
			}

			const { header, nextOffset, mpeg2 } = packResult
			isMpeg2 = mpeg2
			muxRate = header.muxRate

			// Track SCR for duration
			if (firstScr < 0) firstScr = header.scr
			lastScr = header.scr

			const pack: PsPack = {
				header,
				pesPackets: [],
			}

			offset = nextOffset

			// Check for system header
			if (offset + 4 < data.length) {
				const nextCode = readStartCode(data, offset)
				if (nextCode === PsStartCode.SYSTEM_HEADER) {
					const sysResult = parseSystemHeader(data, offset)
					if (sysResult) {
						pack.systemHeader = sysResult.header
						offset = sysResult.nextOffset
					}
				}
			}

			// Parse PES packets until next pack
			while (offset + 4 < data.length) {
				const pesCode = readStartCode(data, offset)

				// Check if this is a new pack or end
				if (pesCode === PsStartCode.PACK_HEADER || pesCode === 0x000001b9) {
					break
				}

				// Check if this is a PES packet (stream IDs: 0xbc - 0xff)
				const streamId = pesCode & 0xff
				if ((pesCode & 0xffffff00) === 0x00000100 && streamId >= 0xbc) {
					const pesResult = parsePesPacket(data, offset, isMpeg2)
					if (pesResult) {
						pack.pesPackets.push(pesResult.packet)

						// Track stream info
						if (!streamMap.has(streamId)) {
							streamMap.set(streamId, {
								streamId,
								streamType: guessStreamType(streamId),
								isVideo: isVideoStream(streamId),
								isAudio: isAudioStream(streamId),
							})
						}

						// Collect frame data
						if (isVideoStream(streamId)) {
							if (pesResult.packet.data.length > 0) {
								videoFrames.push(pesResult.packet.data)
							}
						} else if (isAudioStream(streamId)) {
							if (pesResult.packet.data.length > 0) {
								audioFrames.push(pesResult.packet.data)
							}
						}

						offset = pesResult.nextOffset
					} else {
						offset += 4
					}
				} else {
					offset += 1
				}
			}

			packs.push(pack)
		} else if (code === 0x000001b9) {
			// Program end code
			break
		} else {
			offset += 1
		}
	}

	// Calculate duration from SCR
	let duration = 0
	if (firstScr >= 0 && lastScr >= 0 && lastScr > firstScr) {
		duration = (lastScr - firstScr) / 90000
	}

	const streams = Array.from(streamMap.values())

	return {
		info: {
			duration,
			streams,
			hasVideo: streams.some(s => s.isVideo),
			hasAudio: streams.some(s => s.isAudio),
			muxRate,
			isMpeg2,
		},
		packs,
		videoFrames,
		audioFrames,
	}
}

/**
 * Find next start code
 */
function findStartCode(data: Uint8Array, offset: number): number {
	for (let i = offset; i < data.length - 3; i++) {
		if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x01) {
			return i
		}
	}
	return -1
}

/**
 * Read 32-bit start code
 */
function readStartCode(data: Uint8Array, offset: number): number {
	return (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
}

/**
 * Parse pack header
 */
function parsePackHeader(
	data: Uint8Array,
	offset: number
): { header: PsPackHeader; nextOffset: number; mpeg2: boolean } | null {
	if (offset + 12 > data.length) return null

	const byte4 = data[offset + 4]!

	// Detect MPEG version
	const isMpeg2 = (byte4 & 0xc0) === 0x40

	if (isMpeg2) {
		// MPEG-2 pack header (14 bytes minimum)
		if (offset + 14 > data.length) return null

		// SCR: 33-bit base + 9-bit extension
		const scrBase =
			((byte4 & 0x38) << 27) |
			((byte4 & 0x03) << 28) |
			(data[offset + 5]! << 20) |
			((data[offset + 6]! & 0xf8) << 12) |
			((data[offset + 6]! & 0x03) << 13) |
			(data[offset + 7]! << 5) |
			((data[offset + 8]! & 0xf8) >> 3)

		const scrExt = ((data[offset + 8]! & 0x03) << 7) | (data[offset + 9]! >> 1)

		const muxRate =
			(data[offset + 10]! << 14) | (data[offset + 11]! << 6) | ((data[offset + 12]! & 0xfc) >> 2)

		const stuffingLength = data[offset + 13]! & 0x07

		return {
			header: {
				scr: scrBase,
				scrExtension: scrExt,
				muxRate: muxRate * 50, // Convert to bytes/second
				stuffingLength,
			},
			nextOffset: offset + 14 + stuffingLength,
			mpeg2: true,
		}
	} else {
		// MPEG-1 pack header (12 bytes)
		const scrBase =
			((byte4 & 0x0e) << 29) |
			(data[offset + 5]! << 22) |
			((data[offset + 6]! & 0xfe) << 14) |
			(data[offset + 7]! << 7) |
			((data[offset + 8]! & 0xfe) >> 1)

		const muxRate =
			((data[offset + 9]! & 0x7f) << 15) | (data[offset + 10]! << 7) | ((data[offset + 11]! & 0xfe) >> 1)

		return {
			header: {
				scr: scrBase,
				scrExtension: 0,
				muxRate: muxRate * 50,
				stuffingLength: 0,
			},
			nextOffset: offset + 12,
			mpeg2: false,
		}
	}
}

/**
 * Parse system header
 */
function parseSystemHeader(
	data: Uint8Array,
	offset: number
): { header: PsSystemHeader; nextOffset: number } | null {
	if (offset + 12 > data.length) return null

	const headerLength = (data[offset + 4]! << 8) | data[offset + 5]!

	if (offset + 6 + headerLength > data.length) return null

	const rateBound =
		((data[offset + 6]! & 0x7f) << 15) | (data[offset + 7]! << 7) | ((data[offset + 8]! & 0xfe) >> 1)

	const byte9 = data[offset + 9]!
	const audioBound = (byte9 >> 2) & 0x3f
	const fixedFlag = (byte9 & 0x02) !== 0
	const cspsFlag = (byte9 & 0x01) !== 0

	const byte10 = data[offset + 10]!
	const systemAudioLockFlag = (byte10 & 0x80) !== 0
	const systemVideoLockFlag = (byte10 & 0x40) !== 0
	const videoBound = byte10 & 0x1f

	const byte11 = data[offset + 11]!
	const packetRateRestriction = (byte11 & 0x80) !== 0

	// Parse stream entries
	const streams: PsSystemHeaderStream[] = []
	let pos = offset + 12

	while (pos < offset + 6 + headerLength - 2) {
		if (data[pos]! & 0x80) {
			// Stream info (3 bytes)
			const streamId = data[pos]!
			const byte1 = data[pos + 1]!
			const byte2 = data[pos + 2]!

			streams.push({
				streamId,
				bufferBoundScale: (byte1 & 0x20) !== 0,
				bufferSizeBound: ((byte1 & 0x1f) << 8) | byte2,
			})

			pos += 3
		} else {
			break
		}
	}

	return {
		header: {
			rateBound: rateBound * 50,
			audioBound,
			fixedFlag,
			cspsFlag,
			systemAudioLockFlag,
			systemVideoLockFlag,
			videoBound,
			packetRateRestriction,
			streams,
		},
		nextOffset: offset + 6 + headerLength,
	}
}

/**
 * Parse PES packet
 */
function parsePesPacket(
	data: Uint8Array,
	offset: number,
	isMpeg2: boolean
): { packet: PsPesPacket; nextOffset: number } | null {
	if (offset + 6 > data.length) return null

	const streamId = data[offset + 3]!
	const packetLength = (data[offset + 4]! << 8) | data[offset + 5]!

	// Skip padding and navigation streams
	if (streamId === 0xbe || streamId === 0xbf) {
		return {
			packet: {
				header: {
					streamId,
					packetLength,
					scramblingControl: 0,
					priority: false,
					dataAlignment: false,
					copyright: false,
					original: false,
					ptsFlag: false,
					dtsFlag: false,
					headerLength: 6,
				},
				data: new Uint8Array(0),
			},
			nextOffset: offset + 6 + packetLength,
		}
	}

	// Check if this is a PES packet with optional header
	if (streamId < 0xbc) {
		return null
	}

	let headerLength = 6
	let pts: number | undefined
	let dts: number | undefined
	let ptsFlag = false
	let dtsFlag = false
	let scramblingControl = 0
	let priority = false
	let dataAlignment = false
	let copyright = false
	let original = false

	if (isMpeg2 && offset + 9 <= data.length) {
		const byte6 = data[offset + 6]!
		const byte7 = data[offset + 7]!
		const pesHeaderDataLength = data[offset + 8]!

		scramblingControl = (byte6 >> 4) & 0x03
		priority = (byte6 & 0x08) !== 0
		dataAlignment = (byte6 & 0x04) !== 0
		copyright = (byte6 & 0x02) !== 0
		original = (byte6 & 0x01) !== 0
		ptsFlag = (byte7 & 0x80) !== 0
		dtsFlag = (byte7 & 0x40) !== 0

		headerLength = 9 + pesHeaderDataLength

		let pos = offset + 9

		// Parse PTS if present
		if (ptsFlag && pos + 5 <= data.length) {
			pts = parseTimestamp(data, pos)
			pos += 5
		}

		// Parse DTS if present
		if (dtsFlag && pos + 5 <= data.length) {
			dts = parseTimestamp(data, pos)
			pos += 5
		}
	} else if (!isMpeg2) {
		// MPEG-1: skip stuffing bytes
		let pos = offset + 6
		while (pos < data.length && data[pos] === 0xff) {
			pos++
			headerLength++
		}

		if (pos < data.length) {
			const marker = data[pos]!
			if ((marker & 0xc0) === 0x40) {
				// STD buffer info
				pos += 2
				headerLength += 2
			}

			if (pos < data.length) {
				const ptsMarker = data[pos]!
				if ((ptsMarker & 0xf0) === 0x20) {
					ptsFlag = true
					pts = parseTimestamp(data, pos)
					pos += 5
					headerLength += 5
				} else if ((ptsMarker & 0xf0) === 0x30) {
					ptsFlag = true
					dtsFlag = true
					pts = parseTimestamp(data, pos)
					pos += 5
					dts = parseTimestamp(data, pos)
					pos += 5
					headerLength += 10
				} else if (ptsMarker === 0x0f) {
					pos++
					headerLength++
				}
			}
		}
	}

	// Extract payload
	const dataStart = offset + headerLength
	const dataEnd = offset + 6 + packetLength
	const payload = dataEnd <= data.length ? data.slice(dataStart, dataEnd) : new Uint8Array(0)

	return {
		packet: {
			header: {
				streamId,
				packetLength,
				scramblingControl,
				priority,
				dataAlignment,
				copyright,
				original,
				ptsFlag,
				dtsFlag,
				pts,
				dts,
				headerLength,
			},
			data: payload,
		},
		nextOffset: offset + 6 + packetLength,
	}
}

/**
 * Parse 33-bit timestamp
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
 * Check if stream ID is video
 */
function isVideoStream(streamId: number): boolean {
	return streamId >= 0xe0 && streamId <= 0xef
}

/**
 * Check if stream ID is audio
 */
function isAudioStream(streamId: number): boolean {
	return (streamId >= 0xc0 && streamId <= 0xdf) || streamId === 0xbd
}

/**
 * Guess stream type from stream ID
 */
function guessStreamType(streamId: number): number {
	if (streamId >= 0xe0 && streamId <= 0xef) {
		return 0x02 // MPEG-2 video
	}
	if (streamId >= 0xc0 && streamId <= 0xdf) {
		return 0x04 // MPEG-2 audio
	}
	if (streamId === 0xbd) {
		return 0x81 // AC3 (common for private stream 1)
	}
	return 0x06 // Private
}
