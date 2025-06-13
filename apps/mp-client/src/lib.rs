use wasm_bindgen::prelude::*;

// Use `wee_alloc` as the global allocator for smaller WASM binary size
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

/// Initialize the WASM application
#[wasm_bindgen(start)]
pub fn run() -> Result<(), JsValue> {
    // Set up panic hook for better error messages in development
    #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();

    // Log that the client has started
    web_sys::console::log_1(&"MP Game Client (Rust/WASM) initialized".into());
    
    // Get the document and create a simple UI
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();
    let body = document.body().unwrap();
    
    // Create main container
    let container = document.create_element("div")?;
    container.set_inner_html(r#"
        <h1>MP Game Client (Rust/WASM)</h1>
        <p>Welcome to the MP game!</p>
        <p id="counter">Counter: 0</p>
        <button id="increment">Increment</button>
        <div class="status">
            <p>Server connection: <span id="connection-status" style="color: red;">Disconnected</span></p>
        </div>
        <button id="connect">Connect to Server</button>
    "#);
    body.append_child(&container)?;
    
    // Set up event handlers
    setup_counter()?;
    setup_websocket_connection()?;
    
    Ok(())
}

/// Set up the counter functionality
fn setup_counter() -> Result<(), JsValue> {
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();
    
    let counter_display = document.get_element_by_id("counter").unwrap();
    let button = document.get_element_by_id("increment").unwrap();
    
    let counter = std::rc::Rc::new(std::cell::RefCell::new(0));
    
    let counter_clone = counter.clone();
    let counter_display_clone = counter_display.clone();
    
    let closure = Closure::wrap(Box::new(move |_: web_sys::Event| {
        let mut count = counter_clone.borrow_mut();
        *count += 1;
        counter_display_clone.set_inner_html(&format!("Counter: {}", *count));
    }) as Box<dyn FnMut(web_sys::Event)>);
    
    button.add_event_listener_with_callback("click", closure.as_ref().unchecked_ref())?;
    closure.forget();
    
    Ok(())
}

/// Set up WebSocket connection functionality
fn setup_websocket_connection() -> Result<(), JsValue> {
    let window = web_sys::window().unwrap();
    let document = window.document().unwrap();
    
    let connect_button = document.get_element_by_id("connect").unwrap();
    let status_span = document.get_element_by_id("connection-status").unwrap();
    
    let closure = Closure::wrap(Box::new(move |_: web_sys::Event| {
        // Try to connect to the WebSocket server
        let ws_url = "ws://localhost:3000/ws";
        match WebSocketConnection::new(ws_url) {
            Ok(_) => {
                status_span.set_inner_html("Connecting...");
                status_span.set_attribute("style", "color: orange;").unwrap();
            }
            Err(e) => {
                web_sys::console::log_1(&format!("Failed to connect: {:?}", e).into());
                status_span.set_inner_html("Connection Failed");
                status_span.set_attribute("style", "color: red;").unwrap();
            }
        }
    }) as Box<dyn FnMut(web_sys::Event)>);
    
    connect_button.add_event_listener_with_callback("click", closure.as_ref().unchecked_ref())?;
    closure.forget();
    
    Ok(())
}

/// WebSocket connection manager
pub struct WebSocketConnection {
    _ws: web_sys::WebSocket,
}

impl WebSocketConnection {
    pub fn new(url: &str) -> Result<Self, JsValue> {
        let ws = web_sys::WebSocket::new(url)?;
        
        // Set up event handlers
        let onopen = Closure::wrap(Box::new(move |_: web_sys::Event| {
            web_sys::console::log_1(&"WebSocket connected".into());
            if let Some(window) = web_sys::window() {
                if let Some(document) = window.document() {
                    if let Some(status) = document.get_element_by_id("connection-status") {
                        status.set_inner_html("Connected");
                        let _ = status.set_attribute("style", "color: green;");
                    }
                }
            }
        }) as Box<dyn FnMut(web_sys::Event)>);
        
        ws.set_onopen(Some(onopen.as_ref().unchecked_ref()));
        onopen.forget();

        let onmessage = Closure::wrap(Box::new(move |e: web_sys::MessageEvent| {
            if let Ok(txt) = e.data().dyn_into::<js_sys::JsString>() {
                web_sys::console::log_1(&format!("Received: {}", txt).into());
            }
        }) as Box<dyn FnMut(web_sys::MessageEvent)>);
        
        ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        onmessage.forget();

        let onerror = Closure::wrap(Box::new(move |_: web_sys::ErrorEvent| {
            web_sys::console::log_1(&"WebSocket error".into());
        }) as Box<dyn FnMut(web_sys::ErrorEvent)>);
        
        ws.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        onerror.forget();

        let onclose = Closure::wrap(Box::new(move |_: web_sys::CloseEvent| {
            web_sys::console::log_1(&"WebSocket closed".into());
            if let Some(window) = web_sys::window() {
                if let Some(document) = window.document() {
                    if let Some(status) = document.get_element_by_id("connection-status") {
                        status.set_inner_html("Disconnected");
                        let _ = status.set_attribute("style", "color: red;");
                    }
                }
            }
        }) as Box<dyn FnMut(web_sys::CloseEvent)>);
        
        ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        onclose.forget();

        Ok(Self { _ws: ws })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test_configure!(run_in_browser);

    #[wasm_bindgen_test]
    fn test_basic_functionality() {
        // Basic test to ensure the module loads
        web_sys::console::log_1(&"Test running".into());
    }
}