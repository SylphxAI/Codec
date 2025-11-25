/**
 * MP3 decoder
 * Decodes MPEG-1/2 Audio Layer III files
 */

import {
	BITRATE_TABLE,
	ChannelMode,
	Emphasis,
	MP3_SYNC_WORD,
	MpegLayer,
	MpegVersion,
	SAMPLE_RATE_TABLE,
	SAMPLES_PER_FRAME_TABLE,
	type ID3v2Frame,
	type ID3v2Header,
	type ID3v2Tag,
	type MP3DecodeResult,
	type MP3Frame,
	type MP3FrameHeader,
	type MP3Granule,
	type MP3Info,
	type MP3SideInfo,
} from './types'

/**
 * Check if data is an MP3 file
 */
export function isMp3(data: Uint8Array): boolean {
	if (data.length < 4) return false

	// Check for ID3v2 tag
	if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
		return true
	}

	// Check for frame sync (11 bits set to 1)
	// Extract top 11 bits from first 16 bits
	const word = (data[0]! << 8) | data[1]!
	const sync = word >> 5
	return sync === MP3_SYNC_WORD
}

/**
 * Parse ID3v2 tag
 */
export function parseID3v2(data: Uint8Array, offset: number = 0): ID3v2Tag | null {
	if (offset + 10 > data.length) return null
	if (data[offset] !== 0x49 || data[offset + 1] !== 0x44 || data[offset + 2] !== 0x33) {
		return null
	}

	const version = data[offset + 3]!
	const revision = data[offset + 4]!
	const flags = data[offset + 5]!

	// Parse synchsafe integer (7 bits per byte)
	const size =
		((data[offset + 6]! & 0x7f) << 21) |
		((data[offset + 7]! & 0x7f) << 14) |
		((data[offset + 8]! & 0x7f) << 7) |
		(data[offset + 9]! & 0x7f)

	const header: ID3v2Header = { version, revision, flags, size }

	// Parse frames
	const frames: ID3v2Frame[] = []
	const metadata = new Map<string, string>()
	let frameOffset = offset + 10

	const endOffset = offset + 10 + size

	while (frameOffset + 10 < endOffset) {
		// Read frame header
		const frameId = String.fromCharCode(
			data[frameOffset]!,
			data[frameOffset + 1]!,
			data[frameOffset + 2]!,
			data[frameOffset + 3]!
		)

		// Check for padding or end of frames
		if (frameId[0] === '\0' || frameId === '\0\0\0\0') break

		let frameSize: number
		if (version === 4) {
			// ID3v2.4 uses synchsafe integers
			frameSize =
				((data[frameOffset + 4]! & 0x7f) << 21) |
				((data[frameOffset + 5]! & 0x7f) << 14) |
				((data[frameOffset + 6]! & 0x7f) << 7) |
				(data[frameOffset + 7]! & 0x7f)
		} else {
			// ID3v2.3 uses regular integers
			frameSize =
				(data[frameOffset + 4]! << 24) |
				(data[frameOffset + 5]! << 16) |
				(data[frameOffset + 6]! << 8) |
				data[frameOffset + 7]!
		}

		if (frameSize === 0 || frameOffset + 10 + frameSize > endOffset) break

		const frameData = data.slice(frameOffset + 10, frameOffset + 10 + frameSize)
		frames.push({ id: frameId, data: frameData })

		// Parse common text frames
		if (frameId[0] === 'T' && frameData.length > 1) {
			const encoding = frameData[0]!
			let text: string
			if (encoding === 0 || encoding === 3) {
				// ISO-8859-1 or UTF-8
				text = decodeText(frameData.slice(1))
			} else {
				// UTF-16
				text = decodeText(frameData.slice(1))
			}
			metadata.set(frameId, text)
		}

		frameOffset += 10 + frameSize
	}

	return { header, frames, metadata }
}

/**
 * Find first MP3 frame sync
 */
export function findFrameSync(data: Uint8Array, offset: number = 0): number {
	for (let i = offset; i < data.length - 1; i++) {
		// Check for 11 bits of sync (all 1s)
		const word = (data[i]! << 8) | data[i + 1]!
		const sync = word >> 5
		if (sync === MP3_SYNC_WORD) {
			return i
		}
	}
	return -1
}

/**
 * Parse MP3 frame header
 */
