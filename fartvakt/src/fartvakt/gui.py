"""Appens fönster: status, mätningar, avvikelser och en graf."""

import queue
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from . import analysis, config, monitor, network, service
from .storage import Storage

REFRESH_MS = 10_000
POLL_MS = 200
ALL_NETWORKS = "Alla nätverk"
DOWN_COLOR = "#2563eb"
UP_COLOR = "#16a34a"
BAD_COLOR = "#dc2626"
GOOD_COLOR = "#d97706"


def when(ts):
    return ts[:19].replace("T", " ")


class App:
    def __init__(self, root):
        self.root = root
        self.cfg = config.load()
        self.db = Storage(config.db_path())
        self.results = queue.Queue()
        self.measuring = False
        self.ssid = None

        root.title("Fartvakt")
        root.geometry("960x620")
        root.minsize(720, 460)
        self._build()
        self.refresh()
        self.poll_results()
        threading.Thread(target=self._start_service, daemon=True).start()

    # ---------- uppbyggnad ----------

    def _build(self):
        top = ttk.Frame(self.root, padding=(12, 10, 12, 4))
        top.pack(fill="x")
        self.status_var = tk.StringVar()
        self.detail_var = tk.StringVar()
        info = ttk.Frame(top)
        info.pack(side="left", fill="x", expand=True)
        ttk.Label(info, textvariable=self.status_var, font=("TkDefaultFont", 12, "bold")).pack(anchor="w")
        ttk.Label(info, textvariable=self.detail_var).pack(anchor="w")
        self.measure_btn = ttk.Button(top, text="Mät nu", command=self.measure_now)
        self.measure_btn.pack(side="right", padx=(6, 0))
        ttk.Button(top, text="Inställningar", command=self.open_settings).pack(side="right", padx=(6, 0))
        ttk.Button(top, text="Exportera CSV", command=self.export_csv).pack(side="right")

        cards = ttk.Frame(self.root, padding=(12, 4))
        cards.pack(fill="x")
        self.card_vars = {}
        for i, (key, title) in enumerate([("download_mbps", "Nedladdning"), ("upload_mbps", "Uppladdning"),
                                          ("ping_ms", "Ping")]):
            frame = ttk.LabelFrame(cards, text=title, padding=(10, 4))
            frame.grid(row=0, column=i, sticky="ew", padx=(0 if i == 0 else 8, 0))
            cards.columnconfigure(i, weight=1)
            value, normal = tk.StringVar(value="–"), tk.StringVar(value="")
            ttk.Label(frame, textvariable=value, font=("TkDefaultFont", 16, "bold")).pack(anchor="w")
            ttk.Label(frame, textvariable=normal).pack(anchor="w")
            self.card_vars[key] = (value, normal)

        filter_row = ttk.Frame(self.root, padding=(12, 6, 12, 0))
        filter_row.pack(fill="x")
        ttk.Label(filter_row, text="Visa:").pack(side="left")
        self.filter_var = tk.StringVar(value=ALL_NETWORKS)
        self.filter_box = ttk.Combobox(filter_row, textvariable=self.filter_var, state="readonly", width=28)
        self.filter_box.pack(side="left", padx=6)
        self.filter_box.bind("<<ComboboxSelected>>", lambda _e: self.refresh())

        nb = ttk.Notebook(self.root, padding=(12, 6, 12, 12))
        nb.pack(fill="both", expand=True)

        self.meas_tree = self._tree(nb, "Mätningar", [
            ("tid", "Tid", 165), ("natverk", "Nätverk", 150), ("ned", "Ned (Mbit/s)", 100),
            ("upp", "Upp (Mbit/s)", 100), ("ping", "Ping (ms)", 80), ("kalla", "Källa", 70), ("status", "Status", 260)])
        self.meas_tree.tag_configure("bad", foreground=BAD_COLOR)
        self.meas_tree.tag_configure("good", foreground=GOOD_COLOR)

        self.dev_tree = self._tree(nb, "Avvikelser", [
            ("tid", "Tid", 165), ("natverk", "Nätverk", 150), ("matt", "Mått", 110), ("varde", "Uppmätt", 110),
            ("normalt", "Normalt", 110), ("andring", "Ändring", 80), ("typ", "Typ", 80)])
        self.dev_tree.tag_configure("sämre", foreground=BAD_COLOR)
        self.dev_tree.tag_configure("avbrott", foreground=BAD_COLOR)
        self.dev_tree.tag_configure("bättre", foreground=GOOD_COLOR)

        graph = ttk.Frame(nb)
        nb.add(graph, text="Graf")
        self.canvas = tk.Canvas(graph, background="white", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda _e: self.draw_graph())
        self.graph_data = []

    def _tree(self, nb, title, columns):
        frame = ttk.Frame(nb)
        nb.add(frame, text=title)
        tree = ttk.Treeview(frame, columns=[c[0] for c in columns], show="headings")
        for key, heading, width in columns:
            tree.heading(key, text=heading)
            tree.column(key, width=width, anchor="w", stretch=key in ("status", "natverk"))
        bar = ttk.Scrollbar(frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=bar.set)
        tree.pack(side="left", fill="both", expand=True)
        bar.pack(side="right", fill="y")
        return tree

    # ---------- data ----------

    def _start_service(self):
        service.ensure_running()

    def selected_network(self):
        value = self.filter_var.get()
        return None if value == ALL_NETWORKS else value

    def refresh(self):
        if getattr(self, "_refresh_job", None):
            self.root.after_cancel(self._refresh_job)
        self.cfg = config.load()
        threading.Thread(target=self._read_ssid, daemon=True).start()
        self._update_status()

        networks = self.db.networks()
        for net in self.cfg["networks"]:
            if net not in networks:
                networks.append(net)
        self.filter_box["values"] = [ALL_NETWORKS] + networks
        net = self.selected_network()
        measurements = self.db.measurements(limit=1000, ssid=net)
        deviations = [d for d in self.db.deviations(limit=1000) if net is None or d["ssid"] == net]

        by_measurement = {}
        for d in deviations:
            by_measurement.setdefault(d["measurement_id"], []).append(d)

        self.meas_tree.delete(*self.meas_tree.get_children())
        for m in measurements:
            devs = by_measurement.get(m["id"], [])
            if m.get("error"):
                status, tag = m["error"], "bad"
            elif devs:
                status = "Avvikelse: " + ", ".join(
                    f"{analysis.METRICS[d['metric']][0].lower()} {d['direction']}" for d in devs)
                tag = "bad" if any(d["direction"] == "sämre" for d in devs) else "good"
            else:
                status, tag = "Normal", ""
            self.meas_tree.insert("", "end", values=(
                when(m["ts"]), m["ssid"] or "–", analysis.fmt_number(m["download_mbps"]),
                analysis.fmt_number(m["upload_mbps"]), analysis.fmt_number(m["ping_ms"]),
                m["source"], status), tags=(tag,))

        self.dev_tree.delete(*self.dev_tree.get_children())
        for d in deviations:
            if d["metric"] == analysis.FAILURE:
                values = (when(d["ts"]), d["ssid"] or "–", "Anslutning", "–", "–", "–", d["direction"])
            else:
                name, unit, _, _ = analysis.METRICS[d["metric"]]
                values = (when(d["ts"]), d["ssid"] or "–", name, f"{analysis.fmt_number(d['value'])} {unit}",
                          f"{analysis.fmt_number(d['baseline'])} {unit}",
                          f"{'+' if d['change_percent'] > 0 else ''}{analysis.fmt_number(d['change_percent'], 0)} %",
                          d["direction"])
            self.dev_tree.insert("", "end", values=values, tags=(d["direction"],))

        self._update_cards(measurements, net)
        self.graph_data = [(m, {d["metric"] for d in by_measurement.get(m["id"], [])})
                           for m in reversed(measurements[:120]) if not m.get("error")]
        self.draw_graph()
        self._refresh_job = self.root.after(REFRESH_MS, self.refresh)

    def _read_ssid(self):
        ssid = network.current_ssid()
        self.results.put(("ssid", ssid))

    def _update_status(self):
        ssid = self.ssid
        if not self.cfg["monitoring_enabled"]:
            self.status_var.set("Bevakningen är pausad")
        elif network.matches(ssid, self.cfg["networks"]):
            self.status_var.set(f"● Bevakar {ssid} – mäter var {self.cfg['interval_minutes']}:e minut")
        else:
            self.status_var.set("Väntar på ett bevakat nätverk")
        detail = f"Anslutet till: {ssid or 'inget wifi'}   ·   Bevakade: {', '.join(self.cfg['networks']) or '(inga)'}"
        if self.measuring:
            detail = "Mäter … (tar 20–30 sekunder)   ·   " + detail
        self.detail_var.set(detail)

    def _update_cards(self, measurements, net):
        latest = next((m for m in measurements if not m.get("error")), None)
        history_net = net if net is not None else (latest["ssid"] if latest else None)
        history = self.db.history(history_net, self.cfg["baseline_count"]) if latest else []
        for key, (value, normal) in self.card_vars.items():
            _name, unit, _, _ = analysis.METRICS[key]
            value.set(f"{analysis.fmt_number(latest[key])} {unit}" if latest else "–")
            base, n = analysis.baseline(history, key)
            normal.set(f"Normalt {analysis.fmt_number(base)} {unit} ({n} mätn.)" if base is not None else
                       "Ingen mätning än")

    # ---------- graf ----------

    def draw_graph(self):
        c = self.canvas
        c.delete("all")
        w, h = c.winfo_width(), c.winfo_height()
        if w < 50 or h < 50:
            return
        data = self.graph_data
        if len(data) < 2:
            c.create_text(w / 2, h / 2, text="Grafen visas när det finns minst två mätningar.", fill="#555")
            return
        left, right, top, bottom = 60, 20, 30, 40
        peak = max(max(m["download_mbps"] or 0, m["upload_mbps"] or 0) for m, _ in data)
        ymax = _nice_ceiling(peak)
        pw, ph = w - left - right, h - top - bottom

        def x(i):
            return left + pw * i / (len(data) - 1)

        def y(v):
            return top + ph * (1 - (v or 0) / ymax)

        for step in range(6):
            v = ymax * step / 5
            c.create_line(left, y(v), w - right, y(v), fill="#e5e7eb")
            c.create_text(left - 8, y(v), text=analysis.fmt_number(v, 0), anchor="e", fill="#555")
        c.create_text(left, 12, text="Mbit/s", anchor="w", fill="#555")
        c.create_text(left, h - 18, text=when(data[0][0]["ts"]), anchor="w", fill="#555")
        c.create_text(w - right, h - 18, text=when(data[-1][0]["ts"]), anchor="e", fill="#555")

        for key, color in (("download_mbps", DOWN_COLOR), ("upload_mbps", UP_COLOR)):
            points = []
            for i, (m, _) in enumerate(data):
                points += [x(i), y(m[key])]
            c.create_line(*points, fill=color, width=2)
        for i, (m, metrics) in enumerate(data):
            # ringa in linjen som avvek; en avvikande ping markeras på nedladdningslinjen
            keys = {k for k in metrics if k in ("download_mbps", "upload_mbps")} or (
                {"download_mbps"} if metrics else set())
            for key in keys:
                px, py = x(i), y(m[key])
                c.create_oval(px - 5, py - 5, px + 5, py + 5, outline=BAD_COLOR, width=2)

        lx = w - right - 330
        for label, color in (("Nedladdning", DOWN_COLOR), ("Uppladdning", UP_COLOR), ("Avvikelse", BAD_COLOR)):
            if label == "Avvikelse":
                c.create_oval(lx, 8, lx + 10, 18, outline=color, width=2)
            else:
                c.create_line(lx, 13, lx + 16, 13, fill=color, width=3)
            c.create_text(lx + 20, 13, text=label, anchor="w", fill="#333")
            lx += 110

    # ---------- handlingar ----------

    def measure_now(self):
        if self.measuring:
            return
        self.measuring = True
        self.measure_btn.state(["disabled"])
        self._update_status()
        threading.Thread(target=self._measure_worker, daemon=True).start()

    def _measure_worker(self):
        try:
            storage = Storage(config.db_path())
            ssid = network.current_ssid()
            result = monitor.measure_and_store(config.load(), ssid, storage, "manuell")
            storage.close()
            self.results.put(("measured", result))
        except monitor.Busy:
            self.results.put(("busy", None))
        except Exception as e:  # noqa: BLE001
            self.results.put(("error", str(e)))

    def poll_results(self):
        """Tar emot resultat från bakgrundstrådarna (Tk får bara röras från huvudtråden)."""
        self.root.after(POLL_MS, self.poll_results)
        while True:
            try:
                kind, payload = self.results.get_nowait()
            except queue.Empty:
                break
            if kind == "ssid":
                self.ssid = payload
                self._update_status()
                continue
            self.measuring = False
            self.measure_btn.state(["!disabled"])
            if kind == "busy":
                messagebox.showinfo("Fartvakt", "En mätning pågår redan i bakgrunden. Försök igen om en stund.")
            elif kind == "error":
                messagebox.showerror("Fartvakt", f"Mätningen kunde inte göras:\n{payload}")
            else:
                m, deviations = payload
                if m.get("error"):
                    messagebox.showwarning("Fartvakt", f"Mätningen misslyckades:\n{m['error']}")
                elif deviations:
                    messagebox.showwarning("Avvikande hastighet",
                                           "\n".join(analysis.describe(d) for d in deviations))
            self.refresh()

    def export_csv(self):
        path = filedialog.asksaveasfilename(title="Exportera mätningar", defaultextension=".csv",
                                            initialfile="fartvakt.csv", filetypes=[("CSV", "*.csv")])
        if path:
            n = self.db.export_csv(path)
            messagebox.showinfo("Fartvakt", f"Sparade {n} mätningar i\n{path}")

    def open_settings(self):
        SettingsDialog(self.root, self.cfg, self.ssid, self.db, on_save=self.refresh)


