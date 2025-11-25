import type { EncodeOptions, ImageData } from '@sylphx/codec-core'
import {
	Jp2BoxType,
	ColorSpace,
	J2K_SIGNATURE,
	JP2_SIGNATURE,
	Marker,
	ProgressionOrder,
	type CodingStyle,
	type Quantization,
	type SizParameters,
} from './types'

/**
 * Write 16-bit big-endian value
 */
function writeU16BE(value: number): number[] {
	return [(value >> 8) & 0xff, value & 0xff]
}

/**
 * Write 32-bit big-endian value
 */
function writeU32BE(value: number): number[] {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

/**
 * Encode JPEG 2000 image
 */
export function encodeJp2(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image
	const quality = options?.quality ?? 85

	// Determine if grayscale
	const isGrayscale = checkGrayscale(data)
	const numComponents = isGrayscale ? 1 : 3

	// Create JP2 format with boxes
	const output: number[] = []

	// JP2 Signature Box
	output.push(...JP2_SIGNATURE)

	// File Type Box
	writeFileTypeBox(output)

	// JP2 Header Box
	writeJp2HeaderBox(output, width, height, numComponents, isGrayscale)

	// Contiguous Codestream Box
	const codestream = encodeCodestream(image, numComponents, quality)
	writeContiguousCodestreamBox(output, codestream)

	return new Uint8Array(output)
}

/**
 * Check if image is grayscale
 */
function checkGrayscale(data: Uint8Array): boolean {
	for (let i = 0; i < data.length; i += 4) {
		if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) {
			return false
		}
	}
	return true
}

/**
 * Write File Type Box
 */
function writeFileTypeBox(output: number[]): void {
	const boxData = [
		...writeU32BE(0x6a703220), // Brand: 'jp2 '
		...writeU32BE(0), // Minor version: 0
		...writeU32BE(0x6a703220), // Compatibility: 'jp2 '
	]

	writeBox(output, Jp2BoxType.FILE_TYPE, boxData)
}

/**
 * Write JP2 Header Box
 */
function writeJp2HeaderBox(
	output: number[],
	width: number,
	height: number,
	numComponents: number,
	isGrayscale: boolean
): void {
	const headerData: number[] = []

	// Image Header Box
	const ihdrData = [
		...writeU32BE(height),
		...writeU32BE(width),
		...writeU16BE(numComponents),
		8, // Bits per component (8 bits)
		7, // Compression type (JPEG 2000)
		0, // Colorspace known
		0, // No intellectual property
	]
	writeBox(headerData, Jp2BoxType.IMAGE_HEADER, ihdrData)

	// Color Specification Box
	const colrData = [
		1, // Method: Enumerated
		0, // Precedence
		0, // Approximation
		...writeU32BE(isGrayscale ? ColorSpace.GRAYSCALE : ColorSpace.SRGB),
	]
	writeBox(headerData, Jp2BoxType.COLOR_SPEC, colrData)

	writeBox(output, Jp2BoxType.JP2_HEADER, headerData)
}

/**
 * Write Contiguous Codestream Box
 */
function writeContiguousCodestreamBox(output: number[], codestream: Uint8Array): void {
	writeBox(output, Jp2BoxType.CONTIGUOUS_CODESTREAM, Array.from(codestream))
}

/**
 * Write a box with type and data
 */
function writeBox(output: number[], type: number, data: number[]): void {
	const length = 8 + data.length
	output.push(...writeU32BE(length))
	output.push(...writeU32BE(type))
	output.push(...data)
}

/**
 * Encode JPEG 2000 codestream
 */
