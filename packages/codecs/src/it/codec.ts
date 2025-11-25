/**
 * IT codec implementation
 * Integrates with @sylphx/codec-core
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeIT, isIT, parseITInfo } from './decoder'
import { encodeIT } from './encoder'
import type { ITEncodeOptions, ITFile } from './types'

/**
 * Convert IT file to AudioData
 */
export function itToAudioData(data: Uint8Array): AudioData {
	const it = decodeIT(data)

	// Calculate sample rate and duration
	const sampleRate = 44100 // Standard playback rate
	const channels = it.isStereo ? 2 : 1

	// Estimate duration based on patterns and tempo
	const ticksPerRow = it.initialSpeed
	const rowsPerPattern = 64 // Average
	const ticksPerSecond = (it.initialTempo * 2.5) / 60
	const estimatedPatterns = Math.min(it.orderCount, it.patternCount)
	const totalTicks = estimatedPatterns * rowsPerPattern * ticksPerRow
	const durationSeconds = totalTicks / ticksPerSecond
	const totalSamples = Math.floor(durationSeconds * sampleRate)

	// Create empty audio data (actual playback would require a tracker engine)
	const audioData = new Float32Array(totalSamples * channels)

	return {
		sampleRate,
		channels,
		data: audioData,
		metadata: {
			title: it.name,
			format: 'it',
			bitDepth: 16,
			duration: durationSeconds,
			sampleCount: it.sampleCount,
			instrumentCount: it.instrumentCount,
			patternCount: it.patternCount,
			tempo: it.initialTempo,
			speed: it.initialSpeed,
		},
	}
}

/**
 * Convert AudioData to IT file
 */
export function audioDataToIT(audio: AudioData, options: ITEncodeOptions = {}): Uint8Array {
	// This is a simplified conversion - real implementation would need sample extraction
	const it: ITFile = {
		name: (audio.metadata?.title as string) ?? 'Untitled',
		patternRowHighlight: 0x0410,
		version: 0x0200,
		createdWith: 0x0200,
		compatibleWith: 0x0200,
		flags: audio.channels > 1 ? 1 : 0,
		special: 0,
		orderCount: 1,
		instrumentCount: 0,
		sampleCount: 0,
		patternCount: 1,
		globalVolume: options.globalVolume ?? 128,
		mixVolume: options.mixVolume ?? 48,
		initialSpeed: options.initialSpeed ?? 6,
		initialTempo: options.initialTempo ?? 125,
		stereoSeparation: 128,
		pitchWheelDepth: 0,
		messageLength: 0,
		messageOffset: 0,
		channelPan: Array(64).fill(32),
		channelVolume: Array(64).fill(64),
		channels: Array(64)
			.fill(null)
			.map((_, i) => ({
				enabled: i < 32,
				panning: 32,
				volume: 64,
				muted: false,
				surround: false,
			})),
		orders: [0],
		instruments: [],
		samples: [],
		patterns: [
			{
				rows: 64,
				data: Array(64)
					.fill(null)
					.map(() =>
						Array(64)
							.fill(null)
							.map(() => ({
								note: 0xff,
								instrument: 0,
								volumePan: 0xff,
								command: 0,
								param: 0,
							}))
					),
			},
		],
		isStereo: audio.channels > 1,
		usesInstruments: false,
		usesLinearSlides: false,
		usesOldEffects: false,
	}

	return encodeIT(it, options)
}

/**
 * Get IT file information
 */
export function getITInfo(data: Uint8Array) {
	return parseITInfo(data)
}

/**
 * Check if data is IT format
 */
export function checkIT(data: Uint8Array): boolean {
	return isIT(data)
}
