/*
 * Mosaic — the snap timeline (the signature interaction)
 *
 * A time dimension for a slide: each element has a window [start, start+duration]
 * during which it's on screen; audio drives the slide's natural length. Time
 * bars are MAGNETIC — drag or resize and their edges snap to other elements'
 * edges, to the audio, and to the slide's start/end. No manual keyframes:
 * place it on the timeline, snap it, done.
 *
 * Scope (slice 1): authoring + scrub/play preview inside the editor. Playing the
 * timeline in the published SCORM output comes next.
 */
(function (global) {
  "use strict";

  var Renderer = global.MosaicRenderer;
  var SNAP_PX = 7;       // magnetic threshold
  var LABEL_W = 120;     // lane label column width (keep in sync with CSS)
  var BASE_PXPS = 60;    // pixels per second at 100% zoom (readable baseline)

  function Timeline(editor) {
    this.editor = editor;
    this.mount = editor.refs.timeline;
    this.time = 0;
    this.playing = false;
    this.raf = 0;
    this.lastFrame = 0;
    this.audio = null;
    this.zoom = 1;
    this.collapsed = false;
    var h = parseInt((function () { try { return localStorage.getItem("mosaic.tlHeight"); } catch (e) { return null; } })(), 10);
    this.panelHeight = (h && h >= 120) ? h : 224;
    var lw = parseInt((function () { try { return localStorage.getItem("mosaic.tlLabelW"); } catch (e) { return null; } })(), 10);
    this.labelW = (lw && lw >= 90) ? lw : LABEL_W;
    this.initDropZone(); // drag image/audio files straight onto the timeline
  }

  // Drag media (image/audio) from the desktop onto the timeline to add it.
  // Handlers live on the mount itself, so they survive render()'s innerHTML reset.
  Timeline.prototype.initDropZone = function () {
    var self = this, mount = this.mount, depth = 0;
    function isFiles(e) {
      var t = e.dataTransfer && e.dataTransfer.types;
      return t && Array.prototype.indexOf.call(t, "Files") >= 0;
    }
    mount.addEventListener("dragenter", function (e) {
      if (!isFiles(e)) return;
      e.preventDefault(); depth++; mount.classList.add("is-dropping");
    });
    mount.addEventListener("dragover", function (e) {
      if (!isFiles(e)) return;
      e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    });
    mount.addEventListener("dragleave", function () {
      depth--; if (depth <= 0) { depth = 0; mount.classList.remove("is-dropping"); }
    });
    mount.addEventListener("drop", function (e) {
      e.preventDefault(); depth = 0; mount.classList.remove("is-dropping");
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) self.acceptFiles(files);
    });
  };

  // Route dropped files: images become picture elements, audio becomes narration.
  Timeline.prototype.acceptFiles = function (files) {
    var self = this;
    Array.prototype.forEach.call(files, function (f) {
      var reader = new FileReader();
      if (f.type.indexOf("image/") === 0) {
        reader.onload = function () { self.editor.insertImage(reader.result); };
        reader.readAsDataURL(f);
      } else if (f.type.indexOf("audio/") === 0) {
        reader.onload = function () { self.editor.insertAudioData(reader.result, f.name); };
        reader.readAsDataURL(f);
      }
    });
  };

  Timeline.prototype.slide = function () { return this.editor.slide(); };

  // --- time <-> pixels ------------------------------------------------------
  // 100% = a readable fixed density (BASE_PXPS). Zoom out to overview, in for detail.
  Timeline.prototype.pxPerSec = function () { return BASE_PXPS * this.zoom; };
  Timeline.prototype.trackWidth = function () { return this.slide().duration * this.pxPerSec(); };
  Timeline.prototype.setZoom = function (z) {
    this.zoom = Math.max(0.25, Math.min(8, Math.round(z * 100) / 100));
    this.applyZoom(); // relayout in place (don't rebuild — keeps the slider grabbable)
  };
  // Log mapping between slider [0..1] and zoom [0.25..8] (1.0 sits near the middle).
  Timeline.prototype.zoomToSlider = function (z) { return Math.log(z / 0.25) / Math.log(32); };
  Timeline.prototype.sliderToZoom = function (t) { return 0.25 * Math.pow(32, t); };
  Timeline.prototype.applyZoom = function () {
    var iw = this.trackWidth();
    var ri = this.mount.querySelector(".tl__rulerinner");
    if (ri) ri.style.width = iw + "px";
    Array.prototype.forEach.call(this.mount.querySelectorAll(".tl-lane__track"), function (t) { t.style.width = iw + "px"; });
    if (this.zoomLabel && document.activeElement !== this.zoomLabel) this.zoomLabel.value = Math.round(this.zoom * 100) + "%";
    this.positionPlayhead();
  };
  Timeline.prototype.toggleCollapse = function () {
    this.collapsed = !this.collapsed;
    this.render();
  };
  // Sync lane highlight with the editor selection (no full re-render).
  Timeline.prototype.highlightSelected = function () {
    var sel = this.editor.selectedIds || (this.editor.selectedId ? [this.editor.selectedId] : []);
    Array.prototype.forEach.call(this.mount.querySelectorAll(".tl-lane"), function (lane) {
      lane.classList.toggle("is-selected", sel.indexOf(lane.dataset.elId) >= 0);
    });
  };

  // Drag a lane up/down to reorder it (restack z-order). Click (no drag) = select.
  Timeline.prototype.beginLaneReorder = function (ev, elm, lane) {
    var self = this;
    ev.preventDefault();
    self.editor.select(elm.id); // select on grab
    var startY = ev.clientY, dragging = false, indicator = null;
    var lanesEl = this.mount.querySelector(".tl__lanes");
    function lanesArr() { return Array.prototype.slice.call(lanesEl.querySelectorAll(".tl-lane")); }
    function targetIndex(y) {
      var lanes = lanesArr(), idx = lanes.length;
      for (var i = 0; i < lanes.length; i++) {
        var r = lanes[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { idx = i; break; }
      }
      return idx;
    }
    function showIndicator(idx) {
      if (!indicator) { indicator = el("div", "tl__dropline"); lanesEl.appendChild(indicator); }
      var lanes = lanesArr(), base = lanesEl.getBoundingClientRect().top, top;
      if (idx >= lanes.length) top = lanes[lanes.length - 1].getBoundingClientRect().bottom;
      else top = lanes[idx].getBoundingClientRect().top;
      indicator.style.top = (top - base) + "px";
    }
    function move(e) {
      if (!dragging && Math.abs(e.clientY - startY) < 4) return;
      dragging = true;
      lane.classList.add("is-dragging");
      showIndicator(targetIndex(e.clientY));
    }
    function up(e) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      lane.classList.remove("is-dragging");
      if (indicator) indicator.remove();
      if (dragging) self.reorderElement(elm, targetIndex(e.clientY));
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  // Move an element to a new stacking position and re-render.
  // `displayedTo` is the drop position in the lane list (top→bottom); lanes are
  // shown front→back (reversed array), so convert to an array index.
  Timeline.prototype.reorderElement = function (elm, displayedTo) {
    var els = this.slide().elements, from = els.indexOf(elm), N = els.length;
    if (from < 0) return;
    var to = N - displayedTo;       // top lane = front = end of array
    els.splice(from, 1);
    if (from < to) to--;            // account for the removal shift
    to = Math.max(0, Math.min(els.length, to));
    els.splice(to, 0, elm);
    this.editor.save();
    this.editor.renderStage();      // z-order changed → restack the canvas
    this.render();                  // rebuild lanes in the new order
  };
  // Drag the top edge to resize the timeline panel (canvas shrinks/grows).
  Timeline.prototype.beginResizePanel = function (ev) {
    var self = this, startY = ev.clientY, startH = this.panelHeight;
    ev.preventDefault();
    function mv(e) {
      var h = Math.max(120, Math.min(global.innerHeight * 0.7, startH + (startY - e.clientY)));
      self.panelHeight = Math.round(h);
      self.mount.style.height = self.panelHeight + "px";
      self.editor.fitStage();
    }
    function up() {
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", up);
      try { localStorage.setItem("mosaic.tlHeight", self.panelHeight); } catch (e) {}
    }
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
  };

  // --- render ---------------------------------------------------------------
  Timeline.prototype.render = function () {
    var self = this, slide = this.slide();
    this.mount.innerHTML = "";
    this.mount.classList.toggle("tl--collapsed", this.collapsed);
    this.mount.style.height = this.collapsed ? "" : (this.panelHeight + "px");
    this.mount.style.setProperty("--label-w", this.labelW + "px");

    // Drag handle to resize the panel (canvas grows/shrinks).
    if (!this.collapsed) {
      var grip = el("div", "tl__resize");
      grip.title = "Drag to resize the timeline";
      grip.addEventListener("pointerdown", function (ev) { self.beginResizePanel(ev); });
      this.mount.appendChild(grip);
    }

    // Header: collapse, play, time, [zoom slider], fit, slide length, add audio
    var head = el("div", "tl__head");

    var collapse = el("button", "btn tl__collapse");
    collapse.type = "button";
    collapse.textContent = this.collapsed ? "▴ Timeline" : "▾ Timeline";
    collapse.title = this.collapsed ? "Expand timeline" : "Collapse timeline";
    collapse.addEventListener("click", function () { self.toggleCollapse(); });
    head.appendChild(collapse);

    var rewind = el("button", "btn tl__rewind");
    rewind.type = "button"; rewind.textContent = "⏮"; rewind.title = "Back to start";
    rewind.addEventListener("click", function () { if (self.playing) self.pause(); self.setTime(0, false); });

    var play = el("button", "btn tl__play");
    play.type = "button";
    play.textContent = this.playing ? "❚❚ Pause" : "▶ Play";
    play.title = "Play / pause (Space)";
    play.addEventListener("click", function () { self.playing ? self.pause() : self.play(); });

    var time = el("span", "tl__time");
    time.textContent = fmt(this.time) + " / " + fmt(slide.duration);

    var lenWrap = el("label", "tl__len");
    lenWrap.appendChild(text("span", "tl__lenlabel", "Length"));
    // Time-based length: type m:ss (e.g. 1:30) or plain seconds; shown as m:ss.
    var len = document.createElement("input");
    len.type = "text"; len.className = "tl__leninput"; len.value = fmt(slide.duration);
    len.title = "Slide length — minutes:seconds (e.g. 1:30)";
    len.addEventListener("change", function () {
      var dur = parseTime(this.value);
      slide.duration = Math.max(1, Math.round(dur * 10) / 10);
      self.editor.save(); self.setTime(Math.min(self.time, slide.duration)); self.render();
    });
    len.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); this.blur(); } });
    lenWrap.appendChild(len);

    var fit = el("button", "btn tl__fit");
    fit.type = "button"; fit.textContent = "⤢ Fit"; fit.title = "Fit all elements to the slide length";
    fit.addEventListener("click", function () { self.editor.fitElementsToSlide(); });

    var addAudio = el("button", "btn tl__addaudio");
    addAudio.type = "button"; addAudio.textContent = "+ Audio ▾";
    addAudio.title = "Add an audio file, record narration, or generate it from a script";
    addAudio.addEventListener("click", function () {
      self.audioMenu(addAudio, [
        { label: "🎵  Audio file…", onClick: function () { self.editor.addAudio(); } },
        { label: "🎙  Record narration…", onClick: function () { self.editor.openRecorder(); } },
        { label: "💬  Narration from script…", onClick: function () { self.editor.openNarrationStudio(); } }
      ]);
    });

    var zoom = el("div", "tl__zoom");
    zoom.appendChild(text("span", "tl__zoomicon", "🔍"));
    var slider = document.createElement("input");
    slider.type = "range"; slider.className = "tl__zoomslider";
    slider.min = "0"; slider.max = "1"; slider.step = "0.001";
    slider.value = this.zoomToSlider(this.zoom);
    slider.title = "Zoom timeline";
    slider.setAttribute("aria-label", "Zoom timeline");
    slider.addEventListener("input", function () { self.setZoom(self.sliderToZoom(parseFloat(this.value))); });
    // Editable zoom % — type a specific value (clamped to 25–800%).
    var zlbl = document.createElement("input");
    zlbl.className = "tl__zoomlbl"; zlbl.type = "text"; zlbl.value = Math.round(this.zoom * 100) + "%";
    zlbl.title = "Zoom % (type a value)"; zlbl.setAttribute("aria-label", "Zoom percent");
    zlbl.addEventListener("change", function () {
      var v = parseInt(String(this.value).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(v)) {
        self.setZoom(Math.max(25, Math.min(800, v)) / 100);
        self.zoomSlider.value = self.zoomToSlider(self.zoom);
      }
      this.value = Math.round(self.zoom * 100) + "%";
    });
    zlbl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); this.blur(); } });
    this.zoomLabel = zlbl; this.zoomSlider = slider;
    // − / + buttons flank the slider for fine-tuning (slider = fast, buttons = precise).
    function zoomStep(factor) {
      self.setZoom(self.zoom * factor);
      self.zoomSlider.value = self.zoomToSlider(self.zoom);
      self.zoomLabel.value = Math.round(self.zoom * 100) + "%";
    }
    function zoomBtn(label, factor, title) {
      var b = el("button", "tl__zoombtn"); b.type = "button"; b.textContent = label; b.title = title;
      b.addEventListener("click", function () { zoomStep(factor); });
      return b;
    }
    zoom.appendChild(zoomBtn("−", 0.8, "Zoom out"));
    zoom.appendChild(slider);
    zoom.appendChild(zoomBtn("+", 1.25, "Zoom in"));
    zoom.appendChild(zlbl);

    head.appendChild(rewind); head.appendChild(play); head.appendChild(time);
    head.appendChild(spacer()); head.appendChild(zoom); head.appendChild(fit); head.appendChild(lenWrap); head.appendChild(addAudio);
    this.mount.appendChild(head);
    this.timeReadout = time;

    if (this.collapsed) return; // header only when collapsed

    // Body: ruler + lanes + playhead
    var body = el("div", "tl__body");
    body.appendChild(this.buildRuler());

    var lanes = el("div", "tl__lanes");
    // Top lane = front (on top), bottom = back — the layers convention. Drag to restack.
    if (!slide.elements.length) {
      lanes.appendChild(text("div", "tl__empty", "Add elements or audio to build the timeline."));
    }
    slide.elements.slice().reverse().forEach(function (e) { lanes.appendChild(self.buildLane(e)); });
    body.appendChild(lanes);

    var guide = el("div", "tl__guide"); guide.style.display = "none";
    body.appendChild(guide);
    this.guide = guide;

    var ph = el("div", "tl__playhead");
    var grip = el("div", "tl__playhead__grip");   // triangle handle at the top (Storyline-style)
    grip.title = "Drag to move the playhead";
    ph.appendChild(grip);
    var phHit = el("div", "tl__playhead__hit");    // grab the playhead anywhere along its height
    ph.appendChild(phHit);
    function scrubFromPlayhead(ev) { ev.stopPropagation(); self.beginScrub(ev); }
    grip.addEventListener("pointerdown", scrubFromPlayhead);
    phHit.addEventListener("pointerdown", scrubFromPlayhead);
    body.appendChild(ph);
    this.playhead = ph;

    // Skim ghost-playhead: hover the lanes to preview that moment (iMovie skim).
    var skim = el("div", "tl__skimhead");
    skim.style.display = "none";
    skim.appendChild(text("span", "tl__skimtime", ""));
    body.appendChild(skim);
    this.skimhead = skim;
    this.body = body;

    // scrub on the ruler
    body.querySelector(".tl__ruler").addEventListener("pointerdown", function (ev) {
      self.beginScrub(ev);
    });
    this.setupSkim(lanes);

    var drop = el("div", "tl__drop");
    drop.appendChild(text("span", "tl__droplabel", "Drop an image or audio file to add it"));
    this.mount.appendChild(drop);

    this.mount.appendChild(body);
    this.positionPlayhead();
  };

  // --- skimming -------------------------------------------------------------
  // Hover the lanes to preview the slide at that time — without moving the
  // real playhead. Skips while playing or while a drag is in progress.
  Timeline.prototype.setupSkim = function (lanes) {
    var self = this;
    lanes.addEventListener("pointermove", function (e) {
      if (self.playing || e.buttons) return;          // not while playing/dragging
      var inner = self.body.querySelector(".tl__ruler .tl__rulerinner");
      if (!inner) return;
      var rect = inner.getBoundingClientRect();
      var f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      self.showSkim(f * self.slide().duration);
    });
    lanes.addEventListener("pointerleave", function () { self.hideSkim(); });
  };
  Timeline.prototype.showSkim = function (t) {
    if (!this.skimhead) return;
    var slide = this.slide();
    this.skimhead.style.display = "block";
    this.skimhead.style.left = (this.labelW + (t / slide.duration) * this.trackWidth()) + "px";
    var lbl = this.skimhead.querySelector(".tl__skimtime");
    if (lbl) lbl.textContent = fmt(t);
    this.editor.applyTimeVisibility(t);
  };
  Timeline.prototype.hideSkim = function () {
    if (this.skimhead) this.skimhead.style.display = "none";
    if (!this.playing) this.editor.applyTimeVisibility(null); // back to edit (all visible)
  };

  Timeline.prototype.buildRuler = function () {
    var self = this, slide = this.slide(), iw = this.trackWidth();
    var ruler = el("div", "tl__ruler");
    var pad = el("div", "tl__rulerpad"); // sticky left column spacer
    // Drag this divider to widen/narrow the label column (so long names fit).
    var grip = el("div", "tl__labelgrip");
    grip.title = "Drag to resize the labels";
    grip.addEventListener("pointerdown", function (ev) { self.beginLabelResize(ev); });
    pad.appendChild(grip);
    ruler.appendChild(pad);
    var inner = el("div", "tl__rulerinner");
    inner.style.width = iw + "px";
    var step = tickStep(this.pxPerSec());      // zoom-aware spacing
    var minor = step / 4;                       // 3 hash marks between labels (proper ruler look)
    for (var t = 0; t <= slide.duration + 1e-6; t += minor) {
      var isMajor = Math.abs((t / step) - Math.round(t / step)) < 1e-6;
      var tick = el("div", "tl__tick" + (isMajor ? "" : " tl__tick--minor"));
      tick.style.left = (t / slide.duration * 100) + "%";
      if (isMajor) tick.appendChild(text("span", "tl__ticklabel", fmtTick(t)));
      inner.appendChild(tick);
    }
    ruler.appendChild(inner);
    return ruler;
  };

  // Drag the label/track divider to resize the label column (live, persisted).
  Timeline.prototype.beginLabelResize = function (ev) {
    var self = this, startX = ev.clientX, startW = this.labelW;
    ev.preventDefault(); ev.stopPropagation();
    function mv(e) {
      self.labelW = Math.max(90, Math.min(320, Math.round(startW + (e.clientX - startX))));
      self.mount.style.setProperty("--label-w", self.labelW + "px");
      self.positionPlayhead();
    }
    function up() {
      document.removeEventListener("pointermove", mv);
      document.removeEventListener("pointerup", up);
      try { localStorage.setItem("mosaic.tlLabelW", self.labelW); } catch (e) {}
    }
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
  };

  // --- audio waveforms ------------------------------------------------------
  // Decode each clip once (Web Audio), cache peaks by element id, and draw them
  // as a thin waveform inside the timeline bar. Works for files, recordings, TTS.
  var WAVE_CACHE = {}, WAVE_PENDING = {}, _audioCtx = null;
  function audioCtx() {
    if (_audioCtx === null) { var AC = window.AudioContext || window.webkitAudioContext; _audioCtx = AC ? new AC() : false; }
    return _audioCtx || null;
  }
  function injectWave(bar, peaks) {
    var old = bar.querySelector(".tl-wave"); if (old) old.remove();
    var N = peaks.length, NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "tl-wave"); svg.setAttribute("viewBox", "0 0 " + N + " 100"); svg.setAttribute("preserveAspectRatio", "none");
    var d = "";
    for (var i = 0; i < N; i++) { var h = Math.max(2, peaks[i] * 92), y = (100 - h) / 2; d += "M" + i + " " + y + "V" + (y + h); }
    var path = document.createElementNS(NS, "path"); path.setAttribute("d", d); path.setAttribute("class", "tl-wave__path");
    svg.appendChild(path); bar.insertBefore(svg, bar.firstChild);
  }
  Timeline.prototype.renderWaveform = function (bar, elm) {
    var peaks = WAVE_CACHE[elm.id];
    if (peaks) { injectWave(bar, peaks); return; }
    if (WAVE_PENDING[elm.id]) return;
    var ctx = audioCtx(); if (!ctx) return;
    WAVE_PENDING[elm.id] = true;
    fetch(elm.src).then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { return ctx.decodeAudioData(buf); })
      .then(function (audio) {
        var data = audio.getChannelData(0), N = 160, block = Math.floor(data.length / N) || 1, p = [], pk = 0;
        for (var i = 0; i < N; i++) {
          var max = 0, s = i * block;
          for (var j = 0; j < block; j++) { var v = Math.abs(data[s + j] || 0); if (v > max) max = v; }
          p.push(max); if (max > pk) pk = max;
        }
        pk = pk || 1; for (var k = 0; k < p.length; k++) p[k] /= pk;
        WAVE_CACHE[elm.id] = p; WAVE_PENDING[elm.id] = false;
        var live = document.querySelector('.tl-bar[data-el-id="' + elm.id + '"]');
        if (live) injectWave(live, p);
      })
      .catch(function () { WAVE_PENDING[elm.id] = false; });
  };

  // Small popover menu anchored to a timeline button (flips up — timeline sits low).
  Timeline.prototype.audioMenu = function (anchor, items) {
    var existing = document.querySelector(".menu"); if (existing) existing.remove();
    var m = el("div", "menu"); m.setAttribute("role", "menu");
    items.forEach(function (it) {
      var b = el("button", "menu__item"); b.type = "button"; b.setAttribute("role", "menuitem");
      b.textContent = it.label;
      b.addEventListener("click", function () { close(); it.onClick(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight, pad = 8;
    var left = Math.max(pad, Math.min(r.left, window.innerWidth - mw - pad));
    var top = r.top - mh - 4; if (top < pad) top = r.bottom + 4;
    m.style.left = left + "px"; m.style.top = top + "px";
    function close() { m.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); }
    function away(e) { if (!m.contains(e.target) && e.target !== anchor) close(); }
    function esc(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", esc, true); }, 0);
  };

  Timeline.prototype.buildLane = function (elm) {
    var self = this, slide = this.slide();
    var lane = el("div", "tl-lane");
    lane.dataset.elId = elm.id;
    if (this.editor.selectedId === elm.id) lane.classList.add("is-selected");
    var label = el("div", "tl-lane__label");
    label.appendChild(text("span", "tl-lane__icon", "⠿"));            // drag affordance
    // Distinguish narration types: 💬 script (TTS), 🎙 recorded, ♪ plain audio file.
    var laneIcon = elm.narration === "tts" ? "💬" : (elm.narration ? "🎙" : iconFor(elm.type));
    label.appendChild(text("span", "tl-lane__type", laneIcon));
    var nameEl = text("span", "tl-lane__name", labelFor(elm));
    nameEl.title = "Double-click to rename";
    // Double-click to give the element a custom name (shown on its lane).
    nameEl.addEventListener("dblclick", function (ev) {
      ev.stopPropagation();
      nameEl.setAttribute("contenteditable", "true"); nameEl.classList.add("is-editing");
      nameEl.focus(); document.execCommand && document.execCommand("selectAll", false, null);
    });
    nameEl.addEventListener("pointerdown", function (ev) { if (nameEl.getAttribute("contenteditable") === "true") ev.stopPropagation(); });
    nameEl.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); nameEl.blur(); }
      else if (ev.key === "Escape") { nameEl.textContent = labelFor(elm); nameEl.blur(); }
    });
    nameEl.addEventListener("blur", function () {
      if (nameEl.getAttribute("contenteditable") !== "true") return;
      nameEl.removeAttribute("contenteditable"); nameEl.classList.remove("is-editing");
      var v = nameEl.textContent.replace(/\s+/g, " ").trim();
      if (v) elm.name = v; else delete elm.name;
      nameEl.textContent = labelFor(elm); nameEl.title = "Double-click to rename";
      self.editor.save(); self.editor.renderInspector();
    });
    label.appendChild(nameEl);
    // Delete affordance — appears on lane hover.
    var del = el("button", "tl-lane__del");
    del.type = "button";
    del.title = "Delete"; del.setAttribute("aria-label", "Delete " + labelFor(elm));
    del.innerHTML = window.MosaicIcons ? MosaicIcons.svg("trash", 14) : "×";
    del.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); }); // don't start a reorder
    del.addEventListener("click", function (ev) {
      ev.stopPropagation();
      self.editor.select(elm.id);
      self.editor.deleteSelected();
    });
    label.appendChild(del);
    // Click the label to select; drag it up/down to reorder (restack).
    label.addEventListener("pointerdown", function (ev) { self.beginLaneReorder(ev, elm, lane); });
    lane.appendChild(label);

    var track = el("div", "tl-lane__track");
    track.style.width = this.trackWidth() + "px";
    var w = Renderer.timeWindow(elm, slide.duration);
    var bar = el("div", "tl-bar tl-bar--" + elm.type);
    bar.dataset.elId = elm.id;
    function layout() {
      var ww = Renderer.timeWindow(elm, slide.duration);
      bar.style.left = (ww.start / slide.duration * 100) + "%";
      bar.style.width = ((ww.end - ww.start) / slide.duration * 100) + "%";
    }
    layout();
    if (this.editor.selectedId === elm.id) bar.classList.add("is-selected");

    var hL = el("div", "tl-bar__handle tl-bar__handle--l");
    var hR = el("div", "tl-bar__handle tl-bar__handle--r");
    var caption = text("span", "tl-bar__caption", elm.type === "audio" ? fmt(elm.duration) : "");
    bar.appendChild(hL); bar.appendChild(caption); bar.appendChild(hR);
    if (elm.type === "audio" && elm.src) this.renderWaveform(bar, elm);

    bar.addEventListener("pointerdown", function (ev) {
      if (ev.target === hL || ev.target === hR) return;
      ev.stopPropagation();
      self.editor.select(elm.id);
      self.beginBarDrag(ev, elm, track, "move", layout);
    });
    hL.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); self.editor.select(elm.id); self.beginBarDrag(ev, elm, track, "l", layout); });
    hR.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); self.editor.select(elm.id); self.beginBarDrag(ev, elm, track, "r", layout); });

    track.appendChild(bar);
    lane.appendChild(track);
    return lane;
  };

  // --- snapping -------------------------------------------------------------
  Timeline.prototype.snap = function (t, excludeId) {
    var slide = this.slide();
    var targets = [0, slide.duration, this.time]; // start, end, and the playhead
    slide.elements.forEach(function (e) {
      if (e.id === excludeId) return;
      var w = Renderer.timeWindow(e, slide.duration);
      targets.push(w.start, w.end);
    });
    var pps = this.pxPerSec(), best = null, bestPx = SNAP_PX;
    targets.forEach(function (tt) {
      var d = Math.abs((tt - t) * pps);
      if (d < bestPx) { bestPx = d; best = tt; }
    });
    return best == null ? { t: t, snapped: false } : { t: best, snapped: true };
  };

  Timeline.prototype.showGuide = function (t) {
    var slide = this.slide();
    this.guide.style.display = "block";
    this.guide.style.left = (this.labelW + (t / slide.duration) * this.trackWidth()) + "px";
  };
  Timeline.prototype.hideGuide = function () { if (this.guide) this.guide.style.display = "none"; };

  // --- bar drag / resize ----------------------------------------------------
  Timeline.prototype.beginBarDrag = function (ev, elm, track, mode, layout) {
    var self = this, slide = this.slide();
    var rect = track.getBoundingClientRect();
    var startX = ev.clientX;
    var w0 = Renderer.timeWindow(elm, slide.duration);
    var origStart = w0.start, origEnd = w0.end;
    track.setPointerCapture && track.setPointerCapture(ev.pointerId);

    function toDelta(clientX) { return (clientX - startX) / rect.width * slide.duration; }

    function move(e) {
      var d = toDelta(e.clientX);
      var ns = origStart, ne = origEnd;
      if (mode === "move") { ns = origStart + d; ne = origEnd + d; }
      else if (mode === "l") { ns = origStart + d; }
      else if (mode === "r") { ne = origEnd + d; }

      // snap the moving edge(s)
      var snapEdge = (mode === "r") ? ne : ns;
      var s = self.snap(snapEdge, elm.id);
      if (s.snapped) {
        var adj = s.t - snapEdge;
        if (mode === "move") { ns += adj; ne += adj; }
        else if (mode === "l") { ns = s.t; }
        else { ne = s.t; }
        self.showGuide(s.t);
      } else self.hideGuide();

      // Clamp. Moving PRESERVES the clip's length (slide the whole thing); only
      // the trim handles change duration. (Fixes the "scrunch when moving" bug.)
      var len = origEnd - origStart;
      if (mode === "move") {
        ns = Math.max(0, Math.min(ns, slide.duration - len));
        ne = ns + len;
      } else if (mode === "l") {
        ns = Math.max(0, Math.min(ns, origEnd - 0.2));
        ne = origEnd;
      } else { // "r"
        ne = Math.min(slide.duration, Math.max(ns + 0.2, ne));
        ns = origStart;
      }

      elm.start = round1(ns);
      elm.duration = round1(ne - ns); // trimming makes the duration explicit
      layout();
      self.editor.applyTimeVisibility(self.time); // live preview at playhead
    }
    function up(e) {
      track.releasePointerCapture && track.releasePointerCapture(ev.pointerId);
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", up);
      self.hideGuide();
      self.editor.save();
      self.editor.applyTimeVisibility(null); // back to edit (all visible)
    }
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
  };

  // --- playhead / scrub / play ---------------------------------------------
  Timeline.prototype.beginScrub = function (ev) {
    var self = this;
    var ruler = this.body.querySelector(".tl__ruler .tl__rulerinner") || this.body.querySelector(".tl__ruler");
    var rect = ruler.getBoundingClientRect();
    function at(clientX) {
      var f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return f * self.slide().duration;
    }
    function move(e) { self.setTime(at(e.clientX), true); }
    function up(e) {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      self.editor.applyTimeVisibility(null); // return to edit view
    }
    self.setTime(at(ev.clientX), true);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  Timeline.prototype.setTime = function (t, preview) {
    var slide = this.slide();
    this.time = Math.max(0, Math.min(t, slide.duration));
    this.positionPlayhead();
    if (this.timeReadout) this.timeReadout.textContent = fmt(this.time) + " / " + fmt(slide.duration);
    if (preview) this.editor.applyTimeVisibility(this.time);
  };

  Timeline.prototype.positionPlayhead = function () {
    if (!this.playhead) return;
    var slide = this.slide();
    this.playhead.style.left = (this.labelW + (this.time / slide.duration) * this.trackWidth()) + "px";
  };

  Timeline.prototype.firstAudio = function () {
    return this.slide().elements.filter(function (e) { return e.type === "audio" && e.src; })[0] || null;
  };

  Timeline.prototype.play = function () {
    if (this.playing) return;
    var self = this, slide = this.slide();
    if (this.time >= slide.duration) this.time = 0;
    this.playing = true;
    this.render();

    // Each audio clip gets its own element; it starts/seeks when the playhead
    // enters its window and pauses when it leaves. The PLAYHEAD itself runs on
    // wall-clock time, so it never freezes when a single clip ends. (Bug fix:
    // playback used to follow one clip's currentTime and stall at that clip's end.)
    this.audios = slide.elements
      .filter(function (e) { return e.type === "audio" && e.src; })
      .map(function (e) { return { el: e, node: new Audio(e.src), playing: false }; });
    this.playT0 = this.time;
    this.playStart = perfNow();

    var loop = function () {
      if (!self.playing) return;
      var t = self.playT0 + (perfNow() - self.playStart) / 1000;
      self.audios.forEach(function (a) {
        var s = a.el.start || 0, end = s + (a.el.duration || 0);
        if (t >= s && t < end) {
          if (!a.playing) { a.playing = true; try { a.node.currentTime = Math.max(0, t - s); } catch (e) {} a.node.play().catch(function () {}); }
        } else if (a.playing) { a.playing = false; a.node.pause(); }
      });
      if (t >= slide.duration) { self.setTime(slide.duration, true); self.pause(); return; }
      self.setTime(t, true);
      self.raf = global.requestAnimationFrame(loop);
    };
    this.raf = global.requestAnimationFrame(loop);
  };

  Timeline.prototype.pause = function () {
    this.playing = false;
    if (this.raf) global.cancelAnimationFrame(this.raf);
    if (this.audios) { this.audios.forEach(function (a) { a.node.pause(); }); this.audios = null; }
    this.editor.applyTimeVisibility(null); // back to edit view
    this.render();
  };

  // --- tiny DOM helpers -----------------------------------------------------
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function text(tag, cls, t) { var n = el(tag, cls); n.textContent = t; return n; }
  function spacer() { return el("div", "tl__spacer"); }
  function round1(n) { return Math.round(n * 10) / 10; }
  function perfNow() { return (global.performance && global.performance.now) ? global.performance.now() : 0; }
  function fmt(s) { s = Math.max(0, s); var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1); }
  // Parse "m:ss(.s)" or plain seconds into seconds.
  function parseTime(str) {
    str = String(str).trim();
    if (str.indexOf(":") >= 0) {
      var p = str.split(":");
      return (parseInt(p[0], 10) || 0) * 60 + (parseFloat(p[1]) || 0);
    }
    return parseFloat(str) || 0;
  }
  // Ruler tick label: whole seconds show no decimal (0:05, 1:00); else one decimal.
  function fmtTick(s) {
    s = Math.max(0, Math.round(s * 10) / 10);
    var m = Math.floor(s / 60), r = s % 60;
    var whole = Math.abs(r - Math.round(r)) < 0.05;
    if (whole && Math.round(r) === 60) { m += 1; r = 0; }
    var rs = whole ? String(Math.round(r)) : r.toFixed(1);
    return m + ":" + (parseFloat(rs) < 10 ? "0" : "") + rs;
  }
  // Zoom-aware tick spacing: aim for ~80px between labeled ticks.
  function tickStep(pxPerSec) {
    var steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    for (var i = 0; i < steps.length; i++) { if (steps[i] * pxPerSec >= 80) return steps[i]; }
    return steps[steps.length - 1];
  }
  function iconFor(type) { return { text: "T", rect: "▰", image: "🖼", question: "?", audio: "♪", icon: "★", button: "▭", result: "%" }[type] || "•"; }
  function labelFor(e) {
    if (e.name && e.type !== "audio") return e.name;       // author-given name wins
    if (e.type === "text") return e.text || "Text";        // CSS ellipsis truncates; tooltip shows full
    if (e.type === "question") return e.prompt || "Question";
    if (e.type === "audio") return e.name || "Audio";
    if (e.type === "button") return e.label || "Button";
    if (e.type === "rect") {                                // name the shape kind
      if (e.kind === "ellipse") return "Ellipse";
      if (e.kind === "line") return "Line";
      return "Rectangle";
    }
    return e.type.charAt(0).toUpperCase() + e.type.slice(1);
  }

  global.MosaicTimeline = Timeline;
})(window);
