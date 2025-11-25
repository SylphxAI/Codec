/**
 * MPEG-1/2 (Program Stream) decoder
 * Parses MPEG PS container and extracts video frames
 */

import type { VideoData, VideoFrame } from '@sylphx/codec-core'
import {
	MpegStartCode,
	MpegVersion,
	PictureCodingType,
	type MpegDecodeResult,
	type MpegGopHeader,
	type MpegInfo,
	type MpegPackHeader,
	type MpegPesHeader,
	type MpegPictureHeader,
	type MpegSequenceHeader,
	type MpegSystemHeader,
	type MpegVideoFrame,
	type MpegAudioFrame,
} from './types'

/**
 * Check if data is MPEG-1/2 Program Stream
 */
export function isMpeg(data: Uint8Array): boolean {
	if (data.length < 4) return false

	// Check for pack start code (MPEG-2) or sequence header (MPEG-1)
	const startCode = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!

	// MPEG-2 PS starts with pack header
	if (startCode === MpegStartCode.PACK) return true

	// MPEG-1 may start with sequence header (0x000001B3)
	if (startCode === 0x000001b3) return true

	return false
}

/**
 * Parse MPEG info without full decode
 */
export function parseMpegInfo(data: Uint8Array): MpegInfo {
	const result = decodeMpeg(data)
	return result.info
}

/**
 * Decode MPEG to internal structure
 */
export function decodeMpeg(data: Uint8Array): MpegDecodeResult {
	if (!isMpeg(data)) {
		throw new Error('Invalid MPEG: missing start code')
	}

	let offset = 0
	const videoFrames: MpegVideoFrame[] = []
	const audioFrames: MpegAudioFrame[] = []
	const videoStreams = new Set<number>()
	const audioStreams = new Set<number>()

	let version = MpegVersion.MPEG1
	let sequenceHeader: MpegSequenceHeader | undefined
	let currentGop: MpegGopHeader | undefined
	let firstScr: number | undefined
	let lastScr: number | undefined

	// PES assembly buffers
	const pesBuffers = new Map<number, Uint8Array[]>()
	const pesHeaders = new Map<number, MpegPesHeader>()

	while (offset < data.length - 4) {
		const startCode = readStartCode(data, offset)
		if (startCode === null) {
			offset++
			continue
		}

		switch (startCode) {
			case MpegStartCode.PACK: {
				const packHeader = parsePackHeader(data, offset)
				if (packHeader) {
					version = packHeader.version
					if (firstScr === undefined) {
						firstScr = packHeader.systemClockReference
					}
					lastScr = packHeader.systemClockReference
					offset += getPackHeaderSize(packHeader.version)
				} else {
					offset += 4
				}
				break
			}

			case MpegStartCode.SYSTEM: {
				if (offset + 6 <= data.length) {
					const headerLength = (data[offset + 4]! << 8) | data[offset + 5]!
					offset += 6 + headerLength // 4 bytes start code + 2 bytes length + header data
				} else {
					offset += 4
				}
				break
			}

			case MpegStartCode.PROGRAM_END:
				offset = data.length
				break

			case MpegStartCode.PADDING:
				offset += 4
				const paddingLength = (data[offset]! << 8) | data[offset + 1]!
				offset += 2 + paddingLength
				break

			default: {
				// Check for video stream PES packet
				if (startCode >= MpegStartCode.VIDEO_MIN && startCode <= MpegStartCode.VIDEO_MAX) {
					const streamId = startCode & 0xff
					videoStreams.add(streamId)
					const pesResult = parsePesPacket(data, offset, pesBuffers, pesHeaders, videoFrames, true, sequenceHeader)
					offset = pesResult.nextOffset

					// Check if PES payload contains sequence header
					if (pesResult.payload && !sequenceHeader) {
						const seqHeader = parseSequenceHeaderInPayload(pesResult.payload)
						if (seqHeader) {
							sequenceHeader = seqHeader
						}
					}
					break
				}

				// Check for audio stream PES packet
				if (startCode >= MpegStartCode.AUDIO_MIN && startCode <= MpegStartCode.AUDIO_MAX) {
					const streamId = startCode & 0xff
					audioStreams.add(streamId)
					const pesResult = parsePesPacket(data, offset, pesBuffers, pesHeaders, audioFrames, false, undefined)
					offset = pesResult.nextOffset
					break
				}

				// Unknown start code, skip
				offset += 4
			}
		}
	}

	// Flush remaining buffers
	for (const [streamId, buffer] of pesBuffers.entries()) {
		if (buffer.length === 0) continue

		const pesData = concatBuffers(buffer)
		const header = pesHeaders.get(streamId)
		if (!header) continue

		const frameData = pesData.slice(header.headerLength)
		if (frameData.length === 0) continue

		if (streamId >= 0xe0 && streamId <= 0xef) {
			// Video stream
			const pictureHeader = findPictureHeaderInFrame(frameData)
			videoFrames.push({
				data: frameData,
				pts: header.pts || 0,
				dts: header.dts,
				type: pictureHeader?.pictureCodingType || PictureCodingType.I_FRAME,
				temporalReference: pictureHeader?.temporalReference || 0,
			})
		} else if (streamId >= 0xc0 && streamId <= 0xdf) {
			// Audio stream
			audioFrames.push({
				data: frameData,
				pts: header.pts || 0,
			})
		}
	}

	// Calculate duration
	let duration = 0
	if (firstScr !== undefined && lastScr !== undefined && lastScr > firstScr) {
		duration = ((lastScr - firstScr) / 90) // Convert 90kHz to milliseconds
	} else if (videoFrames.length > 0 && sequenceHeader) {
		duration = (videoFrames.length * 1000) / sequenceHeader.frameRate
	}

	const info: MpegInfo = {
		version,
		duration,
		hasVideo: videoStreams.size > 0,
		hasAudio: audioStreams.size > 0,
		width: sequenceHeader?.width || 0,
		height: sequenceHeader?.height || 0,
		fps: sequenceHeader?.frameRate || 0,
		bitRate: sequenceHeader?.bitRate || 0,
		videoStreams: Array.from(videoStreams),
		audioStreams: Array.from(audioStreams),
	}

	return {
		info,
		videoFrames,
		audioFrames,
	}
}

