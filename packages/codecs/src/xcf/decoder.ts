/**
 * GIMP XCF decoder
 * Decodes flattened composite image from XCF files
 * Supports: XCF v001-v003, RGB/Grayscale, RLE compression, layer flattening
 */

import type { ImageData } from '@sylphx/codec-core'
import {
	XcfCompression,
	XcfImageType,
	XcfLayerMode,
	XcfPropertyType,
	type XcfHeader,
	type XcfInfo,
	type XcfLayer,
} from './types'

const XCF_SIGNATURE = 'gimp xcf '
const TILE_WIDTH = 64
const TILE_HEIGHT = 64

/**
 * Check if data is an XCF file
 */
export function isXcf(data: Uint8Array): boolean {
	if (data.length < 14) return false
	// Check "gimp xcf " signature
	return (
		data[0] === 0x67 && // 'g'
		data[1] === 0x69 && // 'i'
		data[2] === 0x6d && // 'm'
		data[3] === 0x70 && // 'p'
		data[4] === 0x20 && // ' '
		data[5] === 0x78 && // 'x'
		data[6] === 0x63 && // 'c'
		data[7] === 0x66 && // 'f'
		data[8] === 0x20 // ' '
	)
}

/**
 * Parse XCF header and info
 */
export function parseXcf(data: Uint8Array): XcfInfo {
	const header = parseHeader(data)
	const layers = parseLayers(data, header)
	// Check if image has alpha based on both layers and image type
	const hasAlpha =
		layers.length > 0
			? layers.some((layer) => layer.hasAlpha) ||
			  header.imageType === XcfImageType.RGB ||
			  header.imageType === XcfImageType.GRAYSCALE
			: header.imageType === XcfImageType.RGB || header.imageType === XcfImageType.GRAYSCALE

	return { header, layers, hasAlpha }
}

/**
 * Decode XCF to ImageData (flattened composite)
 */
export function decodeXcf(data: Uint8Array): ImageData {
	const header = parseHeader(data)
	const { width, height, imageType } = header

	// Parse layers
	const layers = parseLayers(data, header)

	// Create output buffer (always RGBA)
	const output = new Uint8Array(width * height * 4)

	// Initialize with white background
	for (let i = 0; i < width * height; i++) {
		output[i * 4] = 255
		output[i * 4 + 1] = 255
		output[i * 4 + 2] = 255
		output[i * 4 + 3] = 255
	}

	// Flatten layers from bottom to top
	for (let i = layers.length - 1; i >= 0; i--) {
		const layer = layers[i]!
		if (!layer.visible) continue

		const layerData = decodeLayer(data, layer, header)
		compositeLayer(output, layerData, layer, width, height)
	}

	return { width, height, data: output }
}

function parseHeader(data: Uint8Array): XcfHeader {
	if (data.length < 26) {
		throw new Error('Invalid XCF: file too short')
	}

	// Check signature "gimp xcf " (9 bytes)
	let signature = ''
	for (let i = 0; i < 9; i++) {
		signature += String.fromCharCode(data[i]!)
	}

	if (!signature.startsWith(XCF_SIGNATURE)) {
		throw new Error('Invalid XCF: bad signature')
	}

	// Parse version string (e.g., "001", "002", "003") followed by null terminator
	// Version starts at byte 9
	let version = 0
	for (let i = 9; i < 12; i++) {
		const char = data[i]!
		if (char >= 0x30 && char <= 0x39) {
			// '0'-'9'
			version = version * 10 + (char - 0x30)
		}
	}

	// Find null terminator after version
	let offset = 9
	while (offset < data.length && data[offset] !== 0) {
		offset++
	}
	offset++ // Skip null terminator

	// Read width, height, image type
	const width = readU32BE(data, offset)
	offset += 4
	const height = readU32BE(data, offset)
	offset += 4
	const imageType = readU32BE(data, offset) as XcfImageType
	offset += 4

	// Read precision for v003+ (defaults to 150 for older versions)
	let precision = 150
	if (version >= 3) {
		precision = readU32BE(data, offset)
	}

	return { signature, version, width, height, imageType, precision }
}

interface LayerWithOffset extends XcfLayer {
	_hierarchyOffset?: number
}

function parseLayers(data: Uint8Array, header: XcfHeader): LayerWithOffset[] {
	const layers: LayerWithOffset[] = []

	// Calculate header size: "gimp xcf " + version (3 chars) + null + width + height + type
	let offset = 9 // "gimp xcf "
	while (offset < data.length && data[offset] !== 0) {
		offset++
	}
	offset++ // Skip null terminator
	offset += 12 // width (4) + height (4) + type (4)

	// Skip precision for v003+
	if (header.version >= 3) {
		offset += 4
	}

	// Skip image properties
	offset = skipProperties(data, offset)

	// Parse layer pointers
	const layerOffsets: number[] = []
	while (true) {
		const layerOffset = readU32BE(data, offset)
		offset += 4
		if (layerOffset === 0) break
		layerOffsets.push(layerOffset)
	}

	// Parse each layer
	for (const layerOffset of layerOffsets) {
		const layer = parseLayer(data, layerOffset, header)
		layers.push(layer)
	}

	return layers
}

