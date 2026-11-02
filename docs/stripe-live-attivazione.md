# Attivazione Stripe live — 2 novembre 2026

## Stato verificato

Il titolare conferma il collaudo completo precedente in ambiente test e 114 verifiche riuscite. Questo ramo parte dal lavoro locale aggiornato `693c46b`, integrato con main `4ed5619`, e conserva gli aggiornamenti pubblicati della dashboard e del catalogo. Il vecchio ramo remoto della PR #39 non conteneva tutti i commit locali successivi.

Verificati direttamente nella dashboard Stripe, account `acct_1UWFHRDY6SOGDjJ1`, modalità live:

- Prodotto attivo `prod_VXMAHDcRJ5nyXa`: Licenza Bandovera - 12 mesi.
- Prezzo `price_1UWHRjDY6SOGDjJ1Exlw0SHk`: EUR 19,90, una tantum, senza ricorrenza.

Nel Worker di produzione sono presenti i segreti SMTP già utilizzati e TURNSTILE_SECRET, ma non risultano configurati i due segreti Stripe live né il nuovo coordinatore. I valori cifrati non sono stati letti. Il sito pubblico `attiva.html` mostra ancora il percorso manuale via bonifico; form `scheda`, riepilogo e nomi dei campi sono compatibili con l'adattatore aggiunto.

## Comportamento implementato, ancora disabilitato

La scheda completa viene validata e conservata nell'ordine. Checkout usa il prezzo live esistente, importo fisso, pagamento unico. Un riferimento stabile e la chiave di idempotenza Stripe evitano nuove sessioni per i tentativi ripetuti dello stesso ordine. Modificare la scheda usando lo stesso riferimento genera un conflitto.

Solo un webhook firmato di tipo `checkout.session.completed` o `checkout.session.async_payment_succeeded`, seguito da una verifica indipendente della sessione tramite API Stripe, può attivare una licenza. Verifica modalità live, incasso `paid`, EUR 1990 centesimi e corrispondenza dei riferimenti dell'ordine. Il redirect di successo non attiva nulla.

Un unico Durable Object SQLite di produzione riserva codici, conserva accesso privato e scadenza, scrive la nuova licenza nella KV LICENSES esistente. Il profilo completo resta disponibile nella dashboard amministrativa esistente. Nessuna riscrittura delle licenze precedenti, RB-0003 compresa. Una notifica ripetuta non modifica scadenze, profili o sospensioni amministrative. Una licenza eliminata dopo l'attivazione non viene ricreata automaticamente.

Due invii SMTP indipendenti: credenziali/link personale all'email della scheda, notifica a info@bandovera.it. I tentativi con esito definitivamente fallito vengono recuperati via alarm, massimo tre; quelli con accettazione incerta richiedono verifica manuale e non vengono reinviati automaticamente. Nessuna promessa di invio SMTP "esattamente una volta": un'interruzione dopo DATA può lasciare un esito incerto. Stato ordini consultabile dalla dashboard amministrativa esistente, senza esporre credenziali nella lista degli ordini. Accettazione SMTP e consegna in casella sono distinte.

## Configurazione privata necessaria

Il titolare crea e inserisce personalmente la chiave limitata Stripe live nel pannello riservato. Non inserirla in chat, file sorgenti, GitHub, URL o log. Concedere solo le operazioni necessarie: lettura prezzi, creazione e lettura Checkout Sessions; verificare gli eventuali permessi collegati richiesti da Stripe. Il codice supporta chiavi limitate `rk_live_` oltre alle chiavi segrete `sk_live_`.

Nel Worker esistente `radar-bandi-online` usare variabili di tipo **Secret**, non variabili in chiaro:

- `STRIPE_LIVE_SECRET_KEY`: chiave limitata live.
- `STRIPE_LIVE_WEBHOOK_SECRET`: segreto della destinazione live Stripe.

Destinazione webhook live:

