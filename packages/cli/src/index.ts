#!/usr/bin/env node
/**
 * mconv CLI - Universal media converter
 * Pure TypeScript, zero external dependencies
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
	detectFormat,
	getExtension,
	getMimeType,
	isImageFormat,
	type ImageData,
	type ImageFormat,
	type ResizeOptions,
} from '../../core/src/index'
import * as codecs from '../../codecs/src/index'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CliOptions {
	// Output
	to?: string
	out?: string
	overwrite?: boolean

	// Transform
	width?: number
	height?: number
	resize?: string
	fit?: 'fill' | 'contain' | 'cover' | 'inside' | 'outside'

	// Quality
	quality?: number

	// Flags
	verbose?: boolean
	quiet?: boolean
	dryRun?: boolean

	// Commands
	info?: boolean
	formats?: boolean
	help?: boolean
	version?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const VERSION = '0.1.0'

const SUPPORTED_FORMATS = {
	image: {
		decode: ['png', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'ico', 'tga', 'qoi', 'pcx', 'hdr', 'ppm', 'pgm', 'pbm', 'pam', 'pfm', 'sgi', 'sun', 'farbfeld', 'xbm', 'xpm', 'dds', 'ktx', 'pvr', 'vtf', 'pix', 'exr', 'psd', 'ilbm', 'cur', 'ani', 'wbmp', 'svg'],
		encode: ['png', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'ico', 'tga', 'qoi', 'pcx', 'hdr', 'ppm', 'pgm', 'pbm', 'pam', 'pfm', 'sgi', 'sun', 'farbfeld', 'xbm', 'xpm', 'exr', 'ilbm', 'cur', 'ani', 'wbmp'],
	},
	video: {
		decode: ['mjpeg', 'y4m', 'yuv', 'avi', 'flv', 'mp4', 'mkv', 'ts', 'ps', 'flic', 'mng'],
		encode: ['mjpeg', 'y4m', 'yuv', 'avi', 'flv', 'mp4', 'mkv', 'ts', 'ps', 'flic', 'mng'],
	},
	audio: {
		decode: ['wav', 'aiff', 'au', 'flac', 'ogg', 'midi'],
		encode: ['wav', 'aiff', 'au', 'flac', 'ogg', 'midi'],
	},
	subtitle: {
		decode: ['srt', 'vtt', 'ass', 'ssa'],
		encode: ['srt', 'vtt', 'ass', 'ssa'],
	},
	playlist: {
		decode: ['m3u8', 'cue'],
		encode: ['m3u8', 'cue'],
	},
}

const HELP = `
mconv - Universal media converter (Pure TypeScript)

USAGE:
  mconv <input> [output]              Convert single file (file or URL)
  mconv <pattern> --to <format>       Batch convert files
  mconv --info <file|url>             Show file info
  mconv --formats                     List supported formats

INPUT:
  - Local file path: photo.jpg, ./images/pic.png
  - URL: https://example.com/image.jpg
  - Glob pattern: "*.jpg", "images/**/*.png"

OPTIONS:
  -t, --to <format>     Output format (png, jpeg, webp, gif, bmp, etc.)
  -o, --out <dir>       Output directory for batch conversion
  -w, --width <px>      Resize width
  -h, --height <px>     Resize height
  -r, --resize <WxH>    Resize dimensions (e.g., 800x600)
  -f, --fit <mode>      Resize fit: fill, contain, cover, inside, outside
  -q, --quality <1-100> Output quality (for lossy formats)
  --overwrite           Overwrite existing files
  --dry-run             Show what would be done without doing it
  -v, --verbose         Verbose output
  --quiet               Suppress output
  --help                Show this help
  --version             Show version

EXAMPLES:
  mconv photo.jpg photo.png                    # Convert JPEG to PNG
  mconv photo.jpg --to webp                    # Convert to WebP (auto name)
  mconv "*.jpg" --to png                       # Batch convert all JPEGs
  mconv "images/**/*.png" --to webp -o out/    # Recursive batch
  mconv photo.jpg -r 800x600                   # Resize to 800x600
  mconv photo.jpg -w 800 --fit contain         # Resize width, maintain aspect
  mconv photo.jpg --to jpeg -q 85              # JPEG at 85% quality
  mconv --info photo.jpg                       # Show format info
  mconv https://example.com/img.png out.jpg    # Convert from URL

