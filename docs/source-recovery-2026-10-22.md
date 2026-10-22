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

## Revisione documentale successiva nella stessa giornata

Letti integralmente via estrazione testuale i PDF ufficiali, scaricati con HTTPS e verifica TLS:

- Liguria, DGR 399 del 24/09/2026, allegato sezioni 3–6: recuperato nel catalogo il rimborso dell'accoglienza residenziale protetta già erogata alle famiglie dei bambini Gaslini nel periodo 15/09/2025–15/09/2026. Plafond 160.000 €, quota massima 350 €/mese per nucleo, senza confonderla con un massimale per progetto. Servono accreditamento Gaslini vigente, esperienza almeno biennale, carta dei servizi, almeno uno degli ultimi due bilanci positivo, rendicontazione validata dal Gaslini. Apertura 6 ottobre e termine 26 ottobre 2026 dalla pagina ufficiale. Nessun requisito inventato di sede legale ligure. Il possesso dei requisiti da parte di RB-0003 resta sconosciuto e indicato nelle verifiche documentali obbligatorie.
  - Pagina: https://www.regione.liguria.it/component/publiccompetitions/publiccompetition/4754:concessione-contributi-accoglienza-bambini-ospedali-2026.html
  - PDF: https://www.regione.liguria.it/components/com_publiccompetitions/includes/download.php?id=80856:dgr-399-2026.pdf
- Liguria, Case rifugio, avviso allegato al DDG 6462/2026, sezione 7: RUNTS, finalità statutarie da almeno cinque anni, attività esclusiva/prevalente contro la violenza e comprovata esperienza quinquennale. Non inserito tra le opportunità pertinenti per un'associazione pazienti in assenza di evidenza di tali attività.
  - PDF: https://www.regione.liguria.it/components/com_publiccompetitions/includes/download.php?id=80174:avviso-case-rifugio.pdf
- Basilicata, patrocinio oneroso III quadrimestre 2026, disciplinare DGR 637/2023, articolo 4: sede legale e uffici strutturati in Basilicata. Non proposto a RB-0003, la cui sede legale è in Veneto. L'operatività nazionale non supera il vincolo.
  - PDF: https://portalebandi.regione.basilicata.it/wp-content/uploads/2026/08/1786435200066_Disciplinare.pdf

Il test aggiunto sulla catena di produzione verifica che il rimborso Gaslini conservi periodo retroattivo, accreditamento da documentare e assenza di un requisito artificiale di sede legale. Totale: 13 test Python e 29 Node superati.

## Recupero dei timeout del runner

L'esecuzione Actions 39758848935 ha confermato il recupero Veneto (28 candidati), ma ha ancora restituito timeout di connessione su Liguria e Basilicata, nonostante tre tentativi; i medesimi elenchi sono stati acquisiti direttamente durante il controllo. Il solo retry non risolve questa differenza di connettività.

Il servizio ora offre un collettore limitato ai due elenchi ufficiali pubblici: sorgenti e handler di lettura sono fissi, nessun URL arbitrario, credenziale o cookie viene inoltrato. Sono ammessi soltanto GET esterni; le pagine successive Basilicata usano internamente il solo handler pubblico di scorrimento. Risposte riuscite in cache per 15 minuti; 403 e altri errori non sono convertiti in successi né memorizzati. HTML restituito con CSP sandbox, massimo 2 MB. Il crawler usa questo percorso soltanto dopo errori di connessione, non per aggirare divieti di accesso. Il test completo corrente comprende 14 test Python e 32 Node.

Il primo test dal servizio Cloudflare eseguito in Nord America ha confermato timeout di connessione HTTP 522. Configurata l'esecuzione del Worker vicino alla regione Milano, con `placement.region=aws:eu-south-1`: non crea risorse AWS né modifica l'accesso alle licenze. Le tre prove successive hanno restituito HTTP 200 con `cf-placement: remote-MXP`: Basilicata pagina 1 (199.140 byte), Basilicata pagina 2 (59.535 byte), Liguria elenco (326.965 byte), ciascuna con intestazione della fonte ufficiale attesa.

Il recupero condiviso è usato anche nell'arricchimento e nel controllo delle prove, limitatamente ai percorsi pubblici delle singole schede e al PDF Gaslini esplicitamente autorizzato. Nessun percorso amministrativo o URL arbitrario accettato. Un host già recuperato con successo nella stessa esecuzione usa il collegamento funzionante anche per le pagine successive, evitando di ripetere i timeout. Ultimo collaudo locale: 15 test Python e 33 Node superati.
