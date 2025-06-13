/// Clamp a value between min and max
pub fn clamp<T: PartialOrd + Copy>(value: T, min: T, max: T) -> T {
    if value < min {
        min
    } else if value > max {
        max
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clamp() {
        assert_eq!(clamp(5, 0, 10), 5);
        assert_eq!(clamp(-5, 0, 10), 0);
        assert_eq!(clamp(15, 0, 10), 10);
    }

    #[test]
    fn test_clamp_float() {
        assert_eq!(clamp(5.5, 0.0, 10.0), 5.5);
        assert_eq!(clamp(-5.5, 0.0, 10.0), 0.0);
        assert_eq!(clamp(15.5, 0.0, 10.0), 10.0);
    }
}