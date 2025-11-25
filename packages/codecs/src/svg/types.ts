/**
 * SVG types and interfaces - Full SVG support
 */

export interface SvgDecodeOptions {
	/** Target width (default: use viewBox/width) */
	width?: number
	/** Target height (default: use viewBox/height) */
	height?: number
	/** Background color (default: transparent) */
	background?: string
}

export interface SvgInfo {
	width: number
	height: number
	viewBox?: { x: number; y: number; width: number; height: number }
}

// ─────────────────────────────────────────────────────────────────────────────
// Color types
// ─────────────────────────────────────────────────────────────────────────────

export interface RgbaColor {
	r: number
	g: number
	b: number
	a: number
}

export interface GradientStop {
	offset: number // 0-1
	color: RgbaColor
}

export interface LinearGradient {
	type: 'linearGradient'
	id: string
	x1: number
	y1: number
	x2: number
	y2: number
	stops: GradientStop[]
	gradientUnits: 'userSpaceOnUse' | 'objectBoundingBox'
	gradientTransform?: SvgTransform[]
	spreadMethod: 'pad' | 'reflect' | 'repeat'
}

export interface RadialGradient {
	type: 'radialGradient'
	id: string
	cx: number
	cy: number
	r: number
	fx: number
	fy: number
	stops: GradientStop[]
	gradientUnits: 'userSpaceOnUse' | 'objectBoundingBox'
	gradientTransform?: SvgTransform[]
	spreadMethod: 'pad' | 'reflect' | 'repeat'
}

export type SvgGradient = LinearGradient | RadialGradient

export interface SvgPattern {
	type: 'pattern'
	id: string
	x: number
	y: number
	width: number
	height: number
	patternUnits: 'userSpaceOnUse' | 'objectBoundingBox'
	patternContentUnits: 'userSpaceOnUse' | 'objectBoundingBox'
	patternTransform?: SvgTransform[]
	elements: SvgElement[]
}

export type SvgPaint =
	| { type: 'none' }
	| { type: 'color'; color: RgbaColor }
	| { type: 'url'; id: string }
	| { type: 'currentColor' }

// ─────────────────────────────────────────────────────────────────────────────
// Stroke properties
// ─────────────────────────────────────────────────────────────────────────────

export type StrokeLinecap = 'butt' | 'round' | 'square'
export type StrokeLinejoin = 'miter' | 'round' | 'bevel'

export interface StrokeStyle {
	paint: SvgPaint
	width: number
	linecap: StrokeLinecap
	linejoin: StrokeLinejoin
	miterLimit: number
	dasharray: number[]
	dashoffset: number
	opacity: number
}

