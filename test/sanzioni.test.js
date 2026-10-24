/* Prove delle sanzioni e del ravvedimento: node test/sanzioni.test.js */
"use strict";
const assert = require("assert");
const Z = require("../sanzioni.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " atteso " + b + ", ottenuto " + a);
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const PAG = "2026-10-24";
const voce = (r, re) => r.voci.find((v) => re.test(v.voce));

t("2022, dichiarazione presentata, testo previgente: oltre il termine della dichiarazione dell'anno successivo → 1/6", () => {
  const r = Z.calcolaAnno({ anno: 2022, stato: "presentata", valoreRw: 100000, ivaca: 500, plusvalenze: 10000, pagamento: PAG });
  assert.equal(r.regime, "previgente"); assert.equal(r.frazione.lettera, "b-ter");
  near(voce(r, /RW/).sanzione, 100000 * 0.03 / 6);
  near(voce(r, /RT/).imposta, 2600); near(voce(r, /RT/).sanzione, 2600 * 0.9 / 6);
  assert.ok(!voce(r, /IVACA/)); // IVACA non dovuta prima del 2023, resta la sanzione RW
  assert.ok(r.note.some((x) => /non era dovuta/.test(x)));
});
t("2023, termine 31/10/2024 (dopo il 1/9/2024): nuovo testo, oltre il termine dell'anno della violazione → 1/7; franchigia 2.000 €", () => {
  const r = Z.calcolaAnno({ anno: 2023, stato: "presentata", valoreRw: 70000, ivaca: 140, plusvalenze: 5000, pagamento: PAG });
  assert.equal(r.regime, "nuovo"); assert.equal(r.frazione.lettera, "b-bis");
  near(voce(r, /RW/).sanzione, 70000 * 0.03 / 7);
  near(voce(r, /RT/).imposta, 3000 * 0.26); near(voce(r, /RT/).sanzione, 780 * 0.5 / 7);
  near(voce(r, /IVACA/).sanzione, 140 * 0.5 / 7);
});
t("2024: ravvedimento entro il termine della dichiarazione del 2025 (31/10/2026) → 1/8", () => {
  const r = Z.calcolaAnno({ anno: 2024, stato: "presentata", valoreRw: 50000, ivaca: 0, plusvalenze: 0, pagamento: PAG });
  assert.equal(r.frazione.lettera, "b"); near(r.sanzioni, 50000 * 0.03 / 8);
});
t("2025: dichiarazione ancora in termine → solo omesso versamento del saldo (25%, oltre 90 giorni → 1/8) e interessi", () => {
  const r = Z.calcolaAnno({ anno: 2025, stato: "presentata", valoreRw: 80000, ivaca: 160, plusvalenze: 1000, pagamento: PAG });
  assert.ok(!voce(r, /RW/)); near(voce(r, /IVACA/).sanzione, 160 * 0.25 / 8); near(voce(r, /RT/).imposta, 260);
  near(voce(r, /IVACA/).interessi, 160 * 0.016 * 116 / 365, 0.001);
});
t("Interessi legali giorno per giorno con il tasso di ciascun anno", () => {
  const i = Z.interessi(1000, "2024-12-31", "2025-01-31");
  near(i.importo, 1000 * 0.02 * 31 / 365, 0.0001); assert.equal(i.giorni, 31);
  const j = Z.interessi(1000, "2023-12-30", "2024-01-02");
  near(j.importo, 1000 * 0.05 * 1 / 365 + 1000 * 0.025 * 2 / 365, 0.0001);
});
t("Dichiarazione omessa: niente ravvedimento, sanzioni minime e definizione a 1/3, con l'invito ad attendere la contestazione", () => {
  const r = Z.calcolaAnno({ anno: 2023, stato: "omessa", valoreRw: 70000, ivaca: 140, plusvalenze: 5000, pagamento: PAG });
  assert.equal(r.ravvedibile, false);
  near(r.sanzionePiena, Math.max((140 + 780) * 1.2, 250) + 70000 * 0.03); near(r.sanzioneUnTerzo, r.sanzionePiena / 3);
  assert.ok(r.note.some((x) => /non è tecnicamente possibile/.test(x)) && r.note.some((x) => /contestata dall'Agenzia/.test(x)));
});
t("Dichiarazione omessa ma entro 90 giorni: tardiva con 1/10 di 250 € e ravvedimento dei versamenti", () => {
  const r = Z.calcolaAnno({ anno: 2024, stato: "omessa", valoreRw: 1000, ivaca: 50, plusvalenze: 0, pagamento: "2025-12-15" });
  assert.equal(r.ravvedibile, true); near(voce(r, /tardiva/).sanzione, 25); assert.ok(!voce(r, /RW/));
});
console.log("\n" + n + " prove superate");
