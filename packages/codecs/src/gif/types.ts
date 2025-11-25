/**
 * GIF format types and constants
 */

// GIF signatures
export const GIF87A = 'GIF87a'
export const GIF89A = 'GIF89a'

// Block types
export const EXTENSION_INTRODUCER = 0x21
export const IMAGE_SEPARATOR = 0x2c
export const TRAILER = 0x3b

// Extension labels
export const GRAPHIC_CONTROL_EXTENSION = 0xf9
export const COMMENT_EXTENSION = 0xfe
export const PLAIN_TEXT_EXTENSION = 0x01
export const APPLICATION_EXTENSION = 0xff

// Disposal methods
export enum DisposalMethod {
	None = 0,
	DoNotDispose = 1,
	RestoreBackground = 2,
	RestorePrevious = 3,
}

/**
 * Logical Screen Descriptor
 */
export interface LogicalScreenDescriptor {
	width: number
	height: number
	hasGlobalColorTable: boolean
	colorResolution: number
	sortFlag: boolean
	globalColorTableSize: number
	backgroundColorIndex: number
	pixelAspectRatio: number
}

/**
 * Color table entry (RGB)
 */
export type ColorTable = Uint8Array // RGB triplets

/**
 * Graphic Control Extension
 */
export interface GraphicControlExtension {
	disposalMethod: DisposalMethod
	userInputFlag: boolean
	hasTransparency: boolean
	delayTime: number
	transparentColorIndex: number
}

/**
 * Image Descriptor
 */
export interface ImageDescriptor {
	left: number
	top: number
	width: number
	height: number
	hasLocalColorTable: boolean
	interlaced: boolean
	sortFlag: boolean
	localColorTableSize: number
}

/**
 * A single GIF frame
 */
export interface GifFrame {
	imageDescriptor: ImageDescriptor
	localColorTable: ColorTable | null
	graphicControl: GraphicControlExtension | null
	imageData: Uint8Array // Decompressed indexed pixels
}

/**
 * Complete GIF structure
 */
export interface GifImage {
	version: string
	screenDescriptor: LogicalScreenDescriptor
	globalColorTable: ColorTable | null
	frames: GifFrame[]
}
