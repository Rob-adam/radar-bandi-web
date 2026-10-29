# Richieste dal sito e attivazione manuale

Stato: implementazione preparata, disattivata e non pubblicata in produzione. Base esaminata: main, 7ca37d9c5869a7ec6acc5c1c4c5de14988105b05. Non usare vecchi pacchetti completi del sito.

## Percorso

1. La scheda di bandovera.it resta utilizzabile con email e Messenger. L'add-on opzionale aggiunge un invio esplicito protetto da Turnstile.
2. POST /api/requests conserva integralmente la scheda e una mappatura letterale del profilo. La richiesta è pending; nessun record licenza viene scritto in KV e nessun accesso viene consegnato.
3. Parte un'email privata con istruzioni di bonifico, importo fisso 19,90 €, riferimento della richiesta e denominazione dell'ente. Beneficiario e IBAN provengono esclusivamente da segreti verificati. Nessun rinnovo automatico.
4. Nella dashboard /admin/ esistente, Roberto legge la scheda e la mappatura, conferma la revisione e l'effettivo accredito e inserisce un riferimento della verifica. La ricevuta del cliente non basta.
5. La conferma riserva un unico codice e credenziale; scrive la licenza nel KV LICENSES già esistente e invia privatamente l'accesso. Durata: dodici mesi di calendario dalla data italiana della conferma; expiresAt è l'ultimo giorno incluso prima dell'anniversario, con fine mese limitata nei casi bisestili.

Non c'è una dashboard parallela. L'archivio di coordinamento conserva richieste, prenotazioni e stato email; il sistema clienti continua a leggere le licenze dal KV esistente. Nessuna credenziale esistente è ruotata. Le categorie composite del sito restano composite, ONLUS e Associazione restano tali, ambito territoriale e personalità giuridica non vengono inventati. Le opzioni non presenti nei selettori della dashboard sono mantenute come dati dichiarati. CF, P.IVA, contatti e scheda originale restano nell'archivio amministrativo, esclusi dal profilo inserito nei link cliente.

## Concorrenza, errori e privacy

Un unico Durable Object SQLite serializza richieste e TUTTE le scritture amministrative di licenze quando la funzione è abilitata. Prenota codice e credenziale in transazione prima di scrivere in KV. Una scrittura interrotta si recupera dalla dashboard riutilizzando la stessa prenotazione; anche le scritture manuali interrotte appaiono da recuperare. La modifica del nome associato a un codice esistente e il cambiamento di identità fiscale sono bloccati per evitare sovrascritture involontarie. Le creazioni manuali richiedono un'intenzione esplicita di creazione, quindi una dashboard obsoleta non può reinterpretare una collisione come modifica.

Il bootstrap importa i record esistenti con paginazione senza modificarli. Prima dell'abilitazione fermare temporaneamente le scritture amministrative e qualsiasi script esterno di migrazione, confrontare il censimento completo con KV e verificare credenziali e stato prima/dopo. Dopo il bootstrap, nessun altro processo deve scrivere direttamente in LICENSES: gli aggiornamenti vanno dal coordinatore. La routine scripts/migrate-client-access.mjs del workflow attuale scrive direttamente RB-0003: va esclusa dal percorso di deploy prima dell'abilitazione, dopo aver verificato che l'accesso cliente esistente è già configurato. Non rieseguirla per provare questa integrazione. KV ha consistenza eventuale: un codice appena attivato può richiedere propagazione prima di funzionare; questo non giustifica una seconda licenza.

Richieste duplicate per identità fiscale/P.IVA (o nome per i record legacy) ricevono una risposta pubblica generica, senza rivelare dati precedenti, codici o link. CORS ammette solo https://bandovera.it. Turnstile è verificato lato server con hostname e action; corpo massimo 64 KiB, 150 campi e 4.000 caratteri/campo. Limiti applicativi: 3 tentativi/IP pseudonimizzato/ora e 20 totali/ora. I contatori dell'ora precedente sono eliminati; non vengono conservati IP in chiaro. Le API amministrative richiedono ADMIN_API_KEY; le origini estranee sono rifiutate. Risposte no-store e no-referrer, nessuna stampa di credenziali, schede, email o collegamenti privati.

## Email

Il trasporto usa SMTP autenticato con TLS implicito su authsmtp.securemail.pro:465. Nessun servizio a pagamento è stato acquistato. SMTP_READY è un concetto applicativo: la funzione smtpReady richiede esplicitamente SMTP_VERIFIED=true e tutti i parametri. Il prodotto reale della casella deve essere verificato: la configurazione standard usa l'indirizzo completo come utente; un eventuale prodotto SMTP aggiuntivo può avere credenziali diverse. Non dedurre il prodotto dalla sola possibilità di aprire la webmail.

