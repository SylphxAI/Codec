/**
 * JPEG 2000 box type codes
 */
export const Jp2BoxType = {
	// JP2 signature boxes
	JP2_SIGNATURE: 0x6a502020, // 'jP  '
	FILE_TYPE: 0x66747970, // 'ftyp'
	JP2_HEADER: 0x6a703268, // 'jp2h'
	IMAGE_HEADER: 0x69686472, // 'ihdr'
	COLOR_SPEC: 0x636f6c72, // 'colr'
	BITS_PER_COMPONENT: 0x62706363, // 'bpcc'
	PALETTE: 0x70636c72, // 'pclr'
	COMPONENT_MAPPING: 0x636d6170, // 'cmap'
	CHANNEL_DEFINITION: 0x63646566, // 'cdef'
	RESOLUTION: 0x72657320, // 'res '
	CONTIGUOUS_CODESTREAM: 0x6a703263, // 'jp2c'
	XML: 0x786d6c20, // 'xml '
	UUID: 0x75756964, // 'uuid'
	UINF: 0x75696e66, // 'uinf'
} as const

/**
 * JPEG 2000 codestream markers
 */
export const Marker = {
	SOC: 0xff4f, // Start of codestream
	SOT: 0xff90, // Start of tile-part
	SOD: 0xff93, // Start of data
	EOC: 0xff49, // End of codestream
	SIZ: 0xff51, // Image and tile size
	COD: 0xff52, // Coding style default
	COC: 0xff53, // Coding style component
	TLM: 0xff55, // Tile-part lengths
	PLM: 0xff57, // Packet length, main header
	PLT: 0xff58, // Packet length, tile-part header
	QCD: 0xff5c, // Quantization default
	QCC: 0xff5d, // Quantization component
	RGN: 0xff5e, // Region-of-interest
	POC: 0xff5f, // Progression order change
	PPM: 0xff60, // Packed packet headers, main header
	PPT: 0xff61, // Packed packet headers, tile-part header
	CRG: 0xff63, // Component registration
	COM: 0xff64, // Comment
} as const

/**
 * JP2 file signature (12 bytes)
 */
export const JP2_SIGNATURE = new Uint8Array([
	0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
])

/**
 * J2K codestream signature (4 bytes)
 */
export const J2K_SIGNATURE = new Uint8Array([0xff, 0x4f, 0xff, 0x51])

/**
 * Image and tile size parameters
 */
export interface SizParameters {
	rsiz: number // Capabilities
	xsiz: number // Image width
	ysiz: number // Image height
	xOsiz: number // Horizontal offset
	yOsiz: number // Vertical offset
	xtSiz: number // Tile width
	ytSiz: number // Tile height
	xtOsiz: number // Tile horizontal offset
	ytOsiz: number // Tile vertical offset
	numComponents: number
	components: ComponentInfo[]
}

/**
 * Component information
 */
export interface ComponentInfo {
	precision: number // Bit depth (1-38)
	signed: boolean
	xRsiz: number // Horizontal separation
	yRsiz: number // Vertical separation
}

/**
 * Coding style parameters
 */
export interface CodingStyle {
	scod: number // Coding style flags
	progressionOrder: number // 0=LRCP, 1=RLCP, 2=RPCL, 3=PCRL, 4=CPRL
	numLayers: number
	multiComponentTransform: number // 0=none, 1=RCT or ICT
	numDecompositions: number
	codeBlockWidth: number // Exponent (actual = 2^n)
	codeBlockHeight: number // Exponent (actual = 2^n)
	codeBlockStyle: number // Flags
	transformation: number // 0=9-7 irreversible, 1=5-3 reversible
	precinctSizes?: number[] // [PPx, PPy] for each resolution level
}

/**
 * Quantization parameters
 */
export interface Quantization {
	sqcd: number // Quantization style
	spqcd: number[] // Quantization step sizes
}

/**
 * JP2 box structure
 */
export interface Box {
	type: number
	length: number
	offset: number
	data: Uint8Array
}

/**
 * Image header box parameters
 */
export interface ImageHeader {
	height: number
	width: number
	numComponents: number
	bitsPerComponent: number
	compressionType: number
	colorspaceUnknown: boolean
	intellectualProperty: boolean
}

/**
 * Color specification box parameters
 */
export interface ColorSpec {
	method: number // 1=Enumerated, 2=Restricted ICC profile
	precedence: number
	approximation: number
	colorSpace?: number // EnumCS value
	iccProfile?: Uint8Array
}

/**
 * Decoded tile data
 */
export interface Tile {
	x: number
	y: number
	width: number
	height: number
	components: Float32Array[]
}

/**
 * Subband structure for wavelet decomposition
 */
export interface Subband {
	type: 'LL' | 'LH' | 'HL' | 'HH'
	level: number
	x: number
	y: number
	width: number
	height: number
	coefficients: Float32Array
}

/**
 * Code-block structure
 */
export interface CodeBlock {
	x: number
	y: number
	width: number
	height: number
	data: Uint8Array
	passes: number
	layers: number[]
}

/**
 * Precinct structure
 */
export interface Precinct {
	x: number
	y: number
	width: number
	height: number
	codeBlocks: CodeBlock[]
}

/**
 * Packet structure
 */
export interface Packet {
	layerIndex: number
	resolutionLevel: number
	componentIndex: number
	precinctIndex: number
	data: Uint8Array
}

/**
 * Wavelet filter types
 */
export type WaveletFilter = '9-7' | '5-3'

/**
 * Progression orders
 */
export const ProgressionOrder = {
	LRCP: 0, // Layer-Resolution-Component-Position
	RLCP: 1, // Resolution-Layer-Component-Position
	RPCL: 2, // Resolution-Position-Component-Layer
	PCRL: 3, // Position-Component-Resolution-Layer
	CPRL: 4, // Component-Position-Resolution-Layer
} as const

/**
 * Color space enumerations
 */
export const ColorSpace = {
	SRGB: 16,
	GRAYSCALE: 17,
	SYCC: 18,
} as const
