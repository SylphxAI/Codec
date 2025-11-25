/**
 * NEF (Nikon Electronic Format) types and constants
 * NEF is based on TIFF with Nikon-specific extensions
 */

// NEF uses same base as TIFF
export const NEF_LITTLE_ENDIAN = 0x4949 // 'II'
export const NEF_BIG_ENDIAN = 0x4d4d // 'MM'
export const NEF_MAGIC = 42 // TIFF magic number

// NEF-specific TIFF tags
export enum NefTag {
	// Standard TIFF tags used by NEF
	ImageWidth = 256,
	ImageLength = 257,
	BitsPerSample = 258,
	Compression = 259,
	PhotometricInterpretation = 262,
	Make = 271,
	Model = 272,
	StripOffsets = 273,
	Orientation = 274,
	SamplesPerPixel = 277,
	RowsPerStrip = 278,
	StripByteCounts = 279,
	XResolution = 282,
	YResolution = 283,
	PlanarConfiguration = 284,
	ResolutionUnit = 296,
	Software = 305,
	DateTime = 306,
	TileWidth = 322,
	TileLength = 323,
	TileOffsets = 324,
	TileByteCounts = 325,

	// NEF/EXIF specific tags
	SubIFDs = 330,
	JPEGInterchangeFormat = 513,
	JPEGInterchangeFormatLength = 514,
	YCbCrPositioning = 531,
	ExifIFD = 34665,
	MakerNote = 37500,
	CFAPattern = 33422,
	CFARepeatPatternDim = 33421,

	// Nikon MakerNote tags
	NikonVersion = 1,
	ISOSpeed = 2,
	ColorSpace = 3,
	WhiteBalance = 5,
	Sharpness = 6,
	FocusMode = 7,
	FlashSetting = 8,
	ImageAdjustment = 11,
	LensType = 131,
	LensData = 152,
}

// Tag data types (TIFF compatible)
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
}

// Compression types used in NEF
export enum NefCompression {
	None = 1,
	JPEGBaseline = 6,
	JPEG = 7,
	NikonLossless = 34713, // Nikon's lossless compression
	PackBits = 32773,
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
	CFA = 32803, // Color Filter Array (Bayer pattern)
}

// Color Filter Array patterns
export enum CFAPattern {
	RGGB = 0, // Red-Green-Green-Blue
	GRBG = 1, // Green-Red-Blue-Green
	GBRG = 2, // Green-Blue-Red-Green
	BGGR = 3, // Blue-Green-Green-Red
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
 * Parsed NEF structure
 */
export interface NefImage {
	littleEndian: boolean
	ifds: IFD[]
	exifIFD?: IFD
	makerNoteIFD?: IFD
	thumbnail?: Uint8Array
}

/**
 * NEF metadata
 */
export interface NefMetadata {
	make?: string
	model?: string
	software?: string
	dateTime?: string
	width: number
	height: number
	bitsPerSample: number[]
	compression: number
	photometric: number
	orientation?: number
	cfaPattern?: CFAPattern
	isoSpeed?: number
	whiteBalance?: number
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
}
