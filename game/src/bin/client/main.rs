mod boot;
mod platform;
mod probe;
mod store;

// wasm-bindgen runs main during the page's `init()`; on native targets the browser imports panic.
fn main() {
    boot::run();
}