export interface FillStyle {
	paint: SvgPaint
	rule: 'nonzero' | 'evenodd'
	opacity: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Element types
// ─────────────────────────────────────────────────────────────────────────────

export type SvgElement =
	| SvgRect
	| SvgCircle
	| SvgEllipse
	| SvgLine
	| SvgPolyline
	| SvgPolygon
	| SvgPath
	| SvgText
	| SvgTspan
	| SvgGroup
	| SvgImage
	| SvgUse
	| SvgSymbol
	| SvgClipPath
	| SvgMask

export interface SvgBaseElement {
	id?: string
	fill?: SvgPaint
	fillRule?: 'nonzero' | 'evenodd'
	fillOpacity?: number
	stroke?: SvgPaint
	strokeWidth?: number
	strokeLinecap?: StrokeLinecap
	strokeLinejoin?: StrokeLinejoin
	strokeMiterLimit?: number
	strokeDasharray?: number[]
	strokeDashoffset?: number
	strokeOpacity?: number
	opacity?: number
	transform?: SvgTransform[]
	clipPath?: string
	mask?: string
	display?: 'none' | 'inline' | 'block'
	visibility?: 'visible' | 'hidden' | 'collapse'
}

export interface SvgRect extends SvgBaseElement {
	type: 'rect'
	x: number
	y: number
	width: number
	height: number
	rx?: number
	ry?: number
}

export interface SvgCircle extends SvgBaseElement {
	type: 'circle'
	cx: number
	cy: number
	r: number
}

export interface SvgEllipse extends SvgBaseElement {
	type: 'ellipse'
	cx: number
	cy: number
	rx: number
	ry: number
}

export interface SvgLine extends SvgBaseElement {
	type: 'line'
	x1: number
	y1: number
	x2: number
	y2: number
}

export interface SvgPolyline extends SvgBaseElement {
	type: 'polyline'
	points: Array<{ x: number; y: number }>
}

export interface SvgPolygon extends SvgBaseElement {
	type: 'polygon'
	points: Array<{ x: number; y: number }>
}

export interface SvgPath extends SvgBaseElement {
	type: 'path'
	d: string
	commands: PathCommand[]
}

export interface SvgText extends SvgBaseElement {
	type: 'text'
	x: number
	y: number
	dx?: number
	dy?: number
	textAnchor?: 'start' | 'middle' | 'end'
	dominantBaseline?: 'auto' | 'middle' | 'hanging' | 'alphabetic'
	fontSize?: number
	fontFamily?: string
	fontWeight?: 'normal' | 'bold' | number
	fontStyle?: 'normal' | 'italic' | 'oblique'
	letterSpacing?: number
	children: Array<SvgTspan | string>
}

export interface SvgTspan extends SvgBaseElement {
	type: 'tspan'
	x?: number
	y?: number
	dx?: number
	dy?: number
	fontSize?: number
	fontFamily?: string
	fontWeight?: 'normal' | 'bold' | number
	text: string
}

export interface SvgGroup extends SvgBaseElement {
	type: 'group'
	children: SvgElement[]
}

export interface SvgImage extends SvgBaseElement {
	type: 'image'
	x: number
	y: number
	width: number
	height: number
	href: string
	preserveAspectRatio?: string
}

export interface SvgUse extends SvgBaseElement {
	type: 'use'
	x: number
	y: number
	width?: number
	height?: number
	href: string
}

export interface SvgSymbol extends SvgBaseElement {
	type: 'symbol'
	viewBox?: { x: number; y: number; width: number; height: number }
	preserveAspectRatio?: string
	children: SvgElement[]
}

export interface SvgClipPath extends SvgBaseElement {
	type: 'clipPath'
	clipPathUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
	children: SvgElement[]
}

export interface SvgMask extends SvgBaseElement {
	type: 'mask'
	x: number
	y: number
	width: number
	height: number
	maskUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
	maskContentUnits?: 'userSpaceOnUse' | 'objectBoundingBox'
	children: SvgElement[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform types
// ─────────────────────────────────────────────────────────────────────────────

export type SvgTransform =
	| { type: 'translate'; x: number; y: number }
	| { type: 'scale'; x: number; y: number }
	| { type: 'rotate'; angle: number; cx?: number; cy?: number }
	| { type: 'skewX'; angle: number }
	| { type: 'skewY'; angle: number }
	| { type: 'matrix'; a: number; b: number; c: number; d: number; e: number; f: number }

// ─────────────────────────────────────────────────────────────────────────────
// Path commands
// ─────────────────────────────────────────────────────────────────────────────

export type PathCommand =
	| { type: 'M'; x: number; y: number }
	| { type: 'm'; dx: number; dy: number }
	| { type: 'L'; x: number; y: number }
	| { type: 'l'; dx: number; dy: number }
	| { type: 'H'; x: number }
	| { type: 'h'; dx: number }
	| { type: 'V'; y: number }
	| { type: 'v'; dy: number }
	| { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
	| { type: 'c'; dx1: number; dy1: number; dx2: number; dy2: number; dx: number; dy: number }
	| { type: 'S'; x2: number; y2: number; x: number; y: number }
	| { type: 's'; dx2: number; dy2: number; dx: number; dy: number }
	| { type: 'Q'; x1: number; y1: number; x: number; y: number }
	| { type: 'q'; dx1: number; dy1: number; dx: number; dy: number }
	| { type: 'T'; x: number; y: number }
	| { type: 't'; dx: number; dy: number }
	| { type: 'A'; rx: number; ry: number; angle: number; largeArc: boolean; sweep: boolean; x: number; y: number }
	| { type: 'a'; rx: number; ry: number; angle: number; largeArc: boolean; sweep: boolean; dx: number; dy: number }
	| { type: 'Z' }
	| { type: 'z' }

// ─────────────────────────────────────────────────────────────────────────────
// Filter types (basic support)
// ─────────────────────────────────────────────────────────────────────────────

export interface SvgFilter {
	type: 'filter'
	id: string
	x: number
	y: number
	width: number
	height: number
	filterUnits: 'userSpaceOnUse' | 'objectBoundingBox'
	primitives: SvgFilterPrimitive[]
}

export type SvgFilterPrimitive =
	| SvgFeGaussianBlur
	| SvgFeOffset
	| SvgFeBlend
	| SvgFeColorMatrix
	| SvgFeFlood
	| SvgFeMerge

export interface SvgFeGaussianBlur {
	type: 'feGaussianBlur'
	in?: string
	result?: string
	stdDeviation: number
}

export interface SvgFeOffset {
	type: 'feOffset'
	in?: string
	result?: string
	dx: number
	dy: number
}

export interface SvgFeBlend {
	type: 'feBlend'
	in?: string
	in2?: string
	result?: string
	mode: 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
}

export interface SvgFeColorMatrix {
	type: 'feColorMatrix'
	in?: string
	result?: string
	matrixType: 'matrix' | 'saturate' | 'hueRotate' | 'luminanceToAlpha'
	values: number[]
}

export interface SvgFeFlood {
	type: 'feFlood'
	result?: string
	floodColor: RgbaColor
	floodOpacity: number
}

export interface SvgFeMerge {
	type: 'feMerge'
	result?: string
	nodes: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Document types
// ─────────────────────────────────────────────────────────────────────────────

export interface SvgDefs {
	gradients: Map<string, SvgGradient>
	patterns: Map<string, SvgPattern>
	clipPaths: Map<string, SvgClipPath>
	masks: Map<string, SvgMask>
	filters: Map<string, SvgFilter>
	symbols: Map<string, SvgSymbol>
	elements: Map<string, SvgElement>
}

export interface SvgDocument {
	width: number
	height: number
	viewBox: { x: number; y: number; width: number; height: number }
	preserveAspectRatio: PreserveAspectRatio
	elements: SvgElement[]
	defs: SvgDefs
	styles: Map<string, CssProperties>
}

export interface PreserveAspectRatio {
	align: 'none' | 'xMinYMin' | 'xMidYMin' | 'xMaxYMin' | 'xMinYMid' | 'xMidYMid' | 'xMaxYMid' | 'xMinYMax' | 'xMidYMax' | 'xMaxYMax'
	meetOrSlice: 'meet' | 'slice'
}

export interface CssProperties {
	fill?: string
	fillRule?: string
	fillOpacity?: string
	stroke?: string
	strokeWidth?: string
	strokeLinecap?: string
	strokeLinejoin?: string
	strokeDasharray?: string
	strokeDashoffset?: string
	strokeOpacity?: string
	strokeMiterLimit?: string
	opacity?: string
	display?: string
	visibility?: string
	transform?: string
	fontSize?: string
	fontFamily?: string
	fontWeight?: string
	fontStyle?: string
	textAnchor?: string
	dominantBaseline?: string
	letterSpacing?: string
	clipPath?: string
	mask?: string
	filter?: string
}
