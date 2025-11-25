/**
 * MP3 codec class implementation
 * Integrates decoder and encoder
 */

import { decodeMp3, isMp3, parseMp3Info } from './decoder'
import { encodeMp3 } from './encoder'
import type { MP3AudioData, MP3DecodeResult, MP3EncodeOptions, MP3Info } from './types'

/**
 * MP3 Codec class
 */
export class Mp3Codec {
	/**
	 * Detect if data is MP3
	 */
	static detect(data: Uint8Array): boolean {
		return isMp3(data)
	}

	/**
	 * Parse MP3 metadata
	 */
	static parse(data: Uint8Array): MP3Info {
		return parseMp3Info(data)
	}

	/**
	 * Decode MP3 to raw audio
	 */
	static decode(data: Uint8Array): MP3DecodeResult {
		return decodeMp3(data)
	}

	/**
	 * Encode raw audio to MP3
	 */
	static encode(audio: MP3AudioData, options?: MP3EncodeOptions): Uint8Array {
		return encodeMp3(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): number[] {
		return [
			// MPEG-1
			44100, 48000, 32000,
			// MPEG-2
			22050, 24000, 16000,
			// MPEG-2.5
			11025, 12000, 8000,
		]
	}

	/**
	 * Get supported bitrates for MPEG-1 Layer III
	 */
	static getSupportedBitrates(): number[] {
		return [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
	}

	/**
	 * Get supported channel modes
	 */
	static getSupportedChannelModes(): string[] {
		return ['STEREO', 'JOINT_STEREO', 'DUAL_CHANNEL', 'MONO']
	}

	/**
	 * Validate sample rate
	 */
	static isValidSampleRate(sampleRate: number): boolean {
		return this.getSupportedSampleRates().includes(sampleRate)
	}

	/**
	 * Validate bitrate
	 */
	static isValidBitrate(bitrate: number): boolean {
		return this.getSupportedBitrates().includes(bitrate)
	}

	/**
	 * Validate channel count
	 */
	static isValidChannelCount(channels: number): boolean {
		return channels >= 1 && channels <= 2
	}

	/**
	 * Get recommended bitrate for quality level
	 * @param quality 0-9, where 0 is best and 9 is worst
	 */
	static getRecommendedBitrate(quality: number): number {
		const bitrates = [320, 256, 224, 192, 160, 128, 112, 96, 80, 64]
		const index = Math.max(0, Math.min(9, Math.floor(quality)))
		return bitrates[index]!
	}

	/**
	 * Calculate estimated file size
	 */
	static estimateFileSize(durationSeconds: number, bitrate: number): number {
		// Bitrate is in kbps, convert to bytes per second
		const bytesPerSecond = (bitrate * 1000) / 8
		return Math.ceil(durationSeconds * bytesPerSecond)
	}

	/**
	 * Calculate duration from file size and bitrate
	 */
	static calculateDuration(fileSize: number, bitrate: number): number {
		// Bitrate is in kbps
		const bytesPerSecond = (bitrate * 1000) / 8
		return fileSize / bytesPerSecond
	}
}

/**
 * Convenience exports
 */
export { decodeMp3, encodeMp3, isMp3, parseMp3Info }
