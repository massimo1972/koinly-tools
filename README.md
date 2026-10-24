# Koinly Tools

Web app statica per le cripto-attività a partire dai report Koinly. Tutto gira nel browser: i file caricati non vengono salvati né inviati in rete. È pensata per essere incorporata (iframe) nella pagina del sito dello studio; `_headers` consente l'incorporamento da studiomecommercialisti.it.

## 1. Giorni di detenzione e IVACA

File richiesti (tutti obbligatori):

| File | Contenuto |
|---|---|
| Transazioni | CSV Koinly: `backup_transactions_koinly.csv` (date UTC, numeri 1234.56) oppure «transaction history» (anche con numeri in formato italiano) |
| Saldi a inizio anno | «Beginning of year holdings» CSV (o report di fine dell'anno precedente) |
| Saldi a fine anno | «End of year holdings» CSV o «Complete tax report» PDF |

Criteri (regole dello studio):

- **Perimetro:** totale di tutti i wallet per cripto; escluse le valute tradizionali, incluse le stablecoin.
- **Saldi al 1/1:** presi dal report di inizio anno e confrontati con quelli ricostruiti dalle transazioni.
- **Giorno detenuto:** conta se il saldo a inizio giornata è positivo o se nel giorno c'è un'entrata. Aritmetica esatta sui decimali.
- **Periodi:** ogni cambio di quantità apre un periodo. Un acquisto lo apre dal giorno stesso. Una vendita chiude il periodo nel giorno della vendita, con la quantità di prima e il valore a quella data; il residuo riparte dal giorno dopo.
- **Valori:** valore iniziale e finale sono quelli di inizio e fine detenzione di ogni periodo, non del 1/1 e del 31/12. Il valore iniziale di un periodo è il valore finale del precedente; il primo parte dal report di inizio anno. Prezzi dal controvalore in euro delle transazioni; dai report per i periodi che iniziano il 1/1 o finiscono il 31/12.
- **IVACA** (rigo RW col. 33) = valore finale × 0,20% × quota × giorni / 365, per periodo.
- **Token sospetti** (spam, phishing, imitazioni di USDT/USDC con caratteri non latini, saldi mai positivi): esclusi dai totali, elencati e includibili.

Uscite: tabella a video con i periodi; Excel (fogli «Righi RW» e «Riepilogo per cripto», A4 orizzontale, imposta a formula); resoconto da stampare o salvare in PDF con tutti i periodi.

## 2. Sanzioni RW e RT

Per ogni anno da ravvedere:

- **Dati:** si carica il «Complete tax report» Koinly (PDF) o i saldi di fine anno (CSV). Il valore finale per l'RW e le plusvalenze nette si compilano da lì e sono modificabili. L'IVACA si prende dalla prima pagina per lo stesso anno.
- **Norma applicabile:** quella vigente quando la violazione è commessa. L'infedele dichiarazione si considera commessa alla scadenza della dichiarazione, l'omesso versamento alla scadenza del saldo. Per le violazioni dal 1/9/2024 vale il testo modificato dal D.Lgs. 87/2024.
- **RW:** 3% minimo (art. 5 c. 2 DL 167/1990) × frazione di ravvedimento (art. 13 D.Lgs. 472/1997).
- **IVACA e RT, dichiarazione presentata:** si integra. Sanzione per infedele: previgente 90%; dal 1/9/2024 50% (art. 1 c. 2-bis D.Lgs. 471/1997). Si riduce con la frazione e assorbe l'omesso versamento. Interessi legali giorno per giorno dalla scadenza del saldo.
- **IVACA prima del 2023:** non dovuta; resta la sanzione per omesso monitoraggio RW.
- **Termine della dichiarazione non ancora scaduto:** solo omesso versamento del saldo (25% o 30%, ridotto).
- **Dichiarazione omessa** (nulla presentato, neanche per altri redditi): ravvedimento non possibile oltre 90 giorni. Si mostrano sanzioni minime e definizione a 1/3, con l'indicazione di attendere la contestazione dell'Agenzia e non pagare in autonomia. Entro 90 giorni vale come tardiva (1/10 di 250 €).

Fonti in [docs/FONTI.md](docs/FONTI.md).

## File

| File | Contenuto |
|---|---|
| `index.html`, `ui.js`, `koinly.css` | Pagina e interfaccia |
| `lettura.js` | Lettura dei report di saldi Koinly (CSV e PDF, italiano e inglese) |
| `detenzione.js` | Transazioni, giorni di detenzione, periodi, token sospetti, riscontri |
| `ivaca.js` | Valori dei periodi e imposta |
| `sanzioni.js` | Sanzioni, frazioni di ravvedimento, interessi legali, scadenze per anno |
| `studio.js` | Dati dello studio per la stampa |
| `xlsx-mini.js` | Scrittura dei file Excel senza librerie |
| `comune/` | Grafica, caratteri, pdf.js 3.11.174 e lettura dei PDF (da strumenti-lumes) |

## Prove

```bash
node test/detenzione.test.js
node test/sanzioni.test.js
```

I dati delle prove sono inventati. I file reali dei clienti vanno solo nella cartella `campioni/`, esclusa da Git.
