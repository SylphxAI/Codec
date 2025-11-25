import type { ImageData } from '@mconv/core'
import { idct8x8 } from './dct'
import { JpegBitReader, buildHuffmanTable } from './huffman'
import type { Component, FrameInfo, HuffmanTable, QuantTable } from './types'
import { Marker, ZIGZAG } from './types'

/**
 * Read 16-bit big-endian value
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * JPEG Decoder state
 */
interface DecoderState {
	frame: FrameInfo | null
	quantTables: Map<number, QuantTable>
	dcTables: Map<number, HuffmanTable>
	acTables: Map<number, HuffmanTable>
	restartInterval: number
}

/**
 * Parse JPEG markers and decode image
 */
export function decodeJpeg(data: Uint8Array): ImageData {
	if (data[0] !== 0xff || data[1] !== 0xd8) {
		throw new Error('Invalid JPEG signature')
	}

	const state: DecoderState = {
		frame: null,
		quantTables: new Map(),
		dcTables: new Map(),
		acTables: new Map(),
		restartInterval: 0,
	}

	let pos = 2

	while (pos < data.length) {
		// Find next marker
		if (data[pos] !== 0xff) {
			pos++
			continue
		}

		while (data[pos] === 0xff) pos++
		const marker = 0xff00 | data[pos++]!

		// End of image
		if (marker === Marker.EOI) break

		// Markers without length
		if (marker === Marker.SOI || (marker >= Marker.RST0 && marker <= Marker.RST7)) {
			continue
		}

		// Read segment length
		const length = readU16BE(data, pos)
		const segmentData = data.slice(pos + 2, pos + length)
		pos += length

		switch (marker) {
			case Marker.DQT:
				parseDQT(segmentData, state)
				break

			case Marker.DHT:
				parseDHT(segmentData, state)
				break

			case Marker.SOF0:
			case Marker.SOF1:
				state.frame = parseSOF(segmentData)
				break

			case Marker.SOF2:
				throw new Error('Progressive JPEG not supported')

			case Marker.DRI:
				state.restartInterval = readU16BE(segmentData, 0)
				break

			case Marker.SOS:
				return decodeScan(data, pos, segmentData, state)

			// Skip APP and COM segments
			default:
				break
		}
	}

	throw new Error('No image data found')
}

/**
 * Parse DQT (Define Quantization Table) segment
 */
function parseDQT(data: Uint8Array, state: DecoderState): void {
	let offset = 0

	while (offset < data.length) {
		const info = data[offset++]!
		const precision = info >> 4 // 0 = 8-bit, 1 = 16-bit
		const tableId = info & 0x0f

		const table: QuantTable = new Array(64)
		for (let i = 0; i < 64; i++) {
			if (precision === 0) {
				table[ZIGZAG[i]!] = data[offset++]!
			} else {
				table[ZIGZAG[i]!] = readU16BE(data, offset)
				offset += 2
			}
		}

		state.quantTables.set(tableId, table)
	}
}

/**
 * Parse DHT (Define Huffman Table) segment
 */
function parseDHT(data: Uint8Array, state: DecoderState): void {
	let offset = 0

	while (offset < data.length) {
		const info = data[offset++]!
		const tableClass = info >> 4 // 0 = DC, 1 = AC
		const tableId = info & 0x0f

		// Read number of codes for each length
		const bits: number[] = []
		let totalCodes = 0
		for (let i = 0; i < 16; i++) {
			bits[i] = data[offset++]!
			totalCodes += bits[i]!
		}

		// Read symbol values
		const values: number[] = []
		for (let i = 0; i < totalCodes; i++) {
			values[i] = data[offset++]!
		}

		const table = buildHuffmanTable(bits, values)

		if (tableClass === 0) {
			state.dcTables.set(tableId, table)
		} else {
			state.acTables.set(tableId, table)
		}
	}
}

/**
 * Parse SOF (Start of Frame) segment
 */
