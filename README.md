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

In preparazione. Fonti raccolte in [docs/FONTI.md](docs/FONTI.md).

## File

| File | Contenuto |
|---|---|
| `index.html`, `ui.js`, `koinly.css` | Pagina e interfaccia |
| `lettura.js` | Lettura dei report di saldi Koinly (CSV e PDF, italiano e inglese) |
| `detenzione.js` | Transazioni, giorni di detenzione, periodi, token sospetti, riscontri |
| `ivaca.js` | Valori dei periodi e imposta |
| `xlsx-mini.js` | Scrittura dei file Excel senza librerie |
| `comune/` | Grafica, caratteri, pdf.js 3.11.174 e lettura dei PDF (da strumenti-lumes) |

## Prove

```bash
node test/detenzione.test.js
```

I dati delle prove sono inventati. I file reali dei clienti vanno solo nella cartella `campioni/`, esclusa da Git.
