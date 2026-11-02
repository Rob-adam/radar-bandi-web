/**
 * Stripe sandbox order coordinator. One Durable Object instance per order ID.
 * Records a verified paid session exactly once; repeated events do not create
 * another order. This DOES NOT issue a licence or send email.
 */
export class StripeOrderLedger {
  constructor(state) { this.state=state; }
  async fetch(request) {
    if(request.method!=="POST")return new Response("Method not allowed",{status:405});
    let p;try{p=await request.json()}catch{return Response.json({error:"invalid_json"},{status:400})}
    if(!p||!(/^[a-zA-Z0-9_-]{8,100}$/).test(String(p.orderId))||!String(p.sessionId).startsWith("cs_test_")||!String(p.eventId).startsWith("evt_")||p.amount!==1990||p.currency!=="eur")
      return Response.json({error:"invalid_order"},{status:400});
    // Cloudflare serializes individual DO requests using storage input/output gates.
    // A single storage transaction prevents a second event from changing ownership.
    const outcome=await this.state.storage.transaction(async tx=>{
      const previous=await tx.get("paid");
      if(previous){
        if(previous.sessionId!==p.sessionId||previous.orderId!==p.orderId)return {status:"conflict"};
        return {status:"duplicate",orderId:previous.orderId};
      }
      await tx.put("paid",{orderId:p.orderId,sessionId:p.sessionId,eventId:p.eventId,amount:p.amount,currency:p.currency,paidAt:new Date().toISOString(),fulfillment:"not_started"});
      return {status:"recorded",orderId:p.orderId};
    });
    return Response.json(outcome,{status:outcome.status==="conflict"?409:200});
  }
}
