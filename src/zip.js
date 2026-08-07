/*
 * Mosaic — minimal ZIP writer (STORE / no compression)
 *
 * Dependency-free, matching the project's no-build ethos. Produces a valid
 * .zip Blob with the central directory SCORM requires. STORE (uncompressed) is
 * accepted by SCORM Cloud and every LMS; we can add DEFLATE later if size
 * matters. This is the seed of the export pipeline — the native shell can call
 * the same logic via the WKWebView bridge or reimplement it in Swift.
 */
(function (global) {
  "use strict";

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function strToBytes(str) { return new TextEncoder().encode(str); }

  function u16(n) { return [n & 0xff, (n >>> 8) & 0xff]; }
  function u32(n) { return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]; }

  /**
   * files: [{ name: "path/in/zip", bytes: Uint8Array }]
   * returns: Blob (application/zip)
   */
  function zipStore(files) {
    var chunks = [];
    var central = [];
    var offset = 0;

    files.forEach(function (f) {
      var nameBytes = strToBytes(f.name);
      var data = f.bytes;
      var crc = crc32(data);
      var size = data.length;

      var localHeader = new Uint8Array([].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), // sig, version, flags, method(STORE)
        u16(0), u16(0),                            // mod time, mod date (fixed)
        u32(crc), u32(size), u32(size),            // crc, compressed, uncompressed
        u16(nameBytes.length), u16(0)              // name len, extra len
      ));
      chunks.push(localHeader, nameBytes, data);

      central.push(new Uint8Array([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), // sig, made-by, needed, flags, method
        u16(0), u16(0),                                     // time, date
        u32(crc), u32(size), u32(size),
        u16(nameBytes.length), u16(0), u16(0),             // name, extra, comment len
        u16(0), u16(0), u32(0),                            // disk, internal attrs, external attrs
        u32(offset)
      )), nameBytes);

      offset += localHeader.length + nameBytes.length + data.length;
    });

    var cdStart = offset;
    var cdSize = 0;
    central.forEach(function (part) { chunks.push(part); cdSize += part.length; });

    chunks.push(new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(cdSize), u32(cdStart), u16(0)
    )));

    return new Blob(chunks, { type: "application/zip" });
  }

  global.MosaicZip = { zipStore: zipStore, strToBytes: strToBytes, crc32: crc32 };
})(window);
