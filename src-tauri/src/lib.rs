//! Corkboard Studio — envoltorio de escritorio (Tauri v2).
//! Toda la aplicación es la versión web (React + tldraw) cargada en el WebView
//! del sistema (WebView2 en Windows), así que web y escritorio son idénticas.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error al iniciar Corkboard Studio");
}
