/**
 * EXIF metadata types
 */

/** EXIF data types */
export enum ExifType {
	BYTE = 1,
	ASCII = 2,
	SHORT = 3,
	LONG = 4,
	RATIONAL = 5,
	SBYTE = 6,
	UNDEFINED = 7,
	SSHORT = 8,
	SLONG = 9,
	SRATIONAL = 10,
	FLOAT = 11,
	DOUBLE = 12,
}

/** EXIF IFD types */
export enum ExifIfd {
	IFD0 = 'IFD0',
	IFD1 = 'IFD1',
	EXIF = 'EXIF',
	GPS = 'GPS',
	INTEROP = 'Interoperability',
}

/** Common EXIF tags */
export const ExifTags: Record<number, string> = {
	// IFD0 tags
	270: 'ImageDescription',
	271: 'Make',
	272: 'Model',
	274: 'Orientation',
	282: 'XResolution',
	283: 'YResolution',
	296: 'ResolutionUnit',
	305: 'Software',
	306: 'DateTime',
	315: 'Artist',
	33432: 'Copyright',
	34665: 'ExifIFDPointer',
	34853: 'GPSInfoIFDPointer',

	// EXIF IFD tags
	33434: 'ExposureTime',
	33437: 'FNumber',
	34850: 'ExposureProgram',
	34855: 'ISOSpeedRatings',
	36864: 'ExifVersion',
	36867: 'DateTimeOriginal',
	36868: 'DateTimeDigitized',
	37121: 'ComponentsConfiguration',
	37122: 'CompressedBitsPerPixel',
	37377: 'ShutterSpeedValue',
	37378: 'ApertureValue',
	37379: 'BrightnessValue',
	37380: 'ExposureBiasValue',
	37381: 'MaxApertureValue',
	37382: 'SubjectDistance',
	37383: 'MeteringMode',
	37384: 'LightSource',
	37385: 'Flash',
	37386: 'FocalLength',
	37500: 'MakerNote',
	37510: 'UserComment',
	40960: 'FlashpixVersion',
	40961: 'ColorSpace',
	40962: 'PixelXDimension',
	40963: 'PixelYDimension',
	40965: 'InteroperabilityIFDPointer',
	41486: 'FocalPlaneXResolution',
	41487: 'FocalPlaneYResolution',
	41488: 'FocalPlaneResolutionUnit',
	41495: 'SensingMethod',
	41728: 'FileSource',
	41729: 'SceneType',
	41985: 'CustomRendered',
	41986: 'ExposureMode',
	41987: 'WhiteBalance',
	41988: 'DigitalZoomRatio',
	41989: 'FocalLengthIn35mmFilm',
	41990: 'SceneCaptureType',
	41991: 'GainControl',
	41992: 'Contrast',
	41993: 'Saturation',
	41994: 'Sharpness',
	42016: 'ImageUniqueID',
	42032: 'CameraOwnerName',
	42033: 'BodySerialNumber',
	42034: 'LensSpecification',
	42035: 'LensMake',
	42036: 'LensModel',
	42037: 'LensSerialNumber',
}

/** GPS EXIF tags */
export const GpsTags: Record<number, string> = {
	0: 'GPSVersionID',
	1: 'GPSLatitudeRef',
	2: 'GPSLatitude',
	3: 'GPSLongitudeRef',
	4: 'GPSLongitude',
	5: 'GPSAltitudeRef',
	6: 'GPSAltitude',
	7: 'GPSTimeStamp',
	8: 'GPSSatellites',
	9: 'GPSStatus',
	10: 'GPSMeasureMode',
	11: 'GPSDOP',
	12: 'GPSSpeedRef',
	13: 'GPSSpeed',
	14: 'GPSTrackRef',
	15: 'GPSTrack',
	16: 'GPSImgDirectionRef',
	17: 'GPSImgDirection',
	18: 'GPSMapDatum',
	19: 'GPSDestLatitudeRef',
	20: 'GPSDestLatitude',
	21: 'GPSDestLongitudeRef',
	22: 'GPSDestLongitude',
	23: 'GPSDestBearingRef',
	24: 'GPSDestBearing',
	25: 'GPSDestDistanceRef',
	26: 'GPSDestDistance',
	27: 'GPSProcessingMethod',
	28: 'GPSAreaInformation',
	29: 'GPSDateStamp',
	30: 'GPSDifferential',
}

/** Orientation values */
export enum ExifOrientation {
	NORMAL = 1,
	FLIP_HORIZONTAL = 2,
	ROTATE_180 = 3,
	FLIP_VERTICAL = 4,
	TRANSPOSE = 5,
	ROTATE_90 = 6,
	TRANSVERSE = 7,
	ROTATE_270 = 8,
}

/** Parsed EXIF data */
export interface ExifData {
	// Basic image info
	make?: string
	model?: string
	software?: string
	dateTime?: string
	dateTimeOriginal?: string
	orientation?: ExifOrientation

	// Image dimensions
	imageWidth?: number
	imageHeight?: number
	pixelXDimension?: number
	pixelYDimension?: number

	// Camera settings
	exposureTime?: number
	fNumber?: number
	iso?: number
	focalLength?: number
	focalLengthIn35mm?: number
	aperture?: number
	shutterSpeed?: number

	// Flash
	flash?: number
	flashFired?: boolean

	// GPS
	gps?: {
		latitude?: number
		longitude?: number
		altitude?: number
		latitudeRef?: string
		longitudeRef?: string
		altitudeRef?: number
	}

	// Raw tags (all parsed values)
	raw: Record<string, unknown>
}

/** EXIF entry */
export interface ExifEntry {
	tag: number
	type: ExifType
	count: number
	value: unknown
}
