//! Image resize operations
//!
//! High-performance resize algorithms optimized for WASM.

use wasm_bindgen::prelude::*;

/// Resize algorithm
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub enum ResizeAlgorithm {
    Nearest = 0,
    Bilinear = 1,
    Bicubic = 2,
    Lanczos = 3,
}

/// Resize an RGBA image
#[wasm_bindgen]
pub fn resize(
    data: &[u8],
    src_width: u32,
    src_height: u32,
    dst_width: u32,
    dst_height: u32,
    algorithm: ResizeAlgorithm,
) -> Vec<u8> {
    match algorithm {
        ResizeAlgorithm::Nearest => resize_nearest(data, src_width, src_height, dst_width, dst_height),
        ResizeAlgorithm::Bilinear => resize_bilinear(data, src_width, src_height, dst_width, dst_height),
        ResizeAlgorithm::Bicubic => resize_bicubic(data, src_width, src_height, dst_width, dst_height),
        ResizeAlgorithm::Lanczos => resize_lanczos(data, src_width, src_height, dst_width, dst_height),
    }
}

fn resize_nearest(
    data: &[u8],
    src_width: u32,
    src_height: u32,
    dst_width: u32,
    dst_height: u32,
) -> Vec<u8> {
    let mut output = vec![0u8; (dst_width * dst_height * 4) as usize];

    let x_ratio = src_width as f64 / dst_width as f64;
    let y_ratio = src_height as f64 / dst_height as f64;

    for y in 0..dst_height {
        for x in 0..dst_width {
            let src_x = (x as f64 * x_ratio) as u32;
            let src_y = (y as f64 * y_ratio) as u32;

            let src_idx = ((src_y * src_width + src_x) * 4) as usize;
            let dst_idx = ((y * dst_width + x) * 4) as usize;

            output[dst_idx] = data[src_idx];
            output[dst_idx + 1] = data[src_idx + 1];
            output[dst_idx + 2] = data[src_idx + 2];
            output[dst_idx + 3] = data[src_idx + 3];
        }
    }

    output
}

fn resize_bilinear(
    data: &[u8],
    src_width: u32,
    src_height: u32,
    dst_width: u32,
    dst_height: u32,
) -> Vec<u8> {
    let mut output = vec![0u8; (dst_width * dst_height * 4) as usize];

    let x_ratio = (src_width as f64 - 1.0) / dst_width as f64;
    let y_ratio = (src_height as f64 - 1.0) / dst_height as f64;

    for y in 0..dst_height {
        for x in 0..dst_width {
            let src_x = x as f64 * x_ratio;
            let src_y = y as f64 * y_ratio;

            let x0 = src_x.floor() as u32;
            let y0 = src_y.floor() as u32;
            let x1 = (x0 + 1).min(src_width - 1);
            let y1 = (y0 + 1).min(src_height - 1);

            let fx = src_x - x0 as f64;
            let fy = src_y - y0 as f64;

            let dst_idx = ((y * dst_width + x) * 4) as usize;

            for c in 0..4 {
                let p00 = data[((y0 * src_width + x0) * 4) as usize + c] as f64;
                let p10 = data[((y0 * src_width + x1) * 4) as usize + c] as f64;
                let p01 = data[((y1 * src_width + x0) * 4) as usize + c] as f64;
                let p11 = data[((y1 * src_width + x1) * 4) as usize + c] as f64;

                let value = p00 * (1.0 - fx) * (1.0 - fy)
                    + p10 * fx * (1.0 - fy)
                    + p01 * (1.0 - fx) * fy
                    + p11 * fx * fy;

                output[dst_idx + c] = value.round() as u8;
            }
        }
    }

    output
}

fn resize_bicubic(
    data: &[u8],
    src_width: u32,
    src_height: u32,
    dst_width: u32,
    dst_height: u32,
) -> Vec<u8> {
    let mut output = vec![0u8; (dst_width * dst_height * 4) as usize];

    let x_ratio = src_width as f64 / dst_width as f64;
    let y_ratio = src_height as f64 / dst_height as f64;

    for y in 0..dst_height {
        for x in 0..dst_width {
            let src_x = x as f64 * x_ratio;
            let src_y = y as f64 * y_ratio;

            let x0 = src_x.floor() as i32;
            let y0 = src_y.floor() as i32;

            let fx = src_x - x0 as f64;
            let fy = src_y - y0 as f64;

            let dst_idx = ((y * dst_width + x) * 4) as usize;

            for c in 0..4 {
                let mut sum = 0.0;

                for j in -1..=2 {
                    for i in -1..=2 {
                        let px = (x0 + i).clamp(0, src_width as i32 - 1) as u32;
                        let py = (y0 + j).clamp(0, src_height as i32 - 1) as u32;

                        let p = data[((py * src_width + px) * 4) as usize + c] as f64;

                        let wx = cubic_weight(i as f64 - fx);
                        let wy = cubic_weight(j as f64 - fy);

                        sum += p * wx * wy;
                    }
                }

                output[dst_idx + c] = sum.round().clamp(0.0, 255.0) as u8;
            }
        }
    }

    output
}

#[inline]
fn cubic_weight(x: f64) -> f64 {
    let x = x.abs();
    if x < 1.0 {
        (1.5 * x - 2.5) * x * x + 1.0
    } else if x < 2.0 {
        ((-0.5 * x + 2.5) * x - 4.0) * x + 2.0
    } else {
        0.0
    }
}

fn resize_lanczos(
    data: &[u8],
    src_width: u32,
    src_height: u32,
    dst_width: u32,
    dst_height: u32,
) -> Vec<u8> {
    let mut output = vec![0u8; (dst_width * dst_height * 4) as usize];

    let x_ratio = src_width as f64 / dst_width as f64;
    let y_ratio = src_height as f64 / dst_height as f64;

    const A: i32 = 3; // Lanczos-3

    for y in 0..dst_height {
        for x in 0..dst_width {
            let src_x = x as f64 * x_ratio;
            let src_y = y as f64 * y_ratio;

            let x0 = src_x.floor() as i32;
            let y0 = src_y.floor() as i32;

            let fx = src_x - x0 as f64;
            let fy = src_y - y0 as f64;

            let dst_idx = ((y * dst_width + x) * 4) as usize;

            for c in 0..4 {
                let mut sum = 0.0;
                let mut weight_sum = 0.0;

                for j in -A + 1..=A {
                    for i in -A + 1..=A {
                        let px = (x0 + i).clamp(0, src_width as i32 - 1) as u32;
                        let py = (y0 + j).clamp(0, src_height as i32 - 1) as u32;

                        let p = data[((py * src_width + px) * 4) as usize + c] as f64;

                        let wx = lanczos_weight(i as f64 - fx, A as f64);
                        let wy = lanczos_weight(j as f64 - fy, A as f64);
                        let w = wx * wy;

                        sum += p * w;
                        weight_sum += w;
                    }
                }

                if weight_sum > 0.0 {
                    output[dst_idx + c] = (sum / weight_sum).round().clamp(0.0, 255.0) as u8;
                }
            }
        }
    }

    output
}

#[inline]
fn lanczos_weight(x: f64, a: f64) -> f64 {
    if x == 0.0 {
        1.0
    } else if x.abs() < a {
        let pi_x = std::f64::consts::PI * x;
        (a * (pi_x).sin() * (pi_x / a).sin()) / (pi_x * pi_x)
    } else {
        0.0
    }
}
