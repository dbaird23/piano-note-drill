// Note maths shared by the flashcard drill (app.js) and the scales page
// (scales.js): letter/octave spelling, staff positions and MIDI numbers.
(() => {
  "use strict";

  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ALTER = { "#": 1, "b": -1, "": 0 };

  // Diatonic step number: counts letter names, so C4 to D4 is one step and
  // C4 to C5 is seven. Staff position follows directly from it.
  function step(letter, oct) { return oct * 7 + LETTERS.indexOf(letter); }
  function letterOfStep(s) { return LETTERS[((s % 7) + 7) % 7]; }
  function octOfStep(s) { return Math.floor(s / 7); }

  function midiOf(letter, oct, acc) {
    return (oct + 1) * 12 + SEMI[letter] + (ALTER[acc || ""] || 0);
  }

  // How far the written note sits from its natural: +1 sharp, -1 flat.
  function alterOf(note) {
    return note.midi - ((note.oct + 1) * 12 + SEMI[note.letter]);
  }

  const ACC_GLYPH = { "-2": "𝄫", "-1": "♭", "0": "", "1": "♯", "2": "𝄪" };
  function accGlyph(note) { return ACC_GLYPH[String(alterOf(note))] || ""; }

  // Staff y at 6 units per diatonic step, with the bottom line at `bottom`.
  // The treble bottom line is E4; the bass bottom line is G2.
  function staffY(clef, letter, oct, bottom) {
    const base = clef === "treble" ? step("E", 4) : step("G", 2);
    return (bottom === undefined ? 68 : bottom) - 6 * (step(letter, oct) - base);
  }

  // Ledger lines every second staff position beyond the staff itself.
  function ledgersFor(y, top, bottom) {
    const t = top === undefined ? 20 : top;
    const b = bottom === undefined ? 68 : bottom;
    const out = [];
    for (let p = t - 12; p >= y; p -= 12) out.push(p);
    for (let p = b + 12; p <= y; p += 12) out.push(p);
    return out;
  }

  function nameOfMidi(m) {
    const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }

  function hzOf(midi, refA) { return (refA || 440) * Math.pow(2, (midi - 69) / 12); }

  window.Music = {
    LETTERS: LETTERS,
    SEMI: SEMI,
    step: step,
    letterOfStep: letterOfStep,
    octOfStep: octOfStep,
    midiOf: midiOf,
    alterOf: alterOf,
    accGlyph: accGlyph,
    staffY: staffY,
    ledgersFor: ledgersFor,
    nameOfMidi: nameOfMidi,
    hzOf: hzOf
  };
})();
