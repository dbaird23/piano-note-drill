// Scales & patterns: the Pre-Prep technique routine — major five-finger
// pattern hands separately, an open 5th held for four beats, then the
// hand-over-hand arpeggio — written on a grand staff in whichever key is
// being transposed to this week, and played back so the notes can be
// followed the way they would be in the lesson video.
(() => {
  "use strict";

  const M = window.Music;

  // The twelve keys of the Pre-Prep rotation, in the order the studio lists
  // them (round the circle of fifths). Enharmonic keys use the spelling a
  // pianist is most likely to meet on the page.
  const KEYS = [
    { id: "C", label: "C", letter: "C", acc: "", alt: "" },
    { id: "G", label: "G", letter: "G", acc: "", alt: "" },
    { id: "D", label: "D", letter: "D", acc: "", alt: "" },
    { id: "A", label: "A", letter: "A", acc: "", alt: "" },
    { id: "E", label: "E", letter: "E", acc: "", alt: "" },
    { id: "B", label: "B", letter: "B", acc: "", alt: "or C♭" },
    { id: "F#", label: "F♯", letter: "F", acc: "#", alt: "or G♭" },
    { id: "Db", label: "D♭", letter: "D", acc: "b", alt: "or C♯" },
    { id: "Ab", label: "A♭", letter: "A", acc: "b", alt: "" },
    { id: "Eb", label: "E♭", letter: "E", acc: "b", alt: "" },
    { id: "Bb", label: "B♭", letter: "B", acc: "b", alt: "" },
    { id: "F", label: "F", letter: "F", acc: "", alt: "" }
  ];

  // Positive = sharps, negative = flats.
  const KEY_SIGS = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1 };
  const SHARP_ORDER = [["F", 5], ["C", 5], ["G", 5], ["D", 5], ["A", 4], ["E", 5], ["B", 4]];
  const FLAT_ORDER = [["B", 4], ["E", 5], ["A", 4], ["D", 5], ["G", 4], ["C", 5], ["F", 4]];

  // Staff geometry in SVG units: 12 to a staff space, 6 to a diatonic step.
  const T_TOP = 20, T_BOT = 68;
  const BASS_DROP = 90;
  const B_TOP = T_TOP + BASS_DROP, B_BOT = T_BOT + BASS_DROP;
  const VB_TOP = -18, VB_BOT = 176;
  const LEFT = 12, CLEF_X = 18, SIG_X = 62, SIG_GAP = 11, HEAD_PAD = 26, END_PAD = 30;
  const BEAT_GAP = 36;
  const BEATS_PER_BAR = 4;
  const COUNT_IN = 4;

  // Each degree of the major five-finger pattern as [diatonic step, semitones]
  // above the tonic — "tonic, whole, whole, half, whole".
  const PENTACHORD = [[0, 0], [1, 2], [2, 4], [3, 5], [4, 7]];
  const PENTA_PATH = [0, 1, 2, 3, 4, 3, 2, 1, 0];
  // Hand-over-hand arpeggio of a 5th: [step, semitones, hand, staff].
  const ARPEGGIO = [
    [0, 0, "L", "bass"], [4, 7, "L", "bass"],
    [7, 12, "R", "treble"], [11, 19, "R", "treble"],
    [14, 24, "L", "treble"]
  ];

  const state = {
    keyId: "C",
    bpm: 80,
    playing: false,
    loop: true,
    click: true,
    names: true
  };

  let routine = null;
  let evNodes = [];
  let nowIdx = -2;
  let nowCount = -1;
  let nowSys = -1;

  let ac = null;
  let master = null;
  let runGain = null;
  let schedTimer = null;
  let restartTimer = null;
  let t0 = 0;          // audio time of beat 0, the first count-in beat
  let nextBeat = 0;    // next absolute beat still to be scheduled
  let endBeat = null;  // beat the run stops at, or null while looping

  const el = (id) => document.getElementById(id);
  const dom = {
    view: el("scalesView"),
    keyRow: el("keyRow"),
    keyName: el("scaleKeyName"),
    systems: el("systems"),
    btnPlay: el("btnScalePlay"),
    btnLoop: el("btnScaleLoop"),
    btnClick: el("btnScaleClick"),
    btnNames: el("btnScaleNames"),
    countIn: el("countInBadge"),
    bpmDown: el("scaleBpmDown"),
    bpmSlider: el("scaleBpmSlider"),
    bpmUp: el("scaleBpmUp"),
    bpmVal: el("scaleBpmVal")
  };

  // ---- Building the routine ------------------------------------------------

  // A note `dStep` diatonic steps and `semis` semitones above the tonic. The
  // letter comes from the step and the pitch from the semitones, so the
  // spelling stays correct in every key (E♯ in F♯, F♮ in D♭).
  function noteAt(tonic, dStep, semis, hand, staff) {
    const s = M.step(tonic.letter, tonic.oct) + dStep;
    return {
      letter: M.letterOfStep(s),
      oct: M.octOfStep(s),
      midi: tonic.midi + semis,
      hand: hand,
      staff: staff
    };
  }

  function fiveFinger(tonic, staff, hand) {
    return PENTA_PATH.map((d, i) => ({
      beats: i === PENTA_PATH.length - 1 ? 4 : 1,
      notes: [noteAt(tonic, PENTACHORD[d][0], PENTACHORD[d][1], hand, staff)]
    }));
  }

  function openFifth(rh, lh) {
    return [{
      beats: 4,
      notes: [
        noteAt(rh, 0, 0, "R", "treble"), noteAt(rh, 4, 7, "R", "treble"),
        noteAt(lh, 0, 0, "L", "bass"), noteAt(lh, 4, 7, "L", "bass")
      ]
    }];
  }

  function arpeggio(lh) {
    return ARPEGGIO.map((a, i) => ({
      beats: i === ARPEGGIO.length - 1 ? 4 : 1,
      notes: [noteAt(lh, a[0], a[1], a[2], a[3])]
    }));
  }

  function buildRoutine(keyId) {
    const key = KEYS.filter((k) => k.id === keyId)[0] || KEYS[0];
    // The right hand starts on the tonic in the octave above middle C; the
    // left hand plays the same pattern an octave below it.
    const rh = { letter: key.letter, oct: 4, midi: M.midiOf(key.letter, 4, key.acc) };
    const lh = { letter: key.letter, oct: 3, midi: rh.midi - 12 };

    const systems = [
      { id: "scales-rh", title: "Scales", sub: "Right hand · ascending and descending, one note per beat", events: fiveFinger(rh, "treble", "R") },
      { id: "scales-lh", title: "Scales", sub: "Left hand · the same pattern an octave lower", events: fiveFinger(lh, "bass", "L") },
      { id: "fifth", title: "Open 5th chord", sub: "Hands together · hold for four beats", events: openFifth(rh, lh) },
      { id: "arpeggio", title: "Arpeggio", sub: "Hand over hand, two octaves · ascending only", events: arpeggio(lh) }
    ];

    // Number every event twice: once within its system, so it can be drawn,
    // and once from the top of the routine, so it can be played and lit.
    const events = [];
    let abs = 0;
    systems.forEach((sys, si) => {
      let b = 0;
      sys.events.forEach((ev) => {
        ev.b = b;
        ev.abs = abs;
        ev.sys = si;
        ev.i = events.length;
        events.push(ev);
        b += ev.beats;
        abs += ev.beats;
      });
      sys.beats = b;
      sys.bars = Math.ceil(b / BEATS_PER_BAR);
    });

    // Which event is sounding on each beat, so a held note stays lit.
    const evAtBeat = [];
    events.forEach((ev) => {
      for (let k = 0; k < ev.beats; k++) evAtBeat[ev.abs + k] = ev.i;
    });

    return { key: key, sig: KEY_SIGS[key.id] || 0, systems: systems, events: events, evAtBeat: evAtBeat, beats: abs };
  }

  function lapBeats() { return COUNT_IN + routine.beats; }

  // ---- Drawing -------------------------------------------------------------

  function yOf(note) {
    return note.staff === "treble"
      ? M.staffY("treble", note.letter, note.oct, T_BOT)
      : M.staffY("bass", note.letter, note.oct, B_BOT);
  }

  function ledgersOf(note, y) {
    return note.staff === "treble"
      ? M.ledgersFor(y, T_TOP, T_BOT)
      : M.ledgersFor(y, B_TOP, B_BOT);
  }

  function staffLines(bottom, x2) {
    let s = "";
    for (let i = 0; i < 5; i++) {
      const y = bottom - i * 12;
      s += '<line class="staff-line" x1="' + LEFT + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '"></line>';
    }
    return s;
  }

  function keySigSvg(sig) {
    if (!sig) return "";
    const list = (sig > 0 ? SHARP_ORDER : FLAT_ORDER).slice(0, Math.abs(sig));
    const glyph = sig > 0 ? "&#xE262;" : "&#xE260;";
    let s = "";
    list.forEach((a, i) => {
      const x = SIG_X + i * SIG_GAP;
      // The bass-clef key signature sits on the same letters two octaves down.
      s += '<text class="sig" x="' + x + '" y="' + M.staffY("treble", a[0], a[1], T_BOT) + '">' + glyph + "</text>";
      s += '<text class="sig" x="' + x + '" y="' + M.staffY("bass", a[0], a[1] - 2, B_BOT) + '">' + glyph + "</text>";
    });
    return s;
  }

  function noteSvg(note, cx, isWhole) {
    const y = yOf(note);
    const mid = note.staff === "treble" ? (T_TOP + T_BOT) / 2 : (B_TOP + B_BOT) / 2;
    let s = '<circle class="halo" cx="' + cx + '" cy="' + y + '" r="15"></circle>';
    ledgersOf(note, y).forEach((ly) => {
      s += '<line class="ledger" x1="' + (cx - 14) + '" y1="' + ly + '" x2="' + (cx + 14) + '" y2="' + ly + '"></line>';
    });
    if (isWhole) {
      s += '<ellipse class="nh-open" cx="' + cx + '" cy="' + y + '" rx="10" ry="6.4"></ellipse>';
    } else {
      s += '<ellipse class="nh" cx="' + cx + '" cy="' + y + '" rx="8.4" ry="5.9" transform="rotate(-22 ' + cx + " " + y + ')"></ellipse>';
      const down = y < mid;
      s += '<rect class="stem" x="' + (down ? cx - 8 : cx + 6.2) + '" y="' + (down ? y : y - 30) + '" width="1.8" height="30"></rect>';
    }
    return s;
  }

  // A whole rest hangs under the second line down; it marks a bar the other
  // hand sits out, exactly as it is printed on the practice sheet.
  function restSvg(cx, bottom) {
    return '<rect class="rest" x="' + (cx - 7) + '" y="' + (bottom - 36) + '" width="14" height="6"></rect>';
  }

  function buildSystem(sys, sig) {
    const nAcc = Math.abs(sig);
    const startX = SIG_X + nAcc * SIG_GAP + HEAD_PAD;
    const width = startX + sys.beats * BEAT_GAP + END_PAD;
    const xOf = (b) => startX + b * BEAT_GAP;

    const rightX = width - 12;
    let s = '<g class="staff-frame">';
    s += staffLines(T_BOT, rightX);
    s += staffLines(B_BOT, rightX);
    s += '<line class="brace" x1="' + LEFT + '" y1="' + T_TOP + '" x2="' + LEFT + '" y2="' + B_BOT + '"></line>';
    s += "</g>";

    s += '<text class="clef" x="' + CLEF_X + '" y="56">&#xE050;</text>';
    s += '<text class="clef" x="' + CLEF_X + '" y="' + (32 + BASS_DROP) + '">&#xE062;</text>';
    s += keySigSvg(sig);

    // Bar lines through both staves, and a heavier one to close the system.
    for (let b = BEATS_PER_BAR; b < sys.beats; b += BEATS_PER_BAR) {
      s += '<line class="barline" x1="' + xOf(b) + '" y1="' + T_TOP + '" x2="' + xOf(b) + '" y2="' + B_BOT + '"></line>';
    }
    const endX = width - 14;
    s += '<line class="barline" x1="' + endX + '" y1="' + T_TOP + '" x2="' + endX + '" y2="' + B_BOT + '"></line>';
    s += '<rect class="barline-thick" x="' + (endX + 4) + '" y="' + T_TOP + '" width="4" height="' + (B_BOT - T_TOP) + '"></rect>';

    // Rests wherever a hand is silent for a whole bar.
    const busy = {};
    sys.events.forEach((ev) => {
      ev.notes.forEach((n) => {
        for (let k = 0; k < ev.beats; k++) busy[Math.floor((ev.b + k) / BEATS_PER_BAR) + ":" + n.staff] = true;
      });
    });
    for (let m = 0; m < sys.bars; m++) {
      const cx = xOf(m * BEATS_PER_BAR + BEATS_PER_BAR / 2);
      if (!busy[m + ":treble"]) s += restSvg(cx, T_BOT);
      if (!busy[m + ":bass"]) s += restSvg(cx, B_BOT);
    }

    let labels = "";
    sys.events.forEach((ev) => {
      const cx = xOf(ev.b);
      const isWhole = ev.beats >= 4;
      s += '<g class="ev" data-ev="' + ev.i + '">';
      ev.notes.forEach((n) => { s += noteSvg(n, cx, isWhole); });
      s += "</g>";

      const seen = [];
      ev.notes.forEach((n) => {
        const nm = n.letter + M.accGlyph(n);
        if (seen.indexOf(nm) === -1) seen.push(nm);
      });
      labels += '<div class="note-label" data-ev="' + ev.i + '" style="left: ' +
        ((cx / width) * 100).toFixed(2) + '%;">' + seen.join("–") + "</div>";
    });

    return '<div class="system" data-sys="' + sys.sysIdx + '">' +
      '<div class="system-head"><div class="system-title">' + sys.title + "</div>" +
      '<div class="system-sub">' + sys.sub + "</div></div>" +
      '<div class="staff-wrap" style="width: ' + ((width / routine.maxWidth) * 100).toFixed(2) + '%;">' +
      '<svg viewBox="0 ' + VB_TOP + " " + width + " " + (VB_BOT - VB_TOP) + '">' + s + "</svg>" +
      '<div class="note-labels">' + labels + "</div></div></div>";
  }

  function drawRoutine() {
    const sig = routine.sig;
    const nAcc = Math.abs(sig);
    routine.maxWidth = 0;
    routine.systems.forEach((sys, i) => {
      sys.sysIdx = i;
      const w = SIG_X + nAcc * SIG_GAP + HEAD_PAD + sys.beats * BEAT_GAP + END_PAD;
      if (w > routine.maxWidth) routine.maxWidth = w;
    });
    dom.systems.innerHTML = routine.systems.map((sys) => buildSystem(sys, sig)).join("");
    evNodes = Array.prototype.slice.call(dom.systems.querySelectorAll(".ev"));
    nowIdx = -2;
    nowSys = -1;
    setNow(-1, 0);
  }

  // ---- The follow-along highlight ------------------------------------------

  function setNow(i, countIn) {
    if (i === nowIdx && countIn === nowCount) return;
    nowIdx = i;
    nowCount = countIn;
    evNodes.forEach((node, k) => {
      node.classList.toggle("now", k === i);
      node.classList.toggle("played", i >= 0 && k < i);
    });
    dom.systems.querySelectorAll(".note-label").forEach((node) => {
      const k = Number(node.dataset.ev);
      node.classList.toggle("now", k === i);
      node.classList.toggle("played", i >= 0 && k < i);
    });
    dom.countIn.textContent = countIn > 0 ? countIn : "";
    dom.countIn.classList.toggle("on", countIn > 0);

    const ev = i >= 0 ? routine.events[i] : null;
    if (ev && ev.sys !== nowSys) {
      nowSys = ev.sys;
      revealSystem(ev.sys);
    }
    if (!ev) nowSys = -1;
  }

  // Bring the system being played into view, but only when it has drifted off
  // screen — scrolling on every note would fight whoever is reading.
  function revealSystem(si) {
    const node = dom.systems.children[si];
    if (!node) return;
    const r = node.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---- Sound ---------------------------------------------------------------

  function audio() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.9;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5200;
      master.connect(lp);
      lp.connect(ac.destination);
    }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }

  // A struck-string voice: a few partials under one percussive envelope that
  // decays while the key is held and releases when the note ends.
  const PARTIALS = [[1, 1], [2, 0.32], [3, 0.12], [4, 0.05]];
  const RELEASE = 0.4;

  function strike(ctx, hz, at, hold) {
    const g = ctx.createGain();
    g.connect(runGain);
    const peak = 0.13;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.3, at + Math.min(0.6, hold * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, at + hold + RELEASE);
    PARTIALS.forEach((p) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz * p[0];
      const og = ctx.createGain();
      og.gain.value = p[1];
      o.connect(og);
      og.connect(g);
      o.start(at);
      o.stop(at + hold + RELEASE + 0.05);
    });
  }

  function click(ctx, at, accent) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = accent ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.3 : 0.18, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    o.connect(g);
    g.connect(runGain);
    o.start(at);
    o.stop(at + 0.1);
  }

  // ---- Playback ------------------------------------------------------------

  const LOOKAHEAD = 0.3;
  // A background tab has its timers throttled to about a second, which would
  // starve a 0.3s window and break the sound up; commit further ahead there.
  const LOOKAHEAD_HIDDEN = 2.5;
  const SCHED_MS = 40;
  const MAX_CATCHUP = 512;

  function lookahead() { return document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD; }

  function play() {
    stop();
    let ctx;
    try { ctx = audio(); } catch (err) { return; }
    // Every run gets its own gain node. Stopping fades that node and throws
    // it away, so notes already committed to the audio clock — up to a
    // lookahead window of them — are silenced rather than left to ring.
    runGain = ctx.createGain();
    runGain.gain.value = 1;
    runGain.connect(master);
    t0 = ctx.currentTime + 0.15;
    nextBeat = 0;
    endBeat = null;
    state.playing = true;
    render();
    schedTick();
    schedTimer = setInterval(schedTick, SCHED_MS);
  }

  function stop() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (runGain && ac) {
      const g = runGain;
      const t = ac.currentTime;
      try {
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      } catch (err) { /* nothing scheduled */ }
      setTimeout(() => { try { g.disconnect(); } catch (err) { /* gone */ } }, 400);
      runGain = null;
    }
    state.playing = false;
    setNow(-1, 0);
    render();
  }

  // Everything audible is placed on the audio clock; this only tops the
  // schedule up and reads the clock back to move the highlight, so the
  // notation can never drift away from the sound.
  function schedTick() {
    if (!state.playing || !ac) return;
    const beat = 60 / state.bpm;
    const lap = lapBeats();

    // If the timer was throttled harder than the widened window covers, the
    // clock has already passed beats that were never scheduled. Step over
    // them rather than firing a burst of notes that are all late.
    let skipped = 0;
    while (t0 + nextBeat * beat < ac.currentTime - 0.02 && skipped++ < MAX_CATCHUP) nextBeat++;

    while (t0 + nextBeat * beat < ac.currentTime + lookahead()) {
      const k = nextBeat;
      // Turning the loop off lets the run finish, then stops at the top.
      if (!state.loop && k > 0 && k % lap === 0) { endBeat = k; break; }
      const pos = k % lap;
      const at = t0 + k * beat;
      if (state.click) click(ac, at, pos % BEATS_PER_BAR === 0);
      if (pos >= COUNT_IN) {
        const ev = routine.events[routine.evAtBeat[pos - COUNT_IN]];
        if (ev && ev.abs === pos - COUNT_IN) {
          ev.notes.forEach((n) => strike(ac, M.hzOf(n.midi), at, ev.beats * beat * 0.9));
        }
      }
      nextBeat++;
    }

    const raw = (ac.currentTime - t0) / beat;
    if (endBeat !== null && raw >= endBeat) { stop(); return; }
    if (raw < 0) { setNow(-1, COUNT_IN); return; }
    const pos = raw % lap;
    if (pos < COUNT_IN) { setNow(-1, COUNT_IN - Math.floor(pos)); return; }
    setNow(routine.evAtBeat[Math.floor(pos - COUNT_IN)], 0);
  }

  function setBpm(v) {
    state.bpm = Math.min(160, Math.max(40, Math.round(v)));
    render();
    // Tempo is baked into the schedule, so a change has to start it again.
    if (state.playing) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(play, 220);
    }
  }

  function setKey(id) {
    stop();
    state.keyId = id;
    routine = buildRoutine(id);
    drawRoutine();
    render();
  }

  // ---- Rendering the controls ---------------------------------------------

  function render() {
    if (!routine) return;
    const key = routine.key;
    dom.keyName.textContent = "Key of " + key.label + (key.alt ? " " + key.alt : "");
    Array.prototype.slice.call(dom.keyRow.children).forEach((b) => {
      b.classList.toggle("active", b.dataset.key === state.keyId);
    });

    dom.btnPlay.textContent = state.playing ? "Stop" : "Play";
    dom.btnPlay.classList.toggle("stopping", state.playing);
    dom.btnLoop.textContent = state.loop ? "Loop on" : "Loop off";
    dom.btnLoop.classList.toggle("off", !state.loop);
    dom.btnClick.textContent = state.click ? "Click on" : "Click off";
    dom.btnClick.classList.toggle("off", !state.click);
    dom.btnNames.textContent = state.names ? "Note names on" : "Note names off";
    dom.btnNames.classList.toggle("off", !state.names);
    dom.systems.classList.toggle("hide-names", !state.names);

    dom.bpmVal.textContent = state.bpm;
    if (document.activeElement !== dom.bpmSlider) dom.bpmSlider.value = state.bpm;
  }

  // ---- Wiring --------------------------------------------------------------

  dom.keyRow.innerHTML = KEYS.map((k) =>
    '<button class="seg-btn" data-key="' + k.id + '">' + k.label + "</button>"
  ).join("");
  dom.keyRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-key]");
    if (b) setKey(b.dataset.key);
  });

  dom.btnPlay.addEventListener("click", () => (state.playing ? stop() : play()));
  dom.btnLoop.addEventListener("click", () => {
    state.loop = !state.loop;
    // Turning it back on before the last lap has run out keeps the run going.
    if (state.loop) endBeat = null;
    render();
  });
  dom.btnClick.addEventListener("click", () => { state.click = !state.click; render(); });
  dom.btnNames.addEventListener("click", () => { state.names = !state.names; render(); });
  dom.bpmSlider.addEventListener("input", (e) => setBpm(Number(e.target.value)));
  dom.bpmUp.addEventListener("click", () => setBpm(state.bpm + 1));
  dom.bpmDown.addEventListener("click", () => setBpm(state.bpm - 1));

  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.view !== "scales") return;
    if (e.target.matches("input, select, textarea")) return;
    if (e.key === " ") { e.preventDefault(); state.playing ? stop() : play(); }
  });

  // ---- Tabs ----------------------------------------------------------------

  const tabs = { cards: el("tabCards"), scales: el("tabScales") };
  function setView(view) {
    if (document.body.dataset.view === view) return;
    if (view !== "scales") stop();
    document.body.dataset.view = view;
    Object.keys(tabs).forEach((k) => tabs[k].classList.toggle("active", k === view));
    window.dispatchEvent(new CustomEvent("viewchange", { detail: { view: view } }));
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  tabs.cards.addEventListener("click", () => setView("cards"));
  tabs.scales.addEventListener("click", () => setView("scales"));

  setKey(state.keyId);
})();
