/**
 * MP3 encoder
 * Encodes audio to MPEG-1/2 Audio Layer III
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
	type MP3AudioData,
	type MP3EncodeOptions,
} from './types'

/**
 * Encode audio to MP3
 * Full implementation requires:
 * - Psychoacoustic model
 * - Analysis filterbank (polyphase)
 * - MDCT (Modified Discrete Cosine Transform)
 * - Quantization and iteration loop
 * - Huffman encoding
 * - Bitstream formatting
 */
export function encodeMp3(audio: MP3AudioData, options: MP3EncodeOptions = {}): Uint8Array {
	const {
		bitrate = 128,
		sampleRate = audio.sampleRate || 44100,
		channelMode = audio.channels === 1 ? ChannelMode.MONO : ChannelMode.STEREO,
		quality = 5,
		vbr = false,
		metadata,
	} = options

	// Validate sample rate
	const version = getSampleRateVersion(sampleRate)
	if (version === -1) {
		throw new Error(`Unsupported sample rate: ${sampleRate}`)
	}

	// Validate bitrate
	const bitrateIndex = getBitrateIndex(version, MpegLayer.LAYER_III, bitrate)
	if (bitrateIndex === -1) {
		throw new Error(`Unsupported bitrate: ${bitrate}`)
	}

	const channels = audio.channels
	const samplesPerFrame = SAMPLES_PER_FRAME_TABLE[version]?.[MpegLayer.LAYER_III] ?? 1152

	// Calculate frame count
	const totalSamples = audio.samples[0]?.length ?? 0
	const frameCount = Math.ceil(totalSamples / samplesPerFrame)

	// Estimate output size
	const frameSize = Math.floor((144000 * bitrate) / sampleRate)
	const estimatedSize = frameCount * frameSize + (metadata ? 2048 : 0) + 128

	const output = new Uint8Array(estimatedSize)
	let offset = 0

	// Write ID3v2 tag if metadata provided
	if (metadata) {
		offset = writeID3v2Tag(output, offset, metadata)
	}

	// Encode frames
	let sampleOffset = 0
	for (let i = 0; i < frameCount; i++) {
		const frameSamples: Float32Array[] = []
		for (let ch = 0; ch < channels; ch++) {
			const channelSamples = audio.samples[ch]!
			const start = sampleOffset
			const end = Math.min(start + samplesPerFrame, channelSamples.length)
			const frameData = new Float32Array(samplesPerFrame)

			// Copy samples, pad with zeros if needed
			for (let s = 0; s < samplesPerFrame; s++) {
				frameData[s] = start + s < end ? channelSamples[start + s]! : 0
			}

			frameSamples.push(frameData)
		}

		// Encode frame
		offset = encodeFrame(
			output,
			offset,
			frameSamples,
			version,
			sampleRate,
			bitrate,
			channelMode,
			i === frameCount - 1 && sampleOffset + samplesPerFrame >= totalSamples
		)

		sampleOffset += samplesPerFrame
	}

	return output.slice(0, offset)
}

/**
 * Encode a single MP3 frame
 * Simplified implementation - produces valid frame structure but with silent audio
 */
