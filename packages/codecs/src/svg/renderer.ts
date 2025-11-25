/**
 * SVG rasterizer - Full SVG support
 * Renders SVG elements to a bitmap
 */

import type { ImageData } from '@sylphx/codec-core'
import type {
	LinearGradient,
	PathCommand,
	RadialGradient,
	RgbaColor,
	SvgBaseElement,
	SvgCircle,
	SvgClipPath,
	SvgDefs,
	SvgDocument,
	SvgElement,
	SvgEllipse,
	SvgGradient,
	SvgGroup,
	SvgLine,
	SvgPaint,
	SvgPath,
	SvgPolygon,
	SvgPolyline,
	SvgRect,
	SvgText,
	SvgTransform,
	SvgTspan,
	SvgUse,
	StrokeLinecap,
	StrokeLinejoin,
} from './types'
import { parseColor } from './parser'

// ─────────────────────────────────────────────────────────────────────────────
// Render Context
// ─────────────────────────────────────────────────────────────────────────────

interface InheritedStyles {
	fill?: SvgPaint
	fillRule?: 'nonzero' | 'evenodd'
	fillOpacity?: number
	stroke?: SvgPaint
	strokeWidth?: number
	strokeLinecap?: StrokeLinecap
	strokeLinejoin?: StrokeLinejoin
	strokeOpacity?: number
	opacity?: number
}

interface RenderContext {
	width: number
	height: number
	data: Uint8Array
	scaleX: number
	scaleY: number
	offsetX: number
	offsetY: number
	defs: SvgDefs
	clipMask?: Uint8Array
	transform: number[] // 3x3 matrix flattened [a,b,c,d,e,f]
	inherited: InheritedStyles
}

// Helper to get effective fill with inheritance (default to black per SVG spec)
function getEffectiveFill(element: SvgBaseElement, ctx: RenderContext): SvgPaint | undefined {
	if (element.fill !== undefined) return element.fill
	if (ctx.inherited.fill !== undefined) return ctx.inherited.fill
	// SVG default: black fill
	return { type: 'color', color: { r: 0, g: 0, b: 0, a: 255 } }
}

// Helper to get effective stroke with inheritance
function getEffectiveStroke(element: SvgBaseElement, ctx: RenderContext): SvgPaint | undefined {
	if (element.stroke !== undefined) return element.stroke
	return ctx.inherited.stroke
}

// Helper to get effective fill opacity with inheritance
function getEffectiveFillOpacity(element: SvgBaseElement, ctx: RenderContext): number {
	const elementOpacity = element.opacity ?? ctx.inherited.opacity ?? 1
	const fillOpacity = element.fillOpacity ?? ctx.inherited.fillOpacity ?? 1
	return fillOpacity * elementOpacity
}

// Helper to get effective stroke opacity with inheritance
function getEffectiveStrokeOpacity(element: SvgBaseElement, ctx: RenderContext): number {
	const elementOpacity = element.opacity ?? ctx.inherited.opacity ?? 1
	const strokeOpacity = element.strokeOpacity ?? ctx.inherited.strokeOpacity ?? 1
	return strokeOpacity * elementOpacity
}

// Helper to get effective stroke width with inheritance
function getEffectiveStrokeWidth(element: SvgBaseElement, ctx: RenderContext): number {
	return element.strokeWidth ?? ctx.inherited.strokeWidth ?? 1
}

// Helper to get effective fill rule with inheritance
function getEffectiveFillRule(element: SvgBaseElement, ctx: RenderContext): 'nonzero' | 'evenodd' {
	return element.fillRule ?? ctx.inherited.fillRule ?? 'nonzero'
}

// Helper to get effective stroke linecap with inheritance
function getEffectiveStrokeLinecap(element: SvgBaseElement, ctx: RenderContext): StrokeLinecap {
	return element.strokeLinecap ?? ctx.inherited.strokeLinecap ?? 'butt'
}