function parseSOF(data: Uint8Array): FrameInfo {
	const precision = data[0]!
	const height = readU16BE(data, 1)
	const width = readU16BE(data, 3)
	const numComponents = data[5]!

	const components: Component[] = []
	let maxHSamp = 1
	let maxVSamp = 1

	for (let i = 0; i < numComponents; i++) {
		const offset = 6 + i * 3
		const id = data[offset]!
		const sampling = data[offset + 1]!
		const hSamp = sampling >> 4
		const vSamp = sampling & 0x0f
		const qTableId = data[offset + 2]!

		maxHSamp = Math.max(maxHSamp, hSamp)
		maxVSamp = Math.max(maxVSamp, vSamp)

		components.push({
			id,
			hSamp,
			vSamp,
			qTableId,
			dcTableId: 0,
			acTableId: 0,
		})
	}

	return { precision, height, width, components, maxHSamp, maxVSamp }
}

/**
 * Parse SOS (Start of Scan) segment and decode scan data
 */
function decodeScan(
	data: Uint8Array,
	scanStart: number,
	sosData: Uint8Array,
	state: DecoderState
): ImageData {
	const frame = state.frame
	if (!frame) throw new Error('No frame info')

	// Parse SOS header
	const numComponents = sosData[0]!
	const scanComponents: Component[] = []

	for (let i = 0; i < numComponents; i++) {
		const offset = 1 + i * 2
		const componentId = sosData[offset]!
		const tableIds = sosData[offset + 1]!

		const component = frame.components.find((c) => c.id === componentId)
		if (!component) throw new Error(`Unknown component: ${componentId}`)

		component.dcTableId = tableIds >> 4
		component.acTableId = tableIds & 0x0f
		scanComponents.push(component)
	}

	// Decode entropy-coded data
	const reader = new JpegBitReader(data, scanStart)
	const { width, height, maxHSamp, maxVSamp } = frame

	// Calculate MCU dimensions
	const mcuWidth = maxHSamp * 8
	const mcuHeight = maxVSamp * 8
	const mcusPerRow = Math.ceil(width / mcuWidth)
	const mcusPerCol = Math.ceil(height / mcuHeight)

	// Allocate component buffers
	const componentBuffers: Float32Array[] = scanComponents.map((comp) => {
		const compWidth = Math.ceil((width * comp.hSamp) / maxHSamp / 8) * 8
		const compHeight = Math.ceil((height * comp.vSamp) / maxVSamp / 8) * 8
		return new Float32Array(compWidth * compHeight)
	})

	// DC predictors for each component
	const dcPred = new Array(scanComponents.length).fill(0)

	// Decode MCUs
	let restartCounter = 0
	for (let mcuY = 0; mcuY < mcusPerCol; mcuY++) {
		for (let mcuX = 0; mcuX < mcusPerRow; mcuX++) {
			// Check restart
			if (state.restartInterval > 0 && restartCounter === state.restartInterval) {
				reader.alignToByte()
				dcPred.fill(0)
				restartCounter = 0
			}

			// Decode each component in MCU
			for (let compIdx = 0; compIdx < scanComponents.length; compIdx++) {
				const comp = scanComponents[compIdx]!
				const buffer = componentBuffers[compIdx]!
				const dcTable = state.dcTables.get(comp.dcTableId)!
				const acTable = state.acTables.get(comp.acTableId)!
				const qTable = state.quantTables.get(comp.qTableId)!

				// Each component may have multiple blocks per MCU
				for (let blockY = 0; blockY < comp.vSamp; blockY++) {
					for (let blockX = 0; blockX < comp.hSamp; blockX++) {
						const block = decodeBlock(reader, dcTable, acTable, dcPred, compIdx)

						// Dequantize
						for (let i = 0; i < 64; i++) {
							block[i]! *= qTable[i]
						}

						// IDCT
						const pixels = idct8x8(block)

						// Store in component buffer
						const compWidth = Math.ceil((width * comp.hSamp) / maxHSamp / 8) * 8
						const baseX = (mcuX * comp.hSamp + blockX) * 8
						const baseY = (mcuY * comp.vSamp + blockY) * 8

						for (let y = 0; y < 8; y++) {
							for (let x = 0; x < 8; x++) {
								const px = baseX + x
								const py = baseY + y
								if (px < compWidth) {
									buffer[py * compWidth + px] = pixels[y * 8 + x]!
								}
							}
						}
					}
				}
			}

			restartCounter++
		}
	}

	// Convert to RGB
	return convertToRGB(componentBuffers, scanComponents, frame, width, height)
}

