/**
 * Pure licence fulfilment preparation for Bandovera TEST only.
 * Does not write KV, issue links, email customers or change existing licences.
 */
export function expiryAfterMonths(activatedAt, months=12) {
  if(!Number.isInteger(months)||months!==12)throw Error("Durata licenza non valida");
  const start=new Date(activatedAt);
  if(!Number.isFinite(start.getTime()))throw Error("Data attivazione non valida");
  // UTC calendar date; clamp e.g. Feb 29 -> Feb 28 in a non-leap year.
  const year=start.getUTCFullYear()+1,month=start.getUTCMonth();
  const finalDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();
  return new Date(Date.UTC(year,month,Math.min(start.getUTCDate(),finalDay))).toISOString().slice(0,10);
}
export function buildSandboxLicence({order,paid,code,now}) {
  if(!order||order.mode!=="test"||!paid||paid.fulfillment!=="not_started")throw Error("Ordine non idoneo");
  if(order.id!==paid.orderId||order.stripeSessionId!==paid.sessionId||paid.amount!==1990||paid.currency!=="eur")throw Error("Pagamento discordante");
  if(!/^RB-\d{4,}$/.test(String(code)))throw Error("Codice licenza non valido");
  if(!String(order.organization||"").trim()||!String(order.email||"").includes("@"))throw Error("Dati cliente mancanti");
  const createdAt=new Date(now).toISOString();
  return {
    license:code,name:order.organization,active:true,expiresAt:expiryAfterMonths(now),price:19.9,
    profile:{name:order.organization,type:order.entityType,region:order.region,license:code,active:true,createdAt,expiresAt:expiryAfterMonths(now),durationMonths:12,price:19.9},
    payment:{provider:"stripe",mode:"test",orderId:order.id,sessionId:paid.sessionId,amount:paid.amount,currency:paid.currency},
    createdAt,updatedAt:createdAt
  };
}
