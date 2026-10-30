/* Requests are part of the existing admin screen, not a separate dashboard. */
(()=>{
 'use strict';
 const root=document.createElement('section');root.className='card';root.style.marginTop='24px';
 const title=document.createElement('h2');title.textContent='Richieste dal sito · bonifico e attivazione';root.append(title);
 const status=document.createElement('p');status.setAttribute('role','status');root.append(status);
 const refresh=document.createElement('button');refresh.className='btn';refresh.textContent='Aggiorna richieste';root.append(refresh);
 const rows=document.createElement('div');root.append(rows);document.querySelector('body > .wrap').append(root);
 const states={not_sent:'Non inviata',sending:'Esito da verificare',uncertain:'Esito incerto: verificare',failed:'Invio non riuscito',accepted:'Accettata dal server SMTP, consegna non confermata',delivered:'Ricezione confermata dal destinatario'};
 async function api(path,body){const key=sessionStorage.getItem('bandovera_admin_api_key');if(!key)throw Error('Accedi con la chiave amministratore nella dashboard.');const r=await fetch('/api/admin/requests'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'Operazione non completata');return d;}
 function text(parent,tag,value){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
 function button(parent,label,action){const b=text(parent,'button',label);b.type='button';b.className='btn';b.style.margin='6px';b.onclick=async()=>{b.disabled=true;try{await action();await load();}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};return b;}
 async function load(){
  refresh.disabled=true;status.textContent='Caricamento…';
  try{const d=await api('');rows.replaceChildren();status.textContent=d.requests.length+' richieste. Le richieste in attesa non sono licenze attive.';
   for(const m of d.manualWrites||[]){const card=document.createElement('article');rows.append(card);text(card,'p','Scrittura manuale da recuperare: '+m.license+' · '+m.name);button(card,'Recupera la stessa licenza',()=>api('/manual-sync',{license:m.license}));}
   for(const r of d.requests){const card=document.createElement('article');card.className='card';card.style.marginTop='16px';rows.append(card);
    text(card,'h3',r.sheet.nome_associazione+' · '+r.status);text(card,'p',r.id+' · '+(r.license||'Nessuna licenza'));
    const details=document.createElement('details');text(details,'summary','Leggi la scheda completa e la mappatura');const pre=text(details,'pre',JSON.stringify({scheda:r.sheet,profilo:r.profile},null,2));pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';card.append(details);
    for(const [kind,mail] of [['bonifico',r.bonificoEmail],['access',r.accessEmail]]){
     text(card,'p',(kind==='bonifico'?'Email bonifico: ':'Email accesso: ')+(states[mail.state]||mail.state));
     if(['not_sent','failed'].includes(mail.state)&&(kind==='bonifico'||r.status==='active'))button(card,'Invia email '+kind,()=>api('/'+r.id+'/email',{revision:r.revision,kind}));
     if(['accepted','uncertain'].includes(mail.state))button(card,'Conferma ricezione '+kind,async()=>{if(!confirm('Il destinatario ha confermato di aver ricevuto questa email?'))return;await api('/'+r.id+'/delivery',{revision:r.revision,kind,confirmedReceived:true});});
    }
    if(r.status==='activating')button(card,'Recupera la stessa attivazione',()=>api('/'+r.id+'/recover',{}));
    if(r.status==='pending'){
     const review=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.style.width='auto';review.append(check,document.createTextNode(' Ho verificato scheda completa e mappatura; nessun requisito non dichiarato è stato aggiunto.'));card.append(review);
     const label=text(card,'label','Riferimento della verifica dell’accredito (non allegare contabili o credenziali)');const ref=document.createElement('input');ref.maxLength=300;label.append(ref);
     button(card,'Conferma accredito 19,90 € e attiva per 12 mesi',async()=>{
      if(!check.checked||!ref.value.trim())throw Error('Verifica la scheda e inserisci il riferimento dell’accredito.');
      if(!confirm('Confermi l’effettivo accredito sul conto di 19,90 € per '+r.sheet.nome_associazione+'? Una ricevuta del cliente non basta.'))return;
      await api('/'+r.id+'/activate',{revision:r.revision,confirmedCredit:true,amountCents:1990,profileReviewed:true,paymentReference:ref.value.trim()});
      // Use the existing client list; no automatic local-to-cloud license creation.
      sessionStorage.removeItem('bandovera_cloud_clients_loaded_v1');
     });
    }
   }
  }catch(e){status.textContent=e.message;}finally{refresh.disabled=false;}
 }
 refresh.onclick=load;load();
})();
