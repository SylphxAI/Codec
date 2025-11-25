/**
 * GIMP XCF format types
 */

/** XCF image types */
export enum XcfImageType {
	RGB = 0,
	GRAYSCALE = 1,
	INDEXED = 2,
}

/** XCF compression types */
export enum XcfCompression {
	NONE = 0,
	RLE = 1,
	ZLIB = 2,
	FRACTAL = 3,
}

/** XCF layer modes */
export enum XcfLayerMode {
	NORMAL = 0,
	DISSOLVE = 1,
	BEHIND = 2,
	MULTIPLY = 3,
	SCREEN = 4,
	OVERLAY = 5,
	DIFFERENCE = 6,
	ADDITION = 7,
	SUBTRACT = 8,
	DARKEN_ONLY = 9,
	LIGHTEN_ONLY = 10,
	HUE = 11,
	SATURATION = 12,
	COLOR = 13,
	VALUE = 14,
	DIVIDE = 15,
	DODGE = 16,
	BURN = 17,
	HARDLIGHT = 18,
}

/** XCF property types */
export enum XcfPropertyType {
	END = 0,
	COLORMAP = 1,
	ACTIVE_LAYER = 2,
	ACTIVE_CHANNEL = 3,
	SELECTION = 4,
	FLOATING_SELECTION = 5,
	OPACITY = 6,
	MODE = 7,
	VISIBLE = 8,
	LINKED = 9,
	PRESERVE_TRANSPARENCY = 10,
	APPLY_MASK = 11,
	EDIT_MASK = 12,
	SHOW_MASK = 13,
	OFFSETS = 15,
	COLOR = 16,
	COMPRESSION = 17,
	GUIDES = 18,
	RESOLUTION = 19,
	TATTOO = 20,
	PARASITES = 21,
	UNIT = 22,
	PATHS = 23,
	USER_UNIT = 24,
	VECTORS = 25,
	TEXT_LAYER_FLAGS = 26,
}

/** XCF file header */
export interface XcfHeader {
	signature: string
	version: number
	width: number
	height: number
	imageType: XcfImageType
	precision: number
}

/** XCF layer info */
export interface XcfLayer {
	name: string
	width: number
	height: number
	layerType: XcfImageType
	offsetX: number
	offsetY: number
	opacity: number
	visible: boolean
	mode: XcfLayerMode
	hasAlpha: boolean
}

/** XCF tile info */
export interface XcfTile {
	x: number
	y: number
	width: number
	height: number
	data: Uint8Array
}

/** XCF file info (from parsing) */
export interface XcfInfo {
	header: XcfHeader
	layers: XcfLayer[]
	hasAlpha: boolean
}
