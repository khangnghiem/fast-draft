//! Input abstraction layer.
//!
//! Normalizes mouse, touch, and stylus (Apple Pencil Pro) events
//! into a unified `InputEvent` enum consumed by tools.

/// Pointer device type — used for adaptive hit radii and UI feedback.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum PointerType {
    /// Mouse or trackpad (tightest hit radius).
    #[default]
    Mouse,
    /// Touch / finger (largest hit radius — Apple HIG 44pt).
    Touch,
    /// Stylus / Apple Pencil (medium hit radius).
    Pen,
}

impl PointerType {
    /// Convert from JS numeric value: 0=mouse, 1=touch, 2=pen.
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Self::Touch,
            2 => Self::Pen,
            _ => Self::Mouse,
        }
    }

    /// Hit radius for node selection (scene-space pixels).
    pub fn node_hit_radius(self) -> f32 {
        const HIT_RADIUS_NODE_MOUSE: f32 = 0.0;
        const HIT_RADIUS_NODE_TOUCH: f32 = 12.0;
        const HIT_RADIUS_NODE_PEN: f32 = 4.0;

        match self {
            Self::Mouse => HIT_RADIUS_NODE_MOUSE, // Use exact bounds
            Self::Touch => HIT_RADIUS_NODE_TOUCH, // Expanded for fat-finger
            Self::Pen => HIT_RADIUS_NODE_PEN,     // Slightly expanded for pencil tip
        }
    }

    /// Hit radius for resize handle detection (scene-space pixels).
    pub fn handle_hit_radius(self) -> f32 {
        const HIT_RADIUS_HANDLE_MOUSE: f32 = 12.0;
        const HIT_RADIUS_HANDLE_TOUCH: f32 = 24.0;
        const HIT_RADIUS_HANDLE_PEN: f32 = 14.0;

        match self {
            Self::Mouse => HIT_RADIUS_HANDLE_MOUSE,
            Self::Touch => HIT_RADIUS_HANDLE_TOUCH,
            Self::Pen => HIT_RADIUS_HANDLE_PEN,
        }
    }

    /// Visual size of resize handles (CSS pixels).
    pub fn handle_visual_size(self) -> f32 {
        match self {
            Self::Mouse => 8.0,
            Self::Touch => 14.0,
            Self::Pen => 10.0,
        }
    }

    /// Whether to show only corner handles (skip midpoints).
    pub fn corners_only(self) -> bool {
        matches!(self, Self::Touch)
    }
}

/// Keyboard modifier state captured alongside any input event.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub meta: bool,
}

impl Modifiers {
    pub const NONE: Self = Self {
        shift: false,
        ctrl: false,
        alt: false,
        meta: false,
    };

    /// True if the platform "command" key is held (Cmd on macOS, Ctrl elsewhere).
    pub fn cmd(&self) -> bool {
        self.ctrl || self.meta
    }
}

/// A normalized input event from any pointing device.
#[derive(Debug, Clone)]
pub enum InputEvent {
    /// Pointer pressed (mouse down, touch start, pencil contact).
    PointerDown {
        x: f32,
        y: f32,
        /// Pressure from 0.0 (none) to 1.0 (max). Mouse is always 1.0.
        pressure: f32,
        modifiers: Modifiers,
    },

    /// Pointer moved (mouse move, touch move, pencil move).
    PointerMove {
        x: f32,
        y: f32,
        pressure: f32,
        modifiers: Modifiers,
    },

    /// Pointer released.
    PointerUp {
        x: f32,
        y: f32,
        modifiers: Modifiers,
    },

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

    /// Apple Pencil Pro stylus gesture.
    StylusGesture {
        gesture: StylusGestureKind,
        stylus: StylusData,
        modifiers: Modifiers,
    },
}

/// Apple Pencil Pro gesture types.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum StylusGestureKind {
    /// Squeeze gesture (Apple Pencil Pro barrel squeeze).
    Squeeze,
    /// Barrel roll — angle in radians.
    BarrelRoll { angle: f32 },
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
    pub fn from_pointer_down(x: f32, y: f32, pressure: f32, modifiers: Modifiers) -> Self {
        Self::PointerDown {
            x,
            y,
            pressure,
            modifiers,
        }
    }

    pub fn from_pointer_move(x: f32, y: f32, pressure: f32, modifiers: Modifiers) -> Self {
        Self::PointerMove {
            x,
            y,
            pressure,
            modifiers,
        }
    }

    pub fn from_pointer_up(x: f32, y: f32, modifiers: Modifiers) -> Self {
        Self::PointerUp { x, y, modifiers }
    }

    /// Create a Key event from JS keyboard event fields.
    pub fn from_key(key: String, ctrl: bool, shift: bool, alt: bool, meta: bool) -> Self {
        Self::Key {
            key,
            ctrl,
            shift,
            alt,
            meta,
        }
    }

    /// Extract position if this is a pointer event.
    pub fn position(&self) -> Option<(f32, f32)> {
        match self {
            Self::PointerDown { x, y, .. }
            | Self::PointerMove { x, y, .. }
            | Self::PointerUp { x, y, .. } => Some((*x, *y)),
            _ => None,
        }
    }

    /// Extract modifiers if this is a pointer or stylus event.
    pub fn modifiers(&self) -> Modifiers {
        match self {
            Self::PointerDown { modifiers, .. }
            | Self::PointerMove { modifiers, .. }
            | Self::PointerUp { modifiers, .. }
            | Self::StylusGesture { modifiers, .. } => *modifiers,
            Self::Key {
                ctrl,
                shift,
                alt,
                meta,
                ..
            } => Modifiers {
                ctrl: *ctrl,
                shift: *shift,
                alt: *alt,
                meta: *meta,
            },
            _ => Modifiers::NONE,
        }
    }
}
