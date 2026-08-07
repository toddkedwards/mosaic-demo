/*
 * Mosaic — LMS runtime adapter (published-course copy)
 *
 * One interface (init / setScore / setStatus / commit / finish) over three
 * standards, chosen by the package's manifest + window.MOSAIC_STANDARD:
 *   - SCORM 1.2   (window.API, LMSInitialize…, cmi.core.*)
 *   - SCORM 2004  (window.API_1484_11, Initialize…, cmi.score.scaled / *_status)
 *   - xAPI/TinCan (launch params endpoint/auth/actor → POST statements to the LRS)
 * Falls back to a logging stub when nothing is present so the package still runs
 * when opened locally.
 */
(function (global) {
  "use strict";

  var mode = "none", API = null, connected = false, startTime = null;
  var xapi = null;

  function findAPI(name, win) {
    var tries = 0;
    while (win && win[name] == null && win.parent != null && win.parent !== win) { if (++tries > 200) break; win = win.parent; }
    return win ? win[name] : null;
  }
  function locate(name) {
    var a = findAPI(name, global);
    if (a == null && global.opener) a = findAPI(name, global.opener);
    return a;
  }
  function qp(k) { try { return new global.URLSearchParams(global.location.search).get(k); } catch (e) { return null; } }
  function fmt12(ms) {
    var s = ms / 1000, h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(h) + ":" + p(m) + ":" + p(sec.toFixed(2));
  }

  function detect() {
    var wanted = global.MOSAIC_STANDARD || "scorm12";
    if (wanted === "xapi" || qp("endpoint")) {
      var ep = qp("endpoint");
      if (ep) {
        var actor = qp("actor");
        try { actor = actor ? JSON.parse(actor) : null; } catch (e) { /* leave as string */ }
        xapi = {
          endpoint: ep.replace(/\/?$/, "/"), auth: qp("auth") || "",
          actor: actor || { account: { name: "anonymous", homePage: global.location.origin || "mosaic" } },
          registration: qp("registration") || null,
          activityId: qp("activity_id") || qp("activityId") || global.MOSAIC_ACTIVITY_ID || (global.location.href.split(/[?#]/)[0])
        };
        return "xapi";
      }
    }
    API = locate("API_1484_11"); if (API) return "2004";
    API = locate("API"); if (API) return "12";
    return "none";
  }

  // --- xAPI helpers ---
  function xStatement(verbId, verbName, result) {
    var st = {
      actor: xapi.actor,
      verb: { id: verbId, display: { "en-US": verbName } },
      object: { id: xapi.activityId, definition: { name: { "en-US": (global.MOSAIC_COURSE && global.MOSAIC_COURSE.title) || "Course" }, type: "http://adlnet.gov/expapi/activities/course" } }
    };
    if (xapi.registration) { st.context = { registration: xapi.registration }; }
    if (result) st.result = result;
    return st;
  }
  function xSend(st) {
    try {
      global.fetch(xapi.endpoint + "statements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Experience-API-Version": "1.0.3", "Authorization": xapi.auth },
        body: JSON.stringify(st)
      }).catch(function () {});
    } catch (e) { /* offline / blocked — non-fatal */ }
  }

  var pending = { raw: null, min: 0, max: 100 };

  var Scorm = {
    get connected() { return connected; },
    get standard() { return mode; },

    init: function () {
      startTime = Date.now();
      mode = detect();
      if (mode === "xapi") {
        connected = true;
        xSend(xStatement("http://adlnet.gov/expapi/verbs/initialized", "initialized"));
        return true;
      }
      if (mode === "2004") {
        connected = API.Initialize("") === "true";
        if (connected && this.getValue("cmi.completion_status") === "unknown") { this.setValue("cmi.completion_status", "incomplete"); this.commit(); }
        return connected;
      }
      if (mode === "12") {
        connected = API.LMSInitialize("") === "true";
        if (connected && this.getValue("cmi.core.lesson_status") === "not attempted") { this.setValue("cmi.core.lesson_status", "incomplete"); this.commit(); }
        return connected;
      }
      console.warn("[lms] no LMS/LRS — logging only");
      return false;
    },

    setValue: function (k, v) {
      if (!connected || mode === "xapi") { console.log("[lms:log] set", k, "=", v); return false; }
      return (mode === "2004" ? API.SetValue(k, String(v)) : API.LMSSetValue(k, String(v))) === "true";
    },
    getValue: function (k) {
      if (!connected || mode === "xapi") return "";
      return mode === "2004" ? API.GetValue(k) : API.LMSGetValue(k);
    },

    setScore: function (raw, min, max) {
      min = min == null ? 0 : min; max = max == null ? 100 : max;
      pending.raw = raw; pending.min = min; pending.max = max;
      if (mode === "2004") {
        this.setValue("cmi.score.raw", raw); this.setValue("cmi.score.min", min); this.setValue("cmi.score.max", max);
        this.setValue("cmi.score.scaled", max > min ? ((raw - min) / (max - min)).toFixed(4) : "0");
      } else if (mode === "12") {
        this.setValue("cmi.core.score.raw", raw); this.setValue("cmi.core.score.min", min); this.setValue("cmi.core.score.max", max);
      }
    },

    // status: "passed" | "failed" | "completed" | "incomplete"
    setStatus: function (s) {
      if (mode === "2004") {
        if (s === "passed" || s === "failed") { this.setValue("cmi.success_status", s); this.setValue("cmi.completion_status", "completed"); }
        else if (s === "completed") { this.setValue("cmi.completion_status", "completed"); }
        else { this.setValue("cmi.completion_status", "incomplete"); }
      } else if (mode === "12") {
        this.setValue("cmi.core.lesson_status", s);
      } else if (mode === "xapi") {
        pending.status = s;
      }
    },

    commit: function () {
      if (!connected || mode === "xapi") return false;
      return (mode === "2004" ? API.Commit("") : API.LMSCommit("")) === "true";
    },

    finish: function () {
      if (!connected) return false;
      if (mode === "xapi") {
        var s = pending.status, result = null;
        if (pending.raw != null && pending.max > pending.min) {
          result = { score: { raw: pending.raw, min: pending.min, max: pending.max, scaled: (pending.raw - pending.min) / (pending.max - pending.min) } };
          if (s === "passed" || s === "failed") result.success = (s === "passed");
        }
        if (s === "passed") xSend(xStatement("http://adlnet.gov/expapi/verbs/passed", "passed", result));
        else if (s === "failed") xSend(xStatement("http://adlnet.gov/expapi/verbs/failed", "failed", result));
        xSend(xStatement("http://adlnet.gov/expapi/verbs/completed", "completed", result || undefined));
        xSend(xStatement("http://adlnet.gov/expapi/verbs/terminated", "terminated"));
        connected = false;
        return true;
      }
      if (mode === "2004") { this.setValue("cmi.session_time", iso8601(Date.now() - startTime)); this.commit(); var ok4 = API.Terminate("") === "true"; connected = false; return ok4; }
      if (mode === "12") { this.setValue("cmi.core.session_time", fmt12(Date.now() - startTime)); this.commit(); var ok = API.LMSFinish("") === "true"; connected = false; return ok; }
      return false;
    }
  };

  function iso8601(ms) { // SCORM 2004 session_time is ISO 8601 duration
    var s = Math.max(0, ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2);
    return "PT" + (h ? h + "H" : "") + (m ? m + "M" : "") + sec + "S";
  }

  global.MosaicScorm = Scorm;
})(window);
