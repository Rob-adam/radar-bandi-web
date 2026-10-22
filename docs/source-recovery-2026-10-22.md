# Recupero acquisizione fonti, 22 ottobre 2026

Questa modifica ripara tre acquisizioni concrete. Non certifica la copertura di tutte le opportunità nazionali, regionali o UE né l'ammissibilità di RB-0003.

## Riscontri sulle fonti ufficiali

- Basilicata: `/PortaleBandi/` restituisce HTTP 200 ma solo 240 byte con un meta refresh al vecchio applicativo. Il portale corrente è https://portalebandi.regione.basilicata.it/ . Le schede sono `jet-listing-grid__item`, con titolo in `elementor-heading-title`. L'elenco pubblico «in scadenza» ha dieci pagine: il recupero tramite lo stesso handler pubblico `listing_load_more` usato dallo scorrimento del sito ha letto 98 record distinti. Numerosi record sono appalti, affidamenti o dati storici con scadenze convenzionali: non sono 98 bandi per ETS.
- Liguria: https://www.regione.liguria.it/component/publiccompetitions/category/3-contributi.html restituisce le schede complete. Occorre leggere tutto il contenitore `pc_latest_item`: i destinatari e la chiusura sono fratelli del titolo. Il recupero ha prodotto quattro candidati da approfondire, incluso un vecchio record senza data finale. Nessuna di queste acquisizioni certifica una candidatura per Simona.
- Veneto: `/Public/Elenco` restituisce la homepage; `/Public/Elenco?Tipo=1` carica un guscio HTML. Il JavaScript ufficiale `/Scripts/public_utility.min.js` identifica il servizio pubblico `/Public/GetListaAttiJson`. L'esecuzione ha percorso tutte le pagine dei 804 record restituiti e conservato 28 voci con data non trascorsa al momento del controllo. Sono candidati grezzi, inclusi bandi per altri destinatari ed esiti: serve approfondimento editoriale.

Le pagine sono state scaricate direttamente via HTTPS con verifica dei certificati attiva. I timeout iniziali del servizio di ricerca non sono stati trattati come verifiche riuscite. I successivi controlli HTTP diretti hanno restituito il contenuto sopra descritto.

## Modifiche e verifica

Ritentativi limitati per timeout, errori di connessione e HTTP 500/502/503/504; nessun tentativo di aggirare accessi privati o HTTP 403. Gli errori strutturali e le pagine ripetute/interrotte non valgono come elenchi vuoti riusciti. Il workflow di aggiornamento su push è limitato a main, affinché un ramo di revisione non pubblichi il catalogo in produzione.

Superati 13 test Python, inclusi recupero dopo timeout, isolamento delle schede, cambio portale e paginazione; superati 28 test Node per dashboard, profili, licenze, preferiti, scadenze e video. Nessuna modifica alla configurazione effettiva di RB-0003.

## Lavoro ancora necessario prima di dichiarare il risultato completo

Applicare e verificare la pipeline in produzione; approfondire testo ufficiale e allegati dei candidati recuperati, includere solo opportunità reali aperte pertinenti al catalogo cliente e documentarne i requisiti. Il filtro di pubblicazione attuale richiede revisione documentata: una nuova acquisizione grezza non arriva automaticamente nella licenza. Verificare inoltre gli altri lettori regionali generici, le fonti tematiche Veneto, i bandi nazionali e UE e le opportunità a sportello che non compaiono nell'elenco Basilicata «in scadenza». Un HTTP 200 e zero record non provano l'assenza di bandi.
