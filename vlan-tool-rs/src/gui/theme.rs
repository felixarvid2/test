//! Färger, typsnitt och egna små widgets (betygsring, nivåetikett, kort).

use eframe::egui::{
    self, Align2, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Margin, Pos2, Rect, Response, RichText, Sense,
    Shadow, Stroke, Ui, Vec2,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use vlantool::finding::Severity;
use vlantool::report;

#[derive(Clone, Copy)]
pub struct Palette {
    pub bg: Color32,
    pub panel: Color32,
    pub card: Color32,
    pub raised: Color32,
    pub line: Color32,
    pub text: Color32,
    pub muted: Color32,
    pub accent: Color32,
    pub violet: Color32,
    pub good: Color32,
    pub code_bg: Color32,
    /// Textfärg på knappar fyllda med accentfärgen.
    pub on_accent: Color32,
}

pub const DARK: Palette = Palette {
    bg: Color32::from_rgb(15, 18, 26),
    panel: Color32::from_rgb(20, 24, 34),
    card: Color32::from_rgb(26, 31, 44),
    raised: Color32::from_rgb(34, 40, 57),
    line: Color32::from_rgb(46, 54, 74),
    text: Color32::from_rgb(228, 232, 242),
    muted: Color32::from_rgb(138, 147, 168),
    accent: Color32::from_rgb(110, 155, 255),
    violet: Color32::from_rgb(184, 150, 255),
    good: Color32::from_rgb(96, 205, 135),
    code_bg: Color32::from_rgb(18, 21, 30),
    on_accent: Color32::WHITE,
};

pub const LIGHT: Palette = Palette {
    bg: Color32::from_rgb(241, 243, 248),
    panel: Color32::from_rgb(248, 249, 252),
    card: Color32::from_rgb(255, 255, 255),
    raised: Color32::from_rgb(233, 237, 246),
    line: Color32::from_rgb(220, 224, 234),
    text: Color32::from_rgb(28, 32, 48),
    muted: Color32::from_rgb(104, 112, 134),
    accent: Color32::from_rgb(58, 104, 236),
    violet: Color32::from_rgb(124, 82, 220),
    good: Color32::from_rgb(34, 150, 90),
    code_bg: Color32::from_rgb(246, 247, 251),
    on_accent: Color32::WHITE,
};

/// Högkontrast: svart botten, vit text och skarpa linjer (bygger på det mörka temat).
pub const CONTRAST: Palette = Palette {
    bg: Color32::from_rgb(0, 0, 0),
    panel: Color32::from_rgb(8, 8, 8),
    card: Color32::from_rgb(14, 14, 14),
    raised: Color32::from_rgb(44, 44, 44),
    line: Color32::from_rgb(190, 190, 190),
    text: Color32::from_rgb(255, 255, 255),
    muted: Color32::from_rgb(210, 210, 210),
    accent: Color32::from_rgb(255, 214, 10),
    violet: Color32::from_rgb(230, 190, 255),
    good: Color32::from_rgb(90, 255, 140),
    code_bg: Color32::from_rgb(0, 0, 0),
    on_accent: Color32::from_rgb(0, 0, 0),
};

/// Högkontrast är ett läge av det mörka temat, så `palette(true)` ger rätt färger
/// även i vyer som bara känner till ljust/mörkt.
static HIGH_CONTRAST: AtomicBool = AtomicBool::new(false);

pub fn set_high_contrast(on: bool) {
    HIGH_CONTRAST.store(on, Ordering::Relaxed);
}

pub fn palette(dark: bool) -> Palette {
    if !dark {
        LIGHT
    } else if HIGH_CONTRAST.load(Ordering::Relaxed) {
        CONTRAST
    } else {
        DARK
    }
}

fn rgb((r, g, b): (u8, u8, u8)) -> Color32 {
    Color32::from_rgb(r, g, b)
}

pub fn sev_color(s: Severity, dark: bool) -> Color32 {
    let c = rgb(s.rgb());
    if dark { c } else { darken(c, 0.78) }
}

pub fn score_color(score: u32, dark: bool) -> Color32 {
    let c = rgb(report::score_rgb(score));
    if dark { c } else { darken(c, 0.8) }
}

fn darken(c: Color32, f: f32) -> Color32 {
    Color32::from_rgb((c.r() as f32 * f) as u8, (c.g() as f32 * f) as u8, (c.b() as f32 * f) as u8)
}

/// Färg per VLAN så att samma VLAN känns igen i alla vyer.
pub fn vlan_color(vlan: u16, dark: bool) -> Color32 {
    const HUES: [(u8, u8, u8); 8] =
        [(110, 155, 255), (240, 120, 140), (96, 205, 135), (184, 150, 255), (240, 190, 80), (245, 150, 90), (80, 200, 210), (170, 200, 90)];
    let c = rgb(HUES[vlan as usize % HUES.len()]);
    if dark { c } else { darken(c, 0.75) }
}

pub fn alpha(c: Color32, a: f32) -> Color32 {
    Color32::from_rgba_unmultiplied(c.r(), c.g(), c.b(), (a * 255.0) as u8)
}

/// Lägger till ett systemtypsnitt som reserv för symboler (✔ ⇄ ◆ …) om det finns.
pub fn install_fonts(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    let candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansSymbols2-Regular.ttf",
    ];
    for (i, path) in candidates.iter().enumerate() {
        if let Ok(bytes) = std::fs::read(path) {
            let name = format!("fallback-{i}");
            fonts.font_data.insert(name.clone(), Arc::new(FontData::from_owned(bytes)));
            for family in [FontFamily::Proportional, FontFamily::Monospace] {
                fonts.families.entry(family).or_default().push(name.clone());
            }
        }
    }
    let mono = ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", "/usr/share/fonts/TTF/DejaVuSansMono.ttf"];
    if let Some(bytes) = mono.iter().find_map(|p| std::fs::read(p).ok()) {
        fonts.font_data.insert("mono".into(), Arc::new(FontData::from_owned(bytes)));
        fonts.families.entry(FontFamily::Monospace).or_default().insert(0, "mono".into());
    }
    ctx.set_fonts(fonts);
}

