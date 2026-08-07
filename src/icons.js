/*
 * Mosaic — icon set
 *
 * Tiny, dependency-free inline SVGs (no webfont to bundle). Each entry is the
 * INNER markup of a 24x24 stroke icon; MosaicIcons.svg() wraps it with the
 * shared attributes. Stroke uses currentColor so icons inherit button color.
 */
(function (global) {
  "use strict";

  var P = {
    text:      '<path d="M5 20 L12 4 L19 20"/><path d="M8.5 14 H15.5"/>',
    shape:     '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/>',
    image:     '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none"/><path d="M4.5 17 L9 12 L12.5 15.5 L16 11.5 L19.5 16"/>',
    question:  '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3 a2.8 2.8 0 1 1 4 2.5 c-0.9 0.5 -1.2 1 -1.2 1.9"/><circle cx="12" cy="16.7" r="0.75" fill="currentColor" stroke="none"/>',
    video:     '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M10 9.2 L14.8 12 L10 14.8 Z" fill="currentColor" stroke="none"/>',
    variable:  '<path d="M9 4 C6.6 4 6.6 7.2 6.6 9 C6.6 11 5.2 12 5.2 12 C5.2 12 6.6 13 6.6 15 C6.6 16.8 6.6 20 9 20"/><path d="M15 4 C17.4 4 17.4 7.2 17.4 9 C17.4 11 18.8 12 18.8 12 C18.8 12 17.4 13 17.4 15 C17.4 16.8 17.4 20 15 20"/>',
    button:    '<rect x="3.5" y="8" width="17" height="8" rx="4"/>',
    roleplay:  '<path d="M4 5.5 H14 a2 2 0 0 1 2 2 V12 a2 2 0 0 1 -2 2 H8 L4.5 17 V14 H4 a2 2 0 0 1 -2 -2 V7.5 a2 2 0 0 1 2 -2 Z"/><path d="M9 9 h4 M9 11 h2.5"/>',
    interact:  '<path d="M9 3.2 V6"/><path d="M4.9 4.9 L6.9 6.9"/><path d="M3.2 9 H6"/><path d="M9.6 9.6 L19.5 13.2 L14.9 14.9 L13.2 19.5 Z" fill="currentColor" stroke="none"/>',
    wand:      '<path d="M5 19 L15 9"/><path d="M14 5.5 l0.6 1.6 1.6 0.6 -1.6 0.6 -0.6 1.6 -0.6 -1.6 -1.6 -0.6 1.6 -0.6 Z" fill="currentColor" stroke="none"/><path d="M18.5 11 l0.4 1.1 1.1 0.4 -1.1 0.4 -0.4 1.1 -0.4 -1.1 -1.1 -0.4 1.1 -0.4 Z" fill="currentColor" stroke="none"/>',
    undo:      '<path d="M7 8 L3.5 11.5 L7 15"/><path d="M3.5 11.5 H14 a4.5 4.5 0 0 1 0 9 H9"/>',
    redo:      '<path d="M17 8 L20.5 11.5 L17 15"/><path d="M20.5 11.5 H10 a4.5 4.5 0 0 0 0 9 H15"/>',
    trash:     '<path d="M5 7 H19"/><path d="M9.5 7 V5.2 H14.5 V7"/><path d="M6.8 7 L7.7 19.2 a1 1 0 0 0 1 0.9 H14.5 a1 1 0 0 0 1 -0.9 L17.2 7"/>',
    contrast:  '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z" fill="currentColor" stroke="none"/>',
    palette:   '<path d="M12 3.2 a8.8 8.8 0 1 0 0 17.6 c1.1 0 1.9 -.9 1.9 -2 0 -.6 -.2 -1 -.6 -1.4 -.3 -.4 -.5 -.8 -.5 -1.3 0 -1.1 .9 -2 2 -2 H17 a4 4 0 0 0 4 -4 c0 -4.4 -4 -8.2 -9 -8.2 z"/><circle cx="8" cy="11" r="1.05" fill="currentColor" stroke="none"/><circle cx="11" cy="7.7" r="1.05" fill="currentColor" stroke="none"/><circle cx="15.3" cy="9" r="1.05" fill="currentColor" stroke="none"/>',
    a11y:      '<circle cx="12" cy="4.4" r="1.9" fill="currentColor" stroke="none"/><path d="M4.5 8.2 C8 9.6 16 9.6 19.5 8.2"/><path d="M12 8.5 V14"/><path d="M8.4 20 L12 14 L15.6 20"/>',
    play:      '<path d="M7.5 5.5 L18.5 12 L7.5 18.5 Z" fill="currentColor" stroke="none"/>',
    share:     '<path d="M12 14.5 V4.5"/><path d="M8 8 L12 4 L16 8"/><path d="M6 12.5 V18 a2 2 0 0 0 2 2 H16 a2 2 0 0 0 2 -2 V12.5"/>',
    chevron:   '<path d="M6 9.5 L12 15 L18 9.5"/>',
    dots:      '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    plus:      '<path d="M12 5 V19"/><path d="M5 12 H19"/>',
    rectangle: '<rect x="4.5" y="6.5" width="15" height="11" rx="2"/>',
    ellipse:   '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    line:      '<path d="M5 18 L19 6"/>',
    file:      '<path d="M7 3.5 H14 L18.5 8 V20.5 H7 Z"/><path d="M14 3.5 V8 H18.5"/>',
    download:  '<path d="M12 4 V14.5"/><path d="M8 10.5 L12 14.5 L16 10.5"/><path d="M5.5 18.5 H18.5"/>',
    adjust:    '<path d="M4 8 H20"/><path d="M4 16 H20"/><circle cx="9" cy="8" r="2.4" fill="currentColor" stroke="none"/><circle cx="15" cy="16" r="2.4" fill="currentColor" stroke="none"/>',
    layers:    '<path d="M12 3.5 L20.5 8 L12 12.5 L3.5 8 Z"/><path d="M4 12 L12 16.2 L20 12"/>',
    clock:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5 V12 L15 14"/>',
    edit:      '<path d="M5 19 L5 15.5 L15.5 5 L19 8.5 L8.5 19 Z"/><path d="M13.5 7 L17 10.5"/>',
    panelLeft: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M9 5 V19"/>',
    panelRight:'<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M15 5 V19"/>',
    settings:  '<circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M12 5.6 V3 M12 18.4 V21 M5.6 12 H3 M18.4 12 H21 M16.5 7.5 L18.4 5.6 M16.5 16.5 L18.4 18.4 M7.5 16.5 L5.6 18.4 M7.5 7.5 L5.6 5.6"/>',
    star:      '<path d="M12 3 l2.6 6.3 6.8 .5 -5.2 4.4 1.7 6.6 -5.9 -3.6 -5.9 3.6 1.7 -6.6 -5.2 -4.4 6.8 -.5 z"/>'
  };

  // Content icons (for the in-canvas icon library — distinct from UI chrome icons).
  var C = {
    check:     '<path d="M5 13 l4 4 L19 6"/>',
    x:         '<path d="M6 6 L18 18 M18 6 L6 18"/>',
    alert:     '<path d="M12 3 L22 20 H2 Z"/><path d="M12 9 V14"/><circle cx="12" cy="17.3" r="0.7" fill="currentColor" stroke="none"/>',
    info:      '<circle cx="12" cy="12" r="9"/><path d="M12 11 V16.5"/><circle cx="12" cy="7.6" r="0.7" fill="currentColor" stroke="none"/>',
    lock:      '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 8 0 V11"/>',
    mail:      '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7 L12 13 L20.5 7"/>',
    phone:     '<path d="M6 3.5 h4 l2 5 -2.5 1.5 a11 11 0 0 0 5 5 l1.5 -2.5 5 2 v4 a2 2 0 0 1 -2 2 A17 17 0 0 1 4 5.5 a2 2 0 0 1 2 -2 z"/>',
    shield:    '<path d="M12 3 l8 3 v6 c0 5 -4 8 -8 9 -4 -1 -8 -4 -8 -9 V6 z"/>',
    star:      '<path d="M12 3 l2.6 6.3 6.8 .5 -5.2 4.4 1.7 6.6 -5.9 -3.6 -5.9 3.6 1.7 -6.6 -5.2 -4.4 6.8 -.5 z"/>',
    heart:     '<path d="M12 20 C6 16 3 12 3 8.5 A4 4 0 0 1 12 7 A4 4 0 0 1 21 8.5 C21 12 18 16 12 20 z"/>',
    bulb:      '<path d="M9.5 17.5 h5 M10.5 20.5 h3 M8 11 a4 4 0 1 1 8 0 c0 2 -1.5 3 -2 4 H10 c-.5 -1 -2 -2 -2 -4 z"/>',
    flag:      '<path d="M6 21 V4 M6 4.5 h11 l-2 3.5 2 3.5 H6"/>',
    user:      '<circle cx="12" cy="8" r="4"/><path d="M4.5 20 a7.5 7.5 0 0 1 15 0"/>',
    clock:     '<circle cx="12" cy="12" r="9"/><path d="M12 7 V12 L16 14"/>',
    search:    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 L21 21"/>',
    thumbsup:  '<path d="M7 10 v10 H4 V10 z M7 10 l4 -6.5 a2 2 0 0 1 3 1.8 l-1 4.7 h5 a2 2 0 0 1 2 2.4 l-1.2 5 a2 2 0 0 1 -2 1.6 H7"/>',
    arrowright:'<path d="M4 12 H20 M14 6 L20 12 L14 18"/>',
    home:      '<path d="M4 11 L12 4 L20 11 M6 10 V20 H18 V10"/>',
    doc:       '<path d="M7 3 H14 L18 7 V21 H7 Z M14 3 V7 H18"/>',
    gear:      '<circle cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M12 5.6 V3 M12 18.4 V21 M5.6 12 H3 M18.4 12 H21 M16.5 7.5 L18.4 5.6 M16.5 16.5 L18.4 18.4 M7.5 16.5 L5.6 18.4 M7.5 7.5 L5.6 5.6"/>',

    /* --- Expanded set (Lucide/Feather-style geometry, same stroke language) --- */
    alertcircle: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5 V13"/><circle cx="12" cy="16.4" r="0.75" fill="currentColor" stroke="none"/>',
    alertoctagon:'<path d="M8.2 3 H15.8 L21 8.2 V15.8 L15.8 21 H8.2 L3 15.8 V8.2 Z"/><path d="M12 7.5 V13"/><circle cx="12" cy="16.4" r="0.75" fill="currentColor" stroke="none"/>',
    ban:         '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7 L18.3 18.3"/>',
    flame:       '<path d="M12 3 C12 6 8 8.5 8 13 a4 4 0 0 0 8 0 C16 10.5 13.5 9.5 13 7 C12.6 5.4 12 4 12 3 z"/><path d="M10.5 15 a1.5 1.5 0 0 0 3 0 c0 -1.2 -1.5 -1.8 -1.5 -3 0 1 -1.5 1.8 -1.5 3 z"/>',
    zap:         '<path d="M13 2.5 L4.5 13.5 H11 L10 21.5 L19.5 10 H13 Z"/>',
    hardhat:     '<path d="M4 16 a8 8 0 0 1 16 0"/><path d="M2.8 16 H21.2 V18.2 H2.8 Z"/><path d="M10 6.5 V10 M14 6.5 V10"/>',
    firstaid:    '<rect x="3.5" y="6" width="17" height="14" rx="2.5"/><path d="M9 6 V4.5 a1 1 0 0 1 1 -1 H14 a1 1 0 0 1 1 1 V6"/><path d="M12 10 V16 M9 13 H15"/>',
    checkcircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3 l2.6 2.7 L16 9.5"/>',
    xcircle:     '<circle cx="12" cy="12" r="9"/><path d="M9 9 L15 15 M15 9 L9 15"/>',
    helpcircle:  '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3 a2.8 2.8 0 1 1 4 2.5 c-0.9 0.5 -1.2 1 -1.2 1.9"/><circle cx="12" cy="16.7" r="0.75" fill="currentColor" stroke="none"/>',
    plus:        '<path d="M12 5 V19 M5 12 H19"/>',
    minus:       '<path d="M5 12 H19"/>',
    pluscircle:  '<circle cx="12" cy="12" r="9"/><path d="M12 8 V16 M8 12 H16"/>',
    minuscircle: '<circle cx="12" cy="12" r="9"/><path d="M8 12 H16"/>',
    users:       '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20 a6 6 0 0 1 12 0"/><path d="M16 5.6 a3.5 3.5 0 0 1 0 5.8"/><path d="M17.5 14.6 a6 6 0 0 1 3.5 5.4"/>',
    usercheck:   '<circle cx="9.5" cy="8" r="3.8"/><path d="M3 20 a6.5 6.5 0 0 1 13 0"/><path d="M15.5 10.5 l2 2 L21.5 8.5"/>',
    userplus:    '<circle cx="9.5" cy="8" r="3.8"/><path d="M3 20 a6.5 6.5 0 0 1 13 0"/><path d="M18.5 8 V14 M15.5 11 H21.5"/>',
    graduation:  '<path d="M2.5 9 L12 4.5 L21.5 9 L12 13.5 Z"/><path d="M6.5 11.5 V16 c0 1.4 2.5 2.8 5.5 2.8 s5.5 -1.4 5.5 -2.8 V11.5"/><path d="M21.5 9 V14"/>',
    presentation:'<path d="M3 4 H21"/><rect x="4.5" y="4" width="15" height="11" rx="1"/><path d="M12 15 V17.5 M12 17.5 L8.5 21 M12 17.5 L15.5 21"/><path d="M8 9 L10.5 11.5 L16 7.5"/>',
    book:        '<path d="M5 4.5 a2 2 0 0 1 2 -2 H19 V19 H7 a2 2 0 0 0 -2 2 Z"/><path d="M5 19 a2 2 0 0 1 2 -2 H19"/>',
    bookopen:    '<path d="M12 6.5 C10.5 5 8 4.5 5.5 4.5 H3 V18.5 H6 c2.3 0 4.5 0.5 6 2 1.5 -1.5 3.7 -2 6 -2 h3 V4.5 H18.5 C16 4.5 13.5 5 12 6.5 Z"/><path d="M12 6.5 V20.5"/>',
    clipboard:   '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5 V3.5 a1 1 0 0 1 1 -1 H14 a1 1 0 0 1 1 1 V4.5"/><path d="M9 10 H15 M9 13.5 H15 M9 17 H12.5"/>',
    clipcheck:   '<rect x="5" y="4.5" width="14" height="16.5" rx="2"/><path d="M9 4.5 V3.5 a1 1 0 0 1 1 -1 H14 a1 1 0 0 1 1 1 V4.5"/><path d="M8.8 13 l2.4 2.4 L15.5 10.5"/>',
    briefcase:   '<rect x="3.5" y="8" width="17" height="12" rx="2"/><path d="M9 8 V6 a2 2 0 0 1 2 -2 H13 a2 2 0 0 1 2 2 V8"/><path d="M3.5 13 H20.5"/>',
    building:    '<rect x="5" y="3.5" width="14" height="17.5"/><path d="M9 21 V17 H15 V21"/><path d="M8.5 7 H10 M14 7 H15.5 M8.5 10.5 H10 M14 10.5 H15.5 M8.5 14 H10 M14 14 H15.5"/>',
    factory:     '<path d="M3.5 21 V9.5 L9 12.5 V9.5 L14.5 12.5 V9.5 L20.5 12.5 V21 Z"/><path d="M6 6.5 L7 3 H9 L10 6.5"/><path d="M7 16.5 H9 M12 16.5 H14 M17 16.5 H18.5"/>',
    truck:       '<rect x="2.5" y="6.5" width="12" height="10"/><path d="M14.5 10 H18.5 L21.5 13.5 V16.5 H14.5"/><circle cx="7" cy="18.5" r="1.8"/><circle cx="17.5" cy="18.5" r="1.8"/>',
    wrench:      '<path d="M14 6.5 a4.5 4.5 0 0 1 6 -1.9 L16.7 8 l0.9 2.4 2.4 0.9 3.3 -3.3 a4.5 4.5 0 0 1 -6.2 5.4 L9 21.5 a2 2 0 0 1 -2.8 -2.8 L14.3 10.6"/>',
    hammer:      '<path d="M14 4 l6 6 -2 2 -6 -6 z"/><path d="M12 6 L4 14 a1.7 1.7 0 0 0 2.4 2.4 L14 8.5"/><path d="M15 3 l2 2"/>',
    package:     '<path d="M12 3 L20.5 7.5 V16.5 L12 21 L3.5 16.5 V7.5 Z"/><path d="M3.5 7.5 L12 12 L20.5 7.5"/><path d="M12 12 V21"/><path d="M7.5 5.4 L16.2 9.9"/>',
    archive:     '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9 V19 a1.5 1.5 0 0 0 1.5 1.5 H17.5 a1.5 1.5 0 0 0 1.5 -1.5 V9"/><path d="M10 13 H14"/>',
    message:     '<path d="M4 5.5 H20 a1.5 1.5 0 0 1 1.5 1.5 V15 a1.5 1.5 0 0 1 -1.5 1.5 H9 L4.5 20.5 V16.5 H4 a1.5 1.5 0 0 1 -1.5 -1.5 V7 A1.5 1.5 0 0 1 4 5.5 Z"/>',
    bell:        '<path d="M6.5 9.5 a5.5 5.5 0 0 1 11 0 c0 5 2 6 2 6 H4.5 s2 -1 2 -6"/><path d="M10.3 19.5 a2 2 0 0 0 3.4 0"/>',
    megaphone:   '<path d="M3.5 10 V14 a1 1 0 0 0 1 1 H7 L18.5 20 V4 L7 9 H4.5 a1 1 0 0 0 -1 1 Z"/><path d="M8.5 15.4 L9.5 20 a1 1 0 0 0 1 0.8 H12"/>',
    send:        '<path d="M21 3 L3.5 10.5 L10 13.5 L13 20.5 L21 3 Z"/><path d="M10 13.5 L21 3"/>',
    mic:         '<rect x="9.5" y="3" width="5" height="10" rx="2.5"/><path d="M6 11 a6 6 0 0 0 12 0"/><path d="M12 17 V20.5 M9 20.5 H15"/>',
    camera:      '<path d="M4 8 H7.5 L9.5 5.5 H14.5 L16.5 8 H20 a1.5 1.5 0 0 1 1.5 1.5 V18 a1.5 1.5 0 0 1 -1.5 1.5 H4 A1.5 1.5 0 0 1 2.5 18 V9.5 A1.5 1.5 0 0 1 4 8 Z"/><circle cx="12" cy="13.3" r="3.4"/>',
    laptop:      '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19 H21.5 L19.5 15.5 H4.5 Z"/>',
    monitor:     '<rect x="3" y="4.5" width="18" height="12.5" rx="1.5"/><path d="M12 17 V20.5 M8.5 20.5 H15.5"/>',
    smartphone:  '<rect x="7.5" y="3" width="9" height="18" rx="2"/><path d="M11 17.8 H13"/>',
    wifi:        '<path d="M3 9.5 a13 13 0 0 1 18 0"/><path d="M6.2 12.8 a8.5 8.5 0 0 1 11.6 0"/><path d="M9.3 16 a4.5 4.5 0 0 1 5.4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
    database:    '<ellipse cx="12" cy="5.5" rx="8" ry="2.8"/><path d="M4 5.5 V18.5 c0 1.6 3.6 2.8 8 2.8 s8 -1.2 8 -2.8 V5.5"/><path d="M4 12 c0 1.6 3.6 2.8 8 2.8 s8 -1.2 8 -2.8"/>',
    cloud:       '<path d="M7 18.5 a4.5 4.5 0 0 1 -0.5 -9 A6 6 0 0 1 18 8.5 a4 4 0 0 1 0.5 10 Z"/>',
    download:    '<path d="M12 4 V14.5 M8 10.5 L12 14.5 L16 10.5"/><path d="M4.5 18.5 H19.5"/>',
    upload:      '<path d="M12 14.5 V4 M8 8 L12 4 L16 8"/><path d="M4.5 18.5 H19.5"/>',
    code:        '<path d="M8.5 7 L3.5 12 L8.5 17"/><path d="M15.5 7 L20.5 12 L15.5 17"/>',
    bug:         '<circle cx="12" cy="13.5" r="5.5"/><path d="M9.5 8.7 a2.5 2.5 0 0 1 5 0"/><path d="M12 8 V5.5 M8.5 5 l1.4 1.7 M15.5 5 l-1.4 1.7"/><path d="M6.5 13.5 H3.5 M20.5 13.5 H17.5 M7.3 17 L5 19 M16.7 17 L19 19 M7.3 10.5 L5 9 M16.7 10.5 L19 9"/>',
    arrowleft:   '<path d="M20 12 H4 M10 6 L4 12 L10 18"/>',
    arrowup:     '<path d="M12 20 V4 M6 10 L12 4 L18 10"/>',
    arrowdown:   '<path d="M12 4 V20 M6 14 L12 20 L18 14"/>',
    refresh:     '<path d="M20 5 V10 H15"/><path d="M4 19 V14 H9"/><path d="M5.6 9 a7 7 0 0 1 11.9 -2.4 L20 10"/><path d="M18.4 15 a7 7 0 0 1 -11.9 2.4 L4 14"/>',
    externallink:'<path d="M10 5 H5.5 A1.5 1.5 0 0 0 4 6.5 V18.5 A1.5 1.5 0 0 0 5.5 20 H17.5 A1.5 1.5 0 0 0 19 18.5 V14"/><path d="M14 4 H20 V10"/><path d="M11 13 L20 4"/>',
    calendar:    '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M8 3 V7 M16 3 V7 M3.5 10 H20.5"/>',
    timer:       '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10 V13.5 L14.5 15.5"/><path d="M10 3 H14"/><path d="M12 3 V6"/>',
    hourglass:   '<path d="M6.5 3 H17.5 M6.5 21 H17.5"/><path d="M8 3 V7 L12 12 L8 17 V21 M16 3 V7 L12 12 L16 17 V21"/>',
    target:      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.3"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    barchart:    '<path d="M4 20.5 H20"/><path d="M7 20.5 V12 M12 20.5 V6 M17 20.5 V9.5"/>',
    linechart:   '<path d="M4 4 V20 H20"/><path d="M7 15.5 L11 11 L14 13.5 L19 7"/>',
    piechart:    '<path d="M12 3.2 a8.8 8.8 0 1 0 8.8 8.8 H12 Z"/><path d="M15 3.8 a8.9 8.9 0 0 1 5.2 5.2 L15 9 Z"/>',
    trendingup:  '<path d="M3.5 17.5 L9.5 11.5 L13 15 L20.5 7.5"/><path d="M14.5 7.5 H20.5 V13.5"/>',
    trendingdown:'<path d="M3.5 6.5 L9.5 12.5 L13 9 L20.5 16.5"/><path d="M14.5 16.5 H20.5 V10.5"/>',
    percent:     '<path d="M19 5 L5 19"/><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="17" r="2.6"/>',
    calculator:  '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 6.5 H15.5"/><path d="M8.5 11 H8.6 M12 11 H12.1 M15.5 11 H15.6 M8.5 14.5 H8.6 M12 14.5 H12.1 M15.5 14.5 H15.6 M8.5 18 H8.6 M12 18 H12.1 M15.5 18 H15.6"/>',
    award:       '<circle cx="12" cy="9" r="5.5"/><path d="M9 13.7 L7.5 21 L12 18.5 L16.5 21 L15 13.7"/>',
    trophy:      '<path d="M8 4 H16 V10 a4 4 0 0 1 -8 0 Z"/><path d="M8 5.5 H4.5 a3.5 3.5 0 0 0 3.5 4.5"/><path d="M16 5.5 H19.5 A3.5 3.5 0 0 1 16 10"/><path d="M12 14 V17.5 M8.5 20.5 H15.5 M10 17.5 H14 V20.5 H10 Z"/>',
    crown:       '<path d="M4 8 L8 12 L12 5.5 L16 12 L20 8 L18.5 18 H5.5 Z"/>',
    rocket:      '<path d="M12 3 c3.5 1.5 5.5 5 5.5 9 l-2.5 2.5 H9 L6.5 12 C6.5 8 8.5 4.5 12 3 z"/><circle cx="12" cy="9.5" r="1.7"/><path d="M9 14.5 L7 19 M15 14.5 L17 19 M12 15 V20"/>',
    eye:         '<path d="M2.5 12 C5 7 8.5 5 12 5 s7 2 9.5 7 C19 17 15.5 19 12 19 s-7 -2 -9.5 -7 z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff:      '<path d="M4 4 L20 20"/><path d="M8.8 6 A9.5 9.5 0 0 1 12 5.5 c3.5 0 7 2 9.5 6.5 -0.8 1.6 -1.8 2.9 -2.9 3.9 M6 7.4 C4.6 8.5 3.4 10 2.5 12 5 16.5 8.5 18.5 12 18.5 c1.3 0 2.6 -0.3 3.8 -0.8"/><path d="M9.9 9.9 a3 3 0 0 0 4.2 4.2"/>',
    key:         '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.8 12.2 L20 3 M15.5 7.5 L18.5 10.5 M13 10 L15.5 12.5"/>',
    unlock:      '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 a4 4 0 0 1 7.8 -1.2"/>',
    shieldcheck: '<path d="M12 3 l8 3 v6 c0 5 -4 8 -8 9 -4 -1 -8 -4 -8 -9 V6 z"/><path d="M8.7 12 l2.4 2.4 L15.5 9.8"/>',
    link:        '<path d="M10 14 a4 4 0 0 0 6 0.4 l3 -3 a4 4 0 0 0 -5.7 -5.7 l-1.7 1.7"/><path d="M14 10 a4 4 0 0 0 -6 -0.4 l-3 3 a4 4 0 0 0 5.7 5.7 l1.7 -1.7"/>',
    mappin:      '<path d="M12 21.5 C7.5 16.5 5 13 5 10 a7 7 0 0 1 14 0 c0 3 -2.5 6.5 -7 11.5 z"/><circle cx="12" cy="10" r="2.6"/>',
    globe:       '<circle cx="12" cy="12" r="9"/><path d="M3 12 H21"/><path d="M12 3 a13.5 13.5 0 0 1 0 18 a13.5 13.5 0 0 1 0 -18"/>',
    compass:     '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 L13.5 13.5 L8.5 15.5 L10.5 10.5 Z"/>',
    leaf:        '<path d="M5 19 C5 10 10 5 20 4.5 c0.5 10 -4.5 15 -13 14.7"/><path d="M5 19 C7 13.5 10.5 10 15.5 8"/>',
    sun:         '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8 V5 M12 19 V21.2 M2.8 12 H5 M19 12 H21.2 M5.5 5.5 L7 7 M17 17 L18.5 18.5 M18.5 5.5 L17 7 M7 17 L5.5 18.5"/>',
    moon:        '<path d="M20 14.5 A8.5 8.5 0 1 1 9.5 4 a7 7 0 0 0 10.5 10.5 z"/>',
    umbrella:    '<path d="M3 12.5 a9 9 0 0 1 18 0 z"/><path d="M12 12.5 V18.5 a2 2 0 0 1 -4 0"/><path d="M12 3.5 V5"/>',
    droplet:     '<path d="M12 3 C15.5 7.5 18 10.5 18 14 a6 6 0 0 1 -12 0 C6 10.5 8.5 7.5 12 3 z"/>',
    coffee:      '<path d="M5 9 H17 V15 a5 5 0 0 1 -5 5 H10 a5 5 0 0 1 -5 -5 Z"/><path d="M17 10 h1.5 a2.5 2.5 0 0 1 0 5 H17"/><path d="M8.5 3.5 c0 1 1 1.2 1 2.2 M12.5 3.5 c0 1 1 1.2 1 2.2"/>',
    dollar:      '<path d="M12 3.5 V20.5"/><path d="M16.5 7 a3.5 3 0 0 0 -3.5 -1.8 H11 a3 3 0 0 0 0 6 h2 a3 3 0 0 1 0 6 H10.5 A3.5 3 0 0 1 7.5 15.5"/>',
    creditcard:  '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 9.8 H21"/><path d="M6.5 14.5 H10"/>',
    cart:        '<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/><path d="M3 4.5 H5.5 L7.8 15 a1.5 1.5 0 0 0 1.5 1.2 h7.6 a1.5 1.5 0 0 0 1.5 -1.2 L20 8 H6.3"/>',
    tag:         '<path d="M3.5 3.5 H11 L20.5 13 a1.5 1.5 0 0 1 0 2.1 L15.1 20.5 a1.5 1.5 0 0 1 -2.1 0 L3.5 11 Z"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/>',
    gift:        '<rect x="4" y="10.5" width="16" height="10" rx="1"/><path d="M3 6.8 H21 V10.5 H3 Z"/><path d="M12 6.8 V20.5"/><path d="M12 6.5 C10 6.5 7.5 6 7.5 4.3 a1.9 1.9 0 0 1 3.6 -0.8 C11.7 4.5 12 6.5 12 6.5 c0 0 0.3 -2 0.9 -3 a1.9 1.9 0 0 1 3.6 0.8 C16.5 6 14 6.5 12 6.5 z"/>',
    folder:      '<path d="M3.5 6 a1.5 1.5 0 0 1 1.5 -1.5 H9 L11.5 7 H19 a1.5 1.5 0 0 1 1.5 1.5 V18 a1.5 1.5 0 0 1 -1.5 1.5 H5 A1.5 1.5 0 0 1 3.5 18 Z"/>',
    save:        '<path d="M5 3.5 H16 L20.5 8 V19 a1.5 1.5 0 0 1 -1.5 1.5 H5 A1.5 1.5 0 0 1 3.5 19 V5 A1.5 1.5 0 0 1 5 3.5 Z"/><path d="M8 3.5 V8.5 H15 V3.5"/><rect x="7.5" y="13" width="9" height="7.5"/>',
    printer:     '<path d="M7 8 V3.5 H17 V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="1.5"/><rect x="7" y="14" width="10" height="6.5"/><circle cx="17.5" cy="11" r="0.8" fill="currentColor" stroke="none"/>',
    volume:      '<path d="M4 9.5 H7.5 L12.5 5 V19 L7.5 14.5 H4 Z"/><path d="M15.5 9 a4.5 4.5 0 0 1 0 6"/><path d="M18 6.5 a8 8 0 0 1 0 11"/>',
    playcircle:  '<circle cx="12" cy="12" r="9"/><path d="M10 8.5 L16 12 L10 15.5 Z" fill="currentColor" stroke="none"/>',
    pausecircle: '<circle cx="12" cy="12" r="9"/><path d="M9.8 8.5 V15.5 M14.2 8.5 V15.5"/>',
    thumbsdown:  '<path d="M17 14 V4 H20 V14 z M17 14 l-4 6.5 a2 2 0 0 1 -3 -1.8 l1 -4.7 H6 a2 2 0 0 1 -2 -2.4 l1.2 -5 a2 2 0 0 1 2 -1.6 H17"/>',
    smile:       '<circle cx="12" cy="12" r="9"/><path d="M8.3 14.3 a4.6 4.6 0 0 0 7.4 0"/><circle cx="9" cy="9.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.8" fill="currentColor" stroke="none"/>',
    frown:       '<circle cx="12" cy="12" r="9"/><path d="M8.3 15.8 a4.6 4.6 0 0 1 7.4 0"/><circle cx="9" cy="9.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.8" fill="currentColor" stroke="none"/>',
    meh:         '<circle cx="12" cy="12" r="9"/><path d="M8.5 15 H15.5"/><circle cx="9" cy="9.5" r="0.8" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="0.8" fill="currentColor" stroke="none"/>',
    hand:        '<path d="M7.5 11.5 V5.8 a1.4 1.4 0 0 1 2.8 0 V10 M10.3 10 V4.4 a1.4 1.4 0 0 1 2.8 0 V10 M13.1 10 V5.2 a1.4 1.4 0 0 1 2.8 0 V10.5 M15.9 10.5 V6.8 a1.4 1.4 0 0 1 2.8 0 V14 a7 7 0 0 1 -7 7 h-0.6 a6.5 6.5 0 0 1 -5.3 -2.7 L3 14 a1.6 1.6 0 0 1 2.6 -1.9 l1.9 2.4"/>',
    puzzle:      '<path d="M9.5 4 a1.8 1.8 0 0 1 3.6 0 V5.5 H16.5 a1 1 0 0 1 1 1 V9.9 h1.5 a1.8 1.8 0 0 1 0 3.6 H17.5 V17.5 a1 1 0 0 1 -1 1 H13.1 V20 a1.8 1.8 0 0 1 -3.6 0 V18.5 H6 a1 1 0 0 1 -1 -1 V13.1 H3.5 a1.8 1.8 0 0 1 0 -3.6 H5 V6.5 a1 1 0 0 1 1 -1 H9.5 Z"/>',
    battery:     '<rect x="2.5" y="8" width="16" height="8" rx="1.5"/><path d="M21.5 10.5 V13.5"/><path d="M5.5 10.5 V13.5 M8.5 10.5 V13.5 M11.5 10.5 V13.5"/>',
    plug:        '<path d="M9 3.5 V8 M15 3.5 V8"/><path d="M6.5 8 H17.5 V11 a5.5 5.5 0 0 1 -11 0 Z"/><path d="M12 16.5 V20.5"/>',
    thermometer: '<path d="M10.5 4 a1.5 1.5 0 0 1 3 0 V13.8 a4 4 0 1 1 -3 0 Z"/><circle cx="12" cy="17.5" r="1.6" fill="currentColor" stroke="none"/><path d="M12 15.5 V9"/>',
    pill:        '<rect x="3" y="9.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M8.8 15.2 L15.2 8.8"/>',
    scale:       '<path d="M12 4 V19"/><path d="M5 7 H19"/><path d="M5 7 L2.8 13 a3 3 0 0 0 4.4 0 Z M19 7 L16.8 13 a3 3 0 0 0 4.4 0 Z"/><path d="M8 19 H16"/>',
    utensils:    '<path d="M6 3.5 V10 M8.5 3.5 V10 M3.5 3.5 V10 a2.5 2.5 0 0 0 2.5 2.5 V20.5 M6 12.5 A2.5 2.5 0 0 0 8.5 10"/><path d="M17.5 3.5 c-1.8 1.5 -2.5 4 -2.5 6.5 0 1.7 1 2.5 2.5 2.5 V20.5 V3.5 Z"/>',
    edit:        '<path d="M5 19 L5 15.5 L15.5 5 L19 8.5 L8.5 19 Z"/><path d="M13.5 7 L17 10.5"/>',
    paperclip:   '<path d="M20 11 L11.8 19.2 a5 5 0 0 1 -7 -7 L13 4 a3.3 3.3 0 0 1 4.7 4.7 L9.5 16.9 a1.7 1.7 0 0 1 -2.4 -2.4 L14.8 7"/>',
    bookmark:    '<path d="M6.5 3.5 H17.5 V20.5 L12 16.5 L6.5 20.5 Z"/>',
    filter:      '<path d="M3.5 4.5 H20.5 L14.5 12 V19 L9.5 21 V12 Z"/>',
    layers:      '<path d="M12 3.5 L20.5 8 L12 12.5 L3.5 8 Z"/><path d="M4 12 L12 16.2 L20 12"/><path d="M4 16 L12 20.2 L20 16"/>',
    trash:       '<path d="M5 7 H19"/><path d="M9.5 7 V5.2 H14.5 V7"/><path d="M6.8 7 L7.7 19.2 a1 1 0 0 0 1 0.9 H14.5 a1 1 0 0 0 1 -0.9 L17.2 7"/>'
  };
  function content(name, size, color) {
    var inner = C[name] || "", s = size || 48, col = color || "currentColor";
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="' + col + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + "</svg>";
  }
  function contentNames() { return Object.keys(C); }

  function svg(name, size) {
    var inner = P[name] || "";
    var s = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      inner + "</svg>";
  }

  // Fill any element carrying data-icon with its icon (prepended, so labels follow).
  function hydrate(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (elm) {
      if (elm.dataset.iconDone) return;
      var sz = elm.classList.contains("tbtn") ? 18 : (elm.dataset.iconSize ? parseInt(elm.dataset.iconSize, 10) : 16);
      elm.insertAdjacentHTML("afterbegin", svg(elm.dataset.icon, sz));
      elm.dataset.iconDone = "1";
    });
  }

  global.MosaicIcons = { svg: svg, hydrate: hydrate, paths: P, content: content, contentNames: contentNames };
})(window);