`

// ─────────────────────────────────────────────────────────────────────────────
// URL Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if input is a URL
 */
function isUrl(input: string): boolean {
	return input.startsWith('http://') || input.startsWith('https://')
}

/**
 * Fetch data from URL
 */
async function fetchUrl(url: string): Promise<Uint8Array> {
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
	}
	const buffer = await response.arrayBuffer()
	return new Uint8Array(buffer)
}

/**
 * Get filename from URL
 */
function getFilenameFromUrl(url: string): string {
	try {
		const urlObj = new URL(url)
		const pathname = urlObj.pathname
		const filename = pathname.split('/').pop() || 'download'
		return filename
	} catch {
		return 'download'
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument Parser
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(args: string[]): { inputs: string[]; options: CliOptions } {
	const inputs: string[] = []
	const options: CliOptions = {}

	let i = 0
	while (i < args.length) {
		const arg = args[i]!

		if (arg === '--help' || arg === '-?') {
			options.help = true
		} else if (arg === '--version' || arg === '-V') {
			options.version = true
		} else if (arg === '--formats') {
			options.formats = true
		} else if (arg === '--info' || arg === '-i') {
			options.info = true
		} else if (arg === '--verbose' || arg === '-v') {
			options.verbose = true
		} else if (arg === '--quiet') {
			options.quiet = true
		} else if (arg === '--dry-run') {
			options.dryRun = true
		} else if (arg === '--overwrite') {
			options.overwrite = true
		} else if ((arg === '--to' || arg === '-t') && args[i + 1]) {
			options.to = args[++i]
		} else if ((arg === '--out' || arg === '-o') && args[i + 1]) {
			options.out = args[++i]
		} else if ((arg === '--width' || arg === '-w') && args[i + 1]) {
			options.width = parseInt(args[++i]!, 10)
		} else if ((arg === '--height' || arg === '-h') && args[i + 1]) {
			options.height = parseInt(args[++i]!, 10)
		} else if ((arg === '--resize' || arg === '-r') && args[i + 1]) {
			options.resize = args[++i]
		} else if ((arg === '--fit' || arg === '-f') && args[i + 1]) {
			options.fit = args[++i] as CliOptions['fit']
		} else if ((arg === '--quality' || arg === '-q') && args[i + 1]) {
			options.quality = parseInt(args[++i]!, 10)
		} else if (!arg.startsWith('-')) {
			inputs.push(arg)
		} else {
			console.error(`Unknown option: ${arg}`)
			process.exit(1)
		}

		i++
	}

	return { inputs, options }
}

// ─────────────────────────────────────────────────────────────────────────────
// Glob Pattern Matching
// ─────────────────────────────────────────────────────────────────────────────

function matchGlob(pattern: string, str: string): boolean {
	const regexPattern = pattern
		.replace(/\./g, '\\.')
		.replace(/\*\*/g, '<<<GLOBSTAR>>>')
		.replace(/\*/g, '[^/]*')
		.replace(/<<<GLOBSTAR>>>/g, '.*')
		.replace(/\?/g, '.')

	return new RegExp(`^${regexPattern}$`).test(str)
}

function expandGlob(pattern: string, baseDir: string = '.'): string[] {
	const results: string[] = []

	// Check if pattern contains glob characters
	if (!pattern.includes('*') && !pattern.includes('?')) {
		// Not a glob, just return the file if it exists
		const fullPath = resolve(baseDir, pattern)
		if (existsSync(fullPath) && statSync(fullPath).isFile()) {
			return [fullPath]
		}
		return []
	}

	// Find the base directory (non-glob part) and the glob pattern
	const parts = pattern.split('/')
	const baseParts: string[] = []
	const patternParts: string[] = []
	let foundGlob = false

	for (const part of parts) {
		if (foundGlob || part.includes('*') || part.includes('?')) {
			foundGlob = true
			patternParts.push(part)
		} else {
			baseParts.push(part)
		}
	}

	const resolvedBase = baseParts.length > 0
		? resolve(baseParts.join('/'))
		: resolve(baseDir)

	const filePattern = patternParts.join('/')
	const isRecursive = filePattern.includes('**')

	function walk(dir: string, depth: number = 0): void {
		if (!existsSync(dir)) return

		const entries = readdirSync(dir, { withFileTypes: true })

		for (const entry of entries) {
			const fullPath = join(dir, entry.name)
			const relativePath = fullPath.slice(resolvedBase.length + 1)

			if (entry.isDirectory()) {
				if (isRecursive) {
					// For **, recurse into all directories
					walk(fullPath, depth + 1)
				}
			} else if (entry.isFile()) {
				// Check if file matches the pattern
				if (matchGlob(filePattern, relativePath)) {
					results.push(fullPath)
				}
			}
		}
	}

	walk(resolvedBase)
	return results.sort()
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Utils
// ─────────────────────────────────────────────────────────────────────────────

function getFormatFromExtension(filepath: string): string | null {
	const ext = extname(filepath).toLowerCase().slice(1)
	const extMap: Record<string, string> = {
		jpg: 'jpeg',
		tif: 'tiff',
		ff: 'farbfeld',
		ras: 'sun',
		rs: 'sun',
		sgi: 'sgi',
		rgb: 'sgi',
		rgba: 'sgi',
		bw: 'sgi',
		exr: 'exr',
		psd: 'psd',
		iff: 'ilbm',
		lbm: 'ilbm',
		fli: 'flic',
		flc: 'flic',
		m4v: 'mp4',
		webm: 'mkv',
		mpg: 'ps',
		mpeg: 'ps',
		vob: 'ps',
		mts: 'ts',
		m2ts: 'ts',
	}
	return extMap[ext] ?? ext
}

function formatToExtension(format: string): string {
	const extMap: Record<string, string> = {
		jpeg: 'jpg',
		tiff: 'tif',
		farbfeld: 'ff',
		sun: 'ras',
		flic: 'fli',
	}
	return extMap[format] ?? format
}

// ─────────────────────────────────────────────────────────────────────────────
// Image Loading/Saving
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Codec registry for image formats
 * Note: Some codecs are classes that need instantiation
 */
const sgiCodec = new codecs.SGICodec()
const xbmCodec = new codecs.XBMCodec()
const xpmCodec = new codecs.XPMCodec()
const pamCodec = new codecs.PAMCodec()
const pfmCodec = new codecs.PFMCodec()
const wbmpCodec = new codecs.WBMPCodec()

/**
 * SVG codec wrapper (decode-only)
 */
const svgCodec = {
	decode: (data: Uint8Array): ImageData => codecs.decodeSvg(data),
	encode: () => { throw new Error('SVG encoding not supported') },
}

const imageCodecs: Record<string, { decode: (data: Uint8Array) => ImageData; encode: (data: ImageData, options?: { quality?: number }) => Uint8Array }> = {
	bmp: codecs.BmpCodec,
	svg: svgCodec,
	gif: codecs.GifCodec,
	hdr: codecs.HdrCodec,
	ico: codecs.IcoCodec,
	jpeg: codecs.JpegCodec,
	pbm: codecs.PbmCodec,
	pcx: codecs.PcxCodec,
	pgm: codecs.PgmCodec,
	png: codecs.PngCodec,
	ppm: codecs.PpmCodec,
	qoi: codecs.QoiCodec,
	tga: codecs.TgaCodec,
	tiff: codecs.TiffCodec,
	webp: codecs.WebPCodec,
	farbfeld: codecs.FarbfeldCodec,
	sgi: sgiCodec,
	sun: codecs.SunRasterCodec,
	xbm: xbmCodec,
	xpm: xpmCodec,
	pam: pamCodec,
	pfm: pfmCodec,
	wbmp: wbmpCodec,
}

/**
 * Load image from binary data (auto-detect format)
 */
function loadImage(data: Uint8Array): ImageData {
	// Check for SVG first (text-based format)
	if (codecs.isSvg(data)) {
		return codecs.decodeSvg(data)
	}

	const format = detectFormat(data)
	if (!format) {
		throw new Error('Unknown image format')
	}
	const codec = imageCodecs[format]
	if (!codec) {
		throw new Error(`Unsupported format: ${format}`)
	}
	return codec.decode(data)
}

/**
 * Save image to binary data
 */
function saveImage(image: ImageData, format: string, options?: { quality?: number }): Uint8Array {
	const codec = imageCodecs[format]
	if (!codec) {
		throw new Error(`Unsupported output format: ${format}`)
	}
	return codec.encode(image, options)
}

/**
 * Resize image (bilinear interpolation)
 */
function resizeImage(image: ImageData, options: ResizeOptions): ImageData {
	const { width: srcWidth, height: srcHeight, data: srcData } = image

	let targetWidth = options.width ?? srcWidth
	let targetHeight = options.height ?? srcHeight

	const fit = options.fit ?? 'fill'

	if (fit !== 'fill' && options.width && options.height) {
		const srcAspect = srcWidth / srcHeight
		const targetAspect = options.width / options.height

		switch (fit) {
			case 'contain':
				if (srcAspect > targetAspect) {
					targetHeight = Math.round(options.width / srcAspect)
				} else {
					targetWidth = Math.round(options.height * srcAspect)
				}
				break

			case 'cover':
				if (srcAspect > targetAspect) {
					targetWidth = Math.round(options.height * srcAspect)
				} else {
					targetHeight = Math.round(options.width / srcAspect)
				}
				break

			case 'inside':
				if (srcWidth > options.width || srcHeight > options.height) {
					if (srcAspect > targetAspect) {
						targetWidth = options.width
						targetHeight = Math.round(options.width / srcAspect)
					} else {
						targetHeight = options.height
						targetWidth = Math.round(options.height * srcAspect)
					}
				} else {
					targetWidth = srcWidth
					targetHeight = srcHeight
				}
				break

			case 'outside':
				if (srcWidth < options.width || srcHeight < options.height) {
					if (srcAspect > targetAspect) {
						targetHeight = options.height
						targetWidth = Math.round(options.height * srcAspect)
					} else {
						targetWidth = options.width
						targetHeight = Math.round(options.width / srcAspect)
					}
				} else {
					targetWidth = srcWidth
					targetHeight = srcHeight
				}
				break
		}
	}

	if (targetWidth === srcWidth && targetHeight === srcHeight) {
		return image
	}

	const dstData = new Uint8Array(targetWidth * targetHeight * 4)
	const xScale = srcWidth / targetWidth
	const yScale = srcHeight / targetHeight

	for (let dstY = 0; dstY < targetHeight; dstY++) {
		for (let dstX = 0; dstX < targetWidth; dstX++) {
			const srcX = dstX * xScale
			const srcY = dstY * yScale

			const x0 = Math.floor(srcX)
			const y0 = Math.floor(srcY)
			const x1 = Math.min(x0 + 1, srcWidth - 1)
			const y1 = Math.min(y0 + 1, srcHeight - 1)

			const xFrac = srcX - x0
			const yFrac = srcY - y0

			const idx00 = (y0 * srcWidth + x0) * 4
			const idx10 = (y0 * srcWidth + x1) * 4
			const idx01 = (y1 * srcWidth + x0) * 4
			const idx11 = (y1 * srcWidth + x1) * 4

			const dstIdx = (dstY * targetWidth + dstX) * 4

			for (let c = 0; c < 4; c++) {
				const top = srcData[idx00 + c]! + (srcData[idx10 + c]! - srcData[idx00 + c]!) * xFrac
				const bottom = srcData[idx01 + c]! + (srcData[idx11 + c]! - srcData[idx01 + c]!) * xFrac
				dstData[dstIdx + c] = Math.round(top + (bottom - top) * yFrac)
			}
		}
	}

	return { width: targetWidth, height: targetHeight, data: dstData }
}

// ─────────────────────────────────────────────────────────────────────────────
// Commands
// ─────────────────────────────────────────────────────────────────────────────

function showHelp(): void {
	console.log(HELP)
}

function showVersion(): void {
	console.log(`mconv v${VERSION}`)
}

function showFormats(): void {
	console.log('\nSupported Formats:\n')

	console.log('IMAGE (decode):')
	console.log(`  ${SUPPORTED_FORMATS.image.decode.join(', ')}\n`)

	console.log('IMAGE (encode):')
	console.log(`  ${SUPPORTED_FORMATS.image.encode.join(', ')}\n`)

	console.log('VIDEO:')
	console.log(`  ${SUPPORTED_FORMATS.video.decode.join(', ')}\n`)

	console.log('AUDIO:')
	console.log(`  ${SUPPORTED_FORMATS.audio.decode.join(', ')}\n`)

	console.log('SUBTITLE:')
	console.log(`  ${SUPPORTED_FORMATS.subtitle.decode.join(', ')}\n`)

	console.log('PLAYLIST:')
	console.log(`  ${SUPPORTED_FORMATS.playlist.decode.join(', ')}\n`)
}

async function showInfo(input: string): Promise<void> {
	let data: Uint8Array
	let size: number
	let source: string

	if (isUrl(input)) {
		// Fetch from URL
		console.log(`\nFetching: ${input}`)
		data = await fetchUrl(input)
		size = data.length
		source = input
	} else {
		// Read from file
		if (!existsSync(input)) {
			console.error(`File not found: ${input}`)
			process.exit(1)
		}
		data = new Uint8Array(readFileSync(input))
		size = statSync(input).size
		source = input
	}

	const format = detectFormat(data)

	console.log(`\nSource: ${source}`)
	console.log(`Size: ${formatBytes(size)}`)
	console.log(`Format: ${format ?? 'unknown'}`)

	if (format) {
		console.log(`MIME: ${getMimeType(format)}`)
		console.log(`Extension: .${getExtension(format)}`)
	}

	// Try to decode and show dimensions
	if (format && isImageFormat(format)) {
		try {
			const image = loadImage(data)
			console.log(`Dimensions: ${image.width} x ${image.height}`)
			console.log(`Pixels: ${(image.width * image.height).toLocaleString()}`)
		} catch {
			// Ignore decode errors for info
		}
	}

	console.log()
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversion
// ─────────────────────────────────────────────────────────────────────────────

interface ConvertJob {
	input: string
	output: string
	format: string
	isUrl?: boolean
}

async function convertFile(
	job: ConvertJob,
	options: CliOptions
): Promise<{ success: boolean; error?: string }> {
	try {
		// Load data from URL or file
		let data: Uint8Array
		if (job.isUrl) {
			data = await fetchUrl(job.input)
		} else {
			data = new Uint8Array(readFileSync(job.input))
		}

		// Decode input
		let image = loadImage(data)

		// Apply resize if requested
		if (options.resize) {
			const [w, h] = options.resize.split('x').map(Number)
			image = resizeImage(image, { width: w, height: h, fit: options.fit })
		} else if (options.width || options.height) {
			image = resizeImage(image, { width: options.width, height: options.height, fit: options.fit })
		}

		// Encode output
		const result = saveImage(image, job.format, { quality: options.quality })

		// Ensure output directory exists
		const outDir = dirname(job.output)
		if (!existsSync(outDir)) {
			mkdirSync(outDir, { recursive: true })
		}

		// Write output
		writeFileSync(job.output, result)

		return { success: true }
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : String(err) }
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const { inputs, options } = parseArgs(process.argv.slice(2))

	// Handle commands
	if (options.help || (inputs.length === 0 && !options.formats && !options.version)) {
		showHelp()
		return
	}

	if (options.version) {
		showVersion()
		return
	}

	if (options.formats) {
		showFormats()
		return
	}

	if (options.info) {
		if (inputs.length === 0) {
			console.error('Error: --info requires a file path or URL')
			process.exit(1)
		}
		for (const input of inputs) {
			await showInfo(input)
		}
		return
	}

	// Build job list
	const jobs: ConvertJob[] = []

	// Check if first input is a URL
	const inputIsUrl = isUrl(inputs[0] ?? '')

	// Check if second input is an output path (single file mode)
	const isSingleFile = inputs.length === 2 && !inputs[0]!.includes('*') && !inputs[1]!.includes('*')

	if (isSingleFile) {
		const inputPath = inputs[0]!
		const outputPath = resolve(inputs[1]!)

		if (inputIsUrl) {
			// URL input
			const format = options.to ?? getFormatFromExtension(outputPath) ?? 'png'
			jobs.push({ input: inputPath, output: outputPath, format, isUrl: true })
		} else {
			// File input
			const resolvedInput = resolve(inputPath)
			if (!existsSync(resolvedInput)) {
				console.error(`File not found: ${resolvedInput}`)
				process.exit(1)
			}
			const format = options.to ?? getFormatFromExtension(outputPath) ?? 'png'
			jobs.push({ input: resolvedInput, output: outputPath, format })
		}
	} else if (inputIsUrl) {
		// Single URL without output path
		const url = inputs[0]!
		const format = options.to
		if (!format) {
			console.error('Error: --to <format> is required when converting from URL without output path')
			process.exit(1)
		}
		const filename = getFilenameFromUrl(url)
		const baseName = filename.replace(/\.[^.]+$/, '') || 'download'
		const ext = formatToExtension(format)
		const outputPath = resolve(options.out ?? '.', `${baseName}.${ext}`)
		jobs.push({ input: url, output: outputPath, format, isUrl: true })
	} else {
		// Batch mode
		const pattern = inputs[0]
		if (!pattern) {
			console.error('Error: No input files specified')
			process.exit(1)
		}

		const files = expandGlob(pattern)

		if (files.length === 0) {
			console.error(`No files matched: ${pattern}`)
			process.exit(1)
		}

		const format = options.to
		if (!format) {
			console.error('Error: --to <format> is required for batch conversion')
			process.exit(1)
		}

		const outDir = options.out ? resolve(options.out) : null

		for (const inputPath of files) {
			const baseName = basename(inputPath, extname(inputPath))
			const ext = formatToExtension(format)

			let outputPath: string
			if (outDir) {
				outputPath = join(outDir, `${baseName}.${ext}`)
			} else {
				outputPath = join(dirname(inputPath), `${baseName}.${ext}`)
			}

			// Skip if same file
			if (resolve(inputPath) === resolve(outputPath) && !options.overwrite) {
				if (!options.quiet) {
					console.log(`Skip: ${inputPath} (same as output)`)
				}
				continue
			}

			// Skip if output exists and no overwrite
			if (existsSync(outputPath) && !options.overwrite) {
				if (!options.quiet) {
					console.log(`Skip: ${outputPath} (exists, use --overwrite)`)
				}
				continue
			}

			jobs.push({ input: inputPath, output: outputPath, format })
		}
	}

	if (jobs.length === 0) {
		console.log('No files to convert')
		return
	}

	// Dry run
	if (options.dryRun) {
		console.log('\nDry run - would convert:\n')
		for (const job of jobs) {
			console.log(`  ${job.input}`)
			console.log(`  → ${job.output} (${job.format})\n`)
		}
		return
	}

	// Execute jobs
	let success = 0
	let failed = 0

	for (const job of jobs) {
		if (!options.quiet) {
			if (options.verbose) {
				console.log(`Converting: ${job.input}`)
				console.log(`       → ${job.output}`)
			} else {
				console.log(`${basename(job.input)} → ${basename(job.output)}`)
			}
		}

		const result = await convertFile(job, options)

		if (result.success) {
			success++
			if (options.verbose && !options.quiet) {
				const outStats = statSync(job.output)
				console.log(`       Size: ${formatBytes(outStats.size)}`)
			}
		} else {
			failed++
			if (!options.quiet) {
				console.error(`  Error: ${result.error}`)
			}
		}
	}

	// Summary
	if (!options.quiet && jobs.length > 1) {
		console.log(`\nDone: ${success} converted, ${failed} failed`)
	}

	if (failed > 0) {
		process.exit(1)
	}
}

main().catch((err) => {
	console.error('Fatal error:', err)
	process.exit(1)
})
