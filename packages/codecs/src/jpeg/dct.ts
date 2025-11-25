/**
 * Discrete Cosine Transform (DCT) for JPEG
 */

// Precomputed cosine values for DCT
const COS_TABLE: number[][] = []
for (let i = 0; i < 8; i++) {
	COS_TABLE[i] = []
	for (let j = 0; j < 8; j++) {
		COS_TABLE[i]![j] = Math.cos(((2 * i + 1) * j * Math.PI) / 16)
	}
}

// Scaling factors
const C = (n: number) => (n === 0 ? 1 / Math.SQRT2 : 1)

/**
 * Inverse DCT (8x8 block)
 * Converts frequency domain coefficients back to spatial domain
 */
export function idct8x8(block: number[]): number[] {
	const output = new Array(64).fill(0)

	for (let y = 0; y < 8; y++) {
		for (let x = 0; x < 8; x++) {
			let sum = 0

			for (let v = 0; v < 8; v++) {
				for (let u = 0; u < 8; u++) {
					const coef = block[v * 8 + u]!
					sum += C(u) * C(v) * coef * COS_TABLE[x]![u]! * COS_TABLE[y]![v]!
				}
			}

			output[y * 8 + x] = sum / 4
		}
	}

	return output
}

/**
 * Fast IDCT using AAN algorithm (faster approximation)
 */
export function idctFast(block: number[]): number[] {
	const output = new Array(64)

	// Constants for AAN algorithm
	const a1 = Math.SQRT1_2 // cos(4π/16)
	const a2 = 0.541196100146197 // cos(6π/16) * √2
	const a3 = Math.SQRT1_2 // cos(4π/16)
	const a4 = 1.306562964876377 // cos(2π/16) * √2
	const a5 = 0.38268343236509 // cos(6π/16)

	// Process rows
	const tmp = new Array(64)
	for (let i = 0; i < 8; i++) {
		const row = i * 8
		const s0 = block[row]!
		const s1 = block[row + 1]!
		const s2 = block[row + 2]!
		const s3 = block[row + 3]!
		const s4 = block[row + 4]!
		const s5 = block[row + 5]!
		const s6 = block[row + 6]!
		const s7 = block[row + 7]!

		// Even part
		const t0 = s0 + s4
		const t1 = s0 - s4
		const t2 = s2 * a1 - s6 * a1
		const t3 = s2 * a1 + s6 * a1

		const t4 = t0 + t3
		const t5 = t1 + t2
		const t6 = t1 - t2
		const t7 = t0 - t3

		// Odd part
		const t8 = s7 + s1
		const t9 = s5 + s3
		const t10 = s7 - s1
		const t11 = s5 - s3

		const t12 = t8 + t9
		const t13 = (t8 - t9) * a3
		const t14 = t10 * a4 - t12 * a5 + t13
		const t15 = (t10 + t11) * a3 - t14
		const t16 = t11 * a2 - t15

		tmp[row] = t4 + t12
		tmp[row + 1] = t5 + t15
		tmp[row + 2] = t6 + t16
		tmp[row + 3] = t7 + t14
		tmp[row + 4] = t7 - t14
		tmp[row + 5] = t6 - t16
		tmp[row + 6] = t5 - t15
		tmp[row + 7] = t4 - t12
	}

	// Process columns
	for (let i = 0; i < 8; i++) {
		const s0 = tmp[i]!
		const s1 = tmp[i + 8]!
		const s2 = tmp[i + 16]!
		const s3 = tmp[i + 24]!
		const s4 = tmp[i + 32]!
		const s5 = tmp[i + 40]!
		const s6 = tmp[i + 48]!
		const s7 = tmp[i + 56]!

		// Even part
		const t0 = s0 + s4
		const t1 = s0 - s4
		const t2 = s2 * a1 - s6 * a1
		const t3 = s2 * a1 + s6 * a1

		const t4 = t0 + t3
		const t5 = t1 + t2
		const t6 = t1 - t2
		const t7 = t0 - t3

		// Odd part
		const t8 = s7 + s1
		const t9 = s5 + s3
		const t10 = s7 - s1
		const t11 = s5 - s3

		const t12 = t8 + t9
		const t13 = (t8 - t9) * a3
		const t14 = t10 * a4 - t12 * a5 + t13
		const t15 = (t10 + t11) * a3 - t14
		const t16 = t11 * a2 - t15

		output[i] = (t4 + t12) / 8
		output[i + 8] = (t5 + t15) / 8
		output[i + 16] = (t6 + t16) / 8
		output[i + 24] = (t7 + t14) / 8
		output[i + 32] = (t7 - t14) / 8
		output[i + 40] = (t6 - t16) / 8
		output[i + 48] = (t5 - t15) / 8
		output[i + 56] = (t4 - t12) / 8
	}

	return output
}

/**
 * Forward DCT (8x8 block)
 * Converts spatial domain to frequency domain
 */
export function fdct8x8(block: number[]): number[] {
	const output = new Array(64).fill(0)

	for (let v = 0; v < 8; v++) {
		for (let u = 0; u < 8; u++) {
			let sum = 0

			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					sum += block[y * 8 + x]! * COS_TABLE[x]![u]! * COS_TABLE[y]![v]!
				}
			}

			output[v * 8 + u] = (C(u) * C(v) * sum) / 4
		}
	}

	return output
}
