/**
 * Drawing primitives
 */

import type { ImageData } from '@mconv/core'
import type { Color, Gradient, Point, ShapeOptions } from './types'

/**
 * Set a pixel color
 */
export function setPixel(image: ImageData, x: number, y: number, color: Color): void {
	if (x < 0 || x >= image.width || y < 0 || y >= image.height) return

	const idx = (Math.floor(y) * image.width + Math.floor(x)) * 4
	const [r, g, b, a] = color

	if (a === 255) {
		image.data[idx] = r
		image.data[idx + 1] = g
		image.data[idx + 2] = b
		image.data[idx + 3] = a
	} else {
		// Alpha blend
		const alpha = a / 255
		const invAlpha = 1 - alpha
		image.data[idx] = Math.round(r * alpha + image.data[idx]! * invAlpha)
		image.data[idx + 1] = Math.round(g * alpha + image.data[idx + 1]! * invAlpha)
		image.data[idx + 2] = Math.round(b * alpha + image.data[idx + 2]! * invAlpha)
		image.data[idx + 3] = Math.max(image.data[idx + 3]!, a)
	}
}

/**
 * Get a pixel color
 */
export function getPixel(image: ImageData, x: number, y: number): Color {
	if (x < 0 || x >= image.width || y < 0 || y >= image.height) {
		return [0, 0, 0, 0]
	}

	const idx = (Math.floor(y) * image.width + Math.floor(x)) * 4
	return [image.data[idx]!, image.data[idx + 1]!, image.data[idx + 2]!, image.data[idx + 3]!]
}

/**
 * Draw a line using Bresenham's algorithm
 */
export function drawLine(
	image: ImageData,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	color: Color,
	lineWidth = 1
): void {
	let px0 = Math.round(x0)
	let py0 = Math.round(y0)
	const px1 = Math.round(x1)
	const py1 = Math.round(y1)

	const dx = Math.abs(px1 - px0)
	const dy = Math.abs(py1 - py0)
	const sx = px0 < px1 ? 1 : -1
	const sy = py0 < py1 ? 1 : -1
	let err = dx - dy

	while (true) {
		if (lineWidth === 1) {
			setPixel(image, px0, py0, color)
		} else {
			// Draw thick line as filled circle at each point
			fillCircle(image, px0, py0, lineWidth / 2, color)
		}

		if (px0 === px1 && py0 === py1) break

		const e2 = 2 * err
		if (e2 > -dy) {
			err -= dy
			px0 += sx
		}
		if (e2 < dx) {
			err += dx
			py0 += sy
		}
	}
}

/**
 * Draw a rectangle outline
 */
export function drawRect(
	image: ImageData,
	x: number,
	y: number,
	width: number,
	height: number,
	options: ShapeOptions = {}
): void {
	const color = options.stroke?.color ?? [0, 0, 0, 255]
	const lineWidth = options.stroke?.width ?? 1

	// Top
	drawLine(image, x, y, x + width - 1, y, color, lineWidth)
	// Bottom
	drawLine(image, x, y + height - 1, x + width - 1, y + height - 1, color, lineWidth)
	// Left
	drawLine(image, x, y, x, y + height - 1, color, lineWidth)
	// Right
	drawLine(image, x + width - 1, y, x + width - 1, y + height - 1, color, lineWidth)

	// Fill if specified
	if (options.fill) {
		fillRect(
			image,
			x + lineWidth,
			y + lineWidth,
			width - lineWidth * 2,
			height - lineWidth * 2,
			options.fill.color!
		)
	}
}

/**
 * Fill a rectangle
 */
export function fillRect(
	image: ImageData,
	x: number,
	y: number,
	width: number,
	height: number,
	color: Color
): void {
	const x0 = Math.max(0, Math.floor(x))
	const y0 = Math.max(0, Math.floor(y))
	const x1 = Math.min(image.width, Math.floor(x + width))
	const y1 = Math.min(image.height, Math.floor(y + height))

	for (let py = y0; py < y1; py++) {
		for (let px = x0; px < x1; px++) {
			setPixel(image, px, py, color)
		}
	}
}

/**
 * Draw a circle outline using midpoint algorithm
 */
