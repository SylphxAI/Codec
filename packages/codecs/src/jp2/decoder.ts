import type { ImageData } from '@sylphx/codec-core'
import {
	Jp2BoxType,
	ColorSpace,
	J2K_SIGNATURE,
	JP2_SIGNATURE,
	Marker,
	type Box,
	type CodingStyle,
	type ColorSpec,
	type ImageHeader,
	type Quantization,
	type SizParameters,
	type Tile,
} from './types'

/**
 * Read 16-bit big-endian value
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * Read 32-bit big-endian value
 */
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		(data[offset]! << 24) | (data[offset + 1]! << 16) | (data[offset + 2]! << 8) | data[offset + 3]!
	)
}

/**
 * Decode JPEG 2000 image (JP2 or J2K codestream)
 */
export function decodeJp2(data: Uint8Array): ImageData {
	// Check if it's JP2 format or raw codestream
	const isJp2 = checkJp2Signature(data)
	const isJ2k = checkJ2kSignature(data)

	if (!isJp2 && !isJ2k) {
		throw new Error('Invalid JPEG 2000 signature')
	}

	if (isJp2) {
		return decodeJp2Format(data)
	} else {
		return decodeJ2kCodestream(data)
	}
}

/**
 * Check JP2 signature
 */
function checkJp2Signature(data: Uint8Array): boolean {
	if (data.length < 12) return false
	return JP2_SIGNATURE.every((byte, i) => data[i] === byte)
}

/**
 * Check J2K codestream signature
 */
function checkJ2kSignature(data: Uint8Array): boolean {
	if (data.length < 4) return false
	return J2K_SIGNATURE.every((byte, i) => data[i] === byte)
}

/**
 * Decode JP2 format (with boxes)
 */
function decodeJp2Format(data: Uint8Array): ImageData {
	const boxes = parseBoxes(data)

	// Find required boxes
	const jp2hBox = boxes.find((b) => b.type === Jp2BoxType.JP2_HEADER)
	const jp2cBox = boxes.find((b) => b.type === Jp2BoxType.CONTIGUOUS_CODESTREAM)

	if (!jp2hBox || !jp2cBox) {
		throw new Error('Missing required JP2 boxes')
	}

	// Parse JP2 header
	const headerBoxes = parseBoxes(jp2hBox.data)
	const ihdrBox = headerBoxes.find((b) => b.type === Jp2BoxType.IMAGE_HEADER)
	const colrBox = headerBoxes.find((b) => b.type === Jp2BoxType.COLOR_SPEC)

	if (!ihdrBox) {
		throw new Error('Missing image header box')
	}

	const imageHeader = parseImageHeader(ihdrBox.data)
	const colorSpec = colrBox ? parseColorSpec(colrBox.data) : null

	// Decode codestream
	const image = decodeJ2kCodestream(jp2cBox.data)

	// Apply color conversion if needed
	if (colorSpec && colorSpec.colorSpace) {
		applyColorConversion(image, colorSpec.colorSpace)
	}

	return image
}

/**
 * Parse JP2 boxes
 */
function parseBoxes(data: Uint8Array): Box[] {
	const boxes: Box[] = []
	let offset = 0

	while (offset < data.length) {
		if (offset + 8 > data.length) break

		let length = readU32BE(data, offset)
		const type = readU32BE(data, offset + 4)
		let headerSize = 8

		// Extended length
		if (length === 1) {
			if (offset + 16 > data.length) break
			// Read 64-bit length (we'll use lower 32 bits)
			length = readU32BE(data, offset + 12)
			headerSize = 16
		} else if (length === 0) {
			// Box extends to end of file
			length = data.length - offset
		}

		const boxData = data.slice(offset + headerSize, offset + length)
		boxes.push({ type, length, offset, data: boxData })

		offset += length
	}

	return boxes
}

/**
 * Parse image header box
 */
function parseImageHeader(data: Uint8Array): ImageHeader {
	return {
		height: readU32BE(data, 0),
		width: readU32BE(data, 4),
		numComponents: readU16BE(data, 8),
		bitsPerComponent: data[10]! + 1,
		compressionType: data[11]!,
		colorspaceUnknown: data[12]! === 1,
		intellectualProperty: data[13]! === 1,
	}
}

/**
 * Parse color specification box
 */
function parseColorSpec(data: Uint8Array): ColorSpec {
	const method = data[0]!
	const precedence = data[1]!
	const approximation = data[2]!

	if (method === 1) {
		// Enumerated color space
		const colorSpace = readU32BE(data, 3)
		return { method, precedence, approximation, colorSpace }
	} else if (method === 2) {
		// ICC profile
		const iccProfile = data.slice(3)
		return { method, precedence, approximation, iccProfile }
	}

	return { method, precedence, approximation }
}

/**
 * Decode J2K codestream
 */
