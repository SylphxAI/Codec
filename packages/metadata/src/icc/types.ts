/**
 * ICC profile types
 */

/** ICC profile class/device types */
export enum IccProfileClass {
	INPUT = 'scnr',
	DISPLAY = 'mntr',
	OUTPUT = 'prtr',
	DEVICE_LINK = 'link',
	COLOR_SPACE = 'spac',
	ABSTRACT = 'abst',
	NAMED_COLOR = 'nmcl',
}

/** ICC color space signatures */
export enum IccColorSpace {
	XYZ = 'XYZ ',
	LAB = 'Lab ',
	LUV = 'Luv ',
	YCBCR = 'YCbr',
	YXY = 'Yxy ',
	RGB = 'RGB ',
	GRAY = 'GRAY',
	HSV = 'HSV ',
	HLS = 'HLS ',
	CMYK = 'CMYK',
	CMY = 'CMY ',
}

/** ICC rendering intent */
export enum IccRenderingIntent {
	PERCEPTUAL = 0,
	RELATIVE_COLORIMETRIC = 1,
	SATURATION = 2,
	ABSOLUTE_COLORIMETRIC = 3,
}

/** Common ICC tag signatures */
export const IccTags: Record<string, string> = {
	cprt: 'Copyright',
	desc: 'Description',
	dmnd: 'DeviceManufacturer',
	dmdd: 'DeviceModel',
	wtpt: 'WhitePoint',
	bkpt: 'BlackPoint',
	rXYZ: 'RedMatrixColumn',
	gXYZ: 'GreenMatrixColumn',
	bXYZ: 'BlueMatrixColumn',
	rTRC: 'RedTRC',
	gTRC: 'GreenTRC',
	bTRC: 'BlueTRC',
	kTRC: 'GrayTRC',
	A2B0: 'AToB0',
	A2B1: 'AToB1',
	A2B2: 'AToB2',
	B2A0: 'BToA0',
	B2A1: 'BToA1',
	B2A2: 'BToA2',
	gamt: 'Gamut',
	chad: 'ChromaticAdaptation',
	chrm: 'Chromaticity',
	clro: 'ColorantOrder',
	clrt: 'ColorantTable',
	cicp: 'CICPCoding',
}

/** ICC profile header */
export interface IccHeader {
	size: number
	preferredCMM: string
	version: string
	profileClass: string
	colorSpace: string
	pcs: string
	dateTime: Date
	signature: string
	platform: string
	flags: number
	manufacturer: string
	model: number
	attributes: bigint
	renderingIntent: IccRenderingIntent
	illuminant: { x: number; y: number; z: number }
	creator: string
}

/** ICC tag entry */
export interface IccTag {
	signature: string
	offset: number
	size: number
	data?: Uint8Array
	value?: unknown
}

/** Parsed ICC profile */
export interface IccProfile {
	header: IccHeader
	tags: Map<string, IccTag>

	// Commonly accessed values
	description?: string
	copyright?: string
	manufacturer?: string
	model?: string

	// Color primaries (for RGB profiles)
	redPrimary?: { x: number; y: number; z: number }
	greenPrimary?: { x: number; y: number; z: number }
	bluePrimary?: { x: number; y: number; z: number }
	whitePoint?: { x: number; y: number; z: number }

	// TRC (tone response curves)
	redTRC?: number[] | number
	greenTRC?: number[] | number
	blueTRC?: number[] | number
	grayTRC?: number[] | number
}

/** Well-known ICC profiles */
export const WellKnownProfiles = {
	SRGB: 'sRGB IEC61966-2.1',
	ADOBE_RGB: 'Adobe RGB (1998)',
	PROPHOTO_RGB: 'ProPhoto RGB',
	DISPLAY_P3: 'Display P3',
}
