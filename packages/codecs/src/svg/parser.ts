/**
 * SVG XML parser - Full SVG support
 * Parses SVG XML into structured elements
 */

import type {
	CssProperties,
	GradientStop,
	LinearGradient,
	PathCommand,
	PreserveAspectRatio,
	RadialGradient,
	RgbaColor,
	StrokeLinecap,
	StrokeLinejoin,
	SvgCircle,
	SvgClipPath,
	SvgDefs,
	SvgDocument,
	SvgElement,
	SvgEllipse,
	SvgFilter,
	SvgFilterPrimitive,
	SvgGradient,
	SvgGroup,
	SvgImage,
	SvgLine,
	SvgMask,
	SvgPaint,
	SvgPath,
	SvgPattern,
	SvgPolygon,
	SvgPolyline,
	SvgRect,
	SvgSymbol,
	SvgText,
	SvgTransform,
	SvgTspan,
	SvgUse,
} from './types'

// ─────────────────────────────────────────────────────────────────────────────
// XML Parser
// ─────────────────────────────────────────────────────────────────────────────

interface XmlNode {
	tag: string
	attrs: Record<string, string>
	children: XmlNode[]
	text?: string
}

function parseXml(xml: string): XmlNode | null {
	let pos = 0

	function skipWhitespace(): void {
		while (pos < xml.length && /\s/.test(xml[pos]!)) pos++
	}

	function parseTag(): XmlNode | null {
		skipWhitespace()

		// Skip comments, declarations, DOCTYPE, CDATA
		while (pos < xml.length) {
			if (xml.slice(pos, pos + 4) === '<!--') {
				const end = xml.indexOf('-->', pos + 4)
				if (end === -1) return null
				pos = end + 3
				skipWhitespace()
			} else if (xml.slice(pos, pos + 2) === '<?') {
				const end = xml.indexOf('?>', pos + 2)
				if (end === -1) return null
				pos = end + 2
				skipWhitespace()
			} else if (xml.slice(pos, pos + 9) === '<!DOCTYPE') {
				// Handle DOCTYPE with potential nested brackets
				let depth = 1
				pos += 9
				while (pos < xml.length && depth > 0) {
					if (xml[pos] === '[') depth++
					else if (xml[pos] === ']') depth--
					else if (xml[pos] === '>' && depth === 1) {
						pos++
						depth = 0
						break
					}
					pos++
				}
				skipWhitespace()
			} else if (xml.slice(pos, pos + 9) === '<![CDATA[') {
				const end = xml.indexOf(']]>', pos + 9)
				if (end === -1) return null
				pos = end + 3
				skipWhitespace()
			} else {
				break
			}
		}

		if (pos >= xml.length || xml[pos] !== '<') return null
		pos++

		// Parse tag name
		const tagStart = pos
		while (pos < xml.length && /[a-zA-Z0-9:_-]/.test(xml[pos]!)) pos++
		const tag = xml.slice(tagStart, pos)

		if (!tag) return null

		// Parse attributes
		const attrs: Record<string, string> = {}
		while (pos < xml.length) {
			skipWhitespace()

			if (xml[pos] === '>' || xml[pos] === '/') break

			// Parse attribute name
			const attrStart = pos
			while (pos < xml.length && /[a-zA-Z0-9:_-]/.test(xml[pos]!)) pos++
			const attrName = xml.slice(attrStart, pos)

			if (!attrName) break

			skipWhitespace()

			if (xml[pos] === '=') {
				pos++
				skipWhitespace()

				// Parse attribute value
				const quote = xml[pos]
				if (quote === '"' || quote === "'") {
					pos++
					const valueStart = pos
					while (pos < xml.length && xml[pos] !== quote) pos++
					attrs[attrName] = decodeXmlEntities(xml.slice(valueStart, pos))
					pos++
				}
			} else {
				attrs[attrName] = 'true'
			}
		}

		// Self-closing tag
		if (xml[pos] === '/') {
			pos += 2 // Skip />
			return { tag, attrs, children: [] }
		}

		pos++ // Skip >

		// Parse children
		const children: XmlNode[] = []
		let text = ''

		while (pos < xml.length) {
			// Skip comments in content
			while (xml.slice(pos, pos + 4) === '<!--') {
				const end = xml.indexOf('-->', pos + 4)
				if (end === -1) break
				pos = end + 3
			}

			// End tag
			if (xml.slice(pos, pos + 2) === '</') {
				pos += 2
				while (pos < xml.length && xml[pos] !== '>') pos++
				pos++
				break
			}

			// CDATA
			if (xml.slice(pos, pos + 9) === '<![CDATA[') {
				const cdataStart = pos + 9
				const end = xml.indexOf(']]>', cdataStart)
				if (end !== -1) {
					text += xml.slice(cdataStart, end)
					pos = end + 3
					continue
				}
			}

			// Child tag
			if (xml[pos] === '<') {
				const child = parseTag()
				if (child) children.push(child)
			} else {
				// Text content
				const textStart = pos
				while (pos < xml.length && xml[pos] !== '<') pos++
				text += xml.slice(textStart, pos)
			}
		}

		return { tag, attrs, children, text: text.trim() || undefined }
	}

	return parseTag()
}