pub fn apply(ctx: &egui::Context, dark: bool) {
    let p = palette(dark);
    ctx.set_theme(if dark { egui::Theme::Dark } else { egui::Theme::Light });
    let theme = if dark { egui::Theme::Dark } else { egui::Theme::Light };
    ctx.style_mut_of(theme, |style| {
        style.spacing.item_spacing = Vec2::new(8.0, 6.0);
        style.spacing.button_padding = Vec2::new(12.0, 6.0);
        style.spacing.interact_size.y = 28.0;
        style.spacing.window_margin = Margin::same(16);
        style.text_styles.insert(egui::TextStyle::Body, FontId::proportional(14.5));
        style.text_styles.insert(egui::TextStyle::Button, FontId::proportional(14.0));
        style.text_styles.insert(egui::TextStyle::Heading, FontId::proportional(22.0));
        style.text_styles.insert(egui::TextStyle::Monospace, FontId::monospace(13.0));
        style.text_styles.insert(egui::TextStyle::Small, FontId::proportional(12.0));

        let v = &mut style.visuals;
        v.panel_fill = p.panel;
        v.window_fill = p.card;
        v.extreme_bg_color = p.code_bg;
        v.faint_bg_color = p.raised;
        v.code_bg_color = p.code_bg;
        v.override_text_color = Some(p.text);
        v.hyperlink_color = p.accent;
        v.window_stroke = Stroke::new(1.0, p.line);
        v.window_corner_radius = CornerRadius::same(14);
        v.menu_corner_radius = CornerRadius::same(10);
        v.window_shadow = Shadow { offset: [0, 8], blur: 28, spread: 0, color: Color32::from_black_alpha(if dark { 120 } else { 40 }) };
        v.popup_shadow = Shadow { offset: [0, 6], blur: 18, spread: 0, color: Color32::from_black_alpha(if dark { 110 } else { 30 }) };
        v.selection.bg_fill = alpha(p.accent, 0.35);
        v.selection.stroke = Stroke::new(1.0, p.accent);

        let r = CornerRadius::same(8);
        let w = &mut v.widgets;
        w.noninteractive.bg_fill = p.card;
        w.noninteractive.weak_bg_fill = p.card;
        w.noninteractive.bg_stroke = Stroke::new(1.0, p.line);
        w.noninteractive.fg_stroke = Stroke::new(1.0, p.text);
        w.noninteractive.corner_radius = r;
        w.inactive.bg_fill = p.raised;
        w.inactive.weak_bg_fill = p.raised;
        w.inactive.bg_stroke = Stroke::new(1.0, p.line);
        w.inactive.fg_stroke = Stroke::new(1.0, p.text);
        w.inactive.corner_radius = r;
        w.hovered.bg_fill = alpha(p.accent, 0.22);
        w.hovered.weak_bg_fill = alpha(p.accent, 0.18);
        w.hovered.bg_stroke = Stroke::new(1.0, alpha(p.accent, 0.7));
        w.hovered.fg_stroke = Stroke::new(1.5, p.text);
        w.hovered.corner_radius = r;
        w.active.bg_fill = alpha(p.accent, 0.35);
        w.active.weak_bg_fill = alpha(p.accent, 0.3);
        w.active.bg_stroke = Stroke::new(1.0, p.accent);
        w.active.fg_stroke = Stroke::new(1.5, p.text);
        w.active.corner_radius = r;
        w.open = w.active;
        if p.line == CONTRAST.line {
            for ws in [&mut w.noninteractive, &mut w.inactive] {
                ws.bg_stroke = Stroke::new(1.5, p.line);
            }
            v.selection.bg_fill = alpha(p.accent, 0.5);
            v.window_stroke = Stroke::new(2.0, p.line);
        }
    });
}

