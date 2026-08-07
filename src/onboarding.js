/* First-run onboarding — a short, polished full-screen flow that explains what
 * Mosaic is, the two ways to build, the bring-your-own-key setup, and the tools.
 * Reopenable any time via Help ▸ Show Onboarding. Loads after editor.js and
 * augments MosaicEditor.prototype.
 */
(function (global) {
  "use strict";
  var E = global.MosaicEditor;
  if (!E || !E.prototype) return;

  var ACCENT = "#7b6cff";

  // Small inline-SVG helper (24x24, stroked, currentColor).
  function svg(paths, opts) {
    opts = opts || {};
    return '<svg viewBox="0 0 24 24" width="' + (opts.size || 22) + '" height="' + (opts.size || 22) +
      '" fill="' + (opts.fill || "none") + '" stroke="' + (opts.stroke || "currentColor") +
      '" stroke-width="' + (opts.sw || 1.7) + '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }
  var ICON = {
    design: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'),
    generate: svg('<path d="M5 3v4M3 5h4M6 17v4M4 19h4"/><path d="m13 3 2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3Z"/>'),
    practice: svg('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'),
    key: svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8M17 7l2 2M15 9l1.5 1.5"/>'),
    text: svg('<path d="M4 7V5h16v2M9 19h6M12 5v14"/>'),
    shape: svg('<rect x="4" y="4" width="16" height="16" rx="2"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
    question: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7M12 17h.01"/>'),
    button: svg('<rect x="3" y="8" width="18" height="8" rx="4"/>'),
    interaction: svg('<path d="M4 6h7v5H4zM13 6h7v12h-7zM4 13h7v5H4z"/>'),
    icon: svg('<path d="m12 3 2.6 5.6L21 9.3l-4.5 4.3 1.1 6.2L12 17l-5.6 2.8 1.1-6.2L3 9.3l6.4-.7Z"/>'),
    rocket: svg('<path d="M5 15c-1 2-1 5-1 5s3 0 5-1M9 13a10 10 0 0 1 8-8 10 10 0 0 1-2 10l-2 2H9l-2-2Z"/><circle cx="15" cy="9" r="1.4"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>')
  };

  var LOGO =
    '<svg width="52" height="52" viewBox="0 0 64 64" aria-hidden="true">' +
      '<defs><linearGradient id="onbg" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#7b6cff"/><stop offset="1" stop-color="#c662ff"/></linearGradient></defs>' +
      '<rect width="64" height="64" rx="14" fill="url(#onbg)"/>' +
      '<rect x="12.5" y="12.5" width="18" height="18" rx="4.5" fill="#fff" opacity=".96"/>' +
      '<rect x="33.5" y="12.5" width="18" height="18" rx="4.5" fill="#fff" opacity=".58"/>' +
      '<rect x="12.5" y="33.5" width="18" height="18" rx="4.5" fill="#fff" opacity=".58"/>' +
      '<rect x="33.5" y="33.5" width="18" height="18" rx="4.5" fill="#ffb056"/></svg>';

  function pillar(icon, label) {
    return '<div class="onb-pillar"><span class="onb-pillar__i">' + icon + '</span>' + label + '</div>';
  }
  function toolCard(icon, name, desc) {
    return '<div class="onb-tool"><span class="onb-tool__i">' + icon + '</span>' +
      '<div><div class="onb-tool__n">' + name + '</div><div class="onb-tool__d">' + desc + '</div></div></div>';
  }

  E.prototype.openOnboarding = function () {
    var self = this;
    var existing = document.getElementById("onb");
    if (existing) existing.remove();

    function nativePost(m) { try { global.webkit.messageHandlers.mosaic.postMessage(m); } catch (e) {} }
    function isNative() { return !!(global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic); }

    // --- Steps -------------------------------------------------------------
    var steps = [
      {
        art: '<div class="onb-hero">' + LOGO + '</div>',
        title: "Welcome to Mosaic",
        body: "Build e-learning courses that look designed and behave exactly right — " +
          (isNative() ? "natively on your Mac" : "right in your browser, nothing to install") + ". Here’s the quick tour.",
        extra: '<div class="onb-pillars">' +
          pillar(ICON.design, "Design") + pillar(ICON.generate, "Generate") + pillar(ICON.practice, "Practice") + '</div>'
      },
      {
        title: "Two ways to build",
        body: "Start however you think best — and mix the two freely.",
        extra: '<div class="onb-cards">' +
          '<div class="onb-card"><span class="onb-card__i">' + ICON.design + '</span>' +
            '<div class="onb-card__t">Design by hand</div>' +
            '<div class="onb-card__d">A real canvas: text, shapes, images, buttons, quizzes and interactions — with slides, a timeline, and precise properties.</div></div>' +
          '<div class="onb-card"><span class="onb-card__i">' + ICON.generate + '</span>' +
            '<div class="onb-card__t">Describe it, AI drafts</div>' +
            '<div class="onb-card__d">Type what you need (or drop in a doc) and Mosaic drafts a full course — objectives, content, a quiz, and a Practice scenario — for you to refine.</div></div>' +
          '</div>'
      },
      {
        title: "Bring your own AI key",
        body: "The AI features — generating a course, writing quiz options, and the spoken Practice partner — run on Claude with your own Anthropic API key. It’s stored locally on your Mac and sent only to Anthropic.",
        key: true
      },
      {
        title: "Your toolkit",
        body: "Everything to build lives in the top toolbar:",
        extra: '<div class="onb-tools">' +
          toolCard(ICON.text, "Text & Shapes", "Type, style, arrange") +
          toolCard(ICON.image, "Media", "Images, video, audio, icons") +
          toolCard(ICON.question, "Questions", "Quizzes with real scoring") +
          toolCard(ICON.interaction, "Interactions", "Tabs, accordions, hotspots, branching") +
          toolCard(ICON.practice, "Practice", "A role-play partner that grades the learner") +
          toolCard(ICON.button, "Buttons & Triggers", "Make it interactive") +
          '</div>' +
          '<div class="onb-note">Slides live on the left, Properties on the right. <b>Preview</b> plays the course; <b>Share</b> exports SCORM for any LMS.</div>'
      },
      {
        art: '<div class="onb-hero onb-hero--ok">' + ICON.rocket.replace('width="22" height="22"', 'width="40" height="40"') + '</div>',
        title: "You’re ready",
        body: "That’s the tour. Reopen it any time from Help ▸ Show Onboarding. Let’s build something.",
        finalCtas: true
      }
    ];

    var idx = 0;

    // --- Shell -------------------------------------------------------------
    var overlay = document.createElement("div");
    overlay.id = "onb";
    overlay.className = "onb";
    overlay.innerHTML =
      '<div class="onb__card" role="dialog" aria-modal="true" aria-label="Welcome to Mosaic">' +
        '<button class="onb__skip" type="button">Skip</button>' +
        '<div class="onb__art"></div>' +
        '<h2 class="onb__title"></h2>' +
        '<p class="onb__body"></p>' +
        '<div class="onb__extra"></div>' +
        '<div class="onb__foot">' +
          '<div class="onb__dots"></div>' +
          '<div class="onb__nav">' +
            '<button class="onb__back btn" type="button">Back</button>' +
            '<button class="onb__next btn btn--primary" type="button">Next</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    nativePost({ type: "modalOpen" });

    var card = overlay.querySelector(".onb__card");
    var artEl = overlay.querySelector(".onb__art");
    var titleEl = overlay.querySelector(".onb__title");
    var bodyEl = overlay.querySelector(".onb__body");
    var extraEl = overlay.querySelector(".onb__extra");
    var dotsEl = overlay.querySelector(".onb__dots");
    var backBtn = overlay.querySelector(".onb__back");
    var nextBtn = overlay.querySelector(".onb__next");
    var skipBtn = overlay.querySelector(".onb__skip");

    function finish() {
      try { localStorage.setItem("mosaic.onboarded", "1"); } catch (e) {}
      nativePost({ type: "modalClose" });
      overlay.remove();
      document.removeEventListener("keydown", onKey, true);
      // Hand off to the welcome start screen (unless the user turned it off).
      var showWelcome = true;
      try { showWelcome = localStorage.getItem("mosaic.showWelcome") !== "0"; } catch (e) {}
      if (self.openWelcome && document.body.classList.contains("is-launching")) {
        if (showWelcome) self.openWelcome(true);
        else { document.body.classList.remove("is-launching"); nativePost({ type: "exitSplash" }); }
      }
    }

    // --- Key step widget ---------------------------------------------------
    function keyWidget() {
      var wrap = document.createElement("div"); wrap.className = "onb-key";
      var have = false; try { have = !!(localStorage.getItem("mosaic.aiKey") || "").trim(); } catch (e) {}
      var row = document.createElement("div"); row.className = "onb-key__row";
      var input = document.createElement("input");
      input.type = "password"; input.className = "onb-key__input";
      input.placeholder = have ? "A key is already saved — paste to replace" : "sk-ant-…";
      input.autocomplete = "off"; input.spellcheck = false;
      var save = document.createElement("button");
      save.type = "button"; save.className = "btn btn--primary"; save.textContent = "Save & test";
      row.appendChild(input); row.appendChild(save);
      var status = document.createElement("div"); status.className = "onb-key__status";
      if (have) { status.classList.add("is-ok"); status.textContent = "✓ A key is saved — AI features are live."; }
      var links = document.createElement("div"); links.className = "onb-key__links";
      links.innerHTML = '<a href="#" class="onb-key__get">Get a key ↗</a>' +
        '<span class="onb-key__skiphint">No key yet? You can skip this and add it later in Settings (⌘,).</span>';
      wrap.appendChild(row); wrap.appendChild(status); wrap.appendChild(links);

      links.querySelector(".onb-key__get").addEventListener("click", function (e) {
        e.preventDefault();
        var url = "https://console.anthropic.com/settings/keys";
        if (isNative()) nativePost({ type: "openExternal", url: url });
        else global.open(url, "_blank");
      });
      function doSave() {
        var v = (input.value || "").trim();
        if (!v) { status.className = "onb-key__status is-err"; status.textContent = "Paste your key first (or Skip)."; return; }
        if (!global.MosaicAI || !global.MosaicAI.verifyKey) { status.className = "onb-key__status"; status.textContent = "Checking…"; return; }
        save.disabled = true; save.textContent = "Testing…";
        status.className = "onb-key__status"; status.textContent = "Verifying with Anthropic…";
        global.MosaicAI.verifyKey(v).then(function (res) {
          save.disabled = false; save.textContent = "Save & test";
          if (res && res.ok) {
            try { localStorage.setItem("mosaic.aiKey", v); } catch (e) {}
            status.className = "onb-key__status is-ok"; status.textContent = "✓ Key works — saved. AI features are live.";
            nextBtn.textContent = "Next";
          } else {
            status.className = "onb-key__status is-err";
            status.textContent = "✗ " + ((res && res.message) || "That key didn’t work.");
          }
        }).catch(function (e) {
          save.disabled = false; save.textContent = "Save & test";
          status.className = "onb-key__status is-err"; status.textContent = "✗ " + (e && e.message ? e.message : "Couldn’t reach Anthropic.");
        });
      }
      save.addEventListener("click", doSave);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doSave(); } });
      return wrap;
    }

    // --- Render ------------------------------------------------------------
    function render() {
      var s = steps[idx];
      card.classList.toggle("onb__card--hero", !!s.art);
      artEl.innerHTML = s.art || "";
      artEl.style.display = s.art ? "" : "none";
      titleEl.textContent = s.title;
      bodyEl.textContent = s.body;
      extraEl.innerHTML = "";
      if (s.key) extraEl.appendChild(keyWidget());
      else if (s.finalCtas) {
        var c = document.createElement("div"); c.className = "onb-final";
        c.innerHTML =
          '<button class="btn btn--primary onb-final__go" type="button">Start building</button>' +
          '<span class="onb-final__hint">You’ll land on the start screen — New course, Describe a course, or a template.</span>';
        c.querySelector(".onb-final__go").addEventListener("click", finish);
        extraEl.appendChild(c);
      } else if (s.extra) extraEl.innerHTML = s.extra;

      // dots
      dotsEl.innerHTML = "";
      steps.forEach(function (_, i) {
        var d = document.createElement("span");
        d.className = "onb__dot" + (i === idx ? " is-on" : "");
        dotsEl.appendChild(d);
      });
      backBtn.style.visibility = idx === 0 ? "hidden" : "";
      var last = idx === steps.length - 1;
      nextBtn.textContent = last ? "Start building" : (steps[idx].key ? "Continue" : "Next");
      skipBtn.style.display = last ? "none" : "";
    }

    function go(n) { idx = Math.max(0, Math.min(steps.length - 1, n)); render(); }
    nextBtn.addEventListener("click", function () { if (idx === steps.length - 1) finish(); else go(idx + 1); });
    backBtn.addEventListener("click", function () { go(idx - 1); });
    skipBtn.addEventListener("click", finish);
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { if (idx < steps.length - 1) go(idx + 1); }
      else if (e.key === "ArrowLeft") { if (idx > 0) go(idx - 1); }
    }
    document.addEventListener("keydown", onKey, true);

    render();
  };
})(window);
