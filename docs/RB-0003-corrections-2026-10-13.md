# RB-0003 — correzioni del 13 ottobre 2026

Questa versione applica i rilievi verificabili del rapporto ricevuto e mantiene distinti requisito negativo, dato mancante e affinità tematica.

## Cambiamenti

- Requisiti tipizzati per POP, entrate, sedi, personalità giuridica, immobile ed esperienza specifica. POP escluso con anno 2014; dati mancanti non comportano esclusione automatica.
- Profilo RB-0003 integrato con fondazione 2014 e sedi pubblicate dall'associazione. La data di apertura delle sedi, entrate e completezza dell'inventario restano da verificare. I campi del questionario sono conservati.
- Rimosse soglie 68/78/88 e funzione di innalzamento ETS. Affinità ricostruibile da quattro componenti e pesi dichiarati. Confronto dei concetti a parola intera; copertura dei temi del bando.
- Catalogo nazionale mostrato per monitoraggio, senza affermare che operatività nazionale soddisfi una sede locale.
- Ordinamento esplicito per assenza di esclusione, coerenza tematica, affinità e scadenza. Esclusi assenti dalla lista delle marginali.
- Ora italiana delle scadenze rispettata anche nel browser. Importo zero distinto da dato sconosciuto.
- Voucher Volontariato 5.000 €, limite entrate 50.000 €, dettagli cofinanziamento, Note di comunità 250.000–400.000 €, sportello CER, prestito/interessi e finestra Oxfam integrati.
- Aggiunti Sportello della solidarietà Terzo Pilastro e Fondo di Beneficenza Intesa. La scheda segnala la verifica ancora necessaria di moduli, linee guida e singolo progetto.
- Profilo della pagina cliente ricostruito dal record server, anziché accettare modifiche arbitrarie nel parametro p. Licenze sospese/scadute bloccate prima di servire la dashboard.
- Rimossi invii via FormSubmit. Assistenza prepara una mail nel programma dell'utente a Roberto Adamo, presidente@unrespirodisperanzalombardia.com. L'utente deve premere Invia nella mail. L'interfaccia non dichiara l'invio come avvenuto.

## Fonti consultate

- https://respiriamoinsieme.org/chi-siamo/
- https://www.fondazioneunipolis.org/site/wp-content/uploads/2026/09/Regolamento-Bando-POP-2026.pdf
- Allegato A DDS 4806/2026, disponibile nella scheda ufficiale Volontariato e Territorio Regione Lombardia.
- Schede ufficiali Regione Lombardia per Triennio 2026–2028, Rinnova Veicoli ed Educazione ambientale.
- https://fondazionecrc.it/cosafacciamo/bando-attrazione-risorse-misura-progettazione/
- https://www.oxfamitalia.org/copower/
- https://bandi8x1000.unionebuddhistaitaliana.it/vb/?bid=89
- https://fondazionecariparo.it/richieste-libere/ e DPA 2026.
- Regolamenti Cariparo CER 2.0 e Imprenditoria sociale 2.1.
- https://www.conibambini.org/wp-content/uploads/2026/06/Bando-Note-di-comunita.pdf
- https://www.fondazioneterzopilastrointernazionale.it/solidarieta/
- https://group.intesasanpaolo.com/it/sociale/fondo-di-beneficenza/come-richiedere-un-contributo

## Collaudo

`node --test tests/*.test.mjs`: 16 test passati. Controllati anno POP ed estremi, soglia entrate inclusiva, requisiti ignoti/negativi, sedi e operatività, falsi match per sottostringhe, formula dell'affinità, ora di scadenza, preparazione mail, profilo manomesso, sospensione server, catena Worker, preferiti e origine della richiesta. Il workflow di pubblicazione esegue entrambe le suite.

## Limiti ancora aperti

- Non è un collaudo di tutte le opportunità possibili in Italia né una certificazione di ammissibilità della cliente.
- RB-0003 richiede una chiave casuale di 256 bit nel link privato. Preferiti e pagina sono protetti nel Worker: conoscere il solo codice licenza non autorizza lettura o modifica. Il vecchio link senza chiave non consente il nuovo accesso. La consegna avviene cifrata con chiave pubblica; nessuna chiave di accesso è pubblicata nel repository o nei log. Non è un login personale: chi riceve il link completo può usarlo. Le licenze precedenti non migrate conservano il flusso esistente; le nuove licenze create dall’admin ottengono un link casuale.
- L'assistenza utilizza la casella esistente di Roberto, ora esplicitata, e una mail da inviare manualmente. Per invio integrato e casella dedicata serve una destinazione/servizio confermato.
- Entrate, documenti e requisiti specifici non presenti sono mostrati come da verificare. Nessun bilancio o esperienza è stato inventato.
- Questa versione deve essere verificata sul deployment effettivo prima di dichiarare conclusa la pubblicazione.
