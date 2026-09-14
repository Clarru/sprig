import {makeBlock,type Operation} from './model';
import type {Scenario,ScenarioStep} from './scenarios';
const add=(id:string,label:string,x:number,y:number,extra:Partial<ReturnType<typeof makeBlock>>={}):Operation=>({type:'add',block:makeBlock(extra.kind??'step',label,{x,y},{id,...extra})});
const link=(source:string,target:string,label='',outcome:'neutral'|'success'|'failure'='neutral'):Operation=>({type:'connect',edge:{id:`${source}_${target}`,source,target,label,outcome,highlighted:false}});
const update=(id:string,patch:Extract<Operation,{type:'update'}>['patch']):Operation=>({type:'update',id,patch});
const unlink=(...ids:string[]):Operation=>({type:'disconnect',ids});
const beat=(id:string,text:string,message:string,operations:Operation[],undo=false):ScenarioStep=>({id,prompt:message,choices:[{id,text,message,operations,next:null,...(undo?{undo:true}:{})}]});
function append(s:Scenario,from:string,items:ScenarioStep[]){
 for(const c of s.steps[from].choices)c.next=items[0].id;
 items.forEach((item,index)=>{item.choices[0].next=items[index+1]?.id??null;s.steps[item.id]=item;});
}

/** Public product conversations only. Owner recording material is never imported here. */
export function addPublicContinuations(scenarios:Scenario[]){
 const feature=scenarios.find(s=>s.id==='feature')!;
 feature.steps.undo.choices[0].text='No, undo the reminder. Before we add more features, let’s follow the person receiving the invitation and see whether this actually helps them find their friends.';
 append(feature,'undo',[
  beat('invitation','From my friend’s side, the invitation should open straight onto the meeting point. Show the stage name and a useful landmark, because an accurate-looking dot alone doesn’t tell me which side of a crowd to approach.','Following the invitation from the recipient’s side.',[
   add('invite','Open meeting invite',350,480),add('landmark','Read stage + landmark',650,480,{detail:'A recognizable place, not just coordinates.'}),link('solution','invite','friend opens invite'),link('invite','landmark'),
  ]),
  beat('directions','They can optionally use their own location for directions. If they decline that permission, the meeting point should still work. They can read the landmark and find it themselves; we shouldn’t block the invitation behind a permission prompt.','Permission is optional; both paths remain usable.',[
   add('permission','Use my location?',950,480,{kind:'decision'}),add('directions','Show approximate direction',1250,480),add('find','Find the landmark',950,710),link('landmark','permission'),link('permission','directions','yes'),link('permission','find','no'),link('directions','find'),
  ]),
  beat('signal','Festival signal is unreliable, so I don’t want us pretending the map is always live. Keep the last received landmark readable and show when it was updated. If we can’t refresh it, say that clearly instead of silently showing stale information.','Making stale information visible.',[
   add('signal','Last update visible',650,710,{kind:'note',detail:'Keep the received landmark; disclose stale data.'}),link('landmark','signal','poor signal'),
  ]),
  beat('revoke','The person who shared the point should control its lifetime. Whatever expiry option we choose, they must be able to revoke access. That closes the shared invitation; it doesn’t silently turn into permanent location tracking afterwards.','Keeping control with the person sharing.',[
   add('revoke','Owner can revoke access',650,250,{kind:'note',detail:'No ongoing tracking after the point closes.'}),link('expiry','revoke','lifetime policy'),
  ]),
  beat('arrival-proposal','Maybe friends could tap “on my way,” so the organizer knows somebody saw the invitation. I’m not committing to that yet: it might be useful reassurance, or it might turn this small feature into another group chat.','Trying an acknowledgement as an unresolved option.',[
   add('on-way','On my way?',1250,710,{kind:'note',tentative:true}),link('invite','on-way','possible acknowledgement'),
  ]),
  beat('undo-arrival','Actually, undo that acknowledgement for this first version. The job is helping people find a place, not managing attendance. Keep the meeting point, the optional directions, and the privacy decisions we already made.','Removing the extra feature while keeping the useful flow.',[],true),
  beat('expired-invite','One last edge case: someone opens yesterday’s invitation. Show that it has ended and ask them to get a current invitation. Don’t reveal old coordinates. Now we have the main journey, a permission alternative, and a clear ending to review together.','Closing old invitations without exposing the previous location.',[
   add('closed','Invitation has ended',1250,60,{detail:'Request a new invite; hide the old location.'}),link('expiry','closed','opened after closure'),
  ]),
 ]);

 const funnel=scenarios.find(s=>s.id==='funnel')!;
 // Keep each conversion branch's result and recovery specific to that branch.
 for(const mode of ['estimate','quote'] as const){
  const suffix=`-${mode}`,result=mode==='estimate'?'estimate':'submit';
  funnel.steps[`${mode}-details`].choices[0].next=`account${suffix}`;
  for(const id of ['account','undo']){
   const copy=structuredClone(funnel.steps[id]);copy.id=id+suffix;
   copy.choices.forEach(c=>c.next=id==='account'?`undo${suffix}`:null);funnel.steps[copy.id]=copy;
  }
  append(funnel,`undo${suffix}`,[
   beat('questions'+suffix,'Before asking someone to continue, answer the objections they probably have: how long the work takes, how to care for the finish, and what the warranty covers. Put these near pricing, where those questions can actually stop somebody progressing.','Adding reassurance where the visitor makes a decision.',[
    add('faq','Answer common questions',40,470,{kind:'note',detail:'Timing, aftercare and warranty.'}),link('middle','faq','questions before pricing'),link('faq','conversion','ready to continue'),
   ]),
   beat('next-action'+suffix,mode==='estimate'?'Once they see the estimate, they can decide whether to contact the studio. Make that a clear next action, but don’t hide the indicative price behind an email form. The estimate should have already answered their first question.':'After they send the photos, confirm that the studio received the request. Explain that a person will review it and reply. This is not an approved price or a booking, so the confirmation must not imply either of those things.','Making the selected conversion’s next step explicit.',[
    add('followup',mode==='estimate'?'Contact studio if interested':'Request received for review',1250,260,{detail:mode==='estimate'?'Optional after seeing the price.':'Review and reply; not a confirmed booking.'}),link(result,'followup'),
   ]),
   beat('validation'+suffix,'If a required field is missing, keep what they already entered and explain the problem beside that field. Nobody should have to rebuild their enquiry after one mistake. Let them fix the issue and continue from the same place.','Recovering from incomplete information without losing input.',[
    add('validation','Fix highlighted fields',620,650,{outcome:'failure',detail:'Preserve the rest of the entered information.'}),link('details','validation','missing information','failure'),link('validation','details','correct and continue'),
   ]),
   beat('connection'+suffix,mode==='estimate'?'And if the estimate cannot be calculated, don’t leave an endless spinner. Explain that the price is unavailable and offer a way to contact the studio. We should make the fallback useful without pretending we produced a price.':'If sending the request fails, keep the car details and selected photos. Show that it wasn’t sent and let them try again. A success message must only appear after receipt, otherwise someone could leave thinking the studio will contact them.','Showing a recoverable failure rather than a false success.',[
    add('connection',mode==='estimate'?'Estimate unavailable':'Request not sent',950,650,{outcome:'failure',detail:mode==='estimate'?'Offer contact instead.':'Keep input and let them retry.'}),link(result,'connection','request fails','failure'),link('connection',mode==='estimate'?'followup':'submit',mode==='estimate'?'contact instead':'retry'),
   ]),
   beat('privacy'+suffix,mode==='estimate'?'The estimate only needs the service and car information required to calculate it. If someone chooses to contact us afterwards, explain why we ask for their contact details. That optional step must not quietly become a requirement to see the estimate.':'For a reviewed quote, include contact information so the studio can reply, and explain how the photos will be used. Keep those fields purposeful. Creating an account still adds no value to somebody asking their first question.','Matching requested information to the chosen service.',[
    update('details',{detail:mode==='estimate'?'Service and car only; contact stays optional.':'Service, car and contact details for the reply.'}),add('data-use','Explain information use',350,650,{kind:'note',detail:'Only ask for what this enquiry needs.'}),link('details','data-use','privacy note'),
   ]),
   beat('hero-correction'+suffix,'Actually, looking back at the beginning, the hero should show a finished car and the specific service used on it. Beautiful imagery is not enough if people can’t tell what we do. Keep the customer reviews beside that first impression.','Refining the opening without rebuilding the page.',[
    update('work',{label:'Real work + clear service',detail:'Show a finished car and name the service.'}),
   ]),
   beat('review'+suffix,'Now follow this as a visitor: understand the work, find the right service, get reassurance, and take the pricing action. Then inspect the error routes too. We have a page structure and a completion journey, rather than a list of attractive sections.','The page and its chosen conversion are ready to review.',[
    update(result,{outcome:'success'}),update('reviews',{detail:'Specific customer experiences supporting the work.'}),
   ]),
  ]);
 }
 delete funnel.steps.account;delete funnel.steps.undo;

 const onboarding=scenarios.find(s=>s.id==='onboarding')!;
 append(onboarding,'undo',[
  beat('invalid-code','A delivered email does not mean the user is signed in. If the code is wrong or expired, the backend rejects it and the frontend shows an actionable error. Keep the email address so they can try again without restarting everything. Give the lanes more room for these recovery states.','Separating delivery success from verification success.',[
   update('frontend',{width:580,height:1200}),update('backend',{position:{x:710,y:20},height:1800}),add('invalid','Code invalid or expired',320,260,{parentId:'frontend',outcome:'failure',detail:'Keep the email and allow another attempt.'}),link('verify','invalid','invalid code','failure'),link('invalid','code','try again'),
  ]),
  beat('profile-later','Actually, choosing a username should not block the first visit. Let both new and returning users get into the app after sign-in, and offer profile completion afterwards. Move that earlier idea into an optional follow-up instead of deleting it.','Moving profile setup out of the critical path.',[
   update('new',{label:'Add username later',tentative:false,position:{x:320,y:650},detail:'Optional profile completion after sign-in.'}),unlink('check_new','new_returning'),link('returning','new','optional follow-up'),
  ]),
  beat('session','There is a backend handoff before the app opens: create the signed-in session and return the result to the frontend. The frontend should only show the signed-in destination after that succeeds, even though the verification code was already valid.','Making the session handoff explicit.',[
   add('session','Create signed-in session',30,840,{parentId:'backend'}),unlink('check_returning'),link('check','session','verified account'),link('session','returning','session ready','success'),
  ]),
  beat('new-account','For a new person, create the account before creating that session. A returning person already has an account and skips that operation. Both routes then meet at the same session step, so the frontend receives one consistent signed-in result.','Keeping account creation specific to new users.',[
   add('create','Create account',30,650,{parentId:'backend'}),link('check','create','new'),link('create','session'),unlink('check_session'),link('check','session','returning'),
  ]),
  beat('session-failure','If creating the session fails, don’t open a half-signed-in app. Keep the person on a clear sign-in error state and let them restart sign-in. That is a different failure from an undelivered email or an incorrect code.','Keeping session failures out of the signed-in experience.',[
   add('session-error','Sign-in could not finish',320,840,{parentId:'frontend',outcome:'failure',detail:'Offer a new sign-in attempt.'}),link('session','session-error','session failed','failure'),link('session-error','email','restart sign-in'),
  ]),
  beat('duplicate','Someone will tap the button twice or get impatient on a slow connection. We need one active sign-in attempt, and account creation must not produce duplicate accounts. Keep that requirement on the backend side while engineering chooses the implementation.','Capturing duplicate-request handling as an implementation requirement.',[
   add('duplicate','Avoid duplicate accounts',30,1220,{parentId:'backend',kind:'note',detail:'Handle repeated requests for the same sign-in attempt.'}),link('create','duplicate','repeat requests'),
  ]),
  beat('coverage','That gives us useful review cases: new and returning users, an invalid code, failed email delivery, a failed session, and repeated taps. Profile completion stays optional. Now a designer and engineer can point at the same handoffs and discuss what still needs testing.','The handoffs and recovery cases are visible together.',[
   add('coverage','Review the recovery paths',30,1410,{parentId:'backend',kind:'note',height:160,detail:'New/returning, invalid codes, delivery/session failures, repeated taps.'}),
  ]),
 ]);
}
