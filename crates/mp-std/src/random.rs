use std::hash::{Hash, Hasher};

/// Random number generator with seed support
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Create a new RNG with a seed
    pub fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    /// Create a new RNG from string seed
    pub fn from_string(seed: &str) -> Self {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        seed.hash(&mut hasher);
        Self::new(hasher.finish())
    }

    /// Generate next random number between 0.0 and 1.0
    pub fn next(&mut self) -> f64 {
        // Linear congruential generator
        self.state = self.state.wrapping_mul(1664525).wrapping_add(1013904223);
        (self.state as f64) / (u64::MAX as f64)
    }

    /// Choose one random element from an iterator
    pub fn one_of<T>(&mut self, iter: impl IntoIterator<Item = T>) -> Option<T> {
        let items: Vec<T> = iter.into_iter().collect();
        if items.is_empty() {
            return None;
        }
        let index = (self.next() * items.len() as f64) as usize;
        items.into_iter().nth(index)
    }

    /// Shuffle a vector
    pub fn shuffle<T>(&mut self, mut vec: Vec<T>) -> Vec<T> {
        for i in (1..vec.len()).rev() {
            let j = (self.next() * (i + 1) as f64) as usize;
            vec.swap(i, j);
        }
        vec
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rng_deterministic() {
        let mut rng1 = Rng::new(42);
        let mut rng2 = Rng::new(42);
        
        for _ in 0..10 {
            assert_eq!(rng1.next(), rng2.next());
        }
    }

    #[test]
    fn test_one_of() {
        let mut rng = Rng::new(42);
        let items = vec![1, 2, 3, 4, 5];
        let choice = rng.one_of(items.clone());
        assert!(choice.is_some());
        assert!(items.contains(&choice.unwrap()));
    }

    #[test]
    fn test_shuffle() {
        let mut rng = Rng::new(42);
        let items = vec![1, 2, 3, 4, 5];
        let shuffled = rng.shuffle(items.clone());
        
        // Should have same length
        assert_eq!(shuffled.len(), items.len());
        
        // Should contain all original items
        for item in &items {
            assert!(shuffled.contains(item));
        }
    }
}