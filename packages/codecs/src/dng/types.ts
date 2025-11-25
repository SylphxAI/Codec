/**
 * DNG (Adobe Digital Negative) format types and constants
 * Based on TIFF with DNG-specific extensions
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

// DNG-specific magic numbers
export const DNG_VERSION_TAG = 50706
export const DNG_BACKWARD_VERSION_TAG = 50707

// DNG Version (1.0.0.0 to 1.7.0.0)
export const DNG_VERSION_1_0 = [1, 0, 0, 0]
export const DNG_VERSION_1_1 = [1, 1, 0, 0]
export const DNG_VERSION_1_2 = [1, 2, 0, 0]
export const DNG_VERSION_1_3 = [1, 3, 0, 0]
export const DNG_VERSION_1_4 = [1, 4, 0, 0]
export const DNG_VERSION_1_5 = [1, 5, 0, 0]
export const DNG_VERSION_1_6 = [1, 6, 0, 0]
export const DNG_VERSION_1_7 = [1, 7, 0, 0]

// DNG-specific TIFF tags
export enum DNGTag {
	// DNG Version tags
	DNGVersion = 50706,
	DNGBackwardVersion = 50707,
	UniqueCameraModel = 50708,
	LocalizedCameraModel = 50709,
	CFAPlaneColor = 50710,
	CFALayout = 50711,
	LinearizationTable = 50712,
	BlackLevelRepeatDim = 50713,
	BlackLevel = 50714,
	BlackLevelDeltaH = 50715,
	BlackLevelDeltaV = 50716,
	WhiteLevel = 50717,
	DefaultScale = 50718,
	DefaultCropOrigin = 50719,
	DefaultCropSize = 50720,
	ColorMatrix1 = 50721,
	ColorMatrix2 = 50722,
	CameraCalibration1 = 50723,
	CameraCalibration2 = 50724,
	ReductionMatrix1 = 50725,
	ReductionMatrix2 = 50726,
	AnalogBalance = 50727,
	AsShotNeutral = 50728,
	AsShotWhiteXY = 50729,
	BaselineExposure = 50730,
	BaselineNoise = 50731,
	BaselineSharpness = 50732,
	BayerGreenSplit = 50733,
	LinearResponseLimit = 50734,
	CameraSerialNumber = 50735,
	LensInfo = 50736,
	ChromaBlurRadius = 50737,
	AntiAliasStrength = 50738,
	ShadowScale = 50739,
	DNGPrivateData = 50740,
	MakerNoteSafety = 50741,
	CalibrationIlluminant1 = 50778,
	CalibrationIlluminant2 = 50779,
	BestQualityScale = 50780,
	RawDataUniqueID = 50781,
	OriginalRawFileName = 50827,
	OriginalRawFileData = 50828,
	ActiveArea = 50829,
	MaskedAreas = 50830,
	AsShotICCProfile = 50831,
	AsShotPreProfileMatrix = 50832,
	CurrentICCProfile = 50833,
	CurrentPreProfileMatrix = 50834,
	ColorimetricReference = 50879,
	CameraCalibrationSignature = 50931,
	ProfileCalibrationSignature = 50932,
	ExtraCameraProfiles = 50933,
	AsShotProfileName = 50934,
	NoiseReductionApplied = 50935,
	ProfileName = 50936,
	ProfileHueSatMapDims = 50937,
	ProfileHueSatMapData1 = 50938,
	ProfileHueSatMapData2 = 50939,
	ProfileToneCurve = 50940,
	ProfileEmbedPolicy = 50941,
	ProfileCopyright = 50942,
	ForwardMatrix1 = 50964,
	ForwardMatrix2 = 50965,
	PreviewApplicationName = 50966,
	PreviewApplicationVersion = 50967,
	PreviewSettingsName = 50968,
	PreviewSettingsDigest = 50969,
	PreviewColorSpace = 50970,
	PreviewDateTime = 50971,
	RawImageDigest = 50972,
	OriginalRawFileDigest = 50973,
	SubTileBlockSize = 50974,
	RowInterleaveFactor = 50975,
	ProfileLookTableDims = 50981,
	ProfileLookTableData = 50982,
	OpcodeList1 = 51008,
	OpcodeList2 = 51009,
	OpcodeList3 = 51022,
	NoiseProfile = 51041,
	DefaultUserCrop = 51125,
	DefaultBlackRender = 51110,
	BaselineExposureOffset = 51109,
	ProfileLookTableEncoding = 51108,
	ProfileHueSatMapEncoding = 51107,
	OriginalDefaultFinalSize = 51089,
	OriginalBestQualityFinalSize = 51090,
	OriginalDefaultCropSize = 51091,
	NewRawImageDigest = 51111,
	RawToPreviewGain = 51112,
	DepthFormat = 51177,
	DepthNear = 51178,
	DepthFar = 51179,
	DepthUnits = 51180,
	DepthMeasureType = 51181,
	EnhanceParams = 51182,
}

// CFA (Color Filter Array) Layouts
export enum CFALayout {
	Rectangular = 1,
	EvenColumnsOffset = 2,
	EvenRowsOffset = 3,
	Staggered = 4,
	SquareStaggered = 5,
	RectangularStaggered = 6,
	EvenColumnsStaggered = 7,
	EvenRowsStaggered = 8,
}

// Calibration Illuminants
export enum Illuminant {
	Unknown = 0,
	Daylight = 1,
	Fluorescent = 2,
	Tungsten = 3,
	Flash = 4,
	FineWeather = 9,
	CloudyWeather = 10,
	Shade = 11,
	DaylightFluorescent = 12,
	DayWhiteFluorescent = 13,
	CoolWhiteFluorescent = 14,
	WhiteFluorescent = 15,
	StandardLightA = 17,
	StandardLightB = 18,
	StandardLightC = 19,
	D55 = 20,
	D65 = 21,
	D75 = 22,
	D50 = 23,
	ISOStudioTungsten = 24,
	Other = 255,
}

// Preview Color Space
export enum PreviewColorSpace {
	Unknown = 0,
	GrayGamma22 = 1,
	sRGB = 2,
	AdobeRGB = 3,
	ProPhotoRGB = 4,
}

// Profile Embed Policy
export enum ProfileEmbedPolicy {
	AllowCopying = 0,
	EmbedIfUsed = 1,
	EmbedNever = 2,
	NoRestrictions = 3,
}

// DNG-specific metadata
export interface DNGMetadata {
	dngVersion?: number[]
	dngBackwardVersion?: number[]
	uniqueCameraModel?: string
	localizedCameraModel?: string
	cameraSerialNumber?: string
	lensInfo?: number[]
	whiteLevel?: number[]
	blackLevel?: number[]
	colorMatrix1?: number[]
	colorMatrix2?: number[]
	calibrationIlluminant1?: Illuminant
	calibrationIlluminant2?: Illuminant
	asShotNeutral?: number[]
	baselineExposure?: number
	baselineNoise?: number
	baselineSharpness?: number
	profileName?: string
	profileCopyright?: string
}

// DNG Image structure
export interface DNGImage extends TiffImageBase {
	metadata?: DNGMetadata
}
