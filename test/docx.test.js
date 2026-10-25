/* Prove della scrittura del documento Word (docx-mini.js): node test/docx.test.js */
"use strict";
const assert = require("assert");
const W = require("../docx-mini.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };
const testo = (b) => { let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; };

t("Documento Word: zip con documento, stili, elenchi, intestazione e piè di pagina; A4 verticale; grassetto e caratteri speciali", () => {
  const b = W.crea([{ t: "titolo", testo: "Premesso che" }, { t: "elenco", numerato: true, voci: ["primo **punto**", "secondo"] },
    { t: "p", testo: "Corrispettivi 1.000 € < 2.000 € & altro" }, { t: "tabella", intest: ["Voce", "Importo"], numeri: [1], righe: [["Costo", "10 €"]] }],
    { intestazione: ["Studio"], piede: ["Indirizzo"] });
  const s = testo(b);
  assert.equal(s.slice(0, 2), "PK");
  ["word/document.xml", "word/styles.xml", "word/numbering.xml", "word/header1.xml", "word/footer1.xml", "PREMESSO CHE", "<w:b/>", "1.000 € &lt; 2.000 € &amp; altro", 'w:w="11906" w:h="16838"', "NUMPAGES", "lowerLetter"].forEach((k) => assert.ok(s.indexOf(k) >= 0 || testo(new TextEncoder().encode(k)) && s.indexOf(testo(new TextEncoder().encode(k))) >= 0, "manca " + k));
  assert.ok(s.indexOf('orient="landscape"') < 0);
});
console.log("\n" + n + " prove superate");
