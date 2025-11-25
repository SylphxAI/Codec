/**
 * Drawing types
 */

/** RGBA color */
export type Color = [number, number, number, number]

/** Point */
export interface Point {
	x: number
	y: number
}

/** Rectangle */
export interface Rect {
	x: number
	y: number
	width: number
	height: number
}

/** Line style */
export interface LineStyle {
	/** Line color */
	color?: Color
	/** Line width in pixels */
	width?: number
	/** Line cap style */
	cap?: 'butt' | 'round' | 'square'
	/** Dash pattern [dash, gap, ...] */
	dash?: number[]
}

/** Fill style */
export interface FillStyle {
	/** Fill color */
	color?: Color
}

/** Shape options */
export interface ShapeOptions {
	/** Stroke style */
	stroke?: LineStyle
	/** Fill style */
	fill?: FillStyle
}

/** Text options */
export interface TextOptions {
	/** Font size in pixels */
	size?: number
	/** Text color */
	color?: Color
	/** Horizontal alignment */
	align?: 'left' | 'center' | 'right'
	/** Vertical alignment */
	baseline?: 'top' | 'middle' | 'bottom'
}

/** Gradient stop */
export interface GradientStop {
	/** Position (0-1) */
	position: number
	/** Color at this position */
	color: Color
}

/** Linear gradient */
export interface LinearGradient {
	type: 'linear'
	x1: number
	y1: number
	x2: number
	y2: number
	stops: GradientStop[]
}

/** Radial gradient */
export interface RadialGradient {
	type: 'radial'
	cx: number
	cy: number
	radius: number
	stops: GradientStop[]
}

export type Gradient = LinearGradient | RadialGradient
