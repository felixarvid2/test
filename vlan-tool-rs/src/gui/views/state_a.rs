//! Tillstånd för flikarna Översikt, Fynd, Konfig och Regler samt globala funktioner
//! (kommandopalett, statusrad m.m.). Lagras i `App::sa`.

use crate::files::Stamp;
use crate::history::Point;
use std::time::Instant;

/// Ett fynd som en annan vy vill att Fynd-fliken ska markera.
pub struct FocusFinding {
    pub rule: String,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DevSort {
    Name,
    Grade,
}

pub struct StateA {
    pub palette_open: bool,
    pub palette_query: String,
    pub palette_sel: usize,
    pub help_open: bool,
    /// Fynd: visa hela nätet i stället för en enhet.
    pub all_devices: bool,
    pub group_by_rule: bool,
    /// Vilka nivåer som visas, indexerat med `Severity as usize`.
    pub sev_on: [bool; 5],
    pub focus: Option<FocusFinding>,
    /// Rulla fyndlistan till det markerade fyndet (efter pil- eller fokusbyte).
    pub scroll_to_selected: bool,
    pub cfg_search: String,
    pub cfg_match: usize,
    pub cfg_scroll: Option<usize>,
    pub rules_filter: String,
    pub rules_only_failing: bool,
    pub dev_sort: DevSort,
    pub dev_filter: String,
    /// Betygshistoriken för det öppna projektet.
    pub history: Vec<Point>,
    pub watch_stamp: Stamp,
    pub watch_checked: Instant,
    pub last_load: Option<Instant>,
    pub last_title: String,
    pub applied_zoom: f32,
}

impl Default for StateA {
    fn default() -> Self {
        StateA {
            palette_open: false,
            palette_query: String::new(),
            palette_sel: 0,
            help_open: false,
            all_devices: false,
            group_by_rule: false,
            sev_on: [true; 5],
            focus: None,
            scroll_to_selected: false,
            cfg_search: String::new(),
            cfg_match: 0,
            cfg_scroll: None,
            rules_filter: String::new(),
            rules_only_failing: false,
            dev_sort: DevSort::Name,
            dev_filter: String::new(),
            history: Vec::new(),
            watch_stamp: Stamp::new(),
            watch_checked: Instant::now(),
            last_load: None,
            last_title: String::new(),
            applied_zoom: 0.0,
        }
    }
}
