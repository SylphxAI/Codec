/**
 * Transform types and options
 */

export type ResizeMethod = 'nearest' | 'bilinear' | 'bicubic' | 'lanczos'

export interface ResizeOptions {
	/** Resize method (default: bilinear) */
	method?: ResizeMethod
	/** Preserve aspect ratio (default: false) */
	preserveAspectRatio?: boolean
	/** Fill color for letterboxing when preserving aspect ratio [R, G, B, A] */
	fillColor?: [number, number, number, number]
}

export interface CropOptions {
	/** X coordinate of top-left corner */
	x: number
	/** Y coordinate of top-left corner */
	y: number
	/** Width of crop area */
	width: number
	/** Height of crop area */
	height: number
}

export type RotateAngle = 90 | 180 | 270 | number

export interface RotateOptions {
	/** Rotation angle in degrees (clockwise) */
	angle: RotateAngle
	/** Fill color for corners when rotating arbitrary angles [R, G, B, A] */
	fillColor?: [number, number, number, number]
	/** Expand canvas to fit rotated image (default: true for arbitrary angles) */
	expand?: boolean
}

export type FlipDirection = 'horizontal' | 'vertical' | 'both'