function parseLayer(data: Uint8Array, offset: number, header: XcfHeader): LayerWithOffset {
	const width = readU32BE(data, offset)
	offset += 4
	const height = readU32BE(data, offset)
	offset += 4
	const layerType = readU32BE(data, offset) as XcfImageType
	offset += 4

	// Read layer name (null-terminated string)
	const nameLen = readU32BE(data, offset)
	offset += 4
	let name = ''
	for (let i = 0; i < nameLen - 1; i++) {
		// -1 to skip null terminator
		name += String.fromCharCode(data[offset + i]!)
	}
	offset += nameLen

	// Parse properties
	let opacity = 255
	let visible = true
	let mode = XcfLayerMode.NORMAL
	let offsetX = 0
	let offsetY = 0

	while (true) {
		const propType = readU32BE(data, offset) as XcfPropertyType
		offset += 4
		const propSize = readU32BE(data, offset)
		offset += 4

		if (propType === XcfPropertyType.END) {
			break
		}

		switch (propType) {
			case XcfPropertyType.OPACITY:
				opacity = readU32BE(data, offset)
				break
			case XcfPropertyType.VISIBLE:
				visible = readU32BE(data, offset) !== 0
				break
			case XcfPropertyType.MODE:
				mode = readU32BE(data, offset) as XcfLayerMode
				break
			case XcfPropertyType.OFFSETS:
				offsetX = readI32BE(data, offset)
				offsetY = readI32BE(data, offset + 4)
				break
		}

		offset += propSize
	}

	// Read hierarchy pointer
	const hierarchyOffset = readU32BE(data, offset)

	// Determine if layer has alpha
	const hasAlpha = layerType === XcfImageType.RGB || layerType === XcfImageType.GRAYSCALE

	return {
		name,
		width,
		height,
		layerType,
		offsetX,
		offsetY,
		opacity,
		visible,
		mode,
		hasAlpha,
		_hierarchyOffset: hierarchyOffset,
	}
}

function skipProperties(data: Uint8Array, offset: number): number {
	while (true) {
		const propType = readU32BE(data, offset) as XcfPropertyType
		offset += 4
		const propSize = readU32BE(data, offset)
		offset += 4

		if (propType === XcfPropertyType.END) {
			break
		}

		offset += propSize
	}
	return offset
}

function decodeLayer(
	data: Uint8Array,
	layer: LayerWithOffset,
	header: XcfHeader
): Uint8Array {
	const { width, height, layerType, _hierarchyOffset } = layer
	const bpp = layerType === XcfImageType.RGB ? 4 : 2 // RGB+A or Gray+A

	if (!_hierarchyOffset || _hierarchyOffset === 0) {
		// Return empty/transparent layer if hierarchy not found
		return new Uint8Array(width * height * bpp)
	}

	const hierarchyOffset = _hierarchyOffset

	// Parse hierarchy
	let offset = hierarchyOffset
	const hierWidth = readU32BE(data, offset)
	offset += 4
	const hierHeight = readU32BE(data, offset)
	offset += 4
	const hierBpp = readU32BE(data, offset)
	offset += 4

	// Skip to level pointer
	const levelOffset = readU32BE(data, offset)

	// Parse level (only read first level for flattened image)
	offset = levelOffset
	const levelWidth = readU32BE(data, offset)
	offset += 4
	const levelHeight = readU32BE(data, offset)
	offset += 4

	// Read tile pointers
	const tilesWide = Math.ceil(levelWidth / TILE_WIDTH)
	const tilesHigh = Math.ceil(levelHeight / TILE_HEIGHT)
	const tileOffsets: number[] = []

	for (let i = 0; i < tilesWide * tilesHigh; i++) {
		const tileOffset = readU32BE(data, offset)
		offset += 4
		if (tileOffset === 0) break
		tileOffsets.push(tileOffset)
	}

	// Create output buffer
	const output = new Uint8Array(width * height * bpp)

	// Decode each tile
	for (let ty = 0; ty < tilesHigh; ty++) {
		for (let tx = 0; tx < tilesWide; tx++) {
			const tileIdx = ty * tilesWide + tx
			if (tileIdx >= tileOffsets.length) break

			const tileOffset = tileOffsets[tileIdx]!
			const tileData = decodeTile(data, tileOffset, tx, ty, width, height, hierBpp)

			// Copy tile data to output
			const tileX = tx * TILE_WIDTH
			const tileY = ty * TILE_HEIGHT
			const tileW = Math.min(TILE_WIDTH, width - tileX)
			const tileH = Math.min(TILE_HEIGHT, height - tileY)

			for (let y = 0; y < tileH; y++) {
				for (let x = 0; x < tileW; x++) {
					const srcIdx = (y * tileW + x) * hierBpp
					const dstIdx = ((tileY + y) * width + (tileX + x)) * bpp
					for (let c = 0; c < bpp; c++) {
						output[dstIdx + c] = tileData[srcIdx + c] ?? 0
					}
				}
			}
		}
	}

	return output
}

