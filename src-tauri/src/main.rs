// Evita que se abra una consola extra en Windows (release)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    corkboard_studio_lib::run()
}
