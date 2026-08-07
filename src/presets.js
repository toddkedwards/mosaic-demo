/*
 * Mosaic — interaction presets
 *
 * The bread-and-butter e-learning interactions (tabs, accordion, click-to-
 * reveal, hotspots, branching), pre-assembled from ORDINARY elements + the
 * existing trigger vocabulary. Nothing here adds runtime: a preset is just
 * shapes/text with show/hide/setVar/goto triggers already wired, so it plays
 * in the editor preview, the published player, and every export unchanged —
 * and the author can restyle or rewire every piece like anything hand-made.
 *
 * build(kind, brand, slideIndex, slideCount) →
 *   { elements: [...] }                    added to the CURRENT slide, or
 *   { slides: [...], variables: [...] }    spliced in after it (branching).
 */
(function (global) {
  "use strict";

  var Model = global.MosaicModel;

  function T(o) { return Model.makeElement("text", o); }
  function R(o) { return Model.makeElement("rect", o); }
  // Neutral surface colors that read correctly on the brand's background —
  // light card fills on light packs, dark card fills on dark packs (Slate,
  // Midnight). Shared with the Door 2 builder via MosaicPresets.surfaces.
  function isDark(hex) {
    hex = String(hex || "#ffffff").replace("#", "");
    if (hex.length === 3) hex = hex.replace(/./g, function (c) { return c + c; });
    var r = parseInt(hex.slice(0, 2), 16) || 0, g = parseInt(hex.slice(2, 4), 16) || 0, b = parseInt(hex.slice(4, 6), 16) || 0;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128;
  }
  function surfaces(brand) {
    return isDark((brand || {}).bg)
      ? { head: "#2a3240", panel: "#232b36", hint: "#8b94a3" }
      : { head: "#eef1f7", panel: "#f6f8fc", hint: "#9aa3b2" };
  }
  // Duplicate one trigger list for several source elements (rect + its label
  // both need the wiring, since the label sits on top and takes the click).
  function wire(els, triggers) {
    els.forEach(function (el) {
      el.triggers = triggers.map(function (t) { return JSON.parse(JSON.stringify(t)); });
    });
  }
  function show(id) { return { event: "click", action: "show", target: id }; }
  function hide(id) { return { event: "click", action: "hide", target: id }; }
  function toggle(id) { return { event: "click", action: "toggle", target: id }; }

  // --- Tabs: 3 headers, one panel visible at a time, accent underline marks the active tab.
  function tabs(brand) {
    var S = surfaces(brand);
    var accent = brand.accent || "#3b6ef5", ink = brand.ink || "#1c2430", body = brand.body || "#5b6675";
    var els = [], groups = [];
    for (var i = 0; i < 3; i++) {
      var x = 60 + i * 190;
      var head = R({ x: x, y: 140, w: 180, h: 44, fill: S.head, radius: 10 });
      var label = T({ text: "Tab " + (i + 1), x: x, y: 150, w: 180, h: 26, fontSize: 17, bold: true, align: "center", color: ink });
      var under = R({ x: x, y: 186, w: 180, h: 4, fill: accent, radius: 2 });
      var panel = R({ x: 60, y: 206, w: 840, h: 270, fill: S.panel, radius: 14 });
      var ptext = T({ text: "Content for tab " + (i + 1) + ". Double-click to edit.", x: 92, y: 236, w: 776, h: 210, fontSize: 19, color: body, lineHeight: 1.5 });
      if (i > 0) { under.hidden = true; panel.hidden = true; ptext.hidden = true; }
      els.push(head, label, under, panel, ptext);
      groups.push({ head: head, label: label, under: under, panel: panel, ptext: ptext });
    }
    groups.forEach(function (g, i) {
      var trigs = [];
      groups.forEach(function (o, j) {
        var f = (j === i) ? show : hide;
        trigs.push(f(o.under.id), f(o.panel.id), f(o.ptext.id));
      });
      wire([g.head, g.label], trigs);
    });
    return { elements: els };
  }

  // --- Accordion: 3 headers, click toggles the panel reserved beneath each.
  function accordion(brand) {
    var S = surfaces(brand);
    var accent = brand.accent || "#3b6ef5", ink = brand.ink || "#1c2430", body = brand.body || "#5b6675";
    var els = [];
    for (var i = 0; i < 3; i++) {
      var y = 140 + i * 126;
      var head = R({ x: 60, y: y, w: 840, h: 48, fill: S.head, radius: 10 });
      var label = T({ text: "Section " + (i + 1) + "  —  click to expand", x: 88, y: y + 12, w: 700, h: 26, fontSize: 17, bold: true, color: ink });
      var chev = T({ text: "▾", x: 856, y: y + 12, w: 30, h: 26, fontSize: 17, color: accent });
      var panel = R({ x: 60, y: y + 54, w: 840, h: 62, fill: S.panel, radius: 10 }); panel.hidden = true;
      var ptext = T({ text: "Details for section " + (i + 1) + ". Double-click to edit.", x: 88, y: y + 66, w: 776, h: 40, fontSize: 16, color: body, lineHeight: 1.4 }); ptext.hidden = true;
      wire([head, label, chev], [toggle(panel.id), toggle(ptext.id)]);
      els.push(head, label, chev, panel, ptext);
    }
    return { elements: els };
  }

  // --- Click-to-reveal: 3 cards; the cover sits on top and hides itself on click.
  function reveal(brand) {
    var S = surfaces(brand);
    var accent = brand.accent || "#3b6ef5", ink = brand.ink || "#1c2430";
    var els = [];
    for (var i = 0; i < 3; i++) {
      var x = 60 + i * 296;
      var under = R({ x: x, y: 170, w: 264, h: 240, fill: S.panel, radius: 16 });
      var utext = T({ text: "Hidden fact " + (i + 1) + " — double-click to edit.", x: x + 22, y: 250, w: 220, h: 120, fontSize: 17, align: "center", color: ink, lineHeight: 1.45 });
      var cover = R({ x: x, y: 170, w: 264, h: 240, fill: accent, radius: 16 });
      var clabel = T({ text: "Card " + (i + 1) + "\n\nClick to reveal", x: x + 22, y: 240, w: 220, h: 110, fontSize: 18, bold: true, align: "center", color: "#ffffff", lineHeight: 1.4 });
      wire([cover, clabel], [hide(cover.id), hide(clabel.id)]);
      els.push(under, utext, cover, clabel); // order = z-order: cover on top
    }
    return { elements: els };
  }

  // --- Hotspots: numbered markers over an image area; each shows its info card.
  function hotspots(brand) {
    var S = surfaces(brand);
    var accent = brand.accent || "#3b6ef5", ink = brand.ink || "#1c2430", body = brand.body || "#5b6675";
    var els = [];
    var img = R({ x: 60, y: 140, w: 520, h: 340, fill: S.head, radius: 16 });
    var hint = T({ text: "Replace with your image", x: 60, y: 296, w: 520, h: 30, fontSize: 15, align: "center", color: S.hint });
    els.push(img, hint);
    var spots = [{ x: 150, y: 200 }, { x: 330, y: 300 }, { x: 470, y: 400 }];
    var cards = [];
    spots.forEach(function (s, i) {
      var card = R({ x: 610, y: 140 + i * 118, w: 290, h: 104, fill: S.panel, radius: 12 }); card.hidden = true;
      var title = T({ text: "Hotspot " + (i + 1), x: 630, y: 152 + i * 118, w: 250, h: 24, fontSize: 15, bold: true, color: ink }); title.hidden = true;
      var bodyT = T({ text: "What this spot means — double-click to edit.", x: 630, y: 178 + i * 118, w: 250, h: 56, fontSize: 14, color: body, lineHeight: 1.4 }); bodyT.hidden = true;
      cards.push({ card: card, title: title, body: bodyT });
    });
    spots.forEach(function (s, i) {
      var dot = R({ x: s.x, y: s.y, w: 36, h: 36, fill: accent, radius: 999 });
      var num = T({ text: String(i + 1), x: s.x, y: s.y + 6, w: 36, h: 24, fontSize: 16, bold: true, align: "center", color: "#ffffff" });
      var trigs = [];
      cards.forEach(function (c, j) {
        var f = (j === i) ? show : hide;
        trigs.push(f(c.card.id), f(c.title.id), f(c.body.id));
      });
      wire([dot, num], trigs);
      els.push(dot, num);
    });
    cards.forEach(function (c) { els.push(c.card, c.title, c.body); });
    return { elements: els };
  }

  // --- Branching scenario: a decision slide + two outcome slides, wired with
  // goto + a `choice` variable. Spliced in AFTER the current slide.
  function branching(brand, slideIndex) {
    var S = surfaces(brand);
    var accent = brand.accent || "#3b6ef5", ink = brand.ink || "#1c2430", body = brand.body || "#5b6675";
    var at = slideIndex + 1;              // decision lands here
    var idxDecision = at, idxA = at + 1, idxB = at + 2, idxAfter = at + 3;

    function choiceCard(x, letter, text, gotoIdx, gotoId) {
      var card = R({ x: x, y: 300, w: 400, h: 150, fill: S.panel, radius: 16, stroke: accent, strokeWidth: 1 });
      var label = T({ text: text, x: x + 24, y: 330, w: 352, h: 96, fontSize: 18, color: ink, lineHeight: 1.4 });
      var trigs = [
        { event: "click", action: "setVar", varName: "choice", varOp: "set", varValue: letter },
        { event: "click", action: "goto", slide: gotoIdx, slideId: gotoId } // id survives reordering
      ];
      wire([card, label], trigs);
      return [card, label];
    }
    var decision = Model.makeSlide({ name: "Decision", elements: [
      T({ text: "What do you do?", role: "heading1", x: 60, y: 60, w: 840, h: 56, fontSize: 32, bold: true, color: ink }),
      T({ text: "Set the scene here: the situation the learner faces, with enough tension that the choice matters. Double-click to edit.", x: 60, y: 140, w: 840, h: 120, fontSize: 20, color: body, lineHeight: 1.5 })
    ].concat(choiceCard(60, "A", "Option A — the first plausible response.", idxA), choiceCard(500, "B", "Option B — the other plausible response.", idxB)) });

    function outcome(name, verdict, color, fill) {
      var back = R({ x: 60, y: 300, w: 240, h: 56, fill: S.head, radius: 12 });
      var backT = T({ text: "↩  Try again", x: 60, y: 314, w: 240, h: 28, fontSize: 17, bold: true, align: "center", color: ink });
      wire([back, backT], [{ event: "click", action: "goto", slide: idxDecision }]);
      var cont = R({ x: 330, y: 300, w: 240, h: 56, fill: accent, radius: 12 });
      var contT = T({ text: "Continue  →", x: 330, y: 314, w: 240, h: 28, fontSize: 17, bold: true, align: "center", color: "#ffffff" });
      wire([cont, contT], [{ event: "click", action: "goto", slide: idxAfter }]);
      return Model.makeSlide({ name: name, elements: [
        R({ x: 60, y: 60, w: 840, h: 200, fill: fill, radius: 16 }),
        T({ text: verdict, role: "heading1", x: 92, y: 88, w: 776, h: 44, fontSize: 26, bold: true, color: color }),
        T({ text: "What happens as a result of this choice, and why — the teaching moment. Double-click to edit.", x: 92, y: 140, w: 776, h: 100, fontSize: 18, color: "#1c2430", lineHeight: 1.5 }),
        back, backT, cont, contT
      ] });
    }
    var outA = outcome("Outcome A", "You chose A", "#177245", "#e7f7ee");
    var outB = outcome("Outcome B", "You chose B", "#a23a2e", "#fde8e6");
    // Stamp stable slide IDs onto every in-block goto (the ids only exist now).
    // "Continue" targets the slide AFTER the block, which may not exist yet —
    // it stays index-based by design.
    var byIdx = {}; byIdx[idxDecision] = decision.id; byIdx[idxA] = outA.id; byIdx[idxB] = outB.id;
    [decision, outA, outB].forEach(function (sl) {
      sl.elements.forEach(function (el) {
        (el.triggers || []).forEach(function (t) {
          if (t.action === "goto" && byIdx[t.slide] != null) t.slideId = byIdx[t.slide];
        });
      });
    });
    return {
      slides: [decision, outA, outB],
      variables: [{ name: "choice", type: "text", value: "" }]
    };
  }

  var KINDS = {
    tabs: tabs,
    accordion: accordion,
    reveal: reveal,
    hotspots: hotspots,
    branching: branching
  };

  global.MosaicPresets = {
    surfaces: surfaces,
    build: function (kind, brand, slideIndex, slideCount) {
      var fn = KINDS[kind];
      return fn ? fn(brand || {}, slideIndex || 0, slideCount || 1) : null;
    }
  };
})(window);
