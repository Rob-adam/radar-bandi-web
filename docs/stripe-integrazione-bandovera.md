# Integrazione Stripe — Bandovera (solo sandbox)

Stato: piano tecnico, nessuna funzionalità pubblicata. Data: 30 ottobre 2026.

## Architettura verificata
- Worker Cloudflare: `src/dashboard-wrapper.js` -> `src/territory-wrapper.js` -> `src/index.js`.
- Registro licenze: binding KV `LICENSES`, chiavi `license:RB-XXXX`, rotte amministrative `/api/admin/licenses` e `/api/admin/license`.
- Dashboard: `public/admin/index.html`.
- Contatti dei clienti già licenziati: `src/contact-mailer.js`, rotta `/api/contact`. **Non** è la rotta per le richieste commerciali di nuove licenze.
- Repository `Rob-adam/radar-bandi-web`: il `index.html` in radice è un vecchio segnaposto; la pagina reale è in `public/index.html`.
- Stripe in ChatGPT: collegata **solo sandbox**, prodotto live creato manualmente nella dashboard Stripe; non usare `price_` live durante i test.

## Flusso da implementare dopo aver individuato la sorgente delle richieste su bandovera.it
1. Scheda richiesta nuovi clienti -> validazione lato server (consensi/privacy, ente, email) -> nuovo record `request:<id>` con stato `in_attesa_pagamento`, senza attivare licenza.
2. Server crea sessione Stripe Checkout (`mode=payment`, prezzo EUR 19,90, valuta EUR) da un price ID sandbox configurato come segreto/variabile; non accettare prezzi dal browser; associare identificativo richiesta nei metadata e client_reference_id.
3. Cliente paga nella pagina Stripe; il ritorno a `success_url` NON attiva la licenza.
4. Endpoint dedicato `POST /api/stripe/webhook`: verificare la firma con l'header Stripe-Signature usando il corpo RAW e il segreto del webhook nell'ambiente sandbox. Gestire `checkout.session.completed` **solo se** `payment_status=paid`, e `checkout.session.async_payment_succeeded` per metodi asincroni. Eventuali eventi di fallimento lasciano la richiesta non attiva.
5. Prima di attivare, verificare ID sessione, importo (1990 centesimi), valuta EUR, ambiente di test, metadata/request_id e assenza di attivazione preesistente. Gestire ripetizioni/concorrenza con un registro transazionale (Cloudflare D1 o Durable Object); KV da solo non garantisce attivazione esattamente una volta.
6. Solo dopo validazione del pagamento, creare licenza RB nuova nella gestione centrale, calcolare scadenza a 12 mesi dall'attivazione, generare URL privato e inviare email; in caso di invio email fallito, prevedere retry senza duplicare licenza.
7. La dashboard admin esistente mostra richiesta, pagamento, licenza e stato della consegna; preservare il flusso manuale per bonifico.

## Requisiti di sicurezza e collaudo
- Chiavi Stripe e segreto webhook **mai** in GitHub, HTML, chat o frontend: usare secret Cloudflare; separare test/live.
- Non modificare, sospendere o duplicare la licenza RB-0003 o altre licenze esistenti.
- Test: pagamento riuscito, rifiutato, annullato, asincrono; webhook ripetuto e fuori ordine; importo alterato; email fallita; scadenza; rinnovo acquistato manualmente; rollback.
- Testare su Worker/namespace isolati con dati fittizi prima di portare modifiche in produzione. Non creare webhook sulla sandbox finché la URL effettiva del Worker di test non è definita.
- Verificare in seguito il regime fiscale forfettario e la fatturazione; le ricevute Stripe non sostituiscono le fatture eventualmente dovute.

## Blocco attuale
Individuare la fonte effettiva di **scheda PDF -> richiesta -> dashboard** su `bandovera.it`. Le rotte licenze pubblicate in questo repository non dimostrano ancora che le richieste del sito e la relativa dashboard abbiano già un sistema unificato. Nessuna integrazione Stripe deve essere pubblicata finché tale percorso non è verificato.
