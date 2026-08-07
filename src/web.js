/* Web-only shell behaviour for the browser demo. The native macOS app has this
 * inert (it returns immediately) — everything here is for the hosted web build:
 *   - a subtle "Web preview" affordance a tester can hit when finished
 *   - "Send session log" → summarizes the friction log and posts it (plus an
 *     optional note) to the same insert-only Black Beacon feedback table.
 * The anon key is INSERT-ONLY by design and safe to ship in a client. */
(function (global) {
  "use strict";
  // Native app? Do nothing — it has its own menu + native sender.
  if (global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.mosaic) return;

  var SUPA_URL = "https://fazrbdesobxbuibsrwdl.supabase.co";
  var SUPA_KEY = "sb_publishable_1HAnxLUdwbMtyp0gwHJYcQ_1RWdq82H";

  function summarize() {
    try { if (global.MosaicLog && global.MosaicLog.flush) global.MosaicLog.flush(); } catch (e) {}
    var events = (global.__friction || []).slice();
    var actions = {}, dead = 0, rage = 0, dbl = 0, undo = 0, errors = [], maxRel = 0, sessions = {};
    events.forEach(function (e) {
      if (e.session) sessions[e.session] = 1;
      if (typeof e.rel === "number") maxRel = Math.max(maxRel, e.rel);
      var d = e.d || {};
      switch (e.type) {
        case "action": var fn = (d.info && d.info.fn) || d.fn || "action"; actions[fn] = (actions[fn] || 0) + 1; break;
        case "dead-click": dead++; break;
        case "rage-click": rage++; break;
        case "dblclick-noedit": dbl++; break;
        case "undo-streak": undo++; break;
        case "js-error": case "promise-error": case "resource-error":
          if (errors.length < 12) errors.push(d.msg || d.reason || d.src || e.type); break;
      }
    });
    var mins = Math.floor(maxRel / 60000), secs = Math.floor(maxRel / 1000) % 60;
    var out = "[SESSION LOG · web] Mosaic\n";
    out += "Duration: " + mins + "m " + secs + "s, " + Object.keys(sessions).length + " session(s), " + events.length + " events.\n\n";
    out += "PAIN SIGNALS — dead-clicks:" + dead + ", rage-clicks:" + rage + ", dblclick-didn’t-edit:" + dbl + ", undo-streaks:" + undo + ", errors:" + errors.length + "\n";
    if (errors.length) out += "\nERRORS:\n" + errors.map(function (m) { return "• " + m; }).join("\n") + "\n";
    var top = Object.keys(actions).map(function (k) { return [k, actions[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 12);
    if (top.length) out += "\nWHAT THEY DID:\n" + top.map(function (t) { return "• " + t[0] + " ×" + t[1]; }).join("\n") + "\n";
    out += "\n--- recent raw events ---\n";
    var tail = events.slice(-120);
    for (var i = tail.length - 1; i >= 0; i--) { var line = JSON.stringify(tail[i]); if (out.length + line.length > 3800) break; out += line + "\n"; }
    return out.slice(0, 3900);
  }

  function sendLog(note) {
    var msg = (note ? ("NOTE: " + note + "\n\n") : "") + summarize();
    var row = {
      id: (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("web-" + Date.now()),
      app_name: "Mosaic", app_version: "web-demo", build: "1",
      os_version: (navigator.userAgent || "").slice(0, 90), device_model: "Web",
      locale: navigator.language || "en", type: "bug", message: msg.slice(0, 3900),
      email: null, client_sent_at: new Date().toISOString()
    };
    return fetch(SUPA_URL + "/rest/v1/feedback", {
      method: "POST",
      headers: { "apikey": SUPA_KEY, "Authorization": "Bearer " + SUPA_KEY, "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(row)
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return true; });
  }
  global.MosaicWebSend = sendLog;

  function mountPill() {
    if (document.querySelector(".webpreview")) return;
    var bar = document.createElement("div"); bar.className = "webpreview";
    bar.innerHTML = '<span class="webpreview__tag">Web preview</span>' +
      '<button type="button" class="webpreview__send">Send session log</button>';
    document.body.appendChild(bar);
    bar.querySelector(".webpreview__send").addEventListener("click", function () {
      var btn = this;
      var note = global.prompt("Send your session to Todd.\n\nOptional — add a quick note (what worked, what didn’t, anything confusing). Leave blank to just send the activity log.", "");
      if (note === null) return; // cancelled
      btn.disabled = true; btn.textContent = "Sending…";
      sendLog(note).then(function () {
        btn.textContent = "Sent ✓ thanks!";
        setTimeout(function () { btn.disabled = false; btn.textContent = "Send session log"; }, 4000);
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = "Send session log";
        global.alert("Couldn’t send (" + e.message + "). Check your connection and try again.");
      });
    });
  }
  if (document.readyState !== "loading") mountPill();
  else document.addEventListener("DOMContentLoaded", mountPill);
})(window);
