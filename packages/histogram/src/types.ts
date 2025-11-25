/**
 * Histogram types
 */

/** Histogram data (256 bins per channel) */
export interface Histogram {
	/** Red channel histogram */
	red: Uint32Array
	/** Green channel histogram */
	green: Uint32Array
	/** Blue channel histogram */
	blue: Uint32Array
	/** Luminance histogram */
	luminance: Uint32Array
	/** Alpha channel histogram */
	alpha: Uint32Array
}

/** Image statistics */
export interface ImageStats {
	/** Per-channel statistics */
	red: ChannelStats
	green: ChannelStats
	blue: ChannelStats
	luminance: ChannelStats
	/** Overall statistics */
	mean: number
	stdDev: number
}

/** Channel statistics */
export interface ChannelStats {
	/** Minimum value */
	min: number
	/** Maximum value */
	max: number
	/** Mean (average) value */
	mean: number
	/** Median value */
	median: number
	/** Standard deviation */
	stdDev: number
	/** Total pixel count */
	count: number
}

/** Auto-levels options */
export interface AutoLevelsOptions {
	/** Clip percentage for shadows (0-50, default: 0.1) */
	shadowClip?: number
	/** Clip percentage for highlights (0-50, default: 0.1) */
	highlightClip?: number
	/** Apply per-channel (default: false = use luminance) */
	perChannel?: boolean
}

/** Auto-contrast options */
export interface AutoContrastOptions {
	/** Clip percentage (0-50, default: 0.5) */
	clip?: number
}

/** Equalization options */
export interface EqualizeOptions {
	/** Equalize per-channel (default: false = use luminance) */
	perChannel?: boolean
}
