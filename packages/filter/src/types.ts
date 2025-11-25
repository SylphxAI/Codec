/**
 * Filter types and options
 */

/** Kernel for convolution operations */
export interface Kernel {
	/** Kernel width (must be odd) */
	width: number
	/** Kernel height (must be odd) */
	height: number
	/** Kernel values (row-major order) */
	data: number[]
	/** Divisor for normalization (default: sum of values or 1) */
	divisor?: number
	/** Offset to add after division (default: 0) */
	offset?: number
}

/** Edge handling mode for convolution */
export type EdgeMode = 'clamp' | 'wrap' | 'mirror' | 'zero'

/** Blur options */
export interface BlurOptions {
	/** Blur radius (default: 1) */
	radius?: number
	/** Blur type (default: 'gaussian') */
	type?: 'box' | 'gaussian'
}

/** Sharpen options */
export interface SharpenOptions {
	/** Sharpen amount (0-100, default: 50) */
	amount?: number
	/** Sharpen radius (default: 1) */
	radius?: number
}

/** Edge detection options */
export interface EdgeDetectOptions {
	/** Algorithm to use (default: 'sobel') */
	algorithm?: 'sobel' | 'prewitt' | 'laplacian' | 'canny'
	/** Threshold for binary output (0-255, optional) */
	threshold?: number
}

/** Emboss options */
export interface EmbossOptions {
	/** Light angle in degrees (default: 135) */
	angle?: number
	/** Emboss strength (default: 1) */
	strength?: number
}

/** Noise reduction options */
export interface DenoiseOptions {
	/** Algorithm (default: 'median') */
	algorithm?: 'median' | 'bilateral'
	/** Filter radius (default: 1) */
	radius?: number
}