function decodeXmlEntities(str: string): string {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Parser
// ─────────────────────────────────────────────────────────────────────────────

function parseCss(cssText: string): Map<string, CssProperties> {
	const styles = new Map<string, CssProperties>()

	// Remove comments
	cssText = cssText.replace(/\/\*[\s\S]*?\*\//g, '')

	// Parse rules
	const ruleRegex = /([^{]+)\{([^}]+)\}/g
	let match

	while ((match = ruleRegex.exec(cssText)) !== null) {
		const selectors = match[1]!.trim().split(',').map(s => s.trim())
		const declarations = match[2]!.trim()
		const props = parseStyleDeclarations(declarations)

		for (const selector of selectors) {
			styles.set(selector, props)
		}
	}

	return styles
}

function parseStyleDeclarations(style: string): CssProperties {
	const props: CssProperties = {}
	const declarations = style.split(';')

	for (const decl of declarations) {
		const [name, value] = decl.split(':').map(s => s.trim())
		if (!name || !value) continue

		// Convert kebab-case to camelCase
		const propName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
		;(props as Record<string, string>)[propName] = value
	}

	return props
}

function parseInlineStyle(style: string | undefined): CssProperties {
	if (!style) return {}
	return parseStyleDeclarations(style)
}

// ─────────────────────────────────────────────────────────────────────────────
// Color Parser
// ─────────────────────────────────────────────────────────────────────────────

const NAMED_COLORS: Record<string, string> = {
	aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4',
	azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
	blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
	burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00', chocolate: '#d2691e',
	coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c',
	cyan: '#00ffff', darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
	darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
	darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc',
	darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
	darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
	deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
	dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
	fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700',
	goldenrod: '#daa520', gray: '#808080', green: '#008000', greenyellow: '#adff2f',
	grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c',
	indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa',
	lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
	lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
	lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1', lightsalmon: '#ffa07a',
	lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
	lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32',
	linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
	mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
	mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
	midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
	navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000',
	olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
	palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
	papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb',
	plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399',
	red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513',
	salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee',
	sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd',
	slategray: '#708090', slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f',
	steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8',
	tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3',
	white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
}

export function parseColor(color: string | undefined): RgbaColor | null {
	if (!color || color === 'none' || color === 'transparent') return null

	color = color.trim().toLowerCase()

	// Named colors
	if (NAMED_COLORS[color]) {
		color = NAMED_COLORS[color]!
	}

	// Hex color
	if (color.startsWith('#')) {
		const hex = color.slice(1)
		if (hex.length === 3) {
			return {
				r: parseInt(hex[0]! + hex[0]!, 16),
				g: parseInt(hex[1]! + hex[1]!, 16),
				b: parseInt(hex[2]! + hex[2]!, 16),
				a: 255,
			}
		} else if (hex.length === 4) {
			return {
				r: parseInt(hex[0]! + hex[0]!, 16),
				g: parseInt(hex[1]! + hex[1]!, 16),
				b: parseInt(hex[2]! + hex[2]!, 16),
				a: parseInt(hex[3]! + hex[3]!, 16),
			}
		} else if (hex.length === 6) {
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16),
				a: 255,
			}
		} else if (hex.length === 8) {
			return {
				r: parseInt(hex.slice(0, 2), 16),
				g: parseInt(hex.slice(2, 4), 16),
				b: parseInt(hex.slice(4, 6), 16),
				a: parseInt(hex.slice(6, 8), 16),
			}
		}
	}

	// RGB/RGBA
	let rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/)
	if (rgbMatch) {
		return {
			r: parseInt(rgbMatch[1]!, 10),
			g: parseInt(rgbMatch[2]!, 10),
			b: parseInt(rgbMatch[3]!, 10),
			a: rgbMatch[4] ? Math.round(parseFloat(rgbMatch[4]) * 255) : 255,
		}
	}

	// RGB percentage
	rgbMatch = color.match(/rgba?\(\s*([\d.]+)%\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/)
	if (rgbMatch) {
		return {
			r: Math.round(parseFloat(rgbMatch[1]!) * 2.55),
			g: Math.round(parseFloat(rgbMatch[2]!) * 2.55),
			b: Math.round(parseFloat(rgbMatch[3]!) * 2.55),
			a: rgbMatch[4] ? Math.round(parseFloat(rgbMatch[4]) * 255) : 255,
		}
	}

	// HSL/HSLA
	const hslMatch = color.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/)
	if (hslMatch) {
		const h = parseFloat(hslMatch[1]!) / 360
		const s = parseFloat(hslMatch[2]!) / 100
		const l = parseFloat(hslMatch[3]!) / 100
		const a = hslMatch[4] ? parseFloat(hslMatch[4]) : 1

		const rgb = hslToRgb(h, s, l)
		return { ...rgb, a: Math.round(a * 255) }
	}

	return null
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
	let r: number, g: number, b: number

	if (s === 0) {
		r = g = b = l
	} else {
		const q = l < 0.5 ? l * (1 + s) : l + s - l * s
		const p = 2 * l - q
		r = hueToRgb(p, q, h + 1/3)
		g = hueToRgb(p, q, h)
		b = hueToRgb(p, q, h - 1/3)
	}

	return {
		r: Math.round(r * 255),
		g: Math.round(g * 255),
		b: Math.round(b * 255),
	}
}

