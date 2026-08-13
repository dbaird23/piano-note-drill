// Piano note drill — flashcards with metronome, mic pitch detection,
// a guided mic-setup dialog, and a scored listening round.
(() => {
  "use strict";

  const M = window.Music;
  const LETTERS = M.LETTERS;
  const step = M.step;
  const midiOf = M.midiOf;
  const staffY = M.staffY;
  const ledgersFor = M.ledgersFor;
  const nameOfMidi = M.nameOfMidi;

  const MIN_MIDI = 41; // F2
  const MAX_MIDI = 84; // C6
  const GAME_LENGTH = 20;

  function position(y) {
    if (y === 74) return "just below the staff";
    if (y === 14) return "just above the staff";
    if (y > 68) return "ledger line below";
    if (y < 20) return y === 8 ? "ledger line above" : "high above the staff";
    const n = (68 - y) / 6;
    const ord = ["1st", "2nd", "3rd", "4th", "5th"];
    return n % 2 === 0 ? ord[n / 2] + " line" : ord[(n - 1) / 2] + " space";
  }

  const LANDMARKS = {
    "bass-C3": "bass C", "bass-F3": "bass F", "bass-C4": "middle C",
    "treble-C4": "middle C", "treble-G4": "treble G", "treble-C5": "treble C", "treble-C6": "high C"
  };

  function makeCard(clef, letter, oct, acc) {
    const y = staffY(clef, letter, oct);
    const key = clef + "-" + letter + oct;
    const mark = !acc && LANDMARKS[key];
    const glyph = acc === "#" ? "♯" : acc === "b" ? "♭" : "";
    return {
      id: key + (acc || ""),
      clef, letter, oct, acc: acc || null, y,
      midi: midiOf(letter, oct, acc),
      ledgers: ledgersFor(y),
      name: letter + glyph,
      sub: letter + glyph + oct + " · " + (mark ? mark : position(y)),
      landmark: !!mark
    };
  }

  function naturalsBetween(clef, loLetter, loOct, hiLetter, hiOct) {
    const out = [];
    for (let s = step(loLetter, loOct); s <= step(hiLetter, hiOct); s++) {
      out.push(makeCard(clef, LETTERS[((s % 7) + 7) % 7], Math.floor(s / 7)));
    }
    return out;
  }

  const DECKS = {
    landmarks: () => ["bass-C3", "bass-F3", "bass-C4", "treble-C4", "treble-G4", "treble-C5", "treble-C6"]
      .map((k) => { const p = k.split("-"); return makeCard(p[0], p[1][0], Number(p[1].slice(1))); }),
    treble: () => naturalsBetween("treble", "C", 4, "G", 5),
    bass: () => naturalsBetween("bass", "F", 2, "C", 4),
    all: () => naturalsBetween("bass", "F", 2, "C", 4).concat(naturalsBetween("treble", "C", 4, "C", 6))
  };

  function withAccidentals(cards, on) {
    if (!on) return cards;
    const out = [];
    cards.forEach((c) => {
      out.push(c);
      if (c.letter !== "E" && c.letter !== "B" && midiOf(c.letter, c.oct, "#") <= MAX_MIDI) out.push(makeCard(c.clef, c.letter, c.oct, "#"));
      if (c.letter !== "C" && c.letter !== "F" && midiOf(c.letter, c.oct, "b") >= MIN_MIDI) out.push(makeCard(c.clef, c.letter, c.oct, "b"));
    });
    return out;
  }

  // ACF2+ autocorrelation pitch detection.
  function detectPitch(buf, sampleRate) {
    const size = buf.length;
    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < 0.010) return -1;

    const thres = 0.2;
    let r1 = 0, r2 = size - 1;
    for (let i = 0; i < size / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < size / 2; i++) if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
    const b = buf.slice(r1, r2);
    const n = b.length;
    const c = new Float32Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) c[i] += b[j] * b[j + i];

    let d = 0;
    while (d < n - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < n; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    let T0 = maxpos;
    if (T0 <= 0) return -1;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);
    const f = sampleRate / T0;
    return f > 70 && f < 1500 ? f : -1;
  }

  function shuffled(len, prevLast) {
    const a = [];
    for (let i = 0; i < len; i++) a.push(i);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    if (a[0] === prevLast && a.length > 1) { const t = a[0]; a[0] = a[1]; a[1] = t; }
    return a;
  }

  const state = {
    deck: "landmarks",
    accidentals: false,
    cards: [],
    order: [],
    idx: 0,
    flipped: false,
    playing: false,
    bpm: 60,
    beatsPerCard: 4,
    sound: true,
    autoFlip: true,
    beat: 0,
    listening: false,
    refA: 440,
    micError: "",
    heardMidi: null,
    cents: 0,
    judged: null,
    mode: "practice",
    gameOrder: [],
    gameIdx: 0,
    score: 0,
    results: [],
    cardResult: null,
    dialogStep: 0,
    level: 0,
    calHz: 0,
    checkIdx: 0
  };
  state.cards = withAccidentals(DECKS[state.deck](), state.accidentals);
  state.order = shuffled(state.cards.length, -1);

  let ac = null;
  let timer = null;
  let swapTimer = null;
  let wrongTimer = null;
  let raf = null;
  let stream = null;
  let analyser = null;
  let buf = null;
  let dec = null;
  let stableMidi = null;
  let stableCount = 0;
  let judgeLock = false;
  let scored = false;
  let calBuf = [];
  let frame = 0;
  let keysMidi = -1;

  const el = (id) => document.getElementById(id);
  const dom = {
    heading: el("heading"),
    counter: el("counter"),
    btnAccidentals: el("btnAccidentals"),
    card: el("card"),
    cardInner: el("cardInner"),
    cardFront: el("cardFront"),
    clefTreble: el("clefTreble"),
    clefBass: el("clefBass"),
    ledgerGroup: el("ledgerGroup"),
    accSharp: el("accSharp"),
    accFlat: el("accFlat"),
    noteHead: el("noteHead"),
    noteStem: el("noteStem"),
    noteName: el("noteName"),
    noteHint: el("noteHint"),
    keysWrap: el("keysWrap"),
    btnPrev: el("btnPrev"),
    btnPlay: el("btnPlay"),
    btnNext: el("btnNext"),
    btnGame: el("btnGame"),
    bpmDown: el("bpmDown"),
    bpmSlider: el("bpmSlider"),
    bpmUp: el("bpmUp"),
    bpmVal: el("bpmVal"),
    beatsSelect: el("beatsSelect"),
    btnAutoFlip: el("btnAutoFlip"),
    btnSound: el("btnSound"),
    beatDots: el("beatDots"),
    btnListen: el("btnListen"),
    heardLabel: el("heardLabel"),
    centsMarker: el("centsMarker"),
    centsLabel: el("centsLabel"),
    refDown: el("refDown"),
    refInput: el("refInput"),
    refUp: el("refUp"),
    resultOverlay: el("resultOverlay"),
    resultTempo: el("resultTempo"),
    scoreVal: el("scoreVal"),
    resultLine: el("resultLine"),
    resultChips: el("resultChips"),
    missedLine: el("missedLine"),
    btnExitGame: el("btnExitGame"),
    btnPlayAgain: el("btnPlayAgain"),
    dialogOverlay: el("dialogOverlay"),
    dialogTitle: el("dialogTitle"),
    dialogStepLabel: el("dialogStepLabel"),
    dialogBody: el("dialogBody"),
    levelFill: el("levelFill"),
    levelLabel: el("levelLabel"),
    tunePanel: el("tunePanel"),
    calLabel: el("calLabel"),
    dialogRefA: el("dialogRefA"),
    scaleGrid: el("scaleGrid"),
    btnDialogCancel: el("btnDialogCancel"),
    btnDialogSkip: el("btnDialogSkip"),
    btnDialogNext: el("btnDialogNext")
  };
  const deckButtons = Array.prototype.slice.call(document.querySelectorAll("[data-deck]"));

  function currentCard() {
    const s = state;
    return (s.mode === "game" ? s.cards[s.gameOrder[s.gameIdx]] : s.cards[s.order[s.idx]]) || s.cards[0];
  }

  function setDeck(deck, accidentals) {
    stopClock();
    state.deck = deck;
    state.accidentals = accidentals;
    state.cards = withAccidentals(DECKS[deck](), accidentals);
    state.order = shuffled(state.cards.length, -1);
    state.idx = 0;
    state.flipped = false;
    state.playing = false;
    state.beat = 0;
    state.mode = "practice";
    state.checkIdx = 0;
    render();
  }

  function tick(accent) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = accent ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(accent ? 0.22 : 0.12, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.09);
    } catch (err) { /* audio unavailable */ }
  }

  async function startGame() {
    if (!state.listening) {
      await startListening();
      // mic denied — the Listen pill shows why; otherwise let the user finish
      // the mic check, then start the round.
      return;
    }
    const n = state.cards.length;
    const seq = [];
    while (seq.length < GAME_LENGTH) {
      const i = Math.floor(Math.random() * n);
      if (seq.length && seq[seq.length - 1] === i) continue;
      seq.push(i);
    }
    scored = false;
    stopClock();
    state.mode = "game";
    state.gameOrder = seq;
    state.gameIdx = 0;
    state.score = 0;
    state.results = [];
    state.cardResult = null;
    state.flipped = false;
    state.playing = true;
    state.beat = 0;
    state.judged = null;
    render();
    startClock();
  }

  function endGame() {
    stopClock();
    state.mode = "result";
    state.playing = false;
    state.beat = 0;
    render();
  }

  function exitGame() {
    stopClock();
    state.mode = "practice";
    state.playing = false;
    state.beat = 0;
    state.cardResult = null;
    state.flipped = false;
    render();
  }

  function startClock() {
    stopClock();
    if (state.mode === "game") {
      const gameBeat = () => {
        const next = state.beat + 1;
        if (next > state.beatsPerCard) {
          const card = state.cards[state.gameOrder[state.gameIdx]];
          state.results = state.results.concat([
            { name: card.name + card.oct, hit: state.cardResult === "right" }
          ]);
          if (state.gameIdx + 1 >= state.gameOrder.length) {
            state.beat = 0;
            endGame();
            return;
          }
          tick(true);
          scored = false;
          stableMidi = null; stableCount = 0;
          state.beat = 1;
          state.gameIdx++;
          state.cardResult = null;
        } else {
          tick(next === 1);
          state.beat = next;
        }
        render();
      };
      timer = setInterval(gameBeat, 60000 / state.bpm);
      gameBeat();
      return;
    }
    const beat = () => {
      const next = state.beat + 1;
      // beats 1..N show the note; with auto-flip on, the beat after that
      // reveals the answer before we move on.
      const cycle = state.beatsPerCard + (state.autoFlip ? 1 : 0);
      if (next > cycle) {
        tick(true);
        swapCard(state.flipped);
        state.beat = 1;
        state.flipped = false;
      } else {
        tick(next === 1);
        state.beat = next;
        state.flipped = state.autoFlip ? next > state.beatsPerCard : state.flipped;
      }
      render();
    };
    timer = setInterval(beat, 60000 / state.bpm);
    beat();
  }

  function stopClock() { if (timer) { clearInterval(timer); timer = null; } }

  function toggle() {
    if (state.playing) {
      stopClock();
      state.playing = false;
      state.beat = 0;
      render();
    } else {
      state.playing = true;
      state.flipped = false;
      state.beat = 0;
      render();
      startClock();
    }
  }

  // When the card is showing its back, swap the note only once the card is
  // edge-on mid-flip, so the next note is never visible on the way round.
  function swapCard(wasFlipped, step) {
    const dir = step || 1;
    const go = () => {
      const i = state.idx + dir;
      if (i >= state.order.length) {
        state.idx = 0;
        state.order = shuffled(state.cards.length, state.order[state.order.length - 1]);
      } else if (i < 0) {
        state.idx = state.order.length - 1;
      } else {
        state.idx = i;
      }
      render();
    };
    if (swapTimer) clearTimeout(swapTimer);
    if (wasFlipped) swapTimer = setTimeout(go, 210);
    else go();
  }

  function advance() {
    swapCard(state.flipped, 1);
    state.flipped = false;
    state.beat = state.playing ? 1 : 0;
    render();
  }

  function back() {
    swapCard(state.flipped, -1);
    state.flipped = false;
    render();
  }

  function flip() {
    state.flipped = !state.flipped;
    render();
  }

  async function startListening() {
    state.micError = "";
    render();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") await ac.resume();
      const src = ac.createMediaStreamSource(stream);
      analyser = ac.createAnalyser();
      analyser.fftSize = 4096;
      src.connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      dec = null;
      stableMidi = null;
      stableCount = 0;
      calBuf = [];
      frame = 0;
      state.listening = true;
      state.micError = "";
      state.heardMidi = null;
      state.judged = null;
      state.dialogStep = 1;
      state.level = 0;
      state.calHz = 0;
      state.checkIdx = 0;
      render();
      pollPitch();
    } catch (err) {
      state.micError = "Mic blocked";
      state.listening = false;
      render();
    }
  }

  function stopListening() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    analyser = null;
    state.listening = false;
    state.heardMidi = null;
    state.judged = null;
    state.cents = 0;
    state.dialogStep = 0;
    state.level = 0;
    render();
  }

  function pollPitch() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    // decimate by 2: keeps the long window low piano notes need without the
    // O(n^2) autocorrelation cost of a 4096-sample buffer
    if (!dec) dec = new Float32Array(buf.length / 2);
    for (let i = 0, j = 0; j < dec.length; i += 2, j++) dec[j] = (buf[i] + buf[i + 1]) * 0.5;
    const f = detectPitch(dec, ac.sampleRate / 2);

    frame++;
    if (frame % 3 === 0) {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, rms * 9);
      state.level = level > state.level ? level : state.level * 0.82 + level * 0.18;
      render();
    }

    if (state.dialogStep === 2) {
      // Accept anything near concert A (380–500 Hz) so slightly flat or sharp
      // pianos still calibrate.
      if (f > 380 && f < 500) {
        calBuf.push(f);
        if (calBuf.length > 15) calBuf.shift();
        if (calBuf.length >= 6) {
          const sorted = calBuf.slice().sort((a, b) => a - b);
          state.calHz = Math.round(sorted[Math.floor(sorted.length / 2)]);
          render();
        }
      }
      raf = requestAnimationFrame(pollPitch);
      return;
    }

    if (f > 0) {
      const exact = 69 + 12 * Math.log2(f / state.refA);
      const midi = Math.round(exact);
      const cents = Math.round((exact - midi) * 100);
      if (midi >= MIN_MIDI - 12 && midi <= MAX_MIDI + 12) {
        if (stableMidi === midi) stableCount++;
        else { stableMidi = midi; stableCount = 1; }
        if (stableCount === 4) {
          if (state.dialogStep === 3) checkScale(midi);
          else if (state.mode === "game") gameJudge(midi);
          else if (!state.dialogStep) judge(midi);
        }
        state.heardMidi = midi;
        state.cents = cents;
        render();
      }
    } else if (state.heardMidi) {
      stableMidi = null; stableCount = 0;
      state.heardMidi = null;
      state.cents = 0;
      render();
    }
    raf = requestAnimationFrame(pollPitch);
  }

  // Unique naturals in the deck, lowest to highest, for the play-through check.
  function checkList() {
    const seen = {};
    return state.cards.filter((c) => {
      if (c.acc || seen[c.midi]) return false;
      seen[c.midi] = 1;
      return true;
    }).sort((a, b) => a.midi - b.midi);
  }

  function checkScale(midi) {
    const list = checkList();
    const i = state.checkIdx;
    if (i >= list.length) return;
    if (midi === list[i].midi) {
      stableMidi = null; stableCount = 0;
      state.checkIdx = i + 1;
      state.judged = "right";
      render();
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => { state.judged = null; render(); }, 500);
    } else {
      state.judged = "wrong";
      render();
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => { state.judged = null; render(); }, 700);
    }
  }

  function gameJudge(midi) {
    if (scored) return;
    const target = state.cards[state.gameOrder[state.gameIdx]];
    if (!target) return;
    if (midi === target.midi) {
      scored = true;
      state.score++;
      state.cardResult = "right";
    } else {
      state.cardResult = "wrong";
    }
    render();
  }

  function judge(midi) {
    if (judgeLock) return;
    const target = state.cards[state.order[state.idx]];
    if (!target) return;
    if (midi === target.midi) {
      judgeLock = true;
      state.judged = "right";
      state.flipped = true;
      render();
      setTimeout(() => {
        judgeLock = false;
        stableMidi = null; stableCount = 0;
        state.judged = null;
        render();
        advance();
      }, 1000);
    } else {
      state.judged = "wrong";
      render();
      clearTimeout(wrongTimer);
      wrongTimer = setTimeout(() => { state.judged = null; render(); }, 700);
    }
  }

  // Concert pitch is 440; the narrow range still absorbs a piano that has
  // drifted a little flat or sharp between tunings.
  function setRef(v) {
    if (!Number.isFinite(v)) { render(); return; }
    state.refA = Math.min(460, Math.max(420, Math.round(v)));
    render();
  }

  function setBpm(v) {
    state.bpm = Math.min(160, Math.max(30, v));
    render();
    if (state.playing) startClock();
  }

  // Mini keyboard on the card back: F2–C6 with the target key highlighted.
  // The white keys share the width evenly and the black keys are placed as a
  // percentage across, so the whole keyboard scales with the card.
  function keyboardHtml(targetMidi) {
    const blackSet = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
    let whites = "";
    let blacks = "";
    let count = 0;
    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) if (!blackSet[m % 12]) count++;

    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      const pc = m % 12;
      if (blackSet[pc]) continue;
      const on = m === targetMidi;
      whites += '<div class="kb-w' + (on ? " on" : "") + '">' +
        (pc === 0 ? '<div class="kb-c' + (m === 60 ? " kb-mid" : "") + '">' + (m === 60 ? "C4" : "·") + "</div>" : "") +
        "</div>";
    }

    // A black key straddles the join between the two white keys it sits between.
    let idx = -1;
    for (let m = MIN_MIDI; m <= MAX_MIDI; m++) {
      const pc = m % 12;
      if (!blackSet[pc]) { idx++; continue; }
      if (idx < 0) continue;
      const on = m === targetMidi;
      blacks += '<div class="kb-b' + (on ? " on" : "") + '" style="left: ' +
        (((idx + 1) / count) * 100).toFixed(3) + "%; width: " +
        ((100 * (2 / 3)) / count).toFixed(3) + '%;"></div>';
    }
    return '<div class="kb-whites">' + whites + "</div>" + blacks;
  }

  const roundBtn = "height: 44px; padding: 0 22px; border-radius: 999px; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; cursor: pointer; border: 1px solid ";

  const DIALOG_TITLES = ["", "Is the mic hearing the piano?", "Tune to your piano", "Play through the deck"];
  const DIALOG_BODIES = [
    "",
    "Play a few keys. The input meter should move with the sound. If it stays flat, check that the right microphone is selected and that nothing else is using it.",
    "Hold down the A above middle C — the white key just right of the two-black-key group, in the middle of the keyboard. Every other note is measured from it, so a slightly out-of-tune piano still reads correctly.",
    "Play each note in the deck, lowest to highest. Each one turns green when the app hears what it expects. If a note refuses to register, go back and re-tune the A."
  ];

  function render() {
    const s = state;
    const inGame = s.mode === "game";
    const card = currentCard();

    dom.heading.textContent = inGame ? "Listening round" : "Piano note drill";
    dom.counter.textContent = inGame
      ? (s.gameIdx + 1) + " / " + GAME_LENGTH + " · score " + s.score
      : (s.idx + 1) + " / " + s.order.length;

    deckButtons.forEach((b) => b.classList.toggle("active", b.dataset.deck === s.deck));
    dom.btnAccidentals.textContent = s.accidentals ? "Sharps & flats on" : "Sharps & flats off";
    dom.btnAccidentals.classList.toggle("acc-on", s.accidentals);
    dom.btnAccidentals.classList.toggle("acc-off", !s.accidentals);

    // Card front: clef, ledgers, accidental, note head and stem.
    dom.clefTreble.style.display = card.clef === "treble" ? "" : "none";
    dom.clefBass.style.display = card.clef === "bass" ? "" : "none";
    dom.ledgerGroup.innerHTML = card.ledgers.map((y) =>
      '<line x1="103" y1="' + y + '" x2="133" y2="' + y + '"></line>'
    ).join("");
    dom.accSharp.style.display = card.acc === "#" ? "" : "none";
    dom.accFlat.style.display = card.acc === "b" ? "" : "none";
    dom.accSharp.setAttribute("y", card.y);
    dom.accFlat.setAttribute("y", card.y);
    dom.noteHead.setAttribute("cy", card.y);
    dom.noteHead.setAttribute("transform", "rotate(-22 118 " + card.y + ")");
    // The -22° rotation makes the head's true half-width ~8.1, not rx=8.4;
    // keep the stem flush against that edge so it doesn't float off the head.
    const stemDown = card.y < 44;
    dom.noteStem.setAttribute("x", stemDown ? 110 : 124.2);
    dom.noteStem.setAttribute("y", stemDown ? card.y : card.y - 30);

    dom.noteName.textContent = card.name;
    dom.noteHint.textContent = card.sub;
    if (keysMidi !== card.midi) {
      keysMidi = card.midi;
      dom.keysWrap.innerHTML = keyboardHtml(card.midi);
    }

    dom.cardInner.classList.toggle("flipped", s.flipped);
    // While a modal is up, the card must not intercept clicks meant for the
    // modal's buttons (Safari routes them to the 3D flip layer otherwise).
    dom.card.style.pointerEvents = (s.dialogStep > 0 || s.mode === "result") ? "none" : "";
    dom.cardFront.style.borderColor =
      s.cardResult === "right" ? "#8a9a7b" : s.cardResult === "wrong" ? "#c98d83" : "#dccfc8";
    dom.cardFront.style.background =
      s.cardResult === "right" ? "#edf3e6" : s.cardResult === "wrong" ? "#fbeeeb" : "#ffffff";

    dom.btnPlay.textContent = s.playing ? "Pause" : "Play";
    dom.btnPlay.style.cssText = roundBtn + (s.playing
      ? "#997373; background: #997373; color: #fff;"
      : "#2a2120; background: #2a2120; color: #fff;");

    dom.btnGame.textContent = inGame ? "End round" : "Listening round";
    dom.btnGame.style.cssText = roundBtn + (inGame
      ? "#997373; background: #ffffff; color: #997373;"
      : "#dccfc8; background: #ffffff; color: #2a2120;");

    dom.btnSound.textContent = s.sound ? "Click on" : "Click off";
    dom.btnSound.style.cssText = roundBtn + (s.sound
      ? "#dccfc8; background: #f7f1ee; color: #2a2120;"
      : "#e8ded9; background: #ffffff; color: #b3a49d;");

    dom.btnAutoFlip.textContent = s.autoFlip ? "Auto-flip on" : "Auto-flip off";
    dom.btnAutoFlip.style.cssText = roundBtn + (s.autoFlip
      ? "#dccfc8; background: #f7f1ee; color: #2a2120;"
      : "#e8ded9; background: #ffffff; color: #b3a49d;");

    dom.bpmVal.textContent = s.bpm;
    if (document.activeElement !== dom.bpmSlider) dom.bpmSlider.value = s.bpm;
    if (document.activeElement !== dom.beatsSelect) dom.beatsSelect.value = String(s.beatsPerCard);

    const cycle = inGame ? s.beatsPerCard : s.beatsPerCard + (s.autoFlip ? 1 : 0);
    let dotsHtml = "";
    for (let i = 1; i <= cycle; i++) {
      const on = s.playing && s.beat === i;
      const answer = !inGame && s.autoFlip && i === cycle;
      dotsHtml += '<div style="width: ' + (on ? 12 : 8) + "px; height: " + (on ? 12 : 8) +
        "px; border-radius: 999px; transition: all 90ms linear; background: " +
        (on ? "#997373" : answer ? "#ded2cc" : "#e8ded9") +
        "; border: " + (answer && !on ? "1px solid #cbbab2" : "0") + ';"></div>';
    }
    dom.beatDots.innerHTML = dotsHtml;

    dom.btnListen.textContent = s.micError ? s.micError : s.listening ? "Listening" : "Listen";
    dom.btnListen.style.cssText = roundBtn + (s.listening
      ? "#8a9a7b; background: #8a9a7b; color: #fff;"
      : "#dccfc8; background: #ffffff; color: #2a2120;");

    dom.heardLabel.textContent = !s.listening ? "Off" : s.heardMidi ? nameOfMidi(s.heardMidi) : "—";
    dom.heardLabel.style.color =
      s.judged === "right" ? "#5f7a4a" :
      s.judged === "wrong" ? "#a85a4e" :
      s.heardMidi ? "#2a2120" : "#c2b4ad";

    dom.centsLabel.textContent = s.listening && s.heardMidi ? (s.cents > 0 ? "+" : "") + s.cents + "¢" : "";
    dom.centsMarker.style.opacity = s.heardMidi ? 1 : 0;
    dom.centsMarker.style.left = Math.round(48 + Math.max(-48, Math.min(48, (s.cents / 50) * 45)) - 3) + "px";
    dom.centsMarker.style.background = Math.abs(s.cents) < 15 ? "#8a9a7b" : "#997373";

    if (document.activeElement !== dom.refInput) dom.refInput.value = s.refA;

    // Result modal
    dom.resultOverlay.style.display = s.mode === "result" ? "flex" : "none";
    if (s.mode === "result") {
      dom.resultTempo.textContent = s.bpm + " bpm · " + s.beatsPerCard +
        (s.beatsPerCard === 1 ? " beat a card" : " beats a card");
      dom.scoreVal.textContent = s.score;
      dom.resultLine.textContent = s.score === 0
        ? (s.listening ? "Nothing registered — check the mic and the tuning setting." : "The mic was off, so nothing could be scored.")
        : s.score === GAME_LENGTH ? "Clean round."
        : s.score >= 15 ? "Solid — tidy up the misses."
        : s.score >= 8 ? "Getting there. Try a slower tempo."
        : "Slow the tempo down and go back to the landmarks.";
      dom.resultChips.innerHTML = s.results.map((r) =>
        '<div style="font-size: 12px; letter-spacing: 0.06em; padding: 7px 11px; border-radius: 999px; white-space: nowrap; border: 1px solid ' +
        (r.hit ? "#c3d0b6; background: #eef2e8; color: #556b41;" : "#e0bdb7; background: #fbf1ef; color: #a85a4e;") +
        '">' + r.name + "</div>"
      ).join("");
      const missed = s.results.filter((r) => !r.hit).map((r) => r.name);
      dom.missedLine.style.display = missed.length ? "" : "none";
      dom.missedLine.textContent = missed.length ? "Missed: " + missed.join(", ") : "";
    }

    // Listening dialog
    dom.dialogOverlay.style.display = s.dialogStep > 0 ? "flex" : "none";
    if (s.dialogStep > 0) {
      dom.dialogTitle.textContent = DIALOG_TITLES[s.dialogStep];
      dom.dialogStepLabel.textContent = "Step " + Math.min(3, s.dialogStep) + " of 3";
      dom.dialogBody.textContent = DIALOG_BODIES[s.dialogStep];

      dom.levelFill.style.width = Math.round(s.level * 100) + "%";
      dom.levelFill.style.background = s.level > 0.06 ? "#8a9a7b" : "#ded2cc";
      dom.levelLabel.textContent = s.level > 0.06 ? "Sound" : "Silent";

      dom.tunePanel.style.display = s.dialogStep === 2 ? "flex" : "none";
      if (s.dialogStep === 2) {
        dom.calLabel.textContent = s.calHz ? s.calHz + " Hz" : "—";
        dom.dialogRefA.textContent = s.refA + " Hz";
      }

      const checks = checkList();
      dom.scaleGrid.style.display = s.dialogStep === 3 ? "grid" : "none";
      if (s.dialogStep === 3) {
        dom.scaleGrid.innerHTML = checks.map((n, i) =>
          '<div style="font-size: 12px; letter-spacing: 0.06em; text-align: center; padding: 9px 4px; border-radius: 8px; white-space: nowrap; border: 1px solid ' +
          (i < s.checkIdx ? "#c3d0b6; background: #eef2e8; color: #556b41;"
            : i === s.checkIdx ? (s.judged === "wrong" ? "#e0bdb7; background: #fbf1ef; color: #a85a4e;" : "#997373; background: #ffffff; color: #2a2120;")
            : "#eee5e0; background: #ffffff; color: #bfb0a9;") +
          '">' + n.name + n.oct + "</div>"
        ).join("");
      }

      dom.btnDialogNext.textContent =
        s.dialogStep === 1 ? "Sounds right"
        : s.dialogStep === 2 ? (s.calHz ? "Use " + s.calHz + " Hz" : "Waiting…")
        : s.checkIdx >= checks.length ? "Start practising" : "Done checking";
      dom.btnDialogNext.style.cssText =
        "height: 40px; padding: 0 22px; border-radius: 999px; font-family: 'Jost', sans-serif; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; cursor: pointer; border: 1px solid " +
        (s.dialogStep === 2 && !s.calHz
          ? "#e8ded9; background: #f7f1ee; color: #b3a49d;"
          : "#2a2120; background: #2a2120; color: #fff;");
    }
  }

  function dialogNext() {
    const s = state;
    if (s.dialogStep === 1) {
      s.dialogStep = 2;
      s.calHz = 0;
      calBuf = [];
      render();
    } else if (s.dialogStep === 2) {
      if (!s.calHz) return;
      stableMidi = null; stableCount = 0;
      s.refA = s.calHz;
      s.dialogStep = 3;
      s.checkIdx = 0;
      s.judged = null;
      render();
    } else {
      s.dialogStep = 0;
      s.judged = null;
      render();
    }
  }

  function dialogSkip() {
    const s = state;
    if (s.dialogStep === 3) {
      s.dialogStep = 0;
      s.judged = null;
    } else {
      s.dialogStep = s.dialogStep + 1;
      s.judged = null;
      s.checkIdx = 0;
      calBuf = [];
    }
    render();
  }

  deckButtons.forEach((b) => b.addEventListener("click", () => setDeck(b.dataset.deck, state.accidentals)));
  dom.btnAccidentals.addEventListener("click", () => setDeck(state.deck, !state.accidentals));

  dom.card.addEventListener("click", () => { if (state.mode === "practice" && !state.dialogStep) flip(); });
  dom.btnPrev.addEventListener("click", back);
  dom.btnNext.addEventListener("click", advance);
  dom.btnPlay.addEventListener("click", toggle);
  dom.btnGame.addEventListener("click", () => (state.mode === "game" ? exitGame() : startGame()));
  dom.btnSound.addEventListener("click", () => { state.sound = !state.sound; render(); });
  dom.btnAutoFlip.addEventListener("click", () => { state.autoFlip = !state.autoFlip; state.beat = 0; render(); });
  dom.bpmSlider.addEventListener("input", (e) => setBpm(Number(e.target.value)));
  dom.bpmUp.addEventListener("click", () => setBpm(state.bpm + 1));
  dom.bpmDown.addEventListener("click", () => setBpm(state.bpm - 1));
  dom.beatsSelect.addEventListener("change", (e) => { state.beatsPerCard = Number(e.target.value); state.beat = 0; render(); });
  dom.btnListen.addEventListener("click", () => (state.listening ? stopListening() : startListening()));
  dom.refUp.addEventListener("click", () => setRef(state.refA + 1));
  dom.refDown.addEventListener("click", () => setRef(state.refA - 1));

  dom.btnExitGame.addEventListener("click", exitGame);
  dom.btnPlayAgain.addEventListener("click", startGame);
  dom.btnDialogCancel.addEventListener("click", stopListening);
  dom.btnDialogSkip.addEventListener("click", dialogSkip);
  dom.btnDialogNext.addEventListener("click", dialogNext);

  dom.refInput.addEventListener("focus", () => dom.refInput.select());
  dom.refInput.addEventListener("blur", () => setRef(parseFloat(dom.refInput.value)));
  dom.refInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") dom.refInput.blur();
    else if (e.key === "Escape") { dom.refInput.value = state.refA; dom.refInput.blur(); }
  });

  // Leaving the drill must not leave its metronome or the mic running behind
  // the scales page.
  window.addEventListener("viewchange", (e) => {
    if (e.detail.view === "cards") return;
    stopClock();
    if (state.listening) stopListening();
    state.playing = false;
    state.beat = 0;
    if (state.mode === "game") exitGame();
    else render();
  });

  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.view !== "cards") return;
    if (e.target.matches("input, select, textarea")) return;
    if (state.dialogStep || state.mode !== "practice") return;
    if (e.key === "ArrowRight") { e.preventDefault(); advance(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    else if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "Enter") { e.preventDefault(); flip(); }
  });

  render();
})();
