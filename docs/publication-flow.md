# Pubblicazione delle nuove opportunità

Il crawler raccoglie segnalazioni e il triage determina quali dati mancano.
Il download di una pagina e la classificazione dei destinatari non costituiscono
una verifica completa del bando e non devono impostare flag di verifica ufficiale.

Il passaggio mancava: nessun processo leggeva un esito documentato di revisione
e lo trasferiva al catalogo effettivamente servito ai clienti. Inoltre le schede
già risolte dalle regole potevano saltare l'approfondimento perché non erano
più presenti nella coda denominata AI.

Ora:

1. `enrich_bandi.py` approfondisce anche i candidati ETS risolti dalle regole
   ma ancora privi di verifica della fonte.
2. Le revisioni completate sono registrate in `data/radar_bandi_reviews.json`:
   decisione, data, campi controllati, fonti e regolamenti effettivamente letti,
   scheda con requisiti e ruolo dell'ente. Non è consentito attestare da qui
   i requisiti del singolo cliente.
3. `publish_reviewed_bandi.py` valida tutte le revisioni prima di scrivere,
   aggiorna senza duplicati il catalogo extra e chiude i corrispondenti elementi
   della coda. Una revisione ritirata rimuove la propria scheda pubblicata.
4. Il passaggio è eseguito sia dall'aggiornamento programmato sia dal deploy.
   Le nuove prove entrano nel controllo automatico delle fonti già esistente.
5. `public/radar_bandi_publication.json` distingue revisioni pubblicate da
   segnalazioni ancora da rivedere. Un totale fermo non dimostra più una revisione
   completa: molte segnalazioni possono essere navigazione, scadute o non ETS.

La revisione documentale resta un'attività da completare: questo script non
esegue un modello AI e non trasforma tutta la coda in bandi verificati. Il nome
storico della coda AI non implica che un servizio di analisi sia configurato.

Prima applicazione (25/10/2026): servizio civile regionale Veneto, DGR 1147/2026,
e Borse lavoro Caript 5/2026. Per il primo l'iscrizione SCU è necessaria per il
promotore, distinta dalla cooperazione. Per il secondo la domanda è del
lavoratore residente a Pistoia e l'ETS è partner datore di lavoro, con sede
legale oppure operativa in provincia. Nessuna di queste verifiche prova i
requisiti di RESPIRIAMO INSIEME.