function encodeCodestream(image: ImageData, numComponents: number, quality: number): Uint8Array {
	const { width, height, data } = image
	const output: number[] = []

	// SOC - Start of Codestream
	output.push(...writeU16BE(Marker.SOC))

	// SIZ - Image and tile size
	writeSIZ(output, width, height, numComponents)

	// COD - Coding style default
	const numDecompositions = calculateDecompositions(Math.max(width, height))
	writeCOD(output, numDecompositions, quality)

	// QCD - Quantization default
	writeQCD(output, numDecompositions, quality)

	// SOT - Start of tile-part
	const tileDataStart = output.length + 14 // SOT segment is 14 bytes
	writeSOT(output, 0, 0) // Will update length later

	// SOD - Start of data
	output.push(...writeU16BE(Marker.SOD))

	// Encode tile data
	const tileData = encodeTileData(image, numComponents, numDecompositions, quality)
	const tileDataStartIndex = output.length
	output.push(...tileData)

	// Update SOT tile-part length
	const tilePartLength = output.length - tileDataStart + 14
	const sotLengthIndex = tileDataStart - 8
	const lengthBytes = writeU32BE(tilePartLength)
	output[sotLengthIndex] = lengthBytes[0]!
	output[sotLengthIndex + 1] = lengthBytes[1]!
	output[sotLengthIndex + 2] = lengthBytes[2]!
	output[sotLengthIndex + 3] = lengthBytes[3]!

	// EOC - End of Codestream
	output.push(...writeU16BE(Marker.EOC))

	return new Uint8Array(output)
}

/**
 * Write SIZ segment
 */
function writeSIZ(output: number[], width: number, height: number, numComponents: number): void {
	const segmentData = [
		...writeU16BE(0), // Rsiz: capabilities
		...writeU32BE(width), // Xsiz
		...writeU32BE(height), // Ysiz
		...writeU32BE(0), // XOsiz
		...writeU32BE(0), // YOsiz
		...writeU32BE(width), // XTsiz (tile width = image width)
		...writeU32BE(height), // YTsiz (tile height = image height)
		...writeU32BE(0), // XTOsiz
		...writeU32BE(0), // YTOsiz
		...writeU16BE(numComponents), // Csiz
	]

	// Component parameters
	for (let i = 0; i < numComponents; i++) {
		segmentData.push(
			7, // Ssiz: 8-bit unsigned
			1, // XRsiz: no subsampling
			1 // YRsiz: no subsampling
		)
	}

	writeMarkerSegment(output, Marker.SIZ, segmentData)
}

/**
 * Write COD segment
 */
function writeCOD(output: number[], numDecompositions: number, quality: number): void {
	const segmentData = [
		0x00, // Scod: default coding style
		ProgressionOrder.LRCP, // Progression order
		...writeU16BE(1), // Number of layers
		0, // Multiple component transform: none for RGB
		numDecompositions, // Number of decomposition levels
		2, // Code-block width: 2^(2+2) = 16
		2, // Code-block height: 2^(2+2) = 16
		0x00, // Code-block style
		quality >= 90 ? 1 : 0, // Transformation: 1=5-3 reversible, 0=9-7 irreversible
	]

	writeMarkerSegment(output, Marker.COD, segmentData)
}

/**
 * Write QCD segment
 */
function writeQCD(output: number[], numDecompositions: number, quality: number): void {
	// Simplified: no quantization (reversible)
	const segmentData = [0x00] // Sqcd: no quantization

	// One exponent per subband
	const numSubbands = 3 * numDecompositions + 1
	for (let i = 0; i < numSubbands; i++) {
		segmentData.push(8) // 8-bit exponent
	}

	writeMarkerSegment(output, Marker.QCD, segmentData)
}

/**
 * Write SOT segment
 */
function writeSOT(output: number[], tileIndex: number, tilePartLength: number): void {
	const segmentData = [
		...writeU16BE(tileIndex), // Tile index
		...writeU32BE(tilePartLength), // Tile-part length (0 = unknown)
		0, // Tile-part index
		1, // Number of tile-parts
	]

	writeMarkerSegment(output, Marker.SOT, segmentData)
}

/**
 * Write marker segment
 */
function writeMarkerSegment(output: number[], marker: number, data: number[]): void {
	output.push(...writeU16BE(marker))
	output.push(...writeU16BE(data.length + 2)) // Length includes length field
	output.push(...data)
}

/**
 * Encode tile data (simplified)
 */
