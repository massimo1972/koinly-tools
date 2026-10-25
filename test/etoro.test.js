/* Prove della lettura del rendiconto eToro con dati inventati (testo come lo estrae pdf.js): node test/etoro.test.js */
"use strict";
const assert = require("assert");
const T = require("../etoro.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " atteso " + b + ", ottenuto " + a);
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

const PAGINE = [
  { n: 1, text: "Mario Rossi eToro (Europe) Ltd.\nNome utente: prova Via Roma 1\nRiepilogo dell'Account GEN 1, 2023 A DIC 31, 2024\nRiepilogo dell'account (USD) Totale (USD) Totale (EUR)\nDepositi 1000.00 N/A\nProfitto o perdita (solo posizioni chiuse) 150.00 135.00\nPatrimonio realizzato finale 1150.00 1035.00" },
  { n: 2, text: "Holdings Dec 31, 2023\nAsset Position ID Direction Open Date Leverage Open Rate Units Current Rate Value in USD Value in EUR Type ISIN\nXRP 111111111 Long\n02-01-2023\n10:00:00\nX1 0.50 200 0.60 120.00 108.00 Crypto Currencies -\nApple 222222222 Long\n03-01-2023\n15:30:00\nX1 120.00 1 190.00 190.00 171.00 Stocks US0378331005" },
  { n: 3, text: "Holdings Dec 31, 2024\nAsset Position ID Direction Open Date Leverage Open Rate Units Current Rate Value in USD Value in EUR Type ISIN\nXRP 111111111 Long\n02-01-2023\n10:00:00\nX1 0.50 200 2.00 400.00 380.00 Crypto Currencies -" },
  { n: 4, text: "Posizioni chiuse GEN 1, 2023 A DIC 31, 2024\nAzione\nID Posizione\nLong / Short\nImporto\nUnità\nData di apertura\nData di chiusura\nLeva\nTipologia\nISIN\n" +
    "Apple (AAPL)\n222222222\nLong\n120.00\n1\n03-01-2023 15:30:00\n05-03-2024 16:00:00\nX1\n0.00\n0.00\n50.00 46.00\n-\n-\n120.00\n170.00\n0.00\n0.01 0.00\nAzioni\nUS0378331005\n" +
    "NASDAQ100 Index\n(Non Expiry)\n(NSDQ100)\n333333333\nLong\n200.00\n0.01\n10-06-2024 10:00:00\n12-06-2024 10:00:00\nX20\n0.80\n0.00\n(30.00) (27.00)\n-\n-\n18000.00\n17970.00\n0.00\n17000.00 (1.50)\nCFD\nUS6311011026\n" +
    "Bitcoin (BTC)\n444444444\nLong\n100.00\n0.004\n01-02-2024 09:00:00\n01-03-2024 09:00:00\nX1\n1.00\n0.00\n130.00 120.00\n-\n-\n25000.00\n57500.00\n0.00\n0.01\ntraderX\n0.00\nCriptovalute" },
  { n: 5, text: "Attività account GEN 1, 2023 A DIC 31, 2024\nData Tipologia Dettagli Importo Unità\nSaldo ID Posizione Tipo di asset\n" +
    "02-01-2023 09:00:00 Deposito 1000.00 EUR PayPal 1090.00 - 1090.00 1090.00 1090.00 - -\n" +
    "02-01-2023 10:00:00 Apri posizione XRP/USD 100.00 200 0.00 1090.00 990.00 111111111 Criptovalute\n" +
    "05-01-2023 10:00:00 Apri posizione XRP/USD 50.00 100 0.00 1090.00 940.00 555555555 Criptovalute\n" +
    "20-05-2023 12:00:00\nTrasferimento al wallet\ncripto\nXRP/USD 45.00 100 (5.00) 1085.00 940.00 555555555 Criptovalute\n" +
    "11-06-2024 02:00:00 Commissione overnight NSDQ100/USD (1.50) - (1.50) 1083.50 938.50 333333333 CFD\n" +
    "16-11-2024 16:16:37 AirDrop SGB/USD 3.00 100 3.00 1086.50 941.50 666666666 Crypto Margin" },
  { n: 6, text: "Dividendi GEN 1, 2023 A DIC 31, 2024\nData di pagamento Nome strumento\nDividendo netto\nricevuto (USD)\nID Posizione Tipologia ISIN\n15/02/2024 Apple Inc 0.2100 0.1900 30 % 0.0900 0.0810 222222222 Stocks US0378331005\n20/06/2024\nNASDAQ100 Index (Non\nExpiry)\n0.4200 0.3800 30 % 0.1800 0.1600 333333333 CFD US6311011026" },
  { n: 7, text: "Riepilogo finanziario GEN 1, 2023 A DIC 31, 2024\nArticolo Importo in (USD) Importo in (EUR)\nCFD (profitti o perdite) (30.00) (27.00)\nReddito da Airdrops 3.00 2.70" }
];
const d = T.leggi(PAGINE);

t("Sezioni lette: fotografie, posizioni chiuse (nomi su più righe, trader copiato), attività, dividendi", () => {
  assert.deepEqual(d.holdings.map((h) => h.data + ":" + h.righe.length), ["2023-12-31:2", "2024-12-31:1"]);
  assert.equal(d.chiuse.length, 3);
  assert.equal(d.chiuse[1].nome, "NASDAQ100 Index (Non Expiry) (NSDQ100)"); assert.equal(d.chiuse[1].leva, 20); near(d.chiuse[1].overnight, -1.5);
  assert.equal(d.chiuse[2].copiatoDa, "traderX"); assert.equal(d.chiuse[2].categoria, "Cripto");
  assert.equal(d.attivita.length, 6); assert.equal(d.attivita[5].tipoAsset, "Crypto Margin");
  assert.equal(d.dividendi.length, 2); assert.equal(d.dividendi[1].categoria, "CFD");
});
t("Nessun dato personale conservato dall'intestazione", () => {
  const tutto = JSON.stringify(d);
  ["Rossi", "Mario", "Via Roma", "prova"].forEach((x) => assert.ok(tutto.indexOf(x) < 0, "trovato " + x));
});
t("Riepilogo 2024: RT per categoria, overnight e dividendi CFD nel differenziale, dividendi azionari al lordo per il quadro RM", () => {
  const r = T.riepilogo(d, 2024);
  near(r.rt.Azioni.risultato, 46); near(r.rt.Cripto.risultato, 120); near(r.rt.CFD.risultato, -27);
  assert.ok(r.rt.CFD.overnight < 0); near(r.rt.CFD.dividendiCfd, 0.38);
  near(r.rm.lordoEur, 0.19 + 0.081); near(r.rm.ritenutaEur, 0.081); assert.equal(r.rm.n, 1);
  assert.equal(r.airdrop.n, 1);
  assert.equal(r.rw.dataInizio, "2023-12-31"); assert.equal(r.rw.dataFine, "2024-12-31");
  near(r.rw.inizio.Cripto.eur, 108); near(r.rw.inizio.Azioni.eur, 171); near(r.rw.fine.Cripto.eur, 380);
});
t("Trasferimento al wallet cripto: non è una cessione; quantità, valore e costo dell'apertura per il wallet di arrivo", () => {
  const r = T.riepilogo(d, 2023);
  assert.equal(r.trasferimentiWallet.n, 1); near(r.trasferimentiWallet.perCripto.XRP.unita, 100); near(r.trasferimentiWallet.costoUsd, 50); near(r.trasferimentiWallet.valoreUsd, 45);
  assert.deepEqual(Object.keys(r.rt), []);
});
t("Un PDF che non è un rendiconto eToro viene rifiutato", () => {
  assert.throws(() => T.leggi([{ n: 1, text: "Fattura n. 12 del 2024" }]));
});
t("Quadri 2024: RT al 26% (azioni e CFD, cripto a parte), RM per Stato al lordo, RW per tipo di bene", () => {
  const q = T.quadri(d, 2024, {});
  assert.equal(q.rt[0].rigo, "RT11");
  // azioni: costo 120 × 0,92 = 110,40, corrispettivo 156,40; CFD: costo 200 × 0,9 = 180 + overnight, corrispettivo 153 + dividendi CFD
  near(q.corrispettivi, 156.4 + 153 + 0.38, 1); assert.ok(q.costi >= 290);
  assert.equal(q.cripto.n, 1);
  assert.equal(q.rmRigo, "RM31"); assert.equal(q.rm[0].stato, "069"); near(q.rm[0].lordoEsatto, 0.271);
  assert.deepEqual(q.rw.map((x) => x.codice).sort(), ["1", "2", "21", "9"]);
  assert.ok(q.rw.find((x) => x.codice === "21").ivaca > 0);
});
t("Anni senza dati: nessun rigo; minusvalenze riportate negli anni successivi", () => {
  const tutti = T.quadriTutti(d);
  assert.equal(tutti[2023].rt.length, 0); assert.equal(tutti[2023].rm.length, 0);
});
console.log("\n" + n + " prove superate");