class SettingsDialog:
    def __init__(self, parent, cfg, ssid, db, on_save):
        self.cfg, self.db, self.on_save = dict(cfg), db, on_save
        win = self.win = tk.Toplevel(parent)
        win.title("Inställningar")
        win.transient(parent)
        win.resizable(False, False)
        body = ttk.Frame(win, padding=14)
        body.pack(fill="both", expand=True)

        self.networks = tk.StringVar(value=", ".join(cfg["networks"]))
        self.enabled = tk.BooleanVar(value=cfg["monitoring_enabled"])
        self.interval = tk.IntVar(value=cfg["interval_minutes"])
        self.threshold = tk.IntVar(value=cfg["threshold_percent"])
        self.notify = tk.BooleanVar(value=cfg["notifications"])
        self.down_mb = tk.IntVar(value=max(1, cfg["download_bytes"] // 1_000_000))
        self.up_mb = tk.IntVar(value=max(1, cfg["upload_bytes"] // 1_000_000))

        row = 0
        ttk.Label(body, text="Bevakade nätverk (kommaseparerade):").grid(row=row, column=0, columnspan=2, sticky="w")
        row += 1
        ttk.Entry(body, textvariable=self.networks, width=44).grid(row=row, column=0, columnspan=2, sticky="ew")
        row += 1
        if ssid:
            ttk.Button(body, text=f"Lägg till nuvarande nätverk ({ssid})",
                       command=lambda: self._add_network(ssid)).grid(row=row, column=0, columnspan=2, sticky="w",
                                                                     pady=(4, 0))
            row += 1
        ttk.Checkbutton(body, text="Mät automatiskt på de bevakade nätverken", variable=self.enabled).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(10, 0))
        row += 1
        for label, var, lo, hi in (("Minuter mellan mätningar:", self.interval, 1, 1440),
                                   ("Avvikelse vid skillnad på (%):", self.threshold, 5, 95),
                                   ("Data per nedladdningstest (MB):", self.down_mb, 1, 500),
                                   ("Data per uppladdningstest (MB):", self.up_mb, 1, 200)):
            ttk.Label(body, text=label).grid(row=row, column=0, sticky="w", pady=(6, 0))
            ttk.Spinbox(body, from_=lo, to=hi, textvariable=var, width=8).grid(row=row, column=1, sticky="e",
                                                                               pady=(6, 0))
            row += 1
        ttk.Checkbutton(body, text="Visa en notis när hastigheten avviker", variable=self.notify).grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(10, 0))
        row += 1
        ttk.Label(body, text=f"Mätningarna sparas i {config.db_path()}", foreground="#555",
                  wraplength=380).grid(row=row, column=0, columnspan=2, sticky="w", pady=(10, 0))
        row += 1

        buttons = ttk.Frame(body)
        buttons.grid(row=row, column=0, columnspan=2, sticky="ew", pady=(14, 0))
        ttk.Button(buttons, text="Rensa alla mätningar …", command=self._clear).pack(side="left")
        ttk.Button(buttons, text="Spara", command=self._save).pack(side="right")
        ttk.Button(buttons, text="Avbryt", command=win.destroy).pack(side="right", padx=6)
        win.grab_set()

    def _add_network(self, ssid):
        current = [n.strip() for n in self.networks.get().split(",") if n.strip()]
        if not network.matches(ssid, current):
            current.append(ssid)
        self.networks.set(", ".join(current))

    def _save(self):
        try:
            values = (self.interval.get(), self.threshold.get(), self.down_mb.get(), self.up_mb.get())
        except tk.TclError:
            messagebox.showerror("Inställningar", "Fyll i heltal i alla sifferfält.", parent=self.win)
            return
        if min(values) <= 0:
            messagebox.showerror("Inställningar", "Värdena måste vara större än noll.", parent=self.win)
            return
        interval, threshold, down_mb, up_mb = values
        self.cfg.update(
            networks=[n.strip() for n in self.networks.get().split(",") if n.strip()],
            monitoring_enabled=self.enabled.get(),
            interval_minutes=interval,
            threshold_percent=threshold,
            download_bytes=down_mb * 1_000_000,
            upload_bytes=up_mb * 1_000_000,
            notifications=self.notify.get(),
        )
        config.save(self.cfg)
        self.win.destroy()
        self.on_save()

    def _clear(self):
        if messagebox.askyesno("Rensa", "Ta bort alla sparade mätningar och avvikelser?", parent=self.win):
            self.db.clear()
            self.on_save()


def _nice_ceiling(value):
    if value <= 0:
        return 10
    for step in (1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000):
        if value <= step * 5:
            return step * 5
    return value * 1.1


def main():
    root = tk.Tk()
    try:
        root.iconphoto(True, tk.PhotoImage(file="/usr/share/icons/hicolor/48x48/apps/fartvakt.png"))
    except tk.TclError:
        pass
    App(root)
    root.mainloop()
    return 0
