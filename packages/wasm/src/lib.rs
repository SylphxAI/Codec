//! mconv-wasm: Pure Rust codec implementations compiled to WebAssembly
//!
//! Zero external dependencies for codec implementations.
//! All codecs written from scratch.

use wasm_bindgen::prelude::*;

pub mod bmp;
pub mod utils;

/// Initialize the WASM module
#[wasm_bindgen(start)]
pub fn init() {
    utils::set_panic_hook();
}

/// Get WASM module version
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Check if threading is available
#[wasm_bindgen]
pub fn has_threads() -> bool {
    #[cfg(feature = "threads")]
    {
        true
    }
    #[cfg(not(feature = "threads"))]
    {
        false
    }
}
