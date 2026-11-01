/* BANDOVERA: scheda di profilazione e pagamento sicuro tramite Stripe con attivazione automatica della licenza. */
(function () {
  'use strict';
  var C=window.BANDOVERA||{}, form=document.getElementById('scheda');
  if(!form)return;
  var KEY='bandovera.scheda2', testo='', errore=document.getElementById('errore');
  var riepilogo=document.getElementById('riepilogo'), dati=document.getElementById('dati');
  function raccogli(){var o={};new FormData(form).forEach(function(v,k){o[k]=String(v).trim();});return o;}
  function spunte(o,prefix){return Object.keys(o).filter(function(k){return k.indexOf(prefix)===0&&o[k];}).map(function(k){return o[k];});}
  function problema(o){
    if(!o.nome_associazione)return ['nome_associazione','Inserisci la denominazione dell’ente.'];
    if(!/^(?:\d{11}|[A-Z0-9]{16})$/i.test((o.cf||'').replace(/\s/g,'')))return ['cf','Inserisci il codice fiscale dell’ente: 11 cifre oppure 16 caratteri alfanumerici.'];
    if(o.partita_iva&&!/^\d{11}$/.test(o.partita_iva.replace(/\s/g,'')))return ['partita_iva','La partita IVA, se presente, deve contenere 11 cifre.'];
    if(!o.tipo_ente)return ['tipo_ente','Scegli il tipo di ente.'];
    if(!o.runts)return ['runts','Indica se l’ente è iscritto al RUNTS.'];
    if(!o.regione)return ['regione','Scegli la regione della sede dell’ente.'];
    if(!o.settore_principale)return ['settore_principale','Scegli il settore principale.'];
    if(!spunte(o,'area_').length&&!o.altre_aree)return ['altre_aree','Seleziona almeno un’area di attività oppure descrivila in “Altre aree”.'];
    if(!spunte(o,'att_').length&&!o.attivita_principali)return ['attivita_principali','Seleziona almeno un’attività oppure descrivi le attività principali.'];
    if(!spunte(o,'ben_').length&&!o.altri_beneficiari)return ['altri_beneficiari','Seleziona almeno una categoria di beneficiari oppure descrivila in “Altri beneficiari”.'];
    if(!o.finalita_statutarie)return ['finalita_statutarie','Riporta le finalità rilevanti dello statuto: servono per configurare la ricerca.'];
    if(!o.capacita_progetti)return ['capacita_progetti','Descrivi i progetti e le attività che l’ente può concretamente realizzare.'];
    if(!o.referente)return ['referente','Inserisci nome e cognome del referente.'];
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email_referente||''))return ['email_referente','Controlla l’indirizzo email del referente.'];
    if(!o.ack_completezza)return ['ack_completezza','Conferma di aver compilato la scheda in modo completo e veritiero.'];
    if(!/[a-zà-ù]{2}/i.test(o.luogo_data||'')||!o.luogo_data.match(/\d{1,2}\/\d{1,2}\/\d{4}/))return ['luogo_data','Inserisci luogo e data, per esempio “Monza, 29/10/2026”.'];
    if(!o.compilatore)return ['compilatore','Inserisci il nome di chi compila.'];
    if(!o.privacy)return ['privacy','Conferma di aver letto l’informativa privacy.'];
    return null;
  }
  function righe(o){return [
    ['Ente',o.nome_associazione],['Tipo ente',o.tipo_ente],['RUNTS',o.runts],['Codice fiscale',o.cf],['Partita IVA',o.partita_iva],
    ['Regione',o.regione],['Provincia',o.provincia],['Territorio operativo',o.territorio_operativo],['Sito web',o.sito_web],
    ['Settore principale',o.settore_principale],['Sottosettori',o.sottosettori],['Aree di attività',spunte(o,'area_').concat(o.altre_aree||[]).join('; ')],
    ['Attività svolte',spunte(o,'att_').join('; ')],['Attività principali',o.attivita_principali],['Beneficiari',spunte(o,'ben_').concat(o.altri_beneficiari||[]).join('; ')],
    ['Finalità statutarie',o.finalita_statutarie],['Capacità / progetti realizzabili',o.capacita_progetti],['Parole chiave prioritarie',o.parole_chiave],
    ['Opportunità di maggiore interesse',o.progetti_interesse],['Referente',o.referente],['Email',o.email_referente],['Telefono',o.telefono],
    ['Conferma completezza',o.ack_completezza],['Luogo e data',o.luogo_data],['Compilatore',o.compilatore],['Presa visione privacy',o.privacy]
  ];}
  try {
    var bozza=JSON.parse(localStorage.getItem(KEY)||'null');
    if(bozza)Array.from(form.elements).forEach(function(el){
      if(!el.name||bozza[el.name]===undefined)return;
      if(el.type==='checkbox'||el.type==='radio')el.checked=[].concat(bozza[el.name]).indexOf(el.value)!==-1;
      else el.value=String(bozza[el.name]);
    });
  }catch(e){}
  form.addEventListener('submit',function(e){
    e.preventDefault();
    form.querySelectorAll('[aria-invalid]').forEach(function(el){el.removeAttribute('aria-invalid');});
    var o=raccogli(), p=problema(o);
    if(p){
      errore.textContent=p[1];errore.classList.add('on');
      var el=document.getElementById(p[0]);
      if(el){el.setAttribute('aria-invalid','true');var group=el.closest('fieldset');(group||el).insertAdjacentElement('beforeend',errore);el.scrollIntoView({block:'center'});if(el.focus)el.focus({preventScroll:true});}
      return;
    }
    errore.classList.remove('on');o.cf=o.cf.replace(/\s/g,'').toUpperCase();
    o.partita_iva=(o.partita_iva||'').replace(/\s/g,'');
    try{localStorage.setItem(KEY,JSON.stringify(o));}catch(e2){}
    var records=righe(o);dati.replaceChildren();
    records.forEach(function(r){var dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=r[0];dd.textContent=r[1]||'Non indicato';dati.append(dt,dd);});
    testo='SCHEDA DI PROFILAZIONE BANDOVERA\n\n'+records.map(function(r){return r[0]+': '+(r[1]||'Non indicato');}).join('\n')+'\n\nRichiesta di abbonamento: 19,90 € per 12 mesi, pagamento sicuro tramite Stripe, senza rinnovo automatico. Attivazione automatica della licenza dopo la conferma del pagamento.\n';
    document.getElementById('invia-messenger').href=C.MESSENGER_URL||'https://m.me/61595039832085';
    document.getElementById('invia-email').href='mailto:'+(C.EMAIL||'info@bandovera.it')+'?subject='+encodeURIComponent('BANDOVERA - scheda di profilazione - '+o.nome_associazione)+'&body='+encodeURIComponent('Buongiorno, allego la scheda di profilazione del mio ente e per completare la registrazione alla piattaforma Bandovera.\n\nPrima di inviare, allego il file .txt scaricato dal sito.');
    form.hidden=true;riepilogo.hidden=false;riepilogo.scrollIntoView({block:'start'});document.getElementById('h-riep').focus({preventScroll:true});
  });
  document.getElementById('copia').addEventListener('click',function(){var button=this;
    function fallback(){var area=document.createElement('textarea');area.value=testo;area.setAttribute('readonly','');area.style.cssText='position:fixed;opacity:0';document.body.appendChild(area);area.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}area.remove();button.textContent=ok?'Scheda copiata ✓':'Copia non riuscita: usa “Scarica la scheda”';}
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(testo).then(function(){button.textContent='Scheda copiata ✓';},fallback);else fallback();
  });
  document.getElementById('scarica-scheda').addEventListener('click',function(){
    var url=URL.createObjectURL(new Blob(['\ufeff'+testo],{type:'text/plain;charset=utf-8'})), link=document.createElement('a');link.href=url;link.download='BANDOVERA_Scheda_Profilazione.txt';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
  });
  document.getElementById('modifica').addEventListener('click',function(e){e.preventDefault();riepilogo.hidden=true;form.hidden=false;form.scrollIntoView({block:'start'});});
})();

