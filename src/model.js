/*
 * Mosaic — document model
 *
 * The single source of truth for a course. The renderer turns this into DOM
 * (edit / play / export), and the SCORM packager serializes it. Everything is
 * plain data so it round-trips to a .mosaic JSON file with zero ceremony.
 *
 * Coordinates: every element's x/y/w/h are in STAGE units (the natural slide
 * size, default 960x540). The renderer scales the whole stage to fit — so the
 * model never needs to know about screen pixels or zoom.
 */
(function (global) {
  "use strict";

  var STAGE = { w: 960, h: 540 }; // 16:9 authoring stage

  function uid(prefix) {
    return (prefix || "id") + "-" +
      Date.now().toString(36) + "-" +
      Math.floor(Math.random() * 1e6).toString(36);
  }

  // --- Element factories ----------------------------------------------------
  function textElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "text",
      x: opts.x != null ? opts.x : 120,
      y: opts.y != null ? opts.y : 120,
      w: opts.w != null ? opts.w : 480,
      h: opts.h != null ? opts.h : 120,
      text: opts.text != null ? opts.text : "Double-click to edit",
      // Semantic role drives the published tag (h1/h2/h3/p) + screen-reader structure.
      role: opts.role || "body", // "heading1" | "heading2" | "heading3" | "body"
      fontFamily: opts.fontFamily || "system",
      fontSize: opts.fontSize != null ? opts.fontSize : 24,
      color: opts.color || "#1c2430",
      align: opts.align || "left",
      bold: opts.bold != null ? opts.bold : false,
      italic: opts.italic != null ? opts.italic : false,
      underline: opts.underline != null ? opts.underline : false,
      lineHeight: opts.lineHeight != null ? opts.lineHeight : 1.25,
      weight: opts.weight // legacy fallback; bold takes precedence when set
    };
  }

  function rectElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "rect",
      x: opts.x != null ? opts.x : 360,
      y: opts.y != null ? opts.y : 300,
      w: opts.w != null ? opts.w : 240,
      h: opts.h != null ? opts.h : 140,
      kind: opts.kind || "rect", // "rect" | "ellipse" | "line"
      fill: opts.fill || "#3b6ef5",
      radius: opts.radius != null ? opts.radius : 12,
      stroke: opts.stroke || "",          // border color ("" = none)
      strokeWidth: opts.strokeWidth != null ? opts.strokeWidth : 0,
      opacity: opts.opacity != null ? opts.opacity : 1
    };
  }

  function imageElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "image",
      x: opts.x != null ? opts.x : 200,
      y: opts.y != null ? opts.y : 120,
      w: opts.w != null ? opts.w : 400,
      h: opts.h != null ? opts.h : 300,
      src: opts.src || "",
      alt: opts.alt || "",
      // Decorative images are hidden from screen readers (alt="" + aria-hidden).
      decorative: opts.decorative != null ? opts.decorative : false,
      radius: opts.radius != null ? opts.radius : 0,
      opacity: opts.opacity != null ? opts.opacity : 1
    };
  }

  function videoElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "video",
      x: opts.x != null ? opts.x : 180,
      y: opts.y != null ? opts.y : 100,
      w: opts.w != null ? opts.w : 480,
      h: opts.h != null ? opts.h : 270,
      src: opts.src || "",            // mp4 data URL / direct URL, or a YouTube/Vimeo link (embedded)
      poster: opts.poster || "",
      controls: opts.controls != null ? opts.controls : true,
      autoplay: !!opts.autoplay,
      vloop: opts.vloop != null ? opts.vloop : false, // loop video PLAYBACK (distinct from anim `loop`)
      muted: opts.muted != null ? opts.muted : !!opts.autoplay, // autoplay needs muted
      alt: opts.alt || "",
      radius: opts.radius != null ? opts.radius : 8,
      opacity: opts.opacity != null ? opts.opacity : 1
    };
  }

  // Question kinds: "single" (one correct), "multiple" (select-all), "truefalse",
  // "fill" (text entry), "matching" (pair left↔right). Backward-compatible: a
  // question with no `kind` is treated as "single".
  function questionElement(opts) {
    opts = opts || {};
    var kind = opts.kind || "single";
    var q = {
      id: uid("el"),
      type: "question",
      kind: kind,
      x: opts.x != null ? opts.x : 120,
      y: opts.y != null ? opts.y : 120,
      w: opts.w != null ? opts.w : 720,
      h: opts.h != null ? opts.h : 320,
      prompt: opts.prompt != null ? opts.prompt : "Your question?",
      points: opts.points != null ? opts.points : 100,
      feedbackCorrect: opts.feedbackCorrect || "",      // optional custom feedback
      feedbackIncorrect: opts.feedbackIncorrect || "",
      fontFamily: opts.fontFamily || "system",
      fontSize: opts.fontSize != null ? opts.fontSize : 22,
      color: opts.color || "#1c2430"
    };
    if (kind === "fill") {
      q.answers = opts.answers || ["answer"];        // accepted answers (any match)
      q.caseSensitive = opts.caseSensitive != null ? opts.caseSensitive : false;
    } else if (kind === "matching") {
      q.pairs = opts.pairs || [{ left: "Term", right: "Definition" }, { left: "Term 2", right: "Definition 2" }];
    } else if (kind === "dragdrop") {
      q.zones = opts.zones || ["Category A", "Category B"];          // drop targets
      q.items = opts.items || [{ text: "Item 1", zone: 0 }, { text: "Item 2", zone: 1 }]; // zone = correct target
    } else if (kind === "truefalse") {
      q.choices = ["True", "False"];
      q.answerIndex = opts.answerIndex != null ? opts.answerIndex : 0;
    } else if (kind === "multiple") {
      q.choices = opts.choices || ["First choice", "Second choice", "Third choice"];
      q.answerIndices = opts.answerIndices || [0];    // every correct choice index
    } else { // single
      q.choices = opts.choices || ["First choice", "Second choice"];
      q.answerIndex = opts.answerIndex != null ? opts.answerIndex : 0;
    }
    return q;
  }

  // Interactive button — clickable in the published course. Its action drives
  // navigation (next/prev/goto), submitting/scoring the quiz, or opening a URL.
  function buttonElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "button",
      x: opts.x != null ? opts.x : 380,
      y: opts.y != null ? opts.y : 400,
      w: opts.w != null ? opts.w : 200,
      h: opts.h != null ? opts.h : 60,
      label: opts.label != null ? opts.label : "Button",
      variant: opts.variant || "filled",      // "filled" | "outline" | "text"
      fill: opts.fill || "#3b6ef5",            // accent (fill / outline / text color)
      color: opts.color || "#ffffff",          // label color when filled
      fontFamily: opts.fontFamily || "system",
      fontSize: opts.fontSize != null ? opts.fontSize : 20,
      radius: opts.radius != null ? opts.radius : 10,
      // action: { type: "next"|"prev"|"goto"|"submit"|"url", slide?:int, url?:str }
      action: opts.action || { type: "next" }
    };
  }

  // Audio narration — non-visual; lives only on the timeline and drives the
  // slide's natural length ("drop audio → the slide snaps to its length").
  function audioElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "audio",
      name: opts.name || "Narration",
      src: opts.src || "",
      start: opts.start != null ? opts.start : 0,
      duration: opts.duration != null ? opts.duration : 0
    };
  }

  // Icon — a recolorable vector glyph from the built-in content set.
  function iconElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "icon",
      x: opts.x != null ? opts.x : 420,
      y: opts.y != null ? opts.y : 180,
      w: opts.w != null ? opts.w : 120,
      h: opts.h != null ? opts.h : 120,
      icon: opts.icon || "check",
      color: opts.color || "#3b6ef5"
    };
  }

  // Quiz result — a placeholder the published player fills with the learner's
  // score and pass/fail. Lets authors design a result slide.
  function resultElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "result",
      x: opts.x != null ? opts.x : 230,
      y: opts.y != null ? opts.y : 220,
      w: opts.w != null ? opts.w : 500,
      h: opts.h != null ? opts.h : 110,
      fontFamily: opts.fontFamily || "system",
      fontSize: opts.fontSize != null ? opts.fontSize : 32,
      color: opts.color || "#1c2430"
    };
  }

  // Practice Mode — an AI role-play scenario the learner *does* (not click-next).
  // The runtime drives a chat against an in-character AI persona, then grades the
  // transcript against the author's rubric and sets a course variable (pass/fail),
  // so it composes with the existing variables + triggers engine.
  function roleplayElement(opts) {
    opts = opts || {};
    return {
      id: uid("el"),
      type: "roleplay",
      x: opts.x != null ? opts.x : 140,
      y: opts.y != null ? opts.y : 90,
      w: opts.w != null ? opts.w : 680,
      h: opts.h != null ? opts.h : 380,
      title: opts.title != null ? opts.title : "Practice: spot the scam",
      // The character the AI plays + the situation + what the learner must achieve.
      persona: opts.persona != null ? opts.persona : "“Dave from IT Support” — actually a scammer running a phishing attack over chat. Friendly but pushy; invents urgency.",
      scenario: opts.scenario != null ? opts.scenario : "The learner gets an unexpected IT chat claiming their account will be locked unless they verify their password.",
      objective: opts.objective != null ? opts.objective : "Refuse to share your password and call out the red flags.",
      // Plain-language rubric the grader judges against.
      rubric: opts.rubric != null ? opts.rubric : "PASS if the learner refuses to share credentials AND names at least two phishing red flags (urgency, suspicious link, identity not verified). Otherwise FAIL.",
      opening: opts.opening != null ? opts.opening : "Hi! Dave from IT here. We flagged unusual activity on your account — I just need you to confirm your password so I can stop it from locking. Can you send it over?",
      passVar: opts.passVar || "",   // course variable (boolean) set on completion
      maxTurns: opts.maxTurns != null ? opts.maxTurns : 8,
      accent: opts.accent || "#3b6ef5",
      fontFamily: opts.fontFamily || "system"
    };
  }

  function makeElement(type, opts) {
    var el;
    if (type === "result") el = resultElement(opts);
    else if (type === "roleplay") el = roleplayElement(opts);
    else if (type === "text") el = textElement(opts);
    else if (type === "rect") el = rectElement(opts);
    else if (type === "image") el = imageElement(opts);
    else if (type === "video") el = videoElement(opts);
    else if (type === "question") el = questionElement(opts);
    else if (type === "button") el = buttonElement(opts);
    else if (type === "audio") el = audioElement(opts);
    else if (type === "icon") el = iconElement(opts);
    else throw new Error("Unknown element type: " + type);

    // Timeline timing (seconds). start = when it appears; duration = how long
    // it stays. duration === null means "the whole slide" (the common case).
    if (el.start == null) el.start = (opts && opts.start != null) ? opts.start : 0;
    if (!("duration" in el)) el.duration = (opts && opts.duration != null) ? opts.duration : null;
    // Interactivity (non-audio): `hidden` = starts hidden until a trigger reveals
    // it; `triggers` = [{ event, action, target, slide }] click interactions.
    if (type !== "audio") {
      if (el.hidden == null) el.hidden = !!(opts && opts.hidden);
      if (!el.triggers) el.triggers = (opts && opts.triggers) ? opts.triggers : [];
      // Entrance animation: type id (see Renderer.ANIM_TYPES) + duration (ms),
      // played whenever the element appears (timeline time or a trigger reveal).
      if (el.animIn == null) el.animIn = (opts && opts.animIn) ? opts.animIn : "none";
      if (el.animOut == null) el.animOut = (opts && opts.animOut) ? opts.animOut : "none";
      if (el.animMs == null) el.animMs = (opts && opts.animMs != null) ? opts.animMs : 450;
      if (el.animEase == null) el.animEase = (opts && opts.animEase) ? opts.animEase : "smooth";
      if (el.animDelay == null) el.animDelay = (opts && opts.animDelay != null) ? opts.animDelay : 0;
      if (el.loop == null) el.loop = (opts && opts.loop) ? opts.loop : "none";
    }
    // Visual states: optional per-state overrides (color/fill + opacity), applied
    // at runtime. { hover|selected|visited|disabled: { fill?, color?, opacity? } }
    if (/^(text|rect|image|button)$/.test(type)) {
      if (!el.states) el.states = (opts && opts.states) ? opts.states : {};
    }
    return el;
  }

  // --- Slide + document factories ------------------------------------------
  function makeSlide(opts) {
    opts = opts || {};
    return {
      id: uid("slide"),
      name: opts.name || "Untitled slide",
      background: opts.background || "#ffffff",
      duration: opts.duration != null ? opts.duration : 5, // seconds; snaps to audio
      lockNext: opts.lockNext != null ? opts.lockNext : false, // force the on-slide button
      transition: opts.transition || "none", // how the slide animates in (fade/push/dissolve)
      elements: opts.elements || []
    };
  }

  function makeCourse(opts) {
    opts = opts || {};
    return {
      schema: 1,
      id: uid("course"),
      title: opts.title || "Untitled course",
      lang: opts.lang || "en", // document language — required for screen readers
      passingScore: opts.passingScore != null ? opts.passingScore : 70,
      // Gated navigation: require every question answered before the player's
      // Next/Finish is enabled. Off by default (free navigation).
      requireAnswers: opts.requireAnswers != null ? opts.requireAnswers : false,
      // Course variables: [{ name, type:"number"|"text"|"boolean", value }].
      // Triggers can set them + branch on them; text shows them via {name} tokens.
      variables: opts.variables || [],
      // Brand kit: set once, reused by templates, new elements, and quick-swatches.
      brand: opts.brand || {
        accent: "#3b6ef5", ink: "#1c2430", body: "#5b6675", bg: "#ffffff",
        headingFont: "system", bodyFont: "system",
        palette: ["#1c2430", "#3b6ef5", "#1f9d57", "#d69e2e", "#d23b3b", "#5b6675", "#ffffff"]
      },
      stage: opts.stage || { w: STAGE.w, h: STAGE.h },
      slides: opts.slides || [makeSlide({ name: "Slide 1" })]
    };
  }

  // --- (De)serialization ----------------------------------------------------
  function serialize(course) {
    return JSON.stringify(course, null, 2);
  }
  function deserialize(json) {
    var data = typeof json === "string" ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.slides)) throw new Error("Not a Mosaic course");
    // Backfill defaults so courses authored before newer features still load cleanly.
    if (data.lang == null) data.lang = "en";
    if (data.passingScore == null) data.passingScore = 70;
    if (data.requireAnswers == null) data.requireAnswers = false;
    if (!data.stage) data.stage = { w: STAGE.w, h: STAGE.h };
    if (!data.brand) data.brand = makeCourse().brand;
    data.slides.forEach(function (s) {
      if (s.duration == null) s.duration = 5;
      if (s.background == null) s.background = "#ffffff";
      if (s.lockNext == null) s.lockNext = false;
      if (!Array.isArray(s.elements)) s.elements = [];
      s.elements.forEach(function (e) {
        if (e.start == null) e.start = 0;
        if (!("duration" in e)) e.duration = null;
        if (e.type === "question" && !e.kind) e.kind = "single"; // pre-kind courses
        if (e.type !== "audio") { // pre-triggers courses
          if (e.hidden == null) e.hidden = false;
          if (!Array.isArray(e.triggers)) e.triggers = [];
        }
        if (/^(text|rect|image|button)$/.test(e.type) && !e.states) e.states = {}; // pre-states courses
      });
    });
    return data;
  }

  global.MosaicModel = {
    STAGE: STAGE,
    uid: uid,
    makeElement: makeElement,
    makeSlide: makeSlide,
    makeCourse: makeCourse,
    serialize: serialize,
    deserialize: deserialize
  };
})(window);
