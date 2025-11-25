/**
 * OpenEXR encoder
 * Outputs: Scanline, HALF pixel type, no compression
 */

import type { ImageData } from '@sylphx/codec-core'
import { ExrCompression, type ExrEncodeOptions, ExrLineOrder, ExrPixelType } from './types'

/**
 * Encode ImageData to EXR format
 */
export function encodeExr(image: ImageData, options: ExrEncodeOptions = {}): Uint8Array {
	const { compression = ExrCompression.NONE } = options
	const { width, height, data } = image

	// Convert 8-bit to float (inverse tone mapping)
	const floatData = new Float32Array(width * height * 4)
	for (let i = 0; i < width * height; i++) {
		const r = data[i * 4]! / 255
		const g = data[i * 4 + 1]! / 255
		const b = data[i * 4 + 2]! / 255
		const a = data[i * 4 + 3]! / 255

		// Inverse Reinhard
		floatData[i * 4] = r / (1 - r + 0.001)
		floatData[i * 4 + 1] = g / (1 - g + 0.001)
		floatData[i * 4 + 2] = b / (1 - b + 0.001)
		floatData[i * 4 + 3] = a
	}

	return encodeExrHdr({ width, height, data: floatData }, options)
}

/**
 * Encode HDR float data to EXR format
 */
export function encodeExrHdr(
	image: { width: number; height: number; data: Float32Array },
	options: ExrEncodeOptions = {}
): Uint8Array {
	const { compression = ExrCompression.NONE } = options
	const { width, height, data } = image

	// Build header
	const header = buildHeader(width, height, compression)

	// Encode scanlines
	const scanlines: Uint8Array[] = []
	for (let y = 0; y < height; y++) {
		scanlines.push(encodeScanline(data, y, width, compression))
	}

	// Calculate offset table
	const offsetTableStart = 8 + header.length // magic + version + header
	const offsets: bigint[] = []
	let currentOffset = BigInt(offsetTableStart + height * 8) // After offset table

	for (let y = 0; y < height; y++) {
		offsets.push(currentOffset)
		currentOffset += BigInt(scanlines[y]!.length)
	}

	// Build final buffer
	const totalSize = Number(currentOffset)
	const output = new Uint8Array(totalSize)
	let offset = 0

	// Magic number
	writeU32LE(output, offset, 0x01312f76)
	offset += 4

	// Version (2 = scanline)
	writeU32LE(output, offset, 2)
	offset += 4

	// Header
	output.set(header, offset)
	offset += header.length

	// Offset table
	for (const off of offsets) {
		writeU64LE(output, offset, off)
		offset += 8
	}

	// Scanlines
	for (const scanline of scanlines) {
		output.set(scanline, offset)
		offset += scanline.length
	}

	return output
}

function buildHeader(width: number, height: number, compression: ExrCompression): Uint8Array {
	const parts: Uint8Array[] = []

	// channels attribute
	parts.push(writeAttribute('channels', 'chlist', buildChannelList()))

	// compression
	parts.push(writeAttribute('compression', 'compression', new Uint8Array([compression])))

	// dataWindow
	parts.push(writeAttribute('dataWindow', 'box2i', buildBox2i(0, 0, width - 1, height - 1)))

	// displayWindow
	parts.push(writeAttribute('displayWindow', 'box2i', buildBox2i(0, 0, width - 1, height - 1)))

	// lineOrder
	parts.push(writeAttribute('lineOrder', 'lineOrder', new Uint8Array([ExrLineOrder.INCREASING_Y])))

	// pixelAspectRatio
	parts.push(writeAttribute('pixelAspectRatio', 'float', writeF32(1.0)))

	// screenWindowCenter
	const center = new Uint8Array(8)
	const centerView = new DataView(center.buffer)
	centerView.setFloat32(0, 0, true)
	centerView.setFloat32(4, 0, true)
	parts.push(writeAttribute('screenWindowCenter', 'v2f', center))

	// screenWindowWidth
	parts.push(writeAttribute('screenWindowWidth', 'float', writeF32(1.0)))

	// End of header
	parts.push(new Uint8Array([0]))

	// Concatenate
	let totalLen = 0
	for (const p of parts) totalLen += p.length
	const result = new Uint8Array(totalLen)
	let offset = 0
	for (const p of parts) {
		result.set(p, offset)
		offset += p.length
	}

	return result
}

