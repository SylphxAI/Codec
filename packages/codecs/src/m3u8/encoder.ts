/**
 * M3U8/HLS playlist encoder (generator)
 * Creates both master and media playlists
 */

import type {
	M3u8Key,
	M3u8Map,
	M3u8MasterEncodeOptions,
	M3u8MasterPlaylist,
	M3u8MediaEncodeOptions,
	M3u8MediaPlaylist,
	M3u8Rendition,
	M3u8Segment,
	M3u8Variant,
} from './types'

/**
 * Encode media playlist
 */
export function encodeM3u8Media(
	segments: M3u8Segment[],
	options: M3u8MediaEncodeOptions = {}
): string {
	const {
		version = 3,
		targetDuration = Math.ceil(Math.max(...segments.map(s => s.duration), 1)),
		mediaSequence = 0,
		playlistType,
		endList = true,
	} = options

	const lines: string[] = [
		'#EXTM3U',
		`#EXT-X-VERSION:${version}`,
		`#EXT-X-TARGETDURATION:${targetDuration}`,
		`#EXT-X-MEDIA-SEQUENCE:${mediaSequence}`,
	]

	if (playlistType) {
		lines.push(`#EXT-X-PLAYLIST-TYPE:${playlistType}`)
	}

	let currentKey: M3u8Key | undefined
	let currentMap: M3u8Map | undefined

	for (const segment of segments) {
		// Add discontinuity tag
		if (segment.discontinuity) {
			lines.push('#EXT-X-DISCONTINUITY')
		}

		// Add key if changed
		if (segment.key && !keysEqual(segment.key, currentKey)) {
			lines.push(formatKey(segment.key))
			currentKey = segment.key
		}

		// Add map if changed
		if (segment.map && !mapsEqual(segment.map, currentMap)) {
			lines.push(formatMap(segment.map))
			currentMap = segment.map
		}

		// Add program date time
		if (segment.programDateTime) {
			lines.push(`#EXT-X-PROGRAM-DATE-TIME:${segment.programDateTime.toISOString()}`)
		}

		// Add byte range
		if (segment.byteRange) {
			const br = segment.byteRange
			lines.push(`#EXT-X-BYTERANGE:${br.length}${br.offset !== undefined ? `@${br.offset}` : ''}`)
		}

		// Add duration and optional title
		const title = segment.title || ''
		lines.push(`#EXTINF:${segment.duration.toFixed(6)},${title}`)

		// Add URI
		lines.push(segment.uri)
	}

	if (endList) {
		lines.push('#EXT-X-ENDLIST')
	}

	return lines.join('\n') + '\n'
}

/**
 * Encode master playlist
 */
export function encodeM3u8Master(
	variants: M3u8Variant[],
	renditions: M3u8Rendition[] = [],
	options: M3u8MasterEncodeOptions = {}
): string {
	const {
		version = 3,
		independentSegments = false,
	} = options

	const lines: string[] = [
		'#EXTM3U',
		`#EXT-X-VERSION:${version}`,
	]

	if (independentSegments) {
		lines.push('#EXT-X-INDEPENDENT-SEGMENTS')
	}

	// Add renditions (alternative media)
	for (const rendition of renditions) {
		lines.push(formatRendition(rendition))
	}

	// Add variants
	for (const variant of variants) {
		lines.push(formatVariant(variant))
		lines.push(variant.uri)
	}

	return lines.join('\n') + '\n'
}

/**
 * Encode playlist (auto-detect type)
 */
export function encodeM3u8(playlist: M3u8MediaPlaylist | M3u8MasterPlaylist): string {
	if (playlist.type === 'master') {
		return encodeM3u8Master(
			playlist.variants,
			playlist.renditions,
			{
				version: playlist.version,
				independentSegments: playlist.independentSegments,
			}
		)
	} else {
		return encodeM3u8Media(
			playlist.segments,
			{
				version: playlist.version,
				targetDuration: playlist.targetDuration,
				mediaSequence: playlist.mediaSequence,
				playlistType: playlist.playlistType,
				endList: playlist.endList,
			}
		)
	}
}

/**
 * Format encryption key tag
 */