/**
 * Decode MPEG to VideoData (stub - actual frame decoding requires codec implementation)
 */
export function decodeMpegToVideo(data: Uint8Array): VideoData {
	const result = decodeMpeg(data)

	if (!result.info.hasVideo) {
		throw new Error('MPEG file contains no video stream')
	}

	// Note: This is a simplified implementation
	// Actual MPEG video decoding requires implementing the full MPEG-1/2 video codec
	// For now, we return placeholder data
	const frames: VideoFrame[] = result.videoFrames.map((frame, index) => ({
		image: {
			width: result.info.width,
			height: result.info.height,
			data: new Uint8Array(result.info.width * result.info.height * 4), // Placeholder RGBA data
		},
		timestamp: frame.pts / 90, // Convert 90kHz to milliseconds
		duration: 1000 / result.info.fps,
	}))

	return {
		width: result.info.width,
		height: result.info.height,
		frames,
		duration: result.info.duration,
		fps: result.info.fps,
	}
}

/**
 * Read 32-bit start code
 */
function readStartCode(data: Uint8Array, offset: number): number | null {
	if (offset + 4 > data.length) return null

	// Check for 0x000001 prefix
	if (data[offset] !== 0x00 || data[offset + 1] !== 0x00 || data[offset + 2] !== 0x01) {
		return null
	}

	return (data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
}

/**
 * Parse pack header (MPEG-1 or MPEG-2)
 */
function parsePackHeader(data: Uint8Array, offset: number): MpegPackHeader | null {
	if (offset + 12 > data.length) return null

	const byte4 = data[offset + 4]!

	// Check for MPEG-2 (bit pattern: 01xxxxxx)
	if ((byte4 & 0xc0) === 0x40) {
		// MPEG-2 pack header
		const scrBase =
			((byte4 & 0x38) << 27) |
			((byte4 & 0x03) << 28) |
			(data[offset + 5]! << 20) |
			((data[offset + 6]! & 0xf8) << 12) |
			((data[offset + 6]! & 0x03) << 13) |
			(data[offset + 7]! << 5) |
			((data[offset + 8]! & 0xf8) >> 3)

		const scrExt = ((data[offset + 8]! & 0x03) << 7) | ((data[offset + 9]! & 0xfe) >> 1)
		const scr = scrBase * 300 + scrExt

		const programMuxRate =
			(data[offset + 10]! << 14) | (data[offset + 11]! << 6) | ((data[offset + 12]! & 0xfc) >> 2)

		return {
			version: MpegVersion.MPEG2,
			systemClockReference: scr,
			programMuxRate,
		}
	}

	// MPEG-1 pack header (bit pattern: 0010xxxx)
	if ((byte4 & 0xf0) === 0x20) {
		const scr =
			((byte4 & 0x0e) << 29) |
			(data[offset + 5]! << 22) |
			((data[offset + 6]! & 0xfe) << 14) |
			(data[offset + 7]! << 7) |
			((data[offset + 8]! & 0xfe) >> 1)

		const muxRate =
			((data[offset + 9]! & 0x7f) << 15) | (data[offset + 10]! << 7) | ((data[offset + 11]! & 0xfe) >> 1)

		return {
			version: MpegVersion.MPEG1,
			systemClockReference: scr,
			programMuxRate: muxRate,
		}
	}

	return null
}

/**
 * Get pack header size based on version
 */
function getPackHeaderSize(version: MpegVersion): number {
	if (version === MpegVersion.MPEG2) {
		return 14 // Minimum MPEG-2 pack header size
	}
	return 12 // MPEG-1 pack header size
}

/**
 * Parse system header
 */
function parseSystemHeader(data: Uint8Array, offset: number): MpegSystemHeader | null {
	if (offset + 12 > data.length) return null

	const headerLength = (data[offset + 4]! << 8) | data[offset + 5]!
	if (offset + 6 + headerLength > data.length) return null

	const rateBound = ((data[offset + 6]! & 0x7f) << 15) | (data[offset + 7]! << 7) | ((data[offset + 8]! & 0xfe) >> 1)

	const byte9 = data[offset + 9]!
	const audioBound = byte9 >> 2
	const fixedFlag = (byte9 & 0x02) !== 0
	const cspsFlag = (byte9 & 0x01) !== 0

	const byte10 = data[offset + 10]!
	const systemAudioLockFlag = (byte10 & 0x80) !== 0
	const systemVideoLockFlag = (byte10 & 0x40) !== 0
	const videoBound = byte10 & 0x1f

	return {
		rateBound,
		audioBound,
		videoBound,
		fixedFlag,
		cspsFlag,
		systemAudioLockFlag,
		systemVideoLockFlag,
		streams: [],
	}
}

/**
 * Parse PES packet
 */
function parsePesPacket(
	data: Uint8Array,
	offset: number,
	buffers: Map<number, Uint8Array[]>,
	headers: Map<number, MpegPesHeader>,
	frames: any[],
	isVideo: boolean,
	sequenceHeader: MpegSequenceHeader | undefined
): { nextOffset: number; payload?: Uint8Array } {
	if (offset + 6 > data.length) {
		return { nextOffset: offset + 1 }
	}

	const streamId = data[offset + 3]!
	const packetLength = (data[offset + 4]! << 8) | data[offset + 5]!

	// Parse PES header
	const header = parsePesHeader(data, offset)
	if (!header) {
		return { nextOffset: offset + 6 + packetLength }
	}

	// Store header
	if (!headers.has(streamId)) {
		headers.set(streamId, header)
	}

	// Extract payload
	const payloadStart = offset + header.headerLength
	const payloadEnd = offset + 6 + packetLength
	const payload = data.slice(payloadStart, Math.min(payloadEnd, data.length))

	// Get or create buffer for this stream
	let buffer = buffers.get(streamId)
	if (!buffer) {
		buffer = []
		buffers.set(streamId, buffer)
	}

	buffer.push(payload)

	// For video, try to extract complete frames
	if (isVideo && buffer.length > 0) {
		const frameData = concatBuffers(buffer)
		const pictureHeader = findPictureHeaderInFrame(frameData)

		// If we found a picture header, create a frame
		if (pictureHeader) {
			frames.push({
				data: frameData,
				pts: header.pts || 0,
				dts: header.dts,
				type: pictureHeader?.pictureCodingType || PictureCodingType.I_FRAME,
				temporalReference: pictureHeader?.temporalReference || 0,
			})

			buffers.set(streamId, [])
			headers.delete(streamId)
		}
	}

	return { nextOffset: offset + 6 + packetLength, payload }
}

/**
 * Parse PES header
 */
function parsePesHeader(data: Uint8Array, offset: number): MpegPesHeader | null {
	if (offset + 9 > data.length) return null

	const streamId = data[offset + 3]!
	const packetLength = (data[offset + 4]! << 8) | data[offset + 5]!

	// Check for MPEG-2 PES header (10xxxxxx pattern)
	const byte6 = data[offset + 6]!
	if ((byte6 & 0xc0) === 0x80) {
		// MPEG-2 PES header
		const byte7 = data[offset + 7]!
		const headerDataLength = data[offset + 8]!

		const header: MpegPesHeader = {
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

		let pos = offset + 9

		// Parse PTS
		if (header.ptsFlag && pos + 5 <= data.length) {
			header.pts = parseTimestamp(data, pos)
			pos += 5
		}

		// Parse DTS
		if (header.dtsFlag && pos + 5 <= data.length) {
			header.dts = parseTimestamp(data, pos)
		}

		return header
	}

	// MPEG-1 PES header (simpler format)
	return {
		streamId,
		packetLength,
		headerLength: 6,
	}
}

/**
 * Parse 33-bit timestamp (PTS/DTS)
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
 * Parse sequence header (video metadata)
 */
function parseSequenceHeader(data: Uint8Array, offset: number): MpegSequenceHeader | null {
	if (offset + 12 > data.length) return null

	const width = (data[offset + 4]! << 4) | ((data[offset + 5]! & 0xf0) >> 4)
	const height = ((data[offset + 5]! & 0x0f) << 8) | data[offset + 6]!

	const byte7 = data[offset + 7]!
	const aspectRatioCode = byte7 >> 4
	const frameRateCode = byte7 & 0x0f

	const bitRate =
		(data[offset + 8]! << 10) | (data[offset + 9]! << 2) | ((data[offset + 10]! & 0xc0) >> 6)

	const vbvBufferSize = ((data[offset + 10]! & 0x1f) << 5) | ((data[offset + 11]! & 0xf8) >> 3)
	const constrainedParametersFlag = (data[offset + 11]! & 0x04) !== 0

	// Frame rate lookup table
	const frameRates = [0, 23.976, 24, 25, 29.97, 30, 50, 59.94, 60]
	const frameRate = frameRates[frameRateCode] || 30

	// Aspect ratio lookup table
	const aspectRatios = [0, 1, 0.6735, 0.7031, 0.7615, 0.8055, 0.8437, 0.8935, 0.9375, 0.9815, 1.0255, 1.0695, 1.0950, 1.1575, 1.2015]
	const aspectRatio = aspectRatios[aspectRatioCode] || 1

	return {
		width,
		height,
		aspectRatio,
		frameRate,
		bitRate: bitRate * 400, // In bits per second
		vbvBufferSize: vbvBufferSize * 16 * 1024, // In bits
		constrainedParametersFlag,
	}
}

/**
 * Parse GOP header
 */
function parseGopHeader(data: Uint8Array, offset: number): MpegGopHeader | null {
	if (offset + 8 > data.length) return null

	const byte4 = data[offset + 4]!
	const byte5 = data[offset + 5]!
	const byte6 = data[offset + 6]!
	const byte7 = data[offset + 7]!

	const hours = (byte4 & 0x7c) >> 2
	const minutes = ((byte4 & 0x03) << 4) | ((byte5 & 0xf0) >> 4)
	const seconds = ((byte5 & 0x07) << 3) | ((byte6 & 0xe0) >> 5)
	const pictures = ((byte6 & 0x1f) << 1) | ((byte7 & 0x80) >> 7)

	const closedGop = (byte7 & 0x40) !== 0
	const brokenLink = (byte7 & 0x20) !== 0

	return {
		timeCode: hours * 3600 + minutes * 60 + seconds,
		closedGop,
		brokenLink,
		hours,
		minutes,
		seconds,
		pictures,
	}
}

/**
 * Find picture header in frame data
 */
function findPictureHeaderInFrame(data: Uint8Array): MpegPictureHeader | null {
	for (let i = 0; i < data.length - 8; i++) {
		if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x01 && data[i + 3] === 0x00) {
			const byte4 = data[i + 4]!
			const byte5 = data[i + 5]!

			const temporalReference = (byte4 << 2) | ((byte5 & 0xc0) >> 6)
			const pictureCodingType = (byte5 & 0x38) >> 3
			const vbvDelay = ((byte5 & 0x07) << 13) | (data[i + 6]! << 5) | ((data[i + 7]! & 0xf8) >> 3)

			return {
				temporalReference,
				pictureCodingType,
				vbvDelay,
			}
		}
	}
	return null
}

/**
 * Find next picture start code in data
 */
function findNextPictureStart(data: Uint8Array): boolean {
	for (let i = 4; i < data.length - 4; i++) {
		if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x01 && data[i + 3] === 0x00) {
			return true
		}
	}
	return false
}

/**
 * Parse sequence header from PES payload
 */
function parseSequenceHeaderInPayload(data: Uint8Array): MpegSequenceHeader | null {
	// Look for sequence header start code (0x000001B3)
	for (let i = 0; i <= data.length - 12; i++) {
		if (data[i] === 0x00 && data[i + 1] === 0x00 && data[i + 2] === 0x01 && data[i + 3] === 0xb3) {
			return parseSequenceHeader(data, i)
		}
	}
	return null
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