function buildChannelList(): Uint8Array {
	const channels = ['A', 'B', 'G', 'R'] // Alphabetical order required
	const parts: Uint8Array[] = []

	for (const name of channels) {
		// Channel name + null
		const nameBytes = new Uint8Array(name.length + 1)
		for (let i = 0; i < name.length; i++) {
			nameBytes[i] = name.charCodeAt(i)
		}
		parts.push(nameBytes)

		// Pixel type (HALF = 1)
		const info = new Uint8Array(16)
		writeU32LE(info, 0, ExrPixelType.HALF)
		info[4] = 0 // pLinear
		// 3 bytes reserved
		writeU32LE(info, 8, 1) // xSampling
		writeU32LE(info, 12, 1) // ySampling
		parts.push(info)
	}

	// Null terminator for channel list
	parts.push(new Uint8Array([0]))

	let totalLen = 0
	for (const p of parts) totalLen += p.length
	const result = new Uint8Array(totalLen)
	let offset = 0
	for (const p of parts) {
		result.set(p, offset)
		offset += p.length
	}

	return result
}

function buildBox2i(xMin: number, yMin: number, xMax: number, yMax: number): Uint8Array {
	const data = new Uint8Array(16)
	writeI32LE(data, 0, xMin)
	writeI32LE(data, 4, yMin)
	writeI32LE(data, 8, xMax)
	writeI32LE(data, 12, yMax)
	return data
}

function writeAttribute(name: string, type: string, value: Uint8Array): Uint8Array {
	const nameBytes = name.length + 1
	const typeBytes = type.length + 1
	const result = new Uint8Array(nameBytes + typeBytes + 4 + value.length)

	let offset = 0

	// Name
	for (let i = 0; i < name.length; i++) {
		result[offset++] = name.charCodeAt(i)
	}
	result[offset++] = 0

	// Type
	for (let i = 0; i < type.length; i++) {
		result[offset++] = type.charCodeAt(i)
	}
	result[offset++] = 0

	// Size
	writeU32LE(result, offset, value.length)
	offset += 4

	// Value
	result.set(value, offset)

	return result
}

function encodeScanline(
	data: Float32Array,
	y: number,
	width: number,
	compression: ExrCompression
): Uint8Array {
	// Each scanline: y coordinate (4), pixel data size (4), pixel data
	// Pixel data: interleaved channels A, B, G, R in HALF format

	const pixelDataSize = width * 4 * 2 // 4 channels, 2 bytes per HALF
	const result = new Uint8Array(8 + pixelDataSize)

	writeI32LE(result, 0, y)
	writeU32LE(result, 4, pixelDataSize)

	let offset = 8

	// Write channels in alphabetical order: A, B, G, R
	const channelOrder = [3, 2, 1, 0] // A=3, B=2, G=1, R=0

	for (const ch of channelOrder) {
		for (let x = 0; x < width; x++) {
			const value = data[(y * width + x) * 4 + ch]!
			const half = floatToHalf(value)
			writeU16LE(result, offset, half)
			offset += 2
		}
	}

	return result
}

// Float to half-precision conversion
function floatToHalf(value: number): number {
	if (value === 0) return 0
	if (Number.isNaN(value)) return 0x7fff
	if (value === Number.POSITIVE_INFINITY) return 0x7c00
	if (value === Number.NEGATIVE_INFINITY) return 0xfc00

	const sign = value < 0 ? 1 : 0
	const f = Math.abs(value)

	if (f < 2 ** -24) {
		// Too small, flush to zero
		return sign << 15
	}

	if (f >= 65504) {
		// Too large, clamp to max
		return (sign << 15) | 0x7bff
	}

	const exponent = Math.floor(Math.log2(f))
	const mantissa = f / 2 ** exponent - 1

	if (exponent < -14) {
		// Denormalized
		const denormMantissa = Math.round(f * 2 ** 24)
		return (sign << 15) | denormMantissa
	}

	const biasedExp = exponent + 15
	const mantissaBits = Math.round(mantissa * 1024)

	return (sign << 15) | (biasedExp << 10) | mantissaBits
}

function writeF32(value: number): Uint8Array {
	const buf = new Uint8Array(4)
	const view = new DataView(buf.buffer)
	view.setFloat32(0, value, true)
	return buf
}

function writeU16LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
	data[offset] = value & 0xff
	data[offset + 1] = (value >> 8) & 0xff
	data[offset + 2] = (value >> 16) & 0xff
	data[offset + 3] = (value >> 24) & 0xff
}

function writeI32LE(data: Uint8Array, offset: number, value: number): void {
	writeU32LE(data, offset, value < 0 ? value + 0x100000000 : value)
}

function writeU64LE(data: Uint8Array, offset: number, value: bigint): void {
	const lo = Number(value & 0xffffffffn)
	const hi = Number((value >> 32n) & 0xffffffffn)
	writeU32LE(data, offset, lo)
	writeU32LE(data, offset + 4, hi)
}
