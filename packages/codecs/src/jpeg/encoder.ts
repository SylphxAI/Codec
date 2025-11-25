import type { EncodeOptions, ImageData } from '@mconv/core'
import { fdct8x8 } from './dct'
import { Marker, STD_CHROMA_QUANT, STD_LUMA_QUANT, ZIGZAG } from './types'

/**
 * Standard DC luminance Huffman table
 */
const STD_DC_LUMA_BITS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]
const STD_DC_LUMA_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/**
 * Standard DC chrominance Huffman table
 */
const STD_DC_CHROMA_BITS = [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
const STD_DC_CHROMA_VALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

/**
 * Standard AC luminance Huffman table
 */
const STD_AC_LUMA_BITS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125]
const STD_AC_LUMA_VALS = [
	0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
	0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
	0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
	0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
	0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
	0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
	0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
	0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
	0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
	0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
	0xf9, 0xfa,
]

/**
 * Standard AC chrominance Huffman table
 */
const STD_AC_CHROMA_BITS = [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119]
const STD_AC_CHROMA_VALS = [
	0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
	0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
	0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
	0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
	0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
	0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
	0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
	0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
	0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
	0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
	0xf9, 0xfa,
]

/**
 * Huffman encoding table
 */
interface HuffEncode {
	code: number[]
	size: number[]
}

/**
 * Build Huffman encoding table
 */
function buildEncodeTable(bits: number[], vals: number[]): HuffEncode {
	const code: number[] = new Array(256).fill(0)
	const size: number[] = new Array(256).fill(0)

	// Generate codes
	let k = 0
	let huffCode = 0

	for (let i = 1; i <= 16; i++) {
		for (let j = 0; j < bits[i - 1]!; j++) {
			code[vals[k]!] = huffCode
			size[vals[k]!] = i
			k++
			huffCode++
		}
		huffCode <<= 1
	}

	return { code, size }
}

/**
 * Bit writer for JPEG output
 */
class BitWriter {
	private buffer: number[] = []
	private bitBuffer = 0
	private bitsInBuffer = 0

	writeBits(value: number, numBits: number): void {
		this.bitBuffer = (this.bitBuffer << numBits) | (value & ((1 << numBits) - 1))
		this.bitsInBuffer += numBits

		while (this.bitsInBuffer >= 8) {
			this.bitsInBuffer -= 8
			const byte = (this.bitBuffer >> this.bitsInBuffer) & 0xff
			this.buffer.push(byte)

			// Byte stuffing
			if (byte === 0xff) {
				this.buffer.push(0x00)
			}
		}
	}

	flush(): void {
		if (this.bitsInBuffer > 0) {
			const byte = (this.bitBuffer << (8 - this.bitsInBuffer)) & 0xff
			this.buffer.push(byte)
			if (byte === 0xff) {
				this.buffer.push(0x00)
			}
		}
	}

	getBytes(): Uint8Array {
		return new Uint8Array(this.buffer)
	}
}

/**
 * Get bit size of a value
 */
function getBitSize(value: number): number {
	let absVal = Math.abs(value)
	let size = 0
	while (absVal > 0) {
		absVal >>= 1
		size++
	}
	return size
}

/**
 * Scale quantization table by quality
 */
function scaleQuantTable(table: number[], quality: number): number[] {
	const q = quality < 50 ? Math.floor(5000 / quality) : 200 - quality * 2

	return table.map((v) => {
		const scaled = Math.floor((v * q + 50) / 100)
		return Math.max(1, Math.min(255, scaled))
	})
}

/**
 * Encode JPEG image
 */