function hueToRgb(p: number, q: number, t: number): number {
	if (t < 0) t += 1
	if (t > 1) t -= 1
	if (t < 1/6) return p + (q - p) * 6 * t
	if (t < 1/2) return q
	if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
	return p
}

export function parsePaint(value: string | undefined): SvgPaint {
	if (!value || value === 'none') return { type: 'none' }
	if (value === 'currentColor') return { type: 'currentColor' }

	// URL reference
	const urlMatch = value.match(/url\(#([^)]+)\)/)
	if (urlMatch) {
		return { type: 'url', id: urlMatch[1]! }
	}

	const color = parseColor(value)
	if (color) {
		return { type: 'color', color }
	}

	return { type: 'none' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Parser
// ─────────────────────────────────────────────────────────────────────────────

function parseTransform(str: string): SvgTransform[] {
	const transforms: SvgTransform[] = []
	const regex = /(\w+)\(([^)]+)\)/g
	let match

	while ((match = regex.exec(str)) !== null) {
		const [, type, args] = match
		const values = args!.split(/[\s,]+/).filter(s => s).map(Number)

		switch (type) {
			case 'translate':
				transforms.push({ type: 'translate', x: values[0] || 0, y: values[1] || 0 })
				break
			case 'scale':
				transforms.push({ type: 'scale', x: values[0] || 1, y: values[1] ?? values[0] ?? 1 })
				break
			case 'rotate':
				transforms.push({
					type: 'rotate',
					angle: values[0] || 0,
					cx: values[1],
					cy: values[2],
				})
				break
			case 'skewX':
				transforms.push({ type: 'skewX', angle: values[0] || 0 })
				break
			case 'skewY':
				transforms.push({ type: 'skewY', angle: values[0] || 0 })
				break
			case 'matrix':
				transforms.push({
					type: 'matrix',
					a: values[0] || 1,
					b: values[1] || 0,
					c: values[2] || 0,
					d: values[3] || 1,
					e: values[4] || 0,
					f: values[5] || 0,
				})
				break
		}
	}

	return transforms
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parsePathCommands(d: string): PathCommand[] {
	const commands: PathCommand[] = []

	// More robust regex that handles numbers without separators
	const tokenRegex = /([MmLlHhVvCcSsQqTtAaZz])|(-?[\d.]+(?:e[+-]?\d+)?)/gi
	const tokens: string[] = []
	let tokenMatch

	while ((tokenMatch = tokenRegex.exec(d)) !== null) {
		tokens.push(tokenMatch[0])
	}

	let i = 0
	let currentCmd = ''

	function getNumber(): number {
		if (i >= tokens.length) return 0
		const val = parseFloat(tokens[i]!)
		i++
		return isNaN(val) ? 0 : val
	}

	function getFlag(): boolean {
		const val = getNumber()
		return val !== 0
	}

	while (i < tokens.length) {
		const token = tokens[i]!

		// Check if it's a command letter
		if (/[MmLlHhVvCcSsQqTtAaZz]/.test(token)) {
			currentCmd = token
			i++
		}

		switch (currentCmd) {
			case 'M':
				commands.push({ type: 'M', x: getNumber(), y: getNumber() })
				currentCmd = 'L' // Subsequent coords are line-to
				break
			case 'm':
				commands.push({ type: 'm', dx: getNumber(), dy: getNumber() })
				currentCmd = 'l'
				break
			case 'L':
				commands.push({ type: 'L', x: getNumber(), y: getNumber() })
				break
			case 'l':
				commands.push({ type: 'l', dx: getNumber(), dy: getNumber() })
				break
			case 'H':
				commands.push({ type: 'H', x: getNumber() })
				break
			case 'h':
				commands.push({ type: 'h', dx: getNumber() })
				break
			case 'V':
				commands.push({ type: 'V', y: getNumber() })
				break
			case 'v':
				commands.push({ type: 'v', dy: getNumber() })
				break
			case 'C':
				commands.push({
					type: 'C',
					x1: getNumber(), y1: getNumber(),
					x2: getNumber(), y2: getNumber(),
					x: getNumber(), y: getNumber(),
				})
				break
			case 'c':
				commands.push({
					type: 'c',
					dx1: getNumber(), dy1: getNumber(),
					dx2: getNumber(), dy2: getNumber(),
					dx: getNumber(), dy: getNumber(),
				})
				break
			case 'S':
				commands.push({
					type: 'S',
					x2: getNumber(), y2: getNumber(),
					x: getNumber(), y: getNumber(),
				})
				break
			case 's':
				commands.push({
					type: 's',
					dx2: getNumber(), dy2: getNumber(),
					dx: getNumber(), dy: getNumber(),
				})
				break
			case 'Q':
				commands.push({
					type: 'Q',
					x1: getNumber(), y1: getNumber(),
					x: getNumber(), y: getNumber(),
				})
				break
			case 'q':
				commands.push({
					type: 'q',
					dx1: getNumber(), dy1: getNumber(),
					dx: getNumber(), dy: getNumber(),
				})
				break
			case 'T':
				commands.push({ type: 'T', x: getNumber(), y: getNumber() })
				break
			case 't':
				commands.push({ type: 't', dx: getNumber(), dy: getNumber() })
				break
			case 'A':
				commands.push({
					type: 'A',
					rx: getNumber(), ry: getNumber(),
					angle: getNumber(),
					largeArc: getFlag(),
					sweep: getFlag(),
					x: getNumber(), y: getNumber(),
				})
				break
			case 'a':
				commands.push({
					type: 'a',
					rx: getNumber(), ry: getNumber(),
					angle: getNumber(),
					largeArc: getFlag(),
					sweep: getFlag(),
					dx: getNumber(), dy: getNumber(),
				})
				break
			case 'Z':
			case 'z':
				commands.push({ type: 'Z' })
				break
			default:
				i++ // Skip unknown
		}
	}

	return commands
}

// ─────────────────────────────────────────────────────────────────────────────
// Main SVG Parser
// ─────────────────────────────────────────────────────────────────────────────

export function parseSvg(svgText: string): SvgDocument {
	const root = parseXml(svgText)

	if (!root || root.tag !== 'svg') {
		throw new Error('Invalid SVG: root element must be <svg>')
	}

	// Parse dimensions
	const width = parseDimension(root.attrs.width) || 300
	const height = parseDimension(root.attrs.height) || 150

	// Parse viewBox
	let viewBox = { x: 0, y: 0, width, height }
	if (root.attrs.viewBox) {
		const parts = root.attrs.viewBox.split(/[\s,]+/).map(Number)
		if (parts.length >= 4) {
			viewBox = { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! }
		}
	}

	// Parse preserveAspectRatio
	const preserveAspectRatio = parsePreserveAspectRatio(root.attrs.preserveAspectRatio)

	// Initialize defs
	const defs: SvgDefs = {
		gradients: new Map(),
		patterns: new Map(),
		clipPaths: new Map(),
		masks: new Map(),
		filters: new Map(),
		symbols: new Map(),
		elements: new Map(),
	}

	// Parse styles
	const styles = new Map<string, CssProperties>()

	// Parse elements
	const elements: SvgElement[] = []

	for (const child of root.children) {
		if (child.tag === 'defs') {
			parseDefs(child, defs)
		} else if (child.tag === 'style') {
			const cssStyles = parseCss(child.text || '')
			for (const [selector, props] of cssStyles) {
				styles.set(selector, props)
			}
		} else {
			const el = parseElement(child, styles, defs)
			if (el) {
				elements.push(el)
				if (el.id) {
					defs.elements.set(el.id, el)
				}
			}
		}
	}

	return { width, height, viewBox, preserveAspectRatio, elements, defs, styles }
}

function parseDimension(value: string | undefined): number | null {
	if (!value) return null
	// Remove units (px, em, etc.) and parse
	const num = parseFloat(value)
	return isNaN(num) ? null : num
}

function parsePreserveAspectRatio(value: string | undefined): PreserveAspectRatio {
	const defaults: PreserveAspectRatio = { align: 'xMidYMid', meetOrSlice: 'meet' }
	if (!value) return defaults

	const parts = value.trim().split(/\s+/)
	const align = parts[0] as PreserveAspectRatio['align']
	const meetOrSlice = (parts[1] || 'meet') as PreserveAspectRatio['meetOrSlice']

	return { align, meetOrSlice }
}

function parseDefs(node: XmlNode, defs: SvgDefs): void {
	for (const child of node.children) {
		switch (child.tag) {
			case 'linearGradient':
				parseLinearGradient(child, defs)
				break
			case 'radialGradient':
				parseRadialGradient(child, defs)
				break
			case 'pattern':
				parsePattern(child, defs)
				break
			case 'clipPath':
				parseClipPath(child, defs)
				break
			case 'mask':
				parseMaskDef(child, defs)
				break
			case 'filter':
				parseFilterDef(child, defs)
				break
			case 'symbol':
				parseSymbolDef(child, defs)
				break
			default: {
				const el = parseElement(child, new Map(), defs)
				if (el && child.attrs.id) {
					defs.elements.set(child.attrs.id, el)
				}
			}
		}
	}
}

function parseLinearGradient(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	const gradient: LinearGradient = {
		type: 'linearGradient',
		id,
		x1: parseFloat(node.attrs.x1 || '0') / (node.attrs.x1?.includes('%') ? 100 : 1),
		y1: parseFloat(node.attrs.y1 || '0') / (node.attrs.y1?.includes('%') ? 100 : 1),
		x2: parseFloat(node.attrs.x2 || '1') / (node.attrs.x2?.includes('%') ? 100 : 1),
		y2: parseFloat(node.attrs.y2 || '0') / (node.attrs.y2?.includes('%') ? 100 : 1),
		stops: parseGradientStops(node),
		gradientUnits: (node.attrs.gradientUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'objectBoundingBox',
		gradientTransform: node.attrs.gradientTransform ? parseTransform(node.attrs.gradientTransform) : undefined,
		spreadMethod: (node.attrs.spreadMethod as 'pad' | 'reflect' | 'repeat') || 'pad',
	}

	// Handle href for gradient inheritance
	if (node.attrs.href || node.attrs['xlink:href']) {
		const refId = (node.attrs.href || node.attrs['xlink:href'])!.replace('#', '')
		const parent = defs.gradients.get(refId)
		if (parent && parent.type === 'linearGradient') {
			if (gradient.stops.length === 0) gradient.stops = parent.stops
		}
	}

	defs.gradients.set(id, gradient)
}

function parseRadialGradient(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	const cx = parseFloat(node.attrs.cx || '0.5')
	const cy = parseFloat(node.attrs.cy || '0.5')

	const gradient: RadialGradient = {
		type: 'radialGradient',
		id,
		cx: cx / (node.attrs.cx?.includes('%') ? 100 : 1),
		cy: cy / (node.attrs.cy?.includes('%') ? 100 : 1),
		r: parseFloat(node.attrs.r || '0.5') / (node.attrs.r?.includes('%') ? 100 : 1),
		fx: parseFloat(node.attrs.fx || String(cx)) / (node.attrs.fx?.includes('%') ? 100 : 1),
		fy: parseFloat(node.attrs.fy || String(cy)) / (node.attrs.fy?.includes('%') ? 100 : 1),
		stops: parseGradientStops(node),
		gradientUnits: (node.attrs.gradientUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'objectBoundingBox',
		gradientTransform: node.attrs.gradientTransform ? parseTransform(node.attrs.gradientTransform) : undefined,
		spreadMethod: (node.attrs.spreadMethod as 'pad' | 'reflect' | 'repeat') || 'pad',
	}

	defs.gradients.set(id, gradient)
}

function parseGradientStops(node: XmlNode): GradientStop[] {
	const stops: GradientStop[] = []

	for (const child of node.children) {
		if (child.tag === 'stop') {
			const offsetStr = child.attrs.offset || '0'
			const offset = offsetStr.includes('%')
				? parseFloat(offsetStr) / 100
				: parseFloat(offsetStr)

			const stopColor = child.attrs['stop-color'] || parseInlineStyle(child.attrs.style).stopColor || 'black'
			const stopOpacity = parseFloat(child.attrs['stop-opacity'] || parseInlineStyle(child.attrs.style).stopOpacity || '1')

			const color = parseColor(stopColor)
			if (color) {
				color.a = Math.round(color.a * stopOpacity)
				stops.push({ offset, color })
			}
		}
	}

	return stops.sort((a, b) => a.offset - b.offset)
}

function parsePattern(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	const pattern: SvgPattern = {
		type: 'pattern',
		id,
		x: parseFloat(node.attrs.x || '0'),
		y: parseFloat(node.attrs.y || '0'),
		width: parseFloat(node.attrs.width || '0'),
		height: parseFloat(node.attrs.height || '0'),
		patternUnits: (node.attrs.patternUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'objectBoundingBox',
		patternContentUnits: (node.attrs.patternContentUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'userSpaceOnUse',
		patternTransform: node.attrs.patternTransform ? parseTransform(node.attrs.patternTransform) : undefined,
		elements: [],
	}

	for (const child of node.children) {
		const el = parseElement(child, new Map(), defs)
		if (el) pattern.elements.push(el)
	}

	defs.patterns.set(id, pattern)
}

function parseClipPath(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	const clipPath: SvgClipPath = {
		type: 'clipPath',
		clipPathUnits: (node.attrs.clipPathUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'userSpaceOnUse',
		children: [],
	}

	for (const child of node.children) {
		const el = parseElement(child, new Map(), defs)
		if (el) clipPath.children.push(el)
	}

	defs.clipPaths.set(id, clipPath)
}

function parseMaskDef(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	const mask: SvgMask = {
		type: 'mask',
		x: parseFloat(node.attrs.x || '-10%'),
		y: parseFloat(node.attrs.y || '-10%'),
		width: parseFloat(node.attrs.width || '120%'),
		height: parseFloat(node.attrs.height || '120%'),
		maskUnits: (node.attrs.maskUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'objectBoundingBox',
		maskContentUnits: (node.attrs.maskContentUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'userSpaceOnUse',
		children: [],
	}

	for (const child of node.children) {
		const el = parseElement(child, new Map(), defs)
		if (el) mask.children.push(el)
	}

	defs.masks.set(id, mask)
}

function parseFilterDef(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	const filter: SvgFilter = {
		type: 'filter',
		id,
		x: parseFloat(node.attrs.x || '-10%'),
		y: parseFloat(node.attrs.y || '-10%'),
		width: parseFloat(node.attrs.width || '120%'),
		height: parseFloat(node.attrs.height || '120%'),
		filterUnits: (node.attrs.filterUnits as 'userSpaceOnUse' | 'objectBoundingBox') || 'objectBoundingBox',
		primitives: [],
	}

	for (const child of node.children) {
		const primitive = parseFilterPrimitive(child)
		if (primitive) filter.primitives.push(primitive)
	}

	defs.filters.set(id, filter)
}

function parseFilterPrimitive(node: XmlNode): SvgFilterPrimitive | null {
	switch (node.tag) {
		case 'feGaussianBlur':
			return {
				type: 'feGaussianBlur',
				in: node.attrs.in,
				result: node.attrs.result,
				stdDeviation: parseFloat(node.attrs.stdDeviation || '0'),
			}
		case 'feOffset':
			return {
				type: 'feOffset',
				in: node.attrs.in,
				result: node.attrs.result,
				dx: parseFloat(node.attrs.dx || '0'),
				dy: parseFloat(node.attrs.dy || '0'),
			}
		case 'feBlend':
			return {
				type: 'feBlend',
				in: node.attrs.in,
				in2: node.attrs.in2,
				result: node.attrs.result,
				mode: (node.attrs.mode as any) || 'normal',
			}
		case 'feColorMatrix':
			return {
				type: 'feColorMatrix',
				in: node.attrs.in,
				result: node.attrs.result,
				matrixType: (node.attrs.type as any) || 'matrix',
				values: (node.attrs.values || '').split(/\s+/).map(Number),
			}
		case 'feFlood': {
			const color = parseColor(node.attrs['flood-color']) || { r: 0, g: 0, b: 0, a: 255 }
			return {
				type: 'feFlood',
				result: node.attrs.result,
				floodColor: color,
				floodOpacity: parseFloat(node.attrs['flood-opacity'] || '1'),
			}
		}
		case 'feMerge':
			return {
				type: 'feMerge',
				result: node.attrs.result,
				nodes: node.children
					.filter(c => c.tag === 'feMergeNode')
					.map(c => c.attrs.in || 'SourceGraphic'),
			}
		default:
			return null
	}
}

function parseSymbolDef(node: XmlNode, defs: SvgDefs): void {
	const id = node.attrs.id
	if (!id) return

	let viewBox: SvgSymbol['viewBox']
	if (node.attrs.viewBox) {
		const parts = node.attrs.viewBox.split(/[\s,]+/).map(Number)
		if (parts.length >= 4) {
			viewBox = { x: parts[0]!, y: parts[1]!, width: parts[2]!, height: parts[3]! }
		}
	}

	const symbol: SvgSymbol = {
		type: 'symbol',
		id,
		viewBox,
		preserveAspectRatio: node.attrs.preserveAspectRatio,
		children: [],
	}

	for (const child of node.children) {
		const el = parseElement(child, new Map(), defs)
		if (el) symbol.children.push(el)
	}

	defs.symbols.set(id, symbol)
}

// ─────────────────────────────────────────────────────────────────────────────
// Element Parser
// ─────────────────────────────────────────────────────────────────────────────

function parseElement(
	node: XmlNode,
	styles: Map<string, CssProperties>,
	defs: SvgDefs
): SvgElement | null {
	// Apply CSS styles
	const cssProps = applyCssStyles(node, styles)
	const base = parseBaseAttributes(node.attrs, cssProps)

	switch (node.tag) {
		case 'rect':
			return parseRect(node, base)
		case 'circle':
			return parseCircle(node, base)
		case 'ellipse':
			return parseEllipse(node, base)
		case 'line':
			return parseLine(node, base)
		case 'polyline':
			return parsePolyline(node, base)
		case 'polygon':
			return parsePolygon(node, base)
		case 'path':
			return parsePath(node, base)
		case 'text':
			return parseText(node, base, styles, defs)
		case 'g':
			return parseGroup(node, base, styles, defs)
		case 'use':
			return parseUse(node, base)
		case 'image':
			return parseImage(node, base)
		default:
			return null
	}
}

function applyCssStyles(node: XmlNode, styles: Map<string, CssProperties>): CssProperties {
	const result: CssProperties = {}

	// Apply class styles
	if (node.attrs.class) {
		const classes = node.attrs.class.split(/\s+/)
		for (const cls of classes) {
			const classStyles = styles.get(`.${cls}`)
			if (classStyles) Object.assign(result, classStyles)
		}
	}

	// Apply id styles
	if (node.attrs.id) {
		const idStyles = styles.get(`#${node.attrs.id}`)
		if (idStyles) Object.assign(result, idStyles)
	}

	// Apply tag styles
	const tagStyles = styles.get(node.tag)
	if (tagStyles) Object.assign(result, tagStyles)

	// Apply inline styles (highest priority)
	const inline = parseInlineStyle(node.attrs.style)
	Object.assign(result, inline)

	return result
}

function parseBaseAttributes(attrs: Record<string, string>, cssProps: CssProperties) {
	const fill = cssProps.fill ?? attrs.fill
	const stroke = cssProps.stroke ?? attrs.stroke
	const fillRule = cssProps.fillRule ?? attrs['fill-rule']
	const fillOpacity = cssProps.fillOpacity ?? attrs['fill-opacity']
	const strokeWidth = cssProps.strokeWidth ?? attrs['stroke-width']
	const strokeLinecap = cssProps.strokeLinecap ?? attrs['stroke-linecap']
	const strokeLinejoin = cssProps.strokeLinejoin ?? attrs['stroke-linejoin']
	const strokeOpacity = cssProps.strokeOpacity ?? attrs['stroke-opacity']
	const opacity = cssProps.opacity ?? attrs.opacity

	return {
		id: attrs.id,
		// Don't default to black - let renderer use inherited or default
		fill: fill ? parsePaint(fill) : undefined,
		fillRule: fillRule ? (fillRule as 'nonzero' | 'evenodd') : undefined,
		fillOpacity: fillOpacity ? parseFloat(fillOpacity) : undefined,
		stroke: stroke ? parsePaint(stroke) : undefined,
		strokeWidth: strokeWidth ? parseFloat(strokeWidth) : undefined,
		strokeLinecap: strokeLinecap ? (strokeLinecap as StrokeLinecap) : undefined,
		strokeLinejoin: strokeLinejoin ? (strokeLinejoin as StrokeLinejoin) : undefined,
		strokeMiterLimit: parseFloat(cssProps.strokeMiterLimit ?? attrs['stroke-miterlimit'] ?? '4'),
		strokeDasharray: parseDasharray(cssProps.strokeDasharray ?? attrs['stroke-dasharray']),
		strokeDashoffset: parseFloat(cssProps.strokeDashoffset ?? attrs['stroke-dashoffset'] ?? '0'),
		strokeOpacity: strokeOpacity ? parseFloat(strokeOpacity) : undefined,
		opacity: opacity ? parseFloat(opacity) : undefined,
		transform: attrs.transform ? parseTransform(attrs.transform) : undefined,
		clipPath: parseUrlRef(cssProps.clipPath ?? attrs['clip-path']),
		mask: parseUrlRef(cssProps.mask ?? attrs.mask),
		display: (cssProps.display ?? attrs.display) as 'none' | 'inline' | 'block' | undefined,
		visibility: (cssProps.visibility ?? attrs.visibility) as 'visible' | 'hidden' | 'collapse' | undefined,
	}
}

function parseDasharray(value: string | undefined): number[] | undefined {
	if (!value || value === 'none') return undefined
	return value.split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
}

function parseUrlRef(value: string | undefined): string | undefined {
	if (!value) return undefined
	const match = value.match(/url\(#([^)]+)\)/)
	return match ? match[1] : undefined
}

function parseRect(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgRect {
	return {
		type: 'rect',
		...base,
		x: parseFloat(node.attrs.x || '0'),
		y: parseFloat(node.attrs.y || '0'),
		width: parseFloat(node.attrs.width || '0'),
		height: parseFloat(node.attrs.height || '0'),
		rx: node.attrs.rx ? parseFloat(node.attrs.rx) : undefined,
		ry: node.attrs.ry ? parseFloat(node.attrs.ry) : undefined,
	}
}

function parseCircle(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgCircle {
	return {
		type: 'circle',
		...base,
		cx: parseFloat(node.attrs.cx || '0'),
		cy: parseFloat(node.attrs.cy || '0'),
		r: parseFloat(node.attrs.r || '0'),
	}
}

function parseEllipse(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgEllipse {
	return {
		type: 'ellipse',
		...base,
		cx: parseFloat(node.attrs.cx || '0'),
		cy: parseFloat(node.attrs.cy || '0'),
		rx: parseFloat(node.attrs.rx || '0'),
		ry: parseFloat(node.attrs.ry || '0'),
	}
}

function parseLine(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgLine {
	return {
		type: 'line',
		...base,
		x1: parseFloat(node.attrs.x1 || '0'),
		y1: parseFloat(node.attrs.y1 || '0'),
		x2: parseFloat(node.attrs.x2 || '0'),
		y2: parseFloat(node.attrs.y2 || '0'),
	}
}

function parsePoints(str: string): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = []
	const values = str.trim().split(/[\s,]+/).map(Number)

	for (let i = 0; i < values.length - 1; i += 2) {
		points.push({ x: values[i]!, y: values[i + 1]! })
	}

	return points
}

function parsePolyline(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgPolyline {
	return {
		type: 'polyline',
		...base,
		points: parsePoints(node.attrs.points || ''),
	}
}

function parsePolygon(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgPolygon {
	return {
		type: 'polygon',
		...base,
		points: parsePoints(node.attrs.points || ''),
	}
}

function parsePath(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgPath {
	const d = node.attrs.d || ''
	return {
		type: 'path',
		...base,
		d,
		commands: parsePathCommands(d),
	}
}

function parseText(
	node: XmlNode,
	base: ReturnType<typeof parseBaseAttributes>,
	styles: Map<string, CssProperties>,
	defs: SvgDefs
): SvgText {
	const cssProps = applyCssStyles(node, styles)

	const children: Array<SvgTspan | string> = []

	// Parse text content and tspan children
	if (node.text) {
		children.push(node.text)
	}

	for (const child of node.children) {
		if (child.tag === 'tspan') {
			const tspan = parseTspan(child, base, styles)
			children.push(tspan)
		} else if (child.text) {
			children.push(child.text)
		}
	}

	return {
		type: 'text',
		...base,
		x: parseFloat(node.attrs.x || '0'),
		y: parseFloat(node.attrs.y || '0'),
		dx: node.attrs.dx ? parseFloat(node.attrs.dx) : undefined,
		dy: node.attrs.dy ? parseFloat(node.attrs.dy) : undefined,
		textAnchor: (cssProps.textAnchor ?? node.attrs['text-anchor']) as 'start' | 'middle' | 'end' | undefined,
		dominantBaseline: (cssProps.dominantBaseline ?? node.attrs['dominant-baseline']) as any,
		fontSize: parseFloat(cssProps.fontSize ?? node.attrs['font-size'] ?? '16'),
		fontFamily: cssProps.fontFamily ?? node.attrs['font-family'],
		fontWeight: parseFontWeight(cssProps.fontWeight ?? node.attrs['font-weight']),
		fontStyle: (cssProps.fontStyle ?? node.attrs['font-style']) as 'normal' | 'italic' | 'oblique' | undefined,
		letterSpacing: cssProps.letterSpacing ? parseFloat(cssProps.letterSpacing) : undefined,
		children,
	}
}

function parseTspan(
	node: XmlNode,
	parentBase: ReturnType<typeof parseBaseAttributes>,
	styles: Map<string, CssProperties>
): SvgTspan {
	const cssProps = applyCssStyles(node, styles)

	return {
		type: 'tspan',
		...parentBase,
		x: node.attrs.x ? parseFloat(node.attrs.x) : undefined,
		y: node.attrs.y ? parseFloat(node.attrs.y) : undefined,
		dx: node.attrs.dx ? parseFloat(node.attrs.dx) : undefined,
		dy: node.attrs.dy ? parseFloat(node.attrs.dy) : undefined,
		fontSize: cssProps.fontSize ? parseFloat(cssProps.fontSize) : undefined,
		fontFamily: cssProps.fontFamily ?? node.attrs['font-family'],
		fontWeight: parseFontWeight(cssProps.fontWeight ?? node.attrs['font-weight']),
		text: node.text || '',
	}
}

function parseFontWeight(value: string | undefined): 'normal' | 'bold' | number | undefined {
	if (!value) return undefined
	if (value === 'normal' || value === 'bold') return value
	const num = parseInt(value, 10)
	return isNaN(num) ? undefined : num
}

function parseGroup(
	node: XmlNode,
	base: ReturnType<typeof parseBaseAttributes>,
	styles: Map<string, CssProperties>,
	defs: SvgDefs
): SvgGroup {
	const children: SvgElement[] = []

	for (const child of node.children) {
		const el = parseElement(child, styles, defs)
		if (el) children.push(el)
	}

	return {
		type: 'group',
		...base,
		children,
	}
}

function parseUse(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgUse {
	const href = node.attrs.href || node.attrs['xlink:href'] || ''

	return {
		type: 'use',
		...base,
		x: parseFloat(node.attrs.x || '0'),
		y: parseFloat(node.attrs.y || '0'),
		width: node.attrs.width ? parseFloat(node.attrs.width) : undefined,
		height: node.attrs.height ? parseFloat(node.attrs.height) : undefined,
		href: href.replace('#', ''),
	}
}

function parseImage(node: XmlNode, base: ReturnType<typeof parseBaseAttributes>): SvgImage {
	const href = node.attrs.href || node.attrs['xlink:href'] || ''

	return {
		type: 'image',
		...base,
		x: parseFloat(node.attrs.x || '0'),
		y: parseFloat(node.attrs.y || '0'),
		width: parseFloat(node.attrs.width || '0'),
		height: parseFloat(node.attrs.height || '0'),
		href,
		preserveAspectRatio: node.attrs.preserveAspectRatio,
	}
}