export function drawCircle(
	image: ImageData,
	cx: number,
	cy: number,
	radius: number,
	options: ShapeOptions = {}
): void {
	const color = options.stroke?.color ?? [0, 0, 0, 255]
	const rcx = Math.round(cx)
	const rcy = Math.round(cy)
	const r = Math.round(radius)

	let x = r
	let y = 0
	let err = 0

	while (x >= y) {
		setPixel(image, rcx + x, rcy + y, color)
		setPixel(image, rcx + y, rcy + x, color)
		setPixel(image, rcx - y, rcy + x, color)
		setPixel(image, rcx - x, rcy + y, color)
		setPixel(image, rcx - x, rcy - y, color)
		setPixel(image, rcx - y, rcy - x, color)
		setPixel(image, rcx + y, rcy - x, color)
		setPixel(image, rcx + x, rcy - y, color)

		y++
		if (err <= 0) {
			err += 2 * y + 1
		}
		if (err > 0) {
			x--
			err -= 2 * x + 1
		}
	}

	// Fill if specified
	if (options.fill) {
		fillCircle(image, rcx, rcy, r - 1, options.fill.color!)
	}
}

/**
 * Fill a circle
 */
export function fillCircle(
	image: ImageData,
	cx: number,
	cy: number,
	radius: number,
	color: Color
): void {
	const rcx = Math.round(cx)
	const rcy = Math.round(cy)
	const r = Math.round(radius)
	const r2 = r * r

	for (let dy = -r; dy <= r; dy++) {
		for (let dx = -r; dx <= r; dx++) {
			if (dx * dx + dy * dy <= r2) {
				setPixel(image, rcx + dx, rcy + dy, color)
			}
		}
	}
}

/**
 * Draw an ellipse outline
 */
export function drawEllipse(
	image: ImageData,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	options: ShapeOptions = {}
): void {
	const color = options.stroke?.color ?? [0, 0, 0, 255]

	// Midpoint ellipse algorithm
	const rx2 = rx * rx
	const ry2 = ry * ry
	const tworx2 = 2 * rx2
	const twory2 = 2 * ry2

	let x = 0
	let y = ry
	let px = 0
	let py = tworx2 * y

	// Region 1
	let p = Math.round(ry2 - rx2 * ry + 0.25 * rx2)
	while (px < py) {
		setPixel(image, cx + x, cy + y, color)
		setPixel(image, cx - x, cy + y, color)
		setPixel(image, cx + x, cy - y, color)
		setPixel(image, cx - x, cy - y, color)

		x++
		px += twory2
		if (p < 0) {
			p += ry2 + px
		} else {
			y--
			py -= tworx2
			p += ry2 + px - py
		}
	}

	// Region 2
	p = Math.round(ry2 * (x + 0.5) * (x + 0.5) + rx2 * (y - 1) * (y - 1) - rx2 * ry2)
	while (y >= 0) {
		setPixel(image, cx + x, cy + y, color)
		setPixel(image, cx - x, cy + y, color)
		setPixel(image, cx + x, cy - y, color)
		setPixel(image, cx - x, cy - y, color)

		y--
		py -= tworx2
		if (p > 0) {
			p += rx2 - py
		} else {
			x++
			px += twory2
			p += rx2 - py + px
		}
	}

	// Fill if specified
	if (options.fill) {
		fillEllipse(image, cx, cy, rx - 1, ry - 1, options.fill.color!)
	}
}

/**
 * Fill an ellipse
 */
export function fillEllipse(
	image: ImageData,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	color: Color
): void {
	for (let y = -ry; y <= ry; y++) {
		for (let x = -rx; x <= rx; x++) {
			if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
				setPixel(image, cx + x, cy + y, color)
			}
		}
	}
}

/**
 * Draw a polygon
 */
export function drawPolygon(image: ImageData, points: Point[], options: ShapeOptions = {}): void {
	if (points.length < 2) return

	const color = options.stroke?.color ?? [0, 0, 0, 255]
	const lineWidth = options.stroke?.width ?? 1

	// Draw lines between consecutive points
	for (let i = 0; i < points.length; i++) {
		const p1 = points[i]!
		const p2 = points[(i + 1) % points.length]!
		drawLine(image, p1.x, p1.y, p2.x, p2.y, color, lineWidth)
	}

	// Fill if specified
	if (options.fill && points.length >= 3) {
		fillPolygon(image, points, options.fill.color!)
	}
}

/**
 * Fill a polygon using scanline algorithm
 */
export function fillPolygon(image: ImageData, points: Point[], color: Color): void {
	if (points.length < 3) return

	// Find bounding box
	let minY = Number.POSITIVE_INFINITY
	let maxY = Number.NEGATIVE_INFINITY
	for (const p of points) {
		minY = Math.min(minY, p.y)
		maxY = Math.max(maxY, p.y)
	}

	minY = Math.max(0, Math.floor(minY))
	maxY = Math.min(image.height - 1, Math.floor(maxY))

	// Scanline fill
	for (let y = minY; y <= maxY; y++) {
		const intersections: number[] = []

		for (let i = 0; i < points.length; i++) {
			const p1 = points[i]!
			const p2 = points[(i + 1) % points.length]!

			// Check if edge crosses this scanline
			if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
				// Calculate x intersection
				const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x)
				intersections.push(x)
			}
		}

		// Sort intersections
		intersections.sort((a, b) => a - b)

		// Fill between pairs
		for (let i = 0; i < intersections.length; i += 2) {
			const x1 = Math.max(0, Math.ceil(intersections[i]!))
			const x2 = Math.min(image.width - 1, Math.floor(intersections[i + 1]!))

			for (let x = x1; x <= x2; x++) {
				setPixel(image, x, y, color)
			}
		}
	}
}