function formatKey(key: M3u8Key): string {
	const attrs: string[] = [`METHOD=${key.method}`]

	if (key.uri) {
		attrs.push(`URI="${key.uri}"`)
	}
	if (key.iv) {
		attrs.push(`IV=${key.iv}`)
	}
	if (key.keyFormat) {
		attrs.push(`KEYFORMAT="${key.keyFormat}"`)
	}
	if (key.keyFormatVersions) {
		attrs.push(`KEYFORMATVERSIONS="${key.keyFormatVersions}"`)
	}

	return `#EXT-X-KEY:${attrs.join(',')}`
}

/**
 * Format media map tag
 */
function formatMap(map: M3u8Map): string {
	const attrs: string[] = [`URI="${map.uri}"`]

	if (map.byteRange) {
		const br = map.byteRange
		attrs.push(`BYTERANGE="${br.length}${br.offset !== undefined ? `@${br.offset}` : ''}"`)
	}

	return `#EXT-X-MAP:${attrs.join(',')}`
}

/**
 * Format variant stream tag
 */
function formatVariant(variant: M3u8Variant): string {
	const attrs: string[] = [`BANDWIDTH=${variant.bandwidth}`]

	if (variant.averageBandwidth !== undefined) {
		attrs.push(`AVERAGE-BANDWIDTH=${variant.averageBandwidth}`)
	}
	if (variant.codecs) {
		attrs.push(`CODECS="${variant.codecs}"`)
	}
	if (variant.resolution) {
		attrs.push(`RESOLUTION=${variant.resolution.width}x${variant.resolution.height}`)
	}
	if (variant.frameRate !== undefined) {
		attrs.push(`FRAME-RATE=${variant.frameRate.toFixed(3)}`)
	}
	if (variant.hdcpLevel) {
		attrs.push(`HDCP-LEVEL=${variant.hdcpLevel}`)
	}
	if (variant.audio) {
		attrs.push(`AUDIO="${variant.audio}"`)
	}
	if (variant.video) {
		attrs.push(`VIDEO="${variant.video}"`)
	}
	if (variant.subtitles) {
		attrs.push(`SUBTITLES="${variant.subtitles}"`)
	}
	if (variant.closedCaptions) {
		attrs.push(`CLOSED-CAPTIONS="${variant.closedCaptions}"`)
	}

	return `#EXT-X-STREAM-INF:${attrs.join(',')}`
}

/**
 * Format rendition tag
 */
function formatRendition(rendition: M3u8Rendition): string {
	const attrs: string[] = [
		`TYPE=${rendition.type}`,
		`GROUP-ID="${rendition.groupId}"`,
		`NAME="${rendition.name}"`,
	]

	if (rendition.uri) {
		attrs.push(`URI="${rendition.uri}"`)
	}
	if (rendition.language) {
		attrs.push(`LANGUAGE="${rendition.language}"`)
	}
	if (rendition.assocLanguage) {
		attrs.push(`ASSOC-LANGUAGE="${rendition.assocLanguage}"`)
	}
	if (rendition.default) {
		attrs.push('DEFAULT=YES')
	}
	if (rendition.autoselect) {
		attrs.push('AUTOSELECT=YES')
	}
	if (rendition.forced) {
		attrs.push('FORCED=YES')
	}
	if (rendition.instreamId) {
		attrs.push(`INSTREAM-ID="${rendition.instreamId}"`)
	}
	if (rendition.characteristics) {
		attrs.push(`CHARACTERISTICS="${rendition.characteristics}"`)
	}
	if (rendition.channels) {
		attrs.push(`CHANNELS="${rendition.channels}"`)
	}

	return `#EXT-X-MEDIA:${attrs.join(',')}`
}

/**
 * Compare two keys for equality
 */
function keysEqual(a: M3u8Key, b?: M3u8Key): boolean {
	if (!b) return false
	return (
		a.method === b.method &&
		a.uri === b.uri &&
		a.iv === b.iv &&
		a.keyFormat === b.keyFormat &&
		a.keyFormatVersions === b.keyFormatVersions
	)
}

/**
 * Compare two maps for equality
 */
function mapsEqual(a: M3u8Map, b?: M3u8Map): boolean {
	if (!b) return false
	return (
		a.uri === b.uri &&
		a.byteRange?.length === b.byteRange?.length &&
		a.byteRange?.offset === b.byteRange?.offset
	)
}
