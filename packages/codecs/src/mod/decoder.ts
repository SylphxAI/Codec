/**
 * MOD file decoder
 * Parses ProTracker MOD files
 */

import type {
	ModFile,
	ModFormat,
	ModInfo,
	ModNote,
	ModPattern,
	ModSample,
} from './types'

/**
 * MOD format signatures and their channel counts
 */
const MOD_SIGNATURES: Record<string, number> = {
	'M.K.': 4,
	'M!K!': 4,
	'FLT4': 4,
	'FLT8': 8,
	'2CHN': 2,
	'4CHN': 4,
	'6CHN': 6,
	'8CHN': 8,
}

/**
 * Check if data is a MOD file
 */
export function isMod(data: Uint8Array): boolean {
	if (data.length < 1084) return false

	// Check for signature at offset 1080
	const sig = String.fromCharCode(data[1080]!, data[1081]!, data[1082]!, data[1083]!)
	return sig in MOD_SIGNATURES
}

/**
 * Parse MOD info without full decode
 */
export function parseModInfo(data: Uint8Array): ModInfo {
	if (!isMod(data)) {
		throw new Error('Invalid MOD file: missing signature at offset 1080')
	}

	// Read title
	const title = decodeText(data.subarray(0, 20))

	// Read signature
	const sigBytes = data.subarray(1080, 1084)
	const format = String.fromCharCode(sigBytes[0]!, sigBytes[1]!, sigBytes[2]!, sigBytes[3]!) as ModFormat
	const channels = MOD_SIGNATURES[format]!

	// Read song length
	const songLength = data[950]!

	// Find highest pattern number
	let numPatterns = 0
	for (let i = 0; i < 128; i++) {
		const pattern = data[952 + i]!
		if (pattern > numPatterns) {
			numPatterns = pattern
		}
	}
	numPatterns++ // Convert from 0-based to count

	// Count non-empty samples
	let numSamples = 0
	for (let i = 0; i < 31; i++) {
		const offset = 20 + i * 30
		const length = readU16BE(data, offset + 22)
		if (length > 0) {
			numSamples++
		}
	}

	// Estimate duration (rough calculation)
	// Default: 125 BPM, 6 ticks per row, 64 rows per pattern
	const beatsPerMinute = 125
	const ticksPerRow = 6
	const rowsPerPattern = 64
	const ticksPerSecond = (beatsPerMinute * 2) / (60 * ticksPerRow)
	const secondsPerPattern = rowsPerPattern / ticksPerRow / ticksPerSecond
	const duration = songLength * secondsPerPattern

	return {
		title,
		format,
		channels,
		songLength,
		numPatterns,
		numSamples,
		duration,
	}
}

/**
 * Decode MOD file
 */
export function decodeMod(data: Uint8Array): ModFile {
	if (!isMod(data)) {
		throw new Error('Invalid MOD file: missing signature at offset 1080')
	}

	let offset = 0

	// Read title (20 bytes)
	const title = decodeText(data.subarray(offset, offset + 20))
	offset += 20

	// Read 31 sample headers (30 bytes each)
	const samples: ModSample[] = []
	for (let i = 0; i < 31; i++) {
		const name = decodeText(data.subarray(offset, offset + 22))
		offset += 22

		const length = readU16BE(data, offset) * 2 // Convert words to bytes
		offset += 2

		const finetune = data[offset]! & 0x0f
		const finetuneValue = finetune > 7 ? finetune - 16 : finetune
		offset++

		const volume = Math.min(data[offset]!, 64)
		offset++

		const repeatPoint = readU16BE(data, offset) * 2
		offset += 2

		const repeatLength = readU16BE(data, offset) * 2
		offset += 2

		samples.push({
			name,
			length,
			finetune: finetuneValue,
			volume,
			repeatPoint,
			repeatLength,
			data: new Int8Array(0), // Will be filled later
		})
	}

	// Read song data
	const songLength = data[offset]!
	offset++

	const restartPosition = data[offset]!
	offset++

	// Read pattern table (128 bytes)
	const patternTable: number[] = []
	let maxPattern = 0
	for (let i = 0; i < 128; i++) {
		const pattern = data[offset]!
		patternTable.push(pattern)
		if (pattern > maxPattern) {
			maxPattern = pattern
		}
		offset++
	}

	// Read signature
	const sigBytes = data.subarray(offset, offset + 4)
	const format = String.fromCharCode(sigBytes[0]!, sigBytes[1]!, sigBytes[2]!, sigBytes[3]!) as ModFormat
	const channels = MOD_SIGNATURES[format]!
	offset += 4

	// Read patterns
	const numPatterns = maxPattern + 1
	const patterns: ModPattern[] = []

	for (let p = 0; p < numPatterns; p++) {
		const rows: ModNote[][] = []

		for (let r = 0; r < 64; r++) {
			const notes: ModNote[] = []

			for (let c = 0; c < channels; c++) {
				const byte0 = data[offset++]!
				const byte1 = data[offset++]!
				const byte2 = data[offset++]!
				const byte3 = data[offset++]!

				// Parse note data
				// Format: xxxx xxxx PPPP PPPP SSSS EEFF FFFF FFFF
				// x = sample high nibble, P = period, S = sample low nibble, E = effect, F = effect param
				const sample = ((byte0 & 0xf0) | ((byte2 & 0xf0) >> 4))
				const period = ((byte0 & 0x0f) << 8) | byte1
				const effect = byte2 & 0x0f
				const effectParam = byte3

				notes.push({
					sample,
					period,
					effect,
					effectParam,
				})
			}

			rows.push(notes)
		}

		patterns.push({ rows })
	}

	// Read sample data
	for (let i = 0; i < 31; i++) {
		const sample = samples[i]!
		if (sample.length > 0 && offset + sample.length <= data.length) {
			// Convert unsigned to signed
			const sampleData = new Int8Array(sample.length)
			for (let j = 0; j < sample.length; j++) {
				sampleData[j] = data[offset + j]! - 128
			}
			sample.data = sampleData
			offset += sample.length
		}
	}

	return {
		title,
		samples,
		songLength,
		restartPosition,
		patternTable,
		format,
		channels,
		patterns,
	}
}

