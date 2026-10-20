const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({path:path.join(__dirname,'..','.env'),quiet:true});
const secret=process.env.AUTOMATION_CRON_SECRET;
const origin=process.env.NEXT_PUBLIC_APP_URL || process.env.CRM_URL;
async function main(){
  if(!secret||!origin)throw Error('Configure AUTOMATION_CRON_SECRET e NEXT_PUBLIC_APP_URL no ambiente local.');
  const url=new URL('/api/clinic/appointments/reminders',origin);
  url.searchParams.set('window_minutes','120');url.searchParams.set('limit','25');
  const response=await fetch(url,{headers:{'x-cron-secret':secret},signal:AbortSignal.timeout(110000)});
  if(!response.ok)throw Error(`Rotina de lembretes devolveu HTTP ${response.status}.`);
  const result=await response.json();
  const summary={at:new Date().toISOString(),checked:result.checked,sent:result.sent,pendingChecked:result.pending_confirmations_checked,confirmationReminders:result.confirmation_reminders_sent,failures:(result.failed?.length||0)+(result.confirmation_reminder_failures?.length||0)};
  const folder=path.join(__dirname,'..','logs','appointment-reminders');fs.mkdirSync(folder,{recursive:true});
  fs.appendFileSync(path.join(folder,'runs.log'),JSON.stringify(summary)+'\n');
  console.log(JSON.stringify(summary));
  if(summary.failures)process.exitCode=1;
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
