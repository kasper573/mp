use serde::{Deserialize, Serialize};

/// Cardinal directions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CardinalDirection {
    North,
    South,
    East,
    West,
    NorthEast,
    NorthWest,
    SouthEast,
    SouthWest,
}

impl CardinalDirection {
    /// Get all 8 directions
    pub fn all() -> &'static [CardinalDirection] {
        &[
            CardinalDirection::North,
            CardinalDirection::NorthEast,
            CardinalDirection::East,
            CardinalDirection::SouthEast,
            CardinalDirection::South,
            CardinalDirection::SouthWest,
            CardinalDirection::West,
            CardinalDirection::NorthWest,
        ]
    }

    /// Get the 4 cardinal directions
    pub fn cardinal() -> &'static [CardinalDirection] {
        &[
            CardinalDirection::North,
            CardinalDirection::East,
            CardinalDirection::South,
            CardinalDirection::West,
        ]
    }

    /// Get the opposite direction
    pub fn opposite(&self) -> CardinalDirection {
        match self {
            CardinalDirection::North => CardinalDirection::South,
            CardinalDirection::South => CardinalDirection::North,
            CardinalDirection::East => CardinalDirection::West,
            CardinalDirection::West => CardinalDirection::East,
            CardinalDirection::NorthEast => CardinalDirection::SouthWest,
            CardinalDirection::NorthWest => CardinalDirection::SouthEast,
            CardinalDirection::SouthEast => CardinalDirection::NorthWest,
            CardinalDirection::SouthWest => CardinalDirection::NorthEast,
        }
    }

    /// Get the angle in radians
    pub fn angle(&self) -> f32 {
        match self {
            CardinalDirection::North => -std::f32::consts::PI / 2.0,
            CardinalDirection::NorthEast => -std::f32::consts::PI / 4.0,
            CardinalDirection::East => 0.0,
            CardinalDirection::SouthEast => std::f32::consts::PI / 4.0,
            CardinalDirection::South => std::f32::consts::PI / 2.0,
            CardinalDirection::SouthWest => 3.0 * std::f32::consts::PI / 4.0,
            CardinalDirection::West => std::f32::consts::PI,
            CardinalDirection::NorthWest => -3.0 * std::f32::consts::PI / 4.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opposite() {
        assert_eq!(CardinalDirection::North.opposite(), CardinalDirection::South);
        assert_eq!(CardinalDirection::East.opposite(), CardinalDirection::West);
        assert_eq!(CardinalDirection::NorthEast.opposite(), CardinalDirection::SouthWest);
    }

    #[test]
    fn test_all_directions() {
        assert_eq!(CardinalDirection::all().len(), 8);
    }

    #[test]
    fn test_cardinal_directions() {
        assert_eq!(CardinalDirection::cardinal().len(), 4);
    }

    #[test]
    fn test_angle() {
        assert_eq!(CardinalDirection::East.angle(), 0.0);
        assert_eq!(CardinalDirection::South.angle(), std::f32::consts::PI / 2.0);
    }
}