/*
 * Mosaic — accessibility utilities
 *
 * Accessibility is a Mosaic moat, not an afterthought (WCAG/508 is the named
 * gap in AI-generated e-learning). These helpers power the live audit in the
 * editor and the same standards the published output is held to:
 *   - WCAG contrast ratios
 *   - a course audit: missing alt text, low contrast, missing headings/titles
 *
 * Reading order = element array order (= DOM order = screen-reader order), so
 * the order you stack elements is the order they're announced.
 */
(function (global) {
  "use strict";

  function hexToRgb(hex) {
    if (!hex) return null;
    var h = String(hex).trim().replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function channel(c) {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function luminance(rgb) {
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  /** WCAG contrast ratio between two hex colors (1–21), or null if unparseable. */
  function contrastRatio(fg, bg) {
    var a = hexToRgb(fg), b = hexToRgb(bg);
    if (!a || !b) return null;
    var l1 = luminance(a), l2 = luminance(b);
    var hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Large text per WCAG: >=24px, or >=18.66px bold (weight >=700). */
  function isLargeText(el) {
    var size = el.fontSize || 0;
    var bold = parseInt(el.weight, 10) >= 700;
    return size >= 24 || (size >= 18.66 && bold);
  }

  /** Minimum AA ratio for an element's text. */
  function aaThreshold(el) { return isLargeText(el) ? 3.0 : 4.5; }

  /**
   * Audit a whole course. Returns [{ slideIndex, slideName, elId, severity, message }].
   * severity: "error" (fails a real WCAG/standards need) | "warn" (likely problem).
   */
  function auditCourse(course) {
    var issues = [];
    function add(slideIndex, slideName, elId, severity, message) {
      issues.push({ slideIndex: slideIndex, slideName: slideName, elId: elId, severity: severity, message: message });
    }

    if (!course.lang || !String(course.lang).trim()) {
      add(-1, null, null, "error", "Course is missing a language (needed for screen readers).");
    }

    course.slides.forEach(function (slide, i) {
      var name = slide.name || ("Slide " + (i + 1));
      if (!slide.name || !slide.name.trim()) {
        add(i, name, null, "warn", "Slide has no title (used as its accessible name).");
      }
      var texts = slide.elements.filter(function (e) { return e.type === "text"; });
      var hasHeading = texts.some(function (e) { return /^heading/.test(e.role || ""); });
      if (texts.length && !hasHeading) {
        add(i, name, null, "warn", "Slide has text but no heading — screen-reader users can't scan it.");
      }

      slide.elements.forEach(function (el) {
        if (el.type === "text") {
          if (!el.text || !el.text.trim()) {
            add(i, name, el.id, "warn", "Empty text element.");
            return;
          }
          var ratio = contrastRatio(el.color, slide.background || "#ffffff");
          if (ratio != null && ratio < aaThreshold(el)) {
            add(i, name, el.id, "error",
              "Low contrast (" + ratio.toFixed(2) + ":1, needs " + aaThreshold(el) + ":1): “" +
              el.text.slice(0, 32) + "”");
          }
        } else if (el.type === "image") {
          if (!el.decorative && (!el.alt || !el.alt.trim())) {
            add(i, name, el.id, "error", "Image missing alt text (mark decorative if it conveys nothing).");
          }
        } else if (el.type === "question") {
          if (!el.prompt || !el.prompt.trim()) {
            add(i, name, el.id, "warn", "Question has no prompt.");
          }
          var qkind = el.kind || "single";
          if (qkind === "fill") {
            var answers = (el.answers || []).filter(function (a) { return a && a.trim(); });
            if (!answers.length) add(i, name, el.id, "error", "Fill-in-the-blank needs at least one accepted answer.");
          } else if (qkind === "matching") {
            var goodPairs = (el.pairs || []).filter(function (p) { return p && (p.left || "").trim() && (p.right || "").trim(); });
            if (goodPairs.length < 2) add(i, name, el.id, "error", "Matching needs at least two complete pairs.");
          } else {
            var filled = (el.choices || []).filter(function (c) { return c && c.trim(); });
            if (filled.length < 2) {
              add(i, name, el.id, "error", "Question needs at least two non-empty choices.");
            }
            if (qkind === "multiple") {
              if (!(el.answerIndices || []).length) add(i, name, el.id, "error", "Multiple-response question has no correct answers marked.");
            } else if (el.answerIndex == null || el.answerIndex < 0 || el.answerIndex >= (el.choices || []).length) {
              add(i, name, el.id, "error", "Question has no valid correct answer marked.");
            }
          }
        }
      });
    });

    return issues;
  }

  global.MosaicA11y = {
    contrastRatio: contrastRatio,
    isLargeText: isLargeText,
    aaThreshold: aaThreshold,
    auditCourse: auditCourse
  };
})(window);