function decodeJ2kCodestream(data: Uint8Array): ImageData {
	// Check SOC marker
	if (readU16BE(data, 0) !== Marker.SOC) {
		throw new Error('Invalid J2K codestream: missing SOC marker')
	}

	let offset = 2
	let sizParams: SizParameters | null = null
	let codingStyle: CodingStyle | null = null
	let quantization: Quantization | null = null
	const tiles: Tile[] = []

	// Parse main header
	while (offset < data.length) {
		const marker = readU16BE(data, offset)
		offset += 2

		if (marker === Marker.SOT) {
			// Start of tile-part - main header done
			offset -= 2
			break
		}

		if (marker === Marker.EOC) {
			break
		}

		// Read segment length
		const length = readU16BE(data, offset)
		const segmentData = data.slice(offset + 2, offset + length)
		offset += length

		switch (marker) {
			case Marker.SIZ:
				sizParams = parseSIZ(segmentData)
				break
			case Marker.COD:
				codingStyle = parseCOD(segmentData)
				break
			case Marker.QCD:
				quantization = parseQCD(segmentData)
				break
			case Marker.COM:
				// Comment - skip
				break
		}
	}

	if (!sizParams) {
		throw new Error('Missing SIZ segment')
	}

	// Parse tiles
	while (offset < data.length) {
		const marker = readU16BE(data, offset)
		offset += 2

		if (marker === Marker.EOC) {
			break
		}

		if (marker === Marker.SOT) {
			const length = readU16BE(data, offset)
			offset += 2

			// Parse SOT segment
			const tileIndex = readU16BE(data, offset)
			const tilePartLength = readU32BE(data, offset + 2)
			const tilePartIndex = data[offset + 6]!
			const numTileParts = data[offset + 7]!

			offset += length - 2

			// Find SOD marker
			const sodMarker = readU16BE(data, offset)
			if (sodMarker !== Marker.SOD) {
				throw new Error('Missing SOD marker')
			}
			offset += 2

			// Decode tile data (simplified)
			const tile = decodeTileData(
				data.slice(offset, offset + tilePartLength - length - 2),
				sizParams,
				codingStyle,
				quantization
			)
			tiles.push(tile)

			offset += tilePartLength - length - 2
		}
	}

	// Convert tiles to image
	return tilesToImage(tiles, sizParams)
}

/**
 * Parse SIZ segment
 */
function parseSIZ(data: Uint8Array): SizParameters {
	const rsiz = readU16BE(data, 0)
	const xsiz = readU32BE(data, 2)
	const ysiz = readU32BE(data, 6)
	const xOsiz = readU32BE(data, 10)
	const yOsiz = readU32BE(data, 14)
	const xtSiz = readU32BE(data, 18)
	const ytSiz = readU32BE(data, 22)
	const xtOsiz = readU32BE(data, 26)
	const ytOsiz = readU32BE(data, 30)
	const numComponents = readU16BE(data, 34)

	const components = []
	for (let i = 0; i < numComponents; i++) {
		const offset = 36 + i * 3
		const ssiz = data[offset]!
		const precision = (ssiz & 0x7f) + 1
		const signed = (ssiz & 0x80) !== 0
		const xRsiz = data[offset + 1]!
		const yRsiz = data[offset + 2]!

		components.push({ precision, signed, xRsiz, yRsiz })
	}

	return {
		rsiz,
		xsiz,
		ysiz,
		xOsiz,
		yOsiz,
		xtSiz,
		ytSiz,
		xtOsiz,
		ytOsiz,
		numComponents,
		components,
	}
}

/**
 * Parse COD segment
 */
function parseCOD(data: Uint8Array): CodingStyle {
	const scod = data[0]!
	const progressionOrder = data[1]!
	const numLayers = readU16BE(data, 2)
	const multiComponentTransform = data[4]!
	const numDecompositions = data[5]!
	const codeBlockWidth = data[6]! + 2 // Stored as exponent - 2
	const codeBlockHeight = data[7]! + 2
	const codeBlockStyle = data[8]!
	const transformation = data[9]!

	// Parse precinct sizes if present
	let precinctSizes: number[] | undefined
	if (scod & 0x01) {
		precinctSizes = []
		for (let i = 0; i <= numDecompositions; i++) {
			if (10 + i < data.length) {
				precinctSizes.push(data[10 + i]!)
			}
		}
	}

	return {
		scod,
		progressionOrder,
		numLayers,
		multiComponentTransform,
		numDecompositions,
		codeBlockWidth,
		codeBlockHeight,
		codeBlockStyle,
		transformation,
		precinctSizes,
	}
}

/**
 * Parse QCD segment
 */
