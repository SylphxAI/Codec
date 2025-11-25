/**
 * ARW (Sony RAW) format types and constants
 * ARW is based on TIFF with Sony-specific extensions
 */

// Import TIFF types as base
import {
	TIFF_BIG_ENDIAN,
	TIFF_LITTLE_ENDIAN,
	TIFF_MAGIC,
	Tag as TiffTag,
	TagType,
	Compression,
	Photometric,
	PlanarConfig,
	SampleFormat,
	TYPE_SIZES,
} from '../tiff/types'

// Re-export TIFF types
export {
	TIFF_BIG_ENDIAN,
	TIFF_LITTLE_ENDIAN,
	TIFF_MAGIC,
	TagType,
	Compression,
	Photometric,
	PlanarConfig,
	SampleFormat,
	TYPE_SIZES,
}

// Sony ARW-specific tags
export enum ArwTag {
	// Standard TIFF tags (most commonly used in ARW)
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
	SubIFDs = 330,
	ExtraSamples = 338,
	SampleFormat = 339,

	// EXIF tags
	ExifIFD = 34665,
	GPSInfo = 34853,

	// Sony-specific tags
	SonyRawFileType = 28672, // 0x7000
	SonyCameraSettings = 28688, // 0x7010
	SonyPrivateData = 33405, // 0x825d

	// DNG/RAW tags (ARW uses some DNG conventions)
	DNGVersion = 50706,
	DNGBackwardVersion = 50707,
	UniqueCameraModel = 50708,
	CFARepeatPatternDim = 33421,
	CFAPattern = 33422,
	BlackLevel = 50714,
	WhiteLevel = 50717,
	DefaultScale = 50718,
	DefaultCropOrigin = 50719,
	DefaultCropSize = 50720,
	ColorMatrix1 = 50721,
	ColorMatrix2 = 50722,
	CameraCalibration1 = 50723,
	CameraCalibration2 = 50724,
	AnalogBalance = 50727,
	AsShotNeutral = 50728,
	BaselineExposure = 50730,
	BaselineNoise = 50731,
	BaselineSharpness = 50732,
	LinearResponseLimit = 50734,
	CalibrationIlluminant1 = 50778,
	CalibrationIlluminant2 = 50779,
}

// Sony camera models (some examples)
export const SONY_MODELS = [
	'ILCE-7',
	'ILCE-7M2',
	'ILCE-7M3',
	'ILCE-7M4',
	'ILCE-7R',
	'ILCE-7RM2',
	'ILCE-7RM3',
	'ILCE-7RM4',
	'ILCE-7RM5',
	'ILCE-7S',
	'ILCE-7SM2',
	'ILCE-7SM3',
	'ILCE-9',
	'ILCE-9M2',
	'ILCE-6000',
	'ILCE-6300',
	'ILCE-6400',
	'ILCE-6500',
	'ILCE-6600',
	'DSC-RX1',
	'DSC-RX10',
	'DSC-RX100',
]

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
 * Parsed ARW structure
 */
export interface ArwImage {
	littleEndian: boolean
	isBigTiff: boolean
	ifds: IFD[]
	make?: string
	model?: string
	software?: string
	datetime?: string
}

/**
 * CFA (Color Filter Array) pattern for Bayer demosaicing
 */
export enum CFAPattern {
	RGGB = 0, // Red, Green, Green, Blue (most common)
	BGGR = 1, // Blue, Green, Green, Red
	GRBG = 2, // Green, Red, Blue, Green
	GBRG = 3, // Green, Blue, Red, Green
}

/**
 * ARW RAW data info
 */
export interface ArwRawInfo {
	width: number
	height: number
	bitsPerSample: number
	cfaPattern: CFAPattern
	blackLevel: number
	whiteLevel: number
	compression: Compression
}
