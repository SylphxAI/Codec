//! BMP codec implementation in pure Rust

mod decoder;
mod encoder;

pub use decoder::decode_bmp;
pub use encoder::encode_bmp;

use wasm_bindgen::prelude::*;

/// Decode BMP to RGBA
#[wasm_bindgen(js_name = decodeBmp)]
pub fn decode_bmp_js(data: &[u8]) -> Result<Vec<u8>, JsError> {
    decode_bmp(data).map_err(|e| JsError::new(&e))
}

/// Encode RGBA to BMP
#[wasm_bindgen(js_name = encodeBmp)]
pub fn encode_bmp_js(width: u32, height: u32, data: &[u8]) -> Result<Vec<u8>, JsError> {
    encode_bmp(width, height, data).map_err(|e| JsError::new(&e))
}

/// Get decoded image dimensions from BMP header
#[wasm_bindgen(js_name = getBmpDimensions)]
pub fn get_bmp_dimensions(data: &[u8]) -> Result<Vec<u32>, JsError> {
    if data.len() < 26 {
        return Err(JsError::new("BMP data too small"));
    }

    if data[0] != 0x42 || data[1] != 0x4D {
        return Err(JsError::new("Invalid BMP signature"));
    }

    let width = crate::utils::read_i32_le(data, 18).unsigned_abs();
    let height = crate::utils::read_i32_le(data, 22).unsigned_abs();

    Ok(vec![width, height])
}
