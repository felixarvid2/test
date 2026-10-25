//! Betygshistorik (punkt 151) och tidshjälpare. Historiken sparas i
//! `<projekt>/.vlantool/history.json` som en lista av `{tid, betyg}` där `tid` är
//! sekunder sedan 1970 (UTC).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Point {
    pub tid: u64,
    pub betyg: u32,
}

/// Äldre punkter än så här kastas bort så att filen inte växer i det oändliga.
pub const MAX_POINTS: usize = 200;

pub fn path(root: &Path) -> PathBuf {
    root.join(".vlantool").join("history.json")
}

/// Läser historiken; saknas filen eller är den trasig börjar historiken om.
pub fn load(root: &Path) -> Vec<Point> {
    std::fs::read_to_string(path(root)).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default()
}

pub fn save(root: &Path, points: &[Point]) -> std::io::Result<()> {
    let p = path(root);
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(p, serde_json::to_string_pretty(points).unwrap_or_else(|_| "[]".into()))
}

/// Lägger till en punkt om betyget skiljer sig från det senaste. Ger `true` om något lades till.
pub fn record(points: &mut Vec<Point>, tid: u64, betyg: u32) -> bool {
    if points.last().is_some_and(|p| p.betyg == betyg) {
        return false;
    }
    points.push(Point { tid, betyg });
    if points.len() > MAX_POINTS {
        points.drain(..points.len() - MAX_POINTS);
    }
    true
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// (år, månad, dag, timme, minut, sekund) i UTC.
pub fn civil(secs: u64) -> (i64, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let rem = (secs % 86_400) as u32;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d, rem / 3600, rem % 3600 / 60, rem % 60)
}

/// "2026-10-25 14:03" (UTC).
pub fn format_time(secs: u64) -> String {
    let (y, mo, d, h, mi, _) = civil(secs);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}")
}

/// "20261025-140301" – sorterar i tidsordning och går bra som mappnamn.
pub fn stamp(secs: u64) -> String {
    let (y, mo, d, h, mi, s) = civil(secs);
    format!("{y:04}{mo:02}{d:02}-{h:02}{mi:02}{s:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_formatting() {
        assert_eq!(format_time(0), "1970-01-01 00:00");
        assert_eq!(stamp(1_782_396_181), "20260625-140301");
        assert_eq!(format_time(951_782_400), "2000-02-29 00:00");
    }

    #[test]
    fn record_only_when_grade_changes() {
        let mut v = Vec::new();
        assert!(record(&mut v, 10, 80));
        assert!(!record(&mut v, 20, 80));
        assert!(record(&mut v, 30, 95));
        assert_eq!(v, vec![Point { tid: 10, betyg: 80 }, Point { tid: 30, betyg: 95 }]);
        for i in 0..300 {
            record(&mut v, 100 + i, (i % 2) as u32 * 10 + 1);
        }
        assert_eq!(v.len(), MAX_POINTS);
    }

    #[test]
    fn save_and_load_round_trip() {
        let dir = std::env::temp_dir().join(format!("vlantool-hist-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        assert!(load(&dir).is_empty());
        let pts = vec![Point { tid: 5, betyg: 70 }];
        save(&dir, &pts).unwrap();
        assert_eq!(load(&dir), pts);
        let text = std::fs::read_to_string(path(&dir)).unwrap();
        assert!(text.contains("\"tid\"") && text.contains("\"betyg\""));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
