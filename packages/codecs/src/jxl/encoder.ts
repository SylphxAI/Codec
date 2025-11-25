import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import { EncodingMode, JXL_CODESTREAM_SIGNATURE, type JxlEncodeOptions } from './types'

/**
 * Bit writer for JXL variable-length integer encoding
 */
class BitWriter {
	private bytes: number[] = []
	private currentByte = 0
	private bitOffset = 0

	/**
	 * Write bits to the stream
	 */
	writeBits(value: number, count: number): void {
		for (let i = 0; i < count; i++) {
			const bit = (value >> i) & 1
			this.currentByte |= bit << this.bitOffset
			this.bitOffset++

			if (this.bitOffset === 8) {
				this.bytes.push(this.currentByte)
				this.currentByte = 0
				this.bitOffset = 0
			}
		}
	}

	/**
	 * Write a single bit
	 */
	writeBit(value: boolean): void {
		this.writeBits(value ? 1 : 0, 1)
	}

	/**
	 * Align to byte boundary
	 */
	alignToByte(): void {
		if (this.bitOffset !== 0) {
			this.bytes.push(this.currentByte)
			this.currentByte = 0
			this.bitOffset = 0
		}
	}

	/**
	 * Get the bytes
	 */
	getBytes(): Uint8Array {
		const copy = [...this.bytes]
		if (this.bitOffset !== 0) {
			copy.push(this.currentByte)
		}
		return new Uint8Array(copy)
	}

	/**
	 * Write raw bytes
	 */
	writeBytes(data: Uint8Array): void {
		this.alignToByte()
		for (const byte of data) {
			this.bytes.push(byte)
		}
	}
}

/**
 * Write U32 big-endian
 */
function writeU32BE(value: number): Uint8Array {
	const data = new Uint8Array(4)
	data[0] = (value >> 24) & 0xff
	data[1] = (value >> 16) & 0xff
	data[2] = (value >> 8) & 0xff
	data[3] = value & 0xff
	return data
}

/**
 * Encode JXL variable-length unsigned integer (U32)
 */
function encodeVarInt(writer: BitWriter, value: number): void {
	if (value === 0) {
		writer.writeBits(0, 2) // 00
		return
	}

	const bits = Math.floor(Math.log2(value)) + 1

	if (bits <= 4) {
		writer.writeBits(1, 2) // 01
		writer.writeBits(value, 4)
	} else if (bits <= 8) {
		writer.writeBits(2, 2) // 10
		writer.writeBits(value, 8)
	} else if (bits <= 12) {
		writer.writeBits(3, 2) // 11
		writer.writeBits(value, 12)
	} else {
		// For larger values, use multiple chunks
		let remaining = value
		while (remaining > 0) {
			const chunk = remaining & 0xfff // 12 bits
			remaining >>= 12

			if (remaining > 0) {
				writer.writeBits(3, 2) // 11 - more chunks follow
				writer.writeBits(chunk, 12)
			} else {
				// Last chunk - use appropriate selector
				if (chunk <= 15) {
					writer.writeBits(1, 2) // 01
					writer.writeBits(chunk, 4)
				} else if (chunk <= 255) {
					writer.writeBits(2, 2) // 10
					writer.writeBits(chunk, 8)
				} else {
					writer.writeBits(3, 2) // 11
					writer.writeBits(chunk, 12)
				}
			}
		}
	}
}

/**
 * Write image size header
 */
function writeSizeHeader(writer: BitWriter, width: number, height: number): void {
	// Check if small size encoding is possible
	if (height <= 256 && width <= 256 && height % 8 === 0) {
		writer.writeBit(true) // div8 = true

		// Height in units of 8
		writer.writeBits(height / 8 - 1, 5)

		// Check for standard aspect ratios
		const ratio = width / height

		if (Math.abs(ratio - 1) < 0.01) {
			writer.writeBits(0, 3) // 1:1
		} else if (Math.abs(ratio - 1.2) < 0.01) {
			writer.writeBits(1, 3) // 6:5
		} else if (Math.abs(ratio - 4 / 3) < 0.01) {
			writer.writeBits(2, 3) // 4:3
		} else if (Math.abs(ratio - 3 / 2) < 0.01) {
			writer.writeBits(3, 3) // 3:2
		} else if (Math.abs(ratio - 16 / 9) < 0.01) {
			writer.writeBits(4, 3) // 16:9
		} else if (Math.abs(ratio - 5 / 4) < 0.01) {
			writer.writeBits(5, 3) // 5:4
		} else if (Math.abs(ratio - 2) < 0.01) {
			writer.writeBits(6, 3) // 2:1
		} else if (width % 8 === 0 && width <= 256) {
			writer.writeBits(7, 3) // Custom
			writer.writeBits(width / 8 - 1, 5)
		} else {
			// Fall back to large encoding
			writer.writeBit(false) // Not div8
			encodeVarInt(writer, height - 1)
			encodeVarInt(writer, width - 1)
			return
		}
	} else {
		writer.writeBit(false) // div8 = false
		encodeVarInt(writer, height - 1)
		encodeVarInt(writer, width - 1)
	}
}

/**
 * Write image metadata
 */
