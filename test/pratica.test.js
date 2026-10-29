/* Prove della pratica con l'Agenzia: lettura dello schema di atto, scenari delle osservazioni, scadenze (dati inventati): node test/pratica.test.js */
"use strict";
const assert = require("assert");
const P = require("../pratica.js");
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= (tol || 0.01), (msg || "") + " atteso " + b + ", ottenuto " + a);
let n = 0; const t = (nome, fn) => { fn(); n++; console.log("ok -", nome); };

// schema di atto inventato, con la struttura del modello dell'Agenzia (testo come lo estrae pdf.js)
const TESTA = (p) => "Pagina " + p + " di 6\nDIREZIONE PROVINCIALE DI MILANO - UFFICIO CONTROLLI\nCOMUNICAZIONE DELLO SCHEMA DI ATTO N. TQ1PF00001/2026 - Codice fiscale BNCLRA85M41F205X - anno di imposta 2024\nArticolo 6 - bis, commi 1 e 3, della Legge 27 luglio 2000, n. 212\n";
const PAGINE = [
  { n: 1, text: TESTA(1) + "DIREZIONE PROVINCIALE DI MILANO - UFFICIO CONTROLLI\nVIA DELLA PROVA 1 - 20100 MILANO\n(codice dell'ufficio T00)\nnumero dello schema d'atto: TQ1PF00001/2026\nLa signora BIANCHI LAURA\nnata a MILANO (MI) il 01/08/1985\ncodice fiscale BNCLRA85M41F205X\nAl riguardo La invitiamo a presentare allo scrivente Ufficio, entro il termine di 60 giorni\ndalla notifica del presente schema di atto, le eventuali osservazioni e controdeduzioni." },
  { n: 2, text: TESTA(2) + "- via PEC al seguente indirizzo dell'Ufficio:\ndp.Milano@pce.agenziaentrate.it\n* * * MOTIVAZIONI * * *\nRelativamente all'anno 2024 la dichiarazione risulta presentata senza il quadro RT.\nCon invito n. TQ1I00001/2026, notificato il 10/03/2026 ai sensi dell'art. 32 del d.P.R.\nn. 600/1973, l'Ufficio ha richiesto la documentazione.\nPLUSVALENZA ACCERTABILE\n- OPERAZIONI CON CARTA: con pec del 02/09/2026 si è inviato il dettaglio. Le vendite con carta ammontano ad € 3.200,00.\n- PERMUTA FISCALMENTE RILEVANTE: Operazione del 15/02/2024 conversione di 2,5\nETH in 6.100,00 USDC, per un controvalore pari a € 5.650,40.\n- Conversione del 20/05/2024 di 0,1 BTC in ETH per un controvalore di € 6.000,00.\n- STAKING: proventi da staking per € 410,00." },
  { n: 3, text: TESTA(3) + "Componenti quadro RT Importi\nVendite con carta 3.200,00 +\nPermuta ETH → USDC 5.650,40 +\nPermuta BTC/ETH 6.000,00 +\nProventi da staking 410,00 +\nMinusvalenze 1.260,40 -\nDeduzione art. 67comma 1,\nlett. c - sexies)\n2.000,00 =\nTotale imponibile 12.000,00\nRITIENE ACCERTABILE\nuna plusvalenza imponibile complessivamente pari ad euro 12.00 0 ,00, da\nassoggettare a d imposta sostitutiva del 26 % per il periodo d'imposta 2024.\nConseguentemente, applicando l'aliquota del 2 per mille prevista dalla normativa\nvigente, l'imposta sul valore delle cripto - attività dovuta per il periodo\nd'imposta 2024 è determinata in € 50, 40.\nL'omessa compilazione del quadro RW ex art. 5, comma 2, del d.l. n. 167 del\n1990 sarà oggetto di separato atto di contestazione." },
  { n: 4, text: TESTA(4) + "DICHIARATO ACCERTABILE\nRT41 col.1 Totale dei corrispettivi 0 15.260\nRT88 Differenza (RT57 col.2 - RT43 - RT44 col.2) 0 12.000\nRT89 Imposta sostitutiva (26% di RT88) 0 3.120\nMAGGIORE IMPOSTA SOSTITUTIVA ACCERTABILE (in euro) 3.120,00\nRW col.8 - IC Valore finale 0 25.200\nRW8 col.1 - Imposta cripto - attività dovuta 0 50\n" },
  { n: 5, text: TESTA(5) + "VIOLAZIONI ACCERTABILI SANZIONI PREVISTE\nMINIME MASSIME\n1 Imp.Sostit. - INFEDELE DICHIARAZIONE.\na) ART. 1, COMMA 2, D. LGS. 18.12.1997, N. 471\nSANZIONE PECUNIARIA DEL 70% DELLA MAGGIORE IMPOSTA CON UN\nMINIMO DI EURO 150,00 2.219,00 2.219,00\nSi riepilogano le misure sanzionatorie considerate\nDETERMINA\n- La sanzione amministrativa pecuniaria di Euro 2.219,00 per le violazioni indicate." },
  { n: 6, text: TESTA(6) + "Funzionario referente al quale rivolgersi per informazioni:\nROSSI PAOLO\nMail: paolo.rossi@agenziaentrate.it" }
];

