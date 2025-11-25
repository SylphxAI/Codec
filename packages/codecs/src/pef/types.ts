/**
 * PEF (Pentax Electronic Format) types and constants
 * PEF is based on TIFF with Pentax-specific extensions
 */

// PEF uses TIFF structure
export const PEF_LITTLE_ENDIAN = 0x4949 // 'II'
export const PEF_BIG_ENDIAN = 0x4d4d // 'MM'
export const PEF_MAGIC = 42 // Standard TIFF magic number

// Pentax-specific TIFF tags
export enum PefTag {
	// Standard TIFF tags
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

	// Pentax-specific tags
	PentaxVersion = 0x0000,
	PentaxMode = 0x0001,
	PreviewImageSize = 0x0002,
	PreviewImageLength = 0x0003,
	PreviewImageStart = 0x0004,
	ModelID = 0x0005,
	Date = 0x0006,
	Time = 0x0007,
	Quality = 0x0008,
	ImageSize = 0x0009,
	PictureMode = 0x000b,
	FlashMode = 0x000c,
	FocusMode = 0x000d,
	AFPointSelected = 0x000e,
	AFPointsInFocus = 0x000f,
	FocusPosition = 0x0010,
	ExposureTime = 0x0012,
	FNumber = 0x0013,
	ISO = 0x0014,
	LightReading = 0x0015,
	ExposureCompensation = 0x0016,
	MeteringMode = 0x0017,
	AutoBracketing = 0x0018,
	WhiteBalance = 0x0019,
	WhiteBalanceMode = 0x001a,
	BlueBalance = 0x001b,
	RedBalance = 0x001c,
	FocalLength = 0x001d,
	DigitalZoom = 0x001e,
	Saturation = 0x001f,
	Contrast = 0x0020,
	Sharpness = 0x0021,
	WorldTimeLocation = 0x0022,
	HometownCity = 0x0023,
	DestinationCity = 0x0024,
	HometownDST = 0x0025,
	DestinationDST = 0x0026,
	DSPFirmwareVersion = 0x0027,
	CPUFirmwareVersion = 0x0028,
	FrameNumber = 0x0029,

	// EXIF tags
	ExifIFDPointer = 0x8769,
	GPSInfoIFDPointer = 0x8825,
}

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
}

// Compression types used in PEF
export enum Compression {
	None = 1,
	PentaxCompressed = 65535, // Pentax-specific compression
}

// Photometric interpretation
export enum Photometric {
	WhiteIsZero = 0,
	BlackIsZero = 1,
	RGB = 2,
	Palette = 3,
	CFA = 32803, // Color Filter Array (Bayer pattern for RAW)
	LinearRaw = 34892,
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
 * Parsed PEF structure
 */
export interface PefImage {
	littleEndian: boolean
	ifds: IFD[]
	previewIFD?: IFD
	rawIFD?: IFD
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
