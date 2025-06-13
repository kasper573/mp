use glam::Vec2;
use serde::{Deserialize, Serialize};

/// 2D vector similar to the TypeScript Vector class
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vector {
    pub x: f32,
    pub y: f32,
}

impl Vector {
    /// Create a new vector
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    /// Zero vector
    pub fn zero() -> Self {
        Self { x: 0.0, y: 0.0 }
    }

    /// Calculate distance to another vector
    pub fn distance(&self, other: &Vector) -> f32 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }

    /// Add two vectors
    pub fn add(&self, other: &Vector) -> Vector {
        Vector {
            x: self.x + other.x,
            y: self.y + other.y,
        }
    }

    /// Scale vector by another vector
    pub fn scale(&self, other: &Vector) -> Vector {
        Vector {
            x: self.x * other.x,
            y: self.y * other.y,
        }
    }

    /// Round the vector components
    pub fn round(&self) -> Vector {
        Vector {
            x: self.x.round(),
            y: self.y.round(),
        }
    }

    /// Calculate angle to another vector
    pub fn angle(&self, other: &Vector) -> f32 {
        let dx = other.x - self.x;
        let dy = other.y - self.y;
        dy.atan2(dx)
    }

    /// Check if vector has fractional components
    pub fn is_fraction(&self, precision: f32) -> bool {
        (self.x - self.x.round()).abs() > precision || (self.y - self.y.round()).abs() > precision
    }

    /// Convert to glam Vec2 for advanced operations
    pub fn to_glam(&self) -> Vec2 {
        Vec2::new(self.x, self.y)
    }

    /// Create from glam Vec2
    pub fn from_glam(v: Vec2) -> Self {
        Self { x: v.x, y: v.y }
    }
}

impl std::fmt::Display for Vector {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:.1}, {:.1}", self.x, self.y)
    }
}

/// Path is a collection of vectors
pub type Path = Vec<Vector>;

/// Check if two paths are equal
pub fn is_path_equal(a: &Path, b: &Path) -> bool {
    a.len() == b.len() && a.iter().zip(b.iter()).all(|(v1, v2)| v1 == v2)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vector_creation() {
        let v = Vector::new(1.0, 2.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
    }

    #[test]
    fn test_vector_zero() {
        let v = Vector::zero();
        assert_eq!(v.x, 0.0);
        assert_eq!(v.y, 0.0);
    }

    #[test]
    fn test_vector_distance() {
        let v1 = Vector::new(0.0, 0.0);
        let v2 = Vector::new(3.0, 4.0);
        assert_eq!(v1.distance(&v2), 5.0);
    }

    #[test]
    fn test_vector_add() {
        let v1 = Vector::new(1.0, 2.0);
        let v2 = Vector::new(3.0, 4.0);
        let result = v1.add(&v2);
        assert_eq!(result, Vector::new(4.0, 6.0));
    }

    #[test]
    fn test_vector_scale() {
        let v1 = Vector::new(2.0, 3.0);
        let v2 = Vector::new(2.0, 3.0);
        let result = v1.scale(&v2);
        assert_eq!(result, Vector::new(4.0, 9.0));
    }

    #[test]
    fn test_vector_round() {
        let v = Vector::new(1.7, 2.3);
        let result = v.round();
        assert_eq!(result, Vector::new(2.0, 2.0));
    }

    #[test]
    fn test_vector_angle() {
        let v1 = Vector::new(0.0, 0.0);
        let v2 = Vector::new(1.0, 0.0);
        let angle = v1.angle(&v2);
        assert_eq!(angle, 0.0);
    }

    #[test]
    fn test_is_path_equal() {
        let path1 = vec![Vector::new(1.0, 2.0), Vector::new(3.0, 4.0)];
        let path2 = vec![Vector::new(1.0, 2.0), Vector::new(3.0, 4.0)];
        let path3 = vec![Vector::new(1.0, 2.0), Vector::new(3.0, 5.0)];
        
        assert!(is_path_equal(&path1, &path2));
        assert!(!is_path_equal(&path1, &path3));
    }
}