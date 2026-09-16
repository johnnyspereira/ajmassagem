"use strict";exports.id=9719,exports.ids=[9719],exports.modules={29719:(a,b,c)=>{c.r(b),c.d(b,{enqueueWhatsAppMessage:()=>f});var d=c(77598),e=c(9012);async function f(a){return(0,e.Rn)(async b=>{let[c]=await b.execute(`SELECT message_id,status FROM whatsapp_outbox
       WHERE account_id=? AND request_key=? LIMIT 1 FOR UPDATE`,[a.accountId,a.requestKey]);if(c[0])return{messageId:c[0].message_id,status:c[0].status,duplicate:!0};let[e]=await b.execute(`SELECT c.phone FROM conversations v
       JOIN contacts c ON c.id=v.contact_id
       WHERE v.id=? AND v.account_id=? LIMIT 1 FOR UPDATE`,[a.conversationId,a.accountId]);if(!e[0]?.phone)throw Error("Conversation phone not found.");let f=(0,d.randomUUID)(),g=(0,d.randomUUID)(),h=a.payload.contentType,i=a.payload.text||`[${h}]`;return await b.execute(`INSERT INTO messages(
        id,conversation_id,sender_type,sender_id,content_type,content_text,
        media_url,template_name,status,reply_to_message_id,interactive_payload
      ) VALUES(?,?,?,?,?,?,?,?, 'sending',?,?)`,[f,a.conversationId,a.payload.senderType??"agent",a.userId,h,a.payload.text||null,a.payload.mediaUrl||null,a.payload.templateName||null,a.payload.replyToMessageId||null,a.payload.interactivePayload?JSON.stringify(a.payload.interactivePayload):null]),await b.execute(`INSERT INTO whatsapp_outbox(
        id,account_id,conversation_id,user_id,message_id,request_key,phone,payload
      ) VALUES(?,?,?,?,?,?,?,?)`,[g,a.accountId,a.conversationId,a.userId,f,a.requestKey,e[0].phone,JSON.stringify(a.payload)]),await b.execute(`UPDATE conversations SET last_message_text=?,last_message_at=UTC_TIMESTAMP(3),
       updated_at=UTC_TIMESTAMP(3) WHERE id=? AND account_id=?`,[i,a.conversationId,a.accountId]),{messageId:f,status:"pending",duplicate:!1}})}}};