export function encodeJpeg(image: ImageData, options?: EncodeOptions): Uint8Array {
	const { width, height, data } = image
	const quality = options?.quality ?? 85

	// Scale quantization tables
	const lumaQuant = scaleQuantTable(STD_LUMA_QUANT, quality)
	const chromaQuant = scaleQuantTable(STD_CHROMA_QUANT, quality)

	// Build Huffman encoding tables
	const dcLumaEnc = buildEncodeTable(STD_DC_LUMA_BITS, STD_DC_LUMA_VALS)
	const dcChromaEnc = buildEncodeTable(STD_DC_CHROMA_BITS, STD_DC_CHROMA_VALS)
	const acLumaEnc = buildEncodeTable(STD_AC_LUMA_BITS, STD_AC_LUMA_VALS)
	const acChromaEnc = buildEncodeTable(STD_AC_CHROMA_BITS, STD_AC_CHROMA_VALS)

	// Convert to YCbCr and prepare blocks
	const mcuWidth = Math.ceil(width / 8)
	const mcuHeight = Math.ceil(height / 8)

	const output: number[] = []

	// Write SOI
	output.push(0xff, 0xd8)

	// Write APP0 (JFIF)
	writeAPP0(output)

	// Write DQT (quantization tables)
	writeDQT(output, 0, lumaQuant)
	writeDQT(output, 1, chromaQuant)

	// Write SOF0
	writeSOF0(output, width, height)

	// Write DHT (Huffman tables)
	writeDHT(output, 0, 0, STD_DC_LUMA_BITS, STD_DC_LUMA_VALS)
	writeDHT(output, 0, 1, STD_DC_CHROMA_BITS, STD_DC_CHROMA_VALS)
	writeDHT(output, 1, 0, STD_AC_LUMA_BITS, STD_AC_LUMA_VALS)
	writeDHT(output, 1, 1, STD_AC_CHROMA_BITS, STD_AC_CHROMA_VALS)

	// Write SOS
	writeSOS(output)

	// Encode image data
	const writer = new BitWriter()
	let prevDcY = 0
	let prevDcCb = 0
	let prevDcCr = 0

	for (let mcuY = 0; mcuY < mcuHeight; mcuY++) {
		for (let mcuX = 0; mcuX < mcuWidth; mcuX++) {
			// Get 8x8 block from image
			const blockY: number[] = new Array(64)
			const blockCb: number[] = new Array(64)
			const blockCr: number[] = new Array(64)

			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					const px = Math.min(mcuX * 8 + x, width - 1)
					const py = Math.min(mcuY * 8 + y, height - 1)
					const idx = (py * width + px) * 4

					const r = data[idx]!
					const g = data[idx + 1]!
					const b = data[idx + 2]!

					// RGB to YCbCr
					const Y = 0.299 * r + 0.587 * g + 0.114 * b - 128
					const Cb = -0.168736 * r - 0.331264 * g + 0.5 * b
					const Cr = 0.5 * r - 0.418688 * g - 0.081312 * b

					const blockIdx = y * 8 + x
					blockY[blockIdx] = Y
					blockCb[blockIdx] = Cb
					blockCr[blockIdx] = Cr
				}
			}

			// DCT and encode Y block
			const dctY = fdct8x8(blockY)
			prevDcY = encodeBlock(writer, dctY, lumaQuant, dcLumaEnc, acLumaEnc, prevDcY)

			// DCT and encode Cb block
			const dctCb = fdct8x8(blockCb)
			prevDcCb = encodeBlock(writer, dctCb, chromaQuant, dcChromaEnc, acChromaEnc, prevDcCb)

			// DCT and encode Cr block
			const dctCr = fdct8x8(blockCr)
			prevDcCr = encodeBlock(writer, dctCr, chromaQuant, dcChromaEnc, acChromaEnc, prevDcCr)
		}
	}

	writer.flush()
	const scanData = writer.getBytes()
	output.push(...scanData)

	// Write EOI
	output.push(0xff, 0xd9)

	return new Uint8Array(output)
}

/**
 * Write APP0 (JFIF) segment
 */
function writeAPP0(output: number[]): void {
	output.push(0xff, 0xe0) // APP0 marker
	output.push(0x00, 0x10) // Length = 16
	output.push(0x4a, 0x46, 0x49, 0x46, 0x00) // "JFIF\0"
	output.push(0x01, 0x01) // Version 1.1
	output.push(0x00) // No aspect ratio
	output.push(0x00, 0x01) // X density = 1
	output.push(0x00, 0x01) // Y density = 1
	output.push(0x00, 0x00) // No thumbnail
}

/**
 * Write DQT segment
 */
