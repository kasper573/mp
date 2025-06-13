/// Function composition utilities

/// Compose two functions
pub fn compose<A, B, C, F1, F2>(f1: F1, f2: F2) -> impl Fn(A) -> C 
where 
    F1: Fn(A) -> B,
    F2: Fn(B) -> C,
{
    move |a| f2(f1(a))
}

/// Pipe operator - apply a function to a value
pub trait Pipe<T> {
    fn pipe<U, F>(self, f: F) -> U
    where
        F: FnOnce(T) -> U;
}

impl<T> Pipe<T> for T {
    fn pipe<U, F>(self, f: F) -> U
    where
        F: FnOnce(T) -> U,
    {
        f(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compose() {
        let add_one = |x: i32| x + 1;
        let multiply_two = |x: i32| x * 2;
        
        let composed = compose(add_one, multiply_two);
        assert_eq!(composed(5), 12); // (5 + 1) * 2
    }

    #[test]
    fn test_pipe() {
        let result = 5
            .pipe(|x| x + 1)
            .pipe(|x| x * 2);
        
        assert_eq!(result, 12);
    }
}