/**
 * Decode a single 8x8 block
 */
function decodeBlock(
	reader: JpegBitReader,
	dcTable: HuffmanTable,
	acTable: HuffmanTable,
	dcPred: number[],
	compIdx: number
): number[] {
	const block = new Array(64).fill(0)

	// Decode DC coefficient
	const dcLength = reader.decodeHuffman(dcTable)
	const dcDiff = reader.receiveExtend(dcLength)
	dcPred[compIdx] += dcDiff
	block[0] = dcPred[compIdx]!

	// Decode AC coefficients
	let k = 1
	while (k < 64) {
		const rs = reader.decodeHuffman(acTable)

		if (rs === 0) {
			// EOB (End of Block)
			break
		}

		const r = rs >> 4 // Run of zeros
		const s = rs & 0x0f // Size of coefficient

		k += r
		if (k >= 64) break

		if (s !== 0) {
			block[ZIGZAG[k]!] = reader.receiveExtend(s)
		}
		k++
	}

	return block
}

/**
 * Convert YCbCr components to RGB image
 */
function convertToRGB(
	buffers: Float32Array[],
	components: Component[],
	frame: FrameInfo,
	width: number,
	height: number
): ImageData {
	const output = new Uint8Array(width * height * 4)
	const isGrayscale = components.length === 1

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const outIdx = (y * width + x) * 4
			let r: number
			let g: number
			let b: number

			if (isGrayscale) {
				// Grayscale
				const compWidth = Math.ceil(width / 8) * 8
				const Y = buffers[0]![y * compWidth + x]! + 128
				r = g = b = clamp(Y)
			} else {
				// YCbCr to RGB
				const comp0 = components[0]!
				const comp1 = components[1]!
				const comp2 = components[2]!

				const comp0Width = Math.ceil((width * comp0.hSamp) / frame.maxHSamp / 8) * 8
				const comp1Width = Math.ceil((width * comp1.hSamp) / frame.maxHSamp / 8) * 8
				const comp2Width = Math.ceil((width * comp2.hSamp) / frame.maxHSamp / 8) * 8

				// Handle subsampling
				const x0 = Math.floor((x * comp0.hSamp) / frame.maxHSamp)
				const y0 = Math.floor((y * comp0.vSamp) / frame.maxVSamp)
				const x1 = Math.floor((x * comp1.hSamp) / frame.maxHSamp)
				const y1 = Math.floor((y * comp1.vSamp) / frame.maxVSamp)
				const x2 = Math.floor((x * comp2.hSamp) / frame.maxHSamp)
				const y2 = Math.floor((y * comp2.vSamp) / frame.maxVSamp)

				const Y = buffers[0]![y0 * comp0Width + x0]! + 128
				const Cb = buffers[1]![y1 * comp1Width + x1]!
				const Cr = buffers[2]![y2 * comp2Width + x2]!

				// YCbCr to RGB conversion
				r = clamp(Y + 1.402 * Cr)
				g = clamp(Y - 0.344136 * Cb - 0.714136 * Cr)
				b = clamp(Y + 1.772 * Cb)
			}

			output[outIdx] = r
			output[outIdx + 1] = g
			output[outIdx + 2] = b
			output[outIdx + 3] = 255
		}
	}

	return { width, height, data: output }
}

/**
 * Clamp value to 0-255 range
 */
function clamp(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)))
}