Stati distinti: not_sent, sending (mostrato come incerto dopo interruzione), failed, uncertain, accepted, delivered. accepted significa risposta SMTP 250 dopo DATA, non consegna. delivered richiede conferma manuale del destinatario. Un errore di chiusura dopo 250 non cambia accepted in failed. Una disconnessione dopo DATA senza risposta definitiva diventa uncertain. I messaggi failed possono essere reinviati dalla dashboard, con stesso Message-ID e senza creare licenze. Gli esiti incerti/accettati non si reinviano automaticamente: verificare con destinatario e servizio SMTP. La conferma di ricezione può risolvere uno stato incerto; un eventuale mancato invio richiede indagine amministrativa e non è risolto dalla sola assenza del messaggio nella casella del destinatario.

## Configurazione riservata necessaria prima della produzione

Non inserire segreti nel repository, nella chat, in file pubblici o negli argomenti di un comando. Usare i campi Secrets del Worker su Cloudflare, nella sessione autenticata del titolare, oppure l'inserimento interattivo riservato offerto da wrangler secret put. Non leggere o stampare i valori dopo il salvataggio.

Segreti: ADMIN_API_KEY già esistente (non modificarlo); SMTP_USER; SMTP_PASSWORD; BONIFICO_IBAN; BONIFICO_BENEFICIARIO; TURNSTILE_SECRET; REQUEST_HASH_KEY (casuale ad alta entropia).
Parametri non segreti: SMTP_HOST=authsmtp.securemail.pro, SMTP_PORT=465, SMTP_FROM=info@bandovera.it. SMTP_VERIFIED=true e BONIFICO_VERIFIED=true solo dopo verifica effettiva. ONBOARDING_ENABLED resta false fino al collaudo.

L'IBAN comunicato privatamente da Roberto ha superato il controllo formale, ma non è stato inserito nel codice pubblico o nei test. Il controllo formale non verifica titolarità, banca o correttezza della destinazione: il titolare deve confermare il dato nel pannello riservato.

Il file wrangler.jsonc corrente non è modificato. Il binding/migrazione necessari sono illustrati in integration/wrangler-onboarding.example.json; l'esempio NON è un comando di deploy né la configurazione completa. Verificare prima il piano/account e l'assenza di nuove spese: non cambiare piano o abilitare servizi a pagamento. La scelta SQLite supporta anche il piano gratuito ove disponibile, ma il piano reale non è stato verificato. La residenza dei dati e la privacy del sito devono essere aggiornate al percorso effettivo: la vecchia dichiarazione sul solo server commerciale non basta per invii a Cloudflare e al servizio antispam.

## Collegamento al sito commerciale

Non sostituire index.html, attiva.html o altri file con versioni vecchie. Dopo la configurazione, inserire soltanto l'add-on integration/site/onboarding-client.js e la configurazione pubblica BANDOVERA_REQUESTS; mantenere i canali manuali. Esempio da integrare nell'attuale attiva.html PRIMA dello script add-on:

```html
<script>
window.BANDOVERA_REQUESTS={enabled:false,endpoint:'https://radar-bandi-online.presidente-56d.workers.dev/api/requests',siteKey:'CHIAVE_PUBBLICA_TURNSTILE_DA_CONFIGURARE'};
</script>
<script src="assets/js/onboarding-client.js" defer></script>
```

Il widget Turnstile deve essere registrato per bandovera.it, action bandovera_request. La scheda corrente deve avere form#scheda e riepilogo#riepilogo. Aggiornare l'informativa prima di abilitare la trasmissione e verificare che conservazione e accessi corrispondano al trattamento reale. L'invio esplicito trasmette tutti i campi, comprese le conferme. La cache della vecchia pagina deve essere considerata: i client obsoleti restano sul percorso manuale.

Preservare logo originale, prezzo separato, FAQ, riquadro pagamento, assenza della testimonianza e video Sara con apertura/avvio al clic e chiusura a fine riproduzione. Lavorare esclusivamente in /var/www/bandovera con backup, senza sudo, nginx, database, ERPNext o altri siti. L'accesso SSH non è disponibile in questa sessione remota; nessuna chiave privata va trasferita.

Il post Facebook fissato rimanda ancora al PDF: il collegamento al form non è stato aggiunto da questo lavoro.

## Collaudo e stato effettivo

Eseguito: node --test tests/*.test.mjs, 67 test passati prima degli ultimi piccoli adeguamenti, da rieseguire sulla revisione finale. Coperti pending senza KV, deduplica, approvazioni concorrenti, pagamento obbligatorio, collisione manuale, recupero stessa credenziale, dati completi e PII escluse dai link, stati SMTP e injection. I test SMTP utilizzano solo stream simulati e indirizzi example.org: nessuna email reale inviata.

Prima della produzione: build Wrangler e prova locale con storage Durable Objects reale; verifica piano/account e permessi binding; verifica prodotto SMTP e credenziali riservate; prova identificabile soltanto verso destinatario autorizzato, distinguendo accettazione e ricezione; collaudo del sito corrente desktop/mobile e del rinnovo manuale, confronto di tutte le licenze prima/dopo. Non è stata eseguita una prova SMTP reale, una pubblicazione, una migrazione o alcuna modifica ai dati produttivi. Non considerare attiva questa integrazione sulla base dei soli test simulati.
