pub mod cardinal_direction;
pub mod clamp;
pub mod rect;
pub mod vector;

// Re-export commonly used items
pub use cardinal_direction::CardinalDirection;
pub use clamp::clamp;
pub use rect::Rect;
pub use vector::{is_path_equal, Path, Vector};

// Re-export glam for advanced math operations
pub use glam;