/* Prove dei quadri RT e del modello F24: node test/modelli.test.js */
"use strict";
const assert = require("assert");
const M = require("../modelli.js"), Z = require("../sanzioni.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const val = (q, rigo, col) => q.righi.find((x) => x.rigo === rigo && String(x.col) === String(col || "")).valore;

t("RT 2023 (Redditi PF 2024): plusvalenza intera se almeno 2.000 €, righi RT31-RT39", () => {
  const q = M.quadroRT(2023, 10000, 7000);
  assert.equal(val(q, "RT33", 2), 3000); assert.equal(val(q, "RT37"), 780); assert.equal(val(q, "RT39"), 780);
  assert.equal(val(M.quadroRT(2023, 10000, 8500), "RT33", 2), 0);
  assert.equal(M.quadroRT(2023, 1000, 5000).minusvalenzaDaRiportare, 4000);
});
t("RT 2024 (Redditi PF 2025): solo l'eccedenza oltre 2.000 €, righi RT41, RT57, RT88-RT90", () => {
  const q = M.quadroRT(2024, 10000, 7000);
  assert.equal(val(q, "RT41", 1), 10000); assert.equal(val(q, "RT57", 2), 1000); assert.equal(val(q, "RT89"), 260); assert.equal(val(q, "RT90"), 260);
});
t("RT 2025 (Redditi PF 2026): cessioni 2025 in RT41 col. 3-4 senza franchigia", () => {
  const q = M.quadroRT(2025, 10000, 7000);
  assert.equal(val(q, "RT41", 3), 10000); assert.equal(val(q, "RT57", 2), 3000); assert.equal(val(q, "RT90"), 780);
  assert.ok(M.quadroRT(2022, 1, 0).nonGestito);
});
t("F24: codici 1727, 1715, 8945, 1945, 8911 con anno d'imposta; anni omessi esclusi", () => {
  const PAG = "2026-10-24";
  const a = Z.calcolaAnno({ anno: 2024, stato: "presentata", valoreRw: 50000, ivaca: 100, plusvalenze: 10000, pagamento: PAG });
  const b = Z.calcolaAnno({ anno: 2023, stato: "omessa", valoreRw: 1000, ivaca: 10, plusvalenze: 0, pagamento: PAG });
  const f = M.f24([a, b]);
  const cod = (c) => f.righe.find((x) => x.codice === c);
  assert.equal(cod("1727").importo, 100); assert.equal(cod("1727").rateazione, "0101"); assert.equal(cod("1727").anno, 2024);
  assert.equal(cod("1715").importo, 2080); // (10.000 − 2.000) × 26%
  assert.ok(cod("8945").importo > 0 && cod("1945").importo > 0);
  assert.equal(cod("8911").importo, Math.round(50000 * 0.03 / 8 * 100) / 100);
  assert.deepEqual(f.esclusi, [2023]);
  assert.equal(f.totale, Math.round(f.righe.reduce((s, x) => s + x.importo, 0) * 100) / 100);
});
console.log("\n" + n + " prove superate");
