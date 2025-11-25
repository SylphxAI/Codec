/**
 * DICOM format types and constants
 */

// DICOM magic at offset 128
export const DICOM_MAGIC = 'DICM'
export const DICOM_MAGIC_OFFSET = 128

// Value Representations (VR)
export enum VR {
	AE = 'AE', // Application Entity
	AS = 'AS', // Age String
	AT = 'AT', // Attribute Tag
	CS = 'CS', // Code String
	DA = 'DA', // Date
	DS = 'DS', // Decimal String
	DT = 'DT', // DateTime
	FL = 'FL', // Float 32-bit
	FD = 'FD', // Float 64-bit
	IS = 'IS', // Integer String
	LO = 'LO', // Long String
	LT = 'LT', // Long Text
	OB = 'OB', // Other Byte
	OD = 'OD', // Other Double
	OF = 'OF', // Other Float
	OW = 'OW', // Other Word
	PN = 'PN', // Person Name
	SH = 'SH', // Short String
	SL = 'SL', // Signed Long
	SQ = 'SQ', // Sequence
	SS = 'SS', // Signed Short
	ST = 'ST', // Short Text
	TM = 'TM', // Time
	UC = 'UC', // Unlimited Characters
	UI = 'UI', // Unique Identifier
	UL = 'UL', // Unsigned Long
	UN = 'UN', // Unknown
	UR = 'UR', // URI
	US = 'US', // Unsigned Short
	UT = 'UT', // Unlimited Text
}

// Important DICOM tags
export enum DicomTag {
	// Meta information
	FileMetaInformationGroupLength = 0x00020000,
	FileMetaInformationVersion = 0x00020001,
	MediaStorageSOPClassUID = 0x00020002,
	MediaStorageSOPInstanceUID = 0x00020003,
	TransferSyntaxUID = 0x00020010,
	ImplementationClassUID = 0x00020012,
	ImplementationVersionName = 0x00020013,

	// Patient information
	PatientName = 0x00100010,
	PatientID = 0x00100020,
	PatientBirthDate = 0x00100030,
	PatientSex = 0x00100040,

	// Study information
	StudyDate = 0x00080020,
	StudyTime = 0x00080030,
	StudyInstanceUID = 0x0020000d,
	StudyID = 0x00200010,

	// Image information
	Rows = 0x00280010,
	Columns = 0x00280011,
	BitsAllocated = 0x00280100,
	BitsStored = 0x00280101,
	HighBit = 0x00280102,
	PixelRepresentation = 0x00280103,
	SamplesPerPixel = 0x00280002,
	PhotometricInterpretation = 0x00280004,
	PlanarConfiguration = 0x00280006,
	PixelData = 0x7fe00010,

	// Window/Level
	WindowCenter = 0x00281050,
	WindowWidth = 0x00281051,
	RescaleIntercept = 0x00281052,
	RescaleSlope = 0x00281053,

	// Modality
	Modality = 0x00080060,
}

// Transfer Syntax UIDs
export const TransferSyntax = {
	ImplicitVRLittleEndian: '1.2.840.10008.1.2',
	ExplicitVRLittleEndian: '1.2.840.10008.1.2.1',
	ExplicitVRBigEndian: '1.2.840.10008.1.2.2',
	DeflatedExplicitVRLittleEndian: '1.2.840.10008.1.2.1.99',
	JPEGBaseline: '1.2.840.10008.1.2.4.50',
	JPEGLossless: '1.2.840.10008.1.2.4.70',
	JPEG2000Lossless: '1.2.840.10008.1.2.4.90',
	RLELossless: '1.2.840.10008.1.2.5',
} as const

// Photometric interpretation values
export enum PhotometricInterpretation {
	Monochrome1 = 'MONOCHROME1', // Min=white, Max=black
	Monochrome2 = 'MONOCHROME2', // Min=black, Max=white
	RGB = 'RGB',
	PaletteColor = 'PALETTE COLOR',
	YBRFull = 'YBR_FULL',
	YBRFull422 = 'YBR_FULL_422',
}

/**
 * DICOM data element
 */
export interface DicomElement {
	tag: number
	vr: string
	length: number
	value: DicomValue
}

/**
 * DICOM value types
 */
export type DicomValue =
	| string
	| number
	| number[]
	| Uint8Array
	| Uint16Array
	| Int16Array
	| DicomElement[]

/**
 * Parsed DICOM structure
 */
export interface DicomImage {
	littleEndian: boolean
	explicitVR: boolean
	elements: Map<number, DicomElement>
}

/**
 * DICOM pixel data information
 */
export interface PixelInfo {
	rows: number
	columns: number
	bitsAllocated: number
	bitsStored: number
	highBit: number
	pixelRepresentation: number // 0 = unsigned, 1 = signed
	samplesPerPixel: number
	photometricInterpretation: string
	planarConfiguration: number
	windowCenter?: number
	windowWidth?: number
	rescaleIntercept: number
	rescaleSlope: number
}

/**
 * VR type information
 */
export interface VRInfo {
	name: string
	bytes: number // 0 = variable with 32-bit length, -1 = variable with 16-bit length
	fixed: boolean
}

/**
 * VR specifications
 */
export const VR_INFO: Record<string, VRInfo> = {
	AE: { name: 'Application Entity', bytes: -1, fixed: false },
	AS: { name: 'Age String', bytes: 4, fixed: true },
	AT: { name: 'Attribute Tag', bytes: 4, fixed: true },
	CS: { name: 'Code String', bytes: -1, fixed: false },
	DA: { name: 'Date', bytes: 8, fixed: false },
	DS: { name: 'Decimal String', bytes: -1, fixed: false },
	DT: { name: 'DateTime', bytes: -1, fixed: false },
	FL: { name: 'Float 32', bytes: 4, fixed: true },
	FD: { name: 'Float 64', bytes: 8, fixed: true },
	IS: { name: 'Integer String', bytes: -1, fixed: false },
	LO: { name: 'Long String', bytes: -1, fixed: false },
	LT: { name: 'Long Text', bytes: -1, fixed: false },
	OB: { name: 'Other Byte', bytes: 0, fixed: false },
	OD: { name: 'Other Double', bytes: 0, fixed: false },
	OF: { name: 'Other Float', bytes: 0, fixed: false },
	OW: { name: 'Other Word', bytes: 0, fixed: false },
	PN: { name: 'Person Name', bytes: -1, fixed: false },
	SH: { name: 'Short String', bytes: -1, fixed: false },
	SL: { name: 'Signed Long', bytes: 4, fixed: true },
	SQ: { name: 'Sequence', bytes: 0, fixed: false },
	SS: { name: 'Signed Short', bytes: 2, fixed: true },
	ST: { name: 'Short Text', bytes: -1, fixed: false },
	TM: { name: 'Time', bytes: -1, fixed: false },
	UC: { name: 'Unlimited Characters', bytes: 0, fixed: false },
	UI: { name: 'Unique Identifier', bytes: -1, fixed: false },
	UL: { name: 'Unsigned Long', bytes: 4, fixed: true },
	UN: { name: 'Unknown', bytes: 0, fixed: false },
	UR: { name: 'URI', bytes: 0, fixed: false },
	US: { name: 'Unsigned Short', bytes: 2, fixed: true },
	UT: { name: 'Unlimited Text', bytes: 0, fixed: false },
}
