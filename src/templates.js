/*
 * Mosaic — starter templates
 *
 * Beautiful, opinionated starting points (the "blank page is the enemy of fun"
 * fix, and the anti-AI-slop default). Each template builds a slide from the
 * course's BRAND kit, so new slides stay on-brand and consistent.
 *
 * Layout follows PowerPoint/Keynote conventions: content-slide titles sit
 * top-left, with a consistent margin and a restrained type scale.
 */
(function (global) {
  "use strict";

  var Model = global.MosaicModel;

  // --- shared layout (960×540 stage) ---------------------------------------
  var SW = 960, M = 56, CW = SW - M * 2;          // margin + content width (848)
  var IMG_X = 548, TEXT_W = 440;                  // text-left / image-right split
  var SZ = {                                      // type scale (PowerPoint/Keynote-ish)
    big: 46,        // title-slide & section headlines
    title: 28,      // content-slide titles (top-left)
    subtitle: 20,   // title-slide subtitle
    body: 17,       // paragraph copy
    bullet: 18,     // list items
    stepNum: 42, stepTitle: 19
  };

  function text(b, o) {
    return Model.makeElement("text", {
      x: o.x, y: o.y, w: o.w, h: o.h, text: o.text,
      role: o.role || "body",
      fontSize: o.fontSize, align: o.align || "left",
      fontFamily: o.heading ? b.headingFont : b.bodyFont,
      color: o.color || (o.heading ? b.ink : b.body),
      bold: !!o.heading
    });
  }
  // A standard top-left content-slide title.
  function title(b, t, o) {
    o = o || {};
    return text(b, {
      x: o.x != null ? o.x : M, y: o.y != null ? o.y : 48,
      w: o.w != null ? o.w : CW, h: o.h || 56, text: t,
      role: "heading1", fontSize: o.fontSize || SZ.title,
      align: o.align || "left", heading: true, color: o.color
    });
  }
  function img(o) { return Model.makeElement("image", { x: o.x, y: o.y, w: o.w, h: o.h, alt: "" }); }
  function question(b, o) {
    return Model.makeElement("question", {
      x: o.x, y: o.y, w: o.w, h: o.h,
      prompt: o.prompt, choices: o.choices, answerIndex: 0, points: 100
    });
  }
  function btn(b, o) {
    return Model.makeElement("button", {
      x: o.x, y: o.y, w: o.w, h: o.h, label: o.label,
      variant: o.variant || "filled",
      fill: o.fill || b.accent, color: o.color || "#ffffff",
      fontFamily: b.headingFont, action: o.action || { type: "next" }
    });
  }
  function slide(name, bg, els) { return Model.makeSlide({ name: name, background: bg, elements: els }); }

  var TEMPLATES = [
    {
      id: "blank", name: "Blank",
      build: function (b) { return slide("Blank", b.bg, []); }
    },
    {
      id: "title", name: "Title",
      build: function (b) {
        // Title slide: centered headline + subtitle (cover-page convention).
        return slide("Title", b.bg, [
          text(b, { x: 80, y: 188, w: 800, h: 96, text: "Course title", role: "heading1", fontSize: SZ.big, align: "center", heading: true }),
          text(b, { x: 160, y: 300, w: 640, h: 50, text: "A short subtitle", role: "body", fontSize: SZ.subtitle, align: "center" })
        ]);
      }
    },
    {
      id: "titleBody", name: "Heading + body",
      build: function (b) {
        return slide("Heading + body", b.bg, [
          title(b, "Heading"),
          text(b, { x: M, y: 128, w: CW, h: 340, text: "Body text — explain the idea here.", role: "body", fontSize: SZ.body })
        ]);
      }
    },
    {
      id: "titleBodyImage", name: "Heading + body + image",
      build: function (b) {
        return slide("Heading + body + image", b.bg, [
          title(b, "Heading"),
          text(b, { x: M, y: 128, w: TEXT_W, h: 340, text: "Body text — explain the idea here.", role: "body", fontSize: SZ.body }),
          img({ x: IMG_X, y: 128, w: 336, h: 280 })
        ]);
      }
    },
    {
      id: "objectives", name: "Learning objectives",
      build: function (b) {
        function bl(y, n) { return text(b, { x: M + 16, y: y, w: 424, h: 38, text: "•  " + n, role: "body", fontSize: SZ.bullet }); }
        return slide("Learning objectives", b.bg, [
          title(b, "Learning objectives"),
          text(b, { x: M, y: 118, w: TEXT_W, h: 40, text: "In this course, you'll learn how to:", role: "body", fontSize: SZ.body }),
          bl(168, "Objective one"),
          bl(208, "Objective two"),
          bl(248, "Objective three"),
          bl(288, "Objective four"),
          bl(328, "Objective five"),
          img({ x: IMG_X, y: 118, w: 336, h: 300 })
        ]);
      }
    },
    {
      id: "titleBullets", name: "Title + bullets",
      build: function (b) {
        function bl(y, t) { return text(b, { x: M + 16, y: y, w: CW - 16, h: 46, text: "•  " + t, role: "body", fontSize: SZ.bullet }); }
        return slide("Title + bullets", b.bg, [
          title(b, "Heading"),
          bl(132, "First point"),
          bl(186, "Second point"),
          bl(240, "Third point"),
          bl(294, "Fourth point")
        ]);
      }
    },
    {
      id: "steps", name: "Steps / process",
      build: function (b) {
        var cols = [56, 362, 668], nums = ["1", "2", "3"], titles = ["Step one", "Step two", "Step three"];
        var els = [title(b, "How it works")];
        cols.forEach(function (cx, i) {
          els.push(text(b, { x: cx, y: 150, w: 90, h: 62, text: nums[i], role: "heading1", fontSize: SZ.stepNum, heading: true, color: b.accent }));
          els.push(text(b, { x: cx, y: 222, w: 236, h: 38, text: titles[i], role: "heading2", fontSize: SZ.stepTitle, heading: true }));
          els.push(text(b, { x: cx, y: 266, w: 236, h: 160, text: "Describe this step here.", role: "body", fontSize: 16 }));
        });
        return slide("Steps / process", b.bg, els);
      }
    },
    {
      id: "section", name: "Section header",
      build: function (b) {
        return slide("Section", b.accent, [
          text(b, { x: 80, y: 226, w: 800, h: 88, text: "Section", role: "heading1", fontSize: SZ.big, align: "center", heading: true, color: "#ffffff" })
        ]);
      }
    },
    {
      id: "twoCol", name: "Two column",
      build: function (b) {
        return slide("Two column", b.bg, [
          title(b, "Heading"),
          text(b, { x: M, y: 128, w: 400, h: 320, text: "Left column…", role: "body", fontSize: SZ.body }),
          text(b, { x: 504, y: 128, w: 400, h: 320, text: "Right column…", role: "body", fontSize: SZ.body })
        ]);
      }
    },
    {
      id: "scenario", name: "Scenario",
      build: function (b) {
        return slide("Scenario", b.bg, [
          title(b, "Scenario"),
          text(b, { x: M, y: 128, w: TEXT_W, h: 200, text: "Describe the situation the learner is facing, then ask them to choose what to do.", role: "body", fontSize: SZ.body }),
          img({ x: IMG_X, y: 128, w: 336, h: 210 }),
          btn(b, { x: M, y: 400, w: 236, h: 54, label: "Choice A", variant: "filled" }),
          btn(b, { x: 308, y: 400, w: 236, h: 54, label: "Choice B", variant: "outline" })
        ]);
      }
    },
    {
      id: "imageCaption", name: "Image + caption",
      build: function (b) {
        return slide("Image + caption", b.bg, [
          img({ x: 280, y: 72, w: 400, h: 300 }),
          text(b, { x: 160, y: 392, w: 640, h: 50, text: "Caption", role: "body", fontSize: SZ.body, align: "center" })
        ]);
      }
    },
    {
      id: "quiz", name: "Knowledge check",
      build: function (b) {
        return slide("Knowledge check", b.bg, [
          title(b, "Knowledge check"),
          question(b, { x: M, y: 128, w: CW, h: 340, prompt: "Your question?", choices: ["Option A", "Option B", "Option C"] })
        ]);
      }
    },
    {
      id: "summary", name: "Key takeaways",
      build: function (b) {
        function bl(y, t) { return text(b, { x: M + 16, y: y, w: 424, h: 46, text: "•  " + t, role: "body", fontSize: SZ.bullet }); }
        return slide("Key takeaways", b.bg, [
          title(b, "Key takeaways"),
          bl(140, "The first thing to remember"),
          bl(194, "The second thing"),
          bl(248, "The third thing"),
          img({ x: IMG_X, y: 128, w: 336, h: 280 })
        ]);
      }
    },
    {
      id: "complete", name: "Course complete",
      build: function (b) {
        return slide("Course complete", b.bg, [
          text(b, { x: 120, y: 120, w: 720, h: 80, text: "You're all done!", role: "heading1", fontSize: 52, align: "center", heading: true }),
          Model.makeElement("result", { x: 200, y: 220, w: 560, h: 70, color: b.ink || "#1c2430" }),
          btn(b, { x: 380, y: 360, w: 200, h: 60, label: "Submit", action: { type: "submit" } })
        ]);
      }
    }
  ];

  global.MosaicTemplates = {
    list: TEMPLATES,
    build: function (id, brand) {
      var t = TEMPLATES.filter(function (x) { return x.id === id; })[0] || TEMPLATES[0];
      return t.build(brand);
    }
  };
})(window);
