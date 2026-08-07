/* Friction log — lightweight, privacy-respecting session instrumentation.
 *
 * Captures WHAT the user did and where they hit friction — NOT the content they
 * authored (no slide text, no typed characters, no prompts). Events buffer in
 * the browser and flush to the native shell, which appends them as JSON lines to
 *   ~/Library/Logs/Mosaic/friction.jsonl
 * so the build partner can read the real session afterward. In a plain browser
 * (no native shell) events collect on window.__friction for the console.
 *
 * Loads AFTER editor.js so it can wrap MosaicEditor.prototype, and BEFORE the
 * inline `new MosaicEditor(...)` so the instance uses the wrapped methods.
 */
(function (global) {
  "use strict";

  var SESSION = "s-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e4).toString(36);
  var startedAt = Date.now();
  var buf = [];
  var nativeShell = !!(global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic);

  function post() {
    if (!buf.length) return;
    var batch = buf.splice(0, buf.length);
    if (nativeShell) {
      try { global.webkit.messageHandlers.mosaic.postMessage({ type: "frictionLog", session: SESSION, events: batch }); } catch (e) {}
    } else {
      (global.__friction = global.__friction || []).push.apply(global.__friction, batch);
    }
  }
  var flushTimer = null;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(function () { flushTimer = null; post(); }, 900);
  }
  function log(type, data) {
    var e = { rel: Date.now() - startedAt, type: type };
    if (data) e.d = data;
    buf.push(e);
    if (buf.length >= 20) post(); else scheduleFlush();
  }
  global.MosaicLog = { log: log, flush: post, session: SESSION };

  // --- Errors (the loudest friction) ----------------------------------------
  global.addEventListener("error", function (ev) {
    if (ev && ev.target && (ev.target.src || ev.target.href)) { log("resource-error", { src: ev.target.src || ev.target.href }); return; }
    log("js-error", {
      msg: ev.message,
      at: (ev.filename || "").replace(/^.*\//, "") + ":" + (ev.lineno || ""),
      stack: ev.error && ev.error.stack ? String(ev.error.stack).slice(0, 300) : null
    });
  }, true);
  global.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason;
    log("promise-error", { reason: (r && (r.stack || r.message)) ? String(r.stack || r.message).slice(0, 300) : String(r) });
  });

  // --- Dead clicks + rage clicks --------------------------------------------
  var INTERACTIVE = "button, a, input, select, textarea, [contenteditable], [data-el-id], .m-el, .tbtn, .menu__item, [role=menuitem], [data-add], label, .welcome__recent, .rp__send, .rp__mic, .rp__finish, .rp__input, .m-handle, .fmtbar__btn, .fmtbar__sel, .fmtbar__num, .fmtbar__color";
  var recent = [];
  global.addEventListener("pointerdown", function (ev) {
    if (ev.button !== 0) return;
    var x = ev.clientX, y = ev.clientY, t = Date.now();
    recent = recent.filter(function (c) { return t - c.t < 700; });
    recent.push({ t: t, x: x, y: y });
    var near = recent.filter(function (c) { return Math.abs(c.x - x) < 36 && Math.abs(c.y - y) < 36; });
    if (near.length >= 3) { log("rage-click", { x: Math.round(x), y: Math.round(y), n: near.length }); recent = []; }
    var el = ev.target;
    var hit = el && el.closest && el.closest(INTERACTIVE);
    if (!hit) log("dead-click", { x: Math.round(x), y: Math.round(y), on: el && el.className ? String(el.className).slice(0, 40) : (el && el.tagName) });
  }, true);

  // --- Double-click that led nowhere (expected to edit, didn't) --------------
  global.addEventListener("dblclick", function (ev) {
    var el = ev.target, onEl = el && el.closest && el.closest("[data-el-id]");
    setTimeout(function () {
      var ed = global.__mosaicEditor;
      if (onEl && ed && !ed.editingTextId && !ed.editingQuestionId) {
        log("dblclick-noedit", { el: onEl.getAttribute("data-el-id") }); // couldn't enter edit
      }
    }, 180);
  }, true);

  // --- Undo streaks (something went wrong) ----------------------------------
  var undoN = 0, undoT = null;
  global.addEventListener("keydown", function (ev) {
    var k = ev.key ? ev.key.toLowerCase() : "";
    if ((ev.metaKey || ev.ctrlKey) && k === "z") {
      undoN++;
      if (undoT) clearTimeout(undoT);
      undoT = setTimeout(function () { if (undoN >= 4) log("undo-streak", { n: undoN }); undoN = 0; }, 1400);
    }
  }, true);

  // --- Semantic actions: wrap key editor methods (no content captured) -------
  function instrument(proto, specs) {
    specs.forEach(function (spec) {
      var name = spec.name, orig = proto[name];
      if (typeof orig !== "function") return;
      proto[name] = function () {
        try { log("action", { fn: name, info: spec.map ? spec.map.apply(this, arguments) : undefined }); } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
  }
  if (global.MosaicEditor && global.MosaicEditor.prototype) {
    instrument(global.MosaicEditor.prototype, [
      { name: "addElement", map: function (kind) { return { kind: kind }; } },
      { name: "addSlide" },
      { name: "applyStylePack", map: function (p) { return { pack: p && p.id }; } },
      { name: "beginTextEdit", map: function (n, el) { return { edit: "text", id: el && el.id }; } },
      { name: "beginQuestionEdit", map: function (n, el) { return { edit: "question", id: el && el.id }; } },
      { name: "beginButtonEdit", map: function (n, el) { return { edit: "button", id: el && el.id }; } },
      { name: "buildCourseFromSpec", map: function (spec) { return { generated: true, slides: spec && spec.slides ? spec.slides.length : null }; } },
      { name: "openBrandEditor", map: function () { return { modal: "brand" }; } },
      { name: "openWelcome", map: function () { return { modal: "welcome" }; } },
      { name: "openSettings", map: function () { return { modal: "settings" }; } },
      { name: "openCourseSettings", map: function () { return { modal: "course-settings" }; } },
      { name: "runAudit", map: function () { return { audit: true }; } }
    ]);
  }

  // Expose the live editor for the dblclick heuristic (set on boot below).
  var origBoot = global.MosaicEditor && global.MosaicEditor.prototype && global.MosaicEditor.prototype.boot;
  if (origBoot) {
    global.MosaicEditor.prototype.boot = function () {
      global.__mosaicEditor = this;
      return origBoot.apply(this, arguments);
    };
  }

  global.addEventListener("blur", post);
  global.addEventListener("beforeunload", function () { log("session-end", { durMs: Date.now() - startedAt }); post(); });
  log("session-start", { native: nativeShell, w: global.innerWidth, h: global.innerHeight });
})(window);
