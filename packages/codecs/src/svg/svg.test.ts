/**
 * SVG codec tests - Full SVG support
 */

import { describe, expect, it } from 'bun:test'
import { decodeSvg, isSvg, parseSvgInfo } from './decoder'

// ─────────────────────────────────────────────────────────────────────────────
// Detection
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG detection', () => {
	it('detects basic SVG', () => {
		expect(isSvg('<svg></svg>')).toBe(true)
		expect(isSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(true)
	})

	it('detects SVG with XML declaration', () => {
		expect(isSvg('<?xml version="1.0"?><svg></svg>')).toBe(true)
	})

	it('detects SVG with DOCTYPE', () => {
		expect(isSvg('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "..."><svg></svg>')).toBe(true)
	})

	it('detects SVG from Uint8Array', () => {
		const data = new TextEncoder().encode('<svg></svg>')
		expect(isSvg(data)).toBe(true)
	})

	it('rejects non-SVG content', () => {
		expect(isSvg('<html></html>')).toBe(false)
		expect(isSvg('plain text')).toBe(false)
		expect(isSvg('')).toBe(false)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Info parsing
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG info', () => {
	it('parses dimensions from width/height', () => {
		const info = parseSvgInfo('<svg width="100" height="200"></svg>')
		expect(info.width).toBe(100)
		expect(info.height).toBe(200)
	})

	it('parses dimensions from viewBox', () => {
		const info = parseSvgInfo('<svg viewBox="0 0 300 150"></svg>')
		expect(info.width).toBe(300)
		expect(info.height).toBe(150)
		expect(info.viewBox).toEqual({ x: 0, y: 0, width: 300, height: 150 })
	})

	it('prefers width/height over viewBox for dimensions', () => {
		const info = parseSvgInfo('<svg width="100" height="100" viewBox="0 0 300 150"></svg>')
		expect(info.width).toBe(100)
		expect(info.height).toBe(100)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Basic shapes
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG basic shapes', () => {
	it('renders rectangle', () => {
		const svg = '<svg width="10" height="10"><rect x="2" y="2" width="6" height="6" fill="red"/></svg>'
		const img = decodeSvg(svg)
		expect(img.width).toBe(10)
		expect(img.height).toBe(10)
		// Check center pixel is red
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(255) // R
		expect(img.data[idx + 1]).toBe(0) // G
		expect(img.data[idx + 2]).toBe(0) // B
		expect(img.data[idx + 3]).toBe(255) // A
	})

	it('renders circle', () => {
		const svg = '<svg width="20" height="20"><circle cx="10" cy="10" r="8" fill="blue"/></svg>'
		const img = decodeSvg(svg)
		// Center pixel should be blue
		const idx = (10 * 20 + 10) * 4
		expect(img.data[idx]).toBe(0) // R
		expect(img.data[idx + 1]).toBe(0) // G
		expect(img.data[idx + 2]).toBe(255) // B
	})

	it('renders ellipse', () => {
		const svg = '<svg width="30" height="20"><ellipse cx="15" cy="10" rx="12" ry="8" fill="green"/></svg>'
		const img = decodeSvg(svg)
		// Center pixel should be green
		const idx = (10 * 30 + 15) * 4
		expect(img.data[idx]).toBe(0) // R
		expect(img.data[idx + 1]).toBe(128) // G (green is 0,128,0)
		expect(img.data[idx + 2]).toBe(0) // B
	})

	it('renders line', () => {
		const svg = '<svg width="20" height="20"><line x1="0" y1="10" x2="20" y2="10" stroke="black" stroke-width="2"/></svg>'
		const img = decodeSvg(svg)
		// Middle of line should be black
		const idx = (10 * 20 + 10) * 4
		expect(img.data[idx]).toBe(0) // R
		expect(img.data[idx + 1]).toBe(0) // G
		expect(img.data[idx + 2]).toBe(0) // B
	})

	it('renders polygon', () => {
		const svg = '<svg width="20" height="20"><polygon points="10,2 18,18 2,18" fill="yellow"/></svg>'
		const img = decodeSvg(svg)
		// Center should be yellow
		const idx = (12 * 20 + 10) * 4
		expect(img.data[idx]).toBe(255) // R
		expect(img.data[idx + 1]).toBe(255) // G
		expect(img.data[idx + 2]).toBe(0) // B
	})

	it('renders polyline', () => {
		const svg = '<svg width="20" height="20"><polyline points="2,2 18,2 18,18" stroke="purple" stroke-width="2" fill="none"/></svg>'
		const img = decodeSvg(svg)
		// Top line should be purple
		const idx = (2 * 20 + 10) * 4
		expect(img.data[idx]).toBe(128) // R (purple is 128,0,128)
		expect(img.data[idx + 1]).toBe(0) // G
		expect(img.data[idx + 2]).toBe(128) // B
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Path commands
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG paths', () => {
	it('renders path with M, L, Z', () => {
		const svg = '<svg width="20" height="20"><path d="M 2 2 L 18 2 L 18 18 L 2 18 Z" fill="cyan"/></svg>'
		const img = decodeSvg(svg)
		// Center should be cyan
		const idx = (10 * 20 + 10) * 4
		expect(img.data[idx]).toBe(0) // R
		expect(img.data[idx + 1]).toBe(255) // G
		expect(img.data[idx + 2]).toBe(255) // B
	})

	it('renders path with curves (C)', () => {
		const svg = '<svg width="40" height="40"><path d="M 5 20 C 5 5, 35 5, 35 20 C 35 35, 5 35, 5 20 Z" fill="orange"/></svg>'
		const img = decodeSvg(svg)
		// Center should be orange
		const idx = (20 * 40 + 20) * 4
		expect(img.data[idx]).toBe(255) // R
		expect(img.data[idx + 1]).toBe(165) // G (orange is 255,165,0)
		expect(img.data[idx + 2]).toBe(0) // B
	})

	it('renders path with quadratic curves (Q)', () => {
		const svg = '<svg width="40" height="40"><path d="M 5 35 Q 20 5, 35 35 Z" fill="pink"/></svg>'
		const img = decodeSvg(svg)
		// Inside triangle area
		const idx = (30 * 40 + 20) * 4
		expect(img.data[idx]).toBe(255) // R
	})

	it('renders path with arcs (A)', () => {
		const svg = '<svg width="40" height="40"><path d="M 20 5 A 15 15 0 1 1 20 35 A 15 15 0 1 1 20 5" fill="coral"/></svg>'
		const img = decodeSvg(svg)
		// Center should be coral
		const idx = (20 * 40 + 20) * 4
		expect(img.data[idx]).toBe(255) // R
		expect(img.data[idx + 1]).toBe(127) // G (coral is 255,127,80)
		expect(img.data[idx + 2]).toBe(80) // B
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Gradients
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG gradients', () => {
	it('renders linear gradient', () => {
		const svg = `
			<svg width="100" height="20">
				<defs>
					<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stop-color="red"/>
						<stop offset="100%" stop-color="blue"/>
					</linearGradient>
				</defs>
				<rect x="0" y="0" width="100" height="20" fill="url(#grad)"/>
			</svg>
		`
		const img = decodeSvg(svg)
		// Left side should be more red
		const leftIdx = (10 * 100 + 5) * 4
		expect(img.data[leftIdx]).toBeGreaterThan(200) // R > 200
		expect(img.data[leftIdx + 2]).toBeLessThan(50) // B < 50
		// Right side should be more blue
		const rightIdx = (10 * 100 + 95) * 4
		expect(img.data[rightIdx]).toBeLessThan(50) // R < 50
		expect(img.data[rightIdx + 2]).toBeGreaterThan(200) // B > 200
	})

	it('renders radial gradient', () => {
		const svg = `
			<svg width="40" height="40">
				<defs>
					<radialGradient id="rgrad" cx="50%" cy="50%" r="50%">
						<stop offset="0%" stop-color="white"/>
						<stop offset="100%" stop-color="black"/>
					</radialGradient>
				</defs>
				<rect x="0" y="0" width="40" height="40" fill="url(#rgrad)"/>
			</svg>
		`
		const img = decodeSvg(svg)
		// Center should be lighter than edges
		const centerIdx = (20 * 40 + 20) * 4
		const edgeIdx = (20 * 40 + 2) * 4
		expect(img.data[centerIdx]).toBeGreaterThan(img.data[edgeIdx])
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Stroke properties
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG stroke properties', () => {
	it('renders stroke with custom width', () => {
		const svg = '<svg width="20" height="20"><line x1="10" y1="0" x2="10" y2="20" stroke="red" stroke-width="4"/></svg>'
		const img = decodeSvg(svg)
		// Line should be 4 pixels wide at center
		const idx8 = (10 * 20 + 8) * 4
		const idx12 = (10 * 20 + 12) * 4
		expect(img.data[idx8]).toBe(255) // Inside line
		expect(img.data[idx12]).toBe(255) // Inside line
	})

	it('renders dashed stroke', () => {
		const svg = '<svg width="100" height="10"><line x1="0" y1="5" x2="100" y2="5" stroke="black" stroke-width="2" stroke-dasharray="10,5"/></svg>'
		const img = decodeSvg(svg)
		// First part of dash should be filled
		const dashIdx = (5 * 100 + 5) * 4
		expect(img.data[dashIdx]).toBe(0) // Black
		// Gap should be transparent
		const gapIdx = (5 * 100 + 12) * 4
		expect(img.data[gapIdx + 3]).toBe(0) // Alpha = 0 (transparent)
	})

	it('renders stroke opacity', () => {
		const svg = '<svg width="20" height="20"><rect x="5" y="5" width="10" height="10" fill="none" stroke="red" stroke-width="2" stroke-opacity="0.5"/></svg>'
		const img = decodeSvg(svg)
		// Stroke should be semi-transparent
		const idx = (5 * 20 + 10) * 4
		expect(img.data[idx]).toBeGreaterThan(100) // Some red
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Fill rules
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG fill rules', () => {
	it('renders nonzero fill rule (default)', () => {
		// Star shape where center should be filled with nonzero
		const svg = '<svg width="40" height="40"><path d="M 20 0 L 25 15 L 40 15 L 28 24 L 32 40 L 20 30 L 8 40 L 12 24 L 0 15 L 15 15 Z" fill="red" fill-rule="nonzero"/></svg>'
		const img = decodeSvg(svg)
		// Center should be filled
		const idx = (20 * 40 + 20) * 4
		expect(img.data[idx]).toBe(255) // Red
	})

	it('renders evenodd fill rule', () => {
		// Concentric squares where inner should be empty with evenodd
		const svg = `
			<svg width="40" height="40">
				<path d="M 0 0 L 40 0 L 40 40 L 0 40 Z M 10 10 L 30 10 L 30 30 L 10 30 Z" fill="blue" fill-rule="evenodd"/>
			</svg>
		`
		const img = decodeSvg(svg)
		// Inner area should be empty (alpha 0)
		const innerIdx = (20 * 40 + 20) * 4
		expect(img.data[innerIdx + 3]).toBe(0) // Alpha = 0
		// Outer area should be filled
		const outerIdx = (5 * 40 + 5) * 4
		expect(img.data[outerIdx + 2]).toBe(255) // Blue
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Groups and transforms
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG groups and transforms', () => {
	it('renders group', () => {
		const svg = '<svg width="20" height="20"><g fill="red"><rect x="0" y="0" width="10" height="10"/><rect x="10" y="10" width="10" height="10"/></g></svg>'
		const img = decodeSvg(svg)
		// Both rectangles should be red
		const idx1 = (5 * 20 + 5) * 4
		const idx2 = (15 * 20 + 15) * 4
		expect(img.data[idx1]).toBe(255)
		expect(img.data[idx2]).toBe(255)
	})

	it('renders translate transform', () => {
		const svg = '<svg width="20" height="20"><rect x="0" y="0" width="5" height="5" fill="red" transform="translate(10, 10)"/></svg>'
		const img = decodeSvg(svg)
		// Translated position (12, 12) should be red
		const idx = (12 * 20 + 12) * 4
		expect(img.data[idx]).toBe(255)
	})

	it('renders scale transform', () => {
		const svg = '<svg width="20" height="20"><rect x="0" y="0" width="5" height="5" fill="blue" transform="scale(2)"/></svg>'
		const img = decodeSvg(svg)
		// Scaled position (8, 8) should be blue
		const idx = (8 * 20 + 8) * 4
		expect(img.data[idx + 2]).toBe(255)
	})

	it('renders rotate transform', () => {
		const svg = '<svg width="30" height="30"><rect x="-5" y="-5" width="10" height="10" fill="green" transform="translate(15, 15) rotate(45)"/></svg>'
		const img = decodeSvg(svg)
		// Center should be green after rotation
		const idx = (15 * 30 + 15) * 4
		expect(img.data[idx + 1]).toBe(128)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Text rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG text', () => {
	it('renders basic text', () => {
		const svg = '<svg width="50" height="20"><text x="5" y="15" fill="black" font-size="12">Hi</text></svg>'
		const img = decodeSvg(svg)
		// Text area should have some black pixels
		let blackPixels = 0
		for (let y = 5; y < 18; y++) {
			for (let x = 5; x < 25; x++) {
				const idx = (y * 50 + x) * 4
				if (img.data[idx] === 0 && img.data[idx + 1] === 0 && img.data[idx + 2] === 0 && img.data[idx + 3] === 255) {
					blackPixels++
				}
			}
		}
		expect(blackPixels).toBeGreaterThan(10)
	})

	it('renders text with anchor middle', () => {
		const svg = '<svg width="100" height="20"><text x="50" y="15" text-anchor="middle" fill="red" font-size="12">AB</text></svg>'
		const img = decodeSvg(svg)
		// Text should be centered around x=50
		let leftPixels = 0
		let rightPixels = 0
		for (let y = 5; y < 18; y++) {
			for (let x = 30; x < 50; x++) {
				const idx = (y * 100 + x) * 4
				if (img.data[idx] === 255) leftPixels++
			}
			for (let x = 50; x < 70; x++) {
				const idx = (y * 100 + x) * 4
				if (img.data[idx] === 255) rightPixels++
			}
		}
		// Both sides should have similar amount of pixels (centered)
		expect(Math.abs(leftPixels - rightPixels)).toBeLessThan(leftPixels * 0.5)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Named colors
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG colors', () => {
	it('parses named colors', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="coral"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(255) // R
		expect(img.data[idx + 1]).toBe(127) // G
		expect(img.data[idx + 2]).toBe(80) // B
	})

	it('parses rgb colors', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="rgb(100, 150, 200)"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(100)
		expect(img.data[idx + 1]).toBe(150)
		expect(img.data[idx + 2]).toBe(200)
	})

	it('parses rgba colors', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="rgba(255, 0, 0, 0.5)"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBeGreaterThan(100) // Blended red
	})

	it('parses hex colors', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="#ff8800"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(255)
		expect(img.data[idx + 1]).toBe(136)
		expect(img.data[idx + 2]).toBe(0)
	})

	it('parses short hex colors', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="#f80"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(255)
		expect(img.data[idx + 1]).toBe(136)
		expect(img.data[idx + 2]).toBe(0)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Use and symbols
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG use and symbols', () => {
	it('renders use element referencing shape', () => {
		const svg = `
			<svg width="40" height="20">
				<defs>
					<rect id="myRect" width="15" height="15" fill="red"/>
				</defs>
				<use href="#myRect" x="0" y="0"/>
				<use href="#myRect" x="20" y="0"/>
			</svg>
		`
		const img = decodeSvg(svg)
		// Both positions should have red rectangles
		const idx1 = (7 * 40 + 7) * 4
		const idx2 = (7 * 40 + 27) * 4
		expect(img.data[idx1]).toBe(255)
		expect(img.data[idx2]).toBe(255)
	})

	it('renders symbol', () => {
		const svg = `
			<svg width="40" height="20">
				<defs>
					<symbol id="icon" viewBox="0 0 10 10">
						<circle cx="5" cy="5" r="4" fill="blue"/>
					</symbol>
				</defs>
				<use href="#icon" x="0" y="0" width="20" height="20"/>
			</svg>
		`
		const img = decodeSvg(svg)
		// Symbol should be rendered
		const idx = (10 * 40 + 10) * 4
		expect(img.data[idx + 2]).toBe(255) // Blue
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// ClipPath
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG clipPath', () => {
	it('clips content to path', () => {
		const svg = `
			<svg width="40" height="40">
				<defs>
					<clipPath id="clip">
						<circle cx="20" cy="20" r="15"/>
					</clipPath>
				</defs>
				<rect x="0" y="0" width="40" height="40" fill="red" clip-path="url(#clip)"/>
			</svg>
		`
		const img = decodeSvg(svg)
		// Inside clip should be red
		const insideIdx = (20 * 40 + 20) * 4
		expect(img.data[insideIdx]).toBe(255)
		// Outside clip (corner) should be transparent
		const outsideIdx = (2 * 40 + 2) * 4
		expect(img.data[outsideIdx + 3]).toBe(0)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Opacity
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG opacity', () => {
	it('renders fill opacity', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="red" fill-opacity="0.5"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx + 3]).toBe(128) // Alpha ~128
	})

	it('renders element opacity', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" fill="blue" opacity="0.25"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx + 3]).toBeLessThan(100) // Alpha ~64
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Rounded rectangles
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG rounded rectangles', () => {
	it('renders rect with rx', () => {
		const svg = '<svg width="40" height="40"><rect x="5" y="5" width="30" height="30" rx="10" fill="cyan"/></svg>'
		const img = decodeSvg(svg)
		// Center should be cyan
		const centerIdx = (20 * 40 + 20) * 4
		expect(img.data[centerIdx]).toBe(0)
		expect(img.data[centerIdx + 1]).toBe(255)
		expect(img.data[centerIdx + 2]).toBe(255)
		// Corner should be transparent (rounded)
		const cornerIdx = (6 * 40 + 6) * 4
		expect(img.data[cornerIdx + 3]).toBe(0)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// Resize options
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG decode options', () => {
	it('resizes to specified dimensions', () => {
		const svg = '<svg width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="red"/></svg>'
		const img = decodeSvg(svg, { width: 50, height: 50 })
		expect(img.width).toBe(50)
		expect(img.height).toBe(50)
	})

	it('adds background color', () => {
		const svg = '<svg width="20" height="20"><circle cx="10" cy="10" r="5" fill="red"/></svg>'
		const img = decodeSvg(svg, { background: 'blue' })
		// Outside circle should be blue (background)
		const idx = (2 * 20 + 2) * 4
		expect(img.data[idx]).toBe(0)
		expect(img.data[idx + 1]).toBe(0)
		expect(img.data[idx + 2]).toBe(255)
	})
})

// ─────────────────────────────────────────────────────────────────────────────
// CSS styles
// ─────────────────────────────────────────────────────────────────────────────

describe('SVG CSS styles', () => {
	it('parses inline style attribute', () => {
		const svg = '<svg width="10" height="10"><rect x="0" y="0" width="10" height="10" style="fill: magenta"/></svg>'
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(255) // R
		expect(img.data[idx + 1]).toBe(0) // G
		expect(img.data[idx + 2]).toBe(255) // B
	})

	it('parses style element', () => {
		const svg = `
			<svg width="10" height="10">
				<style>.myClass { fill: lime; }</style>
				<rect x="0" y="0" width="10" height="10" class="myClass"/>
			</svg>
		`
		const img = decodeSvg(svg)
		const idx = (5 * 10 + 5) * 4
		expect(img.data[idx]).toBe(0) // R
		expect(img.data[idx + 1]).toBe(255) // G (lime)
		expect(img.data[idx + 2]).toBe(0) // B
	})
})
