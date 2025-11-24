//! BMP decoder - pure Rust implementation

use crate::utils::{read_i32_le, read_u16_le, read_u32_le};

const BI_RGB: u32 = 0;
const BI_BITFIELDS: u32 = 3;

/// Decode BMP to RGBA pixel data
///
/// Returns: [width (4 bytes), height (4 bytes), rgba_data...]
pub fn decode_bmp(data: &[u8]) -> Result<Vec<u8>, String> {
    // Validate signature
    if data.len() < 54 {
        return Err("BMP data too small".to_string());
    }

    if data[0] != 0x42 || data[1] != 0x4D {
        return Err("Invalid BMP signature".to_string());
    }

    // File header
    let data_offset = read_u32_le(data, 10) as usize;

    // DIB header
    let dib_size = read_u32_le(data, 14);
    if dib_size < 40 {
        return Err(format!("Unsupported DIB header size: {}", dib_size));
    }

    let width = read_i32_le(data, 18);
    let height = read_i32_le(data, 22);
    let bits_per_pixel = read_u16_le(data, 28);
    let compression = read_u32_le(data, 30);

    // Handle negative height (top-down bitmap)
    let top_down = height < 0;
    let abs_height = height.unsigned_abs() as usize;
    let abs_width = width.unsigned_abs() as usize;

    if abs_width == 0 || abs_height == 0 {
        return Err(format!("Invalid dimensions: {}x{}", abs_width, abs_height));
    }

    // Validate compression
    if compression != BI_RGB && compression != BI_BITFIELDS {
        return Err(format!("Unsupported compression: {}", compression));
    }

    // Read color table for indexed formats
    let color_table: Option<&[u8]> = if bits_per_pixel <= 8 {
        let color_count = 1usize << bits_per_pixel;
        let color_table_offset = 14 + dib_size as usize;
        let color_table_end = color_table_offset + color_count * 4;
        if data.len() < color_table_end {
            return Err("BMP data too small for color table".to_string());
        }
        Some(&data[color_table_offset..color_table_end])
    } else {
        None
    };

    // Bit masks for BITFIELDS
    let (r_mask, g_mask, b_mask, a_mask) = if compression == BI_BITFIELDS && dib_size >= 52 {
        (
            read_u32_le(data, 54),
            read_u32_le(data, 58),
            read_u32_le(data, 62),
            if dib_size >= 56 { read_u32_le(data, 66) } else { 0xff000000 },
        )
    } else {
        (0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000)
    };

    // Row stride (padded to 4 bytes)
    let row_stride = ((bits_per_pixel as usize * abs_width + 31) / 32) * 4;

    // Output: [width, height, rgba_data...]
    let mut output = Vec::with_capacity(8 + abs_width * abs_height * 4);

    // Write dimensions as first 8 bytes
    output.extend_from_slice(&(abs_width as u32).to_le_bytes());
    output.extend_from_slice(&(abs_height as u32).to_le_bytes());

    // Decode pixels
    for y in 0..abs_height {
        let src_y = if top_down { y } else { abs_height - 1 - y };
        let src_row_offset = data_offset + src_y * row_stride;

        for x in 0..abs_width {
            let (r, g, b, a) = match bits_per_pixel {
                1 => {
                    let byte_idx = src_row_offset + x / 8;
                    let bit_idx = 7 - (x % 8);
                    let color_idx = ((data[byte_idx] >> bit_idx) & 1) as usize;
                    let table = color_table.unwrap();
                    let table_idx = color_idx * 4;
                    (table[table_idx + 2], table[table_idx + 1], table[table_idx], 255)
                }

                4 => {
                    let byte_idx = src_row_offset + x / 2;
                    let nibble = if x % 2 == 0 {
                        (data[byte_idx] >> 4) & 0x0f
                    } else {
                        data[byte_idx] & 0x0f
                    } as usize;
                    let table = color_table.unwrap();
                    let table_idx = nibble * 4;
                    (table[table_idx + 2], table[table_idx + 1], table[table_idx], 255)
                }

                8 => {
                    let color_idx = data[src_row_offset + x] as usize;
                    let table = color_table.unwrap();
                    let table_idx = color_idx * 4;
                    (table[table_idx + 2], table[table_idx + 1], table[table_idx], 255)
                }

                16 => {
                    let pixel_offset = src_row_offset + x * 2;
                    let pixel = read_u16_le(data, pixel_offset);
                    let r = (((pixel >> 10) & 0x1f) << 3) as u8;
                    let g = (((pixel >> 5) & 0x1f) << 3) as u8;
                    let b = ((pixel & 0x1f) << 3) as u8;
                    (r, g, b, 255)
                }

                24 => {
                    let pixel_offset = src_row_offset + x * 3;
                    (data[pixel_offset + 2], data[pixel_offset + 1], data[pixel_offset], 255)
                }

                32 => {
                    let pixel_offset = src_row_offset + x * 4;
                    if compression == BI_BITFIELDS {
                        let pixel = read_u32_le(data, pixel_offset);
                        (
                            apply_mask(pixel, r_mask),
                            apply_mask(pixel, g_mask),
                            apply_mask(pixel, b_mask),
                            if a_mask != 0 { apply_mask(pixel, a_mask) } else { 255 },
                        )
                    } else {
                        (data[pixel_offset + 2], data[pixel_offset + 1], data[pixel_offset], data[pixel_offset + 3])
                    }
                }

                _ => return Err(format!("Unsupported bits per pixel: {}", bits_per_pixel)),
            };

            output.push(r);
            output.push(g);
            output.push(b);
            output.push(a);
        }
    }

    Ok(output)
}

/// Apply bit mask and normalize to 0-255
#[inline]
fn apply_mask(value: u32, mask: u32) -> u8 {
    if mask == 0 {
        return 0;
    }

    // Find shift amount (trailing zeros)
    let shift = mask.trailing_zeros();

    // Count bits in mask
    let bits = mask.count_ones();

    // Extract value and scale to 8 bits
    let extracted = (value & mask) >> shift;
    if bits >= 8 {
        (extracted >> (bits - 8)) as u8
    } else {
        (extracted << (8 - bits)) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_mask() {
        assert_eq!(apply_mask(0x00ff0000, 0x00ff0000), 255);
        assert_eq!(apply_mask(0x00800000, 0x00ff0000), 128);
        assert_eq!(apply_mask(0x00000000, 0x00ff0000), 0);
    }
}
