/*
 * Mosaic — editor (edit mode over the shared renderer)
 *
 * Direct manipulation: place an element, drag it, resize it, edit text in
 * place. No separate "wire it up" phase — what you put on the canvas IS the
 * course. The same document model feeds play mode and the SCORM export, so
 * what you build is exactly what ships.
 */
(function (global) {
  "use strict";

  var Model = global.MosaicModel;
  var Renderer = global.MosaicRenderer;
  var STORAGE_KEY = "mosaic.course.draft";
  var MIN = 24; // min element size (stage units)
  // Shared language list (course Language picker + Course settings). RTL ones flip the canvas.
  var LANGUAGES = [
    ["en", "English"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt", "Portuguese"],
    ["it", "Italian"], ["nl", "Dutch"], ["sv", "Swedish"], ["pl", "Polish"], ["ru", "Russian"],
    ["tr", "Turkish"], ["hi", "Hindi"], ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"],
    ["vi", "Vietnamese"], ["id", "Indonesian"], ["th", "Thai"],
    ["ar", "Arabic (RTL)"], ["he", "Hebrew (RTL)"], ["fa", "Persian (RTL)"], ["ur", "Urdu (RTL)"]
  ];

  function Editor(refs) {
    this.refs = refs;            // { stage, stageWrap, slideList, title, modeLabel }
    this.course = null;
    this.slideIndex = 0;
    this.selectedId = null;      // primary selection (drives the inspector)
    this.selectedIds = [];       // full selection set (multi-select)
    this.scale = 1;              // effective scale = fit * zoomLevel
    this.fitScale = 1;          // scale that fits the stage to the window
    this.zoomLevel = 1;         // user zoom multiplier (1 = fit; ⌘0 resets)
    this.mode = "edit";          // "edit" | "play"
    this.editingTextId = null;
  }

  Editor.prototype.boot = function () {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (saved) saved = this._inflate(saved); // lean drafts hold @media tokens; legacy full JSON passes through
    this.course = saved ? Model.deserialize(saved) : this.starterCourse();
    this.refs.title.value = this.course.title;
    this._past = []; this._future = []; this._snap = this._lean(Model.serialize(this.course)); // undo/redo
    var self = this;
    if (this.refs.timeline && global.MosaicTimeline) this.timeline = new global.MosaicTimeline(this);
    global.addEventListener("resize", function () {
      self.fitStage();
      if (self.timeline) self.timeline.render();
    });
    this.refs.stage.addEventListener("pointerdown", function (e) {
      if (e.button === 2) return; // right-click handled by contextmenu
      if (e.target === self.refs.stage && self.mode === "edit") self.beginMarquee(e); // drag empty = rubber-band select
    });
    this.refs.stage.addEventListener("contextmenu", function (e) {
      if (self.mode !== "edit") return;
      if (e.target === self.refs.stage) { e.preventDefault(); self.select(null); self.openContextMenu(e.clientX, e.clientY, false); }
    });
    this.renderAll();
  };

  // A new course starts as a blank canvas — no placeholder text.
  Editor.prototype.starterCourse = function () {
    return Model.makeCourse({
      title: "Untitled course",
      slides: [Model.makeSlide({ name: "Slide 1" })]
    });
  };

  // --- Media-lean history codec ----------------------------------------------
  // Undo snapshots, the localStorage draft, and recents used to carry every
  // image/audio data-URL verbatim: a media-heavy course re-serialized multi-MB
  // strings on EVERY edit and blew the localStorage quota (each of 6 recents +
  // the draft + 100 undo steps held its own full copy). Snapshots now swap big
  // data-URLs for @media:<n> tokens held ONCE in a side table. Disk Save and
  // all exports still use the full standard serialize() — files stay portable.
  var MEDIA_KEY = "mosaic.media.v1";
  Editor.prototype._mediaInit = function () {
    if (this._mediaById) return;
    this._mediaById = {}; this._mediaByUrl = {}; this._mediaSeq = 0; this._mediaDirty = false;
    try {
      var stored = JSON.parse(localStorage.getItem(MEDIA_KEY) || "{}");
      for (var id in stored) {
        this._mediaById[id] = stored[id];
        this._mediaByUrl[stored[id]] = id;
        var n = parseInt(id.slice(1), 10); if (n > this._mediaSeq) this._mediaSeq = n;
      }
    } catch (e) {}
  };
  Editor.prototype._lean = function (json) {
    this._mediaInit();
    var self = this;
    // Data-URLs are base64 + mime chars — never quotes/backslashes — so the
    // JSON string literal is verbatim and a string-level swap is safe.
    return json.replace(/"(data:[^"]{2048,})"/g, function (m, url) {
      var id = self._mediaByUrl[url];
      if (id == null) { id = "m" + (++self._mediaSeq); self._mediaByUrl[url] = id; self._mediaById[id] = url; self._mediaDirty = true; }
      return '"@media:' + id + '"';
    });
  };
  Editor.prototype._inflate = function (lean) {
    this._mediaInit();
    var self = this;
    return String(lean).replace(/"@media:(m\d+)"/g, function (m, id) {
      var url = self._mediaById[id];
      return url != null ? '"' + url + '"' : '""'; // missing media degrades to empty, not a crash
    });
  };
  Editor.prototype._persistMedia = function () {
    if (!this._mediaDirty) return;
    try { localStorage.setItem(MEDIA_KEY, JSON.stringify(this._mediaById)); this._mediaDirty = false; } catch (e) {}
  };

  // --- Persistence + history ------------------------------------------------
  Editor.prototype.persist = function () {
    this.course.title = this.refs.title.value || "Untitled course";
    try { localStorage.setItem(STORAGE_KEY, this._lean(Model.serialize(this.course))); } catch (e) {}
    this._persistMedia();
    this.pushRecent(); // keep the welcome screen's recents list fresh (throttled)
  };
  // save() commits a change: record the pre-change snapshot for undo, then persist.
  Editor.prototype.save = function () {
    if (this._snap != null) {
      this._past.push(this._snap);
      if (this._past.length > 100) this._past.shift();
      this._future = [];
    }
    this.persist();
    this._snap = this._lean(Model.serialize(this.course));
    this.updateHistoryButtons();
  };

  Editor.prototype.undo = function () {
    if (!this._past.length) return;
    this._future.push(this._lean(Model.serialize(this.course)));
    var prev = this._past.pop();
    this._restore(prev);
  };
  Editor.prototype.redo = function () {
    if (!this._future.length) return;
    this._past.push(this._lean(Model.serialize(this.course)));
    var next = this._future.pop();
    this._restore(next);
  };
  Editor.prototype._restore = function (snap) {
    this.course = Model.deserialize(this._inflate(snap));
    this._snap = snap;
    if (this.slideIndex >= this.course.slides.length) this.slideIndex = this.course.slides.length - 1;
    this.selectedId = null;
    this.editingTextId = null;
    this.refs.title.value = this.course.title;
    this.persist();
    this.renderAll();
    this.updateHistoryButtons();
  };
  Editor.prototype.updateHistoryButtons = function () {
    var u = document.getElementById("undo"), r = document.getElementById("redo");
    if (u) u.disabled = !this._past.length;
    if (r) r.disabled = !this._future.length;
  };

  Editor.prototype.slide = function () { return this.course.slides[this.slideIndex]; };
  Editor.prototype.selectedEl = function () {
    var s = this.slide();
    for (var i = 0; i < s.elements.length; i++) if (s.elements[i].id === this.selectedId) return s.elements[i];
    return null;
  };
  // All selected elements (multi-select), in slide order.
  Editor.prototype.selectedEls = function () {
    var ids = this.selectedIds || [];
    return this.slide().elements.filter(function (e) { return ids.indexOf(e.id) >= 0; });
  };
  // Elements that share an element's group (or just the element if ungrouped).
  Editor.prototype.groupMembers = function (el) {
    if (!el) return [];
    if (!el.group) return [el];
    var g = el.group;
    return this.slide().elements.filter(function (e) { return e.group === g; });
  };

  // --- Layout / scaling -----------------------------------------------------
  // The stage is a fixed 960×540 box scaled with transform. A .stage-sizer
  // parent is sized to the *scaled* pixels so it participates in layout — that's
  // what lets the wrap scroll when the user zooms in past fit.
  Editor.prototype.fitStage = function () {
    var stage = this.refs.stage, wrap = this.refs.stageWrap;
    var sw = this.course.stage.w, sh = this.course.stage.h;
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    var pad = 48;
    var fit = Math.min((wrap.clientWidth - pad) / sw, (wrap.clientHeight - pad) / sh);
    this.fitScale = Math.max(0.1, Math.min(fit, 2));
    this.scale = Math.max(0.1, Math.min(this.fitScale * this.zoomLevel, 8));
    stage.style.transformOrigin = "top left";
    stage.style.transform = "scale(" + this.scale + ")";
    var sizer = stage.parentElement;
    if (sizer && sizer.classList.contains("stage-sizer")) {
      sizer.style.width = (sw * this.scale) + "px";
      sizer.style.height = (sh * this.scale) + "px";
    }
    this.updateZoomLabel();
  };

  // Canvas zoom. ⌘0 / "fit" returns to fit-to-window; ⌘+ / ⌘- step the
  // multiplier; the % is reported back to the toolbar readout.
  Editor.prototype.setZoom = function (level) {
    if (level === "fit") { this.zoomLevel = 1; }
    else { this.zoomLevel = Math.max(0.25, Math.min(level, 8)); }
    this.fitStage();
    this.updateZoomLabel();
  };
  Editor.prototype.zoomBy = function (factor) {
    // Step relative to the current *effective* zoom so it feels consistent
    // whether or not we're at fit.
    this.setZoom(this.zoomLevel * factor);
  };
  Editor.prototype.zoomPct = function () { return Math.round(this.scale * 100); };
  Editor.prototype.updateZoomLabel = function () {
    var el = document.getElementById("zoom-label");
    if (el) el.textContent = this.zoomPct() + "%";
  };

  // --- Render ---------------------------------------------------------------
  Editor.prototype.renderAll = function () {
    this.renderSlideList();
    this.renderStage();
    this.fitStage();
    this.renderInspector();
    if (this.timeline) this.timeline.render();
    this.applyTimeVisibility(null);
    this.refs.modeLabel.textContent = this.mode === "edit" ? "Editing" : "Preview";
    this.refs.stageWrap.classList.toggle("is-play", this.mode === "play");
  };

  Editor.prototype.renderStage = function () {
    Renderer.renderSlide(this.refs.stage, this.slide());
    this.refs.stage.dir = (Renderer.isRTL && Renderer.isRTL(this.course.lang)) ? "rtl" : "ltr";
    if (this.mode === "edit") {
      // Don't let videos autoplay while you're editing.
      Array.prototype.forEach.call(this.refs.stage.querySelectorAll("video"), function (v) { v.autoplay = false; try { v.pause(); } catch (e) {} });
      this.attachEditHandlers();
    }
    else { this.selectChrome(null); this.activatePreviewInteractions(); }
    this.refreshActiveThumb(); // keep the rail preview in sync with edits
  };

  // In Preview, run the SAME interaction runtime the published player uses, so
  // authors can test triggers/states without exporting. Navigation moves slides
  // (Preview is multi-slide-aware) and stays in Preview.
  Editor.prototype.activatePreviewInteractions = function () {
    if (!global.MosaicInteractions) return;
    var self = this;
    if (!this._previewVars) this._previewVars = global.MosaicInteractions.initVars(this.course);
    global.MosaicInteractions.activate(this.refs.stage, this.slide(), {
      vars: this._previewVars,
      onNavigate: function (action, slideIdx) {
        var n = self.slideIndex, last = self.course.slides.length - 1;
        if (action === "next") n = Math.min(last, n + 1);
        else if (action === "prev") n = Math.max(0, n - 1);
        else if (action === "goto") {
          // slideIdx may be a stable slide ID (preferred) or a legacy index.
          var byId = -1;
          for (var si = 0; si < self.course.slides.length; si++) if (self.course.slides[si].id === slideIdx) { byId = si; break; }
          if (byId >= 0) n = byId;
          else { var t = parseInt(slideIdx, 10); if (!isNaN(t)) n = Math.max(0, Math.min(last, t)); }
        }
        if (n !== self.slideIndex) {
          self.slideIndex = n; self.renderAll(); // still in play → re-activates
          // Play the new slide's transition on the sizer (not the scaled stage).
          var sizer = self.refs.stage.parentElement;
          if (sizer && global.MosaicRenderer.playTransition) global.MosaicRenderer.playTransition(sizer, self.slide().transition || "none", 450);
        }
      }
    });
  };

  Editor.prototype.attachEditHandlers = function () {
    var self = this;
    var nodes = this.refs.stage.querySelectorAll(".m-el");
    Array.prototype.forEach.call(nodes, function (node) {
      var id = node.dataset.elId;
      node.addEventListener("pointerdown", function (e) {
        if (self.mode !== "edit" || self.editingTextId || self.editingQuestionId) return;
        if (e.button === 2) return; // right-click handled by contextmenu
        e.stopPropagation();
        if (e.shiftKey || e.metaKey) { self.select(id, true); return; } // toggle, no drag
        if (self.selectedIds.indexOf(id) < 0) self.select(id);          // select (group-aware)
        var el = self.findEl(id);
        if (el && el.locked) return;                                    // locked: select but don't move
        self.beginDrag(e, node);                                        // drag moves all selected
      });
      node.addEventListener("contextmenu", function (e) {
        if (self.mode !== "edit" || self.editingTextId || self.editingQuestionId) return;
        e.preventDefault(); e.stopPropagation();
        if (self.selectedIds.indexOf(id) < 0) self.select(id);
        self.openContextMenu(e.clientX, e.clientY, true);
      });
      node.addEventListener("dblclick", function (e) {
        if (self.editingTextId === id) return; // already editing — let the dbl-click select a word
        var el = self.findEl(id);
        if (el && el.type === "text") { e.stopPropagation(); self.beginTextEdit(node, el); }
        else if (el && el.type === "question") { e.stopPropagation(); self.beginQuestionEdit(node, el); }
        else if (el && el.type === "button") { e.stopPropagation(); self.beginButtonEdit(node, el); }
      });
      // Show the author which choice is the answer key (edit mode only).
      if (node.classList.contains("m-el--question")) {
        var q = self.findEl(id);
        if (q) {
          var labels = node.querySelectorAll(".q__choice");
          var ans = (q.kind === "multiple") ? (q.answerIndices || []) : [q.answerIndex];
          ans.forEach(function (ai) { if (labels[ai]) labels[ai].classList.add("q__choice--key"); });
        }
      }
    });
    this.selectChrome(this.selectedEl());
  };

  Editor.prototype.findEl = function (id) {
    var s = this.slide();
    for (var i = 0; i < s.elements.length; i++) if (s.elements[i].id === id) return s.elements[i];
    return null;
  };

  // --- Selection chrome (outline + resize handles) --------------------------
  // Renders from selectedIds: a box per selected element, with resize handles
  // only when exactly one is selected. (Arg ignored — kept for old call sites.)
  Editor.prototype.selectChrome = function () {
    var self = this;
    this.updateFormatBar(); // floating text toolbar follows the selection
    var old = this.refs.stage.querySelectorAll(".m-select");
    Array.prototype.forEach.call(old, function (n) { n.remove(); });
    if (this.mode !== "edit" || this.editingTextId || this.editingQuestionId) return;
    var els = this.selectedEls().filter(function (e) { return e.x != null; });
    if (!els.length) return;
    var single = els.length === 1;
    els.forEach(function (el) {
      var box = document.createElement("div");
      box.className = "m-select" + (single ? "" : " m-select--multi") + (el.locked ? " m-select--locked" : "");
      Renderer.place(box, el);
      if (single && !el.locked) {
        ["nw", "ne", "se", "sw"].forEach(function (pos) {
          var h = document.createElement("div");
          h.className = "m-handle m-handle--" + pos;
          h.addEventListener("pointerdown", function (e) { e.stopPropagation(); self.beginResize(e, pos); });
          box.appendChild(h);
        });
        var rot = document.createElement("div");
        rot.className = "m-rotate";
        rot.title = "Drag to rotate (Shift = 15°)";
        rot.addEventListener("pointerdown", function (e) { e.stopPropagation(); self.beginRotate(e); });
        box.appendChild(rot);
      }
      self.refs.stage.appendChild(box);
    });
  };

  Editor.prototype.repositionChrome = function (el) {
    var box = this.refs.stage.querySelector(".m-select");
    if (box && el) Renderer.place(box, el);
  };

  // --- Floating format toolbar (appears above a selected text box) -----------
  // The convention users expect (Keynote/Docs/Figma): select text → quick format
  // controls right there. Reuses setField, so no logic is duplicated from the
  // inspector; the inspector stays as the full-detail panel.
  Editor.prototype._ensureFmtBar = function () {
    if (this._fmtbar) return this._fmtbar;
    var self = this;
    var bar = document.createElement("div"); bar.className = "fmtbar";
    bar.addEventListener("pointerdown", function (e) { e.stopPropagation(); }); // don't deselect the element
    function apply(fn) { var el = self.selectedEl(); if (el) { fn(el); self.selectChrome(); } }
    function btn(html, title, onClick) {
      var b = document.createElement("button"); b.type = "button"; b.className = "fmtbar__btn"; b.innerHTML = html; b.title = title;
      b.addEventListener("click", function () { apply(onClick); });
      return b;
    }
    function sep() { var s = document.createElement("span"); s.className = "fmtbar__sep"; return s; }
    var font = document.createElement("select"); font.className = "fmtbar__sel"; font.title = "Font";
    [["system", "System"], ["sans", "Sans"], ["rounded", "Rounded"], ["serif", "Serif"], ["mono", "Mono"]].forEach(function (o) {
      var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; font.appendChild(op);
    });
    font.addEventListener("change", function () { var v = this.value; apply(function () { self.setField("fontFamily", v, true); }); });
    var size = document.createElement("input"); size.type = "number"; size.className = "fmtbar__num"; size.min = "8"; size.max = "200"; size.title = "Font size";
    size.addEventListener("input", function () { var v = parseInt(this.value, 10); if (!isNaN(v)) apply(function () { self.setField("fontSize", Math.max(8, Math.min(200, v)), true); }); });
    var b = btn("<b>B</b>", "Bold (⌘B)", function (el) { self.setField("bold", !el.bold, true); });
    var i = btn("<i>I</i>", "Italic (⌘I)", function (el) { self.setField("italic", !el.italic, true); });
    var u = btn("<span style='text-decoration:underline'>U</span>", "Underline (⌘U)", function (el) { self.setField("underline", !el.underline, true); });
    var color = document.createElement("input"); color.type = "color"; color.className = "fmtbar__color"; color.title = "Text color";
    color.addEventListener("input", function () { var v = this.value; apply(function () { self.setField("color", v, true); }); });
    var al = btn("⇤", "Align left", function () { self.setField("align", "left", true); });
    var ac = btn("↔", "Align center", function () { self.setField("align", "center", true); });
    var ar = btn("⇥", "Align right", function () { self.setField("align", "right", true); });
    bar.appendChild(font); bar.appendChild(size); bar.appendChild(sep());
    bar.appendChild(b); bar.appendChild(i); bar.appendChild(u); bar.appendChild(color); bar.appendChild(sep());
    bar.appendChild(al); bar.appendChild(ac); bar.appendChild(ar);
    document.body.appendChild(bar);
    this._fmtbar = { bar: bar, font: font, size: size, b: b, i: i, u: u, color: color, al: al, ac: ac, ar: ar };
    return this._fmtbar;
  };

  Editor.prototype.updateFormatBar = function () {
    var el = null;
    if (this.mode === "edit" && !this.editingTextId && !this.editingQuestionId) {
      var els = this.selectedEls();
      if (els.length === 1 && els[0].type === "text" && !els[0].locked) el = els[0];
    }
    if (!el) { if (this._fmtbar) this._fmtbar.bar.classList.remove("is-on"); return; }
    var f = this._ensureFmtBar();
    f.font.value = el.fontFamily || "system";
    if (document.activeElement !== f.size) f.size.value = Math.round(el.fontSize || 20);
    f.b.classList.toggle("is-active", !!el.bold);
    f.i.classList.toggle("is-active", !!el.italic);
    f.u.classList.toggle("is-active", !!el.underline);
    f.color.value = el.color || "#1c2430";
    var a = el.align || "left";
    f.al.classList.toggle("is-active", a === "left");
    f.ac.classList.toggle("is-active", a === "center");
    f.ar.classList.toggle("is-active", a === "right");
    f.bar.classList.add("is-on");
    var node = this.refs.stage.querySelector('[data-el-id="' + el.id + '"]');
    if (!node) { f.bar.classList.remove("is-on"); return; }
    var r = node.getBoundingClientRect();
    var bw = f.bar.offsetWidth || 340, bh = f.bar.offsetHeight || 38;
    var left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - bw - 8));
    var top = Math.round(r.top) - bh - 10;
    if (top < 8) top = Math.round(r.bottom) + 10; // no room above → flip below
    f.bar.style.left = left + "px";
    f.bar.style.top = top + "px";
  };

  // --- Drag -----------------------------------------------------------------
  Editor.prototype.beginDrag = function (e, node) {
    var self = this, el = this.selectedEl();
    if (!el) return;
    // Move the whole selection rigidly: snap the primary element, then apply the
    // same (snapped) delta to every selected element.
    var group = this.selectedEls().filter(function (x) { return x.x != null && !x.locked; });
    if (!group.length) return;
    var optDup = e.altKey, dragged = false, captured = false; // Option-drag leaves a copy behind
    var startX = e.clientX, startY = e.clientY, ox = el.x, oy = el.y;
    // NOTE: capture is deferred to the first real move (see below). Capturing the
    // pointer on mousedown suppresses the browser's dblclick synthesis, so
    // double-click-to-edit never fired. By only capturing once a drag actually
    // starts, a plain click (and the double-click after it) stays uncaptured.

    function move(ev) {
      if (!dragged) {
        if (Math.abs(ev.clientX - startX) < 3 && Math.abs(ev.clientY - startY) < 3) return; // below threshold: not a drag yet
        dragged = true;
        group.forEach(function (g) { g._ox = g.x; g._oy = g.y; });
        try { node.setPointerCapture(e.pointerId); captured = true; } catch (err) {}
      }
      var nx = Math.round(ox + (ev.clientX - startX) / self.scale);
      var ny = Math.round(oy + (ev.clientY - startY) / self.scale);
      var s = (group.length === 1) ? self.snapPosition(el, nx, ny) : { x: nx, y: ny, vGuide: null, hGuide: null };
      var dx = s.x - ox, dy = s.y - oy;
      group.forEach(function (g) {
        g.x = g._ox + dx; g.y = g._oy + dy;
        var gn = self.refs.stage.querySelector('[data-el-id="' + g.id + '"]');
        if (gn) Renderer.place(gn, g);
      });
      self.selectChrome();
      self.showAlignGuides(s.vGuide, s.hGuide, s.gaps);
    }
    function up(ev) {
      if (captured) { try { node.releasePointerCapture(e.pointerId); } catch (err) {} }
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      // A plain click (selected, never moved past the threshold) must NOT rebuild
      // the stage DOM — renderStage() replaces every element node, which combined
      // with pointer capture is why double-click-to-edit never fired. Nothing
      // changed, so just refresh the selection chrome and bail.
      if (!dragged) {
        self.hideAlignGuides();
        self.selectChrome();
        return;
      }
      // Option-drag: drop a copy back at each element's ORIGINAL spot (Keynote-style).
      if (optDup && dragged) {
        group.forEach(function (g) {
          var copy = JSON.parse(JSON.stringify(g));
          copy.id = Model.uid("el"); copy.x = g._ox; copy.y = g._oy;
          delete copy._ox; delete copy._oy;
          self.slide().elements.push(copy);
        });
        if (self.timeline) self.timeline.render();
      }
      group.forEach(function (g) { delete g._ox; delete g._oy; });
      self.hideAlignGuides();
      self.save();
      self.renderStage(); self.selectChrome();
    }
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
  };

  // --- Marquee (rubber-band) selection on empty canvas ----------------------
  Editor.prototype.beginMarquee = function (e) {
    e.preventDefault(); // stop the browser starting a native text-selection drag
    var self = this, stage = this.refs.stage;
    var rect = stage.getBoundingClientRect(), sc = this.scale;
    var x0 = (e.clientX - rect.left) / sc, y0 = (e.clientY - rect.top) / sc;
    var box = document.createElement("div"); box.className = "m-marquee";
    stage.appendChild(box);
    var moved = false;
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    function rectOf(x1, y1) { return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }; }
    function move(ev) {
      moved = true;
      var x1 = (ev.clientX - rect.left) / sc, y1 = (ev.clientY - rect.top) / sc, r = rectOf(x1, y1);
      box.style.left = r.x + "px"; box.style.top = r.y + "px"; box.style.width = r.w + "px"; box.style.height = r.h + "px";
    }
    function up(ev) {
      try { stage.releasePointerCapture(e.pointerId); } catch (err) {}
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      box.remove();
      if (!moved) { self.select(null); return; } // a plain click clears selection
      var x1 = (ev.clientX - rect.left) / sc, y1 = (ev.clientY - rect.top) / sc, r = rectOf(x1, y1);
      var hits = self.slide().elements.filter(function (el) {
        return el.x != null && el.x < r.x + r.w && el.x + el.w > r.x && el.y < r.y + r.h && el.y + el.h > r.y;
      });
      // Include whole groups for any hit member.
      var ids = {};
      hits.forEach(function (el) { self.groupMembers(el).forEach(function (m) { ids[m.id] = 1; }); });
      self.selectedIds = Object.keys(ids);
      self.selectedId = self.selectedIds[self.selectedIds.length - 1] || null;
      self.selectChrome(); self.renderInspector();
      if (self.timeline) self.timeline.highlightSelected();
    }
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
  };

  // --- Resize ---------------------------------------------------------------
  // Rotation-aware resize. The opposite corner stays anchored (or the center, with
  // Option); the pointer is projected into the element's local axes so it works at
  // any rotation. Reduces to plain axis-aligned resize when rotation is 0.
  Editor.prototype.beginResize = function (e, pos) {
    var self = this, el = this.selectedEl();
    if (!el) return;
    var node = this.refs.stage.querySelector('[data-el-id="' + el.id + '"]');
    var startX = e.clientX, startY = e.clientY;
    var ox = el.x, oy = el.y, ow = el.w, oh = el.h;
    var box = this.refs.stage.querySelector(".m-select");
    box.setPointerCapture(e.pointerId);

    var th = (el.rotation || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
    var C = { x: ox + ow / 2, y: oy + oh / 2 };
    var sgnX = (pos === "ne" || pos === "se") ? 1 : -1;
    var sgnY = (pos === "sw" || pos === "se") ? 1 : -1;
    function R(x, y) { return { x: x * cos - y * sin, y: x * sin + y * cos }; }
    var oc = R(sgnX * ow / 2, sgnY * oh / 2), origCorner = { x: C.x + oc.x, y: C.y + oc.y };
    var ac = R(-sgnX * ow / 2, -sgnY * oh / 2), anchor = { x: C.x + ac.x, y: C.y + ac.y };

    function move(ev) {
      var dx = (ev.clientX - startX) / self.scale, dy = (ev.clientY - startY) / self.scale;
      var nc = { x: origCorner.x + dx, y: origCorner.y + dy };
      var w, h, cxn, cyn;
      if (ev.altKey) { // resize from center
        var lx = (nc.x - C.x) * cos + (nc.y - C.y) * sin;
        var ly = -(nc.x - C.x) * sin + (nc.y - C.y) * cos;
        w = Math.max(MIN, 2 * Math.abs(lx)); h = Math.max(MIN, 2 * Math.abs(ly));
        cxn = C.x; cyn = C.y;
      } else { // opposite corner anchored
        var vx = nc.x - anchor.x, vy = nc.y - anchor.y;
        w = Math.max(MIN, Math.abs(vx * cos + vy * sin));
        h = Math.max(MIN, Math.abs(-vx * sin + vy * cos));
      }
      if (ev.shiftKey && oh > 0) { var asp = ow / oh; h = Math.max(MIN, w / asp); w = h * asp; }
      if (!ev.altKey) { var ce = R(sgnX * w / 2, sgnY * h / 2); cxn = anchor.x + ce.x; cyn = anchor.y + ce.y; }
      el.w = Math.round(w); el.h = Math.round(h);
      el.x = Math.round(cxn - el.w / 2); el.y = Math.round(cyn - el.h / 2);
      if (node) Renderer.place(node, el);
      Renderer.place(box, el);
    }
    function up() {
      box.releasePointerCapture(e.pointerId);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      self.save();
    }
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
  };

  // Rotate the selected element by dragging the rotation handle (Shift = 15° snap).
  Editor.prototype.beginRotate = function (e) {
    var self = this, el = this.selectedEl();
    if (!el) return;
    var rect = this.refs.stage.getBoundingClientRect(), sc = this.scale;
    var ccx = rect.left + (el.x + el.w / 2) * sc, ccy = rect.top + (el.y + el.h / 2) * sc;
    var start = el.rotation || 0;
    var startAng = Math.atan2(e.clientY - ccy, e.clientX - ccx) * 180 / Math.PI;
    var box = this.refs.stage.querySelector(".m-select");
    var node = this.refs.stage.querySelector('[data-el-id="' + el.id + '"]');
    box.setPointerCapture(e.pointerId);
    function move(ev) {
      var ang = Math.atan2(ev.clientY - ccy, ev.clientX - ccx) * 180 / Math.PI;
      var deg = start + (ang - startAng);
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      el.rotation = Math.round(((deg % 360) + 360) % 360);
      if (node) Renderer.place(node, el);
      Renderer.place(box, el);
    }
    function up() {
      box.releasePointerCapture(e.pointerId);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      self.save(); self.renderInspector();
    }
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
  };

  // --- Inline text edit -----------------------------------------------------
  Editor.prototype.beginTextEdit = function (node, el) {
    var self = this;
    this.editingTextId = el.id;
    this.selectChrome(null);
    // Rich text edits the HTML; plain text edits the clean string (no list markers).
    if (el.html) node.innerHTML = el.html;
    else node.textContent = el.text;
    node.setAttribute("contenteditable", "true");
    node.classList.add("is-editing");
    // Grow the box as you type (PowerPoint-style); restored on commit.
    var prevH = node.style.height, prevOverflow = node.style.overflow;
    node.style.height = "auto";
    node.style.overflow = "visible";
    node.focus();
    document.execCommand && document.execCommand("selectAll", false, null);

    function grow() { node.style.height = "auto"; } // pre-wrap + auto = expands to fit
    function finish() {
      node.removeAttribute("contenteditable");
      node.classList.remove("is-editing");
      // innerText preserves the line breaks the user typed (Enter = new line).
      var raw = (node.innerText || node.textContent).replace(/\n{3,}/g, "\n\n").replace(/\s+$/,"");
      // Rich if the user applied inline formatting (bold/italic/underline/link/highlight).
      if (/<(b|strong|i|em|u|a|span|font|mark)\b/i.test(node.innerHTML)) {
        el.html = sanitizeHtml(node.innerHTML);
        el.text = raw.trim() ? raw : "Text"; // fallback for search / thumbnails
        delete el.list;                      // lists don't combine with rich html
      } else {
        delete el.html;
        el.text = raw.trim() ? raw : "Text";
      }
      el.h = Math.max(24, Math.round(node.offsetHeight)); // keep the grown height
      node.style.overflow = prevOverflow;
      self.editingTextId = null;
      self.save();
      self.renderStage();           // reflow (markers, height) cleanly
      self.selectChrome(self.selectedEl());
      node.removeEventListener("blur", finish);
      node.removeEventListener("keydown", key);
      node.removeEventListener("input", grow);
    }
    // Enter inserts a new line; commit on Escape/click-away. ⌘B/I/U format the
    // SELECTION (rich text); ⌘K adds a link; ⌘⇧H highlights.
    function key(ev) {
      ev.stopPropagation();
      if (ev.key === "Escape") { ev.preventDefault(); node.blur(); return; }
      // Tab / Shift-Tab indent or outdent the line(s) the caret spans (Keynote-style).
      // Indent is stored as leading tabs in el.text; the renderer turns them into
      // nested bullet/number markers + indentation.
      if (ev.key === "Tab") { ev.preventDefault(); indentLines(ev.shiftKey ? -1 : 1); return; }
      if (ev.metaKey || ev.ctrlKey) {
        var k = ev.key.toLowerCase();
        if (k === "b") { ev.preventDefault(); document.execCommand("bold"); }
        else if (k === "i") { ev.preventDefault(); document.execCommand("italic"); }
        else if (k === "u") { ev.preventDefault(); document.execCommand("underline"); }
        else if (k === "k") { ev.preventDefault(); var url = global.prompt("Link URL", "https://"); if (url) document.execCommand("createLink", false, url); }
        else if (k === "h" && ev.shiftKey) { ev.preventDefault(); document.execCommand("hiliteColor", false, "#fff3a3"); }
      }
    }
    // Author content only — strip script/style and inline event handlers.
    function sanitizeHtml(html) {
      return String(html)
        .replace(/<\/?(script|style)[^>]*>/gi, "")
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
        .replace(/javascript:/gi, "");
    }
    // Indent/outdent every line the selection touches by one tab (max 5 deep).
    function indentLines(delta) {
      var sel = global.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      var pre = range.cloneRange();
      pre.selectNodeContents(node);
      pre.setEnd(range.startContainer, range.startOffset);
      var start = pre.toString().length;
      var end = start + range.toString().length;
      var lines = (node.innerText || node.textContent).split("\n");
      var acc = [], pos = 0, i;
      for (i = 0; i < lines.length; i++) { acc.push(pos); pos += lines[i].length + 1; }
      function lineAt(off) { var li = 0; for (var j = 0; j < lines.length; j++) { if (off >= acc[j]) li = j; } return li; }
      var first = lineAt(start), last = lineAt(end), changed = 0, firstDelta = 0;
      for (i = first; i <= last; i++) {
        if (delta > 0) {
          var lvl = (lines[i].match(/^\t*/)[0] || "").length;
          if (lvl < 5) { lines[i] = "\t" + lines[i]; changed++; if (i === first) firstDelta = 1; }
        } else if (lines[i].charAt(0) === "\t") {
          lines[i] = lines[i].slice(1); changed++; if (i === first) firstDelta = -1;
        }
      }
      if (!changed) return;
      node.textContent = lines.join("\n");
      var tn = node.firstChild;
      if (tn) {
        var max = tn.textContent.length;
        var s = Math.max(0, Math.min(start + firstDelta, max));
        var e = Math.max(s, Math.min(end + (delta > 0 ? changed : -changed), max));
        var r = document.createRange();
        r.setStart(tn, s); r.setEnd(tn, e);
        sel.removeAllRanges(); sel.addRange(r);
      }
    }

    node.addEventListener("blur", finish);
    node.addEventListener("keydown", key);
    node.addEventListener("input", grow);

    // Local mirror of the renderer's marker logic (display-only).
    function listDisplayLocal(e) {
      if (e.list !== "bullet" && e.list !== "number") return e.text;
      var n = 0;
      return String(e.text).split("\n").map(function (ln) {
        if (!ln.trim()) return ln;
        n++;
        return (e.list === "number" ? (n + ".  ") : "•  ") + ln;
      }).join("\n");
    }
  };

  // --- Inline button label edit (double-click) ------------------------------
  Editor.prototype.beginButtonEdit = function (node, el) {
    var self = this;
    this.editingTextId = el.id; // reuse the "editing" guard so drag is suppressed
    this.selectChrome(null);
    node.setAttribute("contenteditable", "true");
    node.classList.add("is-editing");
    node.focus();
    document.execCommand && document.execCommand("selectAll", false, null);

    // Commit on every keystroke so the label is never lost to a flaky blur
    // (a contenteditable <button> has quirky focus/Enter behavior).
    function onInput() {
      el.label = node.textContent.replace(/\n/g, " ").trim() || "Button";
      self.save();
      if (self.timeline) self.timeline.render(); // keep the lane name in sync
    }
    function finish() {
      onInput();
      node.removeAttribute("contenteditable");
      node.classList.remove("is-editing");
      node.textContent = el.label;
      self.editingTextId = null;
      self.renderInspector();
      self.selectChrome(el);
      node.removeEventListener("blur", finish);
      node.removeEventListener("keydown", key);
      node.removeEventListener("input", onInput);
    }
    function key(ev) {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); node.blur(); }
      if (ev.key === "Escape") { ev.preventDefault(); node.blur(); }
    }
    node.addEventListener("blur", finish);
    node.addEventListener("keydown", key);
    node.addEventListener("input", onInput);
  };

  // --- Inline question edit (double-click) ----------------------------------
  // Edit the prompt + choices in place; click a circle to mark it correct.
  Editor.prototype.beginQuestionEdit = function (node, el) {
    var self = this;
    this.editingQuestionId = el.id;
    this.selectChrome(null);
    node.classList.add("is-editing");

    var legend = node.querySelector(".q__prompt");
    var choiceTexts = node.querySelectorAll(".q__choicetext");
    var labels = node.querySelectorAll(".q__choice");

    if (legend) { legend.setAttribute("contenteditable", "true"); }
    Array.prototype.forEach.call(choiceTexts, function (sp) { sp.setAttribute("contenteditable", "true"); });

    // Click the radio/checkbox to mark correct; clicking the text just edits it.
    var kind = el.kind || "single";
    Array.prototype.forEach.call(labels, function (label, i) {
      label.addEventListener("click", function (e) {
        if (e.target.classList.contains("q__radio")) {
          if (kind === "multiple") {
            if (!el.answerIndices) el.answerIndices = [];
            var pos = el.answerIndices.indexOf(i);
            if (pos >= 0) el.answerIndices.splice(pos, 1); else el.answerIndices.push(i);
            Array.prototype.forEach.call(labels, function (l, li) { l.classList.toggle("q__choice--key", el.answerIndices.indexOf(li) >= 0); });
          } else {
            el.answerIndex = i;
            Array.prototype.forEach.call(labels, function (l, li) { l.classList.toggle("q__choice--key", li === i); });
          }
          self.save();
        } else {
          e.preventDefault(); // don't let the label toggle the radio while editing text
        }
      });
    });

    function commit() {
      if (legend) el.prompt = legend.textContent.trim() || "Question";
      Array.prototype.forEach.call(choiceTexts, function (sp, i) {
        el.choices[i] = sp.textContent.trim() || ("Choice " + (i + 1));
      });
      self.save();
    }
    function finish() {
      commit();
      self.editingQuestionId = null;
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", key);
      self.renderStage();
      self.select(el.id);
    }
    function away(e) { if (!node.contains(e.target)) finish(); }
    function key(e) { if (e.key === "Escape") { e.preventDefault(); finish(); } }

    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", key);
    if (legend) legend.focus();
  };

  // --- Commands -------------------------------------------------------------
  // select(id):           replace selection with this element (and its group)
  // select(id, true):      shift/⌘-click — toggle this element (and its group)
  // select(null):          clear selection
  Editor.prototype.select = function (id, additive) {
    if (!id) { this.selectedIds = []; this.selectedId = null; }
    else {
      var members = this.groupMembers(this.findEl(id)).map(function (e) { return e.id; });
      var cur = this.selectedIds || [];
      if (additive) {
        var already = cur.indexOf(id) >= 0;
        if (already) cur = cur.filter(function (x) { return members.indexOf(x) < 0; });
        else cur = cur.concat(members.filter(function (x) { return cur.indexOf(x) < 0; }));
        this.selectedIds = cur;
        this.selectedId = already ? (cur[cur.length - 1] || null) : id;
      } else {
        this.selectedIds = members;
        this.selectedId = id;
      }
    }
    this.selectChrome();
    this.renderInspector();
    if (this.timeline) this.timeline.highlightSelected();
  };
  // Select every positioned element on the slide (⌘A).
  Editor.prototype.selectAll = function () {
    var els = this.slide().elements.filter(function (e) { return e.x != null; });
    this.selectedIds = els.map(function (e) { return e.id; });
    this.selectedId = this.selectedIds[this.selectedIds.length - 1] || null;
    this.selectChrome(); this.renderInspector();
    if (this.timeline) this.timeline.highlightSelected();
  };
  // Tab / Shift-Tab cycle through the slide's objects (PowerPoint-style).
  Editor.prototype.selectNextObject = function (dir) {
    var ids = this.slide().elements.filter(function (e) { return e.x != null; }).map(function (e) { return e.id; });
    if (!ids.length) return;
    var cur = ids.indexOf(this.selectedId);
    var next = cur < 0 ? (dir > 0 ? 0 : ids.length - 1) : (cur + dir + ids.length) % ids.length;
    this.select(ids[next]);
  };
  // Toggle bold/italic/underline on the selected text element(s) without entering
  // edit mode (⌘B / ⌘I / ⌘U on a selected text box, Keynote-style).
  Editor.prototype.toggleTextStyleSelected = function (prop) {
    var changed = false;
    this.selectedEls().forEach(function (el) {
      if (el && el.type === "text") { el[prop] = !el[prop]; changed = true; }
    });
    if (changed) { this.save(); this.renderStage(); this.selectChrome(); this.renderInspector(); }
  };

  // --- Inspector (properties + accessibility) -------------------------------
  // Standard color palette (quick swatches alongside brand colors).
  var STD_COLORS = [
    "#000000", "#3a3a3c", "#8e8e93", "#c7c7cc", "#ffffff",
    "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be",
    "#007aff", "#5856d6", "#af52de", "#ff2d55"
  ];
  // Shared opacity slider field (used by shapes + images).
  function opacityField(field, el, self) {
    var op = document.createElement("input");
    op.type = "range"; op.min = "0"; op.max = "1"; op.step = "0.05";
    op.value = (el.opacity != null ? el.opacity : 1);
    op.addEventListener("input", function () { self.setField("opacity", parseFloat(this.value), true); });
    field("Opacity", op);
  }

  Editor.prototype.setField = function (prop, value, rerender) {
    var el = this.selectedEl();
    if (!el) return;
    el[prop] = value;
    this.save();
    if (rerender) { this.renderStage(); } // re-render when it changes the DOM/visual
  };

  // Switch a question's kind, seeding the fields that kind needs (keeps prompt/points).
  Editor.prototype.setQuestionKind = function (el, kind) {
    el.kind = kind;
    if (kind === "fill") {
      if (!el.answers || !el.answers.length) el.answers = ["answer"];
      if (el.caseSensitive == null) el.caseSensitive = false;
    } else if (kind === "matching") {
      if (!el.pairs || el.pairs.length < 2) el.pairs = [{ left: "Term", right: "Definition" }, { left: "Term 2", right: "Definition 2" }];
    } else if (kind === "dragdrop") {
      if (!el.zones || el.zones.length < 2) el.zones = ["Category A", "Category B"];
      if (!el.items || !el.items.length) el.items = [{ text: "Item 1", zone: 0 }, { text: "Item 2", zone: 1 }];
    } else if (kind === "truefalse") {
      el.choices = ["True", "False"];
      if (el.answerIndex == null) el.answerIndex = 0;
    } else if (kind === "multiple") {
      if (!el.choices || el.choices.length < 2) el.choices = ["First choice", "Second choice", "Third choice"];
      if (!el.answerIndices) el.answerIndices = (el.answerIndex != null ? [el.answerIndex] : [0]);
    } else { // single
      if (!el.choices || el.choices.length < 2) el.choices = ["First choice", "Second choice"];
      if (el.answerIndex == null) el.answerIndex = 0;
    }
    this.save();
    this.renderStage();
    this.renderInspector();
  };

  // Brand palette + standard colors (for the color popover + swatches).
  Editor.prototype.brandSwatchList = function () {
    var b = this.course.brand || {};
    var cols = (b.palette || []).slice();
    [b.accent, b.ink, b.body].forEach(function (c) { if (c && cols.indexOf(c) < 0) cols.push(c); });
    STD_COLORS.forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); });
    return cols;
  };

  // Compact color popover (Pixelmator-style): one chip → system field + hex +
  // brand/standard swatches. Replaces the inline color-well + always-on swatch
  // grid, so the inspector stays calm.
  Editor.prototype.openColorPopover = function (anchor, value, onPick) {
    function norm(c) { c = String(c || "#000000"); return /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#000000"; }
    var old = document.querySelector(".colorpop"); if (old) old.remove();
    var pop = document.createElement("div"); pop.className = "colorpop"; pop.setAttribute("role", "dialog");
    var top = document.createElement("div"); top.className = "colorpop__top";
    var native = document.createElement("input"); native.type = "color"; native.className = "colorpop__native"; native.value = norm(value);
    native.title = "Color picker (system + eyedropper)";
    var hex = document.createElement("input"); hex.type = "text"; hex.className = "colorpop__hex"; hex.value = norm(value); hex.setAttribute("aria-label", "Hex color");
    function set(c) { c = norm(c); native.value = c; hex.value = c; onPick(c); }
    native.addEventListener("input", function () { set(this.value); });
    hex.addEventListener("change", function () {
      var v = this.value.trim(); if (v[0] !== "#") v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) set(v); else this.value = native.value;
    });
    hex.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); this.blur(); } });
    // Eyedropper: native NSColorSampler in the app; the standards EyeDropper API
    // in Chromium browsers. Hidden only if neither is available.
    var nativeBridge = global.MosaicNative && global.MosaicNative.isNative && global.MosaicNative.isNative();
    var hasWebDropper = typeof global.EyeDropper === "function";
    if (nativeBridge || hasWebDropper) {
      var drop = document.createElement("button");
      drop.type = "button"; drop.className = "colorpop__drop"; drop.title = "Eyedropper — sample a color from the screen";
      drop.setAttribute("aria-label", "Eyedropper");
      drop.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 0 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';
      drop.addEventListener("click", function () {
        if (nativeBridge) {
          global.MosaicNative.pickScreenColor(function (c) { if (c) set(c); });
        } else {
          try {
            new global.EyeDropper().open().then(function (res) { if (res && res.sRGBHex) set(res.sRGBHex); }, function () {});
          } catch (e) {}
        }
      });
      top.appendChild(drop);
    }
    top.appendChild(native); top.appendChild(hex); pop.appendChild(top);
    var grid = document.createElement("div"); grid.className = "colorpop__swatches";
    this.brandSwatchList().forEach(function (c) {
      var sw = document.createElement("button"); sw.type = "button"; sw.className = "insp__swatch"; sw.style.background = c; sw.title = c;
      sw.addEventListener("click", function () { set(c); });
      grid.appendChild(sw);
    });
    pop.appendChild(grid);
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, pad = 8;
    pop.style.left = Math.max(pad, Math.min(r.left, global.innerWidth - pw - pad)) + "px";
    var ty = r.bottom + 4; if (ty + ph > global.innerHeight - pad) ty = Math.max(pad, r.top - ph - 4);
    pop.style.top = ty + "px";
    function close() { pop.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); }
    function away(e) { if (!pop.contains(e.target) && e.target !== anchor) close(); }
    function esc(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true); }, 0);
  };

  Editor.prototype.renderInspector = function () {
    var box = this.refs.inspector;
    if (!box) return;
    box.innerHTML = "";
    var el = this.selectedEl();
    var self = this;

    function field(labelText, control) {
      var wrap = document.createElement("label");
      wrap.className = "insp__field";
      var lab = document.createElement("span");
      lab.className = "insp__label";
      lab.textContent = labelText;
      wrap.appendChild(lab);
      wrap.appendChild(control);
      box.appendChild(wrap);
      return control;
    }
    function head(t) { var h = document.createElement("div"); h.className = "insp__type"; h.textContent = t; box.appendChild(h); return h; }
    // Font-size combobox: click to pick a preset OR type any value (datalist).
    function sizeInput(value, fallback, onChange) {
      var DL_ID = "mosaic-fontsizes";
      if (!document.getElementById(DL_ID)) {
        var dl = document.createElement("datalist"); dl.id = DL_ID;
        [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72, 96].forEach(function (s) {
          var o = document.createElement("option"); o.value = String(s); dl.appendChild(o);
        });
        document.body.appendChild(dl);
      }
      var inp = document.createElement("input");
      inp.type = "text"; inp.inputMode = "numeric"; inp.setAttribute("list", DL_ID);
      inp.value = value;
      inp.addEventListener("change", function () {
        var v = parseInt(this.value, 10);
        onChange((v >= 8 && v <= 300) ? v : fallback);
      });
      return inp;
    }
    // A row of segmented toggle buttons. items: [{label, active, on}]
    function toggleRow(labelText, items) {
      var group = document.createElement("div"); group.className = "insp__toggles";
      items.forEach(function (it) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "insp__toggle" + (it.active ? " is-on" : "");
        b.innerHTML = it.label; b.title = it.title || "";
        b.addEventListener("click", function () { it.on(); });
        group.appendChild(b);
      });
      return field(labelText, group);
    }
    // Quick color swatches: brand colors + a standard palette.
    function swatches(onPick) {
      var b = self.course.brand || {};
      var cols = (b.palette || []).slice();
      [b.accent, b.ink, b.body].forEach(function (c) { if (c && cols.indexOf(c) < 0) cols.push(c); });
      STD_COLORS.forEach(function (c) { if (cols.indexOf(c) < 0) cols.push(c); });
      var row = document.createElement("div"); row.className = "insp__swatches";
      cols.forEach(function (c) {
        var sw = document.createElement("button"); sw.type = "button"; sw.className = "insp__swatch";
        sw.style.background = c; sw.title = c;
        sw.addEventListener("click", function () { onPick(c); });
        row.appendChild(sw);
      });
      box.appendChild(row);
    }
    // A single color chip that opens the compact color popover (replaces the
    // inline color-well + always-on swatch grid).
    function colorRow(labelText, value, onPick) {
      var chip = document.createElement("button");
      chip.type = "button"; chip.className = "insp__colorchip"; chip.title = labelText;
      chip.style.background = value || "#000000";
      chip.addEventListener("click", function (ev) {
        ev.stopPropagation();
        self.openColorPopover(chip, value, function (c) { value = c; chip.style.background = c; onPick(c); });
      });
      return field(labelText, chip);
    }

    // Short human label for an element (trigger targets, etc.).
    function elementLabel(e) {
      if (e.type === "text") return (e.text || "Text").slice(0, 24);
      if (e.type === "question") return (e.prompt || "Question").slice(0, 24);
      if (e.type === "button") return e.label || "Button";
      if (e.type === "image") return "Image";
      if (e.type === "video") return "Video";
      if (e.type === "rect") return e.kind === "ellipse" ? "Ellipse" : e.kind === "line" ? "Line" : "Rectangle";
      if (e.type === "icon") return "Icon: " + (e.icon || "");
      if (e.type === "result") return "Quiz result";
      if (e.type === "roleplay") return "Practice: " + (e.title || "scenario").slice(0, 18);
      return e.type;
    }

    if (this.mode !== "edit") {
      var hint = document.createElement("p"); hint.className = "insp__hint";
      hint.textContent = "Preview mode."; box.appendChild(hint); return;
    }

    // Multiple elements selected → show design tools (align / distribute / group).
    var multiSel = this.selectedEls().filter(function (e) { return e.x != null; });
    if (multiSel.length > 1) {
      head(multiSel.length + " ITEMS SELECTED");
      function actionRow(labelText, btns) {
        var grp = document.createElement("div"); grp.className = "insp__toggles";
        btns.forEach(function (b) {
          var x = document.createElement("button"); x.type = "button"; x.className = "insp__toggle";
          x.innerHTML = b.label; x.title = b.title; x.addEventListener("click", b.on); grp.appendChild(x);
        });
        field(labelText, grp);
      }
      actionRow("Align", [
        { label: "⇤", title: "Align left", on: function () { self.alignSelected("left"); } },
        { label: "▮", title: "Center horizontally", on: function () { self.alignSelected("hcenter"); } },
        { label: "⇥", title: "Align right", on: function () { self.alignSelected("right"); } },
        { label: "⤒", title: "Align top", on: function () { self.alignSelected("top"); } },
        { label: "▬", title: "Center vertically", on: function () { self.alignSelected("vmiddle"); } },
        { label: "⤓", title: "Align bottom", on: function () { self.alignSelected("bottom"); } }
      ]);
      if (multiSel.length >= 3) actionRow("Distribute", [
        { label: "↔ Across", title: "Distribute horizontally", on: function () { self.distributeSelected("h"); } },
        { label: "↕ Down", title: "Distribute vertically", on: function () { self.distributeSelected("v"); } }
      ]);
      actionRow("Group", [
        { label: "Group", title: "Group (⌘G)", on: function () { self.groupSelected(); } },
        { label: "Ungroup", title: "Ungroup (⇧⌘G)", on: function () { self.ungroupSelected(); } }
      ]);
      var mhint = document.createElement("p"); mhint.className = "insp__hint";
      mhint.textContent = "Drag to move all together · Shift-click an item to add or remove it.";
      box.appendChild(mhint);
      return;
    }

    if (!el) {
      // Nothing selected → edit the slide itself.
      head("SLIDE");
      var sname = document.createElement("input"); sname.type = "text"; sname.value = this.slide().name || "";
      sname.addEventListener("input", function () { self.slide().name = this.value; self.save(); self.renderSlideList(); });
      field("Slide name", sname);
      colorRow("Background", this.slide().background || "#ffffff", function (c) { self.slide().background = c; self.save(); self.renderStage(); });

      var transSel = document.createElement("select");
      (global.MosaicRenderer.TRANSITION_TYPES || []).forEach(function (a) {
        var o = document.createElement("option"); o.value = a.id; o.textContent = a.label;
        if ((self.slide().transition || "none") === a.id) o.selected = true; transSel.appendChild(o);
      });
      transSel.addEventListener("change", function () { self.slide().transition = this.value; self.save(); });
      field("Transition (when this slide opens)", transSel);

      var lockNext = document.createElement("input"); lockNext.type = "checkbox"; lockNext.checked = !!this.slide().lockNext;
      lockNext.addEventListener("change", function () { self.slide().lockNext = this.checked; self.save(); });
      var lnField = field("Lock the Next button (use an on-slide button)", lockNext);
      lnField.parentNode.classList.add("insp__field--inline");

      head("COURSE");
      var langSel = document.createElement("select");
      LANGUAGES.forEach(function (o) {
        var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
        if ((self.course.lang || "en") === o[0]) op.selected = true;
        langSel.appendChild(op);
      });
      langSel.addEventListener("change", function () {
        self.course.lang = this.value; self.save(); self.renderStage(); // re-render applies RTL
      });
      field("Language", langSel);

      var reqA = document.createElement("input"); reqA.type = "checkbox"; reqA.checked = !!this.course.requireAnswers;
      reqA.addEventListener("change", function () { self.course.requireAnswers = this.checked; self.save(); });
      var raField = field("Require answering questions before advancing", reqA);
      raField.parentNode.classList.add("insp__field--inline");
      var raNote = document.createElement("p"); raNote.className = "insp__hint";
      raNote.textContent = "Applies to the whole course (takes effect in the published output).";
      box.appendChild(raNote);
      return;
    }

    head(el.type.toUpperCase());

    // Contextual tabs (Pixelmator-style): Style / Arrange / Timing.
    var INSP_TABS = [["style", "Style", "adjust"], ["arrange", "Arrange", "layers"], ["timing", "Timing", "clock"]];
    if (!this.inspectorTab) this.inspectorTab = "style";
    var activeTab = this.inspectorTab;
    var tabBar = document.createElement("div");
    tabBar.className = "insp__tabs"; tabBar.setAttribute("role", "tablist");
    INSP_TABS.forEach(function (t) {
      var tb = document.createElement("button"); tb.type = "button";
      tb.className = "insp__tab" + (activeTab === t[0] ? " is-on" : "");
      tb.title = t[1]; tb.setAttribute("aria-label", t[1]);
      tb.innerHTML = window.MosaicIcons ? MosaicIcons.svg(t[2], 16) : t[1];
      tb.addEventListener("click", function () { self.inspectorTab = t[0]; self.renderInspector(); });
      tabBar.appendChild(tb);
    });
    box.appendChild(tabBar);

    // --- TIMING tab: when the element appears + how long it stays ---
    if (activeTab === "timing") {
      var sdur = self.slide().duration || 5;
      if (el.type === "audio") {
        var anote = document.createElement("p"); anote.className = "insp__hint";
        anote.textContent = "Narration plays from the slide start and sets the slide length.";
        box.appendChild(anote);
        return;
      }
      var st = document.createElement("input"); st.type = "number"; st.min = "0"; st.step = "0.1"; st.value = el.start || 0;
      st.addEventListener("change", function () {
        el.start = Math.max(0, parseFloat(this.value) || 0); self.save(); self.renderStage();
        if (self.timeline) self.timeline.render();
      });
      field("Start (seconds)", st);

      var whole = el.duration == null;
      var wck = document.createElement("input"); wck.type = "checkbox"; wck.checked = whole;
      wck.addEventListener("change", function () {
        el.duration = this.checked ? null : Math.max(0.1, sdur - (el.start || 0));
        self.save(); self.renderStage(); if (self.timeline) self.timeline.render(); self.renderInspector();
      });
      var wfield = field("Show for the whole slide", wck);
      wfield.parentNode.classList.add("insp__field--inline");

      if (!whole) {
        var du = document.createElement("input"); du.type = "number"; du.min = "0.1"; du.step = "0.1"; du.value = el.duration;
        du.addEventListener("change", function () {
          el.duration = Math.max(0.1, parseFloat(this.value) || 0.1); self.save(); self.renderStage();
          if (self.timeline) self.timeline.render();
        });
        field("Duration (seconds)", du);
      }

      // Entrance animation — plays when the element appears (its start time or a
      // trigger reveal); also previewable here without entering full Preview.
      var animSel = document.createElement("select");
      (global.MosaicRenderer.ANIM_TYPES || []).forEach(function (a) {
        var o = document.createElement("option"); o.value = a.id; o.textContent = a.label;
        if ((el.animIn || "none") === a.id) o.selected = true; animSel.appendChild(o);
      });
      animSel.addEventListener("change", function () { el.animIn = this.value; self.save(); self.renderInspector(); });
      field("Entrance animation", animSel);

      var outSel = document.createElement("select");
      (global.MosaicRenderer.EXIT_TYPES || []).forEach(function (a) {
        var o = document.createElement("option"); o.value = a.id; o.textContent = a.label;
        if ((el.animOut || "none") === a.id) o.selected = true; outSel.appendChild(o);
      });
      outSel.addEventListener("change", function () { el.animOut = this.value; self.save(); self.renderInspector(); });
      field("Exit animation", outSel);

      var hasAnim = (el.animIn || "none") !== "none" || (el.animOut || "none") !== "none";
      if (hasAnim) {
        var ams = document.createElement("input"); ams.type = "number"; ams.min = "100"; ams.step = "50"; ams.value = el.animMs || 450;
        ams.addEventListener("change", function () { el.animMs = Math.max(100, parseInt(this.value, 10) || 450); self.save(); });
        field("Animation duration (ms)", ams);

        var easeSel = document.createElement("select");
        [["smooth", "Smooth"], ["linear", "Linear"], ["bounce", "Bounce"]].forEach(function (o) {
          var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
          if ((el.animEase || "smooth") === o[0]) op.selected = true; easeSel.appendChild(op);
        });
        easeSel.addEventListener("change", function () { el.animEase = this.value; self.save(); });
        field("Easing", easeSel);

        var dly = document.createElement("input"); dly.type = "number"; dly.min = "0"; dly.step = "50"; dly.value = el.animDelay || 0;
        dly.addEventListener("change", function () { el.animDelay = Math.max(0, parseInt(this.value, 10) || 0); self.save(); });
        var dlyf = field("Delay before start (ms)", dly);
        if (dlyf.parentNode) { var dh = document.createElement("p"); dh.className = "insp__hint"; dh.textContent = "Stagger builds by giving elements different delays."; box.appendChild(dh); }

        var pv = document.createElement("button"); pv.type = "button"; pv.className = "btn"; pv.textContent = "▶ Preview animation";
        pv.style.cssText = "width:100%;margin:2px 0 4px;";
        pv.addEventListener("click", function () {
          var n = self.refs.stage.querySelector('[data-el-id="' + el.id + '"]');
          if (!n) return;
          if ((el.animIn || "none") !== "none") global.MosaicRenderer.playAnim(n, el.animIn, el.animMs);
          else global.MosaicRenderer.playExit(n, el.animOut, el.animMs, function () {});
        });
        box.appendChild(pv);
      }

      var loopSel = document.createElement("select");
      (global.MosaicRenderer.LOOP_TYPES || []).forEach(function (a) {
        var o = document.createElement("option"); o.value = a.id; o.textContent = a.label;
        if ((el.loop || "none") === a.id) o.selected = true; loopSel.appendChild(o);
      });
      loopSel.addEventListener("change", function () { el.loop = this.value; self.save(); });
      field("Loop (attention)", loopSel);

      var tnote = document.createElement("p"); tnote.className = "insp__hint";
      tnote.textContent = "Slide is " + sdur + "s long. You can also drag the bar in the timeline.";
      box.appendChild(tnote);
      return;
    }

    // --- ARRANGE tab: position, size, layering ---
    if (activeTab === "arrange") {
      if (el.x == null || el.type === "audio") {
        var pnote = document.createElement("p"); pnote.className = "insp__hint";
        pnote.textContent = "This element has no position on the slide.";
        box.appendChild(pnote);
      } else {
      var grid = document.createElement("div"); grid.className = "insp__grid";
      ["x", "y", "w", "h"].forEach(function (k) {
        var cell = document.createElement("label"); cell.className = "insp__gridcell";
        var s = document.createElement("span"); s.textContent = k.toUpperCase();
        var c = document.createElement("input"); c.type = "number"; c.value = Math.round(el[k]);
        c.addEventListener("change", function () { self.setField(k, parseInt(this.value, 10) || 0, true); });
        cell.appendChild(s); cell.appendChild(c); grid.appendChild(cell);
      });
      field("Position & size", grid);

      var rotInput = document.createElement("input");
      rotInput.type = "number"; rotInput.min = "0"; rotInput.max = "359"; rotInput.value = Math.round(el.rotation || 0);
      rotInput.addEventListener("change", function () { self.setField("rotation", (((parseInt(this.value, 10) || 0) % 360) + 360) % 360, true); self.selectChrome(); });
      field("Rotation (°)", rotInput);

      var lockCk = document.createElement("input"); lockCk.type = "checkbox"; lockCk.checked = !!el.locked;
      lockCk.addEventListener("change", function () { self.setField("locked", this.checked || undefined, true); self.selectChrome(); });
      var lockField = field("Lock (prevent moving/resizing)", lockCk);
      lockField.parentNode.classList.add("insp__field--inline");

      toggleRow("Arrange", [
        { label: "⤒", title: "To front", on: function () { self.arrange("front"); } },
        { label: "↑", title: "Forward", on: function () { self.arrange("forward"); } },
        { label: "↓", title: "Backward", on: function () { self.arrange("backward"); } },
        { label: "⤓", title: "To back", on: function () { self.arrange("back"); } }
      ]);
      }
      return;
    }

    // --- STYLE tab (default): type-specific appearance ---
    // Optional element name (shown on its timeline lane; placeholder = the default).
    var nameInput = document.createElement("input");
    nameInput.type = "text"; nameInput.value = el.name || ""; nameInput.placeholder = elementLabel(el);
    nameInput.addEventListener("input", function () {
      var v = this.value.trim(); if (v) el.name = v; else delete el.name;
      self.save(); if (self.timeline) self.timeline.render();
    });
    field("Name", nameInput);

    if (el.type === "text") {
      var roleSel = document.createElement("select");
      [["heading1", "Heading 1"], ["heading2", "Heading 2"], ["heading3", "Heading 3"], ["body", "Body text"]]
        .forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o[0]; opt.textContent = o[1];
          if ((el.role || "body") === o[0]) opt.selected = true;
          roleSel.appendChild(opt);
        });
      roleSel.addEventListener("change", function () {
        // Role is a STYLE preset: sets the semantic tag AND a default size/weight.
        var r = this.value;
        var preset = { heading1: { size: 48, bold: true }, heading2: { size: 34, bold: true },
                       heading3: { size: 26, bold: true }, body: { size: 22, bold: false } }[r];
        el.role = r;
        if (preset) { el.fontSize = preset.size; el.bold = preset.bold; }
        self.save(); self.renderStage(); self.renderInspector();
      });
      field("Style", roleSel);

      var fontSel = document.createElement("select");
      (Renderer.FONT_OPTIONS || [["system", "System"]]).forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0]; opt.textContent = o[1];
        if ((el.fontFamily || "system") === o[0]) opt.selected = true;
        fontSel.appendChild(opt);
      });
      fontSel.addEventListener("change", function () { self.setField("fontFamily", this.value, true); });
      field("Font", fontSel);

      var size = sizeInput(el.fontSize, 16, function (v) { self.setField("fontSize", v, true); });
      field("Font size", size);

      colorRow("Text color", el.color, function (c) { self.setField("color", c, true); self.renderContrast(); });

      var boldOn = (el.bold != null) ? el.bold : (parseInt(el.weight, 10) >= 600);
      toggleRow("Style", [
        { label: "<b>B</b>", title: "Bold", active: boldOn, on: function () { self.setField("bold", !boldOn, true); self.renderInspector(); } },
        { label: "<i>I</i>", title: "Italic", active: !!el.italic, on: function () { self.setField("italic", !el.italic, true); self.renderInspector(); } },
        { label: "<u>U</u>", title: "Underline", active: !!el.underline, on: function () { self.setField("underline", !el.underline, true); self.renderInspector(); } }
      ]);
      var rtHint = document.createElement("p"); rtHint.className = "insp__hint";
      rtHint.innerHTML = "Rich text: while editing, select words and press <b>⌘B</b> / <b>⌘I</b> / <b>⌘U</b>, <b>⌘K</b> link, <b>⇧⌘H</b> highlight.";
      box.appendChild(rtHint);

      toggleRow("Align", [
        { label: "⇤", title: "Left", active: el.align === "left", on: function () { self.setField("align", "left", true); self.renderInspector(); } },
        { label: "↔", title: "Center", active: el.align === "center", on: function () { self.setField("align", "center", true); self.renderInspector(); } },
        { label: "⇥", title: "Right", active: el.align === "right", on: function () { self.setField("align", "right", true); self.renderInspector(); } }
      ]);

      // Bulleted / numbered list. Markers are added at render time; each line of
      // the text box is one list item (Enter = new item).
      toggleRow("List", [
        { label: "None", title: "No list", active: !el.list, on: function () { self.setField("list", null, true); self.renderInspector(); } },
        { label: "• List", title: "Bulleted list", active: el.list === "bullet", on: function () { self.setField("list", "bullet", true); self.renderInspector(); } },
        { label: "1. List", title: "Numbered list", active: el.list === "number", on: function () { self.setField("list", "number", true); self.renderInspector(); } }
      ]);

      var lh = document.createElement("input");
      lh.type = "number"; lh.min = "0.8"; lh.max = "3"; lh.step = "0.05"; lh.value = el.lineHeight || 1.25;
      lh.addEventListener("change", function () { self.setField("lineHeight", parseFloat(this.value) || 1.25, true); });
      field("Line height", lh);

      this.renderContrastInto(box, el);

    } else if (el.type === "image") {
      var alt = document.createElement("input");
      alt.type = "text"; alt.value = el.alt || ""; alt.placeholder = "Describe the image…";
      alt.disabled = !!el.decorative;
      alt.addEventListener("input", function () { self.setField("alt", this.value, false); });
      field("Alt text", alt);

      var dec = document.createElement("input");
      dec.type = "checkbox"; dec.checked = !!el.decorative;
      dec.addEventListener("change", function () {
        self.setField("decorative", this.checked, true);
        self.renderInspector();
      });
      var decField = field("Decorative (hide from screen readers)", dec);
      decField.parentNode.classList.add("insp__field--inline");

      var irad = document.createElement("input");
      irad.type = "number"; irad.min = "0"; irad.max = "400"; irad.value = el.radius || 0;
      irad.addEventListener("change", function () { self.setField("radius", parseInt(this.value, 10) || 0, true); });
      field("Corner radius", irad);

      opacityField(field, el, self);

      var replace = document.createElement("button");
      replace.type = "button"; replace.className = "btn"; replace.textContent = "Replace image…";
      replace.style.cssText = "width:100%;margin-top:4px;";
      replace.addEventListener("click", function () {
        self.pickImage(function (dataURL) { self.setField("src", dataURL, true); });
      });
      box.appendChild(replace);

    } else if (el.type === "video") {
      var vsrc = document.createElement("input");
      vsrc.type = "text";
      vsrc.value = (el.src && el.src.indexOf("data:") !== 0) ? el.src : "";
      vsrc.placeholder = (el.src && el.src.indexOf("data:") === 0) ? "(embedded file)" : "YouTube / Vimeo / .mp4 URL";
      vsrc.addEventListener("change", function () { self.setField("src", this.value.trim(), true); });
      field("Video URL", vsrc);

      var rep = document.createElement("button");
      rep.type = "button"; rep.className = "btn"; rep.textContent = "Replace with a file…";
      rep.style.cssText = "width:100%;margin:2px 0 6px;";
      rep.addEventListener("click", function () { self.pickVideo(function (d) { self.setField("src", d, true); self.renderInspector(); }); });
      box.appendChild(rep);

      [["Show controls", "controls"], ["Autoplay (muted)", "autoplay"], ["Loop", "vloop"], ["Muted", "muted"]].forEach(function (o) {
        var ck = document.createElement("input"); ck.type = "checkbox"; ck.checked = !!el[o[1]];
        ck.addEventListener("change", function () { self.setField(o[1], this.checked, true); });
        var f = field(o[0], ck); f.parentNode.classList.add("insp__field--inline");
      });

      var valt = document.createElement("input");
      valt.type = "text"; valt.value = el.alt || ""; valt.placeholder = "Describe the video…";
      valt.addEventListener("input", function () { self.setField("alt", this.value, false); });
      field("Alt text", valt);

      var vrad = document.createElement("input");
      vrad.type = "number"; vrad.min = "0"; vrad.max = "400"; vrad.value = el.radius || 0;
      vrad.addEventListener("change", function () { self.setField("radius", parseInt(this.value, 10) || 0, true); });
      field("Corner radius", vrad);
      opacityField(field, el, self);

    } else if (el.type === "roleplay") {
      // Practice Mode authoring: define the AI persona, scenario, goal, rubric.
      var rpNote = document.createElement("p");
      rpNote.className = "insp__hint";
      rpNote.textContent = global.MosaicAI && global.MosaicAI.usingMock()
        ? "Demo mode (no API key) — runs a scripted phishing persona so you can try it offline."
        : "Live AI persona (claude-opus-4-8).";
      box.appendChild(rpNote);

      function rpArea(label, prop, ph) {
        var ta = document.createElement("textarea");
        ta.rows = 3; ta.value = el[prop] || ""; ta.placeholder = ph || "";
        ta.style.cssText = "width:100%;resize:vertical;font:inherit;";
        ta.addEventListener("input", function () { self.setField(prop, this.value, false); });
        ta.addEventListener("change", function () { self.setField(prop, this.value, true); });
        field(label, ta);
      }
      var rpTitle = document.createElement("input");
      rpTitle.type = "text"; rpTitle.value = el.title || "";
      rpTitle.addEventListener("input", function () { self.setField("title", this.value, false); self.renderStage(); });
      rpTitle.addEventListener("change", function () { self.setField("title", this.value, true); });
      field("Title", rpTitle);

      rpArea("AI persona / character", "persona", "Who the AI plays…");
      rpArea("Scenario", "scenario", "The situation…");
      rpArea("Learner's goal", "objective", "What they must do…");
      rpArea("Opening line (AI speaks first)", "opening", "");
      rpArea("Grading rubric", "rubric", "PASS if… otherwise FAIL.");

      // Pass/fail variable — reuses the course's variables so the result can drive
      // triggers (show a certificate, branch, etc.).
      var vlist = (self.course.variables || []).filter(function (v) { return v.type === "boolean"; });
      var pvSel = document.createElement("select");
      var none = document.createElement("option"); none.value = ""; none.textContent = vlist.length ? "— none —" : "(no boolean variables yet)";
      pvSel.appendChild(none);
      vlist.forEach(function (v) {
        var o = document.createElement("option"); o.value = v.name; o.textContent = v.name;
        if (el.passVar === v.name) o.selected = true; pvSel.appendChild(o);
      });
      pvSel.addEventListener("change", function () { self.setField("passVar", this.value, true); });
      field("Set variable on result", pvSel);

      var mt = document.createElement("input");
      mt.type = "number"; mt.min = "2"; mt.max = "20"; mt.value = el.maxTurns || 8;
      mt.addEventListener("change", function () { self.setField("maxTurns", parseInt(this.value, 10) || 8, true); });
      field("Max learner turns", mt);

    } else if (el.type === "rect") {
      var kind = el.kind || "rect";
      var kindSel = document.createElement("select");
      [["rect", "Rectangle"], ["ellipse", "Ellipse"], ["line", "Line"], ["triangle", "Triangle"],
       ["diamond", "Diamond"], ["pentagon", "Pentagon"], ["hexagon", "Hexagon"], ["star", "Star"], ["arrow", "Arrow"]].forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0]; opt.textContent = o[1];
        if (kind === o[0]) opt.selected = true;
        kindSel.appendChild(opt);
      });
      kindSel.addEventListener("change", function () { self.setField("kind", this.value, true); self.renderInspector(); });
      field("Shape", kindSel);

      if (kind !== "line") {
        colorRow("Fill", el.fill, function (c) { self.setField("fill", c, true); });
      }

      colorRow(kind === "line" ? "Line color" : "Border color", el.stroke || "#1c2430", function (c) { self.setField("stroke", c, true); });

      var sw = document.createElement("input");
      sw.type = "number"; sw.min = "0"; sw.max = "40"; sw.value = el.strokeWidth || 0;
      sw.addEventListener("change", function () { self.setField("strokeWidth", parseInt(this.value, 10) || 0, true); });
      field(kind === "line" ? "Thickness" : "Border width", sw);

      if (kind === "rect") {
        var rad = document.createElement("input");
        rad.type = "number"; rad.min = "0"; rad.max = "200"; rad.value = el.radius || 0;
        rad.addEventListener("change", function () { self.setField("radius", parseInt(this.value, 10) || 0, true); });
        field("Corner radius", rad);
      }

      opacityField(field, el, self);
      var note = document.createElement("p");
      note.className = "insp__hint";
      note.textContent = "Shapes are decorative (hidden from screen readers).";
      box.appendChild(note);

    } else if (el.type === "icon") {
      var changeBtn = document.createElement("button");
      changeBtn.type = "button"; changeBtn.className = "btn"; changeBtn.style.width = "100%";
      changeBtn.textContent = "Change icon…";
      changeBtn.addEventListener("click", function () { self.openIconPicker(el); });
      field("Icon", changeBtn);
      colorRow("Color", el.color, function (c) { self.setField("color", c, true); });
      opacityField(field, el, self);

    } else if (el.type === "question") {
      var qkind = el.kind || "single";
      var kindSel = document.createElement("select");
      [["single", "Multiple choice (one answer)"], ["multiple", "Multiple response (select all)"],
       ["truefalse", "True / False"], ["fill", "Fill in the blank"], ["matching", "Matching"],
       ["dragdrop", "Drag and drop"]].forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0]; opt.textContent = o[1];
        if (qkind === o[0]) opt.selected = true;
        kindSel.appendChild(opt);
      });
      kindSel.addEventListener("change", function () { self.setQuestionKind(el, this.value); });
      field("Question type", kindSel);

      var qFont = document.createElement("select");
      (Renderer.FONT_OPTIONS || [["system", "System"]]).forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0]; opt.textContent = o[1];
        if ((el.fontFamily || "system") === o[0]) opt.selected = true;
        qFont.appendChild(opt);
      });
      qFont.addEventListener("change", function () { self.setField("fontFamily", this.value, true); });
      field("Font", qFont);

      var qSize = sizeInput(el.fontSize || 22, 22, function (v) { self.setField("fontSize", v, true); });
      field("Font size", qSize);

      colorRow("Text color", el.color || "#1c2430", function (c) { self.setField("color", c, true); });

      var prompt = document.createElement("textarea");
      prompt.rows = 2; prompt.value = el.prompt;
      prompt.addEventListener("input", function () { el.prompt = this.value; self.save(); self.renderStage(); });
      field("Question prompt", prompt);

      if (qkind === "fill") {
        var aHead = document.createElement("p"); aHead.className = "insp__label";
        aHead.textContent = "Accepted answers (any match counts)"; box.appendChild(aHead);
        el.answers.forEach(function (ans, i) {
          var row = document.createElement("div"); row.className = "insp__choice";
          var txt = document.createElement("input"); txt.type = "text"; txt.value = ans;
          txt.addEventListener("input", function () { el.answers[i] = this.value; self.save(); });
          var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel";
          del.textContent = "×"; del.title = "Remove"; del.disabled = el.answers.length <= 1;
          del.addEventListener("click", function () { el.answers.splice(i, 1); self.save(); self.renderInspector(); });
          row.appendChild(txt); row.appendChild(del); box.appendChild(row);
        });
        var addAns = document.createElement("button"); addAns.type = "button"; addAns.className = "btn";
        addAns.textContent = "+ Accepted answer"; addAns.style.cssText = "width:100%;margin:4px 0 10px;";
        addAns.addEventListener("click", function () { el.answers.push(""); self.save(); self.renderInspector(); });
        box.appendChild(addAns);

        var cs = document.createElement("input"); cs.type = "checkbox"; cs.checked = !!el.caseSensitive;
        cs.addEventListener("change", function () { el.caseSensitive = this.checked; self.save(); });
        var csField = field("Case-sensitive", cs); csField.parentNode.classList.add("insp__field--inline");

      } else if (qkind === "matching") {
        var pHead = document.createElement("p"); pHead.className = "insp__label";
        pHead.textContent = "Pairs (left matches right)"; box.appendChild(pHead);
        el.pairs.forEach(function (p, i) {
          var row = document.createElement("div"); row.className = "insp__pair";
          var lf = document.createElement("input"); lf.type = "text"; lf.value = p.left; lf.placeholder = "Left";
          lf.addEventListener("input", function () { p.left = this.value; self.save(); self.renderStage(); });
          var rt = document.createElement("input"); rt.type = "text"; rt.value = p.right; rt.placeholder = "Right";
          rt.addEventListener("input", function () { p.right = this.value; self.save(); self.renderStage(); });
          var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel";
          del.textContent = "×"; del.title = "Remove pair"; del.disabled = el.pairs.length <= 2;
          del.addEventListener("click", function () { el.pairs.splice(i, 1); self.save(); self.renderStage(); self.renderInspector(); });
          row.appendChild(lf); row.appendChild(rt); row.appendChild(del); box.appendChild(row);
        });
        var addPair = document.createElement("button"); addPair.type = "button"; addPair.className = "btn";
        addPair.textContent = "+ Pair"; addPair.style.cssText = "width:100%;margin:4px 0 10px;";
        addPair.addEventListener("click", function () { el.pairs.push({ left: "", right: "" }); self.save(); self.renderStage(); self.renderInspector(); });
        box.appendChild(addPair);

      } else if (qkind === "dragdrop") {
        var zHead = document.createElement("p"); zHead.className = "insp__label";
        zHead.textContent = "Drop zones (categories)"; box.appendChild(zHead);
        el.zones.forEach(function (z, zi) {
          var row = document.createElement("div"); row.className = "insp__pair";
          var zt = document.createElement("input"); zt.type = "text"; zt.value = z; zt.placeholder = "Category";
          zt.addEventListener("input", function () { el.zones[zi] = this.value; self.save(); self.renderStage(); });
          var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel";
          del.textContent = "×"; del.title = "Remove zone"; del.disabled = el.zones.length <= 2;
          del.addEventListener("click", function () {
            el.zones.splice(zi, 1);
            el.items.forEach(function (it) { if (it.zone === zi) it.zone = 0; else if (it.zone > zi) it.zone--; });
            self.save(); self.renderStage(); self.renderInspector();
          });
          row.appendChild(zt); row.appendChild(del); box.appendChild(row);
        });
        var addZone = document.createElement("button"); addZone.type = "button"; addZone.className = "btn";
        addZone.textContent = "+ Category"; addZone.style.cssText = "width:100%;margin:4px 0 10px;";
        addZone.addEventListener("click", function () { el.zones.push("New category"); self.save(); self.renderStage(); self.renderInspector(); });
        box.appendChild(addZone);

        var iHead = document.createElement("p"); iHead.className = "insp__label";
        iHead.textContent = "Items (and the category each belongs in)"; box.appendChild(iHead);
        el.items.forEach(function (it, ii) {
          var row = document.createElement("div"); row.className = "insp__pair";
          var itx = document.createElement("input"); itx.type = "text"; itx.value = it.text; itx.placeholder = "Item";
          itx.addEventListener("input", function () { it.text = this.value; self.save(); self.renderStage(); });
          var zsel = document.createElement("select");
          el.zones.forEach(function (z, zi) { var o = document.createElement("option"); o.value = String(zi); o.textContent = z; if (it.zone === zi) o.selected = true; zsel.appendChild(o); });
          zsel.addEventListener("change", function () { it.zone = parseInt(this.value, 10) || 0; self.save(); self.renderStage(); });
          var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel";
          del.textContent = "×"; del.title = "Remove item"; del.disabled = el.items.length <= 1;
          del.addEventListener("click", function () { el.items.splice(ii, 1); self.save(); self.renderStage(); self.renderInspector(); });
          row.appendChild(itx); row.appendChild(zsel); row.appendChild(del); box.appendChild(row);
        });
        var addItem = document.createElement("button"); addItem.type = "button"; addItem.className = "btn";
        addItem.textContent = "+ Item"; addItem.style.cssText = "width:100%;margin:4px 0 10px;";
        addItem.addEventListener("click", function () { el.items.push({ text: "New item", zone: 0 }); self.save(); self.renderStage(); self.renderInspector(); });
        box.appendChild(addItem);

      } else if (qkind === "truefalse") {
        var tfHead = document.createElement("p"); tfHead.className = "insp__label";
        tfHead.textContent = "Correct answer"; box.appendChild(tfHead);
        ["True", "False"].forEach(function (lbl, i) {
          var row = document.createElement("label"); row.className = "insp__choice";
          var r = document.createElement("input"); r.type = "radio"; r.name = "insp-tf"; r.checked = (el.answerIndex || 0) === i;
          r.addEventListener("change", function () { self.setField("answerIndex", i, true); });
          var sp = document.createElement("span"); sp.textContent = lbl; sp.style.cssText = "padding-left:6px;";
          row.appendChild(r); row.appendChild(sp); box.appendChild(row);
        });

      } else {
        var multi = qkind === "multiple";
        var cHead = document.createElement("p"); cHead.className = "insp__label";
        cHead.textContent = multi ? "Choices (check all correct)" : "Choices (select the correct one)";
        box.appendChild(cHead);
        if (!el.answerIndices) el.answerIndices = [];
        el.choices.forEach(function (choice, i) {
          var row = document.createElement("div"); row.className = "insp__choice";
          var correct = document.createElement("input");
          correct.type = multi ? "checkbox" : "radio"; correct.name = "insp-correct"; correct.title = "Mark correct";
          correct.checked = multi ? (el.answerIndices.indexOf(i) >= 0) : (el.answerIndex === i);
          correct.addEventListener("change", function () {
            if (multi) {
              var pos = el.answerIndices.indexOf(i);
              if (this.checked && pos < 0) el.answerIndices.push(i);
              else if (!this.checked && pos >= 0) el.answerIndices.splice(pos, 1);
              self.save();
            } else { self.setField("answerIndex", i, true); }
          });
          var txt = document.createElement("input"); txt.type = "text"; txt.value = choice;
          txt.addEventListener("input", function () { el.choices[i] = this.value; self.save(); self.renderStage(); });
          var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel";
          del.textContent = "×"; del.title = "Remove choice"; del.disabled = el.choices.length <= 2;
          del.addEventListener("click", function () {
            el.choices.splice(i, 1);
            if (multi) {
              el.answerIndices = el.answerIndices.filter(function (x) { return x !== i; })
                .map(function (x) { return x > i ? x - 1 : x; });
            } else if (el.answerIndex >= el.choices.length) { el.answerIndex = el.choices.length - 1; }
            self.save(); self.renderStage(); self.renderInspector();
          });
          row.appendChild(correct); row.appendChild(txt); row.appendChild(del); box.appendChild(row);
        });
        var addChoice = document.createElement("button");
        addChoice.type = "button"; addChoice.className = "btn"; addChoice.textContent = "+ Choice";
        addChoice.style.cssText = "width:100%;margin:4px 0 10px;";
        addChoice.addEventListener("click", function () {
          el.choices.push("New choice"); self.save(); self.renderStage(); self.renderInspector();
        });
        box.appendChild(addChoice);
      }

      var pts = document.createElement("input");
      pts.type = "number"; pts.min = "0"; pts.max = "1000"; pts.value = el.points;
      pts.addEventListener("change", function () { el.points = parseInt(this.value, 10) || 0; self.save(); });
      field("Points", pts);

      var fbC = document.createElement("input");
      fbC.type = "text"; fbC.value = el.feedbackCorrect || ""; fbC.placeholder = "Shown when correct (optional)";
      fbC.addEventListener("input", function () { el.feedbackCorrect = this.value; self.save(); });
      field("Feedback — correct", fbC);
      var fbI = document.createElement("input");
      fbI.type = "text"; fbI.value = el.feedbackIncorrect || ""; fbI.placeholder = "Shown when incorrect (optional)";
      fbI.addEventListener("input", function () { el.feedbackIncorrect = this.value; self.save(); });
      field("Feedback — incorrect", fbI);

    } else if (el.type === "result") {
      var rhint = document.createElement("p"); rhint.className = "insp__hint";
      rhint.textContent = "Shows the learner's score + pass/fail in the published course. Put it on your final slide.";
      box.appendChild(rhint);
      colorRow("Color", el.color, function (c) { self.setField("color", c, true); });
      var rsize = sizeInput(el.fontSize || 32, 32, function (v) { self.setField("fontSize", v, true); });
      field("Font size", rsize);

    } else if (el.type === "button") {
      var blabel = document.createElement("input");
      blabel.type = "text"; blabel.value = el.label || "";
      blabel.addEventListener("input", function () {
        el.label = this.value; self.save(); self.renderStage();
        if (self.timeline) self.timeline.render(); // keep the lane name in sync
      });
      field("Label", blabel);

      var variant = el.variant || "filled";
      toggleRow("Style", [
        { label: "Filled", active: variant === "filled", on: function () { self.setField("variant", "filled", true); self.renderInspector(); } },
        { label: "Outline", active: variant === "outline", on: function () { self.setField("variant", "outline", true); self.renderInspector(); } },
        { label: "Text", active: variant === "text", on: function () { self.setField("variant", "text", true); self.renderInspector(); } }
      ]);

      var act = el.action || { type: "next" };
      var actSel = document.createElement("select");
      [["next", "Go to next slide"], ["prev", "Go to previous slide"], ["goto", "Go to slide…"],
       ["submit", "Submit / score quiz"], ["url", "Open a link"]].forEach(function (o) {
        var opt = document.createElement("option");
        opt.value = o[0]; opt.textContent = o[1];
        if ((act.type || "next") === o[0]) opt.selected = true;
        actSel.appendChild(opt);
      });
      actSel.addEventListener("change", function () {
        var t = this.value, next = { type: t };
        if (t === "goto") next.slide = (act.slide != null ? act.slide : 0);
        if (t === "url") next.url = act.url || "";
        el.action = next; self.save(); self.renderStage(); self.renderInspector();
      });
      field("When clicked", actSel);

      if (act.type === "goto") {
        var slideSel = document.createElement("select");
        self.course.slides.forEach(function (s, i) {
          var opt = document.createElement("option");
          opt.value = String(i);
          opt.textContent = (i + 1) + ". " + (s.name || ("Slide " + (i + 1)));
          // Prefer the stable id match; fall back to the legacy index.
          if (act.slideId != null ? act.slideId === s.id : (act.slide || 0) === i) opt.selected = true;
          slideSel.appendChild(opt);
        });
        slideSel.addEventListener("change", function () {
          var i = parseInt(this.value, 10) || 0;
          // Store BOTH: the id survives slide reordering; the index is the
          // fallback so old players/courses keep working.
          el.action = { type: "goto", slide: i, slideId: (self.course.slides[i] || {}).id }; self.save(); self.renderStage();
        });
        field("Target slide", slideSel);
      }
      if (act.type === "url") {
        var url = document.createElement("input");
        url.type = "url"; url.value = act.url || ""; url.placeholder = "https://…";
        url.addEventListener("input", function () { el.action = { type: "url", url: this.value }; self.save(); self.renderStage(); });
        field("Link URL", url);
      }

      colorRow(variant === "filled" ? "Button color" : "Accent color", el.fill || "#3b6ef5", function (c) { self.setField("fill", c, true); });
      if (variant === "filled") {
        colorRow("Label color", el.color || "#ffffff", function (c) { self.setField("color", c, true); });
      }

      var bsize = document.createElement("input");
      bsize.type = "number"; bsize.min = "10"; bsize.max = "80"; bsize.value = el.fontSize || 20;
      bsize.addEventListener("change", function () { self.setField("fontSize", parseInt(this.value, 10) || 20, true); });
      field("Font size", bsize);

      var brad = document.createElement("input");
      brad.type = "number"; brad.min = "0"; brad.max = "200"; brad.value = el.radius != null ? el.radius : 10;
      brad.addEventListener("change", function () { self.setField("radius", parseInt(this.value, 10) || 0, true); });
      field("Corner radius", brad);
    }

    // --- Interactions: start-hidden + click triggers (all visual elements) ---
    if (el.x != null && el.type !== "audio") {
      var ihd = document.createElement("div"); ihd.className = "insp__type";
      ihd.textContent = "INTERACTIONS"; box.appendChild(ihd);

      var hiddenCk = document.createElement("input"); hiddenCk.type = "checkbox"; hiddenCk.checked = !!el.hidden;
      hiddenCk.addEventListener("change", function () { el.hidden = this.checked; self.save(); self.renderStage(); });
      var hidField = field("Start hidden (shown by an interaction)", hiddenCk);
      hidField.parentNode.classList.add("insp__field--inline");

      if (el.type !== "question") { // questions are answered, not click-triggers
        if (!el.triggers) el.triggers = [];
        var others = self.slide().elements.filter(function (e) { return e.id !== el.id && e.x != null && e.type !== "audio"; });
        var vlist = self.course.variables || [];
        // A Practice (roleplay) element's triggers fire when the scenario is SCORED
        // (event "complete"), not on click — so the pass/fail panels can branch on
        // the result variable. Everything else triggers on click.
        var isRoleplay = el.type === "roleplay";
        var whenLabel = isRoleplay ? "When scored →" : "When clicked →";
        el.triggers.forEach(function (t, ti) {
          var row = document.createElement("div"); row.className = "insp__trigger";
          var tlab = document.createElement("span"); tlab.className = "insp__triglabel"; tlab.textContent = whenLabel;
          row.appendChild(tlab);
          var act = document.createElement("select");
          [["show", "Show"], ["hide", "Hide"], ["toggle", "Toggle"], ["animate", "Animate"], ["setState", "Set state…"],
           ["setVar", "Set variable…"],
           ["next", "Go to next slide"], ["prev", "Go to previous slide"], ["goto", "Go to slide…"]].forEach(function (o) {
            var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
            if ((t.action || "show") === o[0]) op.selected = true; act.appendChild(op);
          });
          act.addEventListener("change", function () {
            t.action = this.value;
            if (/^(show|hide|toggle|setState|animate)$/.test(t.action) && t.target == null && others[0]) t.target = others[0].id;
            if (t.action === "setState" && t.state == null) t.state = "selected";
            if (t.action === "goto" && t.slide == null) t.slide = 0;
            if (t.action === "setVar" && t.varName == null && vlist[0]) { t.varName = vlist[0].name; t.varOp = "add"; t.varValue = "1"; }
            self.save(); self.renderInspector();
          });
          row.appendChild(act);

          if (/^(show|hide|toggle|setState|animate)$/.test(t.action || "show")) {
            var tgt = document.createElement("select");
            if (!others.length) { var none = document.createElement("option"); none.textContent = "(no other elements)"; tgt.appendChild(none); tgt.disabled = true; }
            others.forEach(function (e) {
              var op = document.createElement("option"); op.value = e.id; op.textContent = elementLabel(e);
              if (t.target === e.id) op.selected = true; tgt.appendChild(op);
            });
            tgt.addEventListener("change", function () { t.target = this.value; self.save(); });
            row.appendChild(tgt);
          }
          if (t.action === "animate") {
            var efSel = document.createElement("select");
            var effects = [["entrance", "Its entrance"]].concat(
              (global.MosaicRenderer.EMPHASIS_TYPES || []).map(function (e) { return [e.id, e.label]; }));
            effects.forEach(function (o) {
              var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
              if ((t.effect || "entrance") === o[0]) op.selected = true; efSel.appendChild(op);
            });
            efSel.addEventListener("change", function () { t.effect = this.value; self.save(); });
            row.appendChild(efSel);
          }
          if (t.action === "setState") {
            var stSel = document.createElement("select");
            [["normal", "Normal"], ["selected", "Selected"], ["visited", "Visited"], ["disabled", "Disabled"]].forEach(function (o) {
              var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1];
              if ((t.state || "selected") === o[0]) op.selected = true; stSel.appendChild(op);
            });
            stSel.addEventListener("change", function () { t.state = this.value; self.save(); });
            row.appendChild(stSel);
          }
          if (t.action === "goto") {
            var ssel = document.createElement("select");
            self.course.slides.forEach(function (s, si) {
              var op = document.createElement("option"); op.value = String(si);
              op.textContent = (si + 1) + ". " + (s.name || ("Slide " + (si + 1)));
              if (t.slideId != null ? t.slideId === s.id : (t.slide || 0) === si) op.selected = true; ssel.appendChild(op);
            });
            ssel.addEventListener("change", function () {
              var si = parseInt(this.value, 10) || 0;
              t.slide = si; t.slideId = (self.course.slides[si] || {}).id; // id survives reordering; index = legacy fallback
              self.save();
            });
            row.appendChild(ssel);
          }
          if (t.action === "setVar") {
            if (!vlist.length) {
              var nov = document.createElement("span"); nov.className = "insp__hint"; nov.textContent = "Add a variable first (Variables button)."; row.appendChild(nov);
            } else {
              var vSel = document.createElement("select");
              vlist.forEach(function (v) { var op = document.createElement("option"); op.value = v.name; op.textContent = v.name; if (t.varName === v.name) op.selected = true; vSel.appendChild(op); });
              vSel.addEventListener("change", function () { t.varName = this.value; self.save(); }); row.appendChild(vSel);
              var opSel = document.createElement("select");
              [["add", "+ add"], ["set", "= set"], ["toggle", "toggle"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if ((t.varOp || "add") === o[0]) op.selected = true; opSel.appendChild(op); });
              opSel.addEventListener("change", function () { t.varOp = this.value; self.save(); self.renderInspector(); }); row.appendChild(opSel);
              if ((t.varOp || "add") !== "toggle") {
                var valIn = document.createElement("input"); valIn.type = "text"; valIn.value = (t.varValue != null ? t.varValue : ""); valIn.placeholder = "value"; valIn.style.width = "64px";
                valIn.addEventListener("change", function () { t.varValue = this.value; self.save(); }); row.appendChild(valIn);
              }
            }
          }
          var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel";
          del.textContent = "×"; del.title = "Remove interaction";
          del.addEventListener("click", function () { el.triggers.splice(ti, 1); self.save(); self.renderInspector(); });
          row.appendChild(del);
          box.appendChild(row);

          // Optional "only if [variable] [op] [value]" condition (needs variables).
          if (vlist.length) {
            var condRow = document.createElement("div"); condRow.className = "insp__trigger";
            var clab = document.createElement("span"); clab.className = "insp__triglabel"; clab.textContent = "only if"; condRow.appendChild(clab);
            var cvSel = document.createElement("select");
            var o0 = document.createElement("option"); o0.value = ""; o0.textContent = "(always)"; cvSel.appendChild(o0);
            vlist.forEach(function (v) { var op = document.createElement("option"); op.value = v.name; op.textContent = v.name; if (t.cond && t.cond.varName === v.name) op.selected = true; cvSel.appendChild(op); });
            cvSel.addEventListener("change", function () { if (!this.value) { t.cond = null; } else { t.cond = t.cond || { op: "=", value: "" }; t.cond.varName = this.value; } self.save(); self.renderInspector(); });
            condRow.appendChild(cvSel);
            if (t.cond && t.cond.varName) {
              var coSel = document.createElement("select");
              [["=", "="], ["!=", "≠"], [">", ">"], ["<", "<"], [">=", "≥"], ["<=", "≤"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if ((t.cond.op || "=") === o[0]) op.selected = true; coSel.appendChild(op); });
              coSel.addEventListener("change", function () { t.cond.op = this.value; self.save(); }); condRow.appendChild(coSel);
              var cval = document.createElement("input"); cval.type = "text"; cval.value = (t.cond.value != null ? t.cond.value : ""); cval.placeholder = "value"; cval.style.width = "56px";
              cval.addEventListener("change", function () { t.cond.value = this.value; self.save(); }); condRow.appendChild(cval);
            }
            box.appendChild(condRow);
          }
        });

        var addTrig = document.createElement("button"); addTrig.type = "button"; addTrig.className = "btn";
        addTrig.textContent = "+ Interaction"; addTrig.style.cssText = "width:100%;margin:4px 0 6px;";
        addTrig.addEventListener("click", function () {
          el.triggers.push({ event: isRoleplay ? "complete" : "click", action: "show", target: (others[0] ? others[0].id : null) });
          self.save(); self.renderInspector();
        });
        box.appendChild(addTrig);
        var inote = document.createElement("p"); inote.className = "insp__hint";
        inote.textContent = "Click interactions run in the published course.";
        box.appendChild(inote);

        // Visual states — per-state color/opacity overrides applied at runtime.
        var sHead = document.createElement("div"); sHead.className = "insp__type"; sHead.textContent = "VISUAL STATES"; box.appendChild(sHead);
        if (!el.states) el.states = {};
        var colorKey = (el.type === "text") ? "color" : (el.type === "rect" || el.type === "button") ? "fill" : null;
        [["hover", "Hover"], ["selected", "Selected"], ["visited", "Visited"], ["disabled", "Disabled"]].forEach(function (sk) {
          var key = sk[0];
          var srow = document.createElement("div"); srow.className = "insp__state";
          var en = document.createElement("input"); en.type = "checkbox"; en.checked = !!el.states[key];
          en.addEventListener("change", function () {
            if (this.checked) { if (!el.states[key]) el.states[key] = {}; } else { delete el.states[key]; }
            self.save(); self.renderInspector();
          });
          var nm = document.createElement("span"); nm.className = "insp__statename"; nm.textContent = sk[1];
          srow.appendChild(en); srow.appendChild(nm);
          if (el.states[key]) {
            if (colorKey) {
              var sval = el.states[key][colorKey] || el[colorKey] || (colorKey === "fill" ? "#3b6ef5" : "#1c2430");
              var col = document.createElement("button"); col.type = "button"; col.className = "insp__colorchip insp__colorchip--mini";
              col.style.background = sval; col.title = (colorKey === "fill") ? "Fill" : "Text color";
              col.addEventListener("click", function (ev) {
                ev.stopPropagation();
                self.openColorPopover(col, sval, function (c) { sval = c; col.style.background = c; el.states[key][colorKey] = c; self.save(); });
              });
              srow.appendChild(col);
            }
            var op = document.createElement("input"); op.type = "number"; op.min = "0"; op.max = "1"; op.step = "0.05";
            op.className = "insp__stateop"; op.title = "Opacity";
            op.value = el.states[key].opacity != null ? el.states[key].opacity : (el.opacity != null ? el.opacity : 1);
            op.addEventListener("change", function () { el.states[key].opacity = Math.max(0, Math.min(1, parseFloat(this.value) || 0)); self.save(); });
            srow.appendChild(op);
          }
          box.appendChild(srow);
        });
        var snote = document.createElement("p"); snote.className = "insp__hint";
        snote.textContent = "Hover applies automatically; Visited after a click; set Selected/Disabled with a Set-state interaction.";
        box.appendChild(snote);
      }
    }
  };

  // Live contrast readout for the selected text element.
  Editor.prototype.renderContrastInto = function (box, el) {
    var A11y = global.MosaicA11y;
    if (!A11y) return;
    var ratio = A11y.contrastRatio(el.color, this.slide().background || "#ffffff");
    var line = document.createElement("p");
    line.className = "insp__contrast";
    if (ratio == null) { line.textContent = "Contrast: —"; box.appendChild(line); return; }
    var need = A11y.aaThreshold(el);
    var ok = ratio >= need;
    line.classList.add(ok ? "is-pass" : "is-fail");
    line.textContent = (ok ? "✓ " : "✕ ") + "Contrast " + ratio.toFixed(2) + ":1 (AA needs " + need + ":1)";
    box.appendChild(line);
  };
  Editor.prototype.renderContrast = function () {
    // re-render the whole inspector to refresh the contrast line
    this.renderInspector();
  };

  // --- Accessibility audit --------------------------------------------------
  Editor.prototype.runAudit = function () {
    var A11y = global.MosaicA11y;
    var panel = this.refs.audit;
    if (!A11y || !panel) return;
    var issues = A11y.auditCourse(this.course);
    panel.innerHTML = "";
    panel.hidden = false;

    var head = document.createElement("div");
    head.className = "audit__head";
    var nSlides = this.course.slides.length;
    var across = " across " + nSlides + " slide" + (nSlides === 1 ? "" : "s");
    head.textContent = (issues.length ? ("Accessibility: " + issues.length + " issue" + (issues.length === 1 ? "" : "s")) : "Accessibility: all clear ✓") + across;
    panel.appendChild(head);

    var self = this;
    issues.forEach(function (iss) {
      var row = document.createElement("div");
      row.className = "audit__row audit__row--" + iss.severity;
      var where = iss.slideIndex >= 0 ? ("Slide " + (iss.slideIndex + 1) + ": ") : "Course: ";
      row.textContent = where + iss.message;
      if (iss.slideIndex >= 0 && iss.elId) {
        row.classList.add("is-clickable");
        row.addEventListener("click", function () {
          self.gotoSlide(iss.slideIndex);
          self.select(iss.elId);
        });
      }
      panel.appendChild(row);
    });
  };

  Editor.prototype.addElement = function (type) {
    var self = this;
    if (type === "image") { this.pickImage(function (dataURL) { self.insertImage(dataURL); }); return; }
    if (type === "video") { this.addVideo(); return; }
    // New elements pick up the brand so content stays on-brand by default.
    var b = this.course.brand || {};
    var opts = {};
    if (type === "text") { opts.fontFamily = b.bodyFont || "system"; opts.color = b.ink || "#1c2430"; }
    if (type === "rect") { opts.fill = b.accent || "#3b6ef5"; }
    if (type === "button") { opts.fill = b.accent || "#3b6ef5"; opts.fontFamily = b.headingFont || "system"; }
    var el = Model.makeElement(type, opts);
    this.slide().elements.push(el);
    this.save();
    this.renderStage();
    if (this.timeline) this.timeline.render();
    this.select(el.id);
  };

  // Add a shape of a specific kind ("rect" | "ellipse" | "line"), keeping it
  // on-brand. Used by the + Shape dropdown so the kind is chosen up front.
  Editor.prototype.addShape = function (kind) {
    var b = this.course.brand || {};
    var opts = { kind: kind || "rect", fill: b.accent || "#3b6ef5" };
    if (kind === "line") { opts.stroke = b.accent || "#3b6ef5"; opts.h = 6; }
    if (kind === "ellipse") { opts.radius = 0; } // ellipse uses 50% via kind
    var el = Model.makeElement("rect", opts);
    this.slide().elements.push(el);
    this.save();
    this.renderStage();
    if (this.timeline) this.timeline.render();
    this.select(el.id);
  };

  // Drop a pre-wired interaction preset (tabs/accordion/reveal/hotspots) onto
  // the current slide — or splice in a branching-scenario slide block. The
  // result is ordinary elements + triggers; nothing preset-specific survives.
  Editor.prototype.insertPreset = function (kind) {
    if (!global.MosaicPresets) return;
    var self = this;
    var built = global.MosaicPresets.build(kind, this.course.brand || {}, this.slideIndex, this.course.slides.length);
    if (!built) return;
    (built.variables || []).forEach(function (v) {
      self.course.variables = self.course.variables || [];
      if (!self.course.variables.some(function (x) { return x.name === v.name; })) self.course.variables.push(v);
    });
    if (built.elements && built.elements.length) {
      var slide = this.slide();
      built.elements.forEach(function (el) { slide.elements.push(el); });
    }
    if (built.slides && built.slides.length) {
      var at = this.slideIndex + 1;
      built.slides.forEach(function (s, i) { self.course.slides.splice(at + i, 0, s); });
      this.slideIndex = at; // land on the block's first slide (the decision)
    }
    this.save();
    this.renderAll();
    if (built.elements && built.elements.length) this.select(built.elements[0].id);
    if (built.slides && built.slides.length) this.focusSlideChip(this.slideIndex);
  };

  // Open a native file picker and return the chosen image as a data URL.
  // Embedding the image keeps the .mosaic file (and SCORM package) self-contained.
  Editor.prototype.pickImage = function (cb) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { cb(reader.result); };
      reader.readAsDataURL(file);
    });
    input.click();
  };

  // Insert an image element sized to the picture's aspect ratio, centered.
  Editor.prototype.insertImage = function (dataURL) {
    var self = this;
    var img = new Image();
    function place(w, h) {
      var el = Model.makeElement("image", {
        src: dataURL, w: w, h: h,
        x: Math.round((self.course.stage.w - w) / 2),
        y: Math.round((self.course.stage.h - h) / 2)
      });
      self.slide().elements.push(el);
      self.save();
      self.renderStage();
      if (self.timeline) self.timeline.render();
      self.select(el.id);
    }
    img.onload = function () {
      var maxW = 480;
      var w = Math.min(maxW, img.naturalWidth || maxW);
      var h = img.naturalWidth ? Math.round(w * img.naturalHeight / img.naturalWidth) : 300;
      place(w, h);
    };
    img.onerror = function () { place(400, 300); };
    img.src = dataURL;
  };

  // Insert video: paste a link (YouTube/Vimeo/.mp4) or pick a file (embedded).
  Editor.prototype.addVideo = function () {
    var self = this;
    var url = global.prompt("Paste a video link (YouTube, Vimeo, or a .mp4 URL).\nLeave blank to choose a file from your Mac.", "");
    if (url === null) return; // cancelled
    url = url.trim();
    if (url) self.insertVideo(url);
    else self.pickVideo(function (dataURL) { self.insertVideo(dataURL); });
  };
  Editor.prototype.pickVideo = function (cb) {
    var input = document.createElement("input");
    input.type = "file"; input.accept = "video/*";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { cb(reader.result); };
      reader.readAsDataURL(file);
    });
    input.click();
  };
  Editor.prototype.insertVideo = function (src) {
    var w = 480, h = 270;
    var el = Model.makeElement("video", {
      src: src, w: w, h: h,
      x: Math.round((this.course.stage.w - w) / 2),
      y: Math.round((this.course.stage.h - h) / 2)
    });
    this.slide().elements.push(el);
    this.save();
    this.renderStage();
    if (this.timeline) this.timeline.render();
    this.select(el.id);
  };

  // Pick an audio file and add it as narration; the slide length snaps to it.
  Editor.prototype.pickAudio = function (cb) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { cb(reader.result, file.name); };
      reader.readAsDataURL(file);
    });
    input.click();
  };

  Editor.prototype.addAudio = function () {
    var self = this;
    this.pickAudio(function (dataURL, name) { self.insertAudioData(dataURL, name); });
  };

  // Add narration from audio bytes (used by the picker AND timeline drag-drop).
  // durationOverride: trust this length instead of the decoded one (TTS sends the
  // exact sample-count duration). narrationKind: "tts" | "rec" — tags the clip so
  // the timeline shows the right icon and we can tell narration types apart.
  Editor.prototype.insertAudioData = function (dataURL, name, durationOverride, narrationKind) {
    var self = this;
    function place(dur) {
      var el = Model.makeElement("audio", {
        src: dataURL, duration: dur,
        name: (name || "Narration").replace(/\.[^.]+$/, "")
      });
      if (narrationKind) el.narration = narrationKind;
      self.slide().elements.push(el);
      self.slide().duration = dur; // snap the slide length to the narration
      // Auto-scale: extend the slide's visual elements to the new length
      // (keeps their start times; trimmed reveals re-extend to the end).
      self.slide().elements.forEach(function (x) { if (x.type !== "audio") x.duration = null; });
      self.save();
      self.renderAll();
      self.select(el.id);
    }
    if (durationOverride && durationOverride > 0) { place(Math.max(1, Math.round(durationOverride * 10) / 10)); return; }
    var a = new Audio();
    a.addEventListener("loadedmetadata", function () { place(Math.max(1, Math.round((a.duration || 5) * 10) / 10)); });
    a.src = dataURL;
  };

  // "Fit": align everything to a target length, then snap all visual elements to it.
  // Target = the SELECTED object's length if one is selected; otherwise the longest
  // clip (the audio/VO when present, else the longest element).
  Editor.prototype.fitElementsToSlide = function () {
    var slide = this.slide(), sel = this.selectedEl(), target;
    if (sel) {
      target = Renderer.timeWindow(sel, slide.duration).end;
    } else {
      var audios = slide.elements.filter(function (e) { return e.type === "audio" && (e.duration || 0) > 0; });
      target = 0;
      if (audios.length) {
        audios.forEach(function (a) { target = Math.max(target, (a.start || 0) + (a.duration || 0)); });
      } else {
        slide.elements.forEach(function (e) { target = Math.max(target, Renderer.timeWindow(e, slide.duration).end); });
      }
    }
    slide.duration = Math.max(1, Math.round(target * 10) / 10);
    slide.elements.forEach(function (x) { if (x.type !== "audio") { x.start = 0; x.duration = null; } });
    this.save();
    this.renderAll();
  };

  // Show/hide stage elements for a given playhead time (null = show all / edit).
  Editor.prototype.applyTimeVisibility = function (t) {
    var slide = this.slide();
    var nodes = this.refs.stage.querySelectorAll(".m-el");
    var self = this;
    Array.prototype.forEach.call(nodes, function (node) {
      var el = self.findEl(node.dataset.elId);
      if (!el) return;
      if (t == null) { node.style.visibility = ""; node.dataset.shown = ""; return; }
      var w = Renderer.timeWindow(el, slide.duration);
      var visible = (t >= w.start - 1e-6 && t < w.end - 1e-6);
      if (visible) {
        node.style.visibility = "";
        if (node.dataset.shown !== "1") { node.dataset.shown = "1"; Renderer.playAnim(node, el.animIn, el.animMs, { ease: el.animEase, delay: el.animDelay }); }
      } else if (node.dataset.shown === "1") {
        node.dataset.shown = "0";
        if (el.animOut && el.animOut !== "none") {
          Renderer.playExit(node, el.animOut, el.animMs, function () { node.style.visibility = "hidden"; }, { ease: el.animEase });
        } else { node.style.visibility = "hidden"; }
      } else {
        node.style.visibility = "hidden";
      }
    });
  };

  Editor.prototype.deleteSelected = function () {
    var ids = this.selectedIds && this.selectedIds.length ? this.selectedIds.slice() : (this.selectedId ? [this.selectedId] : []);
    if (!ids.length) return;
    this.slide().elements = this.slide().elements.filter(function (e) { return ids.indexOf(e.id) < 0; });
    this.selectedIds = []; this.selectedId = null;
    this.save();
    this.renderStage();
    this.renderInspector();
    if (this.timeline) this.timeline.render(); // drop the lane(s) too
  };

  Editor.prototype.duplicateSelected = function () {
    var src = this.selectedEls();
    if (!src.length) return;
    var self = this, newIds = [], regroup = {};
    src.forEach(function (el) {
      var copy = JSON.parse(JSON.stringify(el));
      copy.id = Model.uid("el");
      if (copy.x != null) { copy.x += 24; copy.y += 24; }
      if (copy.group) { regroup[copy.group] = regroup[copy.group] || Model.uid("grp"); copy.group = regroup[copy.group]; }
      self.slide().elements.push(copy);
      newIds.push(copy.id);
    });
    this.save();
    this.renderStage();
    if (this.timeline) this.timeline.render(); // give the copies their lanes
    this.selectedIds = newIds; this.selectedId = newIds[newIds.length - 1] || null;
    this.selectChrome(); this.renderInspector();
    if (this.timeline) this.timeline.highlightSelected();
  };

  // --- Clipboard: copy / cut / paste elements (PowerPoint/Keynote-style) ----
  Editor.prototype.copySelected = function () {
    var els = this.selectedEls();
    if (!els.length) return false;
    this._clipboard = els.map(function (e) { return JSON.parse(JSON.stringify(e)); });
    this._clipPastes = 0;
    return true;
  };
  Editor.prototype.cutSelected = function () {
    if (this.copySelected()) this.deleteSelected();
  };
  Editor.prototype.pasteClipboard = function () {
    if (!this._clipboard || !this._clipboard.length) return false;
    this._clipPastes = (this._clipPastes || 0) + 1;
    var off = 20 * this._clipPastes, self = this, newIds = [], regroup = {};
    this._clipboard.forEach(function (src) {
      var copy = JSON.parse(JSON.stringify(src));
      copy.id = Model.uid("el");
      delete copy._ox; delete copy._oy;
      if (copy.x != null) { copy.x = (copy.x || 0) + off; copy.y = (copy.y || 0) + off; }
      if (copy.group) { regroup[copy.group] = regroup[copy.group] || Model.uid("grp"); copy.group = regroup[copy.group]; }
      self.slide().elements.push(copy); newIds.push(copy.id);
    });
    this.save();
    this.renderStage();
    if (this.timeline) this.timeline.render();
    this.selectedIds = newIds; this.selectedId = newIds[newIds.length - 1] || null;
    this.selectChrome(); this.renderInspector();
    if (this.timeline) this.timeline.highlightSelected();
    return true;
  };

  // Paste at the same coordinates (no offset) — right-click → Paste in place.
  Editor.prototype.pasteInPlace = function () {
    if (!this._clipboard || !this._clipboard.length) return false;
    var self = this, newIds = [], regroup = {};
    this._clipboard.forEach(function (src) {
      var copy = JSON.parse(JSON.stringify(src)); copy.id = Model.uid("el");
      delete copy._ox; delete copy._oy;
      if (copy.group) { regroup[copy.group] = regroup[copy.group] || Model.uid("grp"); copy.group = regroup[copy.group]; }
      self.slide().elements.push(copy); newIds.push(copy.id);
    });
    this.save(); this.renderStage(); if (this.timeline) this.timeline.render();
    this.selectedIds = newIds; this.selectedId = newIds[newIds.length - 1] || null;
    this.selectChrome(); this.renderInspector(); if (this.timeline) this.timeline.highlightSelected();
    return true;
  };

  // Nudge selected elements by (dx,dy) px — arrow keys (Shift = bigger step).
  Editor.prototype.nudgeSelected = function (dx, dy) {
    var els = this.selectedEls().filter(function (e) { return e.x != null && !e.locked; });
    if (!els.length) return;
    els.forEach(function (e) { e.x = Math.round(e.x + dx); e.y = Math.round(e.y + dy); });
    this.save(); this.renderStage();
  };

  // Grow/shrink the font of selected text/question elements (⌘⇧> / ⌘⇧<).
  Editor.prototype.growFont = function (delta) {
    var els = this.selectedEls().filter(function (e) { return e.type === "text" || e.type === "question"; });
    if (!els.length) return;
    els.forEach(function (e) { e.fontSize = Math.max(8, Math.min(300, (e.fontSize || 24) + delta)); });
    this.save(); this.renderStage(); this.renderInspector();
  };

  // Copy/paste STYLE (formatting only) between objects (⌥⌘C / ⌥⌘V).
  var STYLE_KEYS = ["fontFamily", "fontSize", "color", "bold", "italic", "underline", "align",
    "lineHeight", "list", "fill", "stroke", "strokeWidth", "radius", "opacity", "variant"];
  Editor.prototype.copyStyle = function () {
    var el = this.selectedEl(); if (!el) return false;
    var s = {}; STYLE_KEYS.forEach(function (k) { if (el[k] !== undefined) s[k] = el[k]; });
    this._styleClip = s; return true;
  };
  Editor.prototype.pasteStyle = function () {
    if (!this._styleClip) return false;
    var clip = this._styleClip;
    this.selectedEls().forEach(function (el) {
      STYLE_KEYS.forEach(function (k) { if (clip[k] !== undefined && el[k] !== undefined) el[k] = clip[k]; });
    });
    this.save(); this.renderStage(); this.renderInspector();
    return true;
  };

  // Lock / unlock selected elements (locked = can't move/resize until unlocked).
  Editor.prototype.toggleLockSelected = function () {
    var els = this.selectedEls(); if (!els.length) return;
    var allLocked = els.every(function (e) { return e.locked; });
    els.forEach(function (e) { if (allLocked) delete e.locked; else e.locked = true; });
    this.save(); this.renderStage(); this.selectChrome(); this.renderInspector();
  };

  // Right-click context menu (PowerPoint/Keynote-style). `onEl` true when over an element.
  Editor.prototype.openContextMenu = function (clientX, clientY, onEl) {
    var self = this;
    var old = document.querySelector(".ctxmenu"); if (old) old.remove();
    var sel = this.selectedEls();
    var items = [];
    if (onEl && sel.length) {
      var locked = sel.every(function (e) { return e.locked; });
      items.push({ label: "Cut", on: function () { self.cutSelected(); } });
      items.push({ label: "Copy", on: function () { self.copySelected(); } });
      items.push({ label: "Copy style", on: function () { self.copyStyle(); } });
      if (this._styleClip) items.push({ label: "Paste style", on: function () { self.pasteStyle(); } });
      items.push({ label: "Duplicate", on: function () { self.duplicateSelected(); } });
      items.push({ sep: true });
      items.push({ label: "Bring to front", on: function () { self.arrange("front"); } });
      items.push({ label: "Bring forward", on: function () { self.arrange("forward"); } });
      items.push({ label: "Send backward", on: function () { self.arrange("backward"); } });
      items.push({ label: "Send to back", on: function () { self.arrange("back"); } });
      items.push({ sep: true });
      if (sel.length > 1) items.push({ label: "Group", on: function () { self.groupSelected(); } });
      if (sel.some(function (e) { return e.group; })) items.push({ label: "Ungroup", on: function () { self.ungroupSelected(); } });
      items.push({ label: locked ? "Unlock" : "Lock", on: function () { self.toggleLockSelected(); } });
      items.push({ sep: true });
      items.push({ label: "Delete", on: function () { self.deleteSelected(); } });
    } else {
      var hasClip = !!(this._clipboard && this._clipboard.length);
      items.push({ label: "Paste", disabled: !hasClip, on: function () { self.pasteClipboard(); } });
      items.push({ label: "Paste in place", disabled: !hasClip, on: function () { self.pasteInPlace(); } });
      items.push({ label: "Select all", on: function () { self.selectAll(); } });
    }
    var m = document.createElement("div"); m.className = "ctxmenu"; m.setAttribute("role", "menu");
    items.forEach(function (it) {
      if (it.sep) { var s = document.createElement("div"); s.className = "ctxmenu__sep"; m.appendChild(s); return; }
      var b = document.createElement("button"); b.type = "button"; b.className = "ctxmenu__item"; b.textContent = it.label;
      if (it.disabled) { b.disabled = true; }
      else b.addEventListener("click", function () { close(); it.on(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var mw = m.offsetWidth, mh = m.offsetHeight, pad = 8;
    m.style.left = Math.max(pad, Math.min(clientX, window.innerWidth - mw - pad)) + "px";
    m.style.top = Math.max(pad, Math.min(clientY, window.innerHeight - mh - pad)) + "px";
    function close() { m.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); }
    function away(e) { if (!m.contains(e.target)) close(); }
    function esc(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true); }, 0);
  };

  // --- Align / distribute / group (multi-select design tools) ---------------
  Editor.prototype.alignSelected = function (how) {
    var els = this.selectedEls().filter(function (e) { return e.x != null; });
    if (els.length < 2) return;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    els.forEach(function (e) { minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x + e.w); minY = Math.min(minY, e.y); maxY = Math.max(maxY, e.y + e.h); });
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    els.forEach(function (e) {
      if (how === "left") e.x = minX;
      else if (how === "right") e.x = maxX - e.w;
      else if (how === "hcenter") e.x = Math.round(cx - e.w / 2);
      else if (how === "top") e.y = minY;
      else if (how === "bottom") e.y = maxY - e.h;
      else if (how === "vmiddle") e.y = Math.round(cy - e.h / 2);
    });
    this.save(); this.renderStage();
  };
  Editor.prototype.distributeSelected = function (axis) {
    var els = this.selectedEls().filter(function (e) { return e.x != null; });
    if (els.length < 3) return;
    var horiz = axis === "h";
    els.sort(function (a, b) { return horiz ? (a.x + a.w / 2) - (b.x + b.w / 2) : (a.y + a.h / 2) - (b.y + b.h / 2); });
    var first = els[0], last = els[els.length - 1];
    var startC = horiz ? first.x + first.w / 2 : first.y + first.h / 2;
    var endC = horiz ? last.x + last.w / 2 : last.y + last.h / 2;
    var step = (endC - startC) / (els.length - 1);
    els.forEach(function (e, i) {
      var c = startC + step * i;
      if (horiz) e.x = Math.round(c - e.w / 2); else e.y = Math.round(c - e.h / 2);
    });
    this.save(); this.renderStage();
  };
  Editor.prototype.groupSelected = function () {
    var els = this.selectedEls().filter(function (e) { return e.x != null; });
    if (els.length < 2) return;
    var gid = Model.uid("grp");
    els.forEach(function (e) { e.group = gid; });
    this.save(); this.selectChrome(); this.renderInspector();
  };
  Editor.prototype.ungroupSelected = function () {
    var els = this.selectedEls();
    if (!els.length) return;
    els.forEach(function (e) { delete e.group; });
    this.save(); this.selectChrome(); this.renderInspector();
  };

  // Z-order (= render order = array order). "front" = last = on top.
  Editor.prototype.arrange = function (dir) {
    var els = this.slide().elements, el = this.selectedEl();
    var i = els.indexOf(el);
    if (i < 0) return;
    els.splice(i, 1);
    if (dir === "front") els.push(el);
    else if (dir === "back") els.unshift(el);
    else if (dir === "forward") els.splice(Math.min(els.length, i + 1), 0, el);
    else els.splice(Math.max(0, i - 1), 0, el);
    this.save();
    this.renderStage();
  };

  // --- Smart alignment guides + snapping (on-canvas) ------------------------
  // Snap the dragged element's edges/centers to other elements + slide center/edges.
  Editor.prototype.snapPosition = function (el, nx, ny) {
    var slide = this.slide(), sw = this.course.stage.w, sh = this.course.stage.h;
    var thr = 6 / this.scale;
    var xt = [0, sw, sw / 2], yt = [0, sh, sh / 2];
    slide.elements.forEach(function (o) {
      if (o.id === el.id || o.x == null) return;
      xt.push(o.x, o.x + o.w, o.x + o.w / 2);
      yt.push(o.y, o.y + o.h, o.y + o.h / 2);
    });
    var refsX = [{ p: nx, off: 0 }, { p: nx + el.w / 2, off: el.w / 2 }, { p: nx + el.w, off: el.w }];
    var refsY = [{ p: ny, off: 0 }, { p: ny + el.h / 2, off: el.h / 2 }, { p: ny + el.h, off: el.h }];
    var bx = null, bxd = thr, vG = null, by = null, byd = thr, hG = null;
    refsX.forEach(function (r) { xt.forEach(function (t) { var d = Math.abs(r.p - t); if (d < bxd) { bxd = d; bx = t - r.off; vG = t; } }); });
    refsY.forEach(function (r) { yt.forEach(function (t) { var d = Math.abs(r.p - t); if (d < byd) { byd = d; by = t - r.off; hG = t; } }); });

    // Equal-gap distribution (Keynote pink bars): when the element drops between
    // its nearest neighbour on each side with near-equal gaps, snap it to dead
    // centre so the two gaps match exactly — but only on an axis edge-snap didn't
    // already claim, so the two behaviours never fight.
    var gaps = [];
    function distribute(axis) {
      var posK = axis, sizeK = axis === "x" ? "w" : "h";
      var crossK = axis === "x" ? "y" : "x", crossSizeK = axis === "x" ? "h" : "w";
      var p = axis === "x" ? nx : ny, size = el[sizeK];
      var cpos = axis === "x" ? ny : nx, csize = el[crossSizeK];
      var center = p + size / 2, left = null, right = null;
      slide.elements.forEach(function (o) {
        if (o.id === el.id || o.x == null) return;
        if (o[crossK] + o[crossSizeK] <= cpos || o[crossK] >= cpos + csize) return; // need cross overlap
        var oEnd = o[posK] + o[sizeK];
        if (oEnd <= center) { if (!left || oEnd > left[posK] + left[sizeK]) left = o; }
        else if (o[posK] >= center) { if (!right || o[posK] < right[posK]) right = o; }
      });
      if (!left || !right) return null;
      var lEnd = left[posK] + left[sizeK], rStart = right[posK];
      if (rStart - lEnd < size + 2) return null;            // no room between them
      var target = (lEnd + rStart - size) / 2;
      if (Math.abs(target - p) > thr * 2) return null;       // not close enough
      var gap = (rStart - lEnd - size) / 2;
      if (gap < 1) return null;
      var cc = cpos + csize / 2;
      if (axis === "x") {
        gaps.push({ dir: "h", x1: lEnd, x2: target, y: cc });
        gaps.push({ dir: "h", x1: target + size, x2: rStart, y: cc });
      } else {
        gaps.push({ dir: "v", y1: lEnd, y2: target, x: cc });
        gaps.push({ dir: "v", y1: target + size, y2: rStart, x: cc });
      }
      return Math.round(target);
    }
    if (bx == null) { var dxs = distribute("x"); if (dxs != null) bx = dxs; }
    if (by == null) { var dys = distribute("y"); if (dys != null) by = dys; }

    return { x: Math.round(bx != null ? bx : nx), y: Math.round(by != null ? by : ny), vGuide: vG, hGuide: hG, gaps: gaps };
  };

  Editor.prototype.showAlignGuides = function (vx, hy, gaps) {
    this.hideAlignGuides();
    var stage = this.refs.stage;
    if (vx != null) { var v = document.createElement("div"); v.className = "m-guide m-guide--v"; v.style.left = vx + "px"; stage.appendChild(v); }
    if (hy != null) { var h = document.createElement("div"); h.className = "m-guide m-guide--h"; h.style.top = hy + "px"; stage.appendChild(h); }
    if (gaps && gaps.length) {
      gaps.forEach(function (g) {
        var d = document.createElement("div");
        if (g.dir === "h") {
          d.className = "m-gap m-gap--h";
          d.style.left = g.x1 + "px"; d.style.top = g.y + "px"; d.style.width = Math.max(0, g.x2 - g.x1) + "px";
        } else {
          d.className = "m-gap m-gap--v";
          d.style.top = g.y1 + "px"; d.style.left = g.x + "px"; d.style.height = Math.max(0, g.y2 - g.y1) + "px";
        }
        stage.appendChild(d);
      });
    }
  };
  Editor.prototype.hideAlignGuides = function () {
    var g = this.refs.stage.querySelectorAll(".m-guide, .m-gap");
    Array.prototype.forEach.call(g, function (n) { n.remove(); });
  };

  Editor.prototype.addSlide = function () {
    var n = this.course.slides.length + 1;
    this.course.slides.push(Model.makeSlide({ name: "Slide " + n }));
    this.slideIndex = this.course.slides.length - 1;
    this.selectedId = null;
    this.save();
    this.renderAll();
    this.focusSlideChip(this.slideIndex); // so Delete can remove it right away
  };

  Editor.prototype.gotoSlide = function (i) {
    if (i === this.slideIndex) return; // already here — don't rebuild (keeps inline rename alive)
    this.slideIndex = i;
    this.selectedId = null;
    this.renderAll();
  };

  // Put keyboard focus on a slide chip (the list is rebuilt on selection, so we
  // re-focus after) — this is what lets Delete/Backspace remove that slide.
  Editor.prototype.focusSlideChip = function (i) {
    var list = this.refs.slideList; if (!list) return;
    var chips = list.querySelectorAll(".slide-chip");
    if (chips[i]) chips[i].focus();
  };

  // Drag a slide chip up/down to reorder it (auto-renumbers). Click (no drag) = select.
  Editor.prototype.beginSlideReorder = function (ev, i, chip) {
    if (ev.target && ev.target.getAttribute && ev.target.getAttribute("contenteditable") === "true") return; // renaming
    var self = this, list = this.refs.slideList;
    var startY = ev.clientY, dragging = false, indicator = null;
    function chips() { return Array.prototype.slice.call(list.querySelectorAll(".slide-chip")); }
    function targetIndex(y) {
      var cs = chips(), idx = cs.length;
      for (var k = 0; k < cs.length; k++) { var r = cs[k].getBoundingClientRect(); if (y < r.top + r.height / 2) { idx = k; break; } }
      return idx;
    }
    function showInd(idx) {
      if (!indicator) { indicator = document.createElement("div"); indicator.className = "slide-dropline"; list.appendChild(indicator); }
      var cs = chips(), base = list.getBoundingClientRect().top, top;
      if (idx >= cs.length) top = cs[cs.length - 1].getBoundingClientRect().bottom;
      else top = cs[idx].getBoundingClientRect().top;
      indicator.style.top = (top - base) + "px";
    }
    function move(e) {
      if (!dragging && Math.abs(e.clientY - startY) < 4) return;
      dragging = true; chip.classList.add("is-dragging");
      showInd(targetIndex(e.clientY));
    }
    function up(e) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      chip.classList.remove("is-dragging");
      if (indicator) indicator.remove();
      if (dragging) self.reorderSlide(i, targetIndex(e.clientY));
      else self.gotoSlide(i);
      self.focusSlideChip(self.slideIndex); // keep the rail focused so Delete works
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  // Move a slide to a new position (slide rail order == array order) + renumber.
  Editor.prototype.reorderSlide = function (from, displayedTo) {
    var slides = this.course.slides;
    if (from < 0 || from >= slides.length) return;
    var to = displayedTo;
    var moved = slides.splice(from, 1)[0];
    if (from < to) to--;
    to = Math.max(0, Math.min(slides.length, to));
    slides.splice(to, 0, moved);
    this.slideIndex = to;      // keep the moved slide selected/current
    this.selectedId = null;
    this.save();
    this.renderAll();
  };

  Editor.prototype.deleteSlide = function (i) {
    if (this.course.slides.length <= 1) return;
    this.course.slides.splice(i, 1);
    if (this.slideIndex >= this.course.slides.length) this.slideIndex = this.course.slides.length - 1;
    this.selectedId = null;
    this.save();
    this.renderAll();
  };

  // Duplicate a whole slide (Keynote ⌘D on a selected slide) — deep-clone with
  // fresh element + group ids so nothing collides, insert right after, select it.
  Editor.prototype.duplicateSlide = function (i) {
    if (i == null) i = this.slideIndex;
    var src = this.course.slides[i];
    if (!src) return;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = Model.uid("slide");
    copy.name = (src.name || ("Slide " + (i + 1))) + " copy";
    var groupMap = {};
    (copy.elements || []).forEach(function (el) {
      el.id = Model.uid("el");
      if (el.group) { groupMap[el.group] = groupMap[el.group] || Model.uid("grp"); el.group = groupMap[el.group]; }
    });
    this.course.slides.splice(i + 1, 0, copy);
    this.slideIndex = i + 1;
    this.selectedId = null; this.selectedIds = [];
    this.save();
    this.renderAll();
    this.focusSlideChip(this.slideIndex);
  };

  // Move the current slide up/down in the rail (⌥↑ / ⌥↓ when the rail is focused).
  Editor.prototype.moveSlide = function (delta) {
    var i = this.slideIndex, j = i + delta, s = this.course.slides;
    if (j < 0 || j >= s.length) return;
    s.splice(j, 0, s.splice(i, 1)[0]);
    this.slideIndex = j;
    this.save();
    this.renderAll();
    this.focusSlideChip(j);
  };

  // ⌘D is context-aware: duplicate the focused slide when working in the rail,
  // otherwise duplicate the selected canvas object(s).
  Editor.prototype.duplicateContext = function () {
    var a = document.activeElement;
    if (!this.selectedId && a && a.closest && a.closest("#slide-list")) this.duplicateSlide(this.slideIndex);
    else this.duplicateSelected();
  };

  Editor.prototype.toggleMode = function () {
    this.mode = this.mode === "edit" ? "play" : "edit";
    this.selectedId = null;
    this.editingTextId = null;
    // Fresh variable values each time Preview starts.
    if (this.mode === "play" && global.MosaicInteractions) this._previewVars = global.MosaicInteractions.initVars(this.course);
    this.renderAll();
  };

  // Suite hand-off: flatten the course into an audit-ready Markdown doc that
  // Pedagrade's Audit tab ingests (paste or upload). Content only — layout,
  // triggers, and media are authoring concerns the auditor doesn't grade.
  Editor.prototype.buildAuditMarkdown = function () {
    this.save();
    var c = this.course;
    var out = ["Course: " + (c.title || "Untitled course"), ""];
    c.slides.forEach(function (s, i) {
      out.push("## Slide " + (i + 1) + ": " + (s.name || ""));
      (s.elements || []).forEach(function (el) {
        if (el.type === "text" && el.text) out.push(el.text);
        else if (el.type === "question") {
          out.push("Question (" + (el.kind || "single") + "): " + (el.prompt || ""));
          var correct = el.kind === "multiple" ? (el.answerIndices || []) : [el.answerIndex];
          (el.choices || []).forEach(function (ch, ci) {
            out.push("- " + ch + (correct.indexOf(ci) >= 0 ? " (correct)" : ""));
          });
        } else if (el.type === "roleplay") {
          out.push("Practice scenario: " + (el.title || ""));
          if (el.scenario) out.push("Scenario: " + el.scenario);
          if (el.objective) out.push("Learner objective: " + el.objective);
          if (el.persona) out.push("AI persona: " + el.persona);
          if (el.rubric) out.push("Scoring rubric: " + el.rubric);
        }
      });
      out.push("");
    });
    return out.join("\n");
  };

  Editor.prototype.exportJSON = function () {
    this.save();
    var blob = new Blob([Model.serialize(this.course)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (this.course.title || "course").replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".mosaic.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Dismiss the welcome overlay if it's up (so File ▸ New / Open from the menu or
  // keyboard don't silently act *behind* it). No-op when the welcome isn't shown.
  Editor.prototype.dismissWelcome = function () {
    var b = document.querySelector(".welcome__backdrop");
    if (b) { if (typeof b._shut === "function") b._shut(); else b.remove(); }
  };

  Editor.prototype.newCourse = function (skipConfirm) {
    if (!skipConfirm && !global.confirm("Start a new course? This clears the current draft.")) return;
    this.dismissWelcome();
    this.course = this.starterCourse();
    this.slideIndex = 0;
    this.selectedId = null;
    this.refs.title.value = this.course.title;
    this.save();
    this.renderAll();
  };

  // Load a course from a .mosaic JSON string (used by the native shell's Open).
  Editor.prototype.loadCourse = function (json) {
    this.dismissWelcome();
    this.course = Model.deserialize(json);
    this.slideIndex = 0;
    this.selectedId = null;
    this.editingTextId = null;
    this.refs.title.value = this.course.title;
    this.save();
    this.renderAll();
  };

  // --- Slide list -----------------------------------------------------------
  Editor.prototype.renderSlideList = function () {
    var list = this.refs.slideList, self = this;
    list.innerHTML = "";
    this.course.slides.forEach(function (slide, i) {
      var item = document.createElement("div");
      item.className = "slide-chip" + (i === self.slideIndex ? " is-active" : "");
      item.tabIndex = 0; // focusable so Delete/Backspace can target this slide
      item.setAttribute("role", "button");
      item.setAttribute("aria-label", "Slide " + (i + 1) + " (Delete to remove)");
      var label = document.createElement("span");
      label.className = "slide-chip__num";
      label.textContent = (i + 1);
      var name = document.createElement("span");
      name.className = "slide-chip__name";
      name.textContent = slide.name;
      name.title = "Double-click to rename";
      name.addEventListener("dblclick", function (e) {
        e.stopPropagation();
        name.setAttribute("contenteditable", "true");
        name.classList.add("is-editing");
        name.focus();
        document.execCommand && document.execCommand("selectAll", false, null);
      });
      // While editing, swallow clicks/keys so they don't navigate the slide.
      name.addEventListener("pointerdown", function (e) { if (name.getAttribute("contenteditable") === "true") e.stopPropagation(); });
      name.addEventListener("keydown", function (e) {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); name.blur(); }
        else if (e.key === "Escape") { name.textContent = slide.name; name.blur(); }
      });
      name.addEventListener("blur", function () {
        if (name.getAttribute("contenteditable") !== "true") return;
        name.removeAttribute("contenteditable");
        name.classList.remove("is-editing");
        var v = name.textContent.replace(/\s+/g, " ").trim() || ("Slide " + (i + 1));
        slide.name = v; name.textContent = v;
        self.save();
        if (self.slideIndex === i) self.renderInspector(); // keep the inspector Slide name field in sync
      });
      var head = document.createElement("div"); head.className = "slide-chip__head";
      head.appendChild(label);
      head.appendChild(name);
      // Delete control (hover-revealed). Hidden when only one slide remains,
      // since a course needs at least one. Deleting is undoable (⌘Z).
      if (self.course.slides.length > 1) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "slide-chip__del";
        del.title = "Delete slide";
        del.setAttribute("aria-label", "Delete slide “" + slide.name + "”");
        del.innerHTML = window.MosaicIcons ? MosaicIcons.svg("trash", 13) : "×";
        // Stop pointerdown so it doesn't start a drag/select on the chip.
        del.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
        del.addEventListener("click", function (e) { e.stopPropagation(); self.deleteSlide(i); });
        head.appendChild(del);
      }
      item.appendChild(head);
      // Live thumbnail preview — the actual slide rendered small (PowerPoint-style),
      // so you can recognize slides at a glance. pointer-events:none so it's click-through.
      var thumb = document.createElement("div"); thumb.className = "slide-chip__thumb";
      var inner = document.createElement("div"); inner.className = "slide-chip__thumbinner";
      thumb.appendChild(inner); item.appendChild(thumb);
      try { Renderer.renderSlide(inner, slide); } catch (e) {}
      // Click selects; drag up/down reorders (auto-renumbers). Click vs drag is
      // resolved by a small movement threshold.
      item.addEventListener("pointerdown", function (ev) { self.beginSlideReorder(ev, i, item); });
      list.appendChild(item);
      var w = thumb.clientWidth; if (w) inner.style.transform = "scale(" + (w / 960) + ")";
    });
  };

  // Re-render just the active slide's thumbnail (called after edits so the rail
  // preview stays current without rebuilding the whole list).
  Editor.prototype.refreshActiveThumb = function () {
    var list = this.refs.slideList; if (!list) return;
    var inner = list.querySelector(".slide-chip.is-active .slide-chip__thumbinner");
    if (inner) { try { Renderer.renderSlide(inner, this.slide()); } catch (e) {} }
  };

  // --- Modal + templates + brand kit ----------------------------------------
  // Keyboard-shortcut cheat sheet (Help ▸ Keyboard Shortcuts, or ⌘/).
  Editor.prototype.openShortcuts = function () {
    var groups = [
      ["Selection & objects", [
        ["Select all", "⌘A"], ["Deselect", "Esc"], ["Cycle objects", "Tab / ⇧Tab"],
        ["Duplicate", "⌘D"], ["Delete", "⌫"], ["Group / Ungroup", "⌘G / ⇧⌘G"],
        ["Lock / Unlock", "⌘L"], ["Nudge (⇧ = 10px)", "Arrows"],
        ["Forward / Back (⇧ = front/back)", "⌘] / ⌘["], ["Duplicate while dragging", "⌥-drag"]
      ]],
      ["Clipboard & style", [
        ["Cut / Copy / Paste", "⌘X / ⌘C / ⌘V"], ["Copy / paste style", "⌥⌘C / ⌥⌘V"]
      ]],
      ["Text", [
        ["Edit selected text", "Return / double-click"], ["Bold / Italic / Underline", "⌘B / ⌘I / ⌘U"],
        ["Add link", "⌘K"], ["Highlight", "⇧⌘H"], ["Grow / shrink font", "⌘⇧> / ⌘⇧<"],
        ["Indent / outdent list (editing)", "Tab / ⇧Tab"]
      ]],
      ["Slides", [
        ["New slide", "⇧⌘N"], ["Previous / next slide (rail)", "↑ / ↓"],
        ["Move slide up / down (rail)", "⌥↑ / ⌥↓"], ["Duplicate slide (rail)", "⌘D"], ["Delete slide (rail)", "⌫"]
      ]],
      ["Canvas & timeline", [
        ["Zoom in / out / fit", "⌘+ / ⌘− / ⌘0"], ["Pan the canvas", "hold Space + drag"],
        ["Play / pause timeline", "Space (tap)"]
      ]],
      ["File & history", [
        ["New / Open", "⌘N / ⌘O"], ["Save / Save As", "⌘S / ⇧⌘S"], ["Export SCORM", "⇧⌘E"],
        ["Undo / Redo", "⌘Z / ⇧⌘Z"], ["Preview", "⇧⌘P"]
      ]]
    ];
    var wrap = document.createElement("div");
    wrap.className = "shortcuts";
    groups.forEach(function (g) {
      var sec = document.createElement("div"); sec.className = "shortcuts__group";
      var h = document.createElement("div"); h.className = "shortcuts__head"; h.textContent = g[0]; sec.appendChild(h);
      g[1].forEach(function (row) {
        var r = document.createElement("div"); r.className = "shortcuts__row";
        var l = document.createElement("span"); l.className = "shortcuts__label"; l.textContent = row[0];
        var k = document.createElement("kbd"); k.className = "shortcuts__keys"; k.textContent = row[1];
        r.appendChild(l); r.appendChild(k); sec.appendChild(r);
      });
      wrap.appendChild(sec);
    });
    var note = document.createElement("p");
    note.className = "shortcuts__note";
    note.textContent = "Tip: any menu-bar command's shortcut can be changed in System Settings ▸ Keyboard ▸ Keyboard Shortcuts ▸ App Shortcuts.";
    wrap.appendChild(note);
    this.openModal("Keyboard shortcuts", wrap);
  };

  // Variables panel — a lightweight list (name + type + starting value). Kept
  // deliberately small; power comes from "Set variable" interactions, "only if"
  // conditions, and {name} text tokens.
  Editor.prototype.openVariables = function () {
    var self = this;
    if (!this.course.variables) this.course.variables = [];
    var wrap = document.createElement("div");
    function rebuild() {
      wrap.innerHTML = "";
      var vars = self.course.variables;
      if (!vars.length) {
        var p = document.createElement("p"); p.className = "insp__hint";
        p.textContent = "No variables yet. Add one to track a score, a choice, progress…";
        wrap.appendChild(p);
      }
      vars.forEach(function (v, i) {
        var row = document.createElement("div"); row.className = "insp__trigger";
        var nm = document.createElement("input"); nm.type = "text"; nm.value = v.name || ""; nm.placeholder = "name"; nm.style.width = "120px";
        nm.addEventListener("change", function () { v.name = this.value.replace(/[^\w]/g, ""); self.save(); rebuild(); });
        row.appendChild(nm);
        var ty = document.createElement("select");
        [["number", "Number"], ["text", "Text"], ["boolean", "On / off"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if ((v.type || "number") === o[0]) op.selected = true; ty.appendChild(op); });
        ty.addEventListener("change", function () { v.type = this.value; if (v.type === "number" && isNaN(parseFloat(v.value))) v.value = 0; self.save(); rebuild(); });
        row.appendChild(ty);
        if (v.type === "boolean") {
          var bk = document.createElement("select");
          var on = (v.value === true || v.value === "on" || v.value === "true");
          [["off", "Off"], ["on", "On"]].forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if ((on ? "on" : "off") === o[0]) op.selected = true; bk.appendChild(op); });
          bk.addEventListener("change", function () { v.value = (this.value === "on"); self.save(); });
          row.appendChild(bk);
        } else {
          var val = document.createElement("input"); val.type = (v.type === "number") ? "number" : "text";
          val.value = (v.value != null ? v.value : ""); val.placeholder = "start value"; val.style.width = "90px";
          val.addEventListener("change", function () { v.value = (v.type === "number") ? (parseFloat(this.value) || 0) : this.value; self.save(); });
          row.appendChild(val);
        }
        var del = document.createElement("button"); del.type = "button"; del.className = "insp__choicedel"; del.textContent = "×"; del.title = "Delete variable";
        del.addEventListener("click", function () { self.course.variables.splice(i, 1); self.save(); rebuild(); });
        row.appendChild(del);
        wrap.appendChild(row);
      });
      var add = document.createElement("button"); add.type = "button"; add.className = "btn"; add.textContent = "+ Add variable"; add.style.cssText = "width:100%;margin-top:8px;";
      add.addEventListener("click", function () { self.course.variables.push({ name: "var" + (self.course.variables.length + 1), type: "number", value: 0 }); self.save(); rebuild(); });
      wrap.appendChild(add);
      var note = document.createElement("p"); note.className = "insp__hint"; note.style.marginTop = "8px";
      note.textContent = "Show a variable in text as {name}. Change it with a “Set variable” interaction; branch with “only if” on any interaction.";
      wrap.appendChild(note);
    }
    rebuild();
    this.openModal("Variables", wrap);
  };

  // --- Door 2: conversational course generation -----------------------------
  // Turn a content SPEC (from MosaicAI.generateSpec) into a real, editable
  // Mosaic course. The LLM supplies content; this lays it out.
  Editor.prototype.buildCourseFromSpec = function (spec) {
    spec = spec || {};
    var brand = (this.course && this.course.brand) || {};
    var ink = brand.ink || "#1c2430", body = brand.body || "#5b6675";
    var accent = brand.accent || "#3b6ef5";
    var bg = brand.bg || "#ffffff";
    // Surface fills that read on the brand background (dark packs included).
    var S = (global.MosaicPresets && global.MosaicPresets.surfaces)
      ? global.MosaicPresets.surfaces(brand)
      : { head: "#eef1f7", panel: "#f6f8fc", hint: "#9aa3b2" };
    var slides = [], vars = [];
    function slide(name, els) { return Model.makeSlide({ name: name, background: bg, elements: els }); }

    var ts = (spec.slides || []).filter(function (s) { return s.type === "title"; })[0];
    if (ts) {
      slides.push(slide("Title", [
        Model.makeElement("text", { text: ts.heading || spec.title || "Untitled", role: "heading1", x: 80, y: 190, w: 800, h: 90, fontSize: 44, bold: true, align: "center", color: ink }),
        Model.makeElement("text", { text: ts.subtitle || "", x: 80, y: 300, w: 800, h: 50, fontSize: 20, align: "center", color: body })
      ]));
    }
    // --- Content-slide layouts (Level B): the LLM picks a "layout" per slide from a
    // curated set; Mosaic owns the coordinates/styling so it always looks designed.
    // Unknown/missing layout, or one missing its required data, falls back to standard.
    function T(o) { return Model.makeElement("text", o); }
    function bulletsText(arr, mark) { return (arr || []).map(function (b) { return (mark || "•") + "  " + b; }).join("\n"); }
    function heading(s) { return T({ text: s.heading || "", role: "heading1", x: 60, y: 50, w: 840, h: 60, fontSize: 32, bold: true, color: ink }); }
    function contentElements(s) {
      var lay = s.layout || "standard";
      var hasBody = !!(s.body && String(s.body).trim());
      var hasBul = !!(s.bullets && s.bullets.length);
      // Graceful fallbacks when a layout's required data is absent.
      if (lay === "big-stat" && !(s.stat && s.stat.value != null && s.stat.value !== "")) lay = hasBul ? "checklist" : "standard";
      if (lay === "two-column" && !(hasBody && hasBul)) lay = "standard";
      if ((lay === "big-quote") && !hasBody) lay = "standard";
      // Dense content doesn't fit a cramped half-width column — give it the full
      // width instead of clipping. (Measures the actual bullet/body text.)
      var textLen = (hasBul ? s.bullets.join(" ").length : 0) + (hasBody ? String(s.body).length : 0);
      if ((lay === "image-left" || lay === "image-right" || lay === "two-column") &&
          ((hasBul && s.bullets.length > 3) || textLen > 220)) lay = "standard";
      var e = [];

      if (lay === "big-quote") {
        e.push(T({ text: (s.heading || "").toUpperCase(), x: 120, y: 74, w: 720, h: 28, fontSize: 15, bold: true, align: "center", color: accent }));
        e.push(T({ text: s.body, x: 110, y: 150, w: 740, h: 240, fontSize: 34, align: "center", color: ink, lineHeight: 1.35 }));
        if (hasBul) e.push(T({ text: bulletsText(s.bullets), x: 180, y: 408, w: 600, h: 90, fontSize: 17, align: "center", color: body, lineHeight: 1.5 }));
        return e;
      }
      if (lay === "big-stat") {
        e.push(T({ text: (s.heading || "").toUpperCase(), x: 60, y: 66, w: 840, h: 26, fontSize: 15, bold: true, align: "center", color: body }));
        e.push(T({ text: String(s.stat.value), x: 60, y: 118, w: 840, h: 128, fontSize: 96, bold: true, align: "center", color: accent }));
        if (s.stat.caption) e.push(T({ text: s.stat.caption, x: 120, y: 268, w: 720, h: 44, fontSize: 24, align: "center", color: ink }));
        if (hasBody) e.push(T({ text: s.body, x: 180, y: 340, w: 600, h: 120, fontSize: 18, align: "center", color: body, lineHeight: 1.5 }));
        return e;
      }
      if (lay === "checklist") {
        e.push(heading(s));
        var cy = 128;
        if (hasBody) { e.push(T({ text: s.body, x: 60, y: cy, w: 840, h: 52, fontSize: 19, color: body })); cy += 64; }
        var rows = hasBul ? s.bullets.length : 1;
        var cardH = Math.min(370, 44 + rows * 46);
        e.push(Model.makeElement("rect", { x: 60, y: cy, w: 840, h: cardH, fill: S.panel, radius: 16 }));
        if (hasBul) e.push(T({ text: bulletsText(s.bullets, "✓"), x: 96, y: cy + 22, w: 768, h: cardH - 40, fontSize: 20, lineHeight: 1.8, color: ink }));
        return e;
      }
      if (lay === "image-left" || lay === "image-right") {
        e.push(heading(s));
        var imgLeft = lay === "image-left";
        var imgX = imgLeft ? 60 : 520, colX = imgLeft ? 500 : 60;
        e.push(Model.makeElement("rect", { x: imgX, y: 140, w: 380, h: 300, fill: S.head, radius: 16 }));
        e.push(T({ text: "Replace with an image", x: imgX, y: 276, w: 380, h: 30, fontSize: 15, align: "center", color: S.hint }));
        var cy2 = 150;
        if (hasBody) { e.push(T({ text: s.body, x: colX, y: cy2, w: 400, h: 150, fontSize: 18, color: body, lineHeight: 1.5 })); cy2 += 150; }
        if (hasBul) e.push(T({ text: bulletsText(s.bullets), x: colX, y: cy2, w: 400, h: 280, fontSize: 17, lineHeight: 1.55, color: ink }));
        return e;
      }
      if (lay === "two-column") {
        e.push(heading(s));
        e.push(T({ text: s.body, x: 60, y: 140, w: 400, h: 320, fontSize: 19, color: body, lineHeight: 1.5 }));
        e.push(T({ text: bulletsText(s.bullets), x: 520, y: 140, w: 380, h: 320, fontSize: 19, lineHeight: 1.7, color: ink }));
        return e;
      }
      // standard (default)
      e.push(heading(s));
      var y = 132;
      if (hasBody) { e.push(T({ text: s.body, x: 60, y: y, w: 840, h: 110, fontSize: 20, color: body })); y += 120; }
      if (hasBul) e.push(T({ text: bulletsText(s.bullets), x: 60, y: y, w: 840, h: 220, fontSize: 20, lineHeight: 1.5, color: ink }));
      return e;
    }
    (spec.slides || []).filter(function (s) { return s.type === "content"; }).forEach(function (s, i) {
      var nm = (s.heading || "").trim();
      if (nm.length > 32) nm = nm.slice(0, 31).trim() + "…";
      slides.push(slide(nm || ("Slide " + (i + 2)), contentElements(s)));
    });
    (spec.quiz || []).forEach(function (q, i) {
      var o = { kind: q.kind || "single", prompt: q.prompt || "Question?", x: 120, y: 92, w: 720, h: 340 };
      if (o.kind === "multiple") { o.choices = q.choices || ["A", "B"]; o.answerIndices = Array.isArray(q.answer) ? q.answer : [q.answer || 0]; }
      else if (o.kind === "truefalse") { o.answerIndex = (typeof q.answer === "number") ? q.answer : 0; }
      else { o.choices = q.choices || ["A", "B"]; o.answerIndex = (typeof q.answer === "number") ? q.answer : 0; }
      slides.push(slide("Quiz " + (i + 1), [
        Model.makeElement("text", { text: "Knowledge check", role: "heading2", x: 60, y: 36, w: 840, h: 40, fontSize: 22, bold: true, color: ink }),
        Model.makeElement("question", o)
      ]));
    });
    var p = spec.practice;
    if (p) {
      vars.push({ name: "passed", type: "boolean", value: false });
      var rp = Model.makeElement("roleplay", { x: 60, y: 150, w: 560, h: 330, passVar: "passed", title: p.title || "Practice",
        persona: p.persona || "", scenario: p.scenario || "", objective: p.objective || "", rubric: p.rubric || "", opening: p.opening || "" });
      var okR = Model.makeElement("rect", { x: 648, y: 150, w: 252, h: 150, fill: "#e7f7ee", radius: 14 }); okR.hidden = true;
      var okT = Model.makeElement("text", { text: "✓ Nicely done — you applied it well.", x: 668, y: 170, w: 212, h: 120, fontSize: 16, bold: true, color: "#177245" }); okT.hidden = true;
      var noR = Model.makeElement("rect", { x: 648, y: 150, w: 252, h: 150, fill: "#fde8e6", radius: 14 }); noR.hidden = true;
      var noT = Model.makeElement("text", { text: "Not quite — review the key ideas and try again.", x: 668, y: 170, w: 212, h: 120, fontSize: 16, bold: true, color: "#a23a2e" }); noT.hidden = true;
      rp.triggers = [
        { event: "complete", action: "show", target: okR.id, cond: { varName: "passed", op: "=", value: "true" } },
        { event: "complete", action: "show", target: okT.id, cond: { varName: "passed", op: "=", value: "true" } },
        { event: "complete", action: "show", target: noR.id, cond: { varName: "passed", op: "=", value: "false" } },
        { event: "complete", action: "show", target: noT.id, cond: { varName: "passed", op: "=", value: "false" } }
      ];
      slides.push(slide("Practice", [
        Model.makeElement("text", { text: "Now you try", role: "heading1", x: 60, y: 50, w: 840, h: 60, fontSize: 30, bold: true, color: ink }),
        rp, okR, okT, noR, noT
      ]));
    }
    if (!slides.length) slides.push(slide("Slide 1", []));
    var course = Model.makeCourse({ title: spec.title || "Generated course", slides: slides });
    course.variables = vars;
    // Carry the active brand kit into the generated course (style packs flow
    // through generation; without this the new course reverts to defaults).
    if (this.course && this.course.brand) course.brand = this.course.brand;
    return course;
  };

  Editor.prototype.generateCourse = function (opts, onDone, onErr) {
    var self = this;
    if (typeof opts === "string") opts = { description: opts };
    if (!global.MosaicAI) { if (onErr) onErr(new Error("AI layer not loaded")); return; }
    global.MosaicAI.generateSpec({ description: opts.description, source: opts.source }).then(function (spec) {
      var course = self.buildCourseFromSpec(spec);
      self.loadCourse(course);
      if (onDone) onDone(course);
    }).catch(function (e) { if (onErr) onErr(e); else global.alert("Couldn’t generate: " + e.message); });
  };

  Editor.prototype.openGenerate = function () {
    var self = this;
    var wrap = document.createElement("div"); wrap.style.cssText = "width:460px;max-width:88vw;";
    var note = document.createElement("p"); note.className = "insp__hint";
    if (global.MosaicAI && global.MosaicAI.usingMock()) {
      note.textContent = "Demo mode (no API key) — drafts a templated practice course offline. ";
      var addKey = document.createElement("a");
      addKey.href = "#"; addKey.textContent = "Add a key for full Claude generation…";
      addKey.addEventListener("click", function (e) { e.preventDefault(); self.openAISettings(); });
      note.appendChild(addKey);
    } else {
      note.textContent = "Live Claude — describe your course and it drafts the slides, a quiz, and a Practice scenario. Then refine it on the canvas.";
    }
    wrap.appendChild(note);
    var ta = document.createElement("textarea"); ta.rows = 4; ta.style.cssText = "width:100%;font:inherit;resize:vertical;";
    ta.placeholder = "e.g. A short course teaching new managers how to give constructive feedback, with a practice conversation.";
    wrap.appendChild(ta);

    // Doc-input: optional source material (.txt/.md; +.pdf via the native picker).
    this._genSource = null;
    var srcRow = document.createElement("div");
    srcRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-top:8px;";
    var srcBtn = document.createElement("button"); srcBtn.type = "button"; srcBtn.className = "btn";
    srcBtn.textContent = "Add source document…";
    var srcLabel = document.createElement("span"); srcLabel.className = "insp__hint";
    srcLabel.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;";
    srcLabel.textContent = "Optional — the course is designed from it.";
    var srcClear = document.createElement("button"); srcClear.type = "button"; srcClear.className = "btn";
    srcClear.textContent = "×"; srcClear.title = "Remove source"; srcClear.style.display = "none";
    srcRow.appendChild(srcBtn); srcRow.appendChild(srcLabel); srcRow.appendChild(srcClear);
    wrap.appendChild(srcRow);
    this._genSourceLabel = function (src) {
      srcLabel.textContent = src
        ? src.name + " (" + (src.text.length < 1000 ? src.text.length + " chars" : Math.round(src.text.length / 1000) + "k chars") + ")"
        : "Optional — the course is designed from it.";
      srcClear.style.display = src ? "" : "none";
    };
    srcClear.addEventListener("click", function () { self._genSource = null; self._genSourceLabel(null); });
    srcBtn.addEventListener("click", function () {
      if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic) {
        global.webkit.messageHandlers.mosaic.postMessage({ type: "pickSource" }); // native: txt/md/pdf via NSOpenPanel + PDFKit
        return;
      }
      var inp = document.createElement("input"); inp.type = "file";
      inp.accept = ".txt,.md,.markdown,text/plain,text/markdown";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var r = new FileReader();
        r.onload = function () { self.receiveSource(f.name, String(r.result || "")); };
        r.readAsText(f);
      });
      inp.click();
    });

    var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn btn--primary"; btn.textContent = "Generate course"; btn.style.cssText = "width:100%;margin-top:10px;";
    wrap.appendChild(btn);
    var status = document.createElement("p"); status.className = "insp__hint"; status.style.marginTop = "6px"; wrap.appendChild(status);
    var modal = this.openModal("Describe a course", wrap);
    btn.addEventListener("click", function () {
      var d = (ta.value || "").trim();
      if (!d && !self._genSource) { ta.focus(); return; } // need a description OR a document
      btn.disabled = true; btn.textContent = "Generating…"; status.textContent = "Drafting your course…";
      self.generateCourse({ description: d, source: self._genSource }, function () { modal.close(); }, function (e) {
        btn.disabled = false; btn.textContent = "Generate course"; status.textContent = "Couldn’t generate: " + e.message;
      });
    });
    setTimeout(function () { ta.focus(); }, 30);
  };

  // Native (or web FileReader) hands the picked source doc back here.
  Editor.prototype.receiveSource = function (name, text) {
    this._genSource = { name: name, text: text };
    if (this._genSourceLabel) this._genSourceLabel(this._genSource);
  };

  // App Settings (⌘,): app-level preferences, tabbed. COURSE-level settings
  // (title/language/passing score/brand) stay in Course Settings — they travel
  // with the .mosaic file; these don't.
  //   General — theme, welcome-at-launch
  //   AI      — bring-your-own Anthropic key (prototype BYOK: localStorage only,
  //             never written into .mosaic files or exports; production = proxy)
  Editor.prototype.openSettings = function (tab) {
    var self = this;
    var wrap = document.createElement("div"); wrap.style.cssText = "width:480px;max-width:88vw;";

    // --- tab strip ---
    var strip = document.createElement("div");
    strip.style.cssText = "display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid rgba(128,134,148,.25);padding-bottom:8px;";
    var panes = {}, tabs = {};
    function switchTo(id) {
      Object.keys(panes).forEach(function (k) {
        panes[k].style.display = (k === id) ? "" : "none";
        tabs[k].className = (k === id) ? "btn btn--primary" : "btn";
      });
    }
    [["general", "General"], ["ai", "AI"]].forEach(function (t) {
      var b = document.createElement("button"); b.type = "button"; b.className = "btn"; b.textContent = t[1];
      b.addEventListener("click", function () { switchTo(t[0]); });
      strip.appendChild(b); tabs[t[0]] = b;
      var pane = document.createElement("div"); pane.style.display = "none";
      panes[t[0]] = pane;
    });
    wrap.appendChild(strip);

    // --- General pane ---
    (function (pane) {
      function prefRow(labelText, control) {
        var row = document.createElement("label");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0;";
        var s = document.createElement("span"); s.textContent = labelText;
        row.appendChild(s); row.appendChild(control); return row;
      }
      var themeSel = document.createElement("select");
      [["dark", "Dark"], ["light", "Light"]].forEach(function (o) {
        var opt = document.createElement("option"); opt.value = o[0]; opt.textContent = o[1]; themeSel.appendChild(opt);
      });
      try { themeSel.value = (localStorage.getItem("mosaic.theme") === "light") ? "light" : "dark"; } catch (e) { themeSel.value = "dark"; }
      themeSel.addEventListener("change", function () {
        var wantLight = themeSel.value === "light";
        var isLight = document.documentElement.getAttribute("data-theme") !== "dark";
        if (wantLight !== isLight) { var t = document.getElementById("canvas-toggle"); if (t) t.click(); }
      });
      pane.appendChild(prefRow("Appearance", themeSel));

      var wc = document.createElement("input"); wc.type = "checkbox";
      try { wc.checked = localStorage.getItem("mosaic.showWelcome") !== "0"; } catch (e) { wc.checked = true; }
      wc.addEventListener("change", function () { try { localStorage.setItem("mosaic.showWelcome", wc.checked ? "1" : "0"); } catch (e) {} });
      pane.appendChild(prefRow("Show welcome screen at launch", wc));

      var hint = document.createElement("p"); hint.className = "insp__hint";
      hint.textContent = "Course-specific settings (title, language, passing score, brand) live in Course ▸ Course Settings and travel with the .mosaic file.";
      pane.appendChild(hint);
    })(panes.general);

    // --- AI pane ---
    (function (pane) {
      var status = document.createElement("p"); status.className = "insp__hint"; status.style.marginTop = "0";
      function keySet() { try { return !!(localStorage.getItem("mosaic.aiKey") || "").trim(); } catch (e) { return false; } }
      function refresh() {
        status.textContent = keySet()
          ? "✓ Key saved — the wand and Practice Mode run live Claude (" + (global.MosaicAI ? global.MosaicAI.MODEL : "") + ")."
          : "No key — AI features run the built-in offline demo.";
      }
      refresh();
      pane.appendChild(status);

      var inp = document.createElement("input");
      inp.type = "password"; inp.autocomplete = "off"; inp.spellcheck = false;
      inp.placeholder = keySet() ? "•••••••• (a key is saved — paste to replace)" : "sk-ant-…";
      inp.style.cssText = "width:100%;font:inherit;padding:7px 10px;";
      pane.appendChild(inp);

      var row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;margin-top:10px;";
      var save = document.createElement("button"); save.type = "button"; save.className = "btn btn--primary"; save.textContent = "Save & test";
      var clear = document.createElement("button"); clear.type = "button"; clear.className = "btn"; clear.textContent = "Remove key";
      row.appendChild(save); row.appendChild(clear); pane.appendChild(row);

      var result = document.createElement("p"); result.className = "insp__hint"; result.style.marginTop = "8px";
      pane.appendChild(result);

      var note = document.createElement("p"); note.className = "insp__hint";
      note.textContent = "Your key is stored only on this Mac (localStorage) and is never included in saved courses or exports. Get one at console.anthropic.com.";
      pane.appendChild(note);

      save.addEventListener("click", function () {
        var v = (inp.value || "").trim();
        if (!v) { inp.focus(); return; }
        save.disabled = true; save.textContent = "Testing…"; result.textContent = "Checking the key with a 1-token request…";
        global.MosaicAI.verifyKey(v).then(function (res) {
          save.disabled = false; save.textContent = "Save & test";
          if (res.ok) {
            try { localStorage.setItem("mosaic.aiKey", v); } catch (e) {}
            inp.value = ""; inp.placeholder = "•••••••• (a key is saved — paste to replace)";
            result.textContent = "✓ Key works — saved. AI features are live.";
            refresh();
          } else {
            result.textContent = "✗ " + (res.message || "Key check failed.");
          }
        }).catch(function (e) {
          save.disabled = false; save.textContent = "Save & test";
          result.textContent = "✗ Couldn’t reach Anthropic: " + e.message;
        });
      });
      clear.addEventListener("click", function () {
        try { localStorage.removeItem("mosaic.aiKey"); } catch (e) {}
        inp.value = ""; inp.placeholder = "sk-ant-…";
        result.textContent = "Key removed — back to the offline demo.";
        refresh();
      });
    })(panes.ai);

    Object.keys(panes).forEach(function (k) { wrap.appendChild(panes[k]); });
    switchTo(tab === "ai" ? "ai" : "general");
    this.openModal("Settings", wrap);
    if (tab === "ai") setTimeout(function () { var i = panes.ai.querySelector("input"); if (i) i.focus(); }, 30);
  };

  // Back-compat entry point (generate-modal link, old menu wiring).
  Editor.prototype.openAISettings = function () { this.openSettings("ai"); };

  Editor.prototype.openModal = function (title, content) {
    var back = document.createElement("div"); back.className = "modal__backdrop";
    var panel = document.createElement("div"); panel.className = "modal";
    var head = document.createElement("div"); head.className = "modal__head"; head.textContent = title;
    var close = document.createElement("button"); close.className = "modal__close"; close.type = "button"; close.textContent = "×";
    // On the splash the window is drag-to-move (mouseDownCanMoveWindow), which
    // steals drag-to-SELECT inside a modal's text fields. Pause window-drag
    // while a modal is open, restore it on close.
    function bgDrag(type) { try { if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic) global.webkit.messageHandlers.mosaic.postMessage({ type: type }); } catch (e) {} }
    function shut() { back.remove(); document.removeEventListener("keydown", esc); bgDrag("modalClose"); }
    function esc(e) { if (e.key === "Escape") shut(); }
    close.addEventListener("click", shut);
    head.appendChild(close); panel.appendChild(head);
    // Scrollable, padded body so content never touches the edges and tall
    // content (or a dragged-taller textarea) scrolls instead of being clipped.
    var body = document.createElement("div"); body.className = "modal__body";
    body.appendChild(content);
    panel.appendChild(body);
    back.appendChild(panel);
    back.addEventListener("pointerdown", function (e) { if (e.target === back) shut(); });
    document.addEventListener("keydown", esc);
    document.body.appendChild(back);
    bgDrag("modalOpen"); // pause window-drag so text-selection works in the modal
    return { close: shut };
  };

  // Course-level settings, discoverable from the toolbar gear + the menu bar
  // (so Language/RTL/passing score/gating aren't hidden in the empty inspector).
  Editor.prototype.openCourseSettings = function () {
    var self = this, c = this.course;
    var wrap = document.createElement("div"); wrap.className = "settings";
    function field(labelText, control, inline) {
      var f = document.createElement("label"); f.className = "insp__field" + (inline ? " insp__field--inline" : "");
      var s = document.createElement("span"); s.className = "insp__label"; s.textContent = labelText;
      f.appendChild(s); f.appendChild(control); wrap.appendChild(f); return control;
    }
    var title = document.createElement("input"); title.type = "text"; title.value = c.title || "";
    title.addEventListener("input", function () { c.title = this.value; if (self.refs.title) self.refs.title.value = this.value; self.save(); });
    field("Course title", title);

    var lang = document.createElement("select");
    LANGUAGES.forEach(function (o) { var op = document.createElement("option"); op.value = o[0]; op.textContent = o[1]; if ((c.lang || "en") === o[0]) op.selected = true; lang.appendChild(op); });
    lang.addEventListener("change", function () { c.lang = this.value; self.save(); self.renderStage(); });
    field("Language (RTL flips the canvas)", lang);

    var pass = document.createElement("input"); pass.type = "number"; pass.min = "0"; pass.max = "100"; pass.value = c.passingScore != null ? c.passingScore : 70;
    pass.addEventListener("change", function () { c.passingScore = Math.max(0, Math.min(100, parseInt(this.value, 10) || 0)); self.save(); });
    field("Passing score (%)", pass);

    var req = document.createElement("input"); req.type = "checkbox"; req.checked = !!c.requireAnswers;
    req.addEventListener("change", function () { c.requireAnswers = this.checked; self.save(); });
    field("Require answering questions before advancing", req, true);

    var note = document.createElement("p"); note.className = "insp__hint";
    note.textContent = "These apply to the whole course (and the published output).";
    wrap.appendChild(note);

    this.openModal("Course settings", wrap);
  };

  // --- Recents (localStorage snapshots, so they reopen without file paths) ---
  Editor.prototype.getRecents = function () {
    try { return JSON.parse(global.localStorage.getItem("mosaic.recents") || "[]") || []; } catch (e) { return []; }
  };
  Editor.prototype.pushRecent = function () {
    var now = (global.Date && Date.now) ? Date.now() : 0;
    if (this._lastRecent && now - this._lastRecent < 4000) return; // throttle (called on every save)
    this._lastRecent = now;
    try {
      var list = this.getRecents().filter(function (r) { return r.id !== this.course.id; }, this);
      list.unshift({ id: this.course.id, title: this.course.title || "Untitled", slides: this.course.slides.length, updatedAt: now, json: this._lean(Model.serialize(this.course)) });
      while (list.length > 6) list.pop();
      while (list.length) { try { global.localStorage.setItem("mosaic.recents", JSON.stringify(list)); break; } catch (e) { list.pop(); } } // prune on quota
    } catch (e) {}
  };

  // Open a .mosaic file via a file input (the native shell answers this with its
  // own open panel; a browser uses the OS picker). Reused by the welcome screen.
  Editor.prototype.importFromFile = function () {
    var self = this;
    // In the native app, use the real NSOpenPanel — a web <input type=file> is
    // unreliable inside WKWebView (it can open a blank editor without loading the
    // picked file). Native reads the file and calls back via MosaicNative.loadCourseB64.
    if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic) {
      try { global.webkit.messageHandlers.mosaic.postMessage({ type: "openDocument" }); return; } catch (e) {}
    }
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".mosaic,.json,application/json";
    input.addEventListener("change", function () {
      var f = input.files && input.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { try { self.loadCourse(rd.result); } catch (e) { global.alert("Couldn’t open: " + e.message); } };
      rd.readAsText(f);
    });
    input.click();
  };

  // Welcome / start screen (logo + actions + recent courses + show-on-launch).
  // Icon library: a grid of recolorable content icons. With no arg, inserts a new
  // icon element; pass an existing icon element to swap its glyph.
  Editor.prototype.openIconPicker = function (existing) {
    var self = this;
    var wrap = document.createElement("div"); wrap.className = "iconpick";
    var search = document.createElement("input");
    search.type = "search"; search.placeholder = "Search icons… (e.g. alert, chart, user)";
    search.style.cssText = "width:100%;margin-bottom:10px;font:inherit;padding:6px 10px;";
    wrap.appendChild(search);
    var grid = document.createElement("div"); grid.className = "iconpick__grid";
    grid.style.cssText = "max-height:340px;overflow-y:auto;";
    var names = (window.MosaicIcons && MosaicIcons.contentNames) ? MosaicIcons.contentNames() : [];
    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      Array.prototype.forEach.call(grid.children, function (btn) {
        btn.style.display = (!q || btn.title.indexOf(q) >= 0) ? "" : "none";
      });
    });
    names.forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "iconpick__item"; b.title = name;
      b.innerHTML = MosaicIcons.content(name, 26, "currentColor");
      b.addEventListener("click", function () {
        if (existing) { existing.icon = name; self.save(); self.renderStage(); self.renderInspector(); }
        else {
          var brand = self.course.brand || {};
          var el = Model.makeElement("icon", { icon: name, color: brand.accent || "#3b6ef5" });
          self.slide().elements.push(el); self.save(); self.renderStage();
          if (self.timeline) self.timeline.render();
          self.select(el.id);
        }
        modal.close();
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);
    var modal = this.openModal("Icons", wrap);
    setTimeout(function () { search.focus(); }, 30);
  };

  // Narration studio: type a script, pick a built-in macOS voice, and generate
  // an audio clip that drops onto the slide's timeline. Native-only (uses the
  // system speech synthesizer through the shell).
  Editor.prototype.openNarrationStudio = function () {
    var self = this;
    var native = window.MosaicNative && window.MosaicNative.isNative && window.MosaicNative.isNative();
    var wrap = document.createElement("div"); wrap.className = "narrate";

    var ta = document.createElement("textarea");
    ta.className = "narrate__script"; ta.rows = 6;
    ta.placeholder = "Type the narration for this slide…";
    ta.style.cssText = "width:100%;box-sizing:border-box;resize:vertical;font:inherit;padding:8px;border-radius:8px;border:1px solid var(--line-strong);background:var(--field);color:var(--ink);";

    var voiceLabel = document.createElement("div"); voiceLabel.className = "insp__label"; voiceLabel.textContent = "Voice"; voiceLabel.style.margin = "10px 0 4px";
    var genderSel = document.createElement("select"); genderSel.style.cssText = "width:100%;margin-bottom:6px;";
    [["all", "All voices"], ["Female", "Female voices"], ["Male", "Male voices"]].forEach(function (g) {
      var o = document.createElement("option"); o.value = g[0]; o.textContent = g[1]; genderSel.appendChild(o);
    });
    var allVoices = [];
    var voiceSel = document.createElement("select"); voiceSel.style.cssText = "width:100%;";

    var row = document.createElement("div"); row.style.cssText = "display:flex;gap:8px;align-items:center;margin-top:12px;";
    var gen = document.createElement("button"); gen.type = "button"; gen.className = "btn btn--primary"; gen.textContent = "Generate narration";
    var hint = document.createElement("span"); hint.className = "insp__hint"; hint.style.flex = "1";
    row.appendChild(gen); row.appendChild(hint);

    wrap.appendChild(ta); wrap.appendChild(voiceLabel); wrap.appendChild(genderSel); wrap.appendChild(voiceSel); wrap.appendChild(row);

    function label(v) { return v.name + (v.gender ? " · " + v.gender : "") + " · " + v.lang; }
    function renderVoiceOptions() {
      var g = genderSel.value, keep = voiceSel.value;
      voiceSel.innerHTML = "";
      allVoices.filter(function (v) { return g === "all" || v.gender === g; }).forEach(function (v) {
        var o = document.createElement("option"); o.value = v.id; o.textContent = label(v); voiceSel.appendChild(o);
      });
      // Keep the current pick if still shown, else prefer an English voice.
      if (keep && voiceSel.querySelector('option[value="' + keep + '"]')) { voiceSel.value = keep; }
      else {
        var en = allVoices.filter(function (v) { return (g === "all" || v.gender === g) && /en[-_]/i.test(v.lang || ""); })[0];
        if (en) voiceSel.value = en.id;
      }
    }
    function fillVoices(list) { allVoices = list || []; renderVoiceOptions(); }
    genderSel.addEventListener("change", renderVoiceOptions);

    if (!native) {
      gen.disabled = true;
      hint.textContent = "Narration uses built-in macOS voices — available in the Mosaic app.";
    } else {
      window.MosaicNative._voicesCb = fillVoices;
      if (window.MosaicNative._voices && window.MosaicNative._voices.length) fillVoices(window.MosaicNative._voices);
      else { hint.textContent = "Loading voices…"; }
      window.MosaicNative.requestVoices();
    }

    var modal = this.openModal("Narration from script", wrap);

    gen.addEventListener("click", function () {
      var text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      gen.disabled = true; gen.textContent = "Generating…"; hint.textContent = "";
      // Safety: if nothing comes back, re-enable so the user can retry.
      var timer = setTimeout(function () { gen.disabled = false; gen.textContent = "Generate narration"; hint.textContent = "That took too long — try again or a shorter script."; }, 20000);
      window.MosaicNative._narrationCb = function () { clearTimeout(timer); modal.close(); };
      window.MosaicNative.synthesize(text, voiceSel.value || null);
    });
  };

  // Record narration from the mic (MediaRecorder → audio element on the timeline).
  Editor.prototype.openRecorder = function () {
    var self = this;
    var wrap = document.createElement("div"); wrap.className = "recorder";
    var status = document.createElement("p"); status.className = "insp__hint";
    status.textContent = "Click Record and speak. Click Stop when you're done.";
    var row = document.createElement("div"); row.style.cssText = "display:flex;align-items:center;gap:10px;margin-top:12px;";
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "btn btn--primary"; btn.textContent = "● Record";
    var timeEl = document.createElement("span"); timeEl.textContent = "0:00"; timeEl.style.fontVariantNumeric = "tabular-nums";
    row.appendChild(btn); row.appendChild(timeEl);
    wrap.appendChild(status); wrap.appendChild(row);
    var modal = this.openModal("Record narration", wrap);

    var rec = null, chunks = [], stream = null, t0 = 0, timer = null, recording = false;
    function fmt(s) { var m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ":" + (ss < 10 ? "0" : "") + ss; }
    function stopStream() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

    btn.addEventListener("click", function () {
      if (!recording) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          status.textContent = "Recording isn't available here."; return;
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
          stream = s; chunks = [];
          rec = new MediaRecorder(s);
          rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          rec.onstop = function () {
            var blob = new Blob(chunks, { type: rec.mimeType || "audio/mp4" });
            var reader = new FileReader();
            reader.onload = function () { self.insertAudioData(reader.result, "Recorded narration", null, "rec"); modal.close(); };
            reader.readAsDataURL(blob);
            stopStream();
          };
          rec.start();
          recording = true; btn.textContent = "■ Stop"; status.textContent = "Recording… speak now.";
          t0 = Date.now(); timer = setInterval(function () { timeEl.textContent = fmt((Date.now() - t0) / 1000); }, 250);
        }).catch(function (err) {
          status.textContent = "Couldn't access the microphone: " + ((err && err.message) ? err.message : err);
        });
      } else {
        recording = false; btn.disabled = true; btn.textContent = "Saving…";
        if (timer) clearInterval(timer);
        if (rec && rec.state !== "inactive") rec.stop();
      }
    });
  };

  Editor.prototype.openWelcome = function (isLaunch) {
    var self = this;
    var existing = document.querySelector(".welcome__backdrop"); if (existing) existing.remove();
    function ic(n) { return window.MosaicIcons ? MosaicIcons.svg(n, 20) : ""; }
    var back = document.createElement("div"); back.className = "welcome__backdrop";
    // On launch it's a true start screen (opaque, hides the canvas until you pick);
    // reopened mid-edit from the Course menu it's a lighter scrim over your work.
    if (isLaunch) back.className += " welcome__backdrop--splash";
    var panel = document.createElement("div"); panel.className = "welcome";

    var left = document.createElement("div"); left.className = "welcome__left";
    var brand = document.createElement("div"); brand.className = "welcome__brand";
    brand.innerHTML =
      '<svg class="welcome__logo" viewBox="0 0 64 64" aria-hidden="true">' +
        '<defs><linearGradient id="wlg" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#7b6cff"/><stop offset="1" stop-color="#c662ff"/>' +
        '</linearGradient></defs>' +
        '<rect width="64" height="64" rx="14" fill="url(#wlg)"/>' +
        '<rect x="12.5" y="12.5" width="18" height="18" rx="4.5" fill="#fff" opacity=".96"/>' +
        '<rect x="33.5" y="12.5" width="18" height="18" rx="4.5" fill="#fff" opacity=".58"/>' +
        '<rect x="12.5" y="33.5" width="18" height="18" rx="4.5" fill="#fff" opacity=".58"/>' +
        '<rect x="33.5" y="33.5" width="18" height="18" rx="4.5" fill="#ffb056"/>' +
      '</svg>' +
      '<div><h1 class="welcome__name">Mosaic</h1><p class="welcome__ver">e-learning authoring</p></div>';
    left.appendChild(brand);
    // `defer` actions keep the splash up and dismiss themselves only on success
    // (e.g. Open: stay on the splash if the file dialog is cancelled, instead of
    // dumping the user into a blank editor).
    function action(iconName, title, sub, onClick, defer) {
      var b = document.createElement("button"); b.type = "button"; b.className = "welcome__action";
      b.innerHTML = '<span class="welcome__aicon">' + ic(iconName) + '</span><span class="welcome__atext"><b>' + title + '</b><small>' + sub + '</small></span>';
      b.addEventListener("click", function () { if (!defer) shut(); onClick(); });
      left.appendChild(b);
    }
    action("plus", "New course", "Start from a blank canvas", function () { self.newCourse(true); });
    // Open: defer — the native file panel opens over the splash; loadCourse()
    // dismisses the welcome only when a file actually loads.
    action("file", "Open a course…", "Open a .mosaic file", function () { self.importFromFile(); }, true);
    // Describe (Door 2): defer — the generate modal opens over the splash;
    // loadCourse() dismisses the welcome only when generation succeeds.
    action("wand", "Describe a course", "AI drafts it — you refine", function () { self.openGenerate(); }, true);
    action("image", "Browse templates", "Start a slide from a template", function () { self.openTemplatePicker(); });

    var right = document.createElement("div"); right.className = "welcome__right";
    var rh = document.createElement("div"); rh.className = "welcome__rhead"; rh.textContent = "Recent courses"; right.appendChild(rh);
    var recents = this.getRecents();
    if (!recents.length) { var none = document.createElement("p"); none.className = "insp__hint"; none.textContent = "No recent courses yet."; right.appendChild(none); }
    recents.forEach(function (r) {
      var item = document.createElement("button"); item.type = "button"; item.className = "welcome__recent";
      var when = relTime(r.updatedAt);
      item.innerHTML = '<b>' + escapeHtml(r.title) + '</b><small>' + r.slides + ' slide' + (r.slides === 1 ? "" : "s") + (when ? " · " + when : "") + '</small>';
      item.addEventListener("click", function () { shut(); try { self.loadCourse(self._inflate(r.json)); } catch (e) { global.alert("Couldn’t open: " + e.message); } });
      right.appendChild(item);
    });

    var foot = document.createElement("div"); foot.className = "welcome__foot";
    var ckLabel = document.createElement("label"); ckLabel.className = "welcome__check";
    var ck = document.createElement("input"); ck.type = "checkbox";
    ck.checked = (function () { try { return global.localStorage.getItem("mosaic.showWelcome") !== "0"; } catch (e) { return true; } })();
    ck.addEventListener("change", function () { try { global.localStorage.setItem("mosaic.showWelcome", this.checked ? "1" : "0"); } catch (e) {} });
    var fl = document.createElement("span"); fl.textContent = "Show this when Mosaic launches";
    ckLabel.appendChild(ck); ckLabel.appendChild(fl);
    foot.appendChild(ckLabel);
    // Native only: a one-click "Send session log" so testers can send Todd a
    // record of what they did (actions + any bugs, never course content) when done.
    if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic) {
      var slog = document.createElement("button");
      slog.type = "button"; slog.className = "welcome__sendlog";
      slog.textContent = "Send session log";
      slog.title = "Send Todd a log of what you did this session — actions and bugs only, no course content.";
      slog.addEventListener("click", function () {
        try { global.webkit.messageHandlers.mosaic.postMessage({ type: "sendSessionLog" }); } catch (e) {}
      });
      foot.appendChild(slog);
    }

    panel.appendChild(left); panel.appendChild(right);
    var wrap = document.createElement("div"); wrap.className = "welcome__wrap"; wrap.appendChild(panel); wrap.appendChild(foot);
    back.appendChild(wrap);
    function shut() {
      back.remove(); document.removeEventListener("keydown", esc);
      // Reveal the editor chrome (was hidden during the launch splash) and
      // re-fit the stage, which was sized to zero while hidden.
      if (document.body.classList.contains("is-launching")) {
        document.body.classList.remove("is-launching");
        try { self.fitStage(); } catch (e) {}
        // Tell the native shell to grow from the floating splash to the editor.
        try { window.webkit.messageHandlers.mosaic.postMessage({ type: "exitSplash" }); } catch (e) {}
      }
    }
    back._shut = shut; // let other actions (File ▸ New / Open) dismiss the welcome too
    function esc(e) { if (e.key === "Escape") shut(); }
    back.addEventListener("pointerdown", function (e) { if (e.target === back || e.target === wrap) shut(); });
    document.addEventListener("keydown", esc);
    document.body.appendChild(back);

    function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function relTime(t) { if (!t || !Date.now) return ""; var d = Date.now() - t, m = Math.round(d / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; var h = Math.round(m / 60); if (h < 24) return h + "h ago"; return Math.round(h / 24) + "d ago"; }
  };

  Editor.prototype.addSlideFromTemplate = function (id) {
    var s = global.MosaicTemplates.build(id, this.course.brand);
    this.course.slides.push(s);
    this.slideIndex = this.course.slides.length - 1;
    this.selectedId = null;
    this.save();
    this.renderAll();
  };

  // Mini schematic preview of a template (proportional boxes).
  Editor.prototype.templatePreview = function (slide) {
    var sw = this.course.stage.w, sh = this.course.stage.h;
    var prev = document.createElement("div"); prev.className = "tpl__preview";
    prev.style.background = slide.background || "#fff";
    slide.elements.forEach(function (el) {
      if (el.x == null) return;
      var box = document.createElement("div"); box.className = "tpl__box tpl__box--" + el.type;
      box.style.left = (el.x / sw * 100) + "%"; box.style.top = (el.y / sh * 100) + "%";
      box.style.width = (el.w / sw * 100) + "%"; box.style.height = (el.h / sh * 100) + "%";
      if (el.type === "text") box.style.background = el.color;
      else if (el.type === "rect") box.style.background = el.fill;
      prev.appendChild(box);
    });
    return prev;
  };

  Editor.prototype.openTemplatePicker = function () {
    var self = this;
    var grid = document.createElement("div"); grid.className = "tpl__grid";
    global.MosaicTemplates.list.forEach(function (t) {
      var card = document.createElement("button"); card.type = "button"; card.className = "tpl__card";
      var built = t.build(self.course.brand);
      card.appendChild(self.templatePreview(built));
      var name = document.createElement("span"); name.className = "tpl__name"; name.textContent = t.name;
      card.appendChild(name);
      card.addEventListener("click", function () { self.addSlideFromTemplate(t.id); modal.close(); self.focusSlideChip(self.slideIndex); });
      grid.appendChild(card);
    });
    var modal = this.openModal("New slide", grid);
  };

  // Curated style packs: one click sets the whole brand kit (colors + fonts +
  // quick-swatch palette). Templates, presets, and Door 2 all inherit it, so
  // 14 templates x 8 looks reads like a template library.
  var STYLE_PACKS = [
    { id: "mosaic",    name: "Mosaic Blue",  accent: "#3b6ef5", ink: "#1c2430", body: "#5b6675", bg: "#ffffff", headingFont: "system", bodyFont: "system" },
    { id: "clinical",  name: "Clinical",     accent: "#0e7490", ink: "#0f172a", body: "#475569", bg: "#f8fafc", headingFont: "sans",   bodyFont: "sans" },
    { id: "earth",     name: "Warm Earth",   accent: "#c2410c", ink: "#292018", body: "#6b5d4f", bg: "#faf6f0", headingFont: "serif",  bodyFont: "system" },
    { id: "forest",    name: "Forest",       accent: "#15803d", ink: "#14231a", body: "#526258", bg: "#f4f8f5", headingFont: "system", bodyFont: "system" },
    { id: "playful",   name: "Playful",      accent: "#7c3aed", ink: "#241b35", body: "#6b6280", bg: "#fffdf5", headingFont: "rounded", bodyFont: "rounded" },
    { id: "editorial", name: "Editorial",    accent: "#b91c1c", ink: "#111111", body: "#555555", bg: "#ffffff", headingFont: "serif",  bodyFont: "serif" },
    { id: "slate",     name: "Slate Dark",   accent: "#6ea8fe", ink: "#eef2f8", body: "#a7b0bd", bg: "#1b2129", headingFont: "sans",   bodyFont: "sans" },
    { id: "midnight",  name: "Midnight",     accent: "#f59e0b", ink: "#f3f4f6", body: "#b3b8c2", bg: "#111827", headingFont: "system", bodyFont: "system" }
  ];

  // Apply a style pack to the WHOLE course, live: set the brand, repaint every
  // slide background, and remap any element color still sitting on the OLD brand
  // palette to the matching new one. Colors the author picked deliberately (not
  // on the old palette) are left alone. This is what makes a pack click actually
  // re-skin the course — no "Apply" button, the click is the apply.
  Editor.prototype.applyStylePack = function (p) {
    var b = this.course.brand || (this.course.brand = {});
    var old = { accent: b.accent, ink: b.ink, body: b.body, bg: b.bg };
    function lc(c) { return c == null ? "" : String(c).toLowerCase(); }
    function remap(c) {
      var v = lc(c); if (!v) return c;
      if (old.ink && v === lc(old.ink)) return p.ink;
      if (old.body && v === lc(old.body)) return p.body;
      if (old.accent && v === lc(old.accent)) return p.accent;
      return c;
    }
    b.accent = p.accent; b.ink = p.ink; b.body = p.body; b.bg = p.bg;
    b.headingFont = p.headingFont; b.bodyFont = p.bodyFont;
    b.palette = [p.ink, p.accent, "#1f9d57", "#d69e2e", "#d23b3b", p.body, p.bg];
    b.pack = p.id;
    (this.course.slides || []).forEach(function (s) {
      // Repaint a slide's background if it's still on the default white or the
      // previous pack's bg — leave a hand-picked custom background untouched.
      if (s.background == null || lc(s.background) === "#ffffff" || (old.bg && lc(s.background) === lc(old.bg))) {
        s.background = p.bg;
      }
      (s.elements || []).forEach(function (el) {
        if (el.color) el.color = remap(el.color);
        if (el.fill) el.fill = remap(el.fill);
        if (el.stroke) el.stroke = remap(el.stroke);
      });
    });
    this.save();
    this.renderStage();
  };

  Editor.prototype.openBrandEditor = function () {
    var self = this, b = this.course.brand;
    var wrap = document.createElement("div"); wrap.className = "brand";

    // --- Style packs (inspiration row) ---
    var packLabel = document.createElement("p"); packLabel.className = "insp__hint";
    packLabel.style.margin = "0 0 6px";
    packLabel.textContent = "Styles — one click sets the whole kit:";
    wrap.appendChild(packLabel);
    var packRow = document.createElement("div");
    packRow.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;";
    var inputs = {}; // field refs so applying a pack refreshes the controls below

    STYLE_PACKS.forEach(function (p) {
      var card = document.createElement("button"); card.type = "button";
      card.title = p.name;
      card.style.cssText = "cursor:pointer;border:1px solid rgba(128,134,148,.35);border-radius:10px;padding:8px 6px 6px;background:" + p.bg + ";text-align:center;";
      var strip = document.createElement("div");
      strip.style.cssText = "display:flex;gap:3px;justify-content:center;margin-bottom:6px;";
      [p.accent, p.ink, p.body].forEach(function (c) {
        var dot = document.createElement("span");
        dot.style.cssText = "width:14px;height:14px;border-radius:50%;background:" + c + ";display:inline-block;";
        strip.appendChild(dot);
      });
      var nm = document.createElement("div");
      nm.style.cssText = "font-size:11px;color:" + p.ink + ";";
      nm.textContent = p.name;
      card.appendChild(strip); card.appendChild(nm);
      if (b.pack === p.id) card.style.outline = "2px solid " + p.accent; // show the active pack
      card.addEventListener("click", function () {
        self.applyStylePack(p); // re-skins the whole course, live
        // Refresh the color/font controls below to the pack's values.
        Object.keys(inputs).forEach(function (k) { if (inputs[k] && b[k] != null) inputs[k].value = b[k]; });
        // Selected-state feedback so it's obvious which pack is applied.
        Array.prototype.forEach.call(packRow.querySelectorAll("button"), function (btn) { btn.style.outline = ""; });
        card.style.outline = "2px solid " + p.accent;
      });
      packRow.appendChild(card);
    });
    wrap.appendChild(packRow);

    function colorField(label, key) {
      var row = document.createElement("label"); row.className = "brand__field";
      var s = document.createElement("span"); s.textContent = label;
      var c = document.createElement("input"); c.type = "color"; c.value = b[key] || "#000000";
      c.addEventListener("input", function () { b[key] = this.value; self.save(); });
      inputs[key] = c;
      row.appendChild(s); row.appendChild(c); wrap.appendChild(row);
    }
    function fontField(label, key) {
      var row = document.createElement("label"); row.className = "brand__field";
      var s = document.createElement("span"); s.textContent = label;
      var sel = document.createElement("select");
      [["system", "System"], ["sans", "Sans"], ["rounded", "Rounded"], ["serif", "Serif"], ["mono", "Mono"]].forEach(function (o) {
        var opt = document.createElement("option"); opt.value = o[0]; opt.textContent = o[1];
        if ((b[key] || "system") === o[0]) opt.selected = true; sel.appendChild(opt);
      });
      sel.addEventListener("change", function () { b[key] = this.value; self.save(); });
      inputs[key] = sel;
      row.appendChild(s); row.appendChild(sel); wrap.appendChild(row);
    }
    colorField("Accent", "accent");
    colorField("Heading color", "ink");
    colorField("Body color", "body");
    colorField("Background", "bg");
    fontField("Heading font", "headingFont");
    fontField("Body font", "bodyFont");
    var note = document.createElement("p"); note.className = "insp__hint";
    note.textContent = "Clicking a style pack re-skins the whole course. The colors/fonts below set the brand for new slides, templates, interactions, and AI generation.";
    wrap.appendChild(note);
    this.openModal("Brand kit", wrap);
  };

  global.MosaicEditor = Editor;
})(window);
