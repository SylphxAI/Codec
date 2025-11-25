/**
 * Color adjustment types
 */

export interface AdjustmentOptions {
	/** Brightness adjustment (-100 to 100, default 0) */
	brightness?: number
	/** Contrast adjustment (-100 to 100, default 0) */
	contrast?: number
	/** Saturation adjustment (-100 to 100, default 0) */
	saturation?: number
	/** Hue rotation in degrees (-180 to 180, default 0) */
	hue?: number
	/** Gamma correction (0.1 to 10, default 1) */
	gamma?: number
}

export interface LevelsOptions {
	/** Input black point (0-255) */
	inputBlack?: number
	/** Input white point (0-255) */
	inputWhite?: number
	/** Output black point (0-255) */
	outputBlack?: number
	/** Output white point (0-255) */
	outputWhite?: number
	/** Midpoint gamma (0.1-10) */
	gamma?: number
}

export interface ColorBalanceOptions {
	/** Cyan-Red adjustment (-100 to 100) */
	cyanRed?: number
	/** Magenta-Green adjustment (-100 to 100) */
	magentaGreen?: number
	/** Yellow-Blue adjustment (-100 to 100) */
	yellowBlue?: number
	/** Apply to shadows (default true) */
	shadows?: boolean
	/** Apply to midtones (default true) */
	midtones?: boolean
	/** Apply to highlights (default true) */
	highlights?: boolean
}

/** RGB color */
export type RGB = [number, number, number]

/** RGBA color */
export type RGBA = [number, number, number, number]

/** HSL color (hue 0-360, saturation 0-100, lightness 0-100) */
export type HSL = [number, number, number]

/** HSV color (hue 0-360, saturation 0-100, value 0-100) */
export type HSV = [number, number, number]

/** CMYK color (cyan 0-100, magenta 0-100, yellow 0-100, black 0-100) */
export type CMYK = [number, number, number, number]

/** LAB color (lightness 0-100, a -128 to 127, b -128 to 127) */
export type LAB = [number, number, number]
