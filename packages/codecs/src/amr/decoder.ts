/**
 * AMR audio decoder
 * Decodes AMR-NB and AMR-WB audio files
 */

import {
	AMR_FRAME_DURATION_MS,
	AMR_NB_FRAME_SIZES,
	AMR_NB_MAGIC,
	AMR_WB_FRAME_SIZES,
	AMR_WB_MAGIC,
	type AmrAudio,
	type AmrFrame,
	type AmrHeader,
	type AmrInfo,
	AmrVariant,
} from './types'

/**
 * Check if data is an AMR file
 */
export function isAmr(data: Uint8Array): boolean {
	const text = new TextDecoder('ascii').decode(data.slice(0, 9))
	return text.startsWith(AMR_NB_MAGIC) || text.startsWith(AMR_WB_MAGIC)
}

/**
 * Parse AMR header
 */
export function parseAmrHeader(data: Uint8Array): AmrHeader {
	const text = new TextDecoder('ascii').decode(data.slice(0, 9))

	let variant: AmrVariant
	let headerOffset: number

	if (text.startsWith(AMR_NB_MAGIC)) {
		variant = AmrVariant.NB
		headerOffset = AMR_NB_MAGIC.length
	} else if (text.startsWith(AMR_WB_MAGIC)) {
		variant = AmrVariant.WB
		headerOffset = AMR_WB_MAGIC.length
	} else {
		throw new Error('Invalid AMR: bad magic number')
	}

	return {
		variant,
		headerOffset,
		fileSize: data.length,
	}
}

/**
 * Parse AMR frames
 */
export function parseAmrFrames(data: Uint8Array, header: AmrHeader): AmrFrame[] {
	const frameSizes = header.variant === AmrVariant.NB ? AMR_NB_FRAME_SIZES : AMR_WB_FRAME_SIZES
	const frames: AmrFrame[] = []

	let offset = header.headerOffset

	while (offset < data.length) {
		if (offset >= data.length) break

		// Read frame header (mode byte)
		const modeByte = data[offset]!
		offset++

		// Extract frame type (4 most significant bits)
		const mode = (modeByte >> 3) & 0x0f

		// Validate mode
		if (mode > 15) {
			throw new Error(`Invalid AMR frame mode: ${mode}`)
		}

		// Get frame size
		const frameSize = frameSizes[mode]!

		// Check if we have enough data
		if (offset + frameSize > data.length) {
			// Incomplete frame at end of file
			break
		}

		// Extract frame data
		const frameData = data.slice(offset, offset + frameSize)
		offset += frameSize

		frames.push({
			mode,
			data: frameData,
		})
	}

	return frames
}

/**
 * Parse AMR info without decoding frames
 */
export function parseAmrInfo(data: Uint8Array): AmrInfo {
	const header = parseAmrHeader(data)
	const frames = parseAmrFrames(data, header)

	const sampleRate = header.variant === AmrVariant.NB ? 8000 : 16000
	const frameCount = frames.length
	const duration = (frameCount * AMR_FRAME_DURATION_MS) / 1000

	// Calculate average bitrate
	const frameSizes = header.variant === AmrVariant.NB ? AMR_NB_FRAME_SIZES : AMR_WB_FRAME_SIZES
	let totalBits = 0
	for (const frame of frames) {
		totalBits += (frameSizes[frame.mode]! + 1) * 8 // +1 for mode byte
	}
	const bitrate = duration > 0 ? Math.round(totalBits / duration) : 0

	return {
		variant: header.variant,
		sampleRate,
		numChannels: 1,
		duration,
		frameCount,
		bitrate,
	}
}

/**
 * Decode AMR audio
 * Note: This returns the compressed frames, not PCM samples.
 * Full AMR decoding requires a codec implementation which is beyond pure TypeScript.
 */
export function decodeAmr(data: Uint8Array): AmrAudio {
	const header = parseAmrHeader(data)
	const frames = parseAmrFrames(data, header)
	const info = parseAmrInfo(data)

	return {
		info,
		frames,
	}
}

/**
 * Get variant from data
 */
export function getAmrVariant(data: Uint8Array): AmrVariant | null {
	if (!isAmr(data)) return null
	const text = new TextDecoder('ascii').decode(data.slice(0, 9))
	if (text.startsWith(AMR_WB_MAGIC)) return AmrVariant.WB
	if (text.startsWith(AMR_NB_MAGIC)) return AmrVariant.NB
	return null
}