/**
 * Convert MOD file to audio samples
 * This is a simplified renderer that generates basic audio
 */
export function modToAudio(mod: ModFile, sampleRate: number = 44100): {
	samples: Float32Array[]
	sampleRate: number
	channels: number
} {
	// Simple MOD player implementation
	// This is a basic implementation that handles note playback
	// without advanced effects

	const outputChannels = 2 // Stereo output
	const tempo = 125 // BPM
	const speed = 6 // Ticks per row
	const rowsPerPattern = 64

	// Calculate timing
	const ticksPerSecond = (tempo * 2) / (60 * speed)
	const samplesPerTick = Math.floor(sampleRate / ticksPerSecond)

	// Estimate total samples needed
	const totalTicks = mod.songLength * rowsPerPattern * speed
	const totalSamples = totalTicks * samplesPerTick

	// Initialize output buffers
	const left = new Float32Array(totalSamples)
	const right = new Float32Array(totalSamples)

	// Channel state
	interface ChannelState {
		sample: ModSample | null
		samplePosition: number
		period: number
		volume: number
	}

	const channelStates: ChannelState[] = Array.from({ length: mod.channels }, () => ({
		sample: null,
		samplePosition: 0,
		period: 0,
		volume: 64,
	}))

	let outputPosition = 0

	// Render each position in the song
	for (let pos = 0; pos < mod.songLength; pos++) {
		const patternIndex = mod.patternTable[pos]!
		const pattern = mod.patterns[patternIndex]

		if (!pattern) continue

		// Render each row in the pattern
		for (let row = 0; row < 64; row++) {
			const notes = pattern.rows[row]!

			// Update channel states from note data
			for (let ch = 0; ch < mod.channels && ch < notes.length; ch++) {
				const note = notes[ch]!
				const state = channelStates[ch]!

				// Set sample
				if (note.sample > 0 && note.sample <= 31) {
					state.sample = mod.samples[note.sample - 1]!
					state.samplePosition = 0
					if (state.sample.volume !== undefined) {
						state.volume = state.sample.volume
					}
				}

				// Set period (pitch)
				if (note.period > 0) {
					state.period = note.period
					state.samplePosition = 0
				}

				// Handle volume effect
				if (note.effect === 0xc) {
					state.volume = Math.min(note.effectParam, 64)
				}
			}

			// Render ticks for this row
			for (let tick = 0; tick < speed; tick++) {
				// Render samples for this tick
				for (let s = 0; s < samplesPerTick && outputPosition < totalSamples; s++) {
					let leftSample = 0
					let rightSample = 0

					// Mix all channels
					for (let ch = 0; ch < mod.channels; ch++) {
						const state = channelStates[ch]!

						if (state.sample && state.period > 0 && state.sample.data.length > 0) {
							// Calculate playback rate
							const amigaClock = 7093789.2 // PAL Amiga clock
							const frequency = amigaClock / (state.period * 2)
							const sampleStep = frequency / sampleRate

							// Get sample value
							const pos = Math.floor(state.samplePosition)
							if (pos < state.sample.data.length) {
								const sampleValue = state.sample.data[pos]! / 128
								const volume = state.volume / 64

								// Apply volume and panning (simple stereo spread)
								const pan = ch / (mod.channels - 1 || 1) // 0 = left, 1 = right
								leftSample += sampleValue * volume * (1 - pan) * 0.5
								rightSample += sampleValue * volume * pan * 0.5

								// Advance sample position
								state.samplePosition += sampleStep

								// Handle looping
								if (state.sample.repeatLength > 2) {
									const loopEnd = state.sample.repeatPoint + state.sample.repeatLength
									if (state.samplePosition >= loopEnd) {
										state.samplePosition = state.sample.repeatPoint + (state.samplePosition - loopEnd)
									}
								} else if (state.samplePosition >= state.sample.data.length) {
									// Stop playing
									state.sample = null
								}
							}
						}
					}

					// Write to output
					left[outputPosition] = Math.max(-1, Math.min(1, leftSample))
					right[outputPosition] = Math.max(-1, Math.min(1, rightSample))
					outputPosition++
				}
			}
		}
	}

	// Trim to actual length
	return {
		samples: [left.slice(0, outputPosition), right.slice(0, outputPosition)],
		sampleRate,
		channels: outputChannels,
	}
}

/**
 * Read 16-bit big-endian
 */
function readU16BE(data: Uint8Array, offset: number): number {
	return (data[offset]! << 8) | data[offset + 1]!
}

/**
 * Decode text from bytes (Amiga ASCII)
 */
function decodeText(data: Uint8Array): string {
	let text = ''
	for (let i = 0; i < data.length; i++) {
		const char = data[i]!
		if (char === 0) break
		text += String.fromCharCode(char)
	}
	return text.trim()
}
