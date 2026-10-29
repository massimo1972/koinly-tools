# Koinly Tools

Programma a codice aperto (open source), mantenuto con le donazioni in bitcoin su Lightning Network. Indirizzo per le donazioni e link al codice in `studio.js`.

> Koinly Tools non è affiliato né approvato da Koinly. «Koinly» è un marchio dei rispettivi titolari, citato solo per indicare i report compatibili.

Web app statica per le cripto-attività a partire dai report Koinly. Tutto gira nel browser: i file caricati non vengono salvati né inviati in rete. È pensata per essere incorporata (iframe) nella pagina del sito dello studio; `_headers` consente l'incorporamento da studiomecommercialisti.it.

## 1. Giorni di detenzione e IVACA

File richiesti (tutti obbligatori):

| File | Contenuto |
|---|---|
| Transazioni | CSV Koinly: `backup_transactions_koinly.csv` (date UTC, numeri 1234.56) oppure «transaction history» (anche con numeri in formato italiano) |
| Saldi a inizio anno | «Beginning of year holdings» CSV (o report di fine dell'anno precedente) |
| Saldi a fine anno | «End of year holdings» CSV o «Complete tax report» PDF |
| Altri report Koinly (facoltativi) | «Income report», «Expenses report», «Gifts, donations & lost assets», «Other gains report» in CSV. Dal 2023 i proventi dell'Income report entrano nel quadro RT delle cripto (escludibili per anno); l'Other gains si riporta a scelta nel quadro RT al 26% o nel quadro RM; gli altri sono riepiloghi informativi nella scheda dei quadri |

Criteri (regole dello studio):

- **Perimetro:** totale di tutti i wallet per cripto; escluse le valute tradizionali, incluse le stablecoin.
- **Saldi al 1/1:** presi dal report di inizio anno e confrontati con quelli ricostruiti dalle transazioni.
- **Giorno detenuto:** conta se il saldo a inizio giornata è positivo o se nel giorno c'è un'entrata. Aritmetica esatta sui decimali.
- **Periodi:** ogni cambio di quantità apre un periodo. Un acquisto lo apre dal giorno stesso. Una vendita chiude il periodo nel giorno della vendita, con la quantità di prima e il valore a quella data; il residuo riparte dal giorno dopo.
- **Valori:** valore iniziale e finale sono quelli di inizio e fine detenzione di ogni periodo, non del 1/1 e del 31/12. Il valore iniziale di un periodo è il valore finale del precedente; il primo parte dal report di inizio anno. Prezzi dal controvalore in euro delle transazioni; dai report per i periodi che iniziano il 1/1 o finiscono il 31/12.
- **IVACA** (rigo RW col. 33) = valore finale × 0,20% × quota × giorni / 365, per periodo.
- **Token sospetti** (spam, phishing, imitazioni di USDT/USDC con caratteri non latini, saldi mai positivi): esclusi dai totali, elencati e includibili.

Uscite: tabella a video con i periodi; Excel (fogli «Righi RW» e «Riepilogo per cripto», A4 orizzontale, imposta a formula); resoconto da stampare o salvare in PDF con tutti i periodi.

## 2. Costi di carico (LIFO globale)

- **Partenza:** costi ricostruiti dall'origine, dalla prima transazione Koinly, non dai saldi di inizio anno.
- **Metodo:** una pila di strati per cripto, unica per tutti i wallet e tutti gli anni (LIFO globale).
- **Criteri:**
  - acquisto: costo pagato con le commissioni;
  - permuta: valore del momento;
  - interessi, reward e airdrop: valore del giorno;
  - trasferimenti tra wallet propri: nessun effetto, e quelli non abbinati da Koinly sono riconosciuti in automatico.
- **eToro e broker esteri:** lettura del rendiconto eToro in PDF (posizioni chiuse per categoria, trasferimenti al wallet cripto con il costo d'origine, dividendi, airdrop, portafoglio a inizio e fine anno per strumento, saldo); calcolo per anno dei quadri RT (sezione al 26%, minusvalenze riportate per quattro anni), RM (dividendi al lordo, per Stato) e RW (codici 1, 2, 9, 14/21 con IVAFE e IVACA) e dei codici F24; i valori RT e RM si riportano nella scheda dei quadri, dove si possono anche inserire a mano.
- **Altri broker esteri** (Trade Republic, Degiro, Interactive Brokers, Revolut e ogni altro intermediario): modello CSV generico da scaricare nel riquadro «Rendiconti», una riga per voce, importi in euro: cessioni (corrispettivo e costo), dividendi, proventi di OICR, interessi e altri redditi di capitale (lordo, ritenuta estera, Stato), posizioni e liquidità per il quadro RW (periodo nell'anno, valore iniziale e finale, Stato, codice RW facoltativo). I quadri RT al 26% (con le minusvalenze riportate per quattro anni), RM per tipo e Stato e RW con IVAFE e IVACA si calcolano con lo stesso motore di eToro (`estero.js`) e si riportano nella scheda dei quadri.
- **Operazioni da verificare e richiesta al cliente:**
  - ogni deposito o prelievo verso wallet non collegati riporta degli indizi: destinazione e hash assenti, probabile invio di prova, uscita di somme appena ricevute in prestito (anche se il prestito è in valuta e viene subito cambiato in stablecoin);
  - il pulsante «Richiesta di chiarimenti al cliente» stampa le operazioni filtrate non ancora corrette, con le domande e i documenti da chiedere.
- **Swap dal 2023** (regole dello studio, art. 67 c. 1 lett. c-sexies TUIR):
  - permute tra cripto, acquisti con stablecoin e scambi tra stablecoin non realizzano e trasferiscono il costo LIFO alla cripto ricevuta;
  - restano cessioni le vendite contro valuta e contro stablecoin;
  - prima del 2023 le permute sono al valore del momento;
  - la regola si può disattivare nella scheda per confronto.
- **Correzioni dello studio,** per riga del file e con il motivo:
  - deposito da wallet non collegato: costo documentato, rientro da wallet proprio o costo zero;
  - prelievo verso indirizzo non collegato: trasferimento a wallet proprio o cessione a terzi;
  - operazione senza controvalore: valore inserito a mano.
- **Salvataggio:** correzioni e attribuzioni si salvano e si ricaricano in un file JSON.
- **Uscite:** riscontro con i costi dei report Koinly; Excel (costi, strati, cessioni, correzioni) e PDF. Il quadro RT usa questi costi come fonte predefinita.
- **Estratti conto bancari in PDF, anonimizzati alla lettura** (`banca.js`):
  - si tengono solo data, importo, segno ed exchange dei movimenti con piattaforme di cripto-attività;
  - tutte le altre righe sono scartate e se ne conta solo il numero;
  - nomi, IBAN, indirizzi e causali non vengono mai conservati né mostrati;
  - i movimenti si riscontrano con versamenti, prelievi, acquisti e vendite in euro registrati in Koinly.
- **Confronto con Koinly, cessione per cessione:** si carica il «Complete tax report» in PDF, anche su più anni. Se ne legge l'elenco delle cessioni e si tengono quelle dell'anno. Ogni cessione si abbina alla ricostruita per cripto, data (±1 giorno, Koinly usa l'ora italiana) e quantità (±0,5%). La differenza di plusvalenza si scompone in:
  - operazioni che Koinly tassa ma che non rilevano;
  - differenze di corrispettivo e di costo;
  - cessioni presenti solo in Koinly;
  - cessioni presenti solo nella ricostruzione.

  Il confronto è anche nell'Excel e nella memoria.
- **Privacy nei report:** le descrizioni Koinly dei movimenti in euro, che possono contenere banca e IBAN del cliente, non vengono riportate.

## 3. Questionario dell'Agenzia delle Entrate

Elementi di risposta alle 8 domande tipo (art. 32 DPR 600/1973):

1. acquisti e intermediari;
2. movimenti in valuta sugli exchange;
3. wallet alle date, con tipologia, chiavi pubbliche e indirizzi;
4. elenco delle transazioni con TxHash;
5. saldi per wallet valorizzati;
6. cessioni, permute e proventi;
7. trasferimenti verso terzi;
8. rilevanza reddituale.

Inoltre:

- **Attribuzione** di ogni wallet o indirizzo («mio», «non mio», «piattaforma», «da chiarire»).
- **Dichiarazione sostitutiva di atto notorio** (art. 47 DPR 445/2000) sui soli wallet dichiarati «mio».
- **Verifica della provenienza dei fondi** (`provenienza.js`), nel questionario e nel fascicolo stampato, con semaforo per anno e complessivo: verde = provenienza dimostrata, giallo = compatibile ma con avvisi, rosso = non dimostrata. Si confronta in modo cumulato il denaro entrato nelle piattaforme (versamenti o acquisti in valuta, al netto dei rientri) con i redditi netti delle dichiarazioni dei redditi caricate (Redditi PF, 730 o CU: dal PDF si legge solo l'anno d'imposta; reddito complessivo e imposte si inseriscono a mano) e con le altre fonti documentate (eredità, donazioni, vendite, TFR). Avvisi: impiego oltre il 70% dei redditi netti, dichiarazione dell'anno mancante, estratti conto mancanti o versamenti non ritrovati, depositi di cripto da wallet non collegati non documentati (rosso da 500 €) o caricati a costo zero. Le dichiarazioni sono elencate tra gli allegati della memoria.
- **Memoria finale:** fonti, metodo, correzioni con i motivi, differenze anno per anno rispetto ai report Koinly senza modifiche.

## 4. Sanzioni RW e RT

Per ogni anno da ravvedere:

- **Dati:** si carica il «Complete tax report» Koinly (PDF) o i saldi di fine anno (CSV). Il valore finale per l'RW e le plusvalenze nette si compilano da lì e sono modificabili. L'IVACA si prende dalla prima pagina per lo stesso anno.
- **Norma applicabile:** quella vigente quando la violazione è commessa. L'infedele dichiarazione si considera commessa alla scadenza della dichiarazione, l'omesso versamento alla scadenza del saldo. Per le violazioni dal 1/9/2024 vale il testo modificato dal D.Lgs. 87/2024.
- **RW:** 3% minimo (art. 5 c. 2 DL 167/1990) × frazione di ravvedimento (art. 13 D.Lgs. 472/1997).
- **IVACA e RT, dichiarazione presentata:** si integra. Sanzione per infedele: previgente 90%; dal 1/9/2024 50% con l'integrativa presentata prima di accessi, ispezioni e verifiche (art. 1 c. 2-bis D.Lgs. 471/1997), con il confronto con il 70% minimo 150 € dell'infedele contestata (c. 2). Si riduce con la frazione e assorbe l'omesso versamento. Interessi legali giorno per giorno dalla scadenza del saldo.
- **IVACA prima del 2023:** non dovuta; resta la sanzione per omesso monitoraggio RW.
- **Termine della dichiarazione non ancora scaduto:** solo omesso versamento del saldo (25% o 30%, ridotto).
- **Dichiarazione omessa** (nulla presentato, neanche per altri redditi): entro 90 giorni è tardiva (25 € più 258 € del quadro RW ridotti a 1/10, o a 1/9 secondo un'altra lettura). Oltre 90 giorni non è ravvedibile; versione principale la presentazione spontanea prima dei controlli: dal 1/9/2024 75% delle imposte (art. 1 c. 1-bis), fino al 31/8/2024 60% minimo 200 € se entro il termine della dichiarazione dell'anno successivo. Alternativa: contestazione al 120% definibile a 1/3.
- **Controlli in corso** (accesso, PVC, schema di atto, avviso): dal 1/9/2024 con accessi o verifiche il 50% del c. 2-bis non spetta e si parte dal 70% (c. 2); riduzioni 1/5 dopo il PVC, 1/6 dopo lo schema di atto senza PVC, 1/4 dopo lo schema preceduto da PVC; l'avviso preclude il ravvedimento (acquiescenza a 1/3). Minimo di 150 € ridotto quando la percentuale dà meno; riduzione di 1/3 (c. 4) e aumento per condotte fraudolente (c. 3) su richiesta.
- **Versioni e avvertenze:** fino al 31/8/2024 maggiorazione di 1/3 per redditi esteri come tesi prudenziale (per lo studio le cripto sono aterritoriali); caso dubbio dell'invio prima del 1/9/2024 con termine successivo; favor rei solo come tesi difensiva; cumulo giuridico dal 1/9/2024 non applicato (versione prudente); termine di accertamento (art. 43 DPR 600/1973, 5 o 7 anni) con avviso se scaduto o in scadenza entro 90 giorni; soglie penali (art. 4 e 5 D.Lgs. 74/2000).

Fonti in [docs/FONTI.md](docs/FONTI.md).

## 5. Quadri RW, RT e F24

Prospetti compilati secondo i modelli ministeriali, stampabili in PDF con l'intestazione dello studio:

- **Quadro RW:** un rigo per periodo di detenzione, cinque righi per modulo. Colonne: col. 1 titolo, col. 3 codice 21, col. 5 quota, col. 6 criterio 1, col. 7 e 8 valori in euro, col. 10 giorni, col. 33 e 34 imposta. Rigo RW8 con il totale esatto arrotondato all'euro. Le cripto con molti periodi (soglia modificabile) vanno in un rigo unico con valore medio ponderato e giorni complessivi.
- **Quadro RT:** sezione cripto-attività con i righi del modello dell'anno.

  | Anno | Modello | Righi | Franchigia di 2.000 € |
  |---|---|---|---|
  | 2023 | Redditi PF 2024 | RT31-RT39 | solo l'eccedenza (criterio dello studio) |
  | 2024 | Redditi PF 2025 | RT41, RT43-RT45, RT57, RT88-RT90 | solo l'eccedenza |
  | 2025 | Redditi PF 2026 | RT41 col. 3-4 | nessuna |

  Plusvalenza = corrispettivi − costi.
- **Proventi da detenzione** (staking, reward, airdrop, interessi, cashback): dal 2023 sono redditi diversi dell'art. 67 c. 1 lett. c-sexies TUIR al ricevimento e si sommano ai corrispettivi del quadro RT a costo zero; le cripto ricevute entrano nei costi di carico con lo stesso valore. Fonte: «Income report» CSV dell'anno o, in mancanza, il riepilogo redditi del «Complete tax report». Escludibili anno per anno nella scheda Sanzioni. Fino al 2022 restano fuori dal quadro RT delle cripto.
- **Other gains** (derivati, futures, margin): non entrano nel quadro RT delle cripto. Lo studio sceglie per anno, secondo il tipo di reddito, se riportarli nel quadro RT al 26% (redditi diversi: profitti come corrispettivi, perdite come costi) o nel quadro RM (redditi di capitale: profitti al lordo, perdite non deducibili).
- **F24, sezione Erario:**

  | Codice | Uso | Fonte |
  |---|---|---|
  | 1727 | Imposta sulle cripto-attività, saldo (rateazione 0101) | Ris. 36/E/2023 e 10/E/2024 |
  | 1715 | Imposta sostitutiva RT | Ris. 36/E/2023 |
  | 8945 | Sanzione da ravvedimento | Ris. 12/E/2023; per l'IC per analogia |
  | 1945 | Interessi da ravvedimento | Ris. 12/E/2023; per l'IC per analogia |
  | 8911 | Sanzione RW e dichiarazione tardiva | |

  Anno di riferimento = anno d'imposta. Gli anni con dichiarazione omessa non vanno in F24.

## 6. Guida

Scheda «Guida» per il cliente (`guida.js`): quali file Koinly scaricare, come usare le tre pagine, avvertenze. Si stampa o si salva in PDF con l'intestazione dello studio.

## File

| File | Contenuto |
|---|---|
| `index.html`, `ui.js`, `koinly.css` | Pagina e interfaccia |
| `lettura.js` | Lettura dei report di saldi Koinly (CSV e PDF, italiano e inglese) |
| `detenzione.js` | Transazioni, giorni di detenzione, periodi, token sospetti, riscontri |
| `ivaca.js` | Valori dei periodi e imposta |
| `banca.js` | Lettura anonimizzata degli estratti conto e riscontro con Koinly |
| `etoro.js` | Lettura del rendiconto eToro in PDF e passaggio dei dati alla forma comune dei broker esteri |
| `estero.js` | Motore comune dei broker esteri (quadri RT al 26%, RM e RW con IVAFE e IVACA) e lettura del modello CSV generico |
| `report.js` | Lettura degli altri report Koinly (Income, Expenses, Gifts/Lost, Other gains) |
| `costi.js` | Costi di carico LIFO globali dall'origine, abbinamento dei trasferimenti, correzioni dello studio |
| `provenienza.js` | Verifica della provenienza dei fondi con semaforo; anno d'imposta delle dichiarazioni dei redditi |
| `questionario.js` | Elementi di risposta al questionario dell'Agenzia, wallet, chiavi pubbliche e indirizzi |
| `sanzioni.js` | Sanzioni, frazioni di ravvedimento, interessi legali, scadenze per anno |
| `studio.js` | Dati dello studio per la stampa |
| `guida.js` | Testo della guida per il cliente |
| `modelli.js` | Quadri RW e RT del modello Redditi PF e modello F24 |
| `xlsx-mini.js` | Scrittura dei file Excel senza librerie |
| `comune/` | Grafica, caratteri, pdf.js 3.11.174 e lettura dei PDF |
| `img/` | Icone e logo Studio ME, immagine di anteprima dei link, QR code delle donazioni |

## Prove

Sul Mac, senza Node, con JavaScriptCore del sistema (tutte le prove, o solo quelle indicate):

```bash
test/prove.sh
test/prove.sh costi etoro
```

Con Node ogni file si esegue anche da solo, per esempio `node test/costi.test.js`.

I dati delle prove sono inventati. I file reali dei clienti vanno solo nella cartella `campioni/`, esclusa da Git.

## Licenza

Copyright (C) 2026 Dott. Massimo Esposito. Il codice è rilasciato con licenza AGPL-3.0; nome, dati, testi e contenuti dello studio: tutti i diritti riservati al Dott. Massimo Esposito.

Questo programma è software libero: si può ridistribuire e modificare secondo i termini della **GNU Affero General Public License versione 3** (AGPL-3.0), pubblicata dalla Free Software Foundation. Il testo completo è nel file [LICENSE](LICENSE). Chi modifica il programma e lo rende disponibile ad altri, anche come servizio web, deve pubblicare il codice modificato con la stessa licenza.

Il programma è distribuito senza alcuna garanzia: i conteggi vanno sempre verificati da un professionista.

Esclusioni:

| Parte | Licenza |
|---|---|
| `comune/vendor/` (pdf.js) | Apache 2.0, dei rispettivi autori |
| `comune/fonts/` (Source Sans 3, Source Serif 4, IBM Plex Mono) | SIL Open Font License |
| Dati e recapiti dello studio in `studio.js`, logo e icone Studio ME, immagine di anteprima e QR code delle donazioni in `img/` | Non coperti dalla licenza e non riutilizzabili: chi riusa il programma deve inserire i propri |
