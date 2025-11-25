/**
 * MPC codec class implementation
 * Integrates decoder and encoder
 */

import type { AudioData } from '@sylphx/codec-core'
import { decodeMpc, isMpc, parseMpcInfo } from './decoder'
import { encodeMpc } from './encoder'
import { MPC_SAMPLE_RATES, MPCProfile, type MPCDecodeResult, type MPCEncodeOptions, type MPCInfo } from './types'

/**
 * MPC Codec class
 */
export class MpcCodec {
	/**
	 * Detect if data is MPC
	 */
	static detect(data: Uint8Array): boolean {
		return isMpc(data)
	}

	/**
	 * Parse MPC metadata
	 */
	static parse(data: Uint8Array): MPCInfo {
		return parseMpcInfo(data)
	}

	/**
	 * Decode MPC to raw audio
	 */
	static decode(data: Uint8Array): MPCDecodeResult {
		return decodeMpc(data)
	}

	/**
	 * Encode raw audio to MPC
	 */
	static encode(audio: AudioData, options?: MPCEncodeOptions): Uint8Array {
		return encodeMpc(audio, options)
	}

	/**
	 * Get supported sample rates
	 */
	static getSupportedSampleRates(): readonly number[] {
		return MPC_SAMPLE_RATES
	}

	/**
	 * Get supported profiles
	 */
	static getSupportedProfiles(): string[] {
		return [
			'TELEPHONE', // ~64 kbps
			'THUMB', // ~96 kbps
			'RADIO', // ~112 kbps
			'STANDARD', // ~128 kbps
			'XTREME', // ~160 kbps
			'INSANE', // ~180 kbps
			'BRAINDEAD', // ~200 kbps
			'EXPERIMENTAL', // ~220+ kbps
		]
	}

	/**
	 * Validate sample rate
	 */
	static isValidSampleRate(sampleRate: number): boolean {
		return MPC_SAMPLE_RATES.includes(sampleRate as any)
	}

	/**
	 * Validate channel count
	 */
	static isValidChannelCount(channels: number): boolean {
		return channels >= 1 && channels <= 2
	}

	/**
	 * Get recommended profile for quality level
	 * @param quality 0-10, where 0 is lowest and 10 is highest
	 */
	static getRecommendedProfile(quality: number): number {
		const profiles = [
			MPCProfile.TELEPHONE,
			MPCProfile.TELEPHONE,
			MPCProfile.THUMB,
			MPCProfile.RADIO,
			MPCProfile.STANDARD,
			MPCProfile.STANDARD,
			MPCProfile.XTREME,
			MPCProfile.INSANE,
			MPCProfile.BRAINDEAD,
			MPCProfile.EXPERIMENTAL,
			MPCProfile.EXPERIMENTAL,
		]
		const index = Math.max(0, Math.min(10, Math.floor(quality)))
		return profiles[index]!
	}

	/**
	 * Get estimated bitrate for profile
	 */
	static getProfileBitrate(profile: number): number {
		const bitrates = [64, 96, 112, 128, 160, 180, 200, 220]
		return bitrates[profile] || 128
	}

	/**
	 * Calculate estimated file size
	 */
	static estimateFileSize(durationSeconds: number, profile: number): number {
		const bitrate = this.getProfileBitrate(profile)
		const bytesPerSecond = (bitrate * 1000) / 8
		return Math.ceil(durationSeconds * bytesPerSecond)
	}

	/**
	 * Calculate duration from file size and profile
	 */
	static calculateDuration(fileSize: number, profile: number): number {
		const bitrate = this.getProfileBitrate(profile)
		const bytesPerSecond = (bitrate * 1000) / 8
		return fileSize / bytesPerSecond
	}

	/**
	 * Get format name
	 */
	static getFormatName(): string {
		return 'Musepack (MPC)'
	}

	/**
	 * Get format description
	 */
	static getFormatDescription(): string {
		return 'High quality lossy audio compression format optimized for transparency at ~160 kbps'
	}

	/**
	 * Get file extensions
	 */
	static getFileExtensions(): string[] {
		return ['.mpc', '.mp+', '.mpp']
	}

	/**
	 * Get MIME types
	 */
	static getMimeTypes(): string[] {
		return ['audio/x-musepack', 'audio/musepack']
	}

	/**
	 * Check if format supports metadata
	 */
	static supportsMetadata(): boolean {
		return true
	}

	/**
	 * Check if format supports streaming
	 */
	static supportsStreaming(): boolean {
		return true
	}

	/**
	 * Get maximum supported channels
	 */
	static getMaxChannels(): number {
		return 2
	}

	/**
	 * Get minimum supported sample rate
	 */
	static getMinSampleRate(): number {
		return Math.min(...MPC_SAMPLE_RATES)
	}

	/**
	 * Get maximum supported sample rate
	 */
	static getMaxSampleRate(): number {
		return Math.max(...MPC_SAMPLE_RATES)
	}
}

/**
 * Convenience exports
 */
export { decodeMpc, encodeMpc, isMpc, parseMpcInfo }
