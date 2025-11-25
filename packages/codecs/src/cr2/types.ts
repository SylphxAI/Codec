/**
 * CR2 (Canon RAW) format types and constants
 * CR2 is based on TIFF/EP with Canon-specific extensions
 */

// CR2 is based on TIFF format
export const CR2_SIGNATURE = 0x4949 // 'II' - little-endian
export const CR2_MAGIC = 42 // Standard TIFF magic
export const CR2_VERSION_OFFSET = 0x4352 // 'CR' at offset 8

// Canon-specific EXIF tags
export enum CR2Tag {
	// Standard TIFF tags (from base TIFF spec)
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
	DateTime = 306,
	TileWidth = 322,
	TileLength = 323,
	TileOffsets = 324,
	TileByteCounts = 325,

	// EXIF tags
	ExifIFD = 34665,
	ExposureTime = 33434,
	FNumber = 33437,
	ISOSpeedRatings = 34855,
	DateTimeOriginal = 36867,
	ShutterSpeedValue = 37377,
	ApertureValue = 37378,
	ExposureBiasValue = 37380,
	FocalLength = 37386,

	// Canon Maker Notes
	CanonCameraSettings = 0x0001,
	CanonFocalLength = 0x0002,
	CanonShotInfo = 0x0004,
	CanonColorData = 0x4001,

	// Canon-specific CR2 tags
	CanonColorData1 = 0xc6c5,
	CanonVRDOffset = 0xc6dc,
	CanonRawDataOffset = 0xc640,
	CanonRawImageSegments = 0xc6c6,
}

// Tag data types (same as TIFF)
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

// Compression types
export enum CR2Compression {
	None = 1,
	JPEG = 6,
	LosslessJPEG = 7, // Most common in CR2
	OldLosslessJPEG = 99,
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

// Planar configuration
export enum PlanarConfig {
	Chunky = 1, // Interleaved
	Planar = 2, // Separate planes
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
 * CR2 image structure
 */
export interface CR2Image {
	littleEndian: boolean
	ifds: IFD[]
	// IFD 0: Full-size RAW image
	// IFD 1: Thumbnail (optional)
	// IFD 2: Preview (optional)
}

/**
 * Lossless JPEG parameters
 */
export interface LosslessJPEGParams {
	precision: number
	width: number
	height: number
	components: number
	predictor: number
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

/**
 * Bayer pattern color filter array
 */
export enum BayerPattern {
	RGGB = 0, // Red-Green-Green-Blue
	GRBG = 1, // Green-Red-Blue-Green
	GBRG = 2, // Green-Blue-Red-Green
	BGGR = 3, // Blue-Green-Green-Red
}
