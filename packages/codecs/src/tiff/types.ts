/**
 * TIFF format types and constants
 */

// TIFF signatures
export const TIFF_LITTLE_ENDIAN = 0x4949 // 'II'
export const TIFF_BIG_ENDIAN = 0x4d4d // 'MM'
export const TIFF_MAGIC = 42 // Classic TIFF
export const BIGTIFF_MAGIC = 43 // BigTIFF

// Tag data types
export enum TagType {
	Byte = 1,
	Ascii = 2,
	Short = 3,
	Long = 4,
	Rational = 5,
	SByte = 6,
	Undefined = 7,
	SShort = 8,
	SLong = 9,
	SRational = 10,
	Float = 11,
	Double = 12,
	// BigTIFF types
	Long8 = 16,
	SLong8 = 17,
	IFD8 = 18,
}

// Common TIFF tags
export enum Tag {
	ImageWidth = 256,
	ImageLength = 257,
	BitsPerSample = 258,
	Compression = 259,
	PhotometricInterpretation = 262,
	StripOffsets = 273,
	SamplesPerPixel = 277,
	RowsPerStrip = 278,
	StripByteCounts = 279,
	XResolution = 282,
	YResolution = 283,
	PlanarConfiguration = 284,
	ResolutionUnit = 296,
	ColorMap = 320,
	TileWidth = 322,
	TileLength = 323,
	TileOffsets = 324,
	TileByteCounts = 325,
	ExtraSamples = 338,
	SampleFormat = 339,
}

// Compression types
export enum Compression {
	None = 1,
	CCITT = 2,
	Group3Fax = 3,
	Group4Fax = 4,
	LZW = 5,
	OJPEG = 6,
	JPEG = 7,
	Deflate = 8,
	PackBits = 32773,
	DeflateAdobe = 32946,
}

// Photometric interpretation
export enum Photometric {
	WhiteIsZero = 0,
	BlackIsZero = 1,
	RGB = 2,
	Palette = 3,
	TransparencyMask = 4,
	CMYK = 5,
	YCbCr = 6,
	CIELab = 8,
}

// Planar configuration
export enum PlanarConfig {
	Chunky = 1, // RGBRGBRGB
	Planar = 2, // RRRGGGBBB
}

// Sample format
export enum SampleFormat {
	Unsigned = 1,
	Signed = 2,
	Float = 3,
	Undefined = 4,
}

/**
 * IFD entry
 */
export interface IFDEntry {
	tag: number
	type: TagType
	count: number
	value: number | number[] | string
}

/**
 * Image File Directory
 */
export interface IFD {
	entries: Map<number, IFDEntry>
	nextIFDOffset: number
}

/**
 * Parsed TIFF structure
 */
export interface TiffImage {
	littleEndian: boolean
	isBigTiff: boolean
	ifds: IFD[]
}

/**
 * Type sizes in bytes
 */
export const TYPE_SIZES: Record<TagType, number> = {
	[TagType.Byte]: 1,
	[TagType.Ascii]: 1,
	[TagType.Short]: 2,
	[TagType.Long]: 4,
	[TagType.Rational]: 8,
	[TagType.SByte]: 1,
	[TagType.Undefined]: 1,
	[TagType.SShort]: 2,
	[TagType.SLong]: 4,
	[TagType.SRational]: 8,
	[TagType.Float]: 4,
	[TagType.Double]: 8,
	[TagType.Long8]: 8,
	[TagType.SLong8]: 8,
	[TagType.IFD8]: 8,
}
