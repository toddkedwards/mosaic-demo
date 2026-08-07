/*
 * Mosaic — SCORM 1.2 exporter
 *
 * Assembles a course (document model) into a self-contained SCORM 1.2 package:
 *   imsmanifest.xml + index.html (player) + course-data.js (inlined course) +
 *   the shared renderer, the SCORM wrapper, the player, and play styles.
 *
 * Reuses the SAME renderer the editor uses, so the published output is exactly
 * what was built. Course data is inlined as JS (window.MOSAIC_COURSE) so the
 * package needs no fetch and runs under any LMS, http or file.
 */
(function (global) {
  "use strict";

  var Model = global.MosaicModel;
  var Zip = global.MosaicZip;

  function xmlEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function slug(s) {
    return (s || "course").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "course";
  }

  function buildManifest(course) {
    var id = "mosaic." + slug(course.title);
    var title = xmlEscape(course.title || "Mosaic Course");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<manifest identifier="' + id + '" version="1.0"\n' +
      '  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"\n' +
      '  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"\n' +
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
      '  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd\n' +
      '                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">\n' +
      '  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>\n' +
      '  <organizations default="org">\n' +
      '    <organization identifier="org">\n' +
      '      <title>' + title + '</title>\n' +
      '      <item identifier="item_1" identifierref="res_1" isvisible="true">\n' +
      '        <title>' + title + '</title>\n' +
      '      </item>\n' +
      '    </organization>\n' +
      '  </organizations>\n' +
      '  <resources>\n' +
      '    <resource identifier="res_1" type="webcontent" adlcp:scormtype="sco" href="index.html">\n' +
      '      <file href="index.html"/>\n' +
      '      <file href="course-data.js"/>\n' +
      '      <file href="config.js"/>\n' +
      '      <file href="renderer.js"/>\n' +
      '      <file href="ai.js"/>\n' +
      '      <file href="interactions.js"/>\n' +
      '      <file href="scorm.js"/>\n' +
      '      <file href="player.js"/>\n' +
      '      <file href="play.css"/>\n' +
      '    </resource>\n' +
      '  </resources>\n' +
      '</manifest>\n';
  }

  function runtimeFiles() { return ["index.html", "course-data.js", "config.js", "renderer.js", "ai.js", "interactions.js", "scorm.js", "player.js", "play.css"]; }

  function buildManifest2004(course) {
    var id = "mosaic." + slug(course.title), title = xmlEscape(course.title || "Mosaic Course");
    var files = runtimeFiles().map(function (f) { return '      <file href="' + f + '"/>'; }).join("\n");
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<manifest identifier="' + id + '" version="1.0"\n' +
      '  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"\n' +
      '  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"\n' +
      '  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"\n' +
      '  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"\n' +
      '  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"\n' +
      '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
      '  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">\n' +
      '  <metadata><schema>ADL SCORM</schema><schemaversion>2004 4th Edition</schemaversion></metadata>\n' +
      '  <organizations default="org">\n' +
      '    <organization identifier="org">\n' +
      '      <title>' + title + '</title>\n' +
      '      <item identifier="item_1" identifierref="res_1">\n' +
      '        <title>' + title + '</title>\n' +
      '      </item>\n' +
      '    </organization>\n' +
      '  </organizations>\n' +
      '  <resources>\n' +
      '    <resource identifier="res_1" type="webcontent" adlcp:scormType="sco" href="index.html">\n' +
      files + '\n' +
      '    </resource>\n' +
      '  </resources>\n' +
      '</manifest>\n';
  }

  function activityId(course) { return "https://mosaic.app/courses/" + slug(course.title); }

  function buildTincan(course) {
    var title = xmlEscape(course.title || "Mosaic Course"), lang = course.lang || "en";
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<tincan xmlns="http://projecttincan.com/tincan.xsd">\n' +
      '  <activities>\n' +
      '    <activity id="' + xmlEscape(activityId(course)) + '" type="http://adlnet.gov/expapi/activities/course">\n' +
      '      <name>' + title + '</name>\n' +
      '      <description lang="' + lang + '">' + title + '</description>\n' +
      '      <launch lang="' + lang + '">index.html</launch>\n' +
      '    </activity>\n' +
      '  </activities>\n' +
      '</tincan>\n';
  }

  // Fetch the static runtime + shared assets that ship inside every package.
  function loadAssets() {
    var paths = {
      "index.html": "runtime/index.html",
      "play.css": "runtime/play.css",
      "scorm.js": "runtime/scorm.js",
      "player.js": "runtime/player.js",
      "renderer.js": "src/renderer.js",
      "ai.js": "src/ai.js",
      "interactions.js": "src/interactions.js"
    };
    var keys = Object.keys(paths);
    return Promise.all(keys.map(function (k) {
      return fetch(paths[k]).then(function (r) {
        // file:// responses report status 0 even on success (no HTTP layer),
        // so only treat a real HTTP error status as a failure.
        if (!r.ok && r.status !== 0) throw new Error("Could not load " + paths[k] + " (" + r.status + ")");
        return r.text();
      });
    })).then(function (texts) {
      var out = {};
      keys.forEach(function (k, i) { out[k] = texts[i]; });
      return out;
    });
  }

  var SUFFIX = { scorm12: "-scorm12", scorm2004: "-scorm2004", xapi: "-xapi", web: "-web" };

  // standard: "scorm12" (default) | "scorm2004" | "xapi" | "web" (no LMS)
  function buildFiles(course, assets, standard) {
    standard = standard || "scorm12";
    var courseData = "window.MOSAIC_COURSE = " + Model.serialize(course) + ";\n" +
      "window.MOSAIC_STANDARD = " + JSON.stringify(standard) + ";\n" +
      (standard === "xapi" ? "window.MOSAIC_ACTIVITY_ID = " + JSON.stringify(activityId(course)) + ";\n" : "");
    // Deployment hook: orgs (or Todd testing on an LMS) can wire runtime AI by
    // editing this ONE file inside the package — no rebuild. Empty by default:
    // AI features fall back to the built-in offline demo.
    var configStub =
      "// Mosaic deployment config (optional).\n" +
      "// aiProxy: URL of a Mosaic AI proxy endpoint (recommended for production).\n" +
      "// anthropicKey: direct key for TESTING ONLY — anyone who can download\n" +
      "// this package can read it. Never ship a real key to learners.\n" +
      "window.MosaicConfig = window.MosaicConfig || {};\n";
    var entries = [
      { name: "index.html", text: assets["index.html"] },
      { name: "course-data.js", text: courseData },
      { name: "config.js", text: configStub },
      { name: "renderer.js", text: assets["renderer.js"] },
      { name: "ai.js", text: assets["ai.js"] },
      { name: "interactions.js", text: assets["interactions.js"] },
      { name: "scorm.js", text: assets["scorm.js"] },
      { name: "player.js", text: assets["player.js"] },
      { name: "play.css", text: assets["play.css"] }
    ];
    if (standard === "scorm12") entries.unshift({ name: "imsmanifest.xml", text: buildManifest(course) });
    else if (standard === "scorm2004") entries.unshift({ name: "imsmanifest.xml", text: buildManifest2004(course) });
    else if (standard === "xapi") entries.unshift({ name: "tincan.xml", text: buildTincan(course) });
    // "web": no manifest — a plain hostable HTML build
    return entries.map(function (e) { return { name: e.name, bytes: Zip.strToBytes(e.text) }; });
  }

  /** Build the package and return a Blob (used by export + tests). */
  function buildBlob(course, standard) {
    return loadAssets().then(function (assets) {
      return Zip.zipStore(buildFiles(course, assets, standard));
    });
  }

  /** Build + trigger a browser download. */
  function exportScorm(course, standard) {
    return buildBlob(course, standard).then(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = slug(course.title) + (SUFFIX[standard || "scorm12"] || "") + ".zip";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  global.MosaicExport = {
    buildManifest: buildManifest,
    buildBlob: buildBlob,
    exportScorm: exportScorm,
    suffix: function (s) { return SUFFIX[s || "scorm12"] || ""; },
    slug: slug
  };
})(window);
