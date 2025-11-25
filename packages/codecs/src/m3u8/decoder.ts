/**
 * M3U8/HLS playlist decoder (parser)
 * Parses both master and media playlists
 */

import type {
	M3u8Info,
	M3u8Key,
	M3u8Map,
	M3u8MasterPlaylist,
	M3u8MediaPlaylist,
	M3u8Playlist,
	M3u8Rendition,
	M3u8Segment,
	M3u8Variant,
} from './types'

/**
 * M3U8 header signature
 */
export const M3U8_HEADER = '#EXTM3U'

/**
 * Check if data is M3U8 playlist
 */
export function isM3u8(data: Uint8Array | string): boolean {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data.slice(0, 100))
	return text.trimStart().startsWith(M3U8_HEADER)
}

/**
 * Parse M3U8 info without full decode
 */
export function parseM3u8Info(data: Uint8Array | string): M3u8Info {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
	const lines = text.split(/\r?\n/)

	let version = 1
	let duration = 0
	let segmentCount = 0
	let variantCount = 0
	let hasEncryption = false
	let isLive = true
	let isMaster = false

	for (const line of lines) {
		if (line.startsWith('#EXT-X-VERSION:')) {
			version = parseInt(line.slice(15), 10)
		} else if (line.startsWith('#EXT-X-STREAM-INF:')) {
			isMaster = true
			variantCount++
		} else if (line.startsWith('#EXTINF:')) {
			const dur = parseFloat(line.slice(8).split(',')[0]!)
			if (!isNaN(dur)) duration += dur
			segmentCount++
		} else if (line.startsWith('#EXT-X-KEY:') && !line.includes('METHOD=NONE')) {
			hasEncryption = true
		} else if (line.startsWith('#EXT-X-ENDLIST')) {
			isLive = false
		}
	}

	return {
		type: isMaster ? 'master' : 'media',
		version,
		duration: isMaster ? undefined : duration,
		segmentCount: isMaster ? undefined : segmentCount,
		variantCount: isMaster ? variantCount : undefined,
		hasEncryption,
		isLive: isMaster ? false : isLive,
	}
}

/**
 * Decode M3U8 playlist
 */
export function decodeM3u8(data: Uint8Array | string): M3u8Playlist {
	const text = typeof data === 'string' ? data : new TextDecoder().decode(data)

	if (!text.trimStart().startsWith(M3U8_HEADER)) {
		throw new Error('Invalid M3U8: missing #EXTM3U header')
	}

	const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)

	// Determine playlist type
	const isMaster = lines.some(l =>
		l.startsWith('#EXT-X-STREAM-INF:') ||
		l.startsWith('#EXT-X-MEDIA:')
	)

	if (isMaster) {
		return parseMasterPlaylist(lines)
	} else {
		return parseMediaPlaylist(lines)
	}
}

/**
 * Parse master playlist
 */
function parseMasterPlaylist(lines: string[]): M3u8MasterPlaylist {
	let version = 1
	const variants: M3u8Variant[] = []
	const renditions: M3u8Rendition[] = []
	let independentSegments = false

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!

		if (line.startsWith('#EXT-X-VERSION:')) {
			version = parseInt(line.slice(15), 10)
		} else if (line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) {
			independentSegments = true
		} else if (line.startsWith('#EXT-X-MEDIA:')) {
			const attrs = parseAttributes(line.slice(13))
			renditions.push({
				type: attrs.TYPE as M3u8Rendition['type'],
				uri: attrs.URI,
				groupId: attrs['GROUP-ID'] || '',
				language: attrs.LANGUAGE,
				assocLanguage: attrs['ASSOC-LANGUAGE'],
				name: attrs.NAME || '',
				default: attrs.DEFAULT === 'YES',
				autoselect: attrs.AUTOSELECT === 'YES',
				forced: attrs.FORCED === 'YES',
				instreamId: attrs['INSTREAM-ID'],
				characteristics: attrs.CHARACTERISTICS,
				channels: attrs.CHANNELS,
			})
		} else if (line.startsWith('#EXT-X-STREAM-INF:')) {
			const attrs = parseAttributes(line.slice(18))
			const nextLine = lines[i + 1]

			if (nextLine && !nextLine.startsWith('#')) {
				variants.push({
					uri: nextLine,
					bandwidth: parseInt(attrs.BANDWIDTH || '0', 10),
					averageBandwidth: attrs['AVERAGE-BANDWIDTH'] ? parseInt(attrs['AVERAGE-BANDWIDTH'], 10) : undefined,
					codecs: attrs.CODECS,
					resolution: parseResolution(attrs.RESOLUTION),
					frameRate: attrs['FRAME-RATE'] ? parseFloat(attrs['FRAME-RATE']) : undefined,
					hdcpLevel: attrs['HDCP-LEVEL'],
					audio: attrs.AUDIO,
					video: attrs.VIDEO,
					subtitles: attrs.SUBTITLES,
					closedCaptions: attrs['CLOSED-CAPTIONS'],
				})
				i++ // Skip URI line
			}
		}
	}

	return {
		type: 'master',
		version,
		variants,
		renditions,
		independentSegments,
	}
}