function encodeTileData(
	image: ImageData,
	numComponents: number,
	numDecompositions: number,
	quality: number
): number[] {
	const { width, height, data } = image

	// Convert to component arrays
	const components: Float32Array[] = []

	if (numComponents === 1) {
		// Grayscale
		const comp = new Float32Array(width * height)
		for (let i = 0; i < width * height; i++) {
			comp[i] = data[i * 4]! - 128
		}
		components.push(comp)
	} else {
		// RGB
		const r = new Float32Array(width * height)
		const g = new Float32Array(width * height)
		const b = new Float32Array(width * height)

		for (let i = 0; i < width * height; i++) {
			r[i] = data[i * 4]! - 128
			g[i] = data[i * 4 + 1]! - 128
			b[i] = data[i * 4 + 2]! - 128
		}

		components.push(r, g, b)
	}

	// Apply wavelet transform (simplified)
	for (const comp of components) {
		forwardWavelet53(comp, width, height, numDecompositions)
	}

	// Quantize (simplified)
	const quantStep = quality >= 90 ? 1 : Math.pow(2, (100 - quality) / 10)
	for (const comp of components) {
		for (let i = 0; i < comp.length; i++) {
			comp[i] = Math.round(comp[i]! / quantStep)
		}
	}

	// Encode coefficients (simplified - just pack as bytes)
	// In a full implementation, this would use EBCOT (MQ-coder + bit-plane coding)
	const output: number[] = []

	for (const comp of components) {
		for (let i = 0; i < comp.length; i++) {
			const val = Math.max(-128, Math.min(127, comp[i]!))
			output.push(val & 0xff)
		}
	}

	return output
}

/**
 * Forward 5-3 wavelet transform (simplified)
 */
function forwardWavelet53(
	data: Float32Array,
	width: number,
	height: number,
	levels: number
): void {
	let w = width
	let h = height

	for (let level = 0; level < levels; level++) {
		// Horizontal transform
		for (let y = 0; y < h; y++) {
			const row = data.slice(y * width, y * width + w)
			forwardWavelet53Row(row)
			data.set(row, y * width)
		}

		// Vertical transform
		for (let x = 0; x < w; x++) {
			const column = new Float32Array(h)
			for (let y = 0; y < h; y++) {
				column[y] = data[y * width + x]!
			}
			forwardWavelet53Row(column)
			for (let y = 0; y < h; y++) {
				data[y * width + x] = column[y]!
			}
		}

		// Next level operates on LL subband only
		w = Math.floor((w + 1) / 2)
		h = Math.floor((h + 1) / 2)
	}
}

/**
 * Forward 5-3 wavelet transform for a single row/column
 */
function forwardWavelet53Row(data: Float32Array): void {
	const n = data.length
	const temp = new Float32Array(n)

	// Predict step (odd samples)
	for (let i = 1; i < n; i += 2) {
		const prev = data[i - 1]!
		const next = i + 1 < n ? data[i + 1]! : data[i - 1]!
		temp[i] = data[i]! - Math.floor((prev + next) / 2)
	}

	// Update step (even samples)
	for (let i = 0; i < n; i += 2) {
		const prev = i > 0 ? temp[i - 1]! : temp[i + 1]!
		const next = i + 1 < n ? temp[i + 1]! : temp[i - 1]!
		temp[i] = data[i]! + Math.floor((prev + next) / 4)
	}

	// Split into low and high bands
	const half = Math.floor((n + 1) / 2)
	for (let i = 0; i < half; i++) {
		data[i] = temp[i * 2]! // Low band (even samples)
	}
	for (let i = 0; i < n - half; i++) {
		data[half + i] = temp[i * 2 + 1]! // High band (odd samples)
	}
}

/**
 * Calculate number of decomposition levels based on image size
 */
function calculateDecompositions(size: number): number {
	let levels = 0
	while (size > 64) {
		size = Math.floor(size / 2)
		levels++
	}
	return Math.min(levels, 5) // Max 5 levels
}