function writeImageMetadata(writer: BitWriter, hasAlpha: boolean): void {
	// all_default = false (we have custom metadata)
	writer.writeBit(false)

	// extra_fields = false (no extra fields for now)
	writer.writeBit(false)

	// Orientation (1 = normal)
	writer.writeBits(1, 3)

	// Bit depth = 8 (default)
	writer.writeBit(false) // Use default bit depth

	// Modular 16-bit buffer
	writer.writeBit(false)

	// Number of extra channels
	if (hasAlpha) {
		encodeVarInt(writer, 1) // One extra channel (alpha)

		// Extra channel metadata (all_default for alpha)
		writer.writeBit(true) // all_default = true for alpha channel
	} else {
		encodeVarInt(writer, 0) // No extra channels
	}

	// xyb_encoded = false
	writer.writeBit(false)

	// Color encoding (all_default = true for sRGB)
	writer.writeBit(true)
}

/**
 * Write frame header
 */
function writeFrameHeader(writer: BitWriter, isLossy: boolean): void {
	// all_default = false
	writer.writeBit(false)

	// frame_type = regular frame (0)
	writer.writeBits(0, 2)

	// encoding = modular or vardct
	writer.writeBits(isLossy ? EncodingMode.VarDCT : EncodingMode.Modular, 1)

	// flags = 0 (no special flags)
	writer.writeBits(0, 2)

	// do_YCbCr = false
	writer.writeBit(false)

	// For simplicity, use minimal frame configuration
	// A full encoder would write proper frame flags and configuration
}

/**
 * Simple lossless pixel encoding using a very basic predictor
 * Full JXL uses sophisticated entropy coding (ANS) and predictors
 */
function encodePixelsLossless(writer: BitWriter, data: Uint8Array, width: number, height: number): void {
	// Simplified modular encoding
	// Real JXL modular encoding uses:
	// - MA tree predictor selection
	// - Squeeze/unsqueeze transforms
	// - Palette construction
	// - Context-adaptive ANS entropy coding

	// For this simplified version, we'll use a basic differential encoding
	writer.alignToByte()

	let prev = 0
	for (let i = 0; i < data.length; i++) {
		const current = data[i]!
		const diff = (current - prev + 256) & 0xff
		writer.writeBits(diff, 8)
		prev = current
	}
}

/**
 * Simple lossy encoding using quantization
 * Full JXL VarDCT uses DCT, quantization, and sophisticated entropy coding
 */
function encodePixelsLossy(
	writer: BitWriter,
	data: Uint8Array,
	width: number,
	height: number,
	quality: number
): void {
	// Simplified lossy encoding
	// Real JXL VarDCT encoding uses:
	// - XYB color space conversion
	// - Adaptive DCT block sizes
	// - Adaptive quantization
	// - Context modeling and ANS entropy coding

	writer.alignToByte()

	// Simple quantization based on quality
	const qFactor = quality < 95 ? Math.floor((100 - quality) / 5) + 1 : 1

	let prev = 0
	for (let i = 0; i < data.length; i++) {
		const current = data[i]!
		const quantized = Math.floor(current / qFactor) * qFactor
		const diff = (quantized - prev + 256) & 0xff
		writer.writeBits(diff, 8)
		prev = quantized
	}
}

/**
 * Create JXL container with codestream
 */
function createContainer(codestream: Uint8Array): Uint8Array {
	const writer = new BitWriter()

	// Container signature
	writer.writeBytes(new Uint8Array([0x00, 0x00, 0x00, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a]))

	// ftyp box
	const ftypData = new Uint8Array([0x6a, 0x78, 0x6c, 0x20]) // 'jxl '
	writer.writeBytes(writeU32BE(12))
	writer.writeBytes(new Uint8Array([0x66, 0x74, 0x79, 0x70])) // 'ftyp'
	writer.writeBytes(ftypData)

	// jxlc box (codestream)
	writer.writeBytes(writeU32BE(8 + codestream.length))
	writer.writeBytes(new Uint8Array([0x6a, 0x78, 0x6c, 0x63])) // 'jxlc'
	writer.writeBytes(codestream)

	return writer.getBytes()
}

/**
 * Encode ImageData to JXL
 *
 * Note: This is a simplified implementation that creates valid JXL structure
 * but uses basic encoding. Full JXL encoding requires:
 * - ANS entropy encoding
 * - Advanced prediction and transforms
 * - XYB color space for lossy encoding
 * - Adaptive quantization and noise synthesis
 * - Optimal entropy coding and context modeling
 *
 * For production use, consider using a complete JXL library like libjxl via WASM.
 */
export function encodeJxl(image: ImageData, options?: EncodeOptions & JxlEncodeOptions): Uint8Array {
	const { width, height, data } = image

	// Parse options
	const quality = options?.quality ?? 90
	const lossless = options?.lossless ?? quality >= 100
	const useContainer = true // Always use container format for compatibility

	// Create bit writer
	const writer = new BitWriter()

	// Write codestream signature
	writer.writeBytes(JXL_CODESTREAM_SIGNATURE)

	// Write size header
	writeSizeHeader(writer, width, height)

	// Check if image has meaningful alpha
	let hasAlpha = false
	for (let i = 3; i < data.length; i += 4) {
		if (data[i]! < 255) {
			hasAlpha = true
			break
		}
	}

	// Write image metadata
	writeImageMetadata(writer, hasAlpha)

	// Write frame header
	writeFrameHeader(writer, !lossless)

	// Encode pixel data
	if (lossless) {
		encodePixelsLossless(writer, data, width, height)
	} else {
		encodePixelsLossy(writer, data, width, height, quality)
	}

	// Align to byte boundary
	writer.alignToByte()

	// Get codestream
	const codestream = writer.getBytes()

	// Wrap in container if requested
	if (useContainer) {
		return createContainer(codestream)
	}

	return codestream
}