export function parseFrameHeader(data: Uint8Array, offset: number): MP3FrameHeader | null {
	if (offset + 4 > data.length) return null

	// Check sync word (11 bits set to 1)
	const word = (data[offset]! << 8) | data[offset + 1]!
	const sync = word >> 5
	if (sync !== MP3_SYNC_WORD) return null

	const byte1 = data[offset + 1]!
	const byte2 = data[offset + 2]!
	const byte3 = data[offset + 3]!

	// Parse header fields
	const version = (byte1 >> 3) & 0x03
	const layer = (byte1 >> 1) & 0x03
	const protection = (byte1 & 0x01) === 1

	const bitrateIndex = (byte2 >> 4) & 0x0f
	const sampleRateIndex = (byte2 >> 2) & 0x03
	const padding = ((byte2 >> 1) & 0x01) === 1
	const privateBit = (byte2 & 0x01) === 1

	const channelMode = (byte3 >> 6) & 0x03
	const modeExtension = (byte3 >> 4) & 0x03
	const copyright = ((byte3 >> 3) & 0x01) === 1
	const original = ((byte3 >> 2) & 0x01) === 1
	const emphasis = byte3 & 0x03

	// Validate version and layer
	if (version === MpegVersion.RESERVED) return null
	if (layer === MpegLayer.RESERVED) return null

	// Get bitrate
	const bitrateTable = BITRATE_TABLE[version]?.[layer]
	if (!bitrateTable) return null
	const bitrate = bitrateTable[bitrateIndex]
	if (!bitrate || bitrate === -1) return null

	// Get sample rate
	const sampleRateTable = SAMPLE_RATE_TABLE[version]
	if (!sampleRateTable) return null
	const sampleRate = sampleRateTable[sampleRateIndex]
	if (!sampleRate || sampleRate === -1) return null

	// Get samples per frame
	const samplesPerFrame = SAMPLES_PER_FRAME_TABLE[version]?.[layer] ?? 0
	if (!samplesPerFrame) return null

	// Calculate frame size
	let frameSize: number
	if (layer === MpegLayer.LAYER_I) {
		// Layer I: 48000 * bitrate / sampleRate + padding * 4
		frameSize = Math.floor((48000 * bitrate) / sampleRate) + (padding ? 4 : 0)
	} else {
		// Layer II/III: 144000 * bitrate / sampleRate + padding
		frameSize = Math.floor((144000 * bitrate) / sampleRate) + (padding ? 1 : 0)
	}

	return {
		version,
		layer,
		protection,
		bitrate,
		sampleRate,
		padding,
		privateBit,
		channelMode,
		modeExtension,
		copyright,
		original,
		emphasis,
		frameSize,
		samplesPerFrame,
	}
}

/**
 * Parse Layer III side info
 */
export function parseSideInfo(
	data: Uint8Array,
	offset: number,
	header: MP3FrameHeader
): MP3SideInfo | null {
	const channels = header.channelMode === ChannelMode.MONO ? 1 : 2
	const isMpeg1 = header.version === MpegVersion.MPEG_1
	const sideInfoSize = isMpeg1 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17)

	if (offset + sideInfoSize > data.length) return null

	let bitPos = offset * 8

	const readBits = (numBits: number): number => {
		let result = 0
		for (let i = 0; i < numBits; i++) {
			const bytePos = Math.floor(bitPos / 8)
			const bitOffset = 7 - (bitPos % 8)
			const bit = (data[bytePos]! >> bitOffset) & 1
			result = (result << 1) | bit
			bitPos++
		}
		return result
	}

	const mainDataBegin = readBits(9)
	const privateBits = readBits(isMpeg1 ? (channels === 1 ? 5 : 3) : (channels === 1 ? 1 : 2))

	// Read scale factor selection info (only MPEG-1)
	const scfsi: number[][] = []
	if (isMpeg1) {
		for (let ch = 0; ch < channels; ch++) {
			scfsi[ch] = [readBits(1), readBits(1), readBits(1), readBits(1)]
		}
	}

	// Read granule info
	const numGranules = isMpeg1 ? 2 : 1
	const granules: MP3Granule[][] = []

	for (let gr = 0; gr < numGranules; gr++) {
		granules[gr] = []
		for (let ch = 0; ch < channels; ch++) {
			const part23Length = readBits(12)
			const bigValues = readBits(9)
			const globalGain = readBits(8)
			const scalefacCompress = readBits(isMpeg1 ? 4 : 9)
			const windowSwitching = readBits(1) === 1

			let blockType = 0
			let mixedBlockFlag = false
			const tableSelect: number[] = [0, 0, 0]
			const subblockGain: number[] = [0, 0, 0]
			let region0Count = 0
			let region1Count = 0

			if (windowSwitching) {
				blockType = readBits(2)
				mixedBlockFlag = readBits(1) === 1
				tableSelect[0] = readBits(5)
				tableSelect[1] = readBits(5)
				subblockGain[0] = readBits(3)
				subblockGain[1] = readBits(3)
				subblockGain[2] = readBits(3)

				// Region counts are derived for short blocks
				if (blockType === 2) {
					region0Count = mixedBlockFlag ? 8 : 7
					region1Count = 20 - region0Count
				}
			} else {
				tableSelect[0] = readBits(5)
				tableSelect[1] = readBits(5)
				tableSelect[2] = readBits(5)
				region0Count = readBits(4)
				region1Count = readBits(3)
			}

			const preflag = isMpeg1 ? readBits(1) === 1 : false
			const scalefacScale = readBits(1) === 1
			const count1TableSelect = readBits(1) === 1

			granules[gr]![ch] = {
				part23Length,
				bigValues,
				globalGain,
				scalefacCompress,
				windowSwitching,
				blockType,
				mixedBlockFlag,
				tableSelect,
				subblockGain,
				region0Count,
				region1Count,
				preflag,
				scalefacScale,
				count1TableSelect,
			}
		}
	}

	return {
		mainDataBegin,
		privateBits,
		scfsi,
		granules,
	}
}