function decodeTile(
	data: Uint8Array,
	offset: number,
	tx: number,
	ty: number,
	layerWidth: number,
	layerHeight: number,
	bpp: number
): Uint8Array {
	// Calculate tile dimensions
	const tileX = tx * TILE_WIDTH
	const tileY = ty * TILE_HEIGHT
	const tileW = Math.min(TILE_WIDTH, layerWidth - tileX)
	const tileH = Math.min(TILE_HEIGHT, layerHeight - tileY)
	const tileSize = tileW * tileH * bpp

	// Check compression type (in XCF v002+, tiles can be compressed)
	// For simplicity, we'll assume uncompressed or RLE
	const output = new Uint8Array(tileSize)

	// Simple heuristic: if remaining data is much smaller than expected, it's compressed
	const expectedSize = tileSize
	const availableSize = data.length - offset

	if (availableSize >= expectedSize) {
		// Likely uncompressed
		output.set(data.slice(offset, offset + tileSize))
	} else {
		// Try RLE decompression
		decodeRleTile(data, offset, output, tileSize)
	}

	return output
}

function decodeRleTile(data: Uint8Array, offset: number, output: Uint8Array, size: number): void {
	let srcPos = offset
	let dstPos = 0

	while (dstPos < size && srcPos < data.length) {
		const header = data[srcPos++]!

		if (header < 128) {
			// Literal run: copy (header + 1) bytes
			const len = header + 1
			for (let i = 0; i < len && dstPos < size && srcPos < data.length; i++) {
				output[dstPos++] = data[srcPos++]!
			}
		} else if (header > 128) {
			// RLE run: repeat next byte (257 - header) times
			const len = 257 - header
			const value = data[srcPos++]!
			for (let i = 0; i < len && dstPos < size; i++) {
				output[dstPos++] = value
			}
		}
		// header === 128 is a no-op
	}
}

function compositeLayer(
	output: Uint8Array,
	layerData: Uint8Array,
	layer: XcfLayer,
	canvasWidth: number,
	canvasHeight: number
): void {
	const { width, height, layerType, offsetX, offsetY, opacity } = layer
	const alpha = opacity / 255

	for (let y = 0; y < height; y++) {
		const canvasY = y + offsetY
		if (canvasY < 0 || canvasY >= canvasHeight) continue

		for (let x = 0; x < width; x++) {
			const canvasX = x + offsetX
			if (canvasX < 0 || canvasX >= canvasWidth) continue

			const dstIdx = (canvasY * canvasWidth + canvasX) * 4
			const srcIdx = (y * width + x) * (layerType === XcfImageType.RGB ? 4 : 2)

			let r: number
			let g: number
			let b: number
			let a: number

			if (layerType === XcfImageType.RGB) {
				r = layerData[srcIdx] ?? 0
				g = layerData[srcIdx + 1] ?? 0
				b = layerData[srcIdx + 2] ?? 0
				a = (layerData[srcIdx + 3] ?? 255) / 255
			} else {
				// Grayscale
				const gray = layerData[srcIdx] ?? 0
				r = gray
				g = gray
				b = gray
				a = (layerData[srcIdx + 1] ?? 255) / 255
			}

			// Apply layer opacity
			a *= alpha

			// Simple alpha compositing (source-over)
			const dstR = output[dstIdx]!
			const dstG = output[dstIdx + 1]!
			const dstB = output[dstIdx + 2]!
			const dstA = output[dstIdx + 3]! / 255

			const outA = a + dstA * (1 - a)
			if (outA > 0) {
				output[dstIdx] = Math.round((r * a + dstR * dstA * (1 - a)) / outA)
				output[dstIdx + 1] = Math.round((g * a + dstG * dstA * (1 - a)) / outA)
				output[dstIdx + 2] = Math.round((b * a + dstB * dstA * (1 - a)) / outA)
				output[dstIdx + 3] = Math.round(outA * 255)
			}
		}
	}
}

// Binary reading helpers (Big Endian)
function readU32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset]! << 24) |
			(data[offset + 1]! << 16) |
			(data[offset + 2]! << 8) |
			data[offset + 3]!) >>>
		0
	)
}

function readI32BE(data: Uint8Array, offset: number): number {
	const u = readU32BE(data, offset)
	return u > 0x7fffffff ? u - 0x100000000 : u
}