/**
 * Fill with gradient
 */
export function fillGradient(image: ImageData, gradient: Gradient): void {
	const { width, height } = image

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let t: number

			if (gradient.type === 'linear') {
				// Calculate position along gradient line
				const dx = gradient.x2 - gradient.x1
				const dy = gradient.y2 - gradient.y1
				const len2 = dx * dx + dy * dy
				if (len2 === 0) {
					t = 0
				} else {
					t = ((x - gradient.x1) * dx + (y - gradient.y1) * dy) / len2
				}
			} else {
				// Radial gradient
				const dx = x - gradient.cx
				const dy = y - gradient.cy
				t = Math.sqrt(dx * dx + dy * dy) / gradient.radius
			}

			// Clamp t
			t = Math.max(0, Math.min(1, t))

			// Interpolate color
			const color = interpolateGradient(gradient.stops, t)
			setPixel(image, x, y, color)
		}
	}
}

function interpolateGradient(stops: { position: number; color: Color }[], t: number): Color {
	if (stops.length === 0) return [0, 0, 0, 255]
	if (stops.length === 1) return stops[0]!.color

	// Find surrounding stops
	let lower = stops[0]!
	let upper = stops[stops.length - 1]!

	for (let i = 0; i < stops.length - 1; i++) {
		if (t >= stops[i]!.position && t <= stops[i + 1]!.position) {
			lower = stops[i]!
			upper = stops[i + 1]!
			break
		}
	}

	// Interpolate
	const range = upper.position - lower.position
	const localT = range === 0 ? 0 : (t - lower.position) / range

	return [
		Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * localT),
		Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * localT),
		Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * localT),
		Math.round(lower.color[3] + (upper.color[3] - lower.color[3]) * localT),
	]
}

/**
 * Flood fill (bucket fill)
 */
export function floodFill(
	image: ImageData,
	x: number,
	y: number,
	fillColor: Color,
	tolerance = 0
): void {
	const startX = Math.floor(x)
	const startY = Math.floor(y)

	if (startX < 0 || startX >= image.width || startY < 0 || startY >= image.height) return

	const targetColor = getPixel(image, startX, startY)

	// Don't fill if already the fill color
	if (colorsMatch(targetColor, fillColor, 0)) return

	const stack: [number, number][] = [[startX, startY]]
	const visited = new Set<string>()

	while (stack.length > 0) {
		const [px, py] = stack.pop()!
		const key = `${px},${py}`

		if (visited.has(key)) continue
		if (px < 0 || px >= image.width || py < 0 || py >= image.height) continue

		const currentColor = getPixel(image, px, py)
		if (!colorsMatch(currentColor, targetColor, tolerance)) continue

		visited.add(key)
		setPixel(image, px, py, fillColor)

		stack.push([px + 1, py])
		stack.push([px - 1, py])
		stack.push([px, py + 1])
		stack.push([px, py - 1])
	}
}

function colorsMatch(c1: Color, c2: Color, tolerance: number): boolean {
	return (
		Math.abs(c1[0] - c2[0]) <= tolerance &&
		Math.abs(c1[1] - c2[1]) <= tolerance &&
		Math.abs(c1[2] - c2[2]) <= tolerance &&
		Math.abs(c1[3] - c2[3]) <= tolerance
	)
}

/**
 * Clear image to a color
 */
export function clear(image: ImageData, color: Color = [0, 0, 0, 0]): void {
	const [r, g, b, a] = color
	for (let i = 0; i < image.data.length; i += 4) {
		image.data[i] = r
		image.data[i + 1] = g
		image.data[i + 2] = b
		image.data[i + 3] = a
	}
}

/**
 * Create a new blank image
 */
export function createImage(width: number, height: number, color: Color = [0, 0, 0, 0]): ImageData {
	const data = new Uint8Array(width * height * 4)
	const [r, g, b, a] = color
	for (let i = 0; i < data.length; i += 4) {
		data[i] = r
		data[i + 1] = g
		data[i + 2] = b
		data[i + 3] = a
	}
	return { width, height, data }
}