/// Ett kort med rundade hörn.
pub fn card(dark: bool) -> egui::Frame {
    let p = palette(dark);
    egui::Frame::new()
        .fill(p.card)
        .stroke(Stroke::new(1.0, p.line))
        .corner_radius(CornerRadius::same(14))
        .inner_margin(Margin::same(16))
}

pub fn section_title(ui: &mut Ui, text: &str, dark: bool) {
    ui.label(RichText::new(text).size(16.0).strong().color(palette(dark).text));
    ui.add_space(4.0);
}

/// Cirkel som visar betyget 0–100.
pub fn score_ring(ui: &mut Ui, score: u32, size: f32, dark: bool) -> Response {
    let (rect, resp) = ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
    let p = palette(dark);
    let painter = ui.painter_at(rect.expand(2.0));
    let c = rect.center();
    let width = (size * 0.1).max(3.0);
    let r = size / 2.0 - width / 2.0 - 1.0;
    painter.circle_stroke(c, r, Stroke::new(width, p.raised));
    let frac = score as f32 / 100.0;
    if frac > 0.0 {
        let n = (64.0 * frac).ceil() as usize + 1;
        let start = -std::f32::consts::FRAC_PI_2;
        let points: Vec<Pos2> = (0..n)
            .map(|i| {
                let a = start + std::f32::consts::TAU * frac * i as f32 / (n - 1) as f32;
                c + Vec2::new(a.cos(), a.sin()) * r
            })
            .collect();
        painter.add(egui::Shape::line(points, Stroke::new(width, score_color(score, dark))));
    }
    painter.text(c, Align2::CENTER_CENTER, score.to_string(), FontId::proportional(size * 0.3), p.text);
    resp
}

/// Liten färgad etikett för en allvarlighetsnivå.
pub fn sev_chip(ui: &mut Ui, s: Severity, dark: bool) -> Response {
    chip(ui, &format!("{} {}", s.icon(), s.label()), sev_color(s, dark))
}

pub fn chip(ui: &mut Ui, text: &str, color: Color32) -> Response {
    egui::Frame::new()
        .fill(alpha(color, 0.16))
        .corner_radius(CornerRadius::same(255))
        .inner_margin(Margin::symmetric(8, 2))
        .show(ui, |ui| ui.label(RichText::new(text).size(11.5).strong().color(color)))
        .response
}

/// Stor siffra med etikett under, med en färgad kant överst.
pub fn stat_tile(ui: &mut Ui, value: &str, label: &str, color: Color32, dark: bool, width: f32) {
    let p = palette(dark);
    let resp = card(dark).inner_margin(Margin::symmetric(14, 12)).show(ui, |ui| {
        ui.set_width(width - 30.0);
        ui.label(RichText::new(value).size(26.0).strong().color(color));
        ui.label(RichText::new(label).size(12.0).color(p.muted));
    });
    let r = resp.response.rect;
    ui.painter().rect_filled(
        Rect::from_min_size(r.min + Vec2::new(10.0, 0.0), Vec2::new(r.width() - 20.0, 3.0)),
        CornerRadius::same(2),
        color,
    );
}

/// Knapp i accentfärg.
pub fn primary_button(ui: &mut Ui, text: &str, dark: bool) -> Response {
    let p = palette(dark);
    ui.add(
        egui::Button::new(RichText::new(text).strong().color(p.on_accent))
            .fill(p.accent)
            .stroke(Stroke::NONE)
            .corner_radius(CornerRadius::same(8)),
    )
}
