/**
 * RW2 (Panasonic RAW) format types and constants
 * RW2 is based on TIFF with Panasonic-specific extensions
 */

// Import and re-export base TIFF types
import type { TiffImage as TiffImageBase } from '../tiff/types'

export {
	TIFF_LITTLE_ENDIAN,
	TIFF_BIG_ENDIAN,
	TIFF_MAGIC,
	BIGTIFF_MAGIC,
	TagType,
	Tag,
	Compression,
	Photometric,
	PlanarConfig,
	SampleFormat,
	TYPE_SIZES,
	type IFDEntry,
	type IFD,
	type TiffImage,
} from '../tiff/types'

// RW2-specific constants
export const RW2_SIGNATURE = 0x4949 // 'II' - little-endian (Panasonic uses little-endian)
export const RW2_MAGIC = 0x0055 // Panasonic-specific magic number (85 decimal)

// Panasonic-specific EXIF tags
export enum RW2Tag {
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

	// Panasonic Maker Notes (using high tag numbers to avoid conflicts)
	PanasonicRawVersion = 0x0001,
	PanasonicSensorWidth = 0x0002,
	PanasonicSensorHeight = 0x0003,
	PanasonicSensorTopBorder = 0x0004,
	PanasonicSensorLeftBorder = 0x0005,
	PanasonicImageHeight = 0x0006,
	PanasonicImageWidth = 0x0007,
	PanasonicRedBalance = 0x0024,
	PanasonicBlueBalance = 0x0025,
	PanasonicWBRedLevel = 0x0026,
	PanasonicWBGreenLevel = 0x0027,
	PanasonicWBBlueLevel = 0x0028,
	PanasonicJPEGImage = 0x002e,
	PanasonicTitle = 0x0051,
	PanasonicTitle2 = 0x0052,

	// Alternative tag locations (RW2-specific)
	StripOffsets2 = 0x0111,
	StripByteCounts2 = 0x0117,
	RawDataOffset = 0x0118,
	CFAPattern = 50706,
	SensorCFAPattern = 0x0001,
}

// RW2 Compression types
export enum RW2Compression {
	None = 1,
	PanasonicRAW = 34316, // Panasonic's proprietary RAW compression
	JPEG = 6,
	LosslessJPEG = 7,
}

// CFA (Color Filter Array) Pattern
export enum CFAPattern {
	RGGB = 0, // Red-Green-Green-Blue
	GRBG = 1, // Green-Red-Blue-Green
	GBRG = 2, // Green-Blue-Red-Green
	BGGR = 3, // Blue-Green-Green-Red
}

/**
 * RW2 image structure
 */
export interface RW2Image extends TiffImageBase {
	metadata?: RW2Metadata
	// IFD 0: Preview/Thumbnail (JPEG)
	// IFD 1: Full-size RAW image
}

/**
 * RW2-specific metadata
 */
export interface RW2Metadata {
	rawVersion?: number
	sensorWidth?: number
	sensorHeight?: number
	sensorTopBorder?: number
	sensorLeftBorder?: number
	imageWidth?: number
	imageHeight?: number
	redBalance?: number
	blueBalance?: number
	wbRedLevel?: number
	wbGreenLevel?: number
	wbBlueLevel?: number
	cfaPattern?: CFAPattern
	make?: string
	model?: string
	orientation?: number
	exposureTime?: number
	fNumber?: number
	iso?: number
	focalLength?: number
}

/**
 * Bayer pattern demosaic configuration
 */
export interface BayerConfig {
	pattern: CFAPattern
	width: number
	height: number
}