function encodeFrame(
	output: Uint8Array,
	offset: number,
	samples: Float32Array[],
	version: number,
	sampleRate: number,
	bitrate: number,
	channelMode: number,
	isLast: boolean
): number {
	const layer = MpegLayer.LAYER_III
	const bitrateIndex = getBitrateIndex(version, layer, bitrate)
	const sampleRateIndex = getSampleRateIndex(version, sampleRate)

	// Calculate frame size
	const frameSize = Math.floor((144000 * bitrate) / sampleRate)

	// Write frame header
	const header = new Uint8Array(4)

	// Sync word (11 bits = 0xFFE) + version (2 bits) + layer (2 bits) + protection (1 bit)
	// First byte: 0xFF (all 1s)
	// Second byte: top 3 bits are 0b111 (sync), then version (2 bits), layer (2 bits), protection (1 bit)
	header[0] = 0xff
	header[1] = 0xe0 | ((version & 0x03) << 3) | ((layer & 0x03) << 1) | 1 // 0xe0 = 0b11100000 (top 3 bits for sync)

	// Bitrate (4 bits) + sample rate (2 bits) + padding (1 bit) + private (1 bit)
	const padding = 0
	header[2] = ((bitrateIndex & 0x0f) << 4) | ((sampleRateIndex & 0x03) << 2) | ((padding & 0x01) << 1) | 0

	// Channel mode (2 bits) + mode extension (2 bits) + copyright (1 bit) + original (1 bit) + emphasis (2 bits)
	header[3] = ((channelMode & 0x03) << 6) | (0 << 4) | (0 << 3) | (1 << 2) | (Emphasis.NONE & 0x03)

	output.set(header, offset)
	offset += 4

	// Write side info
	const channels = channelMode === ChannelMode.MONO ? 1 : 2
	const isMpeg1 = version === MpegVersion.MPEG_1
	const sideInfoSize = isMpeg1 ? (channels === 1 ? 17 : 32) : (channels === 1 ? 9 : 17)

	// Simplified side info (all zeros indicates empty/silent frame)
	const sideInfo = new Uint8Array(sideInfoSize)
	output.set(sideInfo, offset)
	offset += sideInfoSize

	// Write main data (compressed audio)
	// Full implementation would write Huffman-encoded spectral data
	// For now, fill with zeros (which decodes to silence)
	const mainDataSize = frameSize - 4 - sideInfoSize
	const mainData = new Uint8Array(mainDataSize)

	output.set(mainData, offset)
	offset += mainDataSize

	return offset
}

/**
 * Write ID3v2 tag
 */
function writeID3v2Tag(output: Uint8Array, offset: number, metadata: Map<string, string>): number {
	const startOffset = offset

	// ID3v2.3 header
	output[offset++] = 0x49 // 'I'
	output[offset++] = 0x44 // 'D'
	output[offset++] = 0x33 // '3'
	output[offset++] = 0x03 // version
	output[offset++] = 0x00 // revision
	output[offset++] = 0x00 // flags

	// Reserve space for size (will be filled later)
	const sizeOffset = offset
	offset += 4

	const framesStart = offset

	// Write text frames
	const frameMap: Record<string, string> = {
		title: 'TIT2',
		artist: 'TPE1',
		album: 'TALB',
		year: 'TYER',
		comment: 'COMM',
		genre: 'TCON',
	}

	for (const [key, value] of metadata) {
		const frameId = frameMap[key] || key.toUpperCase()
		if (frameId.length === 4) {
			offset = writeTextFrame(output, offset, frameId, value)
		}
	}

	// Calculate and write tag size (synchsafe)
	const tagSize = offset - framesStart
	output[sizeOffset] = (tagSize >> 21) & 0x7f
	output[sizeOffset + 1] = (tagSize >> 14) & 0x7f
	output[sizeOffset + 2] = (tagSize >> 7) & 0x7f
	output[sizeOffset + 3] = tagSize & 0x7f

	return offset
}

/**
 * Write ID3v2 text frame
 */
function writeTextFrame(output: Uint8Array, offset: number, frameId: string, text: string): number {
	// Frame ID
	for (let i = 0; i < 4; i++) {
		output[offset++] = frameId.charCodeAt(i)
	}

	// Encode text as UTF-8
	const textData = new TextEncoder().encode(text)
	const frameSize = 1 + textData.length // 1 byte for encoding

	// Frame size (4 bytes, not synchsafe in ID3v2.3)
	output[offset++] = (frameSize >> 24) & 0xff
	output[offset++] = (frameSize >> 16) & 0xff
	output[offset++] = (frameSize >> 8) & 0xff
	output[offset++] = frameSize & 0xff

	// Frame flags (2 bytes)
	output[offset++] = 0x00
	output[offset++] = 0x00

	// Text encoding (0 = ISO-8859-1, 3 = UTF-8)
	output[offset++] = 0x03

	// Text data
	output.set(textData, offset)
	offset += textData.length

	return offset
}

