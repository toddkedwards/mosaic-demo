/*
 * Mosaic — interaction runtime (SHARED by the editor's Preview and the published
 * player, so "what you preview is what ships").
 *
 * Given a stage element with already-rendered .m-el nodes and a slide model, it
 * wires click triggers (show / hide / toggle / setState / navigate) and visual
 * states (hover / selected / visited / disabled). Navigation is delegated to the
 * host via opts.onNavigate(action, slideIndex) — the editor moves slides, the
 * player advances/ finishes.
 */
(function (global) {
  "use strict";

  function activate(stage, slide, opts) {
    opts = opts || {};
    var onNavigate = opts.onNavigate || function () {};
    var triggerState = {}; // elId -> "shown" | "hidden"
    var elState = {};      // elId -> "normal" | "selected" | "visited" | "disabled"
    var hoverEl = null;

    function nodeOf(id) { return stage.querySelector('[data-el-id="' + id + '"]'); }
    function elById(id) {
      for (var i = 0; i < slide.elements.length; i++) if (slide.elements[i].id === id) return slide.elements[i];
      return null;
    }

    // --- variables + conditions (live store owned by the host, persists across slides) ---
    var vars = opts.vars || {};
    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function condOk(c) {
      if (!c || !c.varName) return true;
      var cur = vars[c.varName], val = c.value;
      switch (c.op) {
        case "!=": return String(cur) !== String(val);
        case ">": return num(cur) > num(val);
        case "<": return num(cur) < num(val);
        case ">=": return num(cur) >= num(val);
        case "<=": return num(cur) <= num(val);
        default: return String(cur) === String(val); // "="
      }
    }
    function subText(t) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return (k in vars) ? vars[k] : m; }); }
    function refreshTokens() {
      slide.elements.forEach(function (el) {
        if (el.type !== "text" || el.html) return;
        if (!/\{\w+\}/.test(el.text || "")) return;
        var n = nodeOf(el.id); if (n) n.textContent = subText(el.text);
      });
    }

    // --- visibility (start-hidden + show/hide/toggle) ---
    function applyVis(id) { var n = nodeOf(id); if (n) n.style.display = (triggerState[id] === "hidden") ? "none" : ""; }
    slide.elements.forEach(function (el) {
      if (el.type === "audio") return;
      triggerState[el.id] = el.hidden ? "hidden" : "shown";
      applyVis(el.id);
      // Continuous attention loop (preview + player only; never in edit mode).
      if (el.loop && el.loop !== "none" && global.MosaicRenderer && global.MosaicRenderer.applyLoop) {
        global.MosaicRenderer.applyLoop(nodeOf(el.id), el.loop);
      }
    });

    // --- visual states ---
    function applyState(el, node) {
      var states = el.states || {}, sticky = elState[el.id] || "normal";
      var ov = { fill: el.fill, color: el.color, opacity: (el.opacity != null ? el.opacity : 1) };
      function merge(s) { if (!s) return; if (s.fill != null) ov.fill = s.fill; if (s.color != null) ov.color = s.color; if (s.opacity != null) ov.opacity = s.opacity; }
      if (sticky !== "normal") merge(states[sticky]);
      if (hoverEl === el.id) merge(states.hover);
      node.style.opacity = ov.opacity;
      if (el.type === "text") { if (ov.color != null) node.style.color = ov.color; }
      else if (el.type === "rect") { if (el.kind !== "line" && ov.fill != null) node.style.background = ov.fill; }
      else if (el.type === "button") {
        if (el.variant === "filled") { if (ov.fill != null) node.style.background = ov.fill; if (ov.color != null) node.style.color = ov.color; }
        else { if (ov.fill != null) { node.style.color = ov.fill; if (el.variant === "outline") node.style.borderColor = ov.fill; } }
      }
    }

    var Renderer = global.MosaicRenderer;
    // effect: a chosen emphasis/entrance type, or falsy/"entrance" → the element's own entrance.
    function animateTarget(id, effect, useDelay) {
      var n = nodeOf(id), e = elById(id);
      if (!n || !e || !Renderer || !Renderer.playAnim) return;
      var type = (effect && effect !== "entrance") ? effect : (e.animIn && e.animIn !== "none" ? e.animIn : "fade");
      Renderer.playAnim(n, type, e.animMs, { ease: e.animEase, delay: useDelay ? e.animDelay : 0 });
    }
    function runTrigger(t) {
      if (!condOk(t.cond)) return; // "only if…" gate
      var a = t.action || "show";
      if (a === "setVar") {
        if (t.varName != null) {
          if (t.varOp === "add") vars[t.varName] = num(vars[t.varName]) + num(t.varValue);
          else if (t.varOp === "toggle") vars[t.varName] = !vars[t.varName];
          else vars[t.varName] = t.varValue;
          refreshTokens();
        }
        return;
      }
      if (a === "show" || a === "hide" || a === "toggle") {
        if (t.target == null) return;
        var cur = triggerState[t.target];
        var becomes = (a === "show") ? "shown" : (a === "hide") ? "hidden" : (cur === "hidden" ? "shown" : "hidden");
        triggerState[t.target] = becomes;
        if (becomes === "shown") {
          applyVis(t.target); animateTarget(t.target, null, true); // reveal + entrance (with its delay)
        } else {
          var hel = elById(t.target), hn = nodeOf(t.target);
          if (hel && hn && hel.animOut && hel.animOut !== "none" && Renderer.playExit) {
            Renderer.playExit(hn, hel.animOut, hel.animMs, function () { applyVis(t.target); }, { ease: hel.animEase }); // exit, then hide
          } else { applyVis(t.target); }
        }
      } else if (a === "animate") {
        if (t.target != null) animateTarget(t.target, t.effect, false);
      } else if (a === "setState") {
        if (t.target == null) return;
        elState[t.target] = t.state || "normal";
        var tn = nodeOf(t.target), tel = elById(t.target);
        if (tn && tel) applyState(tel, tn);
      } else if (a === "next" || a === "prev" || a === "goto") {
        // Prefer the stable slide ID (survives reordering); legacy index fallback.
        onNavigate(a, t.slideId != null ? t.slideId : t.slide);
      }
    }

    // --- wire click triggers ---
    slide.elements.forEach(function (el) {
      var clickTrigs = (el.triggers || []).filter(function (t) { return (t.event || "click") === "click"; });
      if (!clickTrigs.length) return;
      var node = nodeOf(el.id);
      if (!node) return;
      node.style.cursor = "pointer";
      if (node.tagName !== "BUTTON" && node.tagName !== "A") {
        node.setAttribute("role", "button");
        node.tabIndex = 0;
        if (!node.getAttribute("aria-label")) node.setAttribute("aria-label", "Interactive: " + (el.text || el.label || el.alt || el.type));
      }
      var fire = function () {
        if (elState[el.id] === "disabled") return;
        clickTrigs.forEach(runTrigger);
      };
      node.addEventListener("click", fire);
      node.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
    });

    // --- wire states (hover auto; visited on click; selected/disabled via setState) ---
    slide.elements.forEach(function (el) {
      var states = el.states || {};
      if (!Object.keys(states).length) return;
      var node = nodeOf(el.id);
      if (!node) return;
      elState[el.id] = "normal";
      applyState(el, node);
      if (states.hover) {
        node.addEventListener("pointerenter", function () { hoverEl = el.id; applyState(el, node); });
        node.addEventListener("pointerleave", function () { if (hoverEl === el.id) hoverEl = null; applyState(el, node); });
        node.addEventListener("focus", function () { hoverEl = el.id; applyState(el, node); });
        node.addEventListener("blur", function () { if (hoverEl === el.id) hoverEl = null; applyState(el, node); });
      }
      if (states.visited) {
        node.addEventListener("click", function () {
          if (elState[el.id] !== "disabled" && elState[el.id] !== "selected") { elState[el.id] = "visited"; applyState(el, node); }
        });
      }
    });

    // --- Practice Mode (AI role-play) ---
    // Reuses this closure's vars/runTrigger/refreshTokens so a completed scenario
    // sets a course variable and fires the element's "complete" triggers.
    function hydrateRoleplay() {
      if (!global.MosaicAI) return;
      slide.elements.forEach(function (el) {
        if (el.type !== "roleplay") return;
        var node = nodeOf(el.id); if (!node) return;
        var log = node.querySelector(".rp__log");
        var input = node.querySelector(".rp__input");
        var send = node.querySelector(".rp__send");
        var finish = node.querySelector(".rp__finish");
        var verdict = node.querySelector(".rp__verdict");
        if (!log || node.dataset.rpReady) return;
        node.dataset.rpReady = "1";

        var convo = [];   // [{role, content}] in Anthropic shape
        var done = false;
        var voiceMode = false; // flips on first mic use; persona replies are then spoken
        function bubble(role, text) {
          var b = document.createElement("div");
          b.className = "rp__msg rp__msg--" + (role === "user" ? "me" : "them");
          b.textContent = text;
          log.appendChild(b); log.scrollTop = log.scrollHeight;
          return b;
        }
        var personaSystem =
          "You are role-playing a character in a workplace training simulation. Stay fully in character; never reveal you are an AI or break character. " +
          "CHARACTER: " + el.persona + " SITUATION: " + el.scenario + " The learner's goal is: " + el.objective + " " +
          "Keep every reply short (1–3 sentences), realistic, and in character. React to what the learner actually says.";

        // Seed the opening line.
        if (el.opening) { convo.push({ role: "assistant", content: el.opening }); bubble("assistant", el.opening); }
        var mic = node.querySelector(".rp__mic");
        input.disabled = false; send.disabled = false; finish.disabled = false;
        if (mic) mic.disabled = false;

        // --- Spoken Practice (native shell only): talk to the persona --------
        var nativeShell = !!(global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic);
        function nativePost(m) { try { global.webkit.messageHandlers.mosaic.postMessage(m); } catch (e) {} }
        function speakOut(text) { if (voiceMode && nativeShell && text) nativePost({ type: "speak", text: text }); }
        if (mic && nativeShell) {
          mic.style.display = "";
          mic.title = "Speak your reply";
          input.placeholder = "Type, or tap 🎤 to speak your reply"; // clarify the dual input
          var listening = false, stopTimer = null, heardAudio = false;
          var basePlaceholder = input.placeholder;
          function micIdle() {
            listening = false; if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
            mic.classList.remove("is-listening"); mic.textContent = "🎤"; mic.title = "Speak your reply";
            mic.style.transform = ""; input.placeholder = basePlaceholder;
          }
          // Whether the mic heard you at all decides the fallback message: silence
          // means a dead mic/permission; audio-but-no-words means the recognizer
          // couldn't parse it (speak a bit slower/closer, or just type).
          function noSpeechMsg() {
            return heardAudio
              ? "🎤 I could hear you, but couldn’t make out the words — try again a little slower, or just type your reply."
              : "🎤 I didn’t hear anything from the mic. Check your input device (System Settings ▸ Sound ▸ Input), or just type your reply.";
          }
          // Registered ONCE so a late/error callback after stop is still handled.
          global.MosaicNative = global.MosaicNative || {};
          global.MosaicNative._onSTT = function (b64, isFinal, errB64) {
            var text = "", err = "";
            try { text = decodeURIComponent(escape(global.atob(b64 || ""))); } catch (e) {}
            try { err = decodeURIComponent(escape(global.atob(errB64 || ""))); } catch (e) {}
            if (!listening && !err) return; // ignore stray callbacks when not active
            if (err) { micIdle(); bubble("assistant", "🎤 " + err); return; }
            input.value = text; // live partials fill the box as you talk
            if (isFinal) {
              var t = (text || "").trim(); micIdle();
              if (t) sendMsg(); else bubble("assistant", noSpeechMsg());
            }
          };
          // Live level meter: pulse the mic so you can SEE it's hearing you.
          global.MosaicNative._onSTTLevel = function (lvl) {
            if (!listening) return;
            if (lvl > 0.08) heardAudio = true;
            var s = 1 + Math.min(0.5, lvl * 0.6);
            mic.style.transform = "scale(" + s.toFixed(2) + ")";
          };
          mic.addEventListener("click", function () {
            if (done) return;
            if (!listening) {
              listening = true; voiceMode = true; heardAudio = false;
              mic.classList.add("is-listening"); mic.textContent = "■"; mic.title = "Stop & send";
              input.placeholder = "Listening… speak your reply, then tap ■ to send";
              nativePost({ type: "speakStop" }); // don't transcribe our own voice
              nativePost({ type: "sttStart" });
            } else {
              // User tapped stop — ask the recognizer to finalize, and fall back
              // if no final transcript arrives (so the button never hangs red).
              mic.textContent = "…"; mic.style.transform = "";
              nativePost({ type: "sttStop" });
              if (stopTimer) clearTimeout(stopTimer);
              stopTimer = setTimeout(function () {
                if (!listening) return;
                var t = (input.value || "").trim(); micIdle();
                if (t) sendMsg(); else bubble("assistant", noSpeechMsg());
              }, 2500);
            }
          });
        }

        function busy(on) { input.disabled = on; send.disabled = on; finish.disabled = on; if (mic) mic.disabled = on; send.textContent = on ? "…" : "Send"; }
        function sendMsg() {
          if (done) return;
          var text = (input.value || "").trim(); if (!text) return;
          input.value = ""; bubble("user", text); convo.push({ role: "user", content: text });
          busy(true);
          global.MosaicAI.chat({ mode: "chat", system: personaSystem, messages: convo }).then(function (reply) {
            convo.push({ role: "assistant", content: reply }); bubble("assistant", reply);
            speakOut(reply); // in voice mode the persona talks back
          }).catch(function (e) { bubble("assistant", "[AI error: " + e.message + "]"); }).then(function () {
            busy(false);
            var userTurns = convo.filter(function (m) { return m.role === "user"; }).length;
            if (el.maxTurns && userTurns >= el.maxTurns) finishScenario();
          });
        }
        function finishScenario() {
          if (done) return;
          // Need at least one exchange to score.
          if (!convo.some(function (m) { return m.role === "user"; })) {
            verdict.style.display = ""; verdict.className = "rp__verdict is-fail";
            verdict.textContent = "Say something first, then score.";
            return;
          }
          done = true;
          input.disabled = true; send.disabled = true; finish.disabled = true;
          if (mic) { mic.disabled = true; mic.classList.remove("is-listening"); }
          if (voiceMode && nativeShell) nativePost({ type: "sttStop" });
          // Immediate progress state — the real-Claude grade call takes a few
          // seconds; without this it looks like "nothing happened."
          verdict.style.display = ""; verdict.className = "rp__verdict";
          verdict.textContent = "Scoring your response…";
          var gradeSystem = "You are a fair, encouraging training evaluator. Judge the transcript against this rubric:\n" +
            el.rubric + "\nRespond ONLY with JSON: {\"pass\": true|false, \"feedback\": \"one or two sentences of specific, kind feedback to the learner\"}.";
          function showVerdict(res) {
            verdict.style.display = "";
            verdict.className = "rp__verdict " + (res.pass ? "is-pass" : "is-fail");
            verdict.textContent = (res.pass ? "✓ Passed — " : "✗ Not yet — ") + (res.feedback || "");
            speakOut((res.pass ? "Passed. " : "Not yet. ") + (res.feedback || "")); // spoken verdict in voice mode
            // Set the configured course variable, refresh {tokens}, fire complete triggers.
            if (el.passVar) { vars[el.passVar] = !!res.pass; refreshTokens(); }
            (el.triggers || []).filter(function (t) { return t.event === "complete"; }).forEach(runTrigger);
          }
          global.MosaicAI.chat({ mode: "grade", system: gradeSystem, messages: convo }).then(function (out) {
            var res; try { res = JSON.parse(out); } catch (e) { res = { pass: false, feedback: out || "Could not score this attempt." }; }
            showVerdict(res);
          }).catch(function (e) {
            // A failed grade must NOT be a dead end — show the error and let them retry.
            done = false; finish.disabled = false;
            verdict.style.display = ""; verdict.className = "rp__verdict is-fail";
            verdict.textContent = "Couldn’t score that: " + (e && e.message ? e.message : "the AI call failed") + " — try again.";
          });
        }
        send.addEventListener("click", sendMsg);
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); sendMsg(); } });
        finish.addEventListener("click", finishScenario);
      });
    }
    hydrateRoleplay();

    refreshTokens(); // show initial {variable} values
  }

  // Build the live variable store from a course's declared variables (typed).
  function initVars(course) {
    var v = {};
    ((course && course.variables) || []).forEach(function (d) {
      if (!d || !d.name) return;
      v[d.name] = (d.type === "number") ? (parseFloat(d.value) || 0)
        : (d.type === "boolean") ? (d.value === true || d.value === "true" || d.value === "on")
        : (d.value == null ? "" : String(d.value));
    });
    return v;
  }

  global.MosaicInteractions = { activate: activate, initVars: initVars };
})(window);