// Helper to get effective stroke linejoin with inheritance
function getEffectiveStrokeLinejoin(element: SvgBaseElement, ctx: RenderContext): StrokeLinejoin {
	return element.strokeLinejoin ?? ctx.inherited.strokeLinejoin ?? 'miter'
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Renderer
// ─────────────────────────────────────────────────────────────────────────────

export function renderSvg(
	doc: SvgDocument,
	targetWidth?: number,
	targetHeight?: number,
	background?: string
): ImageData {
	// Calculate dimensions
	const width = Math.round(targetWidth ?? doc.width)
	const height = Math.round(targetHeight ?? doc.height)

	// Calculate scale and offset for viewBox
	const scaleX = width / doc.viewBox.width
	const scaleY = height / doc.viewBox.height
	const offsetX = -doc.viewBox.x * scaleX
	const offsetY = -doc.viewBox.y * scaleY

	// Create context
	const data = new Uint8Array(width * height * 4)

	// Fill background
	const bgColor = parseColor(background)
	if (bgColor) {
		for (let i = 0; i < data.length; i += 4) {
			data[i] = bgColor.r
			data[i + 1] = bgColor.g
			data[i + 2] = bgColor.b
			data[i + 3] = bgColor.a
		}
	}

	const ctx: RenderContext = {
		width,
		height,
		data,
		scaleX,
		scaleY,
		offsetX,
		offsetY,
		defs: doc.defs,
		transform: [1, 0, 0, 1, 0, 0], // Identity matrix
		inherited: {},
	}

	// Render elements
	for (const element of doc.elements) {
		renderElement(ctx, element)
	}

	return { width, height, data }
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderElement(ctx: RenderContext, element: SvgElement): void {
	// Check visibility
	if (element.display === 'none' || element.visibility === 'hidden') {
		return
	}

	// Save transform
	const savedTransform = [...ctx.transform]

	// Apply element transform
	if (element.transform) {
		for (const t of element.transform) {
			applyTransform(ctx, t)
		}
	}

	// Handle clip path
	let savedClipMask: Uint8Array | undefined
	if (element.clipPath) {
		savedClipMask = ctx.clipMask
		ctx.clipMask = createClipMask(ctx, element.clipPath)
	}

	switch (element.type) {
		case 'rect':
			renderRect(ctx, element)
			break
		case 'circle':
			renderCircle(ctx, element)
			break
		case 'ellipse':
			renderEllipse(ctx, element)
			break
		case 'line':
			renderLine(ctx, element)
			break
		case 'polyline':
			renderPolyline(ctx, element)
			break
		case 'polygon':
			renderPolygon(ctx, element)
			break
		case 'path':
			renderPath(ctx, element)
			break
		case 'text':
			renderText(ctx, element)
			break
		case 'group':
			renderGroup(ctx, element)
			break
		case 'use':
			renderUse(ctx, element)
			break
	}

	// Restore clip mask
	if (savedClipMask !== undefined) {
		ctx.clipMask = savedClipMask
	}

	// Restore transform
	ctx.transform = savedTransform
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Operations
// ─────────────────────────────────────────────────────────────────────────────

function applyTransform(ctx: RenderContext, t: SvgTransform): void {
	let m: number[]

	switch (t.type) {
		case 'translate':
			m = [1, 0, 0, 1, t.x, t.y]
			break
		case 'scale':
			m = [t.x, 0, 0, t.y, 0, 0]
			break
		case 'rotate': {
			const rad = (t.angle * Math.PI) / 180
			const cos = Math.cos(rad)
			const sin = Math.sin(rad)
			if (t.cx !== undefined && t.cy !== undefined) {
				// Rotate around point
				m = [cos, sin, -sin, cos, t.cx - cos * t.cx + sin * t.cy, t.cy - sin * t.cx - cos * t.cy]
			} else {
				m = [cos, sin, -sin, cos, 0, 0]
			}
			break
		}
		case 'skewX': {
			const tan = Math.tan((t.angle * Math.PI) / 180)
			m = [1, 0, tan, 1, 0, 0]
			break
		}
		case 'skewY': {
			const tan = Math.tan((t.angle * Math.PI) / 180)
			m = [1, tan, 0, 1, 0, 0]
			break
		}
		case 'matrix':
			m = [t.a, t.b, t.c, t.d, t.e, t.f]
			break
		default:
			return
	}

	// Multiply matrices: ctx.transform * m
	const a = ctx.transform
	ctx.transform = [
		a[0]! * m[0]! + a[2]! * m[1]!,
		a[1]! * m[0]! + a[3]! * m[1]!,
		a[0]! * m[2]! + a[2]! * m[3]!,
		a[1]! * m[2]! + a[3]! * m[3]!,
		a[0]! * m[4]! + a[2]! * m[5]! + a[4]!,
		a[1]! * m[4]! + a[3]! * m[5]! + a[5]!,
	]
}

function transformPoint(ctx: RenderContext, x: number, y: number): { x: number; y: number } {
	const m = ctx.transform
	const tx = m[0]! * x + m[2]! * y + m[4]!
	const ty = m[1]! * x + m[3]! * y + m[5]!

	return {
		x: tx * ctx.scaleX + ctx.offsetX,
		y: ty * ctx.scaleY + ctx.offsetY,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Pixel Operations
// ─────────────────────────────────────────────────────────────────────────────

function setPixel(ctx: RenderContext, x: number, y: number, r: number, g: number, b: number, a: number): void {
	const px = Math.round(x)
	const py = Math.round(y)

	if (px < 0 || px >= ctx.width || py < 0 || py >= ctx.height) return

	// Check clip mask
	if (ctx.clipMask) {
		const clipIdx = py * ctx.width + px
		if (ctx.clipMask[clipIdx] === 0) return
	}

	const idx = (py * ctx.width + px) * 4

	// Alpha blending
	const srcA = a / 255
	const dstA = ctx.data[idx + 3]! / 255
	const outA = srcA + dstA * (1 - srcA)

	if (outA > 0) {
		ctx.data[idx] = Math.round((r * srcA + ctx.data[idx]! * dstA * (1 - srcA)) / outA)
		ctx.data[idx + 1] = Math.round((g * srcA + ctx.data[idx + 1]! * dstA * (1 - srcA)) / outA)
		ctx.data[idx + 2] = Math.round((b * srcA + ctx.data[idx + 2]! * dstA * (1 - srcA)) / outA)
		ctx.data[idx + 3] = Math.round(outA * 255)
	}
}

function setPixelWithGradient(
	ctx: RenderContext,
	x: number,
	y: number,
	gradient: SvgGradient,
	opacity: number,
	bbox: { x: number; y: number; width: number; height: number }
): void {
	const color = sampleGradient(gradient, x, y, bbox)
	setPixel(ctx, x, y, color.r, color.g, color.b, Math.round(color.a * opacity))
}

function sampleGradient(
	gradient: SvgGradient,
	px: number,
	py: number,
	bbox: { x: number; y: number; width: number; height: number }
): RgbaColor {
	let t: number

	if (gradient.type === 'linearGradient') {
		// Linear gradient sampling
		let x1: number, y1: number, x2: number, y2: number

		if (gradient.gradientUnits === 'objectBoundingBox') {
			x1 = bbox.x + gradient.x1 * bbox.width
			y1 = bbox.y + gradient.y1 * bbox.height
			x2 = bbox.x + gradient.x2 * bbox.width
			y2 = bbox.y + gradient.y2 * bbox.height
		} else {
			x1 = gradient.x1
			y1 = gradient.y1
			x2 = gradient.x2
			y2 = gradient.y2
		}

		const dx = x2 - x1
		const dy = y2 - y1
		const len = dx * dx + dy * dy

		if (len === 0) {
			t = 0
		} else {
			t = ((px - x1) * dx + (py - y1) * dy) / len
		}
	} else {
		// Radial gradient sampling
		let cx: number, cy: number, r: number

		if (gradient.gradientUnits === 'objectBoundingBox') {
			cx = bbox.x + gradient.cx * bbox.width
			cy = bbox.y + gradient.cy * bbox.height
			r = gradient.r * Math.max(bbox.width, bbox.height)
		} else {
			cx = gradient.cx
			cy = gradient.cy
			r = gradient.r
		}

		const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
		t = r > 0 ? dist / r : 0
	}

	// Apply spread method
	if (gradient.spreadMethod === 'reflect') {
		t = Math.abs(t)
		if (Math.floor(t) % 2 === 1) {
			t = 1 - (t % 1)
		} else {
			t = t % 1
		}
	} else if (gradient.spreadMethod === 'repeat') {
		t = t - Math.floor(t)
	} else {
		t = Math.max(0, Math.min(1, t))
	}

	// Interpolate color from stops
	return interpolateGradientStops(gradient.stops, t)
}

function interpolateGradientStops(
	stops: SvgGradient['stops'],
	t: number
): RgbaColor {
	if (stops.length === 0) {
		return { r: 0, g: 0, b: 0, a: 255 }
	}

	if (stops.length === 1 || t <= stops[0]!.offset) {
		return { ...stops[0]!.color }
	}

	if (t >= stops[stops.length - 1]!.offset) {
		return { ...stops[stops.length - 1]!.color }
	}

	for (let i = 0; i < stops.length - 1; i++) {
		const s1 = stops[i]!
		const s2 = stops[i + 1]!

		if (t >= s1.offset && t <= s2.offset) {
			const ratio = (t - s1.offset) / (s2.offset - s1.offset)
			return {
				r: Math.round(s1.color.r + (s2.color.r - s1.color.r) * ratio),
				g: Math.round(s1.color.g + (s2.color.g - s1.color.g) * ratio),
				b: Math.round(s1.color.b + (s2.color.b - s1.color.b) * ratio),
				a: Math.round(s1.color.a + (s2.color.a - s1.color.a) * ratio),
			}
		}
	}

	return { ...stops[stops.length - 1]!.color }
}

// ─────────────────────────────────────────────────────────────────────────────
// Drawing Primitives
// ─────────────────────────────────────────────────────────────────────────────

function drawLine(
	ctx: RenderContext,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: RgbaColor,
	width: number,
	linecap: StrokeLinecap,
	dasharray?: number[],
	dashoffset?: number
): void {
	const dx = x1 - x0
	const dy = y1 - y0
	const len = Math.sqrt(dx * dx + dy * dy)

	if (len < 0.001) {
		// Draw dot for zero-length lines with round/square cap
		if (linecap !== 'butt') {
			const halfWidth = width / 2
			for (let wy = -halfWidth; wy <= halfWidth; wy++) {
				for (let wx = -halfWidth; wx <= halfWidth; wx++) {
					if (linecap === 'round') {
						if (wx * wx + wy * wy <= halfWidth * halfWidth) {
							setPixel(ctx, x0 + wx, y0 + wy, color.r, color.g, color.b, color.a)
						}
					} else {
						setPixel(ctx, x0 + wx, y0 + wy, color.r, color.g, color.b, color.a)
					}
				}
			}
		}
		return
	}

	// Handle dashing
	if (dasharray && dasharray.length > 0) {
		drawDashedLine(ctx, x0, y0, x1, y1, color, width, linecap, dasharray, dashoffset || 0)
		return
	}

	// Bresenham with thickness
	const stepX = dx / len
	const stepY = dy / len
	const perpX = -stepY * (width / 2)
	const perpY = stepX * (width / 2)

	const numSteps = Math.ceil(len)

	for (let i = 0; i <= numSteps; i++) {
		const t = i / numSteps
		const cx = x0 + dx * t
		const cy = y0 + dy * t

		// Draw perpendicular line for thickness
		for (let w = -width / 2; w <= width / 2; w += 0.5) {
			const px = cx + (-stepY) * w
			const py = cy + stepX * w
			setPixel(ctx, px, py, color.r, color.g, color.b, color.a)
		}
	}

	// Draw line caps
	if (linecap === 'round') {
		fillCirclePixels(ctx, x0, y0, width / 2, color)
		fillCirclePixels(ctx, x1, y1, width / 2, color)
	} else if (linecap === 'square') {
		// Extend line by half width at each end
		const extX = stepX * (width / 2)
		const extY = stepY * (width / 2)
		for (let w = -width / 2; w <= width / 2; w += 0.5) {
			for (let e = 0; e <= width / 2; e += 0.5) {
				setPixel(ctx, x0 - extX + e * stepX + (-stepY) * w, y0 - extY + e * stepY + stepX * w, color.r, color.g, color.b, color.a)
				setPixel(ctx, x1 + e * stepX + (-stepY) * w, y1 + e * stepY + stepX * w, color.r, color.g, color.b, color.a)
			}
		}
	}
}

function drawDashedLine(
	ctx: RenderContext,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: RgbaColor,
	width: number,
	linecap: StrokeLinecap,
	dasharray: number[],
	dashoffset: number
): void {
	const dx = x1 - x0
	const dy = y1 - y0
	const totalLen = Math.sqrt(dx * dx + dy * dy)

	if (totalLen < 0.001) return

	const stepX = dx / totalLen
	const stepY = dy / totalLen

	// Calculate total dash pattern length
	const patternLen = dasharray.reduce((a, b) => a + b, 0)
	if (patternLen <= 0) return

	// Normalize dashoffset
	let offset = dashoffset % patternLen
	if (offset < 0) offset += patternLen

	let dist = 0
	let dashIdx = 0
	let drawing = true
	let dashRemaining = dasharray[0]! - offset

	while (dashRemaining <= 0) {
		dashIdx = (dashIdx + 1) % dasharray.length
		dashRemaining += dasharray[dashIdx]!
		drawing = !drawing
	}

	while (dist < totalLen) {
		const segLen = Math.min(dashRemaining, totalLen - dist)

		if (drawing && segLen > 0) {
			const sx = x0 + stepX * dist
			const sy = y0 + stepY * dist
			const ex = x0 + stepX * (dist + segLen)
			const ey = y0 + stepY * (dist + segLen)
			drawLine(ctx, sx, sy, ex, ey, color, width, linecap)
		}

		dist += segLen
		dashRemaining -= segLen

		if (dashRemaining <= 0) {
			dashIdx = (dashIdx + 1) % dasharray.length
			dashRemaining = dasharray[dashIdx]!
			drawing = !drawing
		}
	}
}

function fillCirclePixels(ctx: RenderContext, cx: number, cy: number, r: number, color: RgbaColor): void {
	const x0 = Math.floor(cx - r)
	const y0 = Math.floor(cy - r)
	const x1 = Math.ceil(cx + r)
	const y1 = Math.ceil(cy + r)

	for (let py = y0; py <= y1; py++) {
		for (let px = x0; px <= x1; px++) {
			const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
			if (dist <= r) {
				setPixel(ctx, px, py, color.r, color.g, color.b, color.a)
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Fill Operations
// ─────────────────────────────────────────────────────────────────────────────

function fillPolygon(
	ctx: RenderContext,
	points: Array<{ x: number; y: number }>,
	paint: SvgPaint,
	fillRule: 'nonzero' | 'evenodd',
	opacity: number
): void {
	if (points.length < 3) return

	// Find bounding box
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	for (const p of points) {
		minX = Math.min(minX, p.x)
		minY = Math.min(minY, p.y)
		maxX = Math.max(maxX, p.x)
		maxY = Math.max(maxY, p.y)
	}

	const bbox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }

	// Get color or gradient
	let color: RgbaColor | null = null
	let gradient: SvgGradient | null = null

	if (paint.type === 'color') {
		color = paint.color
	} else if (paint.type === 'url') {
		gradient = ctx.defs.gradients.get(paint.id) || null
	} else if (paint.type === 'none') {
		return
	}

	if (!color && !gradient) return

	// Scanline fill
	for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
		const intersections: number[] = []

		for (let i = 0; i < points.length; i++) {
			const p1 = points[i]!
			const p2 = points[(i + 1) % points.length]!

			if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
				const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x)
				intersections.push(x)
			}
		}

		intersections.sort((a, b) => a - b)

		if (fillRule === 'evenodd') {
			// Even-odd rule
			for (let i = 0; i < intersections.length - 1; i += 2) {
				const x1 = Math.max(0, Math.floor(intersections[i]!))
				const x2 = Math.min(ctx.width - 1, Math.ceil(intersections[i + 1]!))
				for (let x = x1; x <= x2; x++) {
					if (gradient) {
						setPixelWithGradient(ctx, x, y, gradient, opacity, bbox)
					} else if (color) {
						setPixel(ctx, x, y, color.r, color.g, color.b, Math.round(color.a * opacity))
					}
				}
			}
		} else {
			// Non-zero winding rule
			let winding = 0
			let prevX = Math.floor(minX) - 1
			const windingChanges: Array<{ x: number; dir: number }> = []

			for (let i = 0; i < points.length; i++) {
				const p1 = points[i]!
				const p2 = points[(i + 1) % points.length]!

				if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
					const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x)
					const dir = p1.y < p2.y ? 1 : -1
					windingChanges.push({ x, dir })
				}
			}

			windingChanges.sort((a, b) => a.x - b.x)

			for (const change of windingChanges) {
				if (winding !== 0) {
					const x1 = Math.max(0, Math.floor(prevX))
					const x2 = Math.min(ctx.width - 1, Math.ceil(change.x))
					for (let x = x1; x <= x2; x++) {
						if (gradient) {
							setPixelWithGradient(ctx, x, y, gradient, opacity, bbox)
						} else if (color) {
							setPixel(ctx, x, y, color.r, color.g, color.b, Math.round(color.a * opacity))
						}
					}
				}
				winding += change.dir
				prevX = change.x
			}
		}
	}
}

function strokePolygon(
	ctx: RenderContext,
	points: Array<{ x: number; y: number }>,
	paint: SvgPaint,
	strokeWidth: number,
	linecap: StrokeLinecap,
	linejoin: StrokeLinejoin,
	opacity: number,
	closed: boolean,
	dasharray?: number[],
	dashoffset?: number
): void {
	if (points.length < 2) return

	let color: RgbaColor | null = null
	if (paint.type === 'color') {
		color = paint.color
	} else if (paint.type === 'none') {
		return
	}

	if (!color) return

	const c = { r: color.r, g: color.g, b: color.b, a: Math.round(color.a * opacity) }
	const width = strokeWidth * ctx.scaleX

	const n = closed ? points.length : points.length - 1

	for (let i = 0; i < n; i++) {
		const p1 = points[i]!
		const p2 = points[(i + 1) % points.length]!
		drawLine(ctx, p1.x, p1.y, p2.x, p2.y, c, width, linecap, dasharray?.map(d => d * ctx.scaleX), dashoffset ? dashoffset * ctx.scaleX : undefined)
	}

	// Draw line joins
	if (linejoin === 'round' && n > 1) {
		for (let i = 0; i < (closed ? n : n - 1); i++) {
			const p = points[(i + 1) % points.length]!
			fillCirclePixels(ctx, p.x, p.y, width / 2, c)
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Clip Path
// ─────────────────────────────────────────────────────────────────────────────

function createClipMask(ctx: RenderContext, clipPathId: string): Uint8Array {
	const clipPath = ctx.defs.clipPaths.get(clipPathId)
	if (!clipPath) return new Uint8Array(ctx.width * ctx.height).fill(255)

	const mask = new Uint8Array(ctx.width * ctx.height)

	// Create a temporary context for rendering clip path
	const clipCtx: RenderContext = {
		...ctx,
		data: new Uint8Array(ctx.width * ctx.height * 4),
		clipMask: undefined,
	}

	// Render clip path elements as white
	for (const el of clipPath.children) {
		renderElementToMask(clipCtx, el, mask)
	}

	return mask
}

function renderElementToMask(ctx: RenderContext, element: SvgElement, mask: Uint8Array): void {
	// Simplified rendering for mask - just fill with 255
	const points = elementToPolygon(ctx, element)
	if (points.length < 3) return

	// Find bounding box
	let minY = Infinity, maxY = -Infinity
	for (const p of points) {
		minY = Math.min(minY, p.y)
		maxY = Math.max(maxY, p.y)
	}

	// Scanline fill
	for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
		const intersections: number[] = []

		for (let i = 0; i < points.length; i++) {
			const p1 = points[i]!
			const p2 = points[(i + 1) % points.length]!

			if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
				const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x)
				intersections.push(x)
			}
		}

		intersections.sort((a, b) => a - b)

		for (let i = 0; i < intersections.length - 1; i += 2) {
			const x1 = Math.max(0, Math.floor(intersections[i]!))
			const x2 = Math.min(ctx.width - 1, Math.ceil(intersections[i + 1]!))
			for (let x = x1; x <= x2; x++) {
				if (y >= 0 && y < ctx.height) {
					mask[y * ctx.width + x] = 255
				}
			}
		}
	}
}

function elementToPolygon(ctx: RenderContext, element: SvgElement): Array<{ x: number; y: number }> {
	switch (element.type) {
		case 'rect': {
			const p1 = transformPoint(ctx, element.x, element.y)
			const p2 = transformPoint(ctx, element.x + element.width, element.y)
			const p3 = transformPoint(ctx, element.x + element.width, element.y + element.height)
			const p4 = transformPoint(ctx, element.x, element.y + element.height)
			return [p1, p2, p3, p4]
		}
		case 'circle': {
			const points: Array<{ x: number; y: number }> = []
			const steps = Math.max(32, Math.ceil(element.r * ctx.scaleX * 2))
			for (let i = 0; i < steps; i++) {
				const angle = (i / steps) * Math.PI * 2
				const x = element.cx + Math.cos(angle) * element.r
				const y = element.cy + Math.sin(angle) * element.r
				points.push(transformPoint(ctx, x, y))
			}
			return points
		}
		case 'ellipse': {
			const points: Array<{ x: number; y: number }> = []
			const steps = Math.max(32, Math.ceil(Math.max(element.rx, element.ry) * ctx.scaleX * 2))
			for (let i = 0; i < steps; i++) {
				const angle = (i / steps) * Math.PI * 2
				const x = element.cx + Math.cos(angle) * element.rx
				const y = element.cy + Math.sin(angle) * element.ry
				points.push(transformPoint(ctx, x, y))
			}
			return points
		}
		case 'polygon':
		case 'polyline':
			return element.points.map(p => transformPoint(ctx, p.x, p.y))
		case 'path':
			return pathToPolygon(ctx, element.commands)
		default:
			return []
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape Renderers
// ─────────────────────────────────────────────────────────────────────────────

function renderRect(ctx: RenderContext, rect: SvgRect): void {
	const fill = getEffectiveFill(rect, ctx)
	const stroke = getEffectiveStroke(rect, ctx)
	const fillOpacity = getEffectiveFillOpacity(rect, ctx)
	const strokeOpacity = getEffectiveStrokeOpacity(rect, ctx)
	const fillRule = getEffectiveFillRule(rect, ctx)
	const strokeWidth = getEffectiveStrokeWidth(rect, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(rect, ctx)
	const strokeLinejoin = getEffectiveStrokeLinejoin(rect, ctx)

	// Handle rounded corners
	if (rect.rx || rect.ry) {
		const points = roundedRectToPath(rect)
		const transformed = points.map(p => transformPoint(ctx, p.x, p.y))

		if (fill && fill.type !== 'none') {
			fillPolygon(ctx, transformed, fill, fillRule, fillOpacity)
		}

		if (stroke && stroke.type !== 'none') {
			strokePolygon(ctx, transformed, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, true, rect.strokeDasharray, rect.strokeDashoffset)
		}
	} else {
		const p1 = transformPoint(ctx, rect.x, rect.y)
		const p2 = transformPoint(ctx, rect.x + rect.width, rect.y)
		const p3 = transformPoint(ctx, rect.x + rect.width, rect.y + rect.height)
		const p4 = transformPoint(ctx, rect.x, rect.y + rect.height)
		const points = [p1, p2, p3, p4]

		if (fill && fill.type !== 'none') {
			fillPolygon(ctx, points, fill, fillRule, fillOpacity)
		}

		if (stroke && stroke.type !== 'none') {
			strokePolygon(ctx, points, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, true, rect.strokeDasharray, rect.strokeDashoffset)
		}
	}
}

function roundedRectToPath(rect: SvgRect): Array<{ x: number; y: number }> {
	const rx = Math.min(rect.rx ?? rect.ry ?? 0, rect.width / 2)
	const ry = Math.min(rect.ry ?? rect.rx ?? 0, rect.height / 2)
	const points: Array<{ x: number; y: number }> = []
	const steps = 8 // Steps per corner

	// Top right corner
	for (let i = 0; i <= steps; i++) {
		const angle = -Math.PI / 2 + (i / steps) * (Math.PI / 2)
		points.push({
			x: rect.x + rect.width - rx + Math.cos(angle) * rx,
			y: rect.y + ry + Math.sin(angle) * ry,
		})
	}

	// Bottom right corner
	for (let i = 0; i <= steps; i++) {
		const angle = (i / steps) * (Math.PI / 2)
		points.push({
			x: rect.x + rect.width - rx + Math.cos(angle) * rx,
			y: rect.y + rect.height - ry + Math.sin(angle) * ry,
		})
	}

	// Bottom left corner
	for (let i = 0; i <= steps; i++) {
		const angle = Math.PI / 2 + (i / steps) * (Math.PI / 2)
		points.push({
			x: rect.x + rx + Math.cos(angle) * rx,
			y: rect.y + rect.height - ry + Math.sin(angle) * ry,
		})
	}

	// Top left corner
	for (let i = 0; i <= steps; i++) {
		const angle = Math.PI + (i / steps) * (Math.PI / 2)
		points.push({
			x: rect.x + rx + Math.cos(angle) * rx,
			y: rect.y + ry + Math.sin(angle) * ry,
		})
	}

	return points
}

function renderCircle(ctx: RenderContext, circle: SvgCircle): void {
	const fill = getEffectiveFill(circle, ctx)
	const stroke = getEffectiveStroke(circle, ctx)
	const fillOpacity = getEffectiveFillOpacity(circle, ctx)
	const strokeOpacity = getEffectiveStrokeOpacity(circle, ctx)
	const fillRule = getEffectiveFillRule(circle, ctx)
	const strokeWidth = getEffectiveStrokeWidth(circle, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(circle, ctx)
	const strokeLinejoin = getEffectiveStrokeLinejoin(circle, ctx)

	const steps = Math.max(64, Math.ceil(circle.r * ctx.scaleX * 2))
	const points: Array<{ x: number; y: number }> = []

	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * Math.PI * 2
		const x = circle.cx + Math.cos(angle) * circle.r
		const y = circle.cy + Math.sin(angle) * circle.r
		points.push(transformPoint(ctx, x, y))
	}

	if (fill && fill.type !== 'none') {
		fillPolygon(ctx, points, fill, fillRule, fillOpacity)
	}

	if (stroke && stroke.type !== 'none') {
		strokePolygon(ctx, points, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, true, circle.strokeDasharray, circle.strokeDashoffset)
	}
}

function renderEllipse(ctx: RenderContext, ellipse: SvgEllipse): void {
	const fill = getEffectiveFill(ellipse, ctx)
	const stroke = getEffectiveStroke(ellipse, ctx)
	const fillOpacity = getEffectiveFillOpacity(ellipse, ctx)
	const strokeOpacity = getEffectiveStrokeOpacity(ellipse, ctx)
	const fillRule = getEffectiveFillRule(ellipse, ctx)
	const strokeWidth = getEffectiveStrokeWidth(ellipse, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(ellipse, ctx)
	const strokeLinejoin = getEffectiveStrokeLinejoin(ellipse, ctx)

	const steps = Math.max(64, Math.ceil(Math.max(ellipse.rx, ellipse.ry) * ctx.scaleX * 2))
	const points: Array<{ x: number; y: number }> = []

	for (let i = 0; i < steps; i++) {
		const angle = (i / steps) * Math.PI * 2
		const x = ellipse.cx + Math.cos(angle) * ellipse.rx
		const y = ellipse.cy + Math.sin(angle) * ellipse.ry
		points.push(transformPoint(ctx, x, y))
	}

	if (fill && fill.type !== 'none') {
		fillPolygon(ctx, points, fill, fillRule, fillOpacity)
	}

	if (stroke && stroke.type !== 'none') {
		strokePolygon(ctx, points, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, true, ellipse.strokeDasharray, ellipse.strokeDashoffset)
	}
}

function renderLine(ctx: RenderContext, line: SvgLine): void {
	const stroke = getEffectiveStroke(line, ctx)
	if (!stroke || stroke.type === 'none') return

	const strokeOpacity = getEffectiveStrokeOpacity(line, ctx)
	const strokeWidth = getEffectiveStrokeWidth(line, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(line, ctx)

	if (stroke.type === 'color') {
		const p1 = transformPoint(ctx, line.x1, line.y1)
		const p2 = transformPoint(ctx, line.x2, line.y2)
		const color = { ...stroke.color, a: Math.round(stroke.color.a * strokeOpacity) }
		const width = strokeWidth * ctx.scaleX

		drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, strokeLinecap, line.strokeDasharray?.map(d => d * ctx.scaleX), line.strokeDashoffset ? line.strokeDashoffset * ctx.scaleX : undefined)
	}
}

function renderPolyline(ctx: RenderContext, polyline: SvgPolyline): void {
	if (polyline.points.length < 2) return

	const stroke = getEffectiveStroke(polyline, ctx)
	const strokeOpacity = getEffectiveStrokeOpacity(polyline, ctx)
	const strokeWidth = getEffectiveStrokeWidth(polyline, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(polyline, ctx)
	const strokeLinejoin = getEffectiveStrokeLinejoin(polyline, ctx)

	const points = polyline.points.map(p => transformPoint(ctx, p.x, p.y))

	if (stroke && stroke.type !== 'none') {
		strokePolygon(ctx, points, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, false, polyline.strokeDasharray, polyline.strokeDashoffset)
	}
}

function renderPolygon(ctx: RenderContext, polygon: SvgPolygon): void {
	if (polygon.points.length < 3) return

	const fill = getEffectiveFill(polygon, ctx)
	const stroke = getEffectiveStroke(polygon, ctx)
	const fillOpacity = getEffectiveFillOpacity(polygon, ctx)
	const strokeOpacity = getEffectiveStrokeOpacity(polygon, ctx)
	const fillRule = getEffectiveFillRule(polygon, ctx)
	const strokeWidth = getEffectiveStrokeWidth(polygon, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(polygon, ctx)
	const strokeLinejoin = getEffectiveStrokeLinejoin(polygon, ctx)

	const points = polygon.points.map(p => transformPoint(ctx, p.x, p.y))

	if (fill && fill.type !== 'none') {
		fillPolygon(ctx, points, fill, fillRule, fillOpacity)
	}

	if (stroke && stroke.type !== 'none') {
		strokePolygon(ctx, points, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, true, polygon.strokeDasharray, polygon.strokeDashoffset)
	}
}

function renderPath(ctx: RenderContext, path: SvgPath): void {
	if (path.commands.length === 0) return

	const fill = getEffectiveFill(path, ctx)
	const stroke = getEffectiveStroke(path, ctx)
	const fillOpacity = getEffectiveFillOpacity(path, ctx)
	const strokeOpacity = getEffectiveStrokeOpacity(path, ctx)
	const fillRule = getEffectiveFillRule(path, ctx)
	const strokeWidth = getEffectiveStrokeWidth(path, ctx)
	const strokeLinecap = getEffectiveStrokeLinecap(path, ctx)
	const strokeLinejoin = getEffectiveStrokeLinejoin(path, ctx)

	const points = pathToPolygon(ctx, path.commands)

	if (fill && fill.type !== 'none' && points.length >= 3) {
		fillPolygon(ctx, points, fill, fillRule, fillOpacity)
	}

	if (stroke && stroke.type !== 'none') {
		strokePath(ctx, path.commands, stroke, strokeWidth, strokeLinecap, strokeLinejoin, strokeOpacity, path.strokeDasharray, path.strokeDashoffset)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Operations
// ─────────────────────────────────────────────────────────────────────────────

function pathToPolygon(ctx: RenderContext, commands: PathCommand[]): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = []
	let x = 0, y = 0
	let startX = 0, startY = 0
	let lastCx = 0, lastCy = 0 // For S/T commands

	for (const cmd of commands) {
		switch (cmd.type) {
			case 'M':
				x = cmd.x
				y = cmd.y
				startX = x
				startY = y
				points.push(transformPoint(ctx, x, y))
				break
			case 'm':
				x += cmd.dx
				y += cmd.dy
				startX = x
				startY = y
				points.push(transformPoint(ctx, x, y))
				break
			case 'L':
				x = cmd.x
				y = cmd.y
				points.push(transformPoint(ctx, x, y))
				break
			case 'l':
				x += cmd.dx
				y += cmd.dy
				points.push(transformPoint(ctx, x, y))
				break
			case 'H':
				x = cmd.x
				points.push(transformPoint(ctx, x, y))
				break
			case 'h':
				x += cmd.dx
				points.push(transformPoint(ctx, x, y))
				break
			case 'V':
				y = cmd.y
				points.push(transformPoint(ctx, x, y))
				break
			case 'v':
				y += cmd.dy
				points.push(transformPoint(ctx, x, y))
				break
			case 'C':
				bezierToPoints(points, ctx, x, y, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y)
				lastCx = cmd.x2
				lastCy = cmd.y2
				x = cmd.x
				y = cmd.y
				break
			case 'c':
				bezierToPoints(points, ctx, x, y, x + cmd.dx1, y + cmd.dy1, x + cmd.dx2, y + cmd.dy2, x + cmd.dx, y + cmd.dy)
				lastCx = x + cmd.dx2
				lastCy = y + cmd.dy2
				x += cmd.dx
				y += cmd.dy
				break
			case 'S': {
				// Smooth cubic - reflect last control point
				const cx1 = 2 * x - lastCx
				const cy1 = 2 * y - lastCy
				bezierToPoints(points, ctx, x, y, cx1, cy1, cmd.x2, cmd.y2, cmd.x, cmd.y)
				lastCx = cmd.x2
				lastCy = cmd.y2
				x = cmd.x
				y = cmd.y
				break
			}
			case 's': {
				const cx1 = 2 * x - lastCx
				const cy1 = 2 * y - lastCy
				bezierToPoints(points, ctx, x, y, cx1, cy1, x + cmd.dx2, y + cmd.dy2, x + cmd.dx, y + cmd.dy)
				lastCx = x + cmd.dx2
				lastCy = y + cmd.dy2
				x += cmd.dx
				y += cmd.dy
				break
			}
			case 'Q':
				quadBezierToPoints(points, ctx, x, y, cmd.x1, cmd.y1, cmd.x, cmd.y)
				lastCx = cmd.x1
				lastCy = cmd.y1
				x = cmd.x
				y = cmd.y
				break
			case 'q':
				quadBezierToPoints(points, ctx, x, y, x + cmd.dx1, y + cmd.dy1, x + cmd.dx, y + cmd.dy)
				lastCx = x + cmd.dx1
				lastCy = y + cmd.dy1
				x += cmd.dx
				y += cmd.dy
				break
			case 'T': {
				// Smooth quadratic - reflect last control point
				const qx1 = 2 * x - lastCx
				const qy1 = 2 * y - lastCy
				quadBezierToPoints(points, ctx, x, y, qx1, qy1, cmd.x, cmd.y)
				lastCx = qx1
				lastCy = qy1
				x = cmd.x
				y = cmd.y
				break
			}
			case 't': {
				const qx1 = 2 * x - lastCx
				const qy1 = 2 * y - lastCy
				quadBezierToPoints(points, ctx, x, y, qx1, qy1, x + cmd.dx, y + cmd.dy)
				lastCx = qx1
				lastCy = qy1
				x += cmd.dx
				y += cmd.dy
				break
			}
			case 'A':
				arcToPoints(points, ctx, x, y, cmd.rx, cmd.ry, cmd.angle, cmd.largeArc, cmd.sweep, cmd.x, cmd.y)
				x = cmd.x
				y = cmd.y
				break
			case 'a':
				arcToPoints(points, ctx, x, y, cmd.rx, cmd.ry, cmd.angle, cmd.largeArc, cmd.sweep, x + cmd.dx, y + cmd.dy)
				x += cmd.dx
				y += cmd.dy
				break
			case 'Z':
			case 'z':
				x = startX
				y = startY
				break
		}
	}

	return points
}

function bezierToPoints(
	points: Array<{ x: number; y: number }>,
	ctx: RenderContext,
	x0: number, y0: number,
	x1: number, y1: number,
	x2: number, y2: number,
	x3: number, y3: number
): void {
	const steps = 20
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const mt = 1 - t
		const px = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3
		const py = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3
		points.push(transformPoint(ctx, px, py))
	}
}

function quadBezierToPoints(
	points: Array<{ x: number; y: number }>,
	ctx: RenderContext,
	x0: number, y0: number,
	x1: number, y1: number,
	x2: number, y2: number
): void {
	const steps = 16
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const mt = 1 - t
		const px = mt*mt*x0 + 2*mt*t*x1 + t*t*x2
		const py = mt*mt*y0 + 2*mt*t*y1 + t*t*y2
		points.push(transformPoint(ctx, px, py))
	}
}

function arcToPoints(
	points: Array<{ x: number; y: number }>,
	ctx: RenderContext,
	x1: number, y1: number,
	rx: number, ry: number,
	angle: number,
	largeArc: boolean,
	sweep: boolean,
	x2: number, y2: number
): void {
	// Convert arc to center parameterization
	if (rx === 0 || ry === 0) {
		points.push(transformPoint(ctx, x2, y2))
		return
	}

	const phi = (angle * Math.PI) / 180
	const cosPhi = Math.cos(phi)
	const sinPhi = Math.sin(phi)

	// Step 1: Compute (x1', y1')
	const dx = (x1 - x2) / 2
	const dy = (y1 - y2) / 2
	const x1p = cosPhi * dx + sinPhi * dy
	const y1p = -sinPhi * dx + cosPhi * dy

	// Correct radii
	const x1p2 = x1p * x1p
	const y1p2 = y1p * y1p
	let rx2 = rx * rx
	let ry2 = ry * ry

	const lambda = x1p2 / rx2 + y1p2 / ry2
	if (lambda > 1) {
		const sqrtLambda = Math.sqrt(lambda)
		rx *= sqrtLambda
		ry *= sqrtLambda
		rx2 = rx * rx
		ry2 = ry * ry
	}

	// Step 2: Compute (cx', cy')
	let sq = (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2)
	if (sq < 0) sq = 0
	const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(sq)
	const cxp = coef * (rx * y1p / ry)
	const cyp = coef * -(ry * x1p / rx)

	// Step 3: Compute (cx, cy)
	const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
	const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2

	// Step 4: Compute angles
	const ux = (x1p - cxp) / rx
	const uy = (y1p - cyp) / ry
	const vx = (-x1p - cxp) / rx
	const vy = (-y1p - cyp) / ry

	const n = Math.sqrt(ux * ux + uy * uy)
	const startAngle = Math.acos(Math.max(-1, Math.min(1, ux / n))) * (uy < 0 ? -1 : 1)

	let dAngle = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (n * Math.sqrt(vx * vx + vy * vy)))))
	if (ux * vy - uy * vx < 0) dAngle = -dAngle
	if (sweep && dAngle < 0) dAngle += 2 * Math.PI
	if (!sweep && dAngle > 0) dAngle -= 2 * Math.PI

	// Generate points
	const steps = Math.max(8, Math.ceil(Math.abs(dAngle) / (Math.PI / 16)))
	for (let i = 1; i <= steps; i++) {
		const t = startAngle + (i / steps) * dAngle
		const px = cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi
		const py = cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi
		points.push(transformPoint(ctx, px, py))
	}
}

function strokePath(
	ctx: RenderContext,
	commands: PathCommand[],
	paint: SvgPaint,
	strokeWidth: number,
	linecap: StrokeLinecap,
	linejoin: StrokeLinejoin,
	opacity: number,
	dasharray?: number[],
	dashoffset?: number
): void {
	if (paint.type !== 'color') return

	const color = { ...paint.color, a: Math.round(paint.color.a * opacity) }
	const width = strokeWidth * ctx.scaleX

	let x = 0, y = 0
	let startX = 0, startY = 0
	let lastCx = 0, lastCy = 0

	for (const cmd of commands) {
		switch (cmd.type) {
			case 'M':
				x = cmd.x
				y = cmd.y
				startX = x
				startY = y
				break
			case 'm':
				x += cmd.dx
				y += cmd.dy
				startX = x
				startY = y
				break
			case 'L': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, cmd.x, cmd.y)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap, dasharray?.map(d => d * ctx.scaleX), dashoffset ? dashoffset * ctx.scaleX : undefined)
				x = cmd.x
				y = cmd.y
				break
			}
			case 'l': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, x + cmd.dx, y + cmd.dy)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap, dasharray?.map(d => d * ctx.scaleX), dashoffset ? dashoffset * ctx.scaleX : undefined)
				x += cmd.dx
				y += cmd.dy
				break
			}
			case 'H': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, cmd.x, y)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
				x = cmd.x
				break
			}
			case 'h': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, x + cmd.dx, y)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
				x += cmd.dx
				break
			}
			case 'V': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, x, cmd.y)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
				y = cmd.y
				break
			}
			case 'v': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, x, y + cmd.dy)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
				y += cmd.dy
				break
			}
			case 'C':
				strokeBezier(ctx, x, y, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, color, width, linecap)
				lastCx = cmd.x2
				lastCy = cmd.y2
				x = cmd.x
				y = cmd.y
				break
			case 'c':
				strokeBezier(ctx, x, y, x + cmd.dx1, y + cmd.dy1, x + cmd.dx2, y + cmd.dy2, x + cmd.dx, y + cmd.dy, color, width, linecap)
				lastCx = x + cmd.dx2
				lastCy = y + cmd.dy2
				x += cmd.dx
				y += cmd.dy
				break
			case 'S': {
				const cx1 = 2 * x - lastCx
				const cy1 = 2 * y - lastCy
				strokeBezier(ctx, x, y, cx1, cy1, cmd.x2, cmd.y2, cmd.x, cmd.y, color, width, linecap)
				lastCx = cmd.x2
				lastCy = cmd.y2
				x = cmd.x
				y = cmd.y
				break
			}
			case 's': {
				const cx1 = 2 * x - lastCx
				const cy1 = 2 * y - lastCy
				strokeBezier(ctx, x, y, cx1, cy1, x + cmd.dx2, y + cmd.dy2, x + cmd.dx, y + cmd.dy, color, width, linecap)
				lastCx = x + cmd.dx2
				lastCy = y + cmd.dy2
				x += cmd.dx
				y += cmd.dy
				break
			}
			case 'Q':
				strokeQuadBezier(ctx, x, y, cmd.x1, cmd.y1, cmd.x, cmd.y, color, width, linecap)
				lastCx = cmd.x1
				lastCy = cmd.y1
				x = cmd.x
				y = cmd.y
				break
			case 'q':
				strokeQuadBezier(ctx, x, y, x + cmd.dx1, y + cmd.dy1, x + cmd.dx, y + cmd.dy, color, width, linecap)
				lastCx = x + cmd.dx1
				lastCy = y + cmd.dy1
				x += cmd.dx
				y += cmd.dy
				break
			case 'T': {
				const qx1 = 2 * x - lastCx
				const qy1 = 2 * y - lastCy
				strokeQuadBezier(ctx, x, y, qx1, qy1, cmd.x, cmd.y, color, width, linecap)
				lastCx = qx1
				lastCy = qy1
				x = cmd.x
				y = cmd.y
				break
			}
			case 't': {
				const qx1 = 2 * x - lastCx
				const qy1 = 2 * y - lastCy
				strokeQuadBezier(ctx, x, y, qx1, qy1, x + cmd.dx, y + cmd.dy, color, width, linecap)
				lastCx = qx1
				lastCy = qy1
				x += cmd.dx
				y += cmd.dy
				break
			}
			case 'A':
				strokeArc(ctx, x, y, cmd.rx, cmd.ry, cmd.angle, cmd.largeArc, cmd.sweep, cmd.x, cmd.y, color, width, linecap)
				x = cmd.x
				y = cmd.y
				break
			case 'a':
				strokeArc(ctx, x, y, cmd.rx, cmd.ry, cmd.angle, cmd.largeArc, cmd.sweep, x + cmd.dx, y + cmd.dy, color, width, linecap)
				x += cmd.dx
				y += cmd.dy
				break
			case 'Z':
			case 'z': {
				const p1 = transformPoint(ctx, x, y)
				const p2 = transformPoint(ctx, startX, startY)
				drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
				x = startX
				y = startY
				break
			}
		}
	}
}

