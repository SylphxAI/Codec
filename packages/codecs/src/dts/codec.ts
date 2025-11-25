/**
 * DTS codec class implementation
 * Integrates decoder and encoder
 */

import { decodeDts, isDts, parseDtsInfo } from './decoder'
import { encodeDts } from './encoder'
import { DTS_BITRATES, DTS_SAMPLE_RATES, DtsChannelArrangement } from './types'
import type { DtsAudioData, DtsDecodeResult, DtsEncodeOptions, DtsInfo } from './types'

/**
 * DTS Codec class
 */
export class DtsCodec {
	/**
	 * Detect if data is DTS
	 */
	static detect(data: Uint8Array): boolean {
		return isDts(data)
	}

	/**
	 * Parse DTS metadata
	 */
	static parse(data: Uint8Array): DtsInfo {
		return parseDtsInfo(data)
	}

	/**
	 * Decode DTS to raw audio
	 */
	static decode(data: Uint8Array): DtsDecodeResult {
		return decodeDts(data)
	}

	/**
	 * Encode raw audio to DTS
	 */
	static encode(audio: DtsAudioData, options?: DtsEncodeOptions): Uint8Array {
		return encodeDts(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): readonly number[] {
		return DTS_SAMPLE_RATES
	}

	/**
	 * Get supported bitrates (excluding variable rate entries)
	 */
	static getSupportedBitrates(): number[] {
		return DTS_BITRATES.filter((b) => b > 0)
	}

	/**
	 * Get channel arrangement names
	 */
	static getChannelArrangements(): Record<string, number> {
		return { ...DtsChannelArrangement }
	}

	/**
	 * Validate sample rate
	 */
	static isValidSampleRate(sampleRate: number): boolean {
		return DTS_SAMPLE_RATES.includes(sampleRate as any)
	}

	/**
	 * Validate bitrate
	 */
	static isValidBitrate(bitrate: number): boolean {
		return DTS_BITRATES.includes(bitrate as any) && bitrate > 0
	}

	/**
	 * Validate channel count
	 */
	static isValidChannelCount(channels: number): boolean {
		return channels >= 1 && channels <= 8
	}

	/**
	 * Get recommended bitrate for channel configuration
	 * @param channels Number of channels
	 * @param quality Quality level 0-9, where 0 is best and 9 is worst
	 */
	static getRecommendedBitrate(channels: number, quality: number = 5): number {
		// Base bitrates for different channel configurations at medium quality
		const baseBitrates: Record<number, number> = {
			1: 256, // Mono
			2: 768, // Stereo
			3: 1024, // 3 channels
			4: 1024, // 4 channels
			5: 1280, // 5 channels
			6: 1536, // 5.1 surround
			8: 2048, // 7.1 surround
		}

		const baseBitrate = baseBitrates[channels] || 768

		// Quality scaling: 0 = highest quality, 9 = lowest quality
		// Scale from 1.5x (best) to 0.5x (worst)
		const qualityScale = 1.5 - (quality / 9) * 1.0

		const targetBitrate = Math.floor(baseBitrate * qualityScale)

		// Find closest supported bitrate
		const validBitrates = this.getSupportedBitrates()
		return validBitrates.reduce((prev, curr) =>
			Math.abs(curr - targetBitrate) < Math.abs(prev - targetBitrate) ? curr : prev
		)
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

	/**
	 * Get channel count from channel arrangement
	 */
	static getChannelCount(arrangement: number, lfe: boolean): number {
		const baseChannels = [
			1, // MONO
			2, // DUAL_MONO
			2, // STEREO
			2, // STEREO_SUM_DIFF
			2, // LT_RT
			3, // THREE_CHANNEL
			3, // TWO_PLUS_ONE
			4, // THREE_PLUS_ONE
			4, // TWO_PLUS_TWO
			5, // THREE_PLUS_TWO
			5, // FOUR_PLUS_ONE
			6, // FOUR_PLUS_TWO
			5, // THREE_PLUS_TWO_PLUS_ONE (without LFE in base)
			7, // THREE_PLUS_TWO_PLUS_TWO
			2, // ONE_PLUS_ONE
			0, // USER_DEFINED
		][arrangement]

		if (baseChannels === undefined) {
			throw new Error(`Invalid channel arrangement: ${arrangement}`)
		}

		// LFE adds one channel if present (except arrangement 12 which includes it)
		if (arrangement === 12) {
			return baseChannels + 1 // 5.1 is always 6 channels
		}

		return baseChannels + (lfe ? 1 : 0)
	}

	/**
	 * Get format description
	 */
	static getFormatDescription(info: DtsInfo): string {
		const channelNames: Record<number, string> = {
			0: 'Mono',
			1: 'Dual Mono',
			2: 'Stereo',
			3: 'Stereo (Sum/Diff)',
			4: 'Lt/Rt',
			5: '3.0',
			6: '2.1',
			7: '3.1',
			8: '4.0',
			9: '5.0',
			10: '4.1',
			11: '6.0',
			12: '5.1',
			13: '7.0',
			14: '1+1',
			15: 'User Defined',
		}

		const arrangementName = channelNames[info.channelArrangement] || 'Unknown'
		const lfeStr = info.lfe ? '+LFE' : ''
		const hdStr = info.isHD ? ' HD' : ''

		return `DTS${hdStr} ${arrangementName}${lfeStr} @ ${info.sampleRate / 1000}kHz, ${info.bitrate > 0 ? `${info.bitrate}kbps` : 'VBR'}`
	}
}

/**
 * Convenience exports
 */
export { decodeDts, encodeDts, isDts, parseDtsInfo }
