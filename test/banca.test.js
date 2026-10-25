/* Prove della lettura anonimizzata degli estratti conto (dati inventati): node test/banca.test.js */
"use strict";
const assert = require("assert");
const B = require("../banca.js");
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

// estratto conto inventato: righe personali e righe verso exchange
const PAGINE = [{ text: [
  "ESTRATTO CONTO Mario Rossi Via Garibaldi 12 Firenze IBAN IT60X0542811101000000123456",
  "02/03/2023 03/03/2023 Pagamento POS Farmacia Centrale Firenze -45,20 1.954,80",
  "05/03/2023 05/03/2023 Bonifico a favore di BINANCE PAYMENTS UAB causale acquisto Mario Rossi -1.500,00 454,80",
  "10/03/2023 10/03/2023 Stipendio ditta XYZ srl +2.300,00 2.754,80",
  "15/03/2023 15/03/2023 Accredito bonifico da Coinbase Europe Ltd ordinante +820,50 3.575,30",
  "20/03/2023 20/03/2023 Addebito SDD utenza luce -78,90 3.496,40",
  "22 mar 2023 Bonifico disposto verso Young Platform SpA 300,00"
].join("\n") }];
const r = B.leggi(PAGINE, "Rossi Mario estratto 2023.pdf");

t("Si tengono solo i movimenti verso o da exchange, con data, importo e segno", () => {
  assert.equal(r.movimenti.length, 3);
  assert.deepEqual(r.movimenti.map((m) => [m.data, m.importo, m.segno, m.controparte]), [
    ["2023-03-05", 1500, -1, "Binance"], ["2023-03-15", 820.5, 1, "Coinbase"], ["2023-03-22", 300, -1, "Young Platform"]]);
  assert.equal(r.righeScartate, 3);
});
t("Nessun dato personale: niente nomi, indirizzi, IBAN, causali o nome del file", () => {
  const tutto = JSON.stringify(r);
  ["Rossi", "Mario", "Garibaldi", "Firenze", "IT60", "Farmacia", "Stipendio", "XYZ", "utenza", "PAYMENTS", "causale"].forEach((x) => assert.ok(tutto.indexOf(x) < 0, "trovato " + x));
  assert.equal(r.movimenti[0].descrizione, "addebito verso Binance");
});
t("Riscontro con versamenti e prelievi in euro di Koinly (importo e date vicine)", () => {
  const k = [{ data: "2023-03-06", intermediario: "Binance", verso: "versamento", importo: 1499 }, { data: "2023-03-14", intermediario: "Coinbase", verso: "prelievo", importo: 820.5 }, { data: "2023-04-30", intermediario: "Kraken", verso: "versamento", importo: 999 }];
  const x = B.riscontra(r.movimenti, k);
  assert.equal(x.riscontrati, 2); assert.equal(x.senzaRiscontro.length, 1); assert.equal(x.koinlySenzaBanca.length, 1);
});
t("Riga con la descrizione che va a capo: l'importo sulla riga successiva viene unito", () => {
  const x = B.leggi([{ text: "04/04/2023 04/04/2023 Bonifico a favore di Kraken\nPayward Ltd riferimento ordine -250,00 1.000,00" }]);
  assert.equal(x.movimenti.length, 1); assert.equal(x.movimenti[0].importo, 250); assert.equal(x.movimenti[0].controparte, "Kraken");
});
console.log("\n" + n + " prove superate");
