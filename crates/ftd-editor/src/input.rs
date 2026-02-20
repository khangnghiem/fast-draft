//! Input abstraction layer.
//!
//! Normalizes mouse, touch, and stylus (Apple Pencil Pro) events
//! into a unified `InputEvent` enum consumed by tools.

/// A normalized input event from any pointing device.
#[derive(Debug, Clone)]
pub enum InputEvent {
    /// Pointer pressed (mouse down, touch start, pencil contact).
    PointerDown {
        x: f32,
        y: f32,
        /// Pressure from 0.0 (none) to 1.0 (max). Mouse is always 1.0.
        pressure: f32,
    },

    /// Pointer moved (mouse move, touch move, pencil move).
    PointerMove { x: f32, y: f32, pressure: f32 },

    /// Pointer released.
    PointerUp { x: f32, y: f32 },

    /// Scroll / pinch-zoom.
    Scroll {
        dx: f32,
        dy: f32,
        /// Zoom factor (1.0 = no change; >1 = zoom in).
        zoom: f32,
    },

    /// Keyboard shortcut.
    Key {
        key: String,
        ctrl: bool,
        shift: bool,
        alt: bool,
        meta: bool,
    },
}

/// Stylus-specific data (Apple Pencil Pro).
#[derive(Debug, Clone, Copy, Default)]
pub struct StylusData {
    /// Pressure 0.0 .. 1.0
    pub pressure: f32,
    /// Tilt angle in radians (0 = perpendicular to surface).
    pub tilt_x: f32,
    pub tilt_y: f32,
    /// Barrel roll angle (Apple Pencil Pro).
    pub roll: f32,
    /// Azimuth angle in radians.
    pub azimuth: f32,
    /// Altitude angle in radians.
    pub altitude: f32,
}

impl InputEvent {
    /// Create a PointerDown from a web PointerEvent.
    /// (Used when bridging from JS via wasm-bindgen.)
    pub fn from_pointer_down(x: f32, y: f32, pressure: f32) -> Self {
        Self::PointerDown { x, y, pressure }
    }

    pub fn from_pointer_move(x: f32, y: f32, pressure: f32) -> Self {
        Self::PointerMove { x, y, pressure }
    }

    pub fn from_pointer_up(x: f32, y: f32) -> Self {
        Self::PointerUp { x, y }
    }

    /// Extract position if this is a pointer event.
    pub fn position(&self) -> Option<(f32, f32)> {
        match self {
            Self::PointerDown { x, y, .. }
            | Self::PointerMove { x, y, .. }
            | Self::PointerUp { x, y } => Some((*x, *y)),
            _ => None,
        }
    }
}
