# Verifica fonti e continuità della licenza RB-0003 — 14 ottobre 2026

La licenza è già stata consegnata. Nessuna modifica a URL, credenziali, profilo, preferiti, durata, stato o percorso di assistenza. Gli aggiornamenti riguardano il catalogo e la chiarezza degli stati.

## Esito sulle 8 fonti in sospeso

- Nuovi ponti culturali: pagina e PDF ufficiali confermano sportello, enti culturali non profit, 30–150 mila euro e quota massima 70%. Requisiti statutari, attività culturale professionale e bilancio vanno documentati dal richiedente.
- Musei e accessibilità universale: pagina e PDF confermano prima fase 9 dicembre 2026, 50–200 mila euro, quota massima 80%; capofila proprietario/gestore di museo. Altri ETS devono verificare il ruolo specificamente ammesso. Progetto nel territorio Cariplo e formazione obbligatoria.
- Housing sociale Cariplo: pagina e PDF confermano sportello, progetti in Lombardia/Novara/VCO, contributo 25–500 mila euro fino al 50%. Immobili e gestione, nuovo servizio o potenziamento e precedenti saldi da documentare.
- Cofinanziamento UE: pagina e linee guida confermano sportello e soggetti pubblici/privati non profit italiani. Ricadute nel territorio Cariplo, programmi a cofinanziamento; Horizon Europe escluso. Nessun tetto generale inventato.
- Emergenze Carisbo: pagina e PDF confermano 11 dicembre 2026 salvo esaurimento, fondo 150 mila euro, massimo 10 mila. Intervento nella città metropolitana di Bologna; sede legale esterna ammessa, urgenza documentata.
- Housing Regione Lombardia: riletta pagina ufficiale dopo allarme di variazione; confermati 30 ottobre ore 12, personalità giuridica, sede operativa lombarda, disponibilità immobile almeno 20 anni, massimo 2 milioni.
- Note di comunità: riletti pagina e PDF dopo allarme di variazione; confermati 16 ottobre ore 13 e requisiti del responsabile/partnership. L'ammissibilità della cliente resta da documentare.
- Imprenditoria sociale Cariparo: pagina ufficiale indicata in corso ma PDF SIS v2.1 valido fino al 31 dicembre 2025 salvo proroghe. Finestra 2026 non sufficientemente confermata: sospesa dai risultati attivi, senza dichiarare definitivamente chiuso lo strumento. Record conservato per monitoraggio.

Le prove e gli URL sono registrati in `src/source-reviews.js` e nella watchlist. La data del controllo umano non viene spacciata per un nuovo fetch automatico. Il successivo controllo automatico resta abilitato, anche sulle fonti appena documentate.

## Correzioni di presentazione

La stessa funzione determina la dicitura della scadenza continua nelle schede e nel dettaglio. In presenza di verifica pendente non appare più “fonte verificata”: appare “Scadenza da riconfermare”. Fonte verificata e ammissibilità del cliente sono stati distinti. Nessuna promozione automatica dell'ente a “ammesso”.

Rimosso anche il vecchio testo sul massimale non verificato di Volontariato e Territorio, ormai sostituito dal limite documentato di 5.000 euro.

## Verifica

19 test Node superati: catena di produzione, licenze e preferiti protetti, esclusione POP 2014, limite 50.000 euro, prove mancanti, verifica delle 7 fonti nella catena completa, sospensione della finestra non confermata e diciture coerenti. La suite Python non eseguita in questo ambiente per mancanza della dipendenza requests; non sono stati modificati gli script della pipeline.
