/*
 * Mosaic — renderer
 *
 * Turns a slide's data into DOM. Shared by every mode:
 *   - edit:   elements are selectable/draggable (the editor adds handlers)
 *   - play:   elements are static (preview / published output)
 *   - export: same as play, captured into the SCORM package
 *
 * Accessibility is built into the render, not bolted on:
 *   - text renders as a real semantic tag (h1/h2/h3/p) per its role
 *   - images carry real alt text; decorative ones are hidden from AT
 *   - shapes are decorative (aria-hidden)
 *   - DOM order = element order = screen-reader reading order
 *
 * "Build as you see it" is literal because edit and play run this same path.
 */
(function (global) {
  "use strict";

  function px(n) { return n + "px"; }

  var ROLE_TAG = { heading1: "h1", heading2: "h2", heading3: "h3", body: "p" };

  // Polygon shapes via CSS clip-path (filled). rect/ellipse/line handled separately.
  var POLY = {
    triangle: "polygon(50% 0%, 100% 100%, 0% 100%)",
    diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
    pentagon: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
    hexagon: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
    star: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
    arrow: "polygon(0% 30%, 60% 30%, 60% 0%, 100% 50%, 60% 100%, 60% 70%, 0% 70%)"
  };

  // List markers are display-only: el.text stays clean (one item per line) and we
  // prefix "•" / "1." at render time so numbering stays automatic. Blank lines are
  // left alone (and don't advance the number).
  function listDisplay(el) {
    if (el.list !== "bullet" && el.list !== "number") return el.text;
    var bullets = ["•", "◦", "▪"];
    var counters = [];
    return String(el.text).split("\n").map(function (ln) {
      var m = ln.match(/^\t*/);
      var lvl = m ? m[0].length : 0;
      var content = ln.slice(lvl);
      if (!content.trim()) { counters = []; return ""; }
      var indent = new Array(lvl + 1).join("      ");
      if (el.list === "number") {
        counters[lvl] = (counters[lvl] || 0) + 1;
        counters.length = lvl + 1; // reset deeper levels
        return indent + counters[lvl] + ".  " + content;
      }
      return indent + bullets[lvl % bullets.length] + "  " + content;
    }).join("\n");
  }

  // Curated font stacks (system + common web-safe families — nothing to bundle).
  var FONTS = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    helvetica: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    arial: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
    verdana: 'Verdana, Geneva, sans-serif',
    trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif',
    rounded: '"Avenir Next", "Avenir", "Segoe UI", -apple-system, sans-serif',
    georgia: 'Georgia, "Times New Roman", serif',
    times: '"Times New Roman", Times, serif',
    courier: '"Courier New", Courier, monospace',
    mono: '"SF Mono", "Menlo", "Courier New", monospace',
    // legacy aliases (older courses)
    sans: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif'
  };
  var FONT_OPTIONS = [
    ["system", "System"], ["helvetica", "Helvetica"], ["arial", "Arial"],
    ["verdana", "Verdana"], ["trebuchet", "Trebuchet"], ["rounded", "Rounded"],
    ["georgia", "Georgia"], ["times", "Times New Roman"], ["courier", "Courier New"], ["mono", "Mono"]
  ];

  // Right-to-left scripts — drives <html dir> in the player + the editor stage.
  var RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv"];
  function isRTL(lang) { return RTL_LANGS.indexOf(String(lang || "").toLowerCase().split("-")[0]) >= 0; }

  // Position + size an element node in stage coordinates.
  function place(node, el) {
    node.style.position = "absolute";
    node.style.left = px(el.x);
    node.style.top = px(el.y);
    node.style.width = px(el.w);
    node.style.height = px(el.h);
    node.style.transform = el.rotation ? ("rotate(" + el.rotation + "deg)") : "";
  }

  function renderElement(el) {
    var node;
    if (el.type === "text") {
      var tag = ROLE_TAG[el.role] || "p";
      node = document.createElement(tag);
      node.className = "m-el m-el--text";
      // Rich text: el.html holds inline formatting (bold/italic/link/highlight on a
      // selection). Plain text: el.text + automatic list markers. Bold/italic/
      // underline at the element level apply only in plain mode (inline owns rich).
      var rich = !!el.html;
      if (rich) node.innerHTML = el.html;
      else node.textContent = listDisplay(el);
      node.style.margin = "0"; // reset default heading/paragraph margins
      node.style.fontFamily = FONTS[el.fontFamily] || FONTS.system;
      node.style.fontSize = px(el.fontSize);
      node.style.color = el.color;
      node.style.textAlign = el.align;
      node.style.fontWeight = (!rich && el.bold) ? "700" : (rich ? "400" : ((el.bold != null) ? (el.bold ? "700" : "400") : (el.weight || "400")));
      node.style.fontStyle = (!rich && el.italic) ? "italic" : "normal";
      node.style.textDecoration = (!rich && el.underline) ? "underline" : "none";
      node.style.lineHeight = el.lineHeight || 1.25;
      node.style.display = "flex";
      node.style.flexDirection = "column";
      node.style.justifyContent = "center";
    } else if (el.type === "rect") {
      node = document.createElement("div");
      node.className = "m-el m-el--rect";
      if (el.opacity != null) node.style.opacity = el.opacity;
      if (el.kind === "line") {
        node.style.background = "transparent";
        var bar = document.createElement("div");
        var hpx = Math.max(2, el.strokeWidth || 3);
        bar.style.cssText = "position:absolute;left:0;right:0;top:50%;height:" + hpx +
          "px;margin-top:" + (-hpx / 2) + "px;border-radius:2px;background:" + (el.stroke || el.fill);
        node.appendChild(bar);
      } else {
        node.style.background = el.fill;
        node.style.borderRadius = (el.kind === "ellipse") ? "50%" : px(el.radius || 0);
        if (POLY[el.kind]) {
          node.style.clipPath = POLY[el.kind];           // filled polygon (border doesn't apply cleanly)
          node.style.borderRadius = "0";
        } else if (el.stroke && el.strokeWidth) {
          node.style.border = el.strokeWidth + "px solid " + el.stroke;
        }
      }
      node.setAttribute("aria-hidden", "true"); // shapes are decorative
    } else if (el.type === "icon") {
      node = document.createElement("div");
      node.className = "m-el m-el--icon";
      if (el.opacity != null) node.style.opacity = el.opacity;
      node.style.color = el.color || "#3b6ef5";
      var iname = el.icon || "check";
      node.innerHTML = (global.MosaicIcons && MosaicIcons.content) ? MosaicIcons.content(iname, "100%", "currentColor") : "";
      node.setAttribute("aria-hidden", "true"); // decorative
    } else if (el.type === "result") {
      node = document.createElement("div");
      node.className = "m-el m-el--result";
      node.style.fontFamily = FONTS[el.fontFamily] || FONTS.system;
      node.style.fontSize = px(el.fontSize);
      node.style.color = el.color;
      node.style.display = "flex"; node.style.alignItems = "center"; node.style.justifyContent = "center"; node.style.textAlign = "center";
      node.setAttribute("data-result", "1"); // the player fills this with the live score
      node.textContent = "Your score appears here";
    } else if (el.type === "image") {
      node = document.createElement("div");
      node.className = "m-el m-el--image";
      if (el.opacity != null) node.style.opacity = el.opacity;
      if (el.radius) { node.style.borderRadius = px(el.radius); node.style.overflow = "hidden"; }
      if (el.src) {
        var img = document.createElement("img");
        img.src = el.src;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.draggable = false;
        if (el.decorative) {
          img.alt = "";
          img.setAttribute("aria-hidden", "true");
        } else {
          img.alt = el.alt || "";
        }
        node.appendChild(img);
      } else {
        node.classList.add("m-el--image-empty");
        node.textContent = "Image";
        node.setAttribute("aria-hidden", "true");
      }
    } else if (el.type === "video") {
      node = document.createElement("div");
      node.className = "m-el m-el--video";
      if (el.opacity != null) node.style.opacity = el.opacity;
      if (el.radius) { node.style.borderRadius = px(el.radius); node.style.overflow = "hidden"; }
      if (el.src) {
        var emb = videoEmbedUrl(el.src);
        if (emb) {
          var ifr = document.createElement("iframe");
          ifr.src = emb; ifr.style.width = "100%"; ifr.style.height = "100%"; ifr.style.border = "0";
          ifr.setAttribute("allow", "autoplay; fullscreen; picture-in-picture; encrypted-media");
          ifr.setAttribute("allowfullscreen", "");
          if (el.alt) ifr.title = el.alt;
          node.appendChild(ifr);
        } else {
          var vid = document.createElement("video");
          vid.src = el.src; vid.style.width = "100%"; vid.style.height = "100%"; vid.style.objectFit = "cover";
          vid.setAttribute("playsinline", "");
          if (el.controls) vid.controls = true;
          if (el.autoplay) vid.autoplay = true;
          if (el.vloop) vid.loop = true;
          if (el.muted || el.autoplay) vid.muted = true;
          if (el.poster) vid.poster = el.poster;
          if (el.alt) vid.setAttribute("aria-label", el.alt);
          node.appendChild(vid);
        }
      } else {
        node.classList.add("m-el--image-empty");
        node.textContent = "Video";
        node.setAttribute("aria-hidden", "true");
      }
    } else if (el.type === "question") {
      var kind = el.kind || "single";
      node = document.createElement("div");
      node.className = "m-el m-el--question";
      node.dataset.qkind = kind;
      node.style.fontFamily = FONTS[el.fontFamily] || FONTS.system;
      if (el.fontSize) node.style.fontSize = px(el.fontSize);
      var fs = document.createElement("fieldset");
      fs.className = "q__fieldset";
      var legend = document.createElement("legend");
      legend.className = "q__prompt";
      legend.textContent = el.prompt;
      if (el.color) legend.style.color = el.color;
      fs.appendChild(legend);

      var hintText = { multiple: "Select all that apply.", fill: "Type your answer.", matching: "Match each item.", dragdrop: "Drag each item into a category." }[kind];
      if (hintText) {
        var qhint = document.createElement("p");
        qhint.className = "q__hint";
        qhint.textContent = hintText;
        if (el.color) qhint.style.color = el.color;
        fs.appendChild(qhint);
      }

      if (kind === "fill") {
        var fillWrap = document.createElement("div"); fillWrap.className = "q__choices";
        var fill = document.createElement("input");
        fill.type = "text"; fill.className = "q__fill"; fill.placeholder = "Your answer";
        fill.setAttribute("aria-label", el.prompt || "Answer");
        fillWrap.appendChild(fill);
        fs.appendChild(fillWrap);
      } else if (kind === "matching") {
        var mwrap = document.createElement("div"); mwrap.className = "q__match";
        (el.pairs || []).forEach(function (p, i) {
          var row = document.createElement("div"); row.className = "q__matchrow";
          var lab = document.createElement("span"); lab.className = "q__matchleft"; lab.textContent = p.left;
          if (el.color) lab.style.color = el.color;
          var sel = document.createElement("select"); sel.className = "q__matchsel"; sel.dataset.correct = String(i);
          sel.setAttribute("aria-label", "Match for " + p.left);
          var ph = document.createElement("option"); ph.value = ""; ph.textContent = "Choose…"; sel.appendChild(ph);
          (el.pairs || []).forEach(function (pp, j) {
            var opt = document.createElement("option"); opt.value = String(j); opt.textContent = pp.right; sel.appendChild(opt);
          });
          row.appendChild(lab); row.appendChild(sel);
          mwrap.appendChild(row);
        });
        fs.appendChild(mwrap);
      } else if (kind === "dragdrop") {
        var dd = document.createElement("div"); dd.className = "q__dd";
        var pool = document.createElement("div"); pool.className = "q__ddpool"; pool.dataset.ddzone = "pool";
        (el.items || []).forEach(function (it, i) {
          var chip = document.createElement("div"); chip.className = "q__dditem"; chip.dataset.item = String(i);
          chip.textContent = it.text; if (el.color) chip.style.color = el.color;
          pool.appendChild(chip);
        });
        dd.appendChild(pool);
        var zones = document.createElement("div"); zones.className = "q__ddzones";
        (el.zones || []).forEach(function (z, zi) {
          var zone = document.createElement("div"); zone.className = "q__ddzone"; zone.dataset.ddzone = String(zi);
          var zl = document.createElement("div"); zl.className = "q__ddzonelabel"; zl.textContent = z;
          zone.appendChild(zl);
          zones.appendChild(zone);
        });
        dd.appendChild(zones);
        fs.appendChild(dd);
      } else {
        var multi = kind === "multiple";
        var choices = document.createElement("div");
        choices.className = "q__choices";
        (el.choices || []).forEach(function (choice, i) {
          var label = document.createElement("label");
          label.className = "q__choice";
          var input = document.createElement("input");
          input.type = multi ? "checkbox" : "radio";
          input.name = "q-" + el.id;
          input.value = String(i);
          input.className = "q__radio";
          var span = document.createElement("span");
          span.className = "q__choicetext";
          span.textContent = choice;
          if (el.color) span.style.color = el.color;
          label.appendChild(input);
          label.appendChild(span);
          choices.appendChild(label);
        });
        fs.appendChild(choices);
      }

      // Kinds that can't grade on a single click get a Check button (player wires it).
      if (kind === "multiple" || kind === "fill" || kind === "matching" || kind === "dragdrop") {
        var check = document.createElement("button");
        check.type = "button"; check.className = "q__check"; check.textContent = "Check answer";
        fs.appendChild(check);
      }

      var fb = document.createElement("p");
      fb.className = "q__feedback";
      fb.setAttribute("aria-live", "polite");
      fs.appendChild(fb);
      node.appendChild(fs);
    } else if (el.type === "button") {
      // A real <button> so it's keyboard-operable + announced. The player reads
      // the data-* action attributes; the editor leaves it inert (drag/select).
      node = document.createElement("button");
      node.type = "button";
      node.className = "m-el m-el--button";
      node.textContent = el.label || "Button";
      var act = el.action || { type: "next" };
      node.dataset.action = act.type || "next";
      if (act.type === "goto" && act.slide != null) node.dataset.slide = act.slide;
      if (act.type === "goto" && act.slideId != null) node.dataset.slideId = act.slideId; // survives reordering
      if (act.type === "url") node.dataset.url = act.url || "";
      var accent = el.fill || "#3b6ef5";
      node.style.fontFamily = FONTS[el.fontFamily] || FONTS.system;
      node.style.fontSize = px(el.fontSize || 20);
      node.style.fontWeight = "600";
      node.style.borderRadius = px(el.radius != null ? el.radius : 10);
      node.style.display = "inline-flex";
      node.style.alignItems = "center";
      node.style.justifyContent = "center";
      node.style.textAlign = "center";
      node.style.padding = "0 18px";
      node.style.lineHeight = "1.1";
      node.style.cursor = "pointer";
      if (el.variant === "outline") {
        node.style.background = "transparent";
        node.style.border = "2px solid " + accent;
        node.style.color = accent;
      } else if (el.variant === "text") {
        node.style.background = "transparent";
        node.style.border = "0";
        node.style.color = accent;
      } else {
        node.style.background = accent;
        node.style.border = "0";
        node.style.color = el.color || "#ffffff";
      }
    } else if (el.type === "roleplay") {
      // Practice Mode chat shell. Inert in the editor; the runtime (preview +
      // player) seeds the opening line and wires Send / Finish via MosaicInteractions.
      node = document.createElement("div");
      node.className = "m-el m-el--roleplay";
      node.dataset.roleplay = el.id;
      node.style.fontFamily = FONTS[el.fontFamily] || FONTS.system;
      var accent = el.accent || "#3b6ef5";
      var head = document.createElement("div");
      head.className = "rp__head";
      head.style.background = accent;
      head.innerHTML = '<span class="rp__dot"></span><span class="rp__title"></span>';
      head.querySelector(".rp__title").textContent = el.title || "Practice";
      node.appendChild(head);

      var log = document.createElement("div");
      log.className = "rp__log"; log.setAttribute("aria-live", "polite");
      node.appendChild(log);

      var verdict = document.createElement("div");
      verdict.className = "rp__verdict"; verdict.style.display = "none";
      node.appendChild(verdict);

      var row = document.createElement("div");
      row.className = "rp__row";
      var input = document.createElement("input");
      input.type = "text"; input.className = "rp__input";
      input.placeholder = "Type your reply…"; input.disabled = true;
      // Spoken Practice: the runtime reveals this only when the native shell
      // (mic + on-device speech) is present; browser/LMS playback keeps it hidden.
      var mic = document.createElement("button");
      mic.type = "button"; mic.className = "rp__mic"; mic.textContent = "🎤";
      mic.title = "Speak your reply"; mic.setAttribute("aria-label", "Speak your reply");
      mic.style.display = "none"; mic.disabled = true;
      var send = document.createElement("button");
      send.type = "button"; send.className = "rp__send"; send.textContent = "Send";
      send.style.background = accent; send.disabled = true;
      row.appendChild(input); row.appendChild(mic); row.appendChild(send);
      node.appendChild(row);

      var finish = document.createElement("button");
      finish.type = "button"; finish.className = "rp__finish";
      finish.textContent = "I'm done — score me"; finish.disabled = true;
      node.appendChild(finish);
    } else {
      node = document.createElement("div");
      node.className = "m-el m-el--unknown";
      node.textContent = "[" + el.type + "]";
    }
    node.dataset.elId = el.id;
    if (el.hidden) node.classList.add("m-el--hidden"); // editor affordance; player sets display
    place(node, el);
    return node;
  }

  // Render a whole slide's elements into a stage container (cleared first).
  function renderSlide(stageNode, slide) {
    stageNode.innerHTML = "";
    stageNode.style.background = slide.background || "#ffffff";
    slide.elements.forEach(function (el) {
      if (el.type === "audio") return; // non-visual; handled by the timeline/player
      stageNode.appendChild(renderElement(el));
    });
  }

  // Convert a YouTube/Vimeo page URL to an embeddable iframe URL. Returns null
  // for a plain media file (mp4 / data URL), which renders as a <video> instead.
  function videoEmbedUrl(src) {
    src = String(src || "");
    var m = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
    if (m) return "https://www.youtube.com/embed/" + m[1];
    m = src.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return "https://player.vimeo.com/video/" + m[1];
    return null;
  }

  // The visible time window of an element on its slide (seconds).
  // duration === null means "spans the whole slide".
  function timeWindow(el, slideDuration) {
    var start = el.start || 0;
    var dur = (el.duration == null) ? (slideDuration - start) : el.duration;
    return { start: start, end: start + Math.max(0, dur) };
  }

  // --- Entrance animations (shared by editor Preview + published player) ------
  // Each element can have an `animIn` (entrance) that plays whenever it appears
  // — at its timeline start time, or when a trigger reveals it. Kept here in the
  // renderer so it ships in every mode automatically.
  var ANIM_TYPES = [
    { id: "none", label: "None" },
    { id: "fade", label: "Fade in" },
    { id: "fadeUp", label: "Fade up" },
    { id: "fadeDown", label: "Fade down" },
    { id: "flyLeft", label: "Fly in from left" },
    { id: "flyRight", label: "Fly in from right" },
    { id: "flyUp", label: "Fly in from below" },
    { id: "flyDown", label: "Fly in from above" },
    { id: "zoom", label: "Zoom in" },
    { id: "pop", label: "Pop" }
  ];
  // Exit animations (played when an element leaves — its end time or a trigger hide).
  var EXIT_TYPES = [
    { id: "none", label: "None" },
    { id: "fade", label: "Fade out" },
    { id: "flyLeft", label: "Fly out left" },
    { id: "flyRight", label: "Fly out right" },
    { id: "flyUp", label: "Fly out up" },
    { id: "flyDown", label: "Fly out down" },
    { id: "zoom", label: "Zoom out" }
  ];
  // Emphasis effects (attention-grabbers, fired by an Animate trigger).
  var EMPHASIS_TYPES = [
    { id: "pulse", label: "Pulse" },
    { id: "bounce", label: "Bounce" },
    { id: "shake", label: "Shake" }
  ];
  // Looping attention effects (run continuously while the element is on screen).
  var LOOP_TYPES = [
    { id: "none", label: "None" },
    { id: "pulse", label: "Pulse" },
    { id: "bounce", label: "Bounce" },
    { id: "shake", label: "Shake" }
  ];
  // Per-slide transitions, played when advancing TO a slide.
  var TRANSITION_TYPES = [
    { id: "none", label: "None" },
    { id: "fade", label: "Fade" },
    { id: "push", label: "Push" },
    { id: "dissolve", label: "Dissolve" }
  ];
  var EASES = { smooth: "cubic-bezier(0.22,0.61,0.36,1)", linear: "linear", bounce: "cubic-bezier(0.34,1.56,0.64,1)" };
  function easeOf(name) { return EASES[name] || EASES.smooth; }
  var ANIM_CSS = "" +
    "@keyframes mosa-fade{from{opacity:0}to{opacity:1}}" +
    "@keyframes mosa-fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-fadeDown{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-flyLeft{from{opacity:0;transform:translateX(-44px)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-flyRight{from{opacity:0;transform:translateX(44px)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-flyUp{from{opacity:0;transform:translateY(44px)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-flyDown{from{opacity:0;transform:translateY(-44px)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-zoom{from{opacity:0;transform:scale(.86)}to{opacity:1;transform:none}}" +
    "@keyframes mosa-pop{0%{opacity:0;transform:scale(.6)}60%{opacity:1;transform:scale(1.04)}100%{transform:scale(1)}}" +
    "@keyframes mosa-out-fade{from{opacity:1}to{opacity:0}}" +
    "@keyframes mosa-out-flyLeft{from{opacity:1;transform:none}to{opacity:0;transform:translateX(-44px)}}" +
    "@keyframes mosa-out-flyRight{from{opacity:1;transform:none}to{opacity:0;transform:translateX(44px)}}" +
    "@keyframes mosa-out-flyUp{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-44px)}}" +
    "@keyframes mosa-out-flyDown{from{opacity:1;transform:none}to{opacity:0;transform:translateY(44px)}}" +
    "@keyframes mosa-out-zoom{from{opacity:1;transform:none}to{opacity:0;transform:scale(.86)}}" +
    "@keyframes mosa-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.09)}}" +
    "@keyframes mosa-bounce{0%,100%{transform:translateY(0)}30%{transform:translateY(-16px)}55%{transform:translateY(0)}75%{transform:translateY(-7px)}}" +
    "@keyframes mosa-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}}" +
    "@keyframes mosa-slide-fade{from{opacity:0}to{opacity:1}}" +
    "@keyframes mosa-slide-push{from{opacity:0;transform:translateX(5%)}to{opacity:1;transform:none}}" +
    ".mosa-loop-pulse{animation:mosa-pulse 1.8s ease-in-out infinite}" +
    ".mosa-loop-bounce{animation:mosa-bounce 1.7s ease-in-out infinite}" +
    ".mosa-loop-shake{animation:mosa-shake 1.5s ease-in-out infinite}";
  var animInjected = false;
  function injectAnimCSS() {
    if (animInjected || typeof document === "undefined") return;
    var s = document.createElement("style"); s.id = "mosaic-anim-css"; s.textContent = ANIM_CSS;
    (document.head || document.documentElement).appendChild(s);
    animInjected = true;
  }
  // Play an entrance animation on a node. opts: { ease, delay }. Replays cleanly;
  // clears the inline animation on finish so a looping class (if any) resumes.
  function playAnim(node, type, ms, opts) {
    if (!node || !type || type === "none") return;
    injectAnimCSS(); opts = opts || {};
    var dur = (ms != null ? ms : 450), dl = (opts.delay || 0);
    node.style.animation = "none";
    void node.offsetWidth; // reflow so the same animation can re-trigger
    node.style.animation = "mosa-" + type + " " + dur + "ms " + easeOf(opts.ease) + " " + dl + "ms both";
    var done = function () { node.style.animation = ""; node.removeEventListener("animationend", done); };
    node.addEventListener("animationend", done);
  }
  // Play an exit animation, then run onDone (the caller hides the element there).
  function playExit(node, type, ms, onDone, opts) {
    if (!node) { if (onDone) onDone(); return; }
    if (!type || type === "none") { if (onDone) onDone(); return; }
    injectAnimCSS(); opts = opts || {};
    var dur = (ms != null ? ms : 450);
    node.style.animation = "none";
    void node.offsetWidth;
    node.style.animation = "mosa-out-" + type + " " + dur + "ms " + easeOf(opts.ease) + " both";
    var done = function () { node.style.animation = ""; node.removeEventListener("animationend", done); if (onDone) onDone(); };
    node.addEventListener("animationend", done);
  }
  // Continuous attention loop, toggled via a CSS class (so an entrance/exit's
  // inline animation overrides it, then it resumes when the inline clears).
  function applyLoop(node, loop) {
    if (!node) return;
    node.classList.remove("mosa-loop-pulse", "mosa-loop-bounce", "mosa-loop-shake");
    if (loop && loop !== "none") { injectAnimCSS(); node.classList.add("mosa-loop-" + loop); }
  }
  // Slide transition on a container node (opacity-based so it never fights the
  // stage's scale transform; push adds a small horizontal slide).
  function playTransition(node, type, ms) {
    if (!node || !type || type === "none") return;
    injectAnimCSS();
    var kf = (type === "push") ? "mosa-slide-push" : "mosa-slide-fade";
    var dur = (ms != null ? ms : 450);
    node.style.animation = "none";
    void node.offsetWidth;
    node.style.animation = kf + " " + dur + "ms cubic-bezier(0.22,0.61,0.36,1) both";
    var done = function () { node.style.animation = ""; node.removeEventListener("animationend", done); };
    node.addEventListener("animationend", done);
  }

  global.MosaicRenderer = {
    renderElement: renderElement,
    renderSlide: renderSlide,
    place: place,
    timeWindow: timeWindow,
    ANIM_TYPES: ANIM_TYPES,
    EXIT_TYPES: EXIT_TYPES,
    EMPHASIS_TYPES: EMPHASIS_TYPES,
    LOOP_TYPES: LOOP_TYPES,
    TRANSITION_TYPES: TRANSITION_TYPES,
    playAnim: playAnim,
    playExit: playExit,
    applyLoop: applyLoop,
    playTransition: playTransition,
    ROLE_TAG: ROLE_TAG,
    FONTS: FONTS,
    FONT_OPTIONS: FONT_OPTIONS,
    isRTL: isRTL
  };
})(window);