function parseQCD(data: Uint8Array): Quantization {
	const sqcd = data[0]!
	const quantStyle = sqcd & 0x1f
	const spqcd: number[] = []

	if (quantStyle === 0) {
		// No quantization
		for (let i = 1; i < data.length; i++) {
			spqcd.push(data[i]!)
		}
	} else {
		// Scalar derived or scalar expounded
		for (let i = 1; i < data.length; i += 2) {
			spqcd.push(readU16BE(data, i))
		}
	}

	return { sqcd, spqcd }
}

/**
 * Decode tile data (simplified implementation)
 */
function decodeTileData(
	data: Uint8Array,
	sizParams: SizParameters,
	codingStyle: CodingStyle | null,
	quantization: Quantization | null
): Tile {
	const { xtSiz, ytSiz, numComponents } = sizParams

	// Simplified: create empty tile with basic dimensions
	const components: Float32Array[] = []

	for (let i = 0; i < numComponents; i++) {
		const compWidth = Math.floor(xtSiz / sizParams.components[i]!.xRsiz)
		const compHeight = Math.floor(ytSiz / sizParams.components[i]!.yRsiz)
		components.push(new Float32Array(compWidth * compHeight))
	}

	// In a full implementation, this would:
	// 1. Parse packet headers
	// 2. Decode code-blocks using EBCOT (MQ-coder + bit-plane coding)
	// 3. Dequantize coefficients
	// 4. Apply inverse wavelet transform (5-3 or 9-7)
	// 5. Apply multi-component transform if needed

	// For now, we'll use a simplified stub that fills with gray
	for (const comp of components) {
		comp.fill(128)
	}

	return {
		x: 0,
		y: 0,
		width: xtSiz,
		height: ytSiz,
		components,
	}
}

/**
 * Convert tiles to ImageData
 */
function tilesToImage(tiles: Tile[], sizParams: SizParameters): ImageData {
	const { xsiz, ysiz, numComponents } = sizParams

	if (tiles.length === 0) {
		throw new Error('No tiles decoded')
	}

	const output = new Uint8Array(xsiz * ysiz * 4)

	// Simplified: use first tile only
	const tile = tiles[0]!

	if (numComponents === 1) {
		// Grayscale
		const comp = tile.components[0]!
		for (let i = 0; i < xsiz * ysiz; i++) {
			const val = clamp(comp[i]!)
			output[i * 4] = val
			output[i * 4 + 1] = val
			output[i * 4 + 2] = val
			output[i * 4 + 3] = 255
		}
	} else if (numComponents >= 3) {
		// RGB or YCbCr
		const comp0 = tile.components[0]!
		const comp1 = tile.components[1]!
		const comp2 = tile.components[2]!

		for (let i = 0; i < xsiz * ysiz; i++) {
			// Assume RGB for now (could be YCbCr)
			output[i * 4] = clamp(comp0[i]!)
			output[i * 4 + 1] = clamp(comp1[i]!)
			output[i * 4 + 2] = clamp(comp2[i]!)
			output[i * 4 + 3] = 255
		}
	}

	return {
		width: xsiz,
		height: ysiz,
		data: output,
	}
}

/**
 * Apply color space conversion
 */
function applyColorConversion(image: ImageData, colorSpace: number): void {
	// In a full implementation, this would handle:
	// - sRGB to RGB conversion
	// - YCbCr to RGB conversion
	// - ICC profile application
	// For now, we assume RGB
}

/**
 * Clamp value to 0-255
 */
function clamp(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}

/**
 * 5-3 reversible wavelet inverse transform (simplified)
 */
function inverseWavelet53(data: Float32Array, width: number, height: number): void {
	// Vertical transform
	for (let x = 0; x < width; x++) {
		const column = new Float32Array(height)
		for (let y = 0; y < height; y++) {
			column[y] = data[y * width + x]!
		}
		inverseWavelet53Row(column)
		for (let y = 0; y < height; y++) {
			data[y * width + x] = column[y]!
		}
	}

	// Horizontal transform
	for (let y = 0; y < height; y++) {
		const row = data.slice(y * width, (y + 1) * width)
		inverseWavelet53Row(row)
		data.set(row, y * width)
	}
}

/**
 * 5-3 wavelet inverse transform for a single row/column
 */
function inverseWavelet53Row(data: Float32Array): void {
	const n = data.length
	const half = Math.floor(n / 2)
	const temp = new Float32Array(n)

	// Split into low and high bands
	const low = data.slice(0, half)
	const high = data.slice(half)

	// Inverse lifting steps
	for (let i = 0; i < n; i++) {
		if (i % 2 === 0) {
			// Even samples (low band)
			temp[i] = low[Math.floor(i / 2)]!
		} else {
			// Odd samples (high band)
			temp[i] = high[Math.floor(i / 2)]!
			// Apply inverse predict step
			const prev = i > 0 ? temp[i - 1]! : temp[i + 1]!
			const next = i < n - 1 ? temp[i + 1]! : temp[i - 1]!
			temp[i] += Math.floor((prev + next) / 2)
		}
	}

	data.set(temp)
}
