/*
 * Mosaic — published-course player
 *
 * Plays an exported course inside a SCORM package, using the SHARED renderer
 * (the same code that drew it in the editor — "build as you see it"). It now
 * plays each slide's TIMELINE: elements appear/disappear on their time windows,
 * narration audio plays in sync, and narrated slides auto-advance. Static
 * slides (no audio, no timing) just show everything and wait for Next.
 *
 * Accessibility: <html lang>, focus moves to each slide, slide changes are
 * announced, nav is labelled. Questions stay interactive + scored.
 */
(function (global) {
  "use strict";

  var course = global.MOSAIC_COURSE;
  var Renderer = global.MosaicRenderer;
  var Scorm = global.MosaicScorm;

  var stage = document.getElementById("stage");
  var wrap = document.querySelector(".player__stagewrap");
  var backBtn = document.getElementById("back");
  var nextBtn = document.getElementById("next");
  var playBtn = document.getElementById("play");
  var pbar = document.getElementById("pbar");
  var pbarFill = document.getElementById("pbarfill");
  var progress = document.getElementById("progress");
  var live = document.getElementById("live");

  var index = 0;
  var finished = false;
  var booted = false;
  var navHint = null;

  // Question state (survives navigation)
  var responses = {};
  var qById = {};
  course.slides.forEach(function (s) {
    s.elements.forEach(function (e) { if (e.type === "question") qById[e.id] = e; });
  });

  // Playback state (per slide)
  var pb = { playing: false, time: 0, raf: 0, last: 0, audio: null, dur: 0, elMap: {}, active: false };

  document.documentElement.lang = course.lang || "en";
  document.documentElement.dir = (Renderer.isRTL && Renderer.isRTL(course.lang)) ? "rtl" : "ltr";

  function fit() {
    var sw = course.stage.w, sh = course.stage.h;
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    var scale = Math.min((wrap.clientWidth - 48) / sw, (wrap.clientHeight - 48) / sh);
    stage.style.transform = "scale(" + Math.max(0.1, scale) + ")";
  }

  function isLast() { return index === course.slides.length - 1; }
  function currentSlide() { return course.slides[index]; }

  function slideAudio(slide) {
    return slide.elements.filter(function (e) { return e.type === "audio" && e.src; })[0] || null;
  }
  // A slide "has a timeline" if there's narration or any element with real timing.
  function hasTimeline(slide) {
    if (slideAudio(slide)) return true;
    return slide.elements.some(function (e) { return e.type !== "audio" && (e.duration != null || (e.start || 0) > 0); });
  }
  function slideHasQuestion(slide) {
    return slide.elements.some(function (e) { return e.type === "question"; });
  }

  // --- render ---------------------------------------------------------------
  function render() {
    var slide = currentSlide();
    stopPlayback();
    Renderer.renderSlide(stage, slide);
    fit();
    // Slide transition (animate the wrap, which isn't scale-transformed).
    if (Renderer.playTransition) Renderer.playTransition(wrap, slide.transition || "none", 450);

    backBtn.disabled = index === 0;
    nextBtn.textContent = isLast() ? "Finish" : "Next";
    nextBtn.setAttribute("aria-label", isLast() ? "Finish course" : "Next slide");
    var label = (slide.name || "Slide " + (index + 1)) + " — slide " + (index + 1) + " of " + course.slides.length;
    progress.textContent = "Slide " + (index + 1) + " of " + course.slides.length;
    wrap.setAttribute("aria-label", label);

    wireQuestions();
    wireButtons();
    fillResults();
    if (global.MosaicInteractions) {
      if (!pb.vars) pb.vars = MosaicInteractions.initVars(course); // persist across slides
      MosaicInteractions.activate(stage, slide, {
        vars: pb.vars,
        onNavigate: function (action, slideIdx) {
          if (action === "next") { if (isLast()) finish(); else { index++; render(); } }
          else if (action === "prev") { if (index > 0) { index--; render(); } }
          else if (action === "goto") {
            var n = resolveSlide(slideIdx);
            if (n >= 0) { index = n; render(); }
          }
        }
      });
    }
    updateNav();
    setupPlayback(slide);

    if (booted) { live.textContent = label; wrap.focus(); }
    booted = true;
  }

  // --- gated navigation -----------------------------------------------------
  function slideHasUnanswered(slide) {
    return slide.elements.some(function (e) {
      return e.type === "question" && !(responses[e.id] && responses[e.id].graded);
    });
  }
  function navAllowed() {
    var slide = currentSlide();
    if (slide.lockNext) return false;                                  // use the on-slide button
    if (course.requireAnswers && slideHasUnanswered(slide)) return false;
    return true;
  }
  function updateNav() {
    var allow = navAllowed();
    nextBtn.disabled = !allow;
    if (!navHint) {
      navHint = document.createElement("p");
      navHint.className = "player__navhint"; navHint.setAttribute("aria-live", "polite");
      var nav = document.querySelector(".player__nav");
      if (nav && nav.parentNode) nav.parentNode.insertBefore(navHint, nav); // its own bar above the nav
    }
    if (navHint) {
      if (allow) { navHint.textContent = ""; navHint.hidden = true; }
      else {
        navHint.textContent = currentSlide().lockNext
          ? "Use the on-screen button to continue."
          : "Answer the question to continue.";
        navHint.hidden = false;
      }
    }
  }

  // --- timeline playback ----------------------------------------------------
  function setupPlayback(slide) {
    pb.elMap = {};
    slide.elements.forEach(function (e) { pb.elMap[e.id] = e; });
    pb.dur = slide.duration || 5;
    pb.time = 0;

    if (hasTimeline(slide)) {
      pb.active = true;
      playBtn.hidden = false;
      pbar.hidden = false;
      applyVisibility(0);
      setProgress(0);
      play(); // autoplay on slide entry
    } else {
      pb.active = false;
      playBtn.hidden = true;
      pbar.hidden = true;
      applyVisibility(null); // static slide: show everything
    }
  }

  function applyVisibility(t) {
    var nodes = stage.querySelectorAll(".m-el");
    Array.prototype.forEach.call(nodes, function (node) {
      var el = pb.elMap[node.dataset.elId];
      if (!el) return;
      if (t == null) { node.style.visibility = ""; node.dataset.shown = ""; return; }
      var w = Renderer.timeWindow(el, pb.dur);
      var visible = (t >= w.start - 1e-6 && t < w.end - 1e-6);
      if (visible) {
        node.style.visibility = "";
        if (node.dataset.shown !== "1") { node.dataset.shown = "1"; if (Renderer.playAnim) Renderer.playAnim(node, el.animIn, el.animMs, { ease: el.animEase, delay: el.animDelay }); }
      } else if (node.dataset.shown === "1") {
        node.dataset.shown = "0";
        if (el.animOut && el.animOut !== "none" && Renderer.playExit) {
          Renderer.playExit(node, el.animOut, el.animMs, function () { node.style.visibility = "hidden"; }, { ease: el.animEase });
        } else { node.style.visibility = "hidden"; }
      } else {
        node.style.visibility = "hidden";
      }
    });
  }

  function setProgress(frac) {
    if (pbarFill) pbarFill.style.width = Math.max(0, Math.min(1, frac)) * 100 + "%";
  }

  function play() {
    if (pb.playing || !pb.active) return;
    pb.playing = true;
    playBtn.textContent = "❚❚";
    playBtn.setAttribute("aria-label", "Pause");

    var au = slideAudio(currentSlide());
    if (au) {
      pb.audio = new Audio(au.src);
      try { pb.audio.currentTime = pb.time; } catch (e) {}
      pb.audio.play().catch(function () {}); // autoplay may be blocked; visuals still advance
    }
    pb.last = now();
    var loop = function () {
      if (!pb.playing) return;
      var n = now(), dt = (n - pb.last) / 1000; pb.last = n;
      pb.time += dt; // wall-clock master so visuals advance even if audio is blocked
      if (pb.time >= pb.dur) { pb.time = pb.dur; applyVisibility(pb.dur); setProgress(1); onTimelineEnd(); return; }
      applyVisibility(pb.time);
      setProgress(pb.time / pb.dur);
      pb.raf = global.requestAnimationFrame(loop);
    };
    pb.raf = global.requestAnimationFrame(loop);
  }

  function pause() {
    pb.playing = false;
    if (pb.raf) global.cancelAnimationFrame(pb.raf);
    if (pb.audio) pb.audio.pause();
    playBtn.textContent = "▶";
    playBtn.setAttribute("aria-label", "Play");
  }

  function stopPlayback() {
    pb.playing = false;
    if (pb.raf) global.cancelAnimationFrame(pb.raf);
    if (pb.audio) { pb.audio.pause(); pb.audio = null; }
  }

  function onTimelineEnd() {
    pause();
    // Auto-advance only for narrated slides with nothing to answer — and only
    // when navigation isn't gated/locked on this slide.
    if (slideAudio(currentSlide()) && !slideHasQuestion(currentSlide()) && !isLast() && navAllowed()) {
      index++;
      render();
    }
    // otherwise: stay; learner answers / clicks Next or Finish.
  }

  function scrub(clientX) {
    if (!pb.active) return;
    var rect = pbar.getBoundingClientRect();
    var f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    pb.time = f * pb.dur;
    if (pb.audio) { try { pb.audio.currentTime = pb.time; } catch (e) {} }
    applyVisibility(pb.time);
    setProgress(f);
  }

  // --- questions ------------------------------------------------------------
  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  function wireQuestions() {
    each(stage.querySelectorAll(".m-el--question"), function (node) {
      var id = node.dataset.elId, q = qById[id];
      if (!q) return;
      var kind = q.kind || "single";
      if (responses[id] && responses[id].graded) { showResult(node, q, responses[id]); return; }

      if (kind === "matching") { // shuffle the right-hand options so order isn't a giveaway
        each(node.querySelectorAll(".q__matchsel"), function (s) {
          var opts = Array.prototype.slice.call(s.querySelectorAll("option")).filter(function (o) { return o.value !== ""; });
          shuffle(opts).forEach(function (o) { s.appendChild(o); });
        });
      }

      if (kind === "dragdrop") { // make items draggable into the zones (and back to the pool)
        each(node.querySelectorAll(".q__dditem"), function (chip) {
          chip.setAttribute("draggable", "true");
          chip.addEventListener("dragstart", function (e) {
            e.dataTransfer.setData("text/plain", chip.dataset.item); e.dataTransfer.effectAllowed = "move";
          });
        });
        each(node.querySelectorAll("[data-ddzone]"), function (zone) {
          zone.addEventListener("dragover", function (e) { e.preventDefault(); zone.classList.add("is-over"); });
          zone.addEventListener("dragleave", function () { zone.classList.remove("is-over"); });
          zone.addEventListener("drop", function (e) {
            e.preventDefault(); zone.classList.remove("is-over");
            var idx = e.dataTransfer.getData("text/plain");
            var chip = node.querySelector('.q__dditem[data-item="' + idx + '"]');
            if (chip) zone.appendChild(chip);
          });
        });
      }

      if (kind === "single" || kind === "truefalse") {
        each(node.querySelectorAll(".q__radio"), function (radio) {
          radio.addEventListener("change", function () {
            var r = { selected: parseInt(this.value, 10), graded: true };
            responses[id] = r; showResult(node, q, r); announceResult(q, r); updateNav();
          });
        });
      } else {
        var check = node.querySelector(".q__check");
        if (check) check.addEventListener("click", function () {
          var r = readResponse(node, q); r.graded = true;
          responses[id] = r; showResult(node, q, r); announceResult(q, r); updateNav();
        });
      }
    });
  }

  function readResponse(node, q) {
    var kind = q.kind || "single";
    if (kind === "fill") { var inp = node.querySelector(".q__fill"); return { text: inp ? inp.value : "" }; }
    if (kind === "matching") {
      var m = {}; each(node.querySelectorAll(".q__matchsel"), function (s) { m[s.dataset.correct] = s.value; });
      return { matches: m };
    }
    if (kind === "multiple") {
      var sel = []; each(node.querySelectorAll(".q__radio"), function (b) { if (b.checked) sel.push(parseInt(b.value, 10)); });
      return { selected: sel };
    }
    if (kind === "dragdrop") {
      var placement = {};
      each(node.querySelectorAll(".q__ddzone"), function (zone) {
        each(zone.querySelectorAll(".q__dditem"), function (chip) { placement[chip.dataset.item] = zone.dataset.ddzone; });
      });
      return { placement: placement };
    }
    var c = node.querySelector(".q__radio:checked");
    return { selected: c ? parseInt(c.value, 10) : null };
  }

  function isCorrect(q, r) {
    if (!r) return false;
    var kind = q.kind || "single";
    if (kind === "fill") {
      var norm = function (s) { s = (s == null ? "" : String(s)).trim(); return q.caseSensitive ? s : s.toLowerCase(); };
      var v = norm(r.text);
      return v !== "" && (q.answers || []).some(function (a) { return norm(a) === v; });
    }
    if (kind === "matching") {
      var m = r.matches || {}, pairs = q.pairs || [];
      return pairs.length > 0 && pairs.every(function (p, i) { return String(m[i]) === String(i); });
    }
    if (kind === "multiple") {
      var sel = (r.selected || []).slice().sort(function (a, b) { return a - b; }).join(",");
      var key = (q.answerIndices || []).slice().sort(function (a, b) { return a - b; }).join(",");
      return key !== "" && sel === key;
    }
    if (kind === "dragdrop") {
      var p = r.placement || {}, items = q.items || [];
      return items.length > 0 && items.every(function (it, i) { return String(p[i]) === String(it.zone); });
    }
    return r.selected === q.answerIndex; // single, truefalse
  }

  function showResult(node, q, r) {
    var kind = q.kind || "single", correct = isCorrect(q, r);
    each(node.querySelectorAll("input, select, .q__check"), function (c) { c.disabled = true; });
    if (kind === "single" || kind === "truefalse" || kind === "multiple") {
      var labels = node.querySelectorAll(".q__choice"), radios = node.querySelectorAll(".q__radio");
      var ans = kind === "multiple" ? (q.answerIndices || []) : [q.answerIndex];
      each(radios, function (rad, i) {
        var sel = kind === "multiple" ? ((r.selected || []).indexOf(i) >= 0) : (r.selected === i);
        rad.checked = sel;
        if (ans.indexOf(i) >= 0) labels[i].classList.add("q__choice--correct");
        else if (sel) labels[i].classList.add("q__choice--wrong");
      });
    } else if (kind === "fill") {
      var inp = node.querySelector(".q__fill");
      if (inp) { inp.value = r.text || ""; inp.classList.add(correct ? "is-correct" : "is-wrong"); }
    } else if (kind === "matching") {
      each(node.querySelectorAll(".q__matchsel"), function (s, i) {
        if (r.matches && r.matches[i] != null) s.value = r.matches[i];
        s.classList.add(String(r.matches ? r.matches[i] : "") === String(i) ? "is-correct" : "is-wrong");
      });
    } else if (kind === "dragdrop") {
      each(node.querySelectorAll(".q__dditem"), function (chip) {
        chip.setAttribute("draggable", "false");
        var placed = chip.parentElement, zoneId = placed ? placed.dataset.ddzone : null;
        var ok = String(zoneId) === String((q.items[chip.dataset.item] || {}).zone);
        chip.classList.add(ok ? "is-correct" : "is-wrong");
      });
    }
    var fb = node.querySelector(".q__feedback");
    if (fb) {
      var msg = correct ? (q.feedbackCorrect || "Correct.") : (q.feedbackIncorrect || "Not quite.");
      if (!correct && kind === "fill" && (q.answers || []).length) msg += " Accepted: " + q.answers.join(", ");
      else if (!correct && (kind === "single" || kind === "truefalse")) msg += " The highlighted answer is correct.";
      fb.textContent = msg;
      fb.className = "q__feedback " + (correct ? "is-correct" : "is-wrong");
    }
  }

  function announceResult(q, r) { live.textContent = isCorrect(q, r) ? "Correct." : "Incorrect."; }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // Resolve a goto target that may be a stable slide ID (survives authoring
  // reorders) or a legacy numeric index.
  function resolveSlide(v) {
    for (var i = 0; i < course.slides.length; i++) if (course.slides[i].id === v) return i;
    var n = parseInt(v, 10);
    return (!isNaN(n) && n >= 0 && n < course.slides.length) ? n : -1;
  }

  // --- buttons --------------------------------------------------------------
  function wireButtons() {
    var nodes = stage.querySelectorAll(".m-el--button");
    Array.prototype.forEach.call(nodes, function (node) {
      node.addEventListener("click", function () {
        var a = node.dataset.action || "next";
        if (a === "prev") { if (index > 0) { index--; render(); } }
        else if (a === "goto") {
          var t = resolveSlide(node.dataset.slideId != null ? node.dataset.slideId : node.dataset.slide);
          if (t >= 0) { index = t; render(); }
        } else if (a === "submit") { finish(); }
        else if (a === "url") { var u = node.dataset.url; if (u) global.open(u, "_blank", "noopener"); }
        else { if (isLast()) finish(); else { index++; render(); } } // "next" (default)
      });
    });
  }

  // Populate any result placeholders on the slide with the live score + pass/fail.
  function fillResults() {
    var nodes = stage.querySelectorAll('[data-result]');
    if (!nodes.length) return;
    var sc = scoreCourse();
    var passing = course.passingScore != null ? course.passingScore : 70;
    var txt;
    if (!sc) txt = "No questions to score.";
    else txt = "You scored " + sc.scaled + "% — " + (sc.scaled >= passing ? "Passed" : "Not yet passed") + ".";
    each(nodes, function (n) { n.textContent = txt; });
  }

  function scoreCourse() {
    var qs = Object.keys(qById).map(function (k) { return qById[k]; });
    if (!qs.length) return null;
    var earned = 0, total = 0;
    qs.forEach(function (q) {
      total += q.points || 0;
      if (isCorrect(q, responses[q.id])) earned += q.points || 0;
    });
    return { earned: earned, total: total, scaled: total > 0 ? Math.round((earned / total) * 100) : 0 };
  }

  function finish() {
    if (finished) return;
    finished = true;
    stopPlayback();

    var sc = scoreCourse(), summary;
    if (sc) {
      var passing = course.passingScore != null ? course.passingScore : 70;
      var passed = sc.scaled >= passing;
      Scorm.setScore(sc.scaled, 0, 100);
      Scorm.setStatus(passed ? "passed" : "failed");
      summary = "Score: " + sc.scaled + "% — " + (passed ? "Passed" : "Failed") + ".";
    } else {
      Scorm.setStatus("completed");
      summary = "Your progress has been recorded.";
    }
    Scorm.commit();
    Scorm.finish();

    var done = document.createElement("div");
    done.className = "player__done";
    var h = document.createElement("h2"); h.textContent = "Course complete";
    var p = document.createElement("p"); p.textContent = summary + " You can close this window.";
    done.appendChild(h); done.appendChild(p);
    wrap.innerHTML = ""; wrap.appendChild(done); wrap.focus();
    live.textContent = "Course complete. " + summary;
    document.querySelector(".player__nav").style.display = "none";
  }

  // --- listeners ------------------------------------------------------------
  backBtn.addEventListener("click", function () { if (index > 0) { index--; render(); } });
  nextBtn.addEventListener("click", function () { if (isLast()) finish(); else { index++; render(); } });
  playBtn.addEventListener("click", function () {
    if (pb.time >= pb.dur) { pb.time = 0; setProgress(0); }
    pb.playing ? pause() : play();
  });
  pbar.addEventListener("pointerdown", function (e) {
    pause();
    scrub(e.clientX);
    function mv(ev) { scrub(ev.clientX); }
    function up() { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); }
    document.addEventListener("pointermove", mv);
    document.addEventListener("pointerup", up);
  });
  global.addEventListener("resize", fit);
  global.addEventListener("beforeunload", function () {
    stopPlayback();
    if (Scorm.connected) { Scorm.commit(); Scorm.finish(); }
  });

  // Lightweight handle for automated verification (harmless in production).
  global.__mosaicPlayer = {
    state: function () { return { index: index, time: pb.time, active: pb.active, playing: pb.playing, slides: course.slides.length }; },
    scrubTo: function (t) { pause(); pb.time = t; applyVisibility(t); setProgress(pb.dur ? t / pb.dur : 0); },
    visOf: function (id) { var n = stage.querySelector('[data-el-id="' + id + '"]'); return n ? (n.style.visibility || "visible") : "no-node"; },
    barShown: function () { return !pbar.hidden; },
    endNow: function () { pb.time = pb.dur; onTimelineEnd(); } // deterministic end (rAF is throttled in bg tabs)
  };

  Scorm.init();
  render();
})(window);
