/**
 * Compositing types
 */

/** Standard blend modes */
export type BlendMode =
	// Normal
	| 'normal'
	// Darken
	| 'darken'
	| 'multiply'
	| 'colorBurn'
	| 'linearBurn'
	// Lighten
	| 'lighten'
	| 'screen'
	| 'colorDodge'
	| 'linearDodge'
	// Contrast
	| 'overlay'
	| 'softLight'
	| 'hardLight'
	| 'vividLight'
	| 'linearLight'
	| 'pinLight'
	| 'hardMix'
	// Inversion
	| 'difference'
	| 'exclusion'
	| 'subtract'
	| 'divide'
	// Component
	| 'hue'
	| 'saturation'
	| 'color'
	| 'luminosity'

/** Composite operation options */
export interface CompositeOptions {
	/** X position to place the overlay */
	x?: number
	/** Y position to place the overlay */
	y?: number
	/** Blend mode */
	blendMode?: BlendMode
	/** Opacity (0-1) */
	opacity?: number
}

/** Layer definition */
export interface Layer {
	/** Layer image data */
	image: {
		width: number
		height: number
		data: Uint8Array
	}
	/** X position */
	x?: number
	/** Y position */
	y?: number
	/** Blend mode */
	blendMode?: BlendMode
	/** Opacity (0-1) */
	opacity?: number
	/** Layer visibility */
	visible?: boolean
}
