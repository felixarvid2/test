//! vlantool-gui – skrivbordsprogrammet.
//!
//! Start: `vlantool-gui [projektmapp]`. Utan mapp öppnas det senaste projektet,
//! eller en välkomstsida som kan skapa ett exempelprojekt.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod folder;
mod theme;
mod views;

use eframe::egui;
use std::path::PathBuf;

const ICON: &[u8] = include_bytes!("../../packaging/icons/256x256/vlantool.png");

fn main() -> eframe::Result {
    let start = std::env::args_os().nth(1).map(PathBuf::from).filter(|p| p.is_dir());
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("vlantool")
        .with_app_id("se.nordvik.vlantool")
        .with_inner_size([1360.0, 860.0])
        .with_min_inner_size([960.0, 600.0]);
    if let Ok(icon) = eframe::icon_data::from_png_bytes(ICON) {
        viewport = viewport.with_icon(icon);
    }
    let options = eframe::NativeOptions { viewport, ..Default::default() };
    eframe::run_native("vlantool", options, Box::new(move |cc| Ok(Box::new(app::App::new(cc, start)))))
}