/**
 * Parse media playlist
 */
function parseMediaPlaylist(lines: string[]): M3u8MediaPlaylist {
	let version = 1
	let targetDuration = 0
	let mediaSequence = 0
	let discontinuitySequence = 0
	let playlistType: 'VOD' | 'EVENT' | undefined
	let iFramesOnly = false
	let endList = false

	const segments: M3u8Segment[] = []
	let currentKey: M3u8Key | undefined
	let currentMap: M3u8Map | undefined
	let pendingSegment: Partial<M3u8Segment> = {}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!

		if (line.startsWith('#EXT-X-VERSION:')) {
			version = parseInt(line.slice(15), 10)
		} else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
			targetDuration = parseInt(line.slice(22), 10)
		} else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
			mediaSequence = parseInt(line.slice(22), 10)
		} else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) {
			discontinuitySequence = parseInt(line.slice(30), 10)
		} else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
			playlistType = line.slice(21) as 'VOD' | 'EVENT'
		} else if (line.startsWith('#EXT-X-I-FRAMES-ONLY')) {
			iFramesOnly = true
		} else if (line.startsWith('#EXT-X-ENDLIST')) {
			endList = true
		} else if (line.startsWith('#EXT-X-KEY:')) {
			currentKey = parseKey(line.slice(11))
		} else if (line.startsWith('#EXT-X-MAP:')) {
			currentMap = parseMap(line.slice(11))
		} else if (line.startsWith('#EXT-X-DISCONTINUITY')) {
			pendingSegment.discontinuity = true
		} else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
			pendingSegment.programDateTime = new Date(line.slice(25))
		} else if (line.startsWith('#EXT-X-BYTERANGE:')) {
			pendingSegment.byteRange = parseByteRange(line.slice(17))
		} else if (line.startsWith('#EXTINF:')) {
			const match = line.slice(8).match(/^([\d.]+)(?:,(.*))?$/)
			if (match) {
				pendingSegment.duration = parseFloat(match[1]!)
				pendingSegment.title = match[2]?.trim()
			}
		} else if (!line.startsWith('#')) {
			// URI line - create segment
			segments.push({
				uri: line,
				duration: pendingSegment.duration || 0,
				title: pendingSegment.title,
				byteRange: pendingSegment.byteRange,
				discontinuity: pendingSegment.discontinuity,
				programDateTime: pendingSegment.programDateTime,
				key: currentKey,
				map: currentMap,
			})
			pendingSegment = {}
		}
	}

	const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0)

	return {
		type: 'media',
		version,
		targetDuration,
		mediaSequence,
		discontinuitySequence,
		playlistType,
		iFramesOnly,
		endList,
		segments,
		totalDuration,
	}
}

/**
 * Parse attribute list (key=value pairs)
 */
function parseAttributes(str: string): Record<string, string> {
	const attrs: Record<string, string> = {}
	const regex = /([A-Z0-9-]+)=(?:"([^"]*)"|([^,]*))/g
	let match

	while ((match = regex.exec(str)) !== null) {
		const key = match[1]!
		const value = match[2] ?? match[3] ?? ''
		attrs[key] = value
	}

	return attrs
}

/**
 * Parse resolution (WIDTHxHEIGHT)
 */
function parseResolution(str?: string): { width: number; height: number } | undefined {
	if (!str) return undefined
	const match = str.match(/^(\d+)x(\d+)$/)
	if (!match) return undefined
	return {
		width: parseInt(match[1]!, 10),
		height: parseInt(match[2]!, 10),
	}
}

/**
 * Parse encryption key
 */
function parseKey(str: string): M3u8Key {
	const attrs = parseAttributes(str)
	return {
		method: (attrs.METHOD || 'NONE') as M3u8Key['method'],
		uri: attrs.URI,
		iv: attrs.IV,
		keyFormat: attrs.KEYFORMAT,
		keyFormatVersions: attrs.KEYFORMATVERSIONS,
	}
}

/**
 * Parse media map
 */
function parseMap(str: string): M3u8Map {
	const attrs = parseAttributes(str)
	return {
		uri: attrs.URI || '',
		byteRange: parseByteRange(attrs.BYTERANGE),
	}
}

/**
 * Parse byte range (length[@offset])
 */
function parseByteRange(str?: string): { length: number; offset?: number } | undefined {
	if (!str) return undefined
	const match = str.match(/^(\d+)(?:@(\d+))?$/)
	if (!match) return undefined
	return {
		length: parseInt(match[1]!, 10),
		offset: match[2] ? parseInt(match[2], 10) : undefined,
	}
}
