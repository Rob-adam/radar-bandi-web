// Preserve the complete submitted sheet. Never infer eligibility from category labels.
export class IntakeError extends Error { constructor(message,status=400){super(message);this.status=status;} }
export const emailOK=v=>typeof v==='string'&&v.length<=254&&/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(v);
export function validateSheet(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).length>150)throw new IntakeError('Scheda non valida');
 const sheet=Object.create(null);
 for(const [key,value] of Object.entries(input)){
  if(!/^[a-z][a-z0-9_]{0,63}$/.test(key)||typeof value!=='string'||value.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw new IntakeError('Campo non valido');
  sheet[key]=value.trim();
 }
 const required=['nome_associazione','cf','tipo_ente','runts','regione','settore_principale','finalita_statutarie','capacita_progetti','referente','email_referente','ack_completezza','luogo_data','compilatore','privacy'];
 if(required.some(k=>!sheet[k]))throw new IntakeError('Completa i campi obbligatori');
 sheet.cf=sheet.cf.replace(/\s/g,'').toUpperCase();sheet.partita_iva=(sheet.partita_iva||'').replace(/\s/g,'');
 if(!/^(?:\d{11}|[A-Z0-9]{16})$/.test(sheet.cf)||sheet.partita_iva&&!/^\d{11}$/.test(sheet.partita_iva))throw new IntakeError('Codice fiscale o partita IVA non validi');
 if(!emailOK(sheet.email_referente))throw new IntakeError('Email non valida');
 if(sheet.privacy!=='Sì'||sheet.ack_completezza!=='Sì')throw new IntakeError('Conferme mancanti');
 for(const [prefix,other] of [['area_','altre_aree'],['att_','attivita_principali'],['ben_','altri_beneficiari']]){
  if(!Object.keys(sheet).some(k=>k.startsWith(prefix)&&sheet[k])&&!sheet[other])throw new IntakeError('Descrivi aree, attività e beneficiari');
 }
 return sheet;
}
export function mapSheet(s){
 const joined=(prefix,extra=[])=>[...Object.keys(s).filter(k=>k.startsWith(prefix)&&s[k]).map(k=>s[k]),...extra.map(k=>s[k]).filter(Boolean)].join('; ');
 // Combined site labels stay combined. ONLUS/Associazione are not classified as ETS.
 return {name:s.nome_associazione,type:s.tipo_ente,region:s.regione,province:s.provincia||'',runts:s.runts,
  operatingTerritory:s.territorio_operativo||'',territoryScope:'',legalPersonality:'Da verificare',
  sector:s.settore_principale,subSector:s.sottosettori||'',areas:joined('area_',['altre_aree']),activities:joined('att_',['attivita_principali']),
  beneficiaries:joined('ben_',['altri_beneficiari']),statutoryPurposes:s.finalita_statutarie,capabilities:s.capacita_progetti,projectTypes:s.progetti_interesse||'',
  taxCode:s.cf,vatNumber:s.partita_iva,contactName:s.referente,contactEmail:s.email_referente,contactPhone:s.telefono||'',website:s.sito_web||'',
  sourceSheet:s,profileNotes:s.parole_chiave||'',mappingNeedsReview:true};
}
