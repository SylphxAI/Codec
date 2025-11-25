/**
 * JPEG marker codes
 */
export const Marker = {
	// Start of Frame markers (baseline, progressive, etc.)
	SOF0: 0xffc0, // Baseline DCT
	SOF1: 0xffc1, // Extended sequential DCT
	SOF2: 0xffc2, // Progressive DCT
	SOF3: 0xffc3, // Lossless

	// Huffman table
	DHT: 0xffc4,

	// Restart markers
	RST0: 0xffd0,
	RST7: 0xffd7,

	// Other markers
	SOI: 0xffd8, // Start of image
	EOI: 0xffd9, // End of image
	SOS: 0xffda, // Start of scan
	DQT: 0xffdb, // Define quantization table
	DRI: 0xffdd, // Define restart interval
	APP0: 0xffe0, // JFIF
	APP1: 0xffe1, // EXIF
	COM: 0xfffe, // Comment
} as const

/**
 * JPEG component info
 */
export interface Component {
	id: number
	hSamp: number // Horizontal sampling factor
	vSamp: number // Vertical sampling factor
	qTableId: number // Quantization table ID
	dcTableId: number // DC Huffman table ID
	acTableId: number // AC Huffman table ID
}

/**
 * JPEG frame info
 */
export interface FrameInfo {
	precision: number
	height: number
	width: number
	components: Component[]
	maxHSamp: number
	maxVSamp: number
}

/**
 * Huffman table
 */
export interface HuffmanTable {
	bits: number[] // Number of codes for each length (1-16)
	values: number[] // Symbol values
	// Lookup tables (built from bits/values)
	maxCode: number[]
	valPtr: number[]
	huffVal: number[]
}

/**
 * Quantization table
 */
export type QuantTable = number[]

/**
 * Standard JPEG zigzag order
 */
export const ZIGZAG = [
	0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20,
	13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52,
	45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]

/**
 * Standard luminance quantization table
 */
export const STD_LUMA_QUANT = [
	16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
	14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
	92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]

/**
 * Standard chrominance quantization table
 */
export const STD_CHROMA_QUANT = [
	17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99,
	47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
	99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
]
