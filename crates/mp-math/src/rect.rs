use crate::vector::Vector;
use serde::{Deserialize, Serialize};

/// Rectangle structure similar to the TypeScript Rect class
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub position: Vector,
    pub size: Vector,
}

impl Rect {
    /// Create a new rectangle
    pub fn new(position: Vector, size: Vector) -> Self {
        Self { position, size }
    }

    /// Create from components
    pub fn from_components(x: f32, y: f32, width: f32, height: f32) -> Self {
        Self {
            position: Vector::new(x, y),
            size: Vector::new(width, height),
        }
    }

    /// Create from center and diameter
    pub fn from_diameter(center: Vector, diameter: f32) -> Self {
        let half_diameter = diameter / 2.0;
        Self::from_components(
            center.x - half_diameter,
            center.y - half_diameter,
            diameter,
            diameter,
        )
    }

    /// X coordinate
    pub fn x(&self) -> f32 {
        self.position.x
    }

    /// Y coordinate
    pub fn y(&self) -> f32 {
        self.position.y
    }

    /// Width
    pub fn width(&self) -> f32 {
        self.size.x
    }

    /// Height
    pub fn height(&self) -> f32 {
        self.size.y
    }

    /// Check if a point is contained within the rectangle
    pub fn contains(&self, point: &Vector) -> bool {
        point.x >= self.x()
            && point.x <= self.x() + self.width()
            && point.y >= self.y()
            && point.y <= self.y() + self.height()
    }

    /// Offset the rectangle by a vector
    pub fn offset(&self, offset: &Vector) -> Rect {
        Rect::new(self.position.add(offset), self.size)
    }

    /// Scale the rectangle
    pub fn scale(&self, scale: &Vector) -> Rect {
        Rect::new(self.position.scale(scale), self.size.scale(scale))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rect_creation() {
        let rect = Rect::from_components(1.0, 2.0, 3.0, 4.0);
        assert_eq!(rect.x(), 1.0);
        assert_eq!(rect.y(), 2.0);
        assert_eq!(rect.width(), 3.0);
        assert_eq!(rect.height(), 4.0);
    }

    #[test]
    fn test_rect_contains() {
        let rect = Rect::from_components(0.0, 0.0, 10.0, 10.0);
        assert!(rect.contains(&Vector::new(5.0, 5.0)));
        assert!(!rect.contains(&Vector::new(15.0, 5.0)));
    }

    #[test]
    fn test_rect_offset() {
        let rect = Rect::from_components(0.0, 0.0, 10.0, 10.0);
        let offset = rect.offset(&Vector::new(5.0, 5.0));
        assert_eq!(offset.x(), 5.0);
        assert_eq!(offset.y(), 5.0);
        assert_eq!(offset.width(), 10.0);
        assert_eq!(offset.height(), 10.0);
    }

    #[test]
    fn test_rect_scale() {
        let rect = Rect::from_components(1.0, 2.0, 3.0, 4.0);
        let scaled = rect.scale(&Vector::new(2.0, 3.0));
        assert_eq!(scaled.x(), 2.0);
        assert_eq!(scaled.y(), 6.0);
        assert_eq!(scaled.width(), 6.0);
        assert_eq!(scaled.height(), 12.0);
    }

    #[test]
    fn test_rect_from_diameter() {
        let center = Vector::new(5.0, 5.0);
        let rect = Rect::from_diameter(center, 4.0);
        assert_eq!(rect.x(), 3.0);
        assert_eq!(rect.y(), 3.0);
        assert_eq!(rect.width(), 4.0);
        assert_eq!(rect.height(), 4.0);
    }
}