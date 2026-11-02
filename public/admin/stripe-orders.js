// Read-only order status inside the existing administrative dashboard.
(()=>{
  const section=document.createElement('section');
  const heading=document.createElement('h2');heading.textContent='Ordini e notifiche Stripe';
  const button=document.createElement('button');button.type='button';button.textContent='Aggiorna ordini';
  const status=document.createElement('p');status.setAttribute('role','status');
  const list=document.createElement('div');
  section.append(heading,button,status,list);document.body.append(section);
  button.addEventListener('click',async()=>{
    const key=sessionStorage.getItem('bandovera_admin_api_key');
    if(!key){status.textContent='Accedi prima alla dashboard amministrativa.';return;}
    button.disabled=true;status.textContent='Caricamento…';
    try{
      const response=await fetch('/api/admin/stripe/orders',{headers:{authorization:'Bearer '+key},cache:'no-store'});
      if(response.status===503){status.textContent='Ordini live non ancora abilitati.';return;}
      if(!response.ok)throw Error('Impossibile leggere gli ordini. Verifica l’accesso amministrativo.');
      const data=await response.json();list.replaceChildren();
      const labels={accepted:'accettata dal server di posta',uncertain:'esito incerto: verifica manuale',failed:'invio non riuscito',not_started:'da inviare',sending:'invio in corso'};
      for(const order of data.orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){
        const row=document.createElement('p');
        row.textContent=order.organization+' · '+order.email+' · '+order.id+' · '+order.status+
          ' · '+(order.license||'licenza non ancora attiva')+' · Scadenza: '+(order.expiresAt||'—')+
          ' · Email cliente: '+(labels[order.customerEmail]||order.customerEmail)+
          ' · Email info: '+(labels[order.adminEmail]||order.adminEmail);
        list.append(row);
      }
      status.textContent=data.orders.length+' ordini visualizzati (massimo '+data.limit+'). L’accettazione SMTP non conferma la consegna in casella.';
    }catch(e){status.textContent=e.message;}
    finally{button.disabled=false;}
  });
})();
