//! BMP encoder - pure Rust implementation

use crate::utils::{write_u16_le, write_u32_le};

/// Encode RGBA pixel data to BMP format (32-bit with alpha)
pub fn encode_bmp(width: u32, height: u32, data: &[u8]) -> Result<Vec<u8>, String> {
    let expected_len = (width * height * 4) as usize;
    if data.len() != expected_len {
        return Err(format!(
            "Data length mismatch: expected {}, got {}",
            expected_len,
            data.len()
        ));
    }

    // BITMAPV4HEADER for alpha support
    let header_size: u32 = 14; // File header
    let dib_size: u32 = 108; // BITMAPV4HEADER
    let data_offset = header_size + dib_size;

    // Row stride (32-bit = 4 bytes per pixel, already 4-byte aligned)
    let row_stride = width * 4;
    let pixel_data_size = row_stride * height;

    let file_size = data_offset + pixel_data_size;
    let mut output = vec![0u8; file_size as usize];

    // File header (14 bytes)
    output[0] = 0x42; // 'B'
    output[1] = 0x4D; // 'M'
    write_u32_le(&mut output, 2, file_size);
    write_u16_le(&mut output, 6, 0); // Reserved
    write_u16_le(&mut output, 8, 0); // Reserved
    write_u32_le(&mut output, 10, data_offset);

    // BITMAPV4HEADER (108 bytes)
    write_u32_le(&mut output, 14, dib_size);
    write_u32_le(&mut output, 18, width);
    write_u32_le(&mut output, 22, height); // Positive = bottom-up
    write_u16_le(&mut output, 26, 1); // Planes
    write_u16_le(&mut output, 28, 32); // Bits per pixel
    write_u32_le(&mut output, 30, 3); // BI_BITFIELDS
    write_u32_le(&mut output, 34, pixel_data_size);
    write_u32_le(&mut output, 38, 2835); // X pixels per meter (~72 DPI)
    write_u32_le(&mut output, 42, 2835); // Y pixels per meter
    write_u32_le(&mut output, 46, 0); // Colors used
    write_u32_le(&mut output, 50, 0); // Important colors

    // Bit masks for RGBA
    write_u32_le(&mut output, 54, 0x00ff0000); // Red mask
    write_u32_le(&mut output, 58, 0x0000ff00); // Green mask
    write_u32_le(&mut output, 62, 0x000000ff); // Blue mask
    write_u32_le(&mut output, 66, 0xff000000); // Alpha mask

    // Color space (LCS_sRGB)
    write_u32_le(&mut output, 70, 0x73524742); // 'sRGB'

    // CIEXYZTRIPLE endpoints and gamma values (48 bytes total) - zeros for sRGB
    // Already zeroed by vec![0u8; ...]

    // Write pixel data (bottom-up)
    let data_start = data_offset as usize;
    for y in 0..height as usize {
        let src_y = (height as usize) - 1 - y; // Flip vertically
        let src_row_offset = src_y * (width as usize) * 4;
        let dst_row_offset = data_start + y * (row_stride as usize);

        for x in 0..width as usize {
            let src_idx = src_row_offset + x * 4;
            let dst_idx = dst_row_offset + x * 4;

            // RGBA -> BGRA
            output[dst_idx] = data[src_idx + 2]; // B
            output[dst_idx + 1] = data[src_idx + 1]; // G
            output[dst_idx + 2] = data[src_idx]; // R
            output[dst_idx + 3] = data[src_idx + 3]; // A
        }
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bmp::decoder::decode_bmp;

    #[test]
    fn test_roundtrip() {
        let width = 2u32;
        let height = 2u32;
        let data = vec![
            255, 0, 0, 255,     // Red
            0, 255, 0, 255,     // Green
            0, 0, 255, 255,     // Blue
            255, 255, 255, 255, // White
        ];

        let encoded = encode_bmp(width, height, &data).unwrap();

        // Check signature
        assert_eq!(encoded[0], 0x42);
        assert_eq!(encoded[1], 0x4D);

        let decoded = decode_bmp(&encoded).unwrap();

        // First 8 bytes are dimensions
        let dec_width = u32::from_le_bytes([decoded[0], decoded[1], decoded[2], decoded[3]]);
        let dec_height = u32::from_le_bytes([decoded[4], decoded[5], decoded[6], decoded[7]]);

        assert_eq!(dec_width, width);
        assert_eq!(dec_height, height);
        assert_eq!(&decoded[8..], &data[..]);
    }
}
