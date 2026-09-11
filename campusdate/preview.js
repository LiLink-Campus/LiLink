// Local-only fixture adapter. No production requests are forwarded.
if (!['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Local preview only');
const profile={nickname:'预览同学',avatar:'🐱',dept:'计算机学院（网络空间安全学院、密码学院）',grade:'研一',email:'preview@example.invalid',status:1,contactType:'微信',contactValue:'demo_only',surveyDone:true};
for(const [key,value] of Object.entries({app_version:'2.0.0',token:'local-preview-only',user_email:profile.email,nickname:profile.nickname,profile:JSON.stringify(profile),survey_done:'1',terms_agreed:'1'}))localStorage.setItem('cd_sjtu_'+key,value);
localStorage.setItem('cd__app_version','2.0.0');
const originalFetch=window.fetch.bind(window);
const configPromise=originalFetch('/school-config.json').then(r=>r.json());
const match={matchResultId:1,roundId:1,roundName:'秋日相遇 · 演示轮次',partnerNickname:'小满（虚拟人物）',partnerAvatar:'🌷',partnerSchoolName:'上海交通大学',partnerDept:'设计学院',partnerGrade:'研究生',partnerBirthYear:2002,partnerHometown:'上海',partnerGender:'女',partnerHobbies:['摄影与后期修图','阅读（小说、文学等）','旅行与打卡'],partnerEmail:'demo@example.invalid',partnerContactType:'微信',partnerContactValue:'demo_only',partnerStatus:1,displayScore:96.8,highlights:['生活节奏：你们都喜欢在周末探索城市','兴趣共鸣：摄影、阅读与旅行','价值观：认真对待关系，也尊重彼此的空间'],myNickname:profile.nickname,myContact:'demo_only',feedbackOpen:true};
const round={id:2,roundId:2,hasRound:true,joined:true,roundStatus:0,name:'秋日相遇 · 演示轮次',matchTimeIso:new Date(Date.now()+86400000*3).toISOString()};
window.__previewRequests=[];
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.origin!==location.origin)throw new Error('External requests disabled in local preview');
 if(!url.pathname.startsWith('/api/'))return originalFetch(input,options);
 const p=url.pathname.slice(4);window.__previewRequests.push(p);
 let data={};
 if(p==='/schools/sjtu/config')return new Response(JSON.stringify(await configPromise),{headers:{'Content-Type':'application/json'}});
 if(p==='/schools')data=[{code:'sjtu',name:'上海交通大学'}];
 else if(p==='/user/profile')data=profile;
 else if(p==='/dashboard/bootstrap')data={profile,roundStatus:round,serverTime:Date.now(),shootStatus:{sent:false,mutual:false},receivedShots:{count:0},matchHistory:[match],campaigns:[],notifications:{count:1}};
 else if(p==='/rounds/latest-result')data=match;
 else if(p==='/rounds/current')data=round;
 else if(p==='/rounds/match-history')data=[match];
 else if(p==='/shoot')data={sent:false,mutual:false};
 else if(p==='/time')data={serverTime:Date.now(),now:Date.now()};
 else if(p==='/notifications/unread-count')data={count:1};
 else if(p==='/notifications')data={records:[{id:1,title:'欢迎体验本地 UI 预览',content:'此页面使用虚拟数据，所有操作仅在本地模拟。',type:'announcement',isRead:false,createdAt:new Date().toISOString()}],total:1};
 else if(p==='/answers')data={answers:{}};
 else if(['/coupons/active','/coupons/campaigns','/medals/me','/changelog','/reports/mine','/match-reports'].includes(p))data=[];
 else if(['/activities/current','/site-announcement','/match-reports/latest'].includes(p))data=null;
 else if(p.endsWith('/feedback'))data={canSubmit:true,feedback:null};
 else if(p==='/stats')data={totalUsers:1280,totalMatches:320};
 return new Response(JSON.stringify({code:200,message:'本地模拟',data}),{headers:{'Content-Type':'application/json'}});
};
navigator.sendBeacon=()=>false;
document.addEventListener('DOMContentLoaded',()=>{
 const bar=document.createElement('div');bar.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#332925;color:#fff;padding:10px 16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;font:12px system-ui';
 bar.innerHTML='<strong>本地预览 · 全部为虚拟数据</strong>'+[['dashboard','仪表盘'],['survey','问卷'],['match','配对揭晓'],['profile','个人设置'],['notifications','通知']].map(([path,label])=>`<a style="color:#ffe1bd" href="/sjtu/${path}">${label}</a>`).join('');document.body.append(bar);document.body.style.paddingBottom='70px';
});
