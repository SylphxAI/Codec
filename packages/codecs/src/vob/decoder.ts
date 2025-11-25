/**
 * VOB (DVD Video) decoder
 * Parses MPEG-2 PS with DVD navigation and subtitle streams
 */

import type { VideoData, VideoFrame } from '@sylphx/codec-core'
import {
	VobStartCode,
	VobVersion,
	PictureCodingType,
	DvdAudioFormat,
	type VobDecodeResult,
	type VobInfo,
	type VobPackHeader,
	type VobPesHeader,
	type VobSequenceHeader,
	type VobGopHeader,
	type VobPictureHeader,
	type VobVideoFrame,
	type VobAudioFrame,
	type VobSubtitleFrame,
	type VobNavigationPack,
	type VobAudioStreamInfo,
} from './types'

/**
 * Check if data is VOB (DVD Video)
 */
export function isVob(data: Uint8Array): boolean {
	if (data.length < 4) return false

	// VOB files start with pack header (0x000001BA)
	const startCode = (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!

	// VOB is MPEG-2 PS, must start with pack header
	if (startCode === VobStartCode.PACK) {
		// Verify MPEG-2 format (not MPEG-1)
		if (data.length >= 5) {
			const byte4 = data[4]!
			// MPEG-2 pack header has '01' marker bits
			return (byte4 & 0xc0) === 0x40
		}
	}

	return false
}

/**
 * Parse VOB info without full decode
 */
export function parseVobInfo(data: Uint8Array): VobInfo {
	const result = decodeVob(data)
	return result.info
}

/**
 * Decode VOB to internal structure
 */
export function decodeVob(data: Uint8Array): VobDecodeResult {
	if (!isVob(data)) {
		throw new Error('Invalid VOB: missing MPEG-2 PS pack header')
	}

	let offset = 0
	const videoFrames: VobVideoFrame[] = []
	const audioFrames: VobAudioFrame[] = []
	const subtitleFrames: VobSubtitleFrame[] = []
	const navigationPacks: VobNavigationPack[] = []
	const videoStreams = new Set<number>()
	const audioStreams = new Map<number, DvdAudioFormat>()
	const subtitleStreams = new Set<number>()

	let sequenceHeader: VobSequenceHeader | undefined
	let firstScr: number | undefined
	let lastScr: number | undefined
	let hasNavigation = false

	// PES assembly buffers
	const pesBuffers = new Map<number, Uint8Array[]>()
	const pesHeaders = new Map<number, VobPesHeader>()

	while (offset < data.length - 4) {
		const startCode = readStartCode(data, offset)
		if (startCode === null) {
			offset++
			continue
		}

		switch (startCode) {
			case VobStartCode.PACK: {
				const packHeader = parsePackHeader(data, offset)
				if (packHeader) {
					if (firstScr === undefined) {
						firstScr = packHeader.systemClockReference
					}
					lastScr = packHeader.systemClockReference
					offset += 14 + packHeader.stuffingLength
				} else {
					offset += 4
				}
				break
			}

			case VobStartCode.SYSTEM: {
				if (offset + 6 <= data.length) {
					const headerLength = (data[offset + 4]! << 8) | data[offset + 5]!
					offset += 6 + headerLength
				} else {
					offset += 4
				}
				break
			}

			case VobStartCode.PROGRAM_END:
				offset = data.length
				break

			case VobStartCode.PADDING:
				offset += 4
				if (offset + 2 <= data.length) {
					const paddingLength = (data[offset]! << 8) | data[offset + 1]!
					offset += 2 + paddingLength
				}
				break

			case VobStartCode.PRIVATE_STREAM_1: {
				// AC3, DTS, LPCM, or subpicture
				const pesResult = parsePesPacket(
					data,
					offset,
					pesBuffers,
					pesHeaders,
					videoFrames,
					audioFrames,
					subtitleFrames,
					false,
					sequenceHeader
				)
				offset = pesResult.nextOffset

				// Detect substream type
				if (pesResult.payload && pesResult.payload.length > 0) {
					const subId = pesResult.payload[0]!
					if (subId >= 0x80 && subId <= 0x87) {
						// AC3 audio
						audioStreams.set(subId, DvdAudioFormat.AC3)
					} else if (subId >= 0x88 && subId <= 0x8f) {
						// DTS audio
						audioStreams.set(subId, DvdAudioFormat.DTS)
					} else if (subId >= 0xa0 && subId <= 0xa7) {
						// LPCM audio
						audioStreams.set(subId, DvdAudioFormat.LPCM)
					} else if (subId >= 0x20 && subId <= 0x3f) {
						// Subpicture (subtitle)
						subtitleStreams.add(subId)
					}
				}
				break
			}

			case VobStartCode.PRIVATE_STREAM_2: {
				// Navigation pack (PCI/DSI)
				hasNavigation = true
				if (offset + 6 <= data.length) {
					const packetLength = (data[offset + 4]! << 8) | data[offset + 5]!
					const navData = data.slice(offset + 6, offset + 6 + packetLength)
					const navPack = parseNavigationPack(navData)
					if (navPack) {
						navigationPacks.push(navPack)
					}
					offset += 6 + packetLength
				} else {
					offset += 4
				}
				break
			}

			default: {
				// Check for video stream PES packet
				if (startCode >= VobStartCode.VIDEO_MIN && startCode <= VobStartCode.VIDEO_MAX) {
					const streamId = startCode & 0xff
					videoStreams.add(streamId)
					const pesResult = parsePesPacket(
						data,
						offset,
						pesBuffers,
						pesHeaders,
						videoFrames,
						audioFrames,
						subtitleFrames,
						true,
						sequenceHeader
					)
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

				// Check for MPEG audio stream PES packet
				if (startCode >= VobStartCode.AUDIO_MIN && startCode <= VobStartCode.AUDIO_MAX) {
					const streamId = startCode & 0xff
					audioStreams.set(streamId, DvdAudioFormat.MPEG)
					const pesResult = parsePesPacket(
						data,
						offset,
						pesBuffers,
						pesHeaders,
						videoFrames,
						audioFrames,
						subtitleFrames,
						false,
						undefined
					)
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
			// MPEG audio stream
			audioFrames.push({
				data: frameData,
				pts: header.pts || 0,
				streamId,
				format: DvdAudioFormat.MPEG,
			})
		}
	}

	// Calculate duration
	let duration = 0
	if (firstScr !== undefined && lastScr !== undefined && lastScr > firstScr) {
		duration = (lastScr - firstScr) / 90 // Convert 90kHz to milliseconds
	} else if (videoFrames.length > 0 && sequenceHeader) {
		duration = (videoFrames.length * 1000) / sequenceHeader.frameRate
	}

	const audioStreamInfo: VobAudioStreamInfo[] = Array.from(audioStreams.entries()).map(
		([streamId, format]) => ({
			streamId,
			format,
		})
	)

	const info: VobInfo = {
		version: VobVersion.MPEG2_PS,
		duration,
		hasVideo: videoStreams.size > 0,
		hasAudio: audioStreams.size > 0,
		hasSubtitles: subtitleStreams.size > 0,
		hasNavigation,
		width: sequenceHeader?.width || 0,
		height: sequenceHeader?.height || 0,
		fps: sequenceHeader?.frameRate || 0,
		bitRate: sequenceHeader?.bitRate || 0,
		videoStreams: Array.from(videoStreams),
		audioStreams: audioStreamInfo,
		subtitleStreams: Array.from(subtitleStreams),
	}

	return {
		info,
		videoFrames,
		audioFrames,
		subtitleFrames,
		navigationPacks,
	}
}

/**
 * Decode VOB to VideoData (stub - actual frame decoding requires codec implementation)
 */
export function decodeVobToVideo(data: Uint8Array): VideoData {
	const result = decodeVob(data)

	if (!result.info.hasVideo) {
		throw new Error('VOB file contains no video stream')
	}

	// Note: This is a simplified implementation
	// Actual MPEG-2 video decoding requires implementing the full codec
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
 * Parse MPEG-2 pack header
 */
function parsePackHeader(data: Uint8Array, offset: number): VobPackHeader | null {
	if (offset + 14 > data.length) return null

	const byte4 = data[offset + 4]!

	// Check for MPEG-2 (bit pattern: 01xxxxxx)
	if ((byte4 & 0xc0) !== 0x40) return null

	// Parse SCR (System Clock Reference)
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

	const programMuxRate = (data[offset + 10]! << 14) | (data[offset + 11]! << 6) | ((data[offset + 12]! & 0xfc) >> 2)

	const stuffingLength = data[offset + 13]! & 0x07

	return {
		version: VobVersion.MPEG2_PS,
		systemClockReference: scr,
		programMuxRate,
		stuffingLength,
	}
}

/**
 * Parse PES packet
 */
function parsePesPacket(
	data: Uint8Array,
	offset: number,
	buffers: Map<number, Uint8Array[]>,
	headers: Map<number, VobPesHeader>,
	videoFrames: VobVideoFrame[],
	audioFrames: VobAudioFrame[],
	subtitleFrames: VobSubtitleFrame[],
	isVideo: boolean,
	sequenceHeader: VobSequenceHeader | undefined
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

		if (pictureHeader) {
			videoFrames.push({
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
function parsePesHeader(data: Uint8Array, offset: number): VobPesHeader | null {
	if (offset + 9 > data.length) return null

	const streamId = data[offset + 3]!
	const packetLength = (data[offset + 4]! << 8) | data[offset + 5]!

	// MPEG-2 PES header (10xxxxxx pattern)
	const byte6 = data[offset + 6]!
	if ((byte6 & 0xc0) !== 0x80) return null

	const byte7 = data[offset + 7]!
	const headerDataLength = data[offset + 8]!

	const header: VobPesHeader = {
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

/**
 * Parse 33-bit timestamp (PTS/DTS)
 */
function parseTimestamp(data: Uint8Array, offset: number): number {
	const byte0 = data[offset]!
	const byte1 = data[offset + 1]!
	const byte2 = data[offset + 2]!
	const byte3 = data[offset + 3]!
	const byte4 = data[offset + 4]!

	return ((byte0 & 0x0e) << 29) | (byte1 << 22) | ((byte2 & 0xfe) << 14) | (byte3 << 7) | ((byte4 & 0xfe) >> 1)
}

/**
 * Parse navigation pack (PCI/DSI)
 */
function parseNavigationPack(data: Uint8Array): VobNavigationPack | null {
	if (data.length < 1024) return null

	// PCI starts at offset 0 (980 bytes)
	// DSI starts at offset 980 (1024 bytes)
	const pci = parsePCI(data.slice(0, 980))
	const dsi = parseDSI(data.slice(980, 1024))

	if (!pci || !dsi) return null

	return { pci, dsi }
}

/**
 * Parse PCI (Presentation Control Information)
 */
function parsePCI(data: Uint8Array): any {
	if (data.length < 24) return null

	return {
		nv_pck_lbn: (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!,
		vobu_cat: (data[4]! << 8) | data[5]!,
		vobu_s_ptm: (data[8]! << 24) | (data[9]! << 16) | (data[10]! << 8) | data[11]!,
		vobu_e_ptm: (data[12]! << 24) | (data[13]! << 16) | (data[14]! << 8) | data[15]!,
		vobu_se_e_ptm: (data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!,
	}
}

/**
 * Parse DSI (Data Search Information)
 */
function parseDSI(data: Uint8Array): any {
	if (data.length < 44) return null

	return {
		dsi_gi: {
			nv_pck_scr: (data[0]! << 24) | (data[1]! << 16) | (data[2]! << 8) | data[3]!,
			nv_pck_lbn: (data[4]! << 24) | (data[5]! << 16) | (data[6]! << 8) | data[7]!,
			vobu_ea: (data[8]! << 24) | (data[9]! << 16) | (data[10]! << 8) | data[11]!,
			vobu_1stref_ea: (data[12]! << 24) | (data[13]! << 16) | (data[14]! << 8) | data[15]!,
			vobu_2ndref_ea: (data[16]! << 24) | (data[17]! << 16) | (data[18]! << 8) | data[19]!,
			vobu_3rdref_ea: (data[20]! << 24) | (data[21]! << 16) | (data[22]! << 8) | data[23]!,
		},
	}
}

/**
 * Parse sequence header (video metadata)
 */
function parseSequenceHeader(data: Uint8Array, offset: number): VobSequenceHeader | null {
	if (offset + 12 > data.length) return null

	const width = (data[offset + 4]! << 4) | ((data[offset + 5]! & 0xf0) >> 4)
	const height = ((data[offset + 5]! & 0x0f) << 8) | data[offset + 6]!

	const byte7 = data[offset + 7]!
	const aspectRatioCode = byte7 >> 4
	const frameRateCode = byte7 & 0x0f

	const bitRate = (data[offset + 8]! << 10) | (data[offset + 9]! << 2) | ((data[offset + 10]! & 0xc0) >> 6)

	const vbvBufferSize = ((data[offset + 10]! & 0x1f) << 5) | ((data[offset + 11]! & 0xf8) >> 3)
	const constrainedParametersFlag = (data[offset + 11]! & 0x04) !== 0

	// Frame rate lookup table
	const frameRates = [0, 23.976, 24, 25, 29.97, 30, 50, 59.94, 60]
	const frameRate = frameRates[frameRateCode] || 30

	// Aspect ratio lookup table (DVD uses 4:3 or 16:9)
	const aspectRatios = [
		0, 1, 0.6735, 0.7031, 0.7615, 0.8055, 0.8437, 0.8935, 0.9375, 0.9815, 1.0255, 1.0695, 1.0950, 1.1575, 1.2015,
	]
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
 * Find picture header in frame data
 */
function findPictureHeaderInFrame(data: Uint8Array): VobPictureHeader | null {
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
 * Parse sequence header from PES payload
 */
function parseSequenceHeaderInPayload(data: Uint8Array): VobSequenceHeader | null {
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
