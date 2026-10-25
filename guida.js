/* Koinly Tools · Copyright (C) 2026 Massimo Esposito · licenza GNU AGPL-3.0 (file LICENSE) */
/* Koinly Tools · guida per il cliente (scheda «Guida» e stampa). */
window.KoinlyGuida = '' +
'<h2>Guida: come funziona Koinly Tools</h2>' +
'<p class="lead">Koinly Tools prepara i conteggi sulle cripto-attività per la dichiarazione dei redditi a partire dai report di Koinly: giorni e periodi di detenzione, imposta sul valore delle cripto-attività (IVACA), quadri RW e RT, eventuali sanzioni con il ravvedimento e il modello F24.</p>' +

'<div class="banner beta-avviso"><strong>Versione beta</strong><p>Il programma è in fase di test: i conteggi vanno sempre verificati con lo studio.</p></div>' +
'<div class="banner"><strong>Riservatezza</strong><p>I file che caricate restano sul vostro computer: il programma li legge nel browser e non li salva né li invia in rete. Chiudendo la pagina i dati spariscono.</p></div>' +

'<div class="panel"><h3 style="margin-top:0">1. Quali file servono</h3>' +
'<p>Tutti i file si scaricano dal vostro account Koinly, uno per ogni anno da esaminare. Prima di scaricarli verificate in Koinly che i wallet e gli exchange siano tutti collegati e che non ci siano avvisi di transazioni mancanti.</p>' +
'<table class="det"><thead><tr><th>File</th><th>Formato</th><th>Dove si usa</th><th>Che cosa contiene</th></tr></thead><tbody>' +
'<tr><td><b>Transazioni</b><br><span class="small">di solito «backup_transactions_koinly.csv» o «transaction history»</span></td><td>CSV</td><td>Giorni di detenzione e IVACA</td><td>Tutte le operazioni di tutti gli anni (acquisti, vendite, scambi, trasferimenti, interessi): servono per vedere quando cambiano le quantità.</td></tr>' +
'<tr><td><b>Saldi a inizio anno</b><br><span class="small">«Beginning of year holdings»</span></td><td>CSV</td><td>Giorni di detenzione e IVACA</td><td>Le cripto possedute al 1° gennaio, con quantità e valore.</td></tr>' +
'<tr><td><b>Saldi a fine anno</b><br><span class="small">«End of year holdings»</span></td><td>CSV (oppure il Complete tax report)</td><td>Giorni di detenzione e IVACA</td><td>Le cripto possedute al 31 dicembre, con quantità e valore.</td></tr>' +
'<tr><td><b>Resoconto fiscale completo</b><br><span class="small">«Complete tax report»</span></td><td>PDF</td><td>Sanzioni RW e RT</td><td>Per l\'anno: corrispettivi delle vendite, costi di acquisto, plusvalenze, redditi e saldi di fine anno.</td></tr>' +
'</tbody></table>' +
'<p class="small">Dove trovarli in Koinly: i report dei saldi e il Complete tax report sono nella sezione dei report fiscali (Tax reports), scegliendo l\'anno; il file delle transazioni si esporta dalla pagina delle transazioni (Transactions, comando di esportazione in CSV). I nomi dei menu possono cambiare con gli aggiornamenti di Koinly: in caso di dubbio chiedete allo studio.</p>' +
'<p class="small">Il file delle transazioni deve contenere tutta la storia, dal primo acquisto, non solo l\'anno in esame. Scegliete in Koinly la valuta euro.</p></div>' +

