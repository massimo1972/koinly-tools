/* Prove dei costi di carico LIFO globali con dati inventati: node test/costi.test.js */
"use strict";
const assert = require("assert");
const D = require("../detenzione.js"), C = require("../costi.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " atteso " + b + ", ottenuto " + a);
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

const H = "ID (read-only),Parent ID (read-only),Date (UTC),Type,Tag,From Wallet (read-only),From Wallet ID,From Amount,From Currency,To Wallet (read-only),To Wallet ID,To Amount,To Currency,Fee Amount,Fee Currency,Net Worth Amount,Net Worth Currency,Fee Worth Amount,Fee Worth Currency,Net Value (read-only),Fee Value (read-only),Value Currency (read-only),Deleted,From Source (read-only),To Source (read-only),Negative Balances (read-only),Missing Rates (read-only),Missing Cost Basis (read-only),Synced To Accounting At (UTC read-only),TxSrc,TxDest,TxHash,Method Name (read-only),Description";
const riga = (id, data, tipo, tag, wDa, qDa, vDa, wA, qA, vA, valore, extra) => [id, "", data, tipo, tag, wDa, "", qDa, vDa, wA, "", qA, vA, (extra && extra.fee) || "0.0", (extra && extra.feeV) || "", "", "", "", "", valore, (extra && extra.feeVal) || "0.0", "EUR;11", "false", "", "", "", "", "", "", (extra && extra.src) || "", (extra && extra.dest) || "", (extra && extra.hash) || "", "", (extra && extra.desc) || ""].join(",");
const TX = [H,
  riga(1, "2021-03-01 10:00:00", "trade", "", "Exchange;x", "10000.0", "EUR;11", "Exchange;x", "1.0", "BTC;1", "10000.0"),
  riga(2, "2022-03-01 10:00:00", "trade", "", "Exchange;x", "20000.0", "EUR;11", "Exchange;x", "1.0", "BTC;1", "20000.0", { fee: "10.0", feeV: "EUR;11", feeVal: "10.0" }),
  riga(3, "2023-02-01 10:00:00", "trade", "", "Exchange;x", "1.5", "BTC;1", "Exchange;x", "45000.0", "EUR;11", "45000.0"),
  riga(4, "2023-03-01 10:00:00", "trade", "", "Exchange;x", "0.5", "BTC;1", "Exchange;x", "10.0", "ETH;3", "15000.0"),
  riga(5, "2023-04-01 10:00:00", "deposit", "reward", "", "0.0", "", "Exchange;x", "1.0", "ETH;3", "1500.0"),
  riga(6, "2023-05-01 10:00:00", "withdrawal", "", "Exchange;x", "2.0", "ETH;3", "", "0.0", "", "3000.0", { dest: "0xabc0000000000000000000000000000000000001", hash: "0xh6" }),
  riga(7, "2023-09-01 10:00:00", "deposit", "", "", "0.0", "", "Exchange;x", "2.0", "ETH;3", "3200.0", { hash: "0xh7" }),
  riga(8, "2023-10-01 10:00:00", "deposit", "", "", "0.0", "", "Ledger BTC;btc", "1.0", "BTC;1", "25000.0", { hash: "h8" }),
  riga(9, "2023-11-01 10:00:00", "withdrawal", "", "Ledger BTC;btc", "0.2", "BTC;1", "", "0.0", "", "6000.0", { hash: "h9" }),
  riga(10, "2023-12-01 10:00:00", "trade", "", "Exchange;x", "1.0", "ETH;3", "Exchange;x", "2000.0", "USDT;8", "2000.0")
].join("\n");
const dati = D.leggiTransazioni(TX);
// le correzioni si riferiscono al numero di riga del file (riga 1 = intestazione): l'operazione con ID n è alla riga n + 1
const CORR = { 7: { azione: "interno" }, 8: { azione: "interno" }, 9: { azione: "costo", importo: 18000 }, 10: { azione: "cessione", importo: 6100 } };
// queste prove usano le permute al valore del momento anche dal 2023 (swapNeutriDal: null); gli swap neutri hanno una prova a parte
const senza = C.calcola(D.leggiTransazioni(TX), { anno: 2023, swapNeutriDal: null });
const con = C.calcola(dati, { anno: 2023, correzioni: CORR, swapNeutriDal: null });
const riga_ = (r, s) => r.righe.find((x) => x.simbolo === s);
const ces = (r, tipo) => r.cessioni.filter((c) => c.tipo === tipo);

t("Costo all'origine: acquisti con euro, commissione in euro nel costo; saldo al 1/1/2023", () => {
  const b = riga_(con, "BTC");
  assert.equal(b.qInizio, "2"); near(b.costoInizio, 30010); // 10.000 + 20.000 + 10 di commissione
});
t("Vendita LIFO globale su più strati: prima lo strato più recente", () => {
  const v = ces(con, "contro valuta")[0];
  near(v.corrispettivo, 45000); near(v.costo, 20010 + 5000); near(v.risultato, 45000 - 25010);
});
t("Permuta: la cripto ceduta esce al valore del momento, quella ricevuta entra con quel valore", () => {
  const p = ces(con, "permuta tra cripto")[0];
  near(p.corrispettivo, 15000); near(p.costo, 5000);
  assert.equal(riga_(con, "ETH").stratiFine.find((s) => s.origine === "permuta da BTC") != null, true);
});
t("Reward caricato al valore del giorno", () => {
  // carichi ETH dell'anno: permuta 15.000 + reward 1.500 + rientro da wallet proprio al costo d'origine 3.000
  near(riga_(con, "ETH").costoCaricato, 15000 + 1500 + 3000);
});
t("Prelievo e rientro da wallet proprio (correzione «interno»): gli strati tornano con il costo d'origine", () => {
  assert.ok(!ces(con, "prelievo senza corrispettivo").some((c) => c.cripto === "ETH"));
  // senza correzione il rientro è caricato al valore del giorno (3.200), con la correzione al costo d'origine
  const eS = riga_(senza, "ETH"), eC = riga_(con, "ETH");
  assert.equal(eC.qFine, "10"); assert.equal(eS.qFine, "10");
  near(eC.costoFine + ces(con, "contro stablecoin")[0].costo, 15000 + 1500);
  assert.ok(eS.costoFine + ces(senza, "contro stablecoin")[0].costo > 16000);
});
t("Deposito con costo documentato e cessione a terzi con corrispettivo", () => {
  const b = riga_(con, "BTC");
  assert.equal(b.qFine, "0.8"); near(b.costoFine, 18000 * 0.8);
  const c = ces(con, "cessione a terzi")[0]; near(c.corrispettivo, 6100); near(c.costo, 3600);
});
t("Operazioni da verificare: depositi e prelievi verso wallet non collegati, con la correzione applicata", () => {
  const dv = con.daVerificare;
  assert.deepEqual(dv.map((x) => x.riga).sort((a, b) => a - b), [7, 8, 9, 10]);
  assert.equal(dv.find((x) => x.riga === 9).correzione.azione, "costo");
  assert.equal(dv.find((x) => x.riga === 7).txHash, "0xh6");
});
t("Totali per il quadro RT: solo cessioni contro valuta e contro stablecoin", () => {
  const tv = con.totali.controValutaStable;
  near(tv.corrispettivi, 45000 + 2000);
});
t("Confronto con l'elenco delle cessioni Koinly: scomposizione della differenza che quadra", () => {
  const L = require("../lettura.js");
  // estratto inventato dell'elenco «Transazioni di plusvalenze» (Koinly in italiano, più anni)
  const testo = ["Periodo: 1 gen 2021 al 31 dic 2023", "Tutte le date e gli orari sono nel Europe/Rome fuso orario",
    "01/02/2023 11:00 01/03/2022 11:00 BTC 1,00000000 20.010,00 45.000,00 24.990,00 Exchange",
    "01/02/2023 11:00 01/03/2021 11:00 BTC 0,50000000 5.000,00 0,00 -5.000,00 Exchange",
    "01/03/2023 11:00 01/03/2021 11:00 BTC 0,50000000 5.000,00 15.000,00 10.000,00 Exchange",
    "05/05/2022 11:00 01/03/2021 11:00 BTC 0,10000000 1.000,00 3.000,00 2.000,00 Exchange"].join("\n");
  const k = L.leggiCessioniPdf([{ text: testo }]);
  assert.equal(k.fuso, "Europe/Rome"); assert.equal(k.cessioni.length, 3); near(k.cessioni[0].quantita, 1.5); near(k.cessioni[0].costo, 25010);
  const x = C.confrontaCessioniKoinly(con, k.cessioni, 2023);
  assert.equal(x.koinly.n, 2); // la cessione del 2022 resta fuori
  near(x.quadratura, 0, 0.05);
  assert.equal(x.nonRilevanti.length, 1); assert.equal(x.nonRilevanti[0].tipo, "permuta tra cripto");
  // il corrispettivo Koinly della vendita (45.000 su 1,5 BTC) coincide; nessuna differenza di costo
  near(x.voci[2].importo, 0); near(x.voci[3].importo, 0);
});
t("Dal 2023 gli swap tra cripto sono neutri: la cripto ricevuta prende il costo LIFO di quella ceduta", () => {
  const r = C.calcola(D.leggiTransazioni(TX), { anno: 2023, correzioni: CORR });
  const sw = r.cessioni.find((c) => /^swap tra cripto/.test(c.tipo));
  assert.ok(sw); near(sw.corrispettivo, sw.costo); near(sw.risultato, 0); near(sw.costo, 5000);
  // i 10 ETH ricevuti hanno costo 5.000 (trasferito), non 15.000 (valore del momento)
  // carichi ETH: swap 5.000 (costo trasferito) + reward 1.500 + rientro da wallet proprio 2.000
  // (il prelievo di 2 ETH aveva messo da parte il reward da 1.500 e 1 ETH dello swap a 500)
  near(riga_(r, "ETH").costoCaricato, 5000 + 1500 + 2000);
  assert.ok(!C.rilevante(sw.tipo, 2023));
});
console.log("\n" + n + " prove superate");
