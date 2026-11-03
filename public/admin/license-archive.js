(()=>{
  async function change(license,restore=false){
    const key=sessionStorage.getItem('bandovera_admin_api_key');
    if(!key)throw Error('Accedi prima alla dashboard amministrativa.');
    const response=await fetch('/api/admin/license/'+(restore?'restore':'archive'),{
      method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({license})
    });
    const data=await response.json();
    if(!response.ok||!data.ok||data.license!==license||data.archived!==!restore)throw Error(data.error||'Operazione non confermata dal server.');
  }
  function buttons(){
    for(const row of document.querySelectorAll('#rows tr')){
      if(row.querySelector('[data-archive-license]')||row.cells.length!==4)continue;
      const license=row.cells[1].querySelector('.small')?.textContent?.trim();
      if(!/^RB-\d{4,}$/.test(license||''))continue;
      const button=document.createElement('button');button.className='btn danger small';
      button.textContent='Elimina';button.dataset.archiveLicense=license;
      button.onclick=async()=>{
        if(!confirm('Eliminare '+license+' dall’elenco e disattivare il suo accesso? Potrai recuperarla da «Licenze eliminate».'))return;
        button.disabled=true;
        try{await change(license);location.reload();}
        catch(error){alert('Eliminazione non eseguita: '+error.message);button.disabled=false;}
      };
      row.cells[3].append(' ',button);
    }
  }
  const rows=document.getElementById('rows');
  if(!rows)return;
  new MutationObserver(buttons).observe(rows,{childList:true,subtree:true});buttons();
  const section=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('div');
  section.className='note';summary.textContent='Licenze eliminate';section.append(summary,list);rows.closest('section').append(section);
  section.addEventListener('toggle',async()=>{
    if(!section.open)return;
    list.textContent='Caricamento…';
    try{
      const key=sessionStorage.getItem('bandovera_admin_api_key');if(!key)throw Error('Accedi prima alla dashboard.');
      const response=await fetch('/api/admin/licenses?archived=1',{headers:{authorization:'Bearer '+key},cache:'no-store'});
      const data=await response.json();if(!response.ok||!Array.isArray(data.clients))throw Error('Impossibile leggere le licenze eliminate.');
      list.replaceChildren();if(!data.clients.length)list.textContent='Nessuna licenza eliminata.';
      for(const c of data.clients){
        const row=document.createElement('p'),button=document.createElement('button');
        row.textContent=c.license+' · '+c.name+' ';button.className='btn small';button.textContent='Ripristina';row.append(button);list.append(row);
        button.onclick=async()=>{button.disabled=true;try{await change(c.license,true);location.reload();}catch(e){alert(e.message);button.disabled=false;}};
      }
    }catch(e){list.textContent=e.message;}
  });
})();
