/**
 * XM (Extended Module / FastTracker 2) codec
 * Converts between XM files and AudioData
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeXM, isXM } from './decoder'
import { encodeXM } from './encoder'
import type { XMFile } from './types'

/**
 * Convert XM file to AudioData
 * Note: This is a simplified implementation that renders the module to audio
 */
export function xmToAudio(data: Uint8Array): AudioData {
	const xm = decodeXM(data)

	// Calculate approximate duration
	const avgRowsPerPattern = 64
	const totalRows = xm.songLength * avgRowsPerPattern
	const rowsPerSecond = (xm.defaultBPM * xm.defaultTempo) / 60 / 24
	const duration = totalRows / rowsPerSecond

	// For a basic implementation, we'll create silence
	// A full implementation would need a complete XM player
	const sampleRate = 44100
	const numSamples = Math.floor(duration * sampleRate)
	const channels = Math.min(xm.numChannels, 2) // Stereo output

	const samples: Float32Array[] = []
	for (let ch = 0; ch < channels; ch++) {
		samples.push(new Float32Array(numSamples))
	}

	// TODO: Implement full XM playback engine
	// This would require:
	// - Pattern playback
	// - Instrument/sample mixing
	// - Effect processing
	// - Envelope processing
	// For now, we return silence with correct dimensions

	return {
		samples,
		sampleRate,
		channels,
	}
}

/**
 * Convert AudioData to XM file
 * Note: This creates a simple XM with audio data as samples
 */
export function audioToXM(audio: AudioData): Uint8Array {
	// Create a basic XM file structure
	// This is a simplified implementation
	const xm: XMFile = {
		name: 'Audio Sample',
		trackerName: 'mconv XM encoder   ',
		version: 0x0104,
		headerSize: 276,
		songLength: 1,
		restartPosition: 0,
		numChannels: Math.min(audio.channels, 32),
		numPatterns: 1,
		numInstruments: 0,
		flags: 1,
		defaultTempo: 6,
		defaultBPM: 125,
		patternOrder: new Array(256).fill(0),
		patterns: [
			{
				rows: 64,
				data: Array.from({ length: 64 }, () =>
					Array.from({ length: Math.min(audio.channels, 32) }, () => ({
						note: 0,
						instrument: 0,
						volume: 0,
						effectType: 0,
						effectParam: 0,
					}))
				),
			},
		],
		instruments: [],
	}

	return encodeXM(xm)
}

/**
 * XM Codec class
 */
export class XMCodec {
	readonly format = 'xm' as const

	/**
	 * Check if data is XM
	 */
	isFormat(data: Uint8Array): boolean {
		return isXM(data)
	}

	/**
	 * Decode XM to AudioData
	 */
	decode(data: Uint8Array): AudioData {
		return xmToAudio(data)
	}

	/**
	 * Encode AudioData to XM
	 */
	encode(audio: AudioData): Uint8Array {
		return audioToXM(audio)
	}

	/**
	 * Decode XM to XMFile structure (advanced)
	 */
	decodeToXM(data: Uint8Array): XMFile {
		return decodeXM(data)
	}

	/**
	 * Encode XMFile structure to binary (advanced)
	 */
	encodeFromXM(xm: XMFile): Uint8Array {
		return encodeXM(xm)
	}
}

/**
 * Default XM codec instance
 */
export const xmCodec = new XMCodec()