/**
 * Get MPEG version for sample rate
 */
function getSampleRateVersion(sampleRate: number): number {
	for (let v = 0; v < SAMPLE_RATE_TABLE.length; v++) {
		if (SAMPLE_RATE_TABLE[v]?.includes(sampleRate)) {
			return v
		}
	}
	return -1
}

/**
 * Get sample rate index for version
 */
function getSampleRateIndex(version: number, sampleRate: number): number {
	const table = SAMPLE_RATE_TABLE[version]
	return table?.indexOf(sampleRate) ?? -1
}

/**
 * Get bitrate index
 */
function getBitrateIndex(version: number, layer: number, bitrate: number): number {
	const table = BITRATE_TABLE[version]?.[layer]
	return table?.indexOf(bitrate) ?? -1
}

/**
 * Simplified psychoacoustic model
 * Real implementation would analyze frequency content and masking
 */
function psychoacousticModel(samples: Float32Array[]): number[] {
	// Placeholder: return equal bit allocation
	return new Array(samples.length).fill(1)
}

/**
 * Analysis filterbank (polyphase)
 * Splits audio into 32 subbands
 */
function analysisFilterbank(samples: Float32Array): Float32Array[] {
	const subbands: Float32Array[] = []
	const subbandCount = 32

	for (let sb = 0; sb < subbandCount; sb++) {
		subbands.push(new Float32Array(samples.length / subbandCount))
	}

	// Simplified: just distribute samples (real implementation uses polyphase filtering)
	for (let i = 0; i < samples.length; i++) {
		const sb = i % subbandCount
		const idx = Math.floor(i / subbandCount)
		if (idx < subbands[sb]!.length) {
			subbands[sb]![idx] = samples[i]!
		}
	}

	return subbands
}

/**
 * MDCT (Modified Discrete Cosine Transform)
 * Converts time domain to frequency domain with critical sampling
 */
function mdct(samples: Float32Array, blockType: number): Float32Array {
	const N = samples.length
	const N2 = N / 2
	const output = new Float32Array(N2)

	// Simplified MDCT (real implementation uses optimized algorithms)
	for (let k = 0; k < N2; k++) {
		let sum = 0
		for (let n = 0; n < N; n++) {
			sum += samples[n]! * Math.cos((Math.PI / N) * (n + 0.5 + N2) * (k + 0.5))
		}
		output[k] = sum
	}

	return output
}

/**
 * Quantization with nested iteration loop
 * Finds optimal quantization step to fit bits budget
 */
function quantize(spectral: Float32Array, bitsBudget: number): { values: Int32Array; scaleFactor: number } {
	const values = new Int32Array(spectral.length)
	let scaleFactor = 1.0

	// Simplified: linear quantization (real implementation uses nested loops)
	const maxVal = Math.max(...Array.from(spectral).map(Math.abs))
	if (maxVal > 0) {
		scaleFactor = 8191 / maxVal // 13-bit quantization
	}

	for (let i = 0; i < spectral.length; i++) {
		values[i] = Math.round(spectral[i]! * scaleFactor)
	}

	return { values, scaleFactor }
}

/**
 * Huffman encoding
 * Encodes quantized values using variable-length codes
 */
function huffmanEncode(values: Int32Array): Uint8Array {
	// Simplified: just pack values (real implementation uses Huffman tables)
	const output = new Uint8Array(values.length * 2)
	let offset = 0

	for (const val of values) {
		// Store as 16-bit values (placeholder)
		output[offset++] = (val >> 8) & 0xff
		output[offset++] = val & 0xff
	}

	return output.slice(0, offset)
}