/**
 * Parse MP3 info without decoding
 */
export function parseMp3Info(data: Uint8Array): MP3Info {
	let offset = 0

	// Check for ID3v2
	const id3v2 = parseID3v2(data, offset)
	if (id3v2) {
		offset += 10 + id3v2.header.size
	}

	// Find first frame
	const frameStart = findFrameSync(data, offset)
	if (frameStart === -1) {
		throw new Error('No valid MP3 frames found')
	}

	const firstHeader = parseFrameHeader(data, frameStart)
	if (!firstHeader) {
		throw new Error('Invalid MP3 frame header')
	}

	// Count frames to estimate duration
	let frameCount = 0
	let currentOffset = frameStart

	while (currentOffset < data.length) {
		const header = parseFrameHeader(data, currentOffset)
		if (!header) break

		frameCount++
		currentOffset += header.frameSize

		// Sample up to 100 frames for speed
		if (frameCount >= 100 && currentOffset < data.length) {
			// Estimate remaining frames
			const avgFrameSize = (currentOffset - frameStart) / frameCount
			const remainingBytes = data.length - currentOffset
			frameCount += Math.floor(remainingBytes / avgFrameSize)
			break
		}
	}

	const channels = firstHeader.channelMode === ChannelMode.MONO ? 1 : 2
	const totalSamples = frameCount * firstHeader.samplesPerFrame
	const duration = totalSamples / firstHeader.sampleRate

	return {
		id3v2,
		sampleRate: firstHeader.sampleRate,
		channels,
		bitrate: firstHeader.bitrate,
		duration,
		frameCount,
		version: firstHeader.version,
		layer: firstHeader.layer,
		channelMode: firstHeader.channelMode,
	}
}

/**
 * Decode MP3 audio
 */
export function decodeMp3(data: Uint8Array): MP3DecodeResult {
	const info = parseMp3Info(data)
	let offset = 0

	// Skip ID3v2 if present
	if (info.id3v2) {
		offset += 10 + info.id3v2.header.size
	}

	// Parse all frames
	const frames: MP3Frame[] = []
	const frameStart = findFrameSync(data, offset)
	if (frameStart === -1) {
		throw new Error('No valid MP3 frames found')
	}

	offset = frameStart

	while (offset < data.length) {
		const header = parseFrameHeader(data, offset)
		if (!header) break

		// For Layer III, parse side info
		let sideInfo: MP3SideInfo | undefined
		let dataOffset = offset + 4

		if (!header.protection) {
			dataOffset += 2 // Skip CRC
		}

		if (header.layer === MpegLayer.LAYER_III) {
			const si = parseSideInfo(data, dataOffset, header)
			if (si) {
				sideInfo = si
				const channels = header.channelMode === ChannelMode.MONO ? 1 : 2
				const isMpeg1 = header.version === MpegVersion.MPEG_1
				const sideInfoSize = isMpeg1 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17)
				dataOffset += sideInfoSize
			}
		}

		const mainDataSize = header.frameSize - (dataOffset - offset)
		const mainData = data.slice(dataOffset, offset + header.frameSize)

		frames.push({
			header,
			sideInfo,
			mainData,
		})

		offset += header.frameSize
	}

	// Decode frames to PCM
	// Note: Full MP3 decoding requires Huffman decoding, requantization, reordering,
	// stereo processing, alias reduction, IMDCT, frequency inversion, and synthesis filterbank.
	// This is a simplified implementation that creates silent audio.
	const samples = decodeFrames(frames, info)

	return { info, samples }
}

/**
 * Decode frames to PCM samples
 * Full implementation would include:
 * - Huffman decoding
 * - Requantization
 * - Reordering
 * - Stereo processing
 * - Alias reduction
 * - IMDCT (Inverse Modified Discrete Cosine Transform)
 * - Frequency inversion
 * - Synthesis filterbank
 */
function decodeFrames(frames: MP3Frame[], info: MP3Info): Float32Array[] {
	const totalSamples = frames.reduce((sum, f) => sum + f.header.samplesPerFrame, 0)
	const channels: Float32Array[] = []

	for (let ch = 0; ch < info.channels; ch++) {
		channels.push(new Float32Array(totalSamples))
	}

	// Simplified: Create silent audio
	// A full implementation would decode the compressed audio data
	let sampleOffset = 0
	for (const frame of frames) {
		// TODO: Implement full MP3 decoding pipeline
		// For now, fill with silence
		sampleOffset += frame.header.samplesPerFrame
	}

	return channels
}

/**
 * Decode text from buffer
 */
function decodeText(data: Uint8Array): string {
	try {
		// Try UTF-8 first
		const decoder = new TextDecoder('utf-8', { fatal: true })
		return decoder.decode(data).replace(/\0/g, '').trim()
	} catch {
		// Fall back to latin1
		const decoder = new TextDecoder('latin1')
		return decoder.decode(data).replace(/\0/g, '').trim()
	}
}