function strokeBezier(
	ctx: RenderContext,
	x0: number, y0: number,
	x1: number, y1: number,
	x2: number, y2: number,
	x3: number, y3: number,
	color: RgbaColor,
	width: number,
	linecap: StrokeLinecap
): void {
	const steps = 20
	let prevX = x0, prevY = y0
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const mt = 1 - t
		const px = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3
		const py = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3
		const p1 = transformPoint(ctx, prevX, prevY)
		const p2 = transformPoint(ctx, px, py)
		drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
		prevX = px
		prevY = py
	}
}

function strokeQuadBezier(
	ctx: RenderContext,
	x0: number, y0: number,
	x1: number, y1: number,
	x2: number, y2: number,
	color: RgbaColor,
	width: number,
	linecap: StrokeLinecap
): void {
	const steps = 16
	let prevX = x0, prevY = y0
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const mt = 1 - t
		const px = mt*mt*x0 + 2*mt*t*x1 + t*t*x2
		const py = mt*mt*y0 + 2*mt*t*y1 + t*t*y2
		const p1 = transformPoint(ctx, prevX, prevY)
		const p2 = transformPoint(ctx, px, py)
		drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
		prevX = px
		prevY = py
	}
}

function strokeArc(
	ctx: RenderContext,
	x1: number, y1: number,
	rx: number, ry: number,
	angle: number,
	largeArc: boolean,
	sweep: boolean,
	x2: number, y2: number,
	color: RgbaColor,
	width: number,
	linecap: StrokeLinecap
): void {
	const points: Array<{ x: number; y: number }> = []
	points.push({ x: x1, y: y1 })
	arcToPoints(points, ctx, x1, y1, rx, ry, angle, largeArc, sweep, x2, y2)

	for (let i = 1; i < points.length; i++) {
		const p1 = points[i - 1]!
		const p2 = points[i]!
		drawLine(ctx, p1.x, p1.y, p2.x, p2.y, color, width, linecap)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Text Rendering
// ─────────────────────────────────────────────────────────────────────────────

// Simple bitmap font (5x7 pixels per character)
const FONT_DATA: Record<string, number[]> = {
	'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
	'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
	'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
	'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
	'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
	'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
	'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
	'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
	'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
	'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
	'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
	'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
	'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
	'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
	'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
	'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
	'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
	'S': [0b01110, 0b10001, 0b10000, 0b01110, 0b00001, 0b10001, 0b01110],
	'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
	'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
	'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
	'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
	'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
	'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
	'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
	'a': [0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
	'b': [0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b11110],
	'c': [0b00000, 0b00000, 0b01110, 0b10000, 0b10000, 0b10001, 0b01110],
	'd': [0b00001, 0b00001, 0b01101, 0b10011, 0b10001, 0b10001, 0b01111],
	'e': [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
	'f': [0b00110, 0b01001, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000],
	'g': [0b00000, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
	'h': [0b10000, 0b10000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001],
	'i': [0b00100, 0b00000, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110],
	'j': [0b00010, 0b00000, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100],
	'k': [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
	'l': [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	'm': [0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10001, 0b10001],
	'n': [0b00000, 0b00000, 0b10110, 0b11001, 0b10001, 0b10001, 0b10001],
	'o': [0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
	'p': [0b00000, 0b00000, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000],
	'q': [0b00000, 0b00000, 0b01101, 0b10011, 0b01111, 0b00001, 0b00001],
	'r': [0b00000, 0b00000, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000],
	's': [0b00000, 0b00000, 0b01110, 0b10000, 0b01110, 0b00001, 0b11110],
	't': [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110],
	'u': [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101],
	'v': [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
	'w': [0b00000, 0b00000, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
	'x': [0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
	'y': [0b00000, 0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
	'z': [0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
	'0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
	'1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
	'2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
	'3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
	'4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
	'5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
	'6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
	'7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
	'8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
	'9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
	' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
	'.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b01100, 0b01100],
	',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00110, 0b00110, 0b00100],
	'!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
	'?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100],
	'-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
	'+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
	'=': [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
	':': [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b00000],
	';': [0b00000, 0b01100, 0b01100, 0b00000, 0b01100, 0b01100, 0b01000],
	'(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
	')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
	'/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
	'_': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
}

function renderText(ctx: RenderContext, text: SvgText): void {
	const fill = getEffectiveFill(text, ctx)
	if (!fill || fill.type === 'none') return
	if (fill.type !== 'color') return

	const fillOpacity = getEffectiveFillOpacity(text, ctx)
	const color = { ...fill.color, a: Math.round(fill.color.a * fillOpacity) }

	const fontSize = (text.fontSize ?? 16) * ctx.scaleY
	const scale = fontSize / 7 // Font is 7 pixels tall
	const charWidth = 5 * scale
	const charHeight = 7 * scale
	const spacing = scale

	let x = text.x + (text.dx ?? 0)
	let y = text.y + (text.dy ?? 0)

	// Render children (text content and tspans)
	for (const child of text.children) {
		if (typeof child === 'string') {
			renderTextString(ctx, child, x, y, color, scale, charWidth, charHeight, spacing, text.textAnchor)
			x += child.length * (charWidth + spacing)
		} else if (child.type === 'tspan') {
			const tspan = child as SvgTspan
			const tx = tspan.x ?? x + (tspan.dx ?? 0)
			const ty = tspan.y ?? y + (tspan.dy ?? 0)
			renderTextString(ctx, tspan.text, tx, ty, color, scale, charWidth, charHeight, spacing, text.textAnchor)
			x = tx + tspan.text.length * (charWidth + spacing)
			y = ty
		}
	}
}

function renderTextString(
	ctx: RenderContext,
	str: string,
	x: number,
	y: number,
	color: RgbaColor,
	scale: number,
	charWidth: number,
	charHeight: number,
	spacing: number,
	anchor?: 'start' | 'middle' | 'end'
): void {
	// Adjust for text anchor
	const totalWidth = str.length * (charWidth + spacing) - spacing
	let startX = x

	if (anchor === 'middle') {
		startX -= totalWidth / 2
	} else if (anchor === 'end') {
		startX -= totalWidth
	}

	// Y is baseline, so move up by charHeight
	const startY = y - charHeight

	for (let i = 0; i < str.length; i++) {
		const char = str[i]!
		const charX = startX + i * (charWidth + spacing)
		renderChar(ctx, char, charX, startY, color, scale)
	}
}

function renderChar(
	ctx: RenderContext,
	char: string,
	x: number,
	y: number,
	color: RgbaColor,
	scale: number
): void {
	const data = FONT_DATA[char]
	if (!data) return

	const p = transformPoint(ctx, x, y)

	for (let row = 0; row < 7; row++) {
		const bits = data[row]!
		for (let col = 0; col < 5; col++) {
			if (bits & (1 << (4 - col))) {
				// Fill a scaled pixel
				for (let dy = 0; dy < scale; dy++) {
					for (let dx = 0; dx < scale; dx++) {
						setPixel(ctx, p.x + col * scale + dx, p.y + row * scale + dy, color.r, color.g, color.b, color.a)
					}
				}
			}
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Group and Use
// ─────────────────────────────────────────────────────────────────────────────

function renderGroup(ctx: RenderContext, group: SvgGroup): void {
	// Save inherited styles
	const savedInherited = { ...ctx.inherited }

	// Merge group's styles into inherited
	if (group.fill !== undefined) ctx.inherited.fill = group.fill
	if (group.fillRule !== undefined) ctx.inherited.fillRule = group.fillRule
	if (group.fillOpacity !== undefined) ctx.inherited.fillOpacity = group.fillOpacity
	if (group.stroke !== undefined) ctx.inherited.stroke = group.stroke
	if (group.strokeWidth !== undefined) ctx.inherited.strokeWidth = group.strokeWidth
	if (group.strokeLinecap !== undefined) ctx.inherited.strokeLinecap = group.strokeLinecap
	if (group.strokeLinejoin !== undefined) ctx.inherited.strokeLinejoin = group.strokeLinejoin
	if (group.strokeOpacity !== undefined) ctx.inherited.strokeOpacity = group.strokeOpacity
	if (group.opacity !== undefined) ctx.inherited.opacity = group.opacity

	for (const child of group.children) {
		renderElement(ctx, child)
	}

	// Restore inherited styles
	ctx.inherited = savedInherited
}

function renderUse(ctx: RenderContext, use: SvgUse): void {
	// Find referenced element
	const refElement = ctx.defs.elements.get(use.href) || ctx.defs.symbols.get(use.href)
	if (!refElement) return

	// Save transform and apply use transform
	const savedTransform = [...ctx.transform]
	applyTransform(ctx, { type: 'translate', x: use.x, y: use.y })

	if (refElement.type === 'symbol') {
		// Apply symbol viewBox scaling if width/height specified on use
		if (refElement.viewBox && (use.width || use.height)) {
			const useWidth = use.width ?? refElement.viewBox.width
			const useHeight = use.height ?? refElement.viewBox.height
			const scaleX = useWidth / refElement.viewBox.width
			const scaleY = useHeight / refElement.viewBox.height
			applyTransform(ctx, { type: 'scale', x: scaleX, y: scaleY })
			applyTransform(ctx, { type: 'translate', x: -refElement.viewBox.x, y: -refElement.viewBox.y })
		}
		// Render symbol children
		for (const child of refElement.children) {
			renderElement(ctx, child)
		}
	} else {
		renderElement(ctx, refElement)
	}

	// Restore transform
	ctx.transform = savedTransform
}
