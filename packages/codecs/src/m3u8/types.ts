/**
 * M3U8/HLS (HTTP Live Streaming) playlist types
 * Text-based playlist format for streaming media
 */

/**
 * HLS playlist type
 */
export type M3u8PlaylistType = 'master' | 'media'

/**
 * Media segment
 */
export interface M3u8Segment {
	uri: string
	duration: number
	title?: string
	byteRange?: {
		length: number
		offset?: number
	}
	discontinuity?: boolean
	programDateTime?: Date
	key?: M3u8Key
	map?: M3u8Map
}

/**
 * Encryption key info
 */
export interface M3u8Key {
	method: 'NONE' | 'AES-128' | 'SAMPLE-AES'
	uri?: string
	iv?: string
	keyFormat?: string
	keyFormatVersions?: string
}

/**
 * Media initialization section
 */
export interface M3u8Map {
	uri: string
	byteRange?: {
		length: number
		offset?: number
	}
}

/**
 * Variant stream (for master playlists)
 */
export interface M3u8Variant {
	uri: string
	bandwidth: number
	averageBandwidth?: number
	codecs?: string
	resolution?: {
		width: number
		height: number
	}
	frameRate?: number
	hdcpLevel?: string
	audio?: string
	video?: string
	subtitles?: string
	closedCaptions?: string
}

/**
 * Rendition (alternative media)
 */
export interface M3u8Rendition {
	type: 'AUDIO' | 'VIDEO' | 'SUBTITLES' | 'CLOSED-CAPTIONS'
	uri?: string
	groupId: string
	language?: string
	assocLanguage?: string
	name: string
	default?: boolean
	autoselect?: boolean
	forced?: boolean
	instreamId?: string
	characteristics?: string
	channels?: string
}

/**
 * Media playlist
 */
export interface M3u8MediaPlaylist {
	type: 'media'
	version: number
	targetDuration: number
	mediaSequence: number
	discontinuitySequence: number
	playlistType?: 'VOD' | 'EVENT'
	iFramesOnly: boolean
	endList: boolean
	segments: M3u8Segment[]
	totalDuration: number
}

/**
 * Master playlist
 */
export interface M3u8MasterPlaylist {
	type: 'master'
	version: number
	variants: M3u8Variant[]
	renditions: M3u8Rendition[]
	independentSegments: boolean
	sessionData?: Record<string, string>
}

/**
 * Parsed playlist (either master or media)
 */
export type M3u8Playlist = M3u8MasterPlaylist | M3u8MediaPlaylist

/**
 * Playlist info (quick parse)
 */
export interface M3u8Info {
	type: M3u8PlaylistType
	version: number
	duration?: number
	segmentCount?: number
	variantCount?: number
	hasEncryption: boolean
	isLive: boolean
}

/**
 * Encode options for media playlist
 */
export interface M3u8MediaEncodeOptions {
	version?: number
	targetDuration?: number
	mediaSequence?: number
	playlistType?: 'VOD' | 'EVENT'
	endList?: boolean
}

/**
 * Encode options for master playlist
 */
export interface M3u8MasterEncodeOptions {
	version?: number
	independentSegments?: boolean
}
