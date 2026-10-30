# Cloudflare Stripe: collaudo isolato, NON distribuito

Usare soltanto wrangler.stripe-test.jsonc. Non modificare wrangler.jsonc, radar-bandi-online o le route pubbliche.

## Preflight obbligatorio
- Controllare nel pannello che i KV di test e16f2bc4c0664357aafadb07c5594e9b e cdc6ef0dcd3940e99ce214a739a4948f siano realmente presenti e riservati ai test. Il KV di produzione LICENSES è 352020f5c8294218ac658bfb3e96161c. Se non sono verificabili, fermarsi.
- Verificare il sottodominio workers.dev, classe Durable Object e piano Cloudflare senza attivare servizi a pagamento.
- Configurare SOLO nel Worker test le credenziali Stripe test, webhook, destinatario email autorizzato e, se necessario, credenziali SMTP. Mai inserire segreti in GitHub o chat.
- Definire STRIPE_TEST_PRICE_ID come prezzo Stripe sandbox non recurring di 19,90 EUR e verificare la disponibilità di tutte le variabili.
- Installare la scheda esistente su una copia di prova e integrarvi lo script integration/site/stripe-checkout-existing-sheet-test.js. Non usare il modulo ridotto public/acquista.html.
- Soltanto dopo il preflight e autorizzazione, deploy manuale: npx wrangler deploy --config wrangler.stripe-test.jsonc.
- Abilitare TEST_CHECKOUT_ENABLED soltanto per il collaudo end-to-end. Testare webhook firmati, idempotenza licenze, invio email e mancato pagamento. Disattivare a fine collaudo.

Stato: file di configurazione preparato nella PR #39. Nessun accesso amministrativo Cloudflare da questa chat; impossibile certificare che i namespace esistano o che la distribuzione sia riuscita. RB-0003 e produzione non modificati.