'<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">2. Giorni di detenzione e IVACA (prima scheda)</h3><ol>' +
'<li>Caricate i tre file: transazioni, saldi a inizio anno e saldi a fine anno. Sono tutti obbligatori.</li>' +
'<li>Controllate l\'anno, il fuso orario (lasciate UTC se non avete indicazioni diverse) e la quota di possesso (100% se le cripto sono solo vostre).</li>' +
'<li>Leggete i <b>riscontri</b>: il programma confronta le quantità ricostruite dalle transazioni con i saldi di Koinly al 1° gennaio e al 31 dicembre. Se segnala differenze o saldi negativi, nello storico di Koinly manca qualcosa: va sistemato prima di usare i risultati.</li>' +
'<li>Per ogni cripto vedete i giorni di detenzione e i <b>periodi</b>: ogni volta che la quantità cambia (acquisto, vendita, interessi) inizia un nuovo periodo, con valore iniziale e finale. Cliccando sul numero dei periodi si apre il dettaglio.</li>' +
'<li>L\'<b>IVACA</b> è lo 0,20% del valore, in proporzione ai giorni: il totale è in alto. Se non supera 12 € non si versa.</li>' +
'<li>I <b>token sospetti</b> (pubblicità, phishing, imitazioni di USDT e USDC ricevute senza averle chieste) sono esclusi e messi in fondo: si possono includere se sono cripto vere.</li>' +
'<li>Con <b>Scarica Excel</b> e <b>Stampa / PDF</b> ottenete i conteggi da conservare o da inviare allo studio.</li></ol></div>' +

'<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">Costi di carico e questionario dell\'Agenzia</h3>' +
'<p>Dal file delle transazioni il programma ricostruisce i costi d\'acquisto di ogni cripto dall\'origine, con il metodo LIFO globale. Le operazioni di cui Koinly non conosce l\'origine o la destinazione (depositi e prelievi da wallet non collegati) vanno chiarite con lo studio: sono elencate nella scheda «Costi di carico». Nella scheda «Questionario AdE» si preparano le risposte alle domande dell\'Agenzia e si indica quali wallet e indirizzi sono vostri, per la dichiarazione sostitutiva.</p></div>' +
'<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">3. Sanzioni RW e RT (seconda scheda)</h3>' +
'<p>Serve se negli anni passati le cripto non sono state indicate nella dichiarazione dei redditi (quadro RW per il possesso, quadro RT per le plusvalenze).</p><ol>' +
'<li>Indicate la data in cui pensate di pagare: la riduzione delle sanzioni (ravvedimento) dipende da quanto tempo è passato.</li>' +
'<li>Per ogni anno premete «Aggiungi un anno» e caricate il Complete tax report di quell\'anno: valore delle cripto, corrispettivi e costi si compilano da soli e si possono correggere.</li>' +
'<li>Scegliete se la dichiarazione di quell\'anno è stata presentata (senza le cripto) oppure non è stata presentata affatto.</li>' +
'<li>Il programma calcola imposte, sanzioni ridotte e interessi. Se la dichiarazione non è stata presentata il ravvedimento non è possibile: il programma lo segnala e mostra gli importi solo come confronto. In questo caso non pagate nulla da soli e parlatene con lo studio.</li></ol></div>' +

'<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">4. Quadri RW, RT e F24 (terza scheda)</h3>' +
'<p>Il programma prepara i prospetti compilati come nei modelli ufficiali: il quadro RW con un rigo per ogni periodo di detenzione, il quadro RT con i righi dell\'anno e il modello F24 con i codici tributo per il versamento. Ogni prospetto si stampa o si salva in PDF.</p></div>' +

'<div class="panel" style="margin-top:14px"><h3 style="margin-top:0">5. Da sapere</h3><ul>' +
'<li>I risultati dipendono dai dati di Koinly: se in Koinly mancano operazioni o prezzi, anche i conteggi saranno incompleti.</li>' +
'<li>Il programma somma tutti i wallet per ciascuna cripto. Nella dichiarazione va compilato un rigo per ogni portafoglio: lo studio ripartisce i valori.</li>' +
'<li>Le stablecoin (USDT, USDC…) sono cripto-attività e sono comprese; gli euro e le altre valute sui conti degli exchange no.</li>' +
'<li>I conteggi sono una stima da verificare con lo studio: non sostituiscono il parere del professionista e non vanno usati per versare imposte o sanzioni senza averne parlato.</li>' +
'<li>Koinly Tools non è affiliato né approvato da Koinly: «Koinly» è un marchio dei rispettivi titolari, citato solo per indicare i report compatibili.</li></ul></div>';
