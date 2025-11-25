/**
 * AMR audio encoder
 * Encodes audio to AMR-NB or AMR-WB format
 */

import {
	AMR_NB_FRAME_SIZES,
	AMR_NB_MAGIC,
	AMR_NB_SAMPLES_PER_FRAME,
	AMR_WB_FRAME_SIZES,
	AMR_WB_MAGIC,
	AMR_WB_SAMPLES_PER_FRAME,
	type AmrEncodeOptions,
	type AmrFrame,
	AmrVariant,
} from './types'

/**
 * Encode AMR frames to file
 * @param frames Array of AMR frames
 * @param options Encoding options
 */
export function encodeAmr(frames: AmrFrame[], options: AmrEncodeOptions = {}): Uint8Array {
	const { variant = AmrVariant.NB } = options

	// Determine magic header
	const magic = variant === AmrVariant.NB ? AMR_NB_MAGIC : AMR_WB_MAGIC
	const magicBytes = new TextEncoder().encode(magic)

	// Calculate total size
	let totalSize = magicBytes.length
	for (const frame of frames) {
		totalSize += 1 + frame.data.length // mode byte + frame data
	}

	// Allocate output buffer
	const output = new Uint8Array(totalSize)
	let offset = 0

	// Write magic header
	output.set(magicBytes, offset)
	offset += magicBytes.length

	// Write frames
	const frameSizes = variant === AmrVariant.NB ? AMR_NB_FRAME_SIZES : AMR_WB_FRAME_SIZES

	for (const frame of frames) {
		// Validate frame
		if (frame.mode > 15) {
			throw new Error(`Invalid AMR frame mode: ${frame.mode}`)
		}

		const expectedSize = frameSizes[frame.mode]!
		if (frame.data.length !== expectedSize) {
			throw new Error(
				`Invalid AMR frame size: expected ${expectedSize}, got ${frame.data.length} for mode ${frame.mode}`
			)
		}

		// Write mode byte (frame type in upper 4 bits, quality bit in lower bits)
		const modeByte = (frame.mode << 3) | 0x04 // Set quality bit
		output[offset] = modeByte
		offset++

		// Write frame data
		output.set(frame.data, offset)
		offset += frame.data.length
	}

	return output
}

/**
 * Create a silence frame for the given variant and mode
 */
export function createSilenceFrame(variant: AmrVariant, mode: number): AmrFrame {
	const frameSizes = variant === AmrVariant.NB ? AMR_NB_FRAME_SIZES : AMR_WB_FRAME_SIZES

	if (mode > 15) {
		throw new Error(`Invalid mode: ${mode}`)
	}

	const frameSize = frameSizes[mode]!
	const data = new Uint8Array(frameSize).fill(0)

	return { mode, data }
}

/**
 * Create AMR from PCM samples (mock implementation)
 * Note: Real AMR encoding requires codec implementation
 * This creates silence frames as a placeholder
 */
export function encodeAmrFromPcm(
	samples: Float32Array,
	options: AmrEncodeOptions = {}
): Uint8Array {
	const { variant = AmrVariant.NB, mode = variant === AmrVariant.NB ? 7 : 8 } = options

	const samplesPerFrame =
		variant === AmrVariant.NB ? AMR_NB_SAMPLES_PER_FRAME : AMR_WB_SAMPLES_PER_FRAME
	const frameCount = Math.ceil(samples.length / samplesPerFrame)

	// Create frames (placeholder - would need real encoder)
	const frames: AmrFrame[] = []
	for (let i = 0; i < frameCount; i++) {
		frames.push(createSilenceFrame(variant, mode))
	}

	return encodeAmr(frames, { variant })
}

/**
 * Validate frame data
 */
export function validateAmrFrame(frame: AmrFrame, variant: AmrVariant): boolean {
	const frameSizes = variant === AmrVariant.NB ? AMR_NB_FRAME_SIZES : AMR_WB_FRAME_SIZES

	if (frame.mode > 15) return false

	const expectedSize = frameSizes[frame.mode]!
	return frame.data.length === expectedSize
}