t("Tipo di atto riconosciuto dal testo", () => {
  assert.equal(P.tipoAtto(PAGINE.map((p) => p.text).join("\n")), "schema");
  assert.equal(P.tipoAtto("AVVISO DI ACCERTAMENTO N. X"), "avviso");
  assert.equal(P.tipoAtto("ATTO DI CONTESTAZIONE n. 1"), "contestazione");
  assert.ok(P.leggiSchema([{ n: 1, text: "Fattura n. 12" }]).errore);
});
t("Intestazione: Ufficio, PEC, numero, anno, invito, funzionario; contribuente solo come proposta", () => {
  const d = P.leggiSchema(PAGINE), a = d.atto;
  assert.equal(a.ufficio, "Direzione Provinciale di Milano – Ufficio Controlli"); assert.equal(a.indirizzo, "Via della Prova 1 – 20100 Milano");
  assert.equal(a.pec, "dp.milano@pce.agenziaentrate.it"); assert.equal(a.numero, "TQ1PF00001/2026"); assert.equal(a.anno, 2024);
  assert.deepEqual(a.invito, { numero: "TQ1I00001/2026", data: "2026-03-10" }); assert.equal(a.funzionario, "Rossi Paolo"); assert.equal(a.giorniOsservazioni, 60);
  assert.equal(d.contribuente.cf, "BNCLRA85M41F205X"); assert.equal(d.contribuente.nome, "Bianchi Laura");
  assert.ok(JSON.stringify(a).indexOf("BNCLRA") < 0); // il codice fiscale non è nei dati dell'atto
});
t("Componenti del quadro RT: natura, segno, stablecoin, date dell'anno d'imposta", () => {
  const d = P.leggiSchema(PAGINE), c = d.componenti;
  assert.deepEqual(c.map((x) => x.tipo), ["carta", "permuta", "permuta", "proventi", "minusvalenze", "franchigia"]);
  assert.equal(c[1].da, "ETH"); assert.equal(c[1].a, "USDC"); assert.equal(c[1].stablecoin, true); assert.equal(c[1].data, "2024-02-15");
  assert.equal(c[2].stablecoin, false); // BTC → ETH non è una permuta in stablecoin
  assert.equal(c[0].data, null); // la data della PEC (2026) non è dell'anno d'imposta
  assert.equal(d.totaleImponibile, 12000); assert.equal(c[5].voce, "Deduzione art. 67comma 1, lett. c - sexies)");
});
t("Prospetto, IVACA e sanzioni; controlli formali", () => {
  const d = P.leggiSchema(PAGINE);
  assert.equal(d.rt.corrispettivi, 15260); assert.equal(d.rt.imponibile, 12000); assert.equal(d.rt.imposta, 3120); near(d.rt.aliquota, 0.26);
  near(d.ivaca, 50.4); assert.equal(d.rw.valore, 25200); assert.ok(d.rw.sanzioneSeparata);
  assert.equal(d.sanzioni.totale, 2219); assert.equal(d.sanzioni.violazioni[0].misura, 0.7);
  assert.ok(d.verifiche.some((v) => v.livello === "verde" && /torna con il totale/.test(v.testo)));
  assert.ok(d.verifiche.some((v) => v.livello === "verde" && /70% di imposta/.test(v.testo))); // 70% di (3.120 + 50) = 2.219
});
t("Scenari: schema, permute in stablecoin neutre, aliquota 12,50% (cumulativi, come il prospetto dello studio)", () => {
  const d = P.leggiSchema(PAGINE), s = P.scenari(d, { stablecoin: true, aliquota: true }), c = s.colonne;
  assert.equal(c.length, 3); assert.equal(s.permute.length, 1);
  near(c[0].imponibile, 12000); assert.equal(c[0].imposta, 3120);
  near(c[1].imponibile, 12000 - 5650.4); assert.equal(c[1].imposta, Math.round(6349.6 * 0.26)); near(c[1].sanzione, Math.round(1651 + 50.4) * 0.7);
  near(c[2].aliquota, 0.125); assert.equal(c[2].imposta, Math.round(6349.6 * 0.125));
  // la franchigia si riduce se il netto scende sotto i 2.000 €
  const piccolo = JSON.parse(JSON.stringify(d)); piccolo.componenti = [{ voce: "Permuta ETH → USDT", importo: 2500, tipo: "permuta", segno: 1, stablecoin: true }, { voce: "Carta", importo: 900, tipo: "carta", segno: 1 }, { voce: "Deduzione", importo: 2000, tipo: "franchigia", segno: -1 }];
  assert.equal(P.scenari(piccolo, { stablecoin: true }).colonne[1].imponibile, 0);
  assert.equal(P.scenari(d, {}).colonne.length, 1); // senza tesi solo lo schema
  const d25 = JSON.parse(JSON.stringify(d)); d25.atto.anno = 2025; assert.ok(!P.applicabile("aliquota", d25));
});
t("Scadenze dello schema e dell'avviso dalla data di notifica", () => {
  const s = P.scadenze("schema", "2026-10-26");
  assert.deepEqual(s.map((x) => x.nominale), ["2026-11-25", "2026-12-25"]);
  assert.equal(s[1].data, "2026-12-28"); assert.ok(s[1].prorogata); // 25 e 26 dicembre festivi, poi domenica 27
  assert.deepEqual(P.scadenze("avviso", "2026-10-26").map((x) => x.nominale), ["2026-11-10", "2026-12-25"]);
  assert.equal(P.proroga("2026-04-06"), "2026-04-07"); // Pasquetta 2026
});
t("Osservazioni: struttura dello studio, importi e richieste coerenti con il prospetto", () => {
  const d = P.leggiSchema(PAGINE);
  const B = P.osservazioni(d, { tesi: { stablecoin: true, aliquota: true }, studio: { professionista: "Dott. Prova" }, cliente: { nome: "Cliente di prova", cf: "XXXXXX00X00X000X" }, notifica: "2026-10-01", citta: "Firenze" });
  const testo = B.map((b) => b.testo || (b.voci || []).join(" ") || (b.righe || []).map((r) => r.join(" ")).join(" ")).join("\n");
  ["Osservazioni e controdeduzioni", "Premesso che", "Presenta", "Espone quanto segue", "Chiede"].forEach((h) => assert.ok(B.some((b) => b.t === "titolo" && b.testo === h), h));
  assert.ok(/TQ1PF00001\/2026/.test(testo) && /Direzione Provinciale di Milano/.test(testo));
  assert.ok(/ETH in USDC del 15\/02\/2024/.test(testo)); assert.ok(/5\.650,40/.test(testo)); assert.ok(/12,50%/.test(testo));
  assert.ok(/invito n\. TQ1I00001\/2026, notificato il 10\/03\/2026/.test(testo));
  const tab = B.filter((b) => b.t === "tabella")[0]; assert.equal(tab.intest.length, 4);
  assert.equal(P.num(4576.52), "4.576,52"); assert.equal(P.num(-678.24), "-678,24");
});
console.log("\n" + n + " prove superate");
