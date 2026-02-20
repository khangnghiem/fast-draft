//! WGPU / Vello canvas setup.
//!
//! Initializes the GPU surface and Vello renderer.
//! On WASM: uses web-sys to get a canvas element.
//! On native: uses winit window + wgpu surface.

/// Canvas configuration.
pub struct CanvasConfig {
    pub width: u32,
    pub height: u32,
}

impl Default for CanvasConfig {
    fn default() -> Self {
        Self {
            width: 800,
            height: 600,
        }
    }
}

/// The main canvas renderer — wraps Vello + wgpu.
///
/// This is a placeholder struct; full implementation will initialize
/// wgpu adapter/device/surface and Vello renderer in later phases.
pub struct Canvas {
    pub config: CanvasConfig,
}

impl Canvas {
    pub fn new(config: CanvasConfig) -> Self {
        Self { config }
    }
}
