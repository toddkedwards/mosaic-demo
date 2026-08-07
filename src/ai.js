/*
 * Mosaic — AI layer (Practice Mode brain)
 *
 * One tiny surface: MosaicAI.chat(opts) -> Promise<string>.
 *
 *   opts.mode     "chat"  → in-character role-play reply (returns plain text)
 *                 "grade" → evaluate transcript vs rubric (returns JSON string
 *                            {"pass":bool,"feedback":"..."} )
 *   opts.system   system prompt
 *   opts.messages [{role:"user"|"assistant", content}]   (the transcript)
 *
 * Real calls go to the Claude Messages API (model claude-opus-4-8) when a key is
 * present — window.MosaicConfig.anthropicKey or localStorage "mosaic.aiKey".
 * In regulated/offline contexts this is where an on-device model would slot in
 * (the moat). With NO key, a deterministic MOCK runs so the prototype is fully
 * demoable offline — and so previews verify the whole flow without a network.
 */
(function (global) {
  "use strict";

  var MODEL = "claude-opus-4-8";

  function apiKey() {
    if (global.MosaicConfig && global.MosaicConfig.anthropicKey) return global.MosaicConfig.anthropicKey;
    try { return global.localStorage && localStorage.getItem("mosaic.aiKey"); } catch (e) { return null; }
  }
  function usingMock() { return !apiKey(); }

  // --- real Claude call (browser-direct; for the prototype only) -------------
  function callClaude(opts) {
    var body = {
      model: MODEL,
      max_tokens: opts.mode === "generate" ? 2400 : (opts.mode === "grade" ? 400 : 320),
      system: opts.system || "",
      messages: (opts.messages || []).map(function (m) {
        return { role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) };
      })
    };
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey(),
        "anthropic-version": "2023-06-01",
        // Required for browser-origin requests. Production should proxy server-side
        // (or run on-device) so the key is never shipped to the client.
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error("AI " + r.status + ": " + t); });
      return r.json();
    }).then(function (data) {
      var blocks = (data && data.content) || [];
      return blocks.filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("").trim();
    });
  }

  // Cheap validity check for a key: a 1-token request against the fast model.
  // Resolves {ok:true} / {ok:false, message} — network failures reject.
  function verifyKey(candidate) {
    var key = (candidate || apiKey() || "").trim();
    if (!key) return Promise.resolve({ ok: false, message: "No key entered." });
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
    }).then(function (r) {
      if (r.ok) return { ok: true };
      if (r.status === 401) return { ok: false, message: "That key was rejected (401). Check it in the Anthropic Console." };
      return r.json().catch(function () { return {}; }).then(function (j) {
        var m = (j && j.error && j.error.message) || ("HTTP " + r.status);
        return { ok: false, message: m };
      });
    });
  }

  // --- deterministic mock (no key) -------------------------------------------
  // A believable, responsive persona so the offline demo feels real for ANY
  // scenario (not just phishing), plus a transparent heuristic grader so the
  // pass/fail is earned. With a real key, Claude role-plays + grades for real;
  // the mock is only the offline stand-in.
  function lastUser(messages) {
    for (var i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return String(messages[i].content || "");
    return "";
  }
  function isPhishing(sys) { return /phish|password|credential|scam|verify your|IT support|log\s?in/i.test(sys || ""); }
  // Did the learner's last/whole turn show the "good handling" signals?
  var RE_CONCILIATORY = /(sorry|apolog|understand|hear you|hear how|i get it|that'?s fair|frustrat|let me (fix|help|sort|take)|i'?ll (fix|help|sort|make|get)|i will|right away|replace|refund|make (it|this) right|here'?s what|i can (do|help|offer)|take care of)/i;
  var RE_DEFENSIVE = /(calm down|relax|not my fault|your fault|that'?s our policy|policy is|nothing i can do|you should have|you need to|stop (shouting|yelling))/i;

  var MOCK_PHISH = [
    "I really need this sorted now — your account locks in 5 minutes if you don't verify.",
    "Look, I'm on your side. Just confirm your password so I can stop the lockout.",
    "This is standard IT procedure — everyone on your team already did it today.",
    "Fine, if you won't share it, at least click this link to re-authenticate: http://it-verify-now.example/login",
    "I don't have time to escalate this — it has to be you, right now. Last chance."
  ];
  var MOCK_PRESSURE = [ // generic difficult-person escalation (angry customer, etc.)
    "That's not good enough. I need this handled now.",
    "Are you even listening to me? This keeps happening.",
    "I've heard that line before. What are you actually going to DO about it?",
    "I don't have time for the runaround. This is ridiculous.",
    "Unbelievable. So what happens now?"
  ];
  var MOCK_SOFTEN = [ // de-escalates when the learner handles it well
    "…Okay. I appreciate you actually hearing me out.",
    "Alright — that's the first time someone's taken this seriously. Thank you.",
    "Fine. If you can really make this right, I'm listening."
  ];

  function mockChat(opts) {
    var messages = opts.messages || [];
    var userTurns = messages.filter(function (m) { return m.role === "user"; }).length;
    var conciliatory = userTurns > 0 && RE_CONCILIATORY.test(lastUser(messages));
    if (isPhishing(opts.system)) { // a scammer keeps pushing regardless — stay in character
      return Promise.resolve(MOCK_PHISH[Math.min(userTurns, MOCK_PHISH.length) - 1] || MOCK_PHISH[0]);
    }
    if (conciliatory) return Promise.resolve(MOCK_SOFTEN[Math.min(userTurns - 1, MOCK_SOFTEN.length - 1)] || MOCK_SOFTEN[0]);
    return Promise.resolve(MOCK_PRESSURE[Math.min(userTurns, MOCK_PRESSURE.length) - 1] || MOCK_PRESSURE[0]);
  }

  function mockGrade(opts) {
    var messages = opts.messages || [];
    var said = messages.filter(function (m) { return m.role === "user"; })
      .map(function (m) { return String(m.content).toLowerCase(); }).join("  ");
    if (isPhishing(opts.system)) {
      var refused = /\b(no|won'?t|will not|not going to|refuse|never|can'?t share|won'?t give)\b/.test(said) &&
                    /password|credential|login|verify|code/.test(said);
      var flags = 0;
      [/urgen|rush|now|lock|5 min|pressure/, /link|http|url|click/, /who are you|verify you|prove|legitimat|real|callback|call back|official/,
       /suspicious|phish|scam|red flag|not right|off\b/, /password|credential/].forEach(function (re) { if (re.test(said)) flags++; });
      var pp = refused && flags >= 2;
      return Promise.resolve(JSON.stringify({ pass: pp, feedback: pp
        ? "Nice work — you refused to share credentials and flagged the pressure/link as red flags. That's exactly the instinct to keep."
        : (refused ? "Good — you didn't hand over credentials, but name the specific red flags (urgency, the link) so you'd spot them next time."
                   : "Careful — never share credentials in chat. Call out the urgency and the suspicious link as red flags.") }));
    }
    // Generic "difficult conversation" grader: empathy/apology + a concrete
    // resolution, without being dismissive or defensive.
    var empathy = RE_CONCILIATORY.test(said) || /(sorry|apolog|understand|frustrat|hear)/.test(said);
    var resolution = /(fix|resolve|replace|refund|right away|let me|i'?ll|i will|sort this|make (it|this) right|here'?s what|i can|help)/.test(said);
    var defensive = RE_DEFENSIVE.test(said);
    var pass = empathy && resolution && !defensive;
    var feedback = pass
      ? "Strong de-escalation — you acknowledged how they felt, stayed calm, and offered a concrete fix. That's the move."
      : (defensive ? "Watch the defensiveness — telling someone to calm down or hiding behind policy escalates it. Lead with empathy, then a concrete fix."
        : (empathy ? "Good empathy — now close it with a concrete next step (\"here's what I'll do right now…\") so they feel taken care of."
          : "Start by acknowledging how they feel before anything else, then offer a specific way you'll make it right."));
    return Promise.resolve(JSON.stringify({ pass: pass, feedback: feedback }));
  }

  function chat(opts) {
    opts = opts || {};
    if (usingMock()) {
      return (opts.mode === "grade" ? mockGrade(opts) : mockChat(opts));
    }
    return callClaude(opts);
  }

  // --- Door 2: generate a course SPEC from a plain-language description --------
  // The LLM returns CONTENT only (a clean spec); a JS builder lays it out into a
  // real Mosaic course — so the model never emits coordinates or IDs.
  function specSystemPrompt() {
    return "You are an expert instructional designer. Given a course request, design a concise, " +
      "PRACTICE-BASED micro-course. Respond with ONLY a JSON object (no prose, no markdown fences) " +
      "of exactly this shape:\n" +
      "{\n" +
      '  "title": string,\n' +
      '  "slides": [\n' +
      '    {"type":"title","heading":string,"subtitle":string},\n' +
      '    {"type":"content","heading":string,"body":string,"bullets":[string],"layout":string,"stat":{"value":string,"caption":string}}\n' +
      "  ],\n" +
      '  "quiz": [ {"kind":"single"|"truefalse"|"multiple","prompt":string,"choices":[string],"answer": number | [number]} ],\n' +
      '  "practice": {"title":string,"persona":string,"scenario":string,"objective":string,"rubric":string,"opening":string}\n' +
      "}\n" +
      "Rules — follow this SLIDE ORDER (real instructional-design structure):\n" +
      "  1. Exactly ONE 'title' slide (heading = course title; subtitle = a one-line framing/why-it-matters intro).\n" +
      "  2. A 'content' slide titled \"Learning objectives\", layout:'checklist'. Put the STEM once in 'body': \"By the end of this course, you'll be able to:\". Then 3-5 SMART objectives in 'bullets' — each one STARTS WITH a measurable action verb (Identify, Describe, Demonstrate, Respond, Document, Apply, Evaluate — never 'understand/know/be aware/learn about') and is specific and observable. Do NOT repeat the stem inside the bullets.\n" +
      "  3. Then 2-3 more 'content' slides that actually teach (heading + short body and/or 3-5 bullets). Keep bullets tight — about one line each (≤ 12 words); a short body is ≤ 2 sentences. Slides have limited room, so favor brevity over cramming.\n" +
      "  4. 1-3 quiz questions.\n" +
      "  5. ALWAYS a 'practice' role-play where an AI character lets the learner practice the skill " +
      "(persona = who the AI plays + how it reacts; opening = the AI's first line; rubric = plain-language PASS/FAIL criteria).\n" +
      "answer = 0-based index (single/truefalse) or array of indices (multiple). Keep copy concise, concrete, and real.\n" +
      "LAYOUT: give every content slide a 'layout' so the course looks designed — and VARY them across slides (do not repeat one). Choose from:\n" +
      "  'big-quote'  — one key principle stated boldly. Put the statement in 'body'; use NO bullets.\n" +
      "  'big-stat'   — a striking number. Fill 'stat' {value:\"9 in 10\", caption:\"...\"}; short 'body' optional. Only use when you have a real, specific number.\n" +
      "  'checklist'  — a do-these list. Put the items in 'bullets'.\n" +
      "  'two-column' — a short 'body' paired with a 'bullets' list side by side. Requires BOTH.\n" +
      "  'image-left' / 'image-right' — break up text; Mosaic inserts an image placeholder the author replaces. Provide heading + body/bullets.\n" +
      "  'standard'   — heading + body + bullets stacked. A safe default.\n" +
      "Only include 'stat' when layout is 'big-stat'. Prefer a mix (e.g. big-quote, then checklist, then image-right).";
  }
  function parseSpec(text) {
    var t = String(text || "").replace(/```json|```/g, "").trim();
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    return JSON.parse(t);
  }
  function mockSpec(description, source) {
    var desc = String(description || "").trim();
    // Doc-input: with no description, take the topic from the document itself —
    // its first markdown heading, else its first short line, else the filename.
    if (!desc && source) {
      var lines = String(source.text || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      var h = lines.filter(function (l) { return /^#{1,3}\s+\S/.test(l); })[0];
      desc = h ? h.replace(/^#+\s*/, "")
        : (lines[0] && lines[0].length <= 80 ? lines[0]
        : String(source.name || "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
    }
    var topic = desc
      .replace(/^(please\s+)?(create|make|build|design|generate|write|i want|i need|help me(\s+\w+)?)\s+/i, "")
      .replace(/^(an?|the)\s+/i, "")
      .replace(/^(short\s+|quick\s+|micro\s*)?course\s+(that\s+)?(teaches?|teaching|on|about|for|to|covering|explaining)\s+/i, "")
      .replace(/^(teach(ing)?|about|on)\s+/i, "")
      .replace(/[.?!].*$/, "").trim();
    var howto = topic.match(/how to (.+)/i);            // "...how to give feedback" → "give feedback"
    if (howto) topic = howto[1].trim();
    topic = topic.split(/\s+/).slice(0, 8).join(" ").replace(/[,;:]+$/, "") || "the topic";
    var T = topic.charAt(0).toUpperCase() + topic.slice(1);
    return Promise.resolve({
      title: T,
      slides: [
        { type: "title", heading: T, subtitle: "A quick, practice-based course." },
        { type: "content", layout: "big-quote", heading: "Why it matters", body: "Getting " + topic + " right is a skill you build by practicing — not by memorizing.", bullets: [] },
        { type: "content", layout: "checklist", heading: "Learning objectives", body: "By the end of this course, you'll be able to:", bullets: ["Identify the core principle behind " + topic, "Recognize a common pitfall before it happens", "Apply it correctly in a real situation"] },
        { type: "content", layout: "image-right", heading: "Putting it into practice", body: "Real skill shows up under pressure. In the scenario ahead, you'll apply " + topic + " to a realistic situation.", bullets: ["Stay calm and think first", "Apply the key ideas deliberately"] }
      ],
      quiz: [
        { kind: "truefalse", prompt: "Practicing " + topic + " improves real-world performance.", choices: ["True", "False"], answer: 0 },
        { kind: "single", prompt: "What's the best first move when applying " + topic + "?", choices: ["Rush in", "Pause and assess", "Ignore it", "Hand it off"], answer: 1 }
      ],
      practice: {
        title: "Practice: " + T,
        persona: "A realistic counterpart who tests whether the learner can apply " + topic + " under pressure — responds well to a calm, thoughtful approach and pushes back on a dismissive one.",
        scenario: "The learner faces a real situation that calls for " + topic + ".",
        objective: "Apply " + topic + " effectively in the conversation.",
        rubric: "PASS if the learner responds thoughtfully and applies the key ideas of " + topic + " without being dismissive. Otherwise FAIL.",
        opening: "Okay — here's the situation. Show me how you'd handle this."
      }
    });
  }
  // Door 2 doc-input: cap pasted/extracted source docs to stay inside the request limit.
  var SOURCE_CHAR_CAP = 16000;
  function generateSpec(opts) {
    opts = opts || {};
    var src = (opts.source && opts.source.text) ? opts.source : null;
    if (usingMock()) return mockSpec(opts.description, src);
    var msg = String(opts.description || "").trim() || "Design a course from the source material.";
    if (src) {
      var body = String(src.text);
      if (body.length > SOURCE_CHAR_CAP) body = body.slice(0, SOURCE_CHAR_CAP) + "\n[…source truncated…]";
      msg += "\n\nSOURCE MATERIAL (" + (src.name || "document") + ") — design the course FROM this. Teach what it actually says (its rules, terms, steps); do not invent content that contradicts it:\n---\n" + body;
    }
    return callClaude({ system: specSystemPrompt(), messages: [{ role: "user", content: msg }], mode: "generate" })
      .then(function (text) { return parseSpec(text); });
  }

  global.MosaicAI = { chat: chat, generateSpec: generateSpec, usingMock: usingMock, verifyKey: verifyKey, MODEL: MODEL };
})(window);