`https://radar-bandi-online.presidente-56d.workers.dev/api/stripe/live/webhook`

Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`. Non riutilizzare destinazione, firma, chiave o archivi test.

## Ordine di rilascio

1. Far revisionare questo ramo e verificare che main non abbia ulteriori aggiornamenti da conservare. La fusione in main avvia il deploy di produzione: richiede autorizzazione del titolare.
2. Primo deploy del Worker con `LIVE_CHECKOUT_ENABLED=false` e `LIVE_FULFILLMENT_ENABLED=false`. La migrazione `stripe-live-v1` crea il nuovo coordinatore SQLite; non riscrive LICENSES. Usare `wrangler deploy`, non `versions upload`, per installare la prima migrazione.
3. Configurare privatamente i due segreti live. Conservare tutti i segreti SMTP, amministrativi, bonifico e Turnstile già esistenti. Non sostituirli con dati test.
4. Abilitare `LIVE_FULFILLMENT_ENABLED=true` mantenendo il checkout disabilitato; verificare la destinazione Stripe. Un evento estraneo o simulato non costituisce prova di acquisto reale.
5. Su `/var/www/bandovera` salvare backup dei soli file da modificare. Aggiungere l'adattatore `integration/site/stripe-checkout-existing-sheet-live.js`, la configurazione pubblica e il caricamento Turnstile dopo gli script esistenti. Non sostituire l'intero sito. Configurazione pubblica: `window.BANDOVERA_STRIPE_LIVE={enabled:true,sitekey:'CHIAVE_PUBBLICA_VERIFICATA'}`. Caricare `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`. Verificare che il widget autorizzi bandovera.it e www.bandovera.it; azione prevista `bandovera_checkout`.
6. Adeguare sul sito i testi del percorso bonifico/manuale al nuovo percorso scheda → Stripe → licenza via email e le informazioni sul trattamento dati applicabili. Conservare logo, video, licenze, contenuti e stili attuali. Controllare anche i rimandi dalla homepage. Non modificare Facebook.
7. Abilitare `LIVE_CHECKOUT_ENABLED=true` solo quando tutte le configurazioni sono pronte. I due flag sono controllati anche dal server; un pulsante visibile non basta.
8. Il titolare effettua personalmente l'acquisto reale concordato da EUR 19,90; non usare carte di test in modalità live. Verificare pagamento Stripe, ordine, singola licenza per 12 mesi nella dashboard, accesso personale, email cliente, notifica info@, assenza di duplicati. Verificare RB-0003 invariata senza esporne credenziali. Gestione dell'eventuale rimborso solo con istruzione esplicita.

Se si deve interrompere il rilascio, disabilitare **solo il checkout** e conservare l'elaborazione dei pagamenti già iniziati. Non tornare a codice che ignora i webhook già incassati. Sito: ripristino dei soli file del backup interessato. Non cancellare ordini o licenze pagate.

## Verifiche eseguite su questo lavoro

- 131 test Node superati, zero errori: inclusi 16 nuovi casi sul coordinatore live (Stripe e SMTP simulati).
- Bundle completo compilato con esbuild. Il dry-run diretto di Wrangler sul PC incontra un limite di accesso alle directory; verificata separatamente la compilazione e l'esecuzione del bundle.
- Workerd reale con Durable Object SQLite e KV locali: ordine, doppio webhook concorrente, una licenza, due notifiche distinte, fixture RB-0003 invariata. Stripe/SMTP simulati, nessun addebito o email reale.
- Bundle completo di produzione avviato in workerd: tutte e tre le rotte live restituiscono 503 con i flag disabilitati.
- Nessuna configurazione Stripe o Cloudflare di produzione modificata, nessun acquisto reale eseguito in questa sessione. Il collaudo live resta da eseguire.

L'accesso SSH dalla sessione di lavoro resta negato da Windows ai file della chiave e known_hosts, anche dopo il permesso di lettura concesso allo strumento. Non sono state copiate chiavi o modificate autorizzazioni dei file. Per il rilascio dei file del sito servirà l'accesso operativo consentito dal PC oppure l'esecuzione del comando finale da parte del titolare nella sua PowerShell.
