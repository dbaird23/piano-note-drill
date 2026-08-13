# Piano Note Drill

Flashcard drills for learning to read piano notes — built as an installable PWA.

**Live app:** https://dbaird23.github.io/piano-note-drill/

## Flashcards

- Four decks: **Landmarks** (guide notes), **Treble** (C4–G5), **Bass** (F2–C4), and **Everything** (F2–C6), with an optional sharps & flats mode
- Real engraving: treble and bass clefs (Bravura font), ledger lines, accidentals, correct stem direction
- Card backs show the note name plus a mini keyboard with the target key highlighted
- Metronome with adjustable tempo, beats per card, and auto-flip
- **Listening mode**: uses the microphone to hear the note you play and check it, with a guided setup that calibrates to your piano's tuning
- **Listening round**: a scored 20-card game against the clock

## Scales & patterns

The Pre-Prep level technique routine, written out on a grand staff in any of the
twelve keys of the transposition rotation:

1. **Scales** — the major five-finger pattern ("tonic, whole, whole, half, whole,
   then back down"), ascending and descending, hands separately, one note per beat
2. **Open 5th chord** — hands together, held for four beats
3. **Arpeggio** — hand over hand across two octaves, ascending only

Press **Play** and it counts in four beats, then plays straight through all three
sections at metronome 80, lighting each note as it sounds so you can follow along
the way you would with the lesson video. Notes already played fade out behind the
one currently sounding. Tempo, looping, the metronome click, and the note-name
labels under the staff can each be turned up or off.

Keys are spelled properly per key signature — F♯ major gets E♯, D♭ major gets
F♮ — so the notation matches what a teacher would write.

## Install as an app

Open the live app, then use your browser's "Add to Home Screen" / "Install" option. It works offline after the first visit.

## Local development

No build step — plain HTML/CSS/JS. Serve the folder with any static server:

```bash
python3 -m http.server 8766
```

The service worker is skipped on `localhost`, so edits always show up fresh. When shipping changes, bump the `CACHE` version in `sw.js` (and the `?v=` query strings in `index.html` if `styles.css` or `app.js` changed) so installed clients pick them up.