function writeDQT(output: number[], tableId: number, table: number[]): void {
	output.push(0xff, 0xdb) // DQT marker
	output.push(0x00, 0x43) // Length = 67
	output.push(tableId) // Table ID (8-bit precision)

	// Write table in zigzag order
	for (let i = 0; i < 64; i++) {
		output.push(table[ZIGZAG[i]!]!)
	}
}

/**
 * Write SOF0 segment
 */
function writeSOF0(output: number[], width: number, height: number): void {
	output.push(0xff, 0xc0) // SOF0 marker
	output.push(0x00, 0x11) // Length = 17
	output.push(0x08) // Precision = 8 bits
	output.push((height >> 8) & 0xff, height & 0xff) // Height
	output.push((width >> 8) & 0xff, width & 0xff) // Width
	output.push(0x03) // 3 components

	// Y component
	output.push(0x01) // Component ID
	output.push(0x11) // Sampling: 1x1
	output.push(0x00) // Quant table 0

	// Cb component
	output.push(0x02)
	output.push(0x11)
	output.push(0x01) // Quant table 1

	// Cr component
	output.push(0x03)
	output.push(0x11)
	output.push(0x01)
}

/**
 * Write DHT segment
 */
function writeDHT(
	output: number[],
	tableClass: number,
	tableId: number,
	bits: number[],
	vals: number[]
): void {
	output.push(0xff, 0xc4) // DHT marker

	const length = 3 + 16 + vals.length
	output.push((length >> 8) & 0xff, length & 0xff)
	output.push((tableClass << 4) | tableId)

	for (let i = 0; i < 16; i++) {
		output.push(bits[i]!)
	}

	for (const val of vals) {
		output.push(val)
	}
}

/**
 * Write SOS segment
 */
function writeSOS(output: number[]): void {
	output.push(0xff, 0xda) // SOS marker
	output.push(0x00, 0x0c) // Length = 12
	output.push(0x03) // 3 components

	// Y component
	output.push(0x01) // Component ID
	output.push(0x00) // DC/AC table 0/0

	// Cb component
	output.push(0x02)
	output.push(0x11) // DC/AC table 1/1

	// Cr component
	output.push(0x03)
	output.push(0x11)

	output.push(0x00) // Spectral selection start
	output.push(0x3f) // Spectral selection end
	output.push(0x00) // Successive approximation
}

/**
 * Encode a single block
 */
function encodeBlock(
	writer: BitWriter,
	dct: number[],
	quant: number[],
	dcEnc: HuffEncode,
	acEnc: HuffEncode,
	prevDc: number
): number {
	// Quantize
	const quantized = new Array(64)
	for (let i = 0; i < 64; i++) {
		quantized[i] = Math.round(dct[i]! / quant[i]!)
	}

	// Encode DC coefficient
	const dcVal = quantized[0]!
	const dcDiff = dcVal - prevDc
	const dcSize = getBitSize(dcDiff)

	writer.writeBits(dcEnc.code[dcSize]!, dcEnc.size[dcSize]!)
	if (dcSize > 0) {
		const dcBits = dcDiff < 0 ? dcDiff + (1 << dcSize) - 1 : dcDiff
		writer.writeBits(dcBits, dcSize)
	}

	// Encode AC coefficients
	let zeroRun = 0
	for (let k = 1; k < 64; k++) {
		const acVal = quantized[ZIGZAG[k]!]!

		if (acVal === 0) {
			zeroRun++
		} else {
			// Output zero runs > 15
			while (zeroRun > 15) {
				writer.writeBits(acEnc.code[0xf0]!, acEnc.size[0xf0]!) // ZRL
				zeroRun -= 16
			}

			const acSize = getBitSize(acVal)
			const rs = (zeroRun << 4) | acSize

			writer.writeBits(acEnc.code[rs]!, acEnc.size[rs]!)
			const acBits = acVal < 0 ? acVal + (1 << acSize) - 1 : acVal
			writer.writeBits(acBits, acSize)

			zeroRun = 0
		}
	}

	// EOB if needed
	if (zeroRun > 0) {
		writer.writeBits(acEnc.code[0x00]!, acEnc.size[0x00]!) // EOB
	}

	return dcVal
}
