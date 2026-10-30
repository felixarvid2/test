"""Grafen över hastigheten: ritas med cairo i en Gtk.DrawingArea."""

import math
from datetime import datetime

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("PangoCairo", "1.0")
from gi.repository import Gtk, Pango, PangoCairo  # noqa: E402

from .analysis import fmt_number  # noqa: E402
from .plotting import WEEKDAYS, nice_ceiling, segments, tick_label, time_ticks  # noqa: E402

DOWN = (0.21, 0.52, 0.89)   # GNOME blå 3
UP = (0.18, 0.76, 0.49)     # GNOME grön 4
BAD = (0.88, 0.11, 0.14)    # GNOME röd 3


class SpeedChart(Gtk.DrawingArea):
    """`set_data` tar en lista med mätningar (dictar med epoch, download_mbps, upload_mbps,
    ping_ms och `deviating`: en mängd avvikande mått)."""

    def __init__(self):
        super().__init__()
        self.set_content_height(260)
        self.set_hexpand(True)
        self.points = []
        self.start = self.end = 0.0
        self.max_gap = 3600
        self.hover = None
        self.set_draw_func(self._draw)
        motion = Gtk.EventControllerMotion()
        motion.connect("motion", self._on_motion)
        motion.connect("leave", self._on_leave)
        self.add_controller(motion)
        self.update_property([Gtk.AccessibleProperty.LABEL], ["Graf över nedladdning och uppladdning"])

    def set_data(self, points, start, end, max_gap):
        self.points = sorted(points, key=lambda p: p["epoch"])
        self.start, self.end = start, max(end, start + 60)
        self.max_gap = max_gap
        self.hover = None
        self.queue_draw()

    # ---------- geometri ----------

    def _frame(self, width, height):
        left, right, top, bottom = 52, 16, 14, 30
        return left, top, max(10, width - left - right), max(10, height - top - bottom)

    def _x(self, epoch, frame):
        left, _, w, _ = frame
        return left + w * (epoch - self.start) / (self.end - self.start)

    def _on_motion(self, _ctrl, x, _y):
        if not self.points:
            return
        frame = self._frame(self.get_width(), self.get_height())
        nearest = min(range(len(self.points)), key=lambda i: abs(self._x(self.points[i]["epoch"], frame) - x))
        if abs(self._x(self.points[nearest]["epoch"], frame) - x) > 40:
            nearest = None
        if nearest != self.hover:
            self.hover = nearest
            self.queue_draw()

    def _on_leave(self, _ctrl):
        if self.hover is not None:
            self.hover = None
            self.queue_draw()

    # ---------- ritning ----------

    def _text(self, cr, text, x, y, color, align="left", valign="middle", bold=False, size=None):
        layout = self.create_pango_layout(text)
        if bold or size:
            desc = self.get_pango_context().get_font_description().copy()
            if bold:
                desc.set_weight(Pango.Weight.BOLD)
            if size:
                desc.set_size(int(size * Pango.SCALE))
            layout.set_font_description(desc)
        tw, th = layout.get_pixel_size()
        if align == "right":
            x -= tw
        elif align == "center":
            x -= tw / 2
        if valign == "middle":
            y -= th / 2
        elif valign == "bottom":
            y -= th
        cr.set_source_rgba(*color)
        cr.move_to(x, y)
        PangoCairo.show_layout(cr, layout)
        return tw, th

    def _draw(self, _area, cr, width, height):
        fg = self.get_color()
        ink = (fg.red, fg.green, fg.blue)
        dim = (*ink, 0.55)
        frame = left, top, w, h = self._frame(width, height)

        if not self.points:
            self._text(cr, "Inga lyckade mätningar under perioden", width / 2, height / 2, dim, align="center")
            return

        peak = max(max(p["download_mbps"] or 0, p["upload_mbps"] or 0) for p in self.points)
        ymax = nice_ceiling(peak)

        def y(v):
            return top + h * (1 - (v or 0) / ymax)

        # rutnät och axlar
        cr.set_line_width(1)
        for i in range(5):
            v = ymax * i / 4
            py = round(y(v)) + 0.5
            cr.set_source_rgba(*ink, 0.10 if i else 0.25)
            cr.move_to(left, py)
            cr.line_to(left + w, py)
            cr.stroke()
            self._text(cr, fmt_number(v, 0 if ymax >= 10 else 1), left - 8, py, dim, align="right")
        ticks, step = time_ticks(self.start, self.end)
        for t in ticks:
            px = round(self._x(t, frame)) + 0.5
            cr.set_source_rgba(*ink, 0.06)
            cr.move_to(px, top)
            cr.line_to(px, top + h)
            cr.stroke()
            self._text(cr, tick_label(t, step), px, top + h + 8, dim, align="center", valign="top")

        cr.save()
        cr.rectangle(left, top - 8, w, h + 16)
        cr.clip()
        for key, color in (("download_mbps", DOWN), ("upload_mbps", UP)):
            for seg in segments(self.points, self.max_gap):
                pts = [(self._x(p["epoch"], frame), y(p[key])) for p in seg]
                if key == "download_mbps" and len(pts) > 1:  # mjuk yta under nedladdningen
                    cr.move_to(pts[0][0], top + h)
                    for px, py in pts:
                        cr.line_to(px, py)
                    cr.line_to(pts[-1][0], top + h)
                    cr.close_path()
                    cr.set_source_rgba(*color, 0.12)
                    cr.fill()
                cr.set_source_rgba(*color, 1)
                cr.set_line_width(2.2)
                cr.set_line_join(1)  # ROUND
                cr.set_line_cap(1)
                if len(pts) == 1:
                    cr.arc(pts[0][0], pts[0][1], 4, 0, 2 * math.pi)
                    cr.fill()
                    continue
                cr.move_to(*pts[0])
                for px, py in pts[1:]:
                    cr.line_to(px, py)
                cr.stroke()

        # avvikelser: ringa in det mått som avvek (avvikande ping markeras på nedladdningen)
        for p in self.points:
            keys = {k for k in p["deviating"] if k in ("download_mbps", "upload_mbps")}
            if p["deviating"] and not keys:
                keys = {"download_mbps"}
            for key in keys:
                px, py = self._x(p["epoch"], frame), y(p[key])
                cr.arc(px, py, 5, 0, 2 * math.pi)
                cr.set_source_rgba(1, 1, 1, 1)
                cr.fill_preserve()
                cr.set_source_rgba(*BAD, 1)
                cr.set_line_width(2.2)
                cr.stroke()
        cr.restore()

        if self.hover is not None:
            self._draw_hover(cr, self.points[self.hover], frame, y, ink, width)

    def _draw_hover(self, cr, p, frame, y, ink, width):
        left, top, w, h = frame
        px = self._x(p["epoch"], frame)
        cr.set_source_rgba(*ink, 0.35)
        cr.set_line_width(1)
        cr.move_to(round(px) + 0.5, top)
        cr.line_to(round(px) + 0.5, top + h)
        cr.stroke()
        for key, color in (("download_mbps", DOWN), ("upload_mbps", UP)):
            cr.arc(px, y(p[key]), 4.5, 0, 2 * math.pi)
            cr.set_source_rgba(*color, 1)
            cr.fill()

        dt = datetime.fromtimestamp(p["epoch"])
        lines = [
            (f"{WEEKDAYS[dt.weekday()]} {dt.day}/{dt.month} {dt:%H:%M}", ink, True),
            (f"Ned  {fmt_number(p['download_mbps'])} Mbit/s", DOWN, False),
            (f"Upp  {fmt_number(p['upload_mbps'])} Mbit/s", UP, False),
            (f"Ping  {fmt_number(p['ping_ms'])} ms", ink, False),
        ]
        if p["deviating"]:
            lines.append(("Avvikelse", BAD, True))
        pad, line_h, box_w = 10, 19, 170
        box_h = pad * 2 + line_h * len(lines)
        bx = px + 14 if px + 14 + box_w < width - 4 else px - 14 - box_w
        by = top + 4
        dark = sum(ink) > 1.5  # ljus text betyder mörkt tema
        cr.set_source_rgba(*((0.16, 0.16, 0.18) if dark else (1, 1, 1)), 0.97)
        _rounded(cr, bx, by, box_w, box_h, 8)
        cr.fill_preserve()
        cr.set_source_rgba(*ink, 0.15)
        cr.set_line_width(1)
        cr.stroke()
        for i, (text, color, bold) in enumerate(lines):
            self._text(cr, text, bx + pad, by + pad + i * line_h, (*color, 1), valign="top", bold=bold)


def _rounded(cr, x, y, w, h, r):
    cr.new_sub_path()
    cr.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    cr.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    cr.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    cr.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    cr.close_path()
