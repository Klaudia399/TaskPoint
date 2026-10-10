/* TaskPoint BETA 0.9 — pilotaż. Reguły FIRESTORE-RULES-0.9.txt. Zdarzenia współdzielone w Firestore. */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, setDoc, getDoc, query, where,
  runTransaction, getDocs, writeBatch, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

export function mountWorkspace({db:firestore,user,profile}) {
  const role=profile.role;
  const admin=role==='admin', buyer=admin||role==='zaopatrzenie';
  const boss=admin||role==='dyrektor'||role==='prezes';
  const warehouse=admin||role==='magazyn';
  const manager=admin||role==='kierownik';
  const staff=role!=='kierownik';
  const labels={admin:'Administrator',kierownik:'Kierownik budowy',zaopatrzenie:'Zaopatrzeniowiec',magazyn:'Magazyn',dyrektor:'Dyrektor',prezes:'Prezes'};
  const kinds={oczekuje_zaop:'Weryfikacja zaopatrzenia',oczekuje_zarzad:'Do akceptacji zarządu',zatwierdzona:'Zatwierdzona',odrzucona:'Odrzucona',zgloszone:'Zgłoszone',zaakceptowane:'Zaakceptowane',zamowione:'Zamówione u dostawcy',magazyn_czesciowo:'Częściowo w magazynie',magazyn_przyjete:'Przyjęte w magazynie',zaplanowany:'Transport zaplanowany',wydany:'W transporcie',dotarl:'Transport dotarł',odebrany:'Odebrane',czesciowy:'Odbiór częściowy'};
  const nav=[['dashboard','⌂','Pulpit'],['projects','▥','Budowy'],['materials','▤','Materiały'],['orders','▣','Zamówienia'],['changes','✓','Akceptacje'],['transport','🚚','Transport'],['stock','▦','Magazyn'],['docs','▧','Dokumenty'],['notifications','🔔','Powiadomienia'],...((buyer||boss)?[['suppliers','🏢','Dostawcy']]:[]),...(admin?[['users','♙','Użytkownicy']]:[])];
  let current='dashboard',selected='all',activity='all',branchFilter='all',projectUnsubs=new Map(),usersUnsub=null,suppliersUnsub=null,projects=[],personnel=[],suppliers=[],notices=[],noticeError='',live=false;
  let bucket=new Map();
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Number(v)||0;
  const now=()=>new Date().toISOString();
  const today=()=>new Date().toISOString().slice(0,10);
  const asDate=v=>v?.toDate?v.toDate():new Date(String(v).length===10?v+'T12:00:00':v);
  const fmt=v=>v?asDate(v).toLocaleDateString('pl-PL'):'—';
  const fmtFull=v=>v?asDate(v).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
  const pidDoc=(pid)=>doc(firestore,'projects',pid);
  const sub=(pid,col)=>collection(firestore,'projects',pid,col);
  const entityDoc=(pid,col,id)=>doc(firestore,'projects',pid,col,id);
  const list=(name)=>projects.flatMap(p=>(bucket.get(p.id)?.[name]||[]));
  const withP=(items)=>selected==='all'?items:items.filter(x=>x.projectId===selected);
  const prName=id=>projects.find(p=>p.id===id)?.name||'Budowa';
  const mat=(pid,id)=>(bucket.get(pid)?.materials||[]).find(m=>m.id===id);
  const order=(pid,id)=>(bucket.get(pid)?.orders||[]).find(x=>x.id===id);
  const change=(pid,id)=>(bucket.get(pid)?.changes||[]).find(x=>x.id===id);
  const shipment=(pid,id)=>(bucket.get(pid)?.shipments||[]).find(x=>x.id===id);
  const pick=(pid=selected,all=true)=>`${all?'<option value="all">Wszystkie budowy</option>':''}${projects.map(p=>`<option value="${esc(p.id)}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}`;
  const vstatus=(s)=>`<span class="chip ${s==='zatwierdzona'||s==='odebrany'||s==='magazyn_przyjete'?'green':s==='odrzucona'?'red':s==='oczekuje_zarzad'?'purple':'blue'}">${esc(kinds[s]||s)}</span>`;
  const btn=(a,text,pid='',id='',klass='')=>`<button class="btn ${klass}" data-action="${a}" data-pid="${esc(pid)}" data-id="${esc(id)}">${text}</button>`;
  const branches=[['all','Wszystkie branże'],['sanitarna','Sanitarna'],['budowlana','Budowlana'],['elektryczna','Elektryczna']];
  function branchOf(x){const raw=String(x?.branch||x?.discipline||'').toLowerCase();if(/sanit|wod|kan|went|hvac|co\b|grzew|klimat/.test(raw))return 'sanitarna';if(/elekt|telet|prąd|przew[oó]d|instalacja el/.test(raw))return 'elektryczna';return 'budowlana'}
  const branchName=v=>({sanitarna:'Sanitarna',budowlana:'Budowlana',elektryczna:'Elektryczna'})[v]||'Budowlana';
  const branchOK=x=>branchFilter==='all'||branchOf(x)===branchFilter;
  const branchControl=()=>`<div class="v7-bar"><label class="v7-meta" for="branch-filter">Branża</label><select id="branch-filter">${opt(branches,branchFilter)}</select></div>`;
  const progressPart=(v)=>Math.max(0,Math.min(100,Number(v)||0));
  function receivedQty(pid,mid){return (bucket.get(pid)?.shipments||[]).filter(t=>t.materialId===mid&&['odebrany','czesciowy'].includes(t.status)).reduce((a,t)=>a+n(t.receivedQty??t.qty),0)}
  function materialProgress(pid,m){const planned=n(m.approvedQty);const ignored=m.manualStatus==='pominieta';const manual=Math.max(0,n(m.baselineDeliveredQty));const delivered=receivedQty(pid,m.id);return {ignored,planned,manual,delivered,ratio:planned>0?Math.min(1,(manual+delivered)/planned):0,unresolved:!ignored&&!(planned>0)}}
  function progressFor(pid,branch='all'){const entries=(bucket.get(pid)?.materials||[]).filter(m=>branch==='all'||branchOf(m)===branch);const parts=entries.map(m=>materialProgress(pid,m));const used=parts.filter(t=>!t.ignored&&!t.unresolved);const percent=used.length?Math.round(100*used.reduce((sum,t)=>sum+t.ratio,0)/used.length):0;return {percent,total:entries.length,used:used.length,skipped:parts.filter(t=>t.ignored).length,unresolved:parts.filter(t=>t.unresolved).length,complete:used.filter(t=>t.ratio>=1).length}}
  function progressBar(value){return `<div class="tp-progress"><div style="width:${progressPart(value)}%"></div></div>`}
  const cleanName=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(pcv)\b/g,'pvc').replace(/fi\s*(\d+)/g,'dn$1').replace(/[^a-z0-9]+/g,' ').trim();
  function suggested(pid,typed){const words=cleanName(typed).split(' ').filter(w=>w.length>1);if(!words.length)return[];return (bucket.get(pid)?.materials||[]).map(m=>{const name=cleanName(m.name);const score=words.filter(w=>name.includes(w)).length/words.length;return {m,score}}).filter(x=>x.score>=.5).sort((a,b)=>b.score-a.score).slice(0,6)}
  const row=(name,value,ico)=>`<div class="stat"><div class="stat-icon">${ico}</div><strong>${value}</strong><small>${name}</small></div>`;
  function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),3900)}
  function error(e){let message=e?.code==='permission-denied'?'Brak uprawnienia do tej czynności (Firestore Rules).':e?.code==='unavailable'?'Brak połączenia z Firestore.':(e?.message||String(e));console.error(e);toast(message);}
  function modal(title,body){$('modal').hidden=false;$('modal').innerHTML=`<div class="modal-box"><div class="modal-head"><h2>${esc(title)}</h2><button data-action="close" class="modal-close">×</button></div><div class="modal-content">${body}</div></div>`}
  function close(){$('modal').hidden=true;$('modal').innerHTML=''}
  const f=(name,label,value='',type='text',extra='')=>`<div class="field"><label>${esc(label)}</label><input name="${esc(name)}" type="${type||'text'}" value="${esc(value)}" ${extra} ${['address','managerLabel'].includes(name)?'':'required'}></div>`;
  const opt=(items,val='')=>items.map(([a,b])=>`<option value="${esc(a)}" ${a===val?'selected':''}>${esc(b)}</option>`).join('');
  const section=(title,subtitle,actions='')=>`<div class="section-top"><div><div class="eyebrow">TaskPoint · ${labels[role]}</div><h1>${title}</h1><p class="sub">${subtitle}</p></div><div class="actions">${actions}</div></div>`;
  const blank=txt=>`<div class="v7-empty">${esc(txt)}</div>`;
  function requireProject(){if(!projects.length){toast('Najpierw dodaj budowę jako administrator.');return false}return true}

  // Listeners are opened only for projects the signed-in user is allowed to read.
  function connectProjects(){
    const ref=collection(firestore,'projects');
    const q=staff?ref:query(ref,where('memberUids','array-contains',user.uid));
    onSnapshot(q,snap=>{
      live=true;noticeError='';projects=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>a.name.localeCompare(b.name,'pl'));
      const known=new Set(projects.map(x=>x.id));
      for(const [id,off] of projectUnsubs)if(!known.has(id)){off.forEach(fn=>fn());projectUnsubs.delete(id);bucket.delete(id)}
      for(const p of projects)if(!projectUnsubs.has(p.id)){
        bucket.set(p.id,{materials:[],orders:[],changes:[],shipments:[],stock:[],comments:[],events:[]});
        const off=['materials','orders','changes','shipments','stock','comments','events'].map(name=>onSnapshot(sub(p.id,name),s=>{
          if(!bucket.has(p.id))return;
          bucket.get(p.id)[name]=s.docs.map(x=>({id:x.id,...x.data()}));render();
        },err=>{noticeError=`Nie udało się wczytać ${name} dla ${p.name}: ${err.code||err.message}`;render()}));
        projectUnsubs.set(p.id,off);
      }
      if(selected!=='all'&&!known.has(selected))selected='all';
      $('connection-label').textContent='Synchronizacja włączona';render();
    },err=>{noticeError=`Nie udało się wczytać listy budów: ${err.code||err.message}`;$('connection-label').textContent='Błąd dostępu';render()});
    if(true){usersUnsub=onSnapshot(collection(firestore,'users'),snap=>{personnel=snap.docs.map(x=>({uid:x.id,...x.data()}));render()},err=>{noticeError=`Nie udało się wczytać użytkowników: ${err.code||err.message}`;render()})}
    if(buyer||boss){suppliersUnsub=onSnapshot(collection(firestore,'suppliers'),snap=>{suppliers=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pl'));render()},err=>{console.warn('Dostawcy:',err.code||err.message);toast('Nie udało się wczytać dostawców. Sprawdź nowe reguły Firestore.');})}
    onSnapshot(collection(firestore,'users',user.uid,'notifications'),snap=>{notices=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));render()},err=>{console.warn('Powiadomienia:',err.code||err.message)});
  }

  function render(){
    $('role-display').textContent=labels[role];$('avatar').textContent=labels[role].slice(0,1);
    $('side-nav').innerHTML=nav.map(([id,icon,name])=>`<button data-tab="${id}" class="${id===current?'active':''}"><span class="nav-icon">${icon}</span>${name}</button>`).join('');
    const mobile=['dashboard','projects','orders','changes','transport','notifications'];
    $('mobile-nav').innerHTML=nav.filter(([id])=>mobile.includes(id)).map(([id,icon,name])=>`<button data-tab="${id}" class="${id===current?'active':''}"><b>${icon}</b>${name}</button>`).join('');
    const handler={dashboard,projects:pageProjects,materials:pageMaterials,orders:pageOrders,changes:pageChanges,transport:pageTransport,stock:pageStock,docs:pageDocs,notifications:pageNotifications,suppliers:pageSuppliers,users:pageUsers,settings:pageSettings}[current]||dashboard;
    const bell=notices.filter(x=>!x.readAt).length; const navBell=[...document.querySelectorAll('[data-tab=notifications]')];navBell.forEach(b=>{if(bell)b.title=bell+' nowych powiadomień';b.innerHTML=b.innerHTML.replace(/<span class="tp-ncount">.*?<\/span>/g,'')+(bell?`<span class="tp-ncount">${bell>99?'99+':bell}</span>`:'')});
    $('page').innerHTML=(noticeError?`<div class="warn-banner">${esc(noticeError)}</div>`:'')+(live?handler():blank('Łączenie ze wspólną bazą Firebase…'));
  }
  function projectFilter(){return `<div class="v7-bar"><label class="v7-meta" for="project-filter">Budowa</label><select id="project-filter">${pick(selected)}</select></div>`}
  function dashboard(){const o=withP(list('orders')),s=withP(list('shipments')),c=withP(list('changes'));
    return section('Dzień dobry!','Wspólna baza Firestore — informacje aktualizują się na zalogowanych urządzeniach.',
      (admin?btn('new-project','＋ Nowa budowa','','','primary'):'')+(manager?btn('new-order','＋ Zapotrzebowanie','','','primary'):''))+
    `<div class="stats">${row('Aktywne budowy',projects.length,'🏗')}${row('Zamówienia',o.length,'▣')}${row('Transporty',s.length,'🚚')}${row('Do akceptacji',c.filter(x=>x.status==='oczekuje_zarzad').length,'✓')}</div>`+
    `<div class="card tp-dashboard-progress"><h2>Zatowarowanie budów — potwierdzony odbiór</h2><div class="tp-progress-grid">${projects.map(p=>{const x=progressFor(p.id);return `<div><b>${esc(p.name)}</b><span>${x.percent}%</span>${progressBar(x.percent)}<small>${x.complete}/${x.used} zakończonych · ${x.skipped} pominiętych · ${x.unresolved} do ustalenia</small></div>`}).join('')||'Brak budów'}</div><p class="helper">Wskaźnik opiera się na ilościach odebranych i ręcznie potwierdzonych jako znajdujące się na budowie. Pozycje pominięte są wyłączone z mianownika.</p></div>`+
    `<div class="grid2"><div class="card"><div class="card-header"><h2>Ostatnie zamówienia</h2>${btn('goto-orders','Zobacz wszystkie')}</div><div class="v7-list">${o.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,5).map(x=>`<div class="v7-flex"><div><strong>${esc(x.reference||x.id)}</strong> · ${esc(prName(x.projectId))}<div class="meta">${x.items.length} pozycji · ${fmtFull(x.serverAt||x.createdAt)}</div></div>${btn('order-detail','Szczegóły',x.projectId,x.id)}</div>`).join('')||blank('Nie ma jeszcze zamówień')}</div></div>`+
    `<div class="card"><div class="card-header"><h2>Centrum uwagi</h2></div><div class="v7-list"><div>Do weryfikacji zaopatrzenia: <b>${c.filter(x=>x.status==='oczekuje_zaop').length}</b></div><div>Do decyzji zarządu: <b>${c.filter(x=>x.status==='oczekuje_zarzad').length}</b></div><div>Transporty zaplanowane: <b>${s.filter(x=>x.status==='zaplanowany').length}</b></div><div>Transporty do odbioru: <b>${s.filter(x=>x.status==='wydany').length}</b></div></div></div></div>`+
    `<p class="helper">Nowe powiadomienia: <b>${notices.filter(x=>!x.readAt).length}</b>. Są to powiadomienia wewnętrzne, nie systemowe push.</p>`;
  }
  const mineProject=(pid)=>projects.find(p=>p.id===pid);
  const activePeople=()=>personnel.filter(p=>p.active===true);
  const specialities={budowlana:'Budowlany',sanitarna:'Sanitarny',elektryczna:'Elektryczny',wszystkie:'Wszystkie branże'};
  const assignTypes={glowny:'Kierownik',zastepstwo:'Zastępstwo'};
  function projectAssignments(project){
    if(Array.isArray(project?.managerAssignments))return project.managerAssignments;
    // Migracja wyłącznie w UI: dotychczasowi kierownicy nadal zachowują dostęp.
    return (project?.memberUids||[]).map(uid=>({uid,branch:'wszystkie',kind:'glowny',fromDate:'',toDate:''}));
  }
  function assignmentValid(a,day=today()){
    return (!a.fromDate||a.fromDate<=day)&&(!a.toDate||a.toDate>=day);
  }
  function managerAssignments(pid,branch='all'){
    return projectAssignments(mineProject(pid)).filter(a=>assignmentValid(a)&&(branch==='all'||a.branch==='wszystkie'||a.branch===branch));
  }
  const managersOf=(pid,branch='all')=>{
    const ids=new Set(managerAssignments(pid,branch).map(a=>a.uid));
    return activePeople().filter(p=>p.role==='kierownik'&&ids.has(p.uid));
  };
  const byRoles=(pid,roles,branch='all')=>activePeople().filter(p=>roles.includes(p.role)&& (p.role!=='kierownik'||managersOf(pid,branch).some(m=>m.uid===p.uid)));
  function recipients(pid,kind,extra=[],branch='all'){
    let roles=kind==='order'?['zaopatrzenie','admin']:kind==='change'?['zaopatrzenie','dyrektor','prezes','admin']:kind==='transport'?['zaopatrzenie','kierownik','admin']:kind==='board-comment'?['kierownik','zaopatrzenie']:kind==='manager-comment'?['zaopatrzenie']:kind==='buyer-comment'?['kierownik']:kind==='warehouse-comment'?['kierownik','zaopatrzenie']:['kierownik','zaopatrzenie'];
    return [...new Set([...byRoles(pid,roles,branch).map(p=>p.uid),...extra])].filter(uid=>uid!==user.uid&&activePeople().some(p=>p.uid===uid));
  }
  function roleMentions(text,pid,branch='all'){const textLow=String(text||'').toLowerCase();const roles={magazyn:'magazyn',zaopatrzeniowiec:'zaopatrzenie',zaopatrzenie:'zaopatrzenie',kierownik:'kierownik',dyrektor:'dyrektor',prezes:'prezes'};
    const matches=Object.entries(roles).filter(([word])=>textLow.includes('@'+word)).flatMap(([,roleName])=>byRoles(pid,[roleName],branch).map(p=>p.uid));
    if(/@sanitarny/.test(textLow))matches.push(...managersOf(pid,'sanitarna').map(p=>p.uid));
    if(/@elektryczny/.test(textLow))matches.push(...managersOf(pid,'elektryczna').map(p=>p.uid));
    if(/@budowlany/.test(textLow))matches.push(...managersOf(pid,'budowlana').map(p=>p.uid));
    return [...new Set(matches)];
  }
  function targetBranch(pid,targetType,targetId){
    if(targetType==='transport'){const item=shipment(pid,targetId);return item?.materialId?branchOf(mat(pid,item.materialId)||item):'all'}
    if(targetType==='change'){const item=change(pid,targetId);return item?branchOf(item):'all'}
    if(targetType==='material'){const item=mat(pid,targetId);return item?branchOf(item):'all'}
    if(targetType==='order'){const item=order(pid,targetId);const types=[...new Set((item?.items||[]).map(branchOf))];return types.length===1?types[0]:'all'}
    return 'all';
  }
  async function logAndNotify(pid,kind,targetType,targetId,text,ids=[]){
    const ev=doc(sub(pid,'events')); const batch=writeBatch(firestore),stamp=now();
    batch.set(ev,{projectId:pid,actorUid:user.uid,actor:profile.name||labels[role],kind,targetType,targetId,text:String(text||'').slice(0,240),createdAt:stamp,serverAt:serverTimestamp()});
    for(const uid of [...new Set(ids)].filter(x=>x!==user.uid).slice(0,8)){
      const ref=doc(collection(firestore,'users',uid,'notifications'));
      batch.set(ref,{projectId:pid,eventId:ev.id,eventType:kind,targetType,targetId,text:String(text||'').slice(0,240),fromUid:user.uid,fromName:profile.name||labels[role],createdAt:stamp,serverAt:serverTimestamp(),readAt:null});
    }
    await batch.commit();
  }
  function notifyFailure(e){console.warn('Nie udało się wysłać powiadomienia',e);toast('Zapisano zmianę, ale powiadomienia wymagają sprawdzenia reguł.');}
  const myActive=(o)=>{
    if(admin || (boss&&!buyer))return true;
    return o.items.some(i=>{
      const s=i.status||'zgloszone';const shipped=(bucket.get(o.projectId)?.shipments||[]).filter(t=>t.orderItemId===i.id);
      const issued=shipped.filter(t=>['wydany','dotarl','odebrany','czesciowy'].includes(t.status)).reduce((s,t)=>s+n(t.qty),0);
      const received=shipped.filter(t=>['odebrany','czesciowy'].includes(t.status)).reduce((s,t)=>s+n(t.receivedQty??t.qty),0);
      if(buyer&&!warehouse) return ['zgloszone','zaakceptowane'].includes(s);
      if(warehouse) return s==='zamowione'||s==='magazyn_czesciowo'||(s==='magazyn_przyjete'&&issued<n(i.warehouseReceivedQty??i.qty));
      if(manager) return received<n(i.qty);
      return true;
    });
  };
  const activeSelect=()=>`<div class="v7-bar"><label class="v7-meta">Moje zadania</label><select id="activity-filter"><option value="active" ${activity==='active'?'selected':''}>Aktywne</option><option value="done" ${activity==='done'?'selected':''}>Zakończone dla mnie</option><option value="all" ${activity==='all'?'selected':''}>Wszystkie</option></select></div>`;
  const filterActivity=(orders)=>activity==='all'?orders:orders.filter(o=>activity==='active'?myActive(o):!myActive(o));
  function pageNotifications(){return section('Powiadomienia','Nowe zadania i komentarze — po zapisaniu pojawiają się w aplikacji.')+`<div class="card-list">${notices.map(v=>`<div class="item-card ${v.readAt?'':'tp-unread'}"><div class="item-name">${esc(v.fromName||'TaskPoint')} · ${esc(v.eventType||'Zdarzenie')}</div><div class="meta">${esc(prName(v.projectId))} · ${fmtFull(v.serverAt||v.createdAt)}</div><p>${esc(v.text)}</p><div class="item-foot">${btn('notice-open',v.readAt?'Otwórz':'Przeczytaj',v.projectId,v.id)}</div></div>`).join('')||blank('Brak powiadomień')}</div>`}

  function pageProjects(){return section('Budowy','Bieżące zatowarowanie oraz stan inwestycji na dzień wdrożenia.',admin?btn('new-project','＋ Nowa budowa','','','primary'):'')+`<div class="card-list">${projects.map(p=>{const x=progressFor(p.id);return `<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(p.name)}</div><div class="item-sub">${esc(p.address||'')} · ${projectAssignments(p).length} przypisanych kierowników</div><div class="tp-manager-list">${projectAssignments(p).map(a=>{const person=personnel.find(x=>x.uid===a.uid);return `<span class="tp-manager-tag">${esc(person?.name||a.uid)} · ${esc(specialities[a.branch]||a.branch)}${a.kind==='zastepstwo'?' · zastępstwo':''}${assignmentValid(a)?'':' · POZA TERMINEM'}</span>`}).join('')||'<small>Brak przypisanych kierowników</small>'}</div></div><strong>${x.percent}%</strong></div>${progressBar(x.percent)}<div class="meta">Zatowarowanie potwierdzone · ${x.complete}/${x.used} pozycji · pominięte ${x.skipped} · bez ilości ${x.unresolved}</div>${p.baselineEstimatePct!==undefined?`<div class="meta">Szacowane zaawansowanie inwestycji na starcie: ${progressPart(p.baselineEstimatePct)}% (nie wpływa na zatowarowanie)</div>`:''}<div class="actions" style="margin-top:14px">${btn('focus-project','Otwórz materiały',p.id)}${admin?btn('assign-project','Kierownicy i zastępstwa',p.id):''}${admin?btn('project-baseline','Stan początkowy inwestycji',p.id):''}${admin?btn('bulk-baseline','Uzupełnij wiele materiałów',p.id):''}</div></div>`}).join('')||blank('Dodaj pierwszą budowę.')}</div>`}
  function pageMaterials(){const items=withP(list('materials')).filter(branchOK);return section('Lista materiałowa','Zatowarowanie liczone według faktycznie odebranych ilości oraz ręcznie potwierdzonych stanów początkowych.',(buyer?btn('new-material','＋ Dodaj / importuj','','','primary'):'')+(admin?btn('bulk-baseline','Uzupełnij stan wielu pozycji',selected!=='all'?selected:projects[0]?.id):''))+projectFilter()+branchControl()+`<div class="table-card v7-table-scroll"><table><thead><tr><th>Budowa / materiał</th><th>Branża</th><th>Plan</th><th>Na budowie</th><th>Status z Excela</th><th>Stan ręczny</th><th>Postęp</th><th>Działania</th></tr></thead><tbody>${items.map(m=>{const p=materialProgress(m.projectId,m);const manualLabel={oczekuje:'Oczekuje',realizowana:'Realizowana',pominieta:'Pominięta',zrealizowana:'Zrealizowana ręcznie'}[m.manualStatus||'oczekuje'];return `<tr><td><strong>${esc(m.name)}</strong><div class="meta">${esc(prName(m.projectId))} · ${esc(m.externalId||'')} · ${esc(m.unit)}</div>${m.rfiStatus&&/RFI|DO POTWIERDZENIA|ROZBIEŻN|KONFLIKT/i.test(m.rfiStatus)?'<span class="v7-flag">RFI — do weryfikacji</span>':''}</td><td>${branchName(branchOf(m))}</td><td>${n(m.approvedQty)} ${esc(m.unit)}</td><td>${Math.min(p.planned,p.manual+p.delivered)} ${esc(m.unit)}<div class="meta">Wcześniej: ${p.manual} · odbiór: ${p.delivered}</div></td><td>${esc(m.excelStatus||'—')}${m.excelQtyToVerify?'<div class="meta">Weryfikacja ilości</div>':''}</td><td>${esc(manualLabel)}</td><td>${p.ignored?'Pominięto':p.unresolved?'Do ustalenia':Math.round(p.ratio*100)+'%'}</td><td>${admin?btn('manual-material','Ustaw status / stan',m.projectId,m.id):''}</td></tr>`}).join('')}</tbody></table></div>${items.length?'':blank('Brak materiałów w tym filtrze.')}`}
  function pageOrders(){const items=filterActivity(withP(list('orders')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))).filter(o=>o.items.some(branchOK));return section('Zamówienia','Filtr branży działa na pojedynczych pozycjach zamówienia; jedno zamówienie może łączyć branże.',manager?btn('new-order','＋ Nowe zapotrzebowanie','','','primary'):'')+projectFilter()+branchControl()+activeSelect()+`<div class="card-list">${items.map(o=>`<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(o.reference||o.id)} · ${esc(prName(o.projectId))}</div><div class="item-sub">${esc(o.createdBy||'Kierownik')} · ${fmtFull(o.serverAt||o.createdAt)}</div></div><span class="chip ${myActive(o)?'blue':'green'}">${myActive(o)?'Aktywne':'Zakończone'}</span></div><div class="item-detail">${o.items.filter(branchOK).map(i=>`<span>${esc(i.name)}: ${n(i.qty)} ${esc(i.unit)} · ${branchName(branchOf(i))} · ${esc(kinds[i.status]||i.status)} · ${fmt(i.due)}</span>`).join('')}</div><div class="item-foot">${btn('order-detail','Szczegóły, WZ i komentarze',o.projectId,o.id)}</div></div>`).join('')||blank('Brak zamówień w tym filtrze.')}</div>`}
  function pageChanges(){const items=withP(list('changes')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return section('Zmiany i akceptacje','Zaopatrzenie weryfikuje; decyzję podejmuje jeden dyrektor lub prezes.',manager?btn('new-change','＋ Zgłoś zmianę','','','primary'):'')+projectFilter()+`<div class="card-list">${items.map(c=>`<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(c.kind==='new'?c.newName:(mat(c.projectId,c.materialId)?.name||'Zmiana ilości'))}</div><div class="item-sub">${esc(prName(c.projectId))} · ${fmtFull(c.serverAt||c.createdAt)} · ${esc(c.createdBy)}</div></div>${vstatus(c.status)}</div><div class="item-detail"><span>Pierwotnie: ${n(c.oldQty)}</span><span>Wnioskowano: ${n(c.newQty)} ${esc(c.unit)}</span></div><p class="small">${esc(c.reason)}</p><div class="item-foot"><span class="meta">${c.approvedBy?`Decyzja: ${esc(c.approvedBy)}`:''}</span><div class="row-actions">${btn('change-detail','Szczegóły',c.projectId,c.id)}${buyer&&c.status==='oczekuje_zaop'?btn('review-change','Przekaż zarządowi',c.projectId,c.id,'primary'):''}${boss&&c.status==='oczekuje_zarzad'?btn('approve-change','Zatwierdź',c.projectId,c.id,'green'):''}${boss&&c.status==='oczekuje_zarzad'?btn('reject-change','Odrzuć',c.projectId,c.id,'danger'):''}</div></div></div>`).join('')||blank('Brak zgłoszonych zmian.')}</div>`}
  function pageTransport(){let data=withP(list('shipments')).sort((a,b)=>String(a.plannedDate).localeCompare(String(b.plannedDate)));
    const activeShip=s=>warehouse? s.status==='zaplanowany':manager?['wydany','dotarl'].includes(s.status):!['odebrany','czesciowy'].includes(s.status);
    if(activity!=='all')data=data.filter(s=>activity==='active'?activeShip(s):!activeShip(s));
    return section('Transport materiałów','Przyjazd i odbiór to dwa osobne potwierdzenia. Dostawy częściowe pozostają w historii.',warehouse?btn('new-transport','＋ Zaplanuj transport','','','primary'):'')+projectFilter()+activeSelect()+`<div class="card-list">${data.map(s=>`<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(s.material)} — ${n(s.qty)} ${esc(s.unit)}</div><div class="item-sub">${esc(prName(s.projectId))} · Kierowca: ${esc(s.driver)}</div></div>${vstatus(s.status)}</div><div class="item-detail"><span>Wywóz: ${fmt(s.plannedDate)}</span><span>Dostawa: ${fmt(s.deliveryDate)}</span><span>${esc(s.from)} → ${esc(s.destination)}</span>${s.arrivedAt?`<span>Przyjazd: ${fmtFull(s.arrivedServerAt||s.arrivedAt)}</span>`:''}</div><div class="item-foot">${btn('shipment-detail','Szczegóły / zdjęcia / komentarze',s.projectId,s.id)}<div class="row-actions">${warehouse&&s.status==='zaplanowany'?btn('dispatch','Potwierdź wydanie',s.projectId,s.id,'primary'):''}${manager&&s.status==='wydany'?btn('arrive','Transport dotarł',s.projectId,s.id,'primary'):''}${manager&&s.status==='dotarl'?btn('receive-form','Potwierdź ilość',s.projectId,s.id,'green'):''}</div></div></div>`).join('')||blank('Brak transportów w tym widoku.')}</div>`}
  function pageStock(){const rows=withP(list('stock'));return section('Magazyn','Przyjęcia na stan — testowy rejestr, jeszcze nie pełna ewidencja ERP.',warehouse?btn('new-stock','＋ Przyjęcie na stan','','','primary'):'')+projectFilter()+`<div class="table-card"><table><thead><tr><th>Materiał</th><th>Budowa</th><th>Ilość</th><th>Data</th><th>Uwagi</th></tr></thead><tbody>${rows.map(s=>`<tr><td><strong>${esc(s.material)}</strong></td><td>${esc(prName(s.projectId))}</td><td>${n(s.qty)} ${esc(s.unit)}</td><td>${fmtFull(s.serverAt||s.createdAt||s.date)}</td><td>${esc(s.note)} ${btn('stock-detail','Załączniki',s.projectId,s.id)}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':blank('Brak przyjęć magazynowych.')}`}
  function pageDocs(){return section('Dokumentacja i zdjęcia','Zdjęcia, WZ, PDF i linki do dokumentów przy zamówieniach, transporcie i magazynie.')+`<div class="card"><h2>Dokumenty przypisane do etapu</h2><p>Otwórz zamówienie, transport albo przyjęcie magazynowe i kliknij <b>Dodaj zdjęcie / WZ</b>. Zdjęcia są pomniejszane przed zapisem. Małe PDF do 120 KB mogą być dodane bezpośrednio.</p><p>Większe dokumenty można podłączyć jako link, np. do odpowiednio zabezpieczonego Google Drive. Udostępnienie linku zależy od praw dostępu na Dysku.</p><p class="helper">To funkcja pilotażowa. Oryginały WZ przechowuj w firmowym archiwum. Firestore nie zastępuje magazynu dokumentów.</p></div>`}
  function pageSuppliers(){
    if(!(buyer||boss))return blank('Brak dostępu do bazy dostawców.');
    const activeSup=suppliers.filter(x=>x.active!==false);
    return section('Baza dostawców','Wspólna kartoteka firm — wybierz dostawcę przy zamawianiu materiałów.',buyer?btn('new-supplier','＋ Nowy dostawca','','','primary'):'')+
      `<div class="card"><div class="v7-bar"><span class="meta">Firmy: ${suppliers.length} · aktywne: ${activeSup.length}</span></div><div class="v7-table-scroll"><table><thead><tr><th>Dostawca</th><th>NIP</th><th>Branża</th><th>Kontakt</th><th>Status</th><th></th></tr></thead><tbody>${suppliers.map(v=>`<tr><td><strong>${esc(v.name)}</strong><div class="meta">${esc(v.city||'')}${v.contactPerson?' · '+esc(v.contactPerson):''}</div></td><td>${esc(v.nip||'—')}</td><td>${esc(branchName(v.branch))}</td><td>${v.phone?`<div>${esc(v.phone)}</div>`:''}${v.email?`<div>${esc(v.email)}</div>`:''}</td><td>${v.active===false?'Nieaktywny':'Aktywny'}</td><td>${buyer?btn('supplier-detail','Edytuj','',''+v.id):''}</td></tr>`).join('')}</tbody></table></div>${suppliers.length?'':blank('Brak firm. Dodaj pierwszego dostawcę.')}</div>`;
  }
  function supplierOptions(selectedId='',includeNew=true){
    return `<option value="">Wybierz dostawcę</option>`+suppliers.filter(v=>v.active!==false).map(v=>`<option value="${esc(v.id)}" ${selectedId===v.id?'selected':''}>${esc(v.name)}${v.nip?' · NIP '+esc(v.nip):''}</option>`).join('')+(includeNew?'<option value="__new__">＋ Dodaj nową firmę</option>':'');
  }
  const nipClean=(value)=>String(value||'').replace(/[^0-9]/g,'');
  function nipValid(value){if(!value)return true;if(!/^\d{10}$/.test(value))return false;const w=[6,5,7,2,3,4,5,6,7];const sum=w.reduce((acc,x,i)=>acc+x*Number(value[i]),0)%11;return sum!==10&&sum===Number(value[9]);}
  function supplierData(f){
    const name=String(f.name||f.newSupplierName||'').trim().slice(0,160);
    const nip=nipClean(f.nip||f.newSupplierNip);
    const branch=String(f.branch||f.newSupplierBranch||'budowlana');
    if(name.length<2)throw Error('Podaj nazwę firmy (minimum 2 znaki).');
    if(!nipValid(nip))throw Error('Podany NIP jest nieprawidłowy. Sprawdź 10 cyfr i sumę kontrolną.');
    if(!['sanitarna','budowlana','elektryczna'].includes(branch))throw Error('Wybierz branżę dostawcy.');
    return {name,nip,branch,city:String(f.city||f.newSupplierCity||'').trim().slice(0,120),phone:String(f.phone||f.newSupplierPhone||'').trim().slice(0,40),email:String(f.email||f.newSupplierEmail||'').trim().slice(0,140),contactPerson:String(f.contactPerson||'').trim().slice(0,100),notes:String(f.notes||'').trim().slice(0,800)};
  }
  const optionalF=(...args)=>f(...args).replace(/ required(?=[ >])/,'');
  function supplierForm(id=''){
    if(!buyer)return;
    const v=suppliers.find(x=>x.id===id)||{};
    modal(id?'Dane dostawcy':'Dodaj firmę do bazy',`<form id="supplier-form" class="form-grid" data-id="${esc(id)}">${f('name','Nazwa firmy',v.name||'','text','maxlength="160"')}${optionalF('nip','NIP (opcjonalnie)',v.nip||'','text','maxlength="18" pattern="[0-9 -]*"')}<div class="field"><label>Branża</label><select name="branch">${opt(branches.slice(1),v.branch||'budowlana')}</select></div>${optionalF('city','Miasto / miejscowość',v.city||'','text','maxlength="120"')}${optionalF('contactPerson','Osoba kontaktowa',v.contactPerson||'','text','maxlength="100"')}${optionalF('phone','Telefon',v.phone||'','tel','maxlength="40"')}${optionalF('email','E-mail',v.email||'','email','maxlength="140"')}<div class="field full"><label>Uwagi / warunki współpracy</label><textarea name="notes" maxlength="800">${esc(v.notes||'')}</textarea></div>${id&&admin?`<div class="field"><label>Aktywność</label><select name="active">${opt([['true','Aktywny'],['false','Nieaktywny']],String(v.active!==false))}</select></div>`:''}<div class="field full"><button class="btn primary" type="submit">${id?'Zapisz zmiany':'Dodaj dostawcę'}</button></div></form><p class="helper">Wersja testowa. Nie wpisuj jeszcze poufnych warunków handlowych.</p>`);
  }
  function purchaseForm(pid,compoundId){
    if(!buyer)return;
    const [oid,iid]=compoundId.split('|'),o=order(pid,oid),i=o?.items.find(x=>x.id===iid);
    if(!i||i.status!=='zaakceptowane')throw Error('Pozycja musi mieć status „Zaakceptowane”.');
    const defaultId=suppliers.find(v=>v.active!==false)?.id||'__new__';
    modal('Zakup materiału u dostawcy',`<p><b>${esc(i.name)}</b> — ${n(i.qty)} ${esc(i.unit)} · ${esc(prName(pid))}</p><form id="purchase-form" data-pid="${esc(pid)}" data-id="${esc(compoundId)}" class="form-grid"><div class="field full"><label>Firma dostawcy *</label><select name="supplierId" id="tp-purchase-supplier" required>${supplierOptions(defaultId)}</select></div><div id="tp-purchase-new" class="field full"><div class="card"><h3>Nowy dostawca</h3>${optionalF('newSupplierName','Nazwa firmy','','text','maxlength="160"')}${optionalF('newSupplierNip','NIP (opcjonalnie)','','text','maxlength="18"')}${optionalF('newSupplierCity','Miejscowość','','text','maxlength="120"')}${optionalF('newSupplierPhone','Telefon','','tel','maxlength="40"')}${optionalF('newSupplierEmail','E-mail','','email','maxlength="140"')}<div class="field"><label>Branża</label><select name="newSupplierBranch">${opt(branches.slice(1),branchOf(i))}</select></div></div></div>${optionalF('purchaseReference','Numer zamówienia u dostawcy (opcjonalnie)','','text','maxlength="100"')}${optionalF('expectedSupplierDate','Termin deklarowany przez dostawcę','','date')}${optionalF('unitPriceNet','Cena jednostkowa netto (opcjonalnie)','','number','min="0" step="0.01"')}<div class="field full"><button type="submit" class="btn primary">Oznacz jako zamówione u dostawcy</button></div></form>`);
    const select=$('tp-purchase-supplier');select.value=defaultId;const box=$('tp-purchase-new');if(box)box.hidden=defaultId!=='__new__';
  }

  function pageUsers(){if(!admin)return blank('Tylko administrator zarządza profilami.');return section('Konta i uprawnienia','Najpierw utwórz konto w Firebase Authentication → Users, potem dodaj jego UID tutaj.',btn('new-user','＋ Dodaj profil użytkownika','','','primary'))+`<div class="card"><div class="v7-list">${personnel.map(u=>`<div class="v7-flex"><div><b>${esc(u.name||u.uid)}</b><div class="meta">${esc(u.uid)} · ${esc(labels[u.role]||u.role)} · ${u.active?'Aktywny':'Nieaktywny'}</div></div>${btn('user-detail','Edytuj profil','',u.uid)}</div>`).join('')||blank('Nie ma jeszcze profili')}</div></div>`}
  function pageSettings(){return section('Ustawienia i eksport','Zachowaj kopię testowych danych i monitoruj limity darmowego planu.')+`<div class="grid2"><div class="card"><h2>Eksport danych</h2><p>Możesz pobrać kopię bieżących danych, do których masz dostęp. Plik JSON pozostanie na Twoim urządzeniu.</p>${btn('export','Pobierz eksport JSON','','','primary')}</div><div class="card"><h2>Stan wdrożenia</h2><p class="small">Wersja 0.7 używa Firestore dla budów, materiałów, zamówień, zatwierdzeń, magazynu i transportów. Nie importuje historii z localStorage.</p><p class="small">Brak systemowych powiadomień push, wgrywania zdjęć i plików WZ, rozliczeń finansowych oraz automatycznych kopii zapasowych.</p></div></div>`}

  function projectChoice(){return `<div class="field full"><label>Budowa</label><select name="projectId" id="f-project" required>${pick(projects[0]?.id,false)}</select></div>`}
  function projectForm(){modal('Nowa budowa',`<form id="new-project-form" class="form-grid">${f('name','Nazwa budowy','','text','maxlength="120"')}${f('address','Adres / lokalizacja','','text','maxlength="200"')}<div class="field full"><p class="helper">Po utworzeniu budowy w sekcji „Kierownicy i zastępstwa” przypiszesz kilka osób do różnych branż.</p><button class="btn primary" type="submit">Utwórz budowę</button></div></form>`)}
  function assignForm(pid){
    if(!admin)return;
    const p=mineProject(pid);if(!p)return;
    const rows=projectAssignments(p),employees=activePeople().filter(x=>x.role==='kierownik');
    modal('Kierownicy i zastępstwa',`<p class="small">Budowa: <b>${esc(p.name)}</b>. Możesz przypisać kilku kierowników do różnych branż i wskazać zastępców. Konto musi mieć aktywny profil „Kierownik budowy”.</p>
      <div class="v7-list tp-assignment-list">${rows.map((a,i)=>{const u=personnel.find(x=>x.uid===a.uid);return `<div class="v7-flex"><div><b>${esc(u?.name||a.uid)}</b><div class="meta">${esc(assignTypes[a.kind]||'Kierownik')} · ${esc(specialities[a.branch]||a.branch)}${a.fromDate||a.toDate?` · ${esc(a.fromDate||'od zaraz')} – ${esc(a.toDate||'bez końca')}`:''}${assignmentValid(a)?'':' · POZA TERMINEM'}</div></div>${btn('remove-manager','Usuń przypisanie',pid,String(i),'danger')}</div>`}).join('')||blank('Nie przypisano jeszcze kierowników.')}</div>
      <form id="manager-assignment-form" data-pid="${esc(pid)}" class="form-grid">
        <div class="field full"><label>Pracownik</label><select name="uid" required>${employees.map(u=>`<option value="${esc(u.uid)}">${esc(u.name||u.uid)}</option>`).join('')}</select></div>
        <div class="field"><label>Specjalizacja</label><select name="branch">${opt([['budowlana','Budowlana'],['sanitarna','Sanitarna'],['elektryczna','Elektryczna'],['wszystkie','Wszystkie branże']])}</select></div>
        <div class="field"><label>Typ przypisania</label><select name="kind">${opt([['glowny','Kierownik'],['zastepstwo','Zastępstwo']])}</select></div>
        <div class="field"><label>Od dnia (opcjonalnie)</label><input name="fromDate" type="date"></div>
        <div class="field"><label>Do dnia (opcjonalnie)</label><input name="toDate" type="date"></div>
        <div class="field full"><p class="warn-banner">Daty sterują wyświetlaniem aktywnych zastępstw i powiadomieniami. W tej wersji koniec daty nie odbiera automatycznie dostępu do danych Firebase. Po zastępstwie usuń przypisanie.</p><button class="btn primary" type="submit" ${employees.length?'':'disabled'}>Dodaj kierownika / zastępstwo</button></div>
      </form>`);
  }
  function projectBaselineForm(pid){if(!admin)return;const p=projects.find(x=>x.id===pid);if(!p)return;modal('Stan początkowy inwestycji',`<p>Budowa: <b>${esc(p.name)}</b></p><p class="helper">Szacowany ogólny poziom zaawansowania inwestycji jest informacyjny. NIE zmienia obliczonego zatowarowania. Aby uzupełnić zatowarowanie, użyj przycisku „Ustaw status / stan” przy konkretnych materiałach.</p><form id="project-baseline-form" data-pid="${esc(pid)}" class="form-grid">${f('baselineEstimatePct','Szacowane zaawansowanie całej inwestycji (%)',p.baselineEstimatePct??'','number','min="0" max="100" step="1"')}<div class="field full"><label>Uzasadnienie / data stanu początkowego</label><textarea name="reason" maxlength="800" required placeholder="Np. przegląd stanu robót na dzień wdrożenia"></textarea></div><div class="field full"><button type="submit" class="btn primary">Zapisz stan wstępny</button></div></form>`)}
  function manualMaterialForm(pid,id){if(!admin)return;const m=mat(pid,id);if(!m)return;const x=materialProgress(pid,m);modal('Uzgodnienie stanu materiału',`<p><b>${esc(m.name)}</b> · ${esc(prName(pid))}</p><p class="helper">Zapotrzebowanie: ${x.planned} ${esc(m.unit)} · późniejsze odbiory przez TaskPoint: ${x.delivered} ${esc(m.unit)}. Ręcznie potwierdzaj tylko stan wcześniejszy, aby nie liczyć podwójnie dostaw.</p><form id="manual-material-form" data-pid="${esc(pid)}" data-id="${esc(id)}" class="form-grid"><div class="field"><label>Status materiału</label><select name="manualStatus">${opt([['oczekuje','Oczekuje'],['realizowana','Realizowana'],['zrealizowana','Zrealizowana ręcznie'],['pominieta','Pominięta']],m.manualStatus||'oczekuje')}</select></div>${f('baselineDeliveredQty','Ilość będąca już na budowie przed wdrożeniem',m.baselineDeliveredQty??0,'number',`min="0" max="${Math.max(0,n(m.approvedQty))}" step="any"`)}<div class="field full"><label>Uzasadnienie / dowód (wymagane)</label><textarea name="reason" maxlength="900" required placeholder="Np. materiał odebrany przed wdrożeniem, protokół odbioru / stan magazynu z dnia ..."></textarea></div><div class="field full"><p class="helper">Pominięte pozycje nie wchodzą do mianownika zatowarowania. Dla statusu „Zrealizowana ręcznie” pełna zatwierdzona ilość musi być na budowie (razem z późniejszymi odbiorami). Operacja zostanie zapisana z autorem i datą.</p><button class="btn primary" type="submit">Zapisz korektę</button></div></form>${history(pid,'material',id)}`)}
  function bulkBaselineForm(pid){if(!admin)return;const p=projects.find(x=>x.id===pid);if(!p)return;const rows=bucket.get(pid)?.materials||[];const phases=[...new Set(rows.map(x=>String(x.phase||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pl'));modal('Wstępny stan — wiele materiałów',`<p><b>${esc(p.name)}</b> · ${rows.length} pozycji z przedmiaru</p><p class="warn-banner">Używaj tylko dla faktycznie potwierdzonych stanów. Masowa zmiana zostanie zapisana osobno dla każdej pozycji z informacją o administratorze i czasie.</p><form id="bulk-baseline-form" data-pid="${esc(pid)}" class="form-grid"><div class="field"><label>Branża</label><select name="branch">${opt(branches)}</select></div><div class="field"><label>Etap budowy</label><select name="phase">${opt([['','Wszystkie etapy'],...phases.map(x=>[x,x])])}</select></div><div class="field"><label>Stan wybranych pozycji</label><select name="status">${opt([['zrealizowana','Na budowie — pełna ilość'],['pominieta','Pominięte — poza zakresem']])}</select></div><div class="field full"><label>Uzasadnienie (wymagane)</label><textarea name="reason" maxlength="900" required placeholder="Np. inwentaryzacja magazynu placu budowy i potwierdzone odbiory na dzień ..."></textarea></div><div class="field full"><label>Potwierdź wpisując dokładnie POTWIERDZAM</label><input name="confirm" autocomplete="off" required placeholder="POTWIERDZAM"></div><div class="field full"><p class="helper">Operacja uwzględni wyłącznie pozycje z dodatnią ilością zatwierdzoną, bez poprzednich ręcznych rozliczeń. Pozycje RFI i z niewyjaśnionymi ilościami zostaną pominięte. Nie usuwa zamówień ani dostaw.</p><button class="btn primary" type="submit">Uzupełnij stan według filtra</button></div></form>`)}
  function materialsForm(){if(!requireProject())return;modal('Import materiałów — Excel / przedmiar',`<form id="import-form" class="form-grid">${projectChoice()}<div class="field full"><label>Plik Excel XLSX / XLS / CSV</label><input type="file" id="excel-file" accept=".xlsx,.xls,.csv" style="width:100%"><p class="helper">Arkusz 01_ZAPOTRZEBOWANIE: dopasowanie po nagłówkach, ID i branży. Stan z Excela NIE jest automatycznie uznawany za fizyczną dostawę. Pomijamy usługi/odpady, a rozbieżności RFI pozostają do weryfikacji.</p></div><div class="field full"><div id="excel-preview" role="status" aria-live="polite"></div></div>${admin?`<div class="field full"><label class="tp-checkline"><input type="checkbox" name="confirmBaseline" value="yes"> <span><strong>Potwierdzam stan historyczny</strong>: pozycje „Zrealizowany” z określoną ilością są rzeczywiście dostępne na budowie; „Pominięty” nie wchodzi do zatowarowania. Bez zaznaczenia importujemy status tylko informacyjnie.</span></label></div><div class="field full"><label class="tp-checkline"><input type="checkbox" name="updateExisting" value="yes"> <span>Zaktualizuj również istniejące pozycje o tych samych ID (tylko bez wcześniejszych odbiorów, korekt ręcznych i przy tej samej ilości zatwierdzonej). Wymaga potwierdzenia stanu historycznego.</span></label></div>`:''}<div class="field full"><label>Alternatywa — wklej wiersze (nazwa; ilość; jednostka; źródło)</label><textarea name="rows" rows="4" placeholder="Rura PVC 110; 100; mb; Przedmiar"></textarea></div><div class="field full"><button class="btn primary" type="submit">Sprawdź i importuj bez dublowania pozycji</button></div></form>`) }

  function normalizedHeader(text){return String(text||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ')}
  function numericExcel(value){if(value===null||value===undefined||value==='')return NaN;const v=Number(String(value).trim().replace(/\s/g,'').replace(',','.'));return Number.isFinite(v)?v:NaN}
  function sheetStatus(raw){const s=normalizedHeader(raw);if(s.startsWith('zrealizowan'))return 'zrealizowany';if(s.startsWith('czesciowo zrealizowan'))return 'czesciowo';if(s.startsWith('w realizacji')||s.startsWith('realizowan'))return 'w realizacji';if(s.startsWith('do zamowienia'))return 'do zamowienia';if(s.startsWith('pominiet'))return 'pominiety';return s?'nieznany':'brak'}
  function parseImportRows(rows){
    if(!rows.length)throw Error('Plik nie zawiera wierszy.');
    const heads=rows[0].map(normalizedHeader);
    const col=(prefix)=>heads.findIndex(h=>h===normalizedHeader(prefix)||h.startsWith(normalizedHeader(prefix)+' '));
    const fields={id:col('ID'),name:col('Materiał / urządzenie'),phase:col('Etap'),discipline:col('Branża'),spec:col('Specyfikacja / parametr'),base:col('Ilość bazowa'),qty:col('Ilość do zamówienia'),unit:col('J.m.'),status:col('Status'),delivered:col('Ilość dostarczona'),rfi:col('Status ilości/zgodności'),priority:col('Priorytet'),notes:col('Uwagi / RFI'),sourceDoc:col('Źródło')};
    if(fields.id<0||fields.name<0||fields.qty<0||fields.unit<0)throw Error('Brak nagłówków ID, Materiał / urządzenie, Ilość do zamówienia lub J.m. w arkuszu.');
    if(fields.status<0||fields.delivered<0)throw Error('Nie znaleziono kolumn Status i Ilość dostarczona. Sprawdź, czy wybierasz poprawiony plik.');
    const pick=(r,key)=>fields[key]>=0?r[fields[key]]:undefined;
    const items=[],stats={zrealizowany:0,'w realizacji':0,'do zamowienia':0,pominiety:0,czesciowo:0,nieznany:0,brak:0,services:0,missing:0,suspect:0};
    const ids=new Set();
    for(const r of rows.slice(1)){
      const id=String(pick(r,'id')||'').trim(),name=String(pick(r,'name')||'').trim();if(!id||!name)continue;
      if(ids.has(id))throw Error('Powtarza się ID materiału w Excelu: '+id);ids.add(id);
      const rfi=String(pick(r,'rfi')||'');
      if(/USŁUGA\s*\/\s*ODPAD/i.test(rfi)){stats.services++;continue}
      const st=sheetStatus(pick(r,'status')),base=numericExcel(pick(r,'base')),
        qty=numericExcel(pick(r,'qty')),plan=Number.isFinite(qty)&&qty>0?qty:Number.isFinite(base)&&base>0?base:0,
        amount=numericExcel(pick(r,'delivered'));
      stats[st]=(stats[st]||0)+1;
      if(!(plan>0))stats.missing++;
      // W pliku historycznym kolumna "Ilość dostarczona" ma często pełny plan
      // również dla materiałów jeszcze niezrealizowanych. NIGDY nie uznajemy
      // jej wówczas automatycznie za potwierdzony odbiór.
      if(Number.isFinite(amount)&&amount>0 && st!=='zrealizowany' && st!=='czesciowo')stats.suspect++;
      items.push({
        externalId:id.slice(0,70),name:name.slice(0,180),baseQty:plan,approvedQty:plan,
        unit:String(pick(r,'unit')||'szt.').trim().slice(0,20),source:'Przedmiar',
        phase:String(pick(r,'phase')||'').slice(0,120),discipline:String(pick(r,'discipline')||'').slice(0,80),
        branch:branchOf({discipline:String(pick(r,'discipline')||'')}),
        spec:String(pick(r,'spec')||'').slice(0,350),rfiStatus:rfi.slice(0,150),
        priority:String(pick(r,'priority')||'NORMALNY').slice(0,20),
        rfiNotes:String(pick(r,'notes')||'').slice(0,500),sourceDoc:String(pick(r,'sourceDoc')||'').slice(0,250),
        excelStatus:st,excelReportedQty:Number.isFinite(amount)&&amount>=0?amount:null,
        excelQtyToVerify:!(plan>0)||(Number.isFinite(amount)&&amount>0&&st!=='zrealizowany'&&st!=='czesciowo')
      });
    }
    return {items,stats,hasStatus:true};
  }
  async function readMaterialWorkbook(file){
    const xlsx=window.XLSX;if(!xlsx)throw Error('Moduł Excel nie został załadowany. Sprawdź połączenie z internetem.');
    if(file.size>8*1024*1024)throw Error('Plik jest większy niż 8 MB.');
    const book=xlsx.read(await file.arrayBuffer(),{type:'array'});
    const sheet=book.Sheets[book.SheetNames.includes('01_ZAPOTRZEBOWANIE')?'01_ZAPOTRZEBOWANIE':book.SheetNames[0]];
    return parseImportRows(xlsx.utils.sheet_to_json(sheet,{header:1,defval:''}));
  }
  function importPreview(result){const {items,stats}=result;return `<div class="card" style="padding:12px"><strong>Podgląd importu: ${items.length} pozycji materiałowych</strong><p class="helper">Zrealizowany: ${stats.zrealizowany||0} · W realizacji: ${stats['w realizacji']||0} · Do zamówienia: ${stats['do zamowienia']||0} · Pominięty: ${stats.pominiety||0} · Inny status: ${(stats.nieznany||0)+(stats.czesciowo||0)+(stats.brak||0)}</p><p class="helper">Wyłączone usługi/odpady: ${stats.services}. Brak ilości: ${stats.missing}. Potencjalnie błędne wartości „Ilość dostarczona”: ${stats.suspect}.</p><p class="helper"><strong>Uwaga:</strong> dla „W realizacji” i „Do zamówienia” nie wliczamy deklarowanej ilości dostarczonej do zatowarowania. Przy pozycji z nieustaloną ilością nie przypiszemy 100% zatowarowania.</p></div>`}
  function orderRows(pid){return (bucket.get(pid)?.materials||[]).map(m=>[m.id,`${m.name} · limit ${m.approvedQty} ${m.unit}`])}
  function orderRow(pid){const items=orderRows(pid);return `<div class="v7-form-row order-row tp-order-row"><div class="wide"><label>Materiał — sposób dodania</label><select name="entryMode" class="tp-entry-mode">${opt([['list','Wybierz z przedmiaru'],['manual','Wpisz ręcznie']])}</select></div><div class="wide tp-list-material"><label>Materiał z przedmiaru</label><select name="materialId">${opt(items)}</select></div><div class="wide tp-manual-material" hidden><label>Nazwa wpisana przez kierownika</label><input name="typedName" maxlength="180" placeholder="Np. rura PCV fi 110"><div class="tp-hints helper"></div><label>To może być istniejący materiał — powiąż, jeśli zgodny</label><select name="linkedMaterialId"><option value="">Brak pewnego dopasowania / nowy materiał</option>${opt(items)}</select><p class="helper">Sama zbieżność nazwy nie potwierdza zgodności technicznej. Jeśli nie masz pewności, wybierz nowy materiał do akceptacji.</p></div><div><label>Rodzaj pozycji</label><select name="intent" class="tp-intent">${opt([['standard','Zwykłe zamówienie'],['qty','Zmiana ilości z przedmiaru'],['new','Dodatkowy materiał / zmiana parametrów']])}</select></div><div><label>Branża</label><select name="branch">${opt(branches.slice(1))}</select></div><div><label>Ilość do zamówienia / wniosek</label><input type="number" name="qty" min="0.001" step="any" required></div><div><label>Termin potrzebnej dostawy</label><input type="date" name="due" min="${today()}" required></div><div><label>Priorytet</label><select name="priority">${opt([['niski','Niski'],['standard','Standardowy'],['wysoki','Wysoki'],['krytyczny','Krytyczny']],'standard')}</select></div><div class="wide"><label>Miejsce dostawy</label><input name="delivery" value="Bezpośrednio na budowę" maxlength="200" required></div><div class="wide tp-change-reason" hidden><label>Uzasadnienie zmiany (wymagane)</label><textarea name="reason" maxlength="1000" placeholder="Dlaczego zmiana jest potrzebna? W razie zmiany ilości podaj docelową łączną ilość z przedmiaru."></textarea></div><button class="btn danger remove" type="button" data-action="remove-row">Usuń</button></div>`}
  function orderForm(){if(!requireProject())return;const pid=projects[0].id;
    modal('Nowe zapotrzebowanie + zmiany',`<form id="order-form" class="form-grid">${projectChoice()}<div class="field full"><label>Uwagi do całego zamówienia</label><textarea name="notes" maxlength="900"></textarea></div><div class="field full"><div class="v7-flex"><h3>Pozycje</h3><button type="button" class="btn" data-action="add-row">＋ Materiał</button></div><p class="helper">Każda pozycja może być standardowa albo zgłoszona jako zmiana. Zmiany czekają na zaopatrzenie i zarząd — nie są automatycznie kupowane.</p><div id="order-rows">${orderRow(pid)}</div></div><div class="field full"><button class="btn primary" type="submit">Zapisz zapotrzebowanie / zgłoszenia zmian</button></div></form>`);refreshOrderRows()}
  function refreshOrderRows(){const pid=$('f-project')?.value;for(const row of document.querySelectorAll('.order-row')){const manual=row.querySelector('[name=entryMode]')?.value==='manual';row.querySelector('.tp-list-material').hidden=manual;row.querySelector('.tp-manual-material').hidden=!manual;const intent=row.querySelector('[name=intent]')?.value;row.querySelector('.tp-change-reason').hidden=intent==='standard';const qtyLabel=row.querySelector('[name=qty]')?.closest('div')?.querySelector('label');if(qtyLabel)qtyLabel.textContent=intent==='qty'?'Docelowa CAŁKOWITA ilość po zmianie':'Ilość materiału';const listId=row.querySelector('[name=materialId]')?.value;const linkId=row.querySelector('[name=linkedMaterialId]')?.value;const m=mat(pid,manual?linkId:listId);if(m&&(!manual||linkId)){const branch=row.querySelector('[name=branch]');if(branch&&!row.dataset.branchManual)branch.value=branchOf(m)}}}
  function changeForm(){if(!requireProject())return;const pid=projects[0].id;modal('Zmiana materiałowa',`<form class="form-grid" id="change-form">${projectChoice()}<div class="field"><label>Rodzaj zmiany</label><select name="kind" id="change-kind">${opt([['qty','Zmiana ilości'],['new','Nowy materiał']])}</select></div><div class="field"><label>Materiał</label><select name="materialId" id="change-material">${opt(orderRows(pid))}</select></div><div class="field" id="new-material-wrap" hidden><label>Nazwa dodatkowego materiału</label><input name="newName" maxlength="160"></div>${f('newQty','Wnioskowana ilość','','number','min="0.001" step="any"')}<div class="field"><label>Jednostka nowej pozycji</label><input name="unit" value="szt." maxlength="20"></div><div class="field"><label>Branża nowej pozycji</label><select name="branch">${opt(branches.slice(1))}</select></div><div class="field full"><label>Uzasadnienie zmiany</label><textarea name="reason" maxlength="1200" required></textarea></div><div class="field full"><button class="btn primary" type="submit">Wyślij do zaopatrzenia</button></div></form>`)}
  function availableOrderItems(pid){return (bucket.get(pid)?.orders||[]).flatMap(o=>o.items.map(i=>{
    const used=(bucket.get(pid)?.shipments||[]).filter(s=>s.orderItemId===i.id).reduce((total,s)=>total+(s.status==='czesciowy'?n(s.receivedQty):n(s.qty)),0);
    return {id:i.id,orderId:o.id,materialId:i.materialId,material:i.name,unit:i.unit,status:i.status,available:n(i.warehouseReceivedQty||0)-used,orderRef:o.reference||o.id};
  })).filter(i=>i.available>0 && ['magazyn_przyjete','magazyn_czesciowo'].includes(i.status))}
  function shipmentForm(){if(!requireProject())return;const pid=projects[0].id;if(!availableOrderItems(pid).length){toast('Magazyn musi najpierw potwierdzić przyjęcie materiału.');return}modal('Zlecenie transportu',`<form id="transport-form" class="form-grid">${projectChoice()}<div class="field full"><label>Pozycja z zamówienia</label><select id="transport-item" name="orderItemId">${opt(availableOrderItems(pid).map(i=>[i.id,`${i.material} · ${i.available} ${i.unit} dostępne · ${i.orderRef}`]))}</select></div>${f('qty','Ilość do wywozu','','number','step="any" min="0.001"')}${f('driver','Kierowca','','text','maxlength="90"')}${f('from','Miejsce załadunku','Magazyn główny','','maxlength="200"')}${f('destination','Miejsce dostawy',prName(pid),'text','maxlength="200"')}${f('plannedDate','Data wywozu',today(),'date')}${f('deliveryDate','Planowana data dostawy',today(),'date')}<div class="field full"><label>Uwagi do kierowcy</label><textarea name="notes" maxlength="800"></textarea></div><div class="field full"><button class="btn primary" type="submit">Zapisz transport</button></div></form>`)}
  function stockForm(){if(!requireProject())return;modal('Przyjęcie magazynowe',`<form id="stock-form" class="form-grid">${projectChoice()}${f('material','Nazwa materiału','','text','maxlength="160"')}${f('qty','Ilość','','number','min="0.001" step="any"')}${f('unit','Jednostka','szt.','','maxlength="20"')}${f('date','Data przyjęcia',today(),'date')}<div class="field full"><label>Uwagi</label><textarea name="note" maxlength="800"></textarea></div><div class="field full"><button class="btn primary" type="submit">Zapisz przyjęcie</button></div></form>`)}
  function history(pid,targetType,targetId){const events=(bucket.get(pid)?.events||[]).filter(e=>e.targetType===targetType&&e.targetId===targetId).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));return `<div class="tp-history"><h3>Historia czynności</h3>${events.map(e=>`<div class="tp-event"><span>${esc(e.text||e.kind)}</span><small>${esc(e.actor||'Pracownik')} · ${fmtFull(e.serverAt||e.createdAt)}</small></div>`).join('')||'<p class="helper">Historia pojawi się po pierwszym zdarzeniu.</p>'}</div>`}
  function comments(pid,targetType,targetId){const all=(bucket.get(pid)?.comments||[]).filter(x=>x.targetType===targetType&&x.targetId===targetId).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    const people=activePeople().filter(p=>p.uid!==user.uid&&(p.role!=='kierownik'||(mineProject(pid)?.memberUids||[]).includes(p.uid)));
    return `<div class="comments"><h3>Komentarze</h3>${all.map(c=>`<div class="comment">${esc(c.text)}<small>${esc(c.author)} · ${fmtFull(c.serverAt||c.createdAt)}</small></div>`).join('')||'<p class="helper">Brak komentarzy.</p>'}<form id="comment-form" data-pid="${esc(pid)}" data-target="${esc(targetType)}" data-id="${esc(targetId)}"><div class="field"><label>Nowy komentarz (możesz wpisać @Magazyn, @Kierownik itd.)</label><textarea name="text" maxlength="1500" required placeholder="Np. @Magazyn Czy dostawa może przyjechać wcześniej?"></textarea></div><div class="field"><label>Oznacz konkretną osobę @</label><select name="mentionUid"><option value="">Bez dodatkowego oznaczenia</option>${opt(people.map(p=>[p.uid,p.name||p.uid+' — '+(labels[p.role]||p.role)]))}</select></div><p class="helper">Komentarz zarządu automatycznie powiadomi kierownika budowy i zaopatrzenie. Oznaczeni otrzymują osobne powiadomienie.</p><button class="btn primary" type="submit">Dodaj komentarz i powiadom</button></form></div>`}
  function orderDetail(pid,id){const o=order(pid,id);if(!o)return;modal('Zamówienie '+(o.reference||id),`<p class="small">${esc(prName(pid))} · ${esc(o.createdBy)} · ${fmtFull(o.serverAt||o.createdAt)}</p><p>${esc(o.notes||'')}</p><div class="v7-table-scroll"><table><thead><tr><th>Materiał</th><th>Ilość</th><th>Termin</th><th>Priorytet</th><th>Dostawa</th><th>Status / działanie</th></tr></thead><tbody>${o.items.map(i=>`<tr><td><strong>${esc(i.name)}</strong><div class="meta">${branchName(branchOf(i))}${i.requestedName?" · Wpisano: "+esc(i.requestedName):""}${i.supplierName?" · Dostawca: "+esc(i.supplierName):""}${i.purchaseReference?" · Zamówienie: "+esc(i.purchaseReference):""}${i.expectedSupplierDate?" · Termin dostawcy: "+fmt(i.expectedSupplierDate):""}</div><p>${btn('attachments-open','📷 WZ / zdjęcie',pid,`orderItem|${o.id}|${i.id}`)}</p></td><td>${n(i.qty)} ${esc(i.unit)}</td><td>${fmt(i.due)}</td><td>${esc(i.priority)}</td><td>${esc(i.delivery)}</td><td>${vstatus(i.status||'zgloszone')}<div class="tp-actions">${buyer&&i.status==='zgloszone'?btn('accept-order','Akceptuj',pid,o.id+'|'+i.id,'primary'):''}${buyer&&i.status==='zaakceptowane'?btn('purchase-open','Zamówione u dostawcy',pid,o.id+'|'+i.id,'primary'):''}${warehouse&&['zamowione','magazyn_czesciowo'].includes(i.status)?btn('warehouse-receive','Przyjęcie do magazynu',pid,o.id+'|'+i.id,'primary'):''}</div></td></tr>`).join('')}</tbody></table></div>${comments(pid,'order',id)}${history(pid,'order',id)}`)}
  function changeDetail(pid,id){const c=change(pid,id);if(!c)return;modal('Zmiana materiałowa',`<p><strong>${esc(c.kind==='new'?c.newName:(mat(pid,c.materialId)?.name||'Materiał'))}</strong> · ${esc(prName(pid))}</p>${vstatus(c.status)}<p>Wnioskowano: <b>${n(c.newQty)} ${esc(c.unit)}</b>; poprzednio: ${n(c.oldQty)}</p><p>${esc(c.reason)}</p>${c.approvedBy?`<p class="small">Decyzja: ${esc(c.approvedBy)} · ${fmtFull(c.decidedServerAt||c.decidedAt)}</p>`:''}${btn('attachments-open','📷 Zdjęcia / dokumenty',pid,`change|${id}`)}${comments(pid,'change',id)}${history(pid,'change',id)}`)}
  function shipmentDetail(pid,id){const s=shipment(pid,id);if(!s)return;modal('Transport materiałów',`<p><b>${esc(s.material)} — ${n(s.qty)} ${esc(s.unit)}</b></p>${vstatus(s.status)}<p class="small">Kierowca: ${esc(s.driver)}<br>Załadunek: ${esc(s.from)}<br>Dostawa: ${esc(s.destination)}<br>Wywóz: ${fmt(s.plannedDate)}<br>Termin dostawy: ${fmt(s.deliveryDate)}<br>${s.dispatchedAt?'Wydanie: '+fmtFull(s.dispatchedServerAt||s.dispatchedAt)+'<br>':''}${s.arrivedAt?'Przyjazd: '+fmtFull(s.arrivedServerAt||s.arrivedAt)+'<br>':''}${s.receivedAt?'Odbiór: '+fmtFull(s.receivedServerAt||s.receivedAt):''}</p><p>${esc(s.notes||'')}</p>${s.receivedAt?`<p><b>Odebrano: ${n(s.receivedQty??s.qty)} ${esc(s.unit)}</b> · ${esc(s.discrepancy||'')}</p>`:''}${manager&&s.status==='wydany'?btn('arrive','Potwierdź przyjazd transportu',pid,id,'primary'):''}${manager&&s.status==='dotarl'?btn('receive-form','Odbiór i ilość faktyczna',pid,id,'green'):''}<div style="margin-top:15px">${btn('attachments-open','📷 WZ / załadunek / składowanie',pid,`transport|${id}`)}</div>${comments(pid,'transport',id)}${history(pid,'transport',id)}`)}
  function stockDetail(pid,id){const item=(bucket.get(pid)?.stock||[]).find(x=>x.id===id);if(!item)return;modal('Przyjęcie magazynowe',`<p><strong>${esc(item.material)}</strong> ${n(item.qty)} ${esc(item.unit)}</p><p>Data: ${fmtFull(item.serverAt||item.createdAt||item.date)}</p>${btn('attachments-open','📷 Zdjęcia przyjęcia / miejsce składowania',pid,'stock|'+id)}`)}
  function receiveForm(pid,id){const s=shipment(pid,id);if(!s)return;modal('Potwierdzenie odbioru na budowie',`<p>${esc(s.material)} · awizowano <b>${n(s.qty)} ${esc(s.unit)}</b></p><form id="receive-form" data-pid="${esc(pid)}" data-id="${esc(id)}" class="form-grid">${f('receivedQty','Faktycznie odebrana ilość',s.qty,'number',`min="0" max="${n(s.qty)}" step="any"`)}<div class="field full"><label>Uwagi, braki, uszkodzenia (wymagane dla dostawy częściowej)</label><textarea name="discrepancy" maxlength="800"></textarea></div><div class="field full"><button type="submit" class="btn primary">Potwierdź odbiór</button></div></form><p class="helper">Następnie możesz dodać zdjęcie miejsca składowania lub dokument WZ w szczegółach transportu.</p>`)}
  function receiveWarehouseForm(pid,ident){const [oid,iid]=ident.split('|');const o=order(pid,oid),i=o?.items.find(x=>x.id===iid);if(!i)return;const left=Math.max(0,n(i.qty)-n(i.warehouseReceivedQty));modal('Przyjęcie na magazyn',`<p><strong>${esc(i.name)}</strong> · pozostało ${left} ${esc(i.unit)} do przyjęcia</p><form id="warehouse-receive-form" class="form-grid" data-pid="${esc(pid)}" data-id="${esc(ident)}">${f('qty','Ilość przyjęta teraz',left,'number',`min="0.001" max="${left}" step="any"`)}<div class="field full"><label>Miejsce składowania</label><input name="location" maxlength="150" required placeholder="Regał 3 / hala A"></div><div class="field full"><button class="btn primary" type="submit">Potwierdź przyjęcie na stan</button></div></form>`)}
  function attachmentForm(pid,targetType,targetId){modal('Zdjęcie / WZ / dokument',`<p class="small">Budowa: ${esc(prName(pid))}. Każdy dokument otrzyma datę i godzinę oraz autora. Pliki testowe pozostają dostępne uprawnionym pracownikom tej budowy.</p><form id="attachment-form" data-pid="${esc(pid)}" data-target="${esc(targetType)}" data-id="${esc(targetId)}" class="form-grid"><div class="field full"><label>Etap / rodzaj dokumentu</label><select name="stage">${opt([['zamowienie','Zamówienie / oferta'],['wz','WZ / potwierdzenie dostawy'],['magazyn','Magazyn / przyjęcie'],['zaladunek','Załadunek'],['przyjazd','Przyjazd'],['budowa','Miejsce składowania na budowie'],['uszkodzenie','Braki / uszkodzenia']])}</select></div><div class="field full"><label>Dodaj zdjęcie, obraz lub mały PDF</label><input id="tp-attach-file" type="file" accept="image/*,application/pdf"></div><div class="field full"><label>Albo bezpieczny link do większego pliku w Drive</label><input name="link" type="url" placeholder="https://drive.google.com/..." maxlength="1200"></div><div class="field full"><label>Opis załącznika</label><input name="description" maxlength="240" placeholder="Np. WZ nr 15 lub miejsce składowania"></div><div class="field full"><button class="btn primary" type="submit">Zapisz załącznik</button></div></form><p class="helper">Zdjęcia zostaną automatycznie pomniejszone; PDF maks. 120 KB. Większe dokumenty dodawaj jako link. To nie jest pełne archiwum dokumentów.</p><div id="tp-attachments">Wczytywanie załączników…</div>`);loadAttachments(pid,targetType,targetId)}
  async function loadAttachments(pid,targetType,targetId){const node=$('tp-attachments');if(!node)return;try{const snapshot=await getDocs(sub(pid,'attachments'));if(!node.isConnected)return;const rows=snapshot.docs.map(d=>({id:d.id,...d.data()})).filter(a=>a.targetType===targetType&&a.targetId===targetId).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));node.innerHTML='<h3>Załączone pliki</h3>'+(rows.map(a=>`<div class="v7-flex tp-file"><div><strong>${esc(a.filename||'Link')}</strong><div class="meta">${esc(a.stage||'')} · ${fmtFull(a.serverAt||a.createdAt)} · ${esc(a.author||'')}<br>${esc(a.description||'')}</div></div>${a.kind==='link'?`<a class="btn" rel="noopener noreferrer" href="${esc(a.url)}" target="_blank">Otwórz link</a>`:`<button class="btn" data-action="open-file" data-pid="${esc(pid)}" data-id="${esc(a.id)}">Otwórz plik</button>`}</div>`).join('')||'<p class="helper">Nie dodano jeszcze dokumentów.</p>')}catch(e){node.textContent='Nie udało się wczytać załączników: '+(e.code||e.message)}}
  async function compressFile(file){if(file.type==='application/pdf'){if(file.size>120*1024)throw Error('PDF jest większy niż 120 KB. Dodaj link do dokumentu na Dysku Google.');return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=fail;r.readAsDataURL(file)})}
    if(!file.type.startsWith('image/'))throw Error('Możesz dodać zdjęcie albo PDF.');let image;try{image=await createImageBitmap(file)}catch{const url=URL.createObjectURL(file);try{image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url})}finally{URL.revokeObjectURL(url)}}const scale=Math.min(1,1250/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);if(typeof image.close==='function')image.close();let quality=.74,data=canvas.toDataURL('image/jpeg',quality);while(data.length>165000&&quality>.28){quality-=.10;data=canvas.toDataURL('image/jpeg',quality)}if(data.length>195000)throw Error('Zdjęcie jest za duże. Spróbuj użyć mniejszego zdjęcia.');return data}
  async function openFile(pid,id){const snap=await getDoc(entityDoc(pid,'attachments',id));if(!snap.exists())throw Error('Nie znaleziono załącznika.');const a=snap.data();if(a.kind!=='file'||!String(a.dataUrl||'').startsWith('data:'))throw Error('Nieprawidłowy plik');const link=document.createElement('a');link.href=a.dataUrl;link.download=a.filename||'dokument';link.target='_blank';document.body.append(link);link.click();link.remove()}

  function profileForm(){modal('Nowy profil pracownika',`<p class="small">Najpierw utwórz konto pracownika w Firebase Authentication → Users. UID musi być skopiowany dokładnie z tego konta.</p><form id="user-form" class="form-grid">${f('uid','UID z Firebase Authentication','','text','minlength="6" maxlength="128"')}${f('name','Imię i nazwisko / etykieta','','text','maxlength="100"')}<div class="field"><label>Rola</label><select name="role">${opt(Object.entries(labels))}</select></div><div class="field full"><button type="submit" class="btn primary">Utwórz profil</button></div></form>`)}
  function userDetail(uid){const p=personnel.find(x=>x.uid===uid);if(!p)return;modal('Edytuj profil',`<p class="small">UID: ${esc(uid)}</p><form id="user-edit-form" data-uid="${esc(uid)}" class="form-grid">${f('name','Imię i nazwisko',p.name||'','','maxlength="100"')}<div class="field"><label>Rola</label><select name="role">${opt(Object.entries(labels),p.role)}</select></div><div class="field"><label>Konto</label><select name="active">${opt([['true','Aktywne'],['false','Zablokowane']],String(p.active))}</select></div><div class="field full"><button class="btn primary" type="submit">Zapisz profil</button></div></form>`)}

  async function submitForm(form){const fdata=new FormData(form),f=Object.fromEntries(fdata.entries()),pid=f.projectId,nowAt=now();
    if(form.id==='supplier-form'){
      if(!buyer)throw Error('Tylko zaopatrzenie i administrator mogą edytować dostawców.');
      const data=supplierData(f),id=form.dataset.id;
      if(!id){
        if(data.nip&&suppliers.some(s=>s.nip===data.nip))throw Error('Firma o takim NIP jest już w bazie. Wybierz istniejącą kartotekę.');
        if(!data.nip&&suppliers.some(s=>cleanName(s.name)===cleanName(data.name)))throw Error('Firma o takiej nazwie jest już w bazie.');
        const ref=doc(collection(firestore,'suppliers'));
        await setDoc(ref,{...data,active:true,createdByUid:user.uid,createdAt:nowAt,serverAt:serverTimestamp()});
      }else{
        const old=suppliers.find(v=>v.id===id);if(!old)throw Error('Nie znaleziono dostawcy.');
        if(data.nip&&suppliers.some(v=>v.id!==id&&v.nip===data.nip))throw Error('NIP jest już przypisany do innej firmy.');
        const patch={...data,updatedAt:nowAt,updatedByUid:user.uid};if(admin&&f.active)patch.active=f.active==='true';
        await updateDoc(doc(firestore,'suppliers',id),patch);
      }
    }else if(form.id==='purchase-form'){
      if(!buyer)throw Error('Brak uprawnień do zakupów.');
      const [oid,iid]=form.dataset.id.split('|'),target=form.dataset.pid;
      const ref=entityDoc(target,'orders',oid),supplierId=f.supplierId;
      if(!supplierId)throw Error('Wybierz dostawcę lub dodaj nowego.');
      if(f.expectedSupplierDate&&!/^\d{4}-\d{2}-\d{2}$/.test(f.expectedSupplierDate))throw Error('Nieprawidłowa data dostawy.');
      const unitPrice=f.unitPriceNet===''?null:Number(f.unitPriceNet);
      if(unitPrice!==null&&(!Number.isFinite(unitPrice)||unitPrice<0))throw Error('Cena musi być nieujemna.');
      const newData=supplierId==='__new__'?supplierData(f):null;
      const chosen=supplierId==='__new__'?null:suppliers.find(v=>v.id===supplierId&&v.active!==false);
      if(!newData&&!chosen)throw Error('Wybierz aktywną firmę z bazy.');
      if(newData&&newData.nip&&suppliers.some(v=>v.nip===newData.nip))throw Error('Firma z takim NIP już istnieje. Wybierz ją z listy.');
      if(newData&&!newData.nip&&suppliers.some(v=>cleanName(v.name)===cleanName(newData.name)))throw Error('Firma o tej nazwie już istnieje.');
      const newRef=newData?doc(collection(firestore,'suppliers')):null;
      await runTransaction(firestore,async tx=>{
        const snap=await tx.get(ref);if(!snap.exists())throw Error('Nie znaleziono zamówienia.');
        const entry=snap.data().items.find(i=>i.id===iid);if(!entry||entry.status!=='zaakceptowane')throw Error('Pozycja jest już realizowana lub ma inny status.');
        const supplier={supplierId:newData?newRef.id:chosen.id,supplierName:newData?newData.name:chosen.name,supplierNip:newData?newData.nip:chosen.nip||'',purchaseReference:String(f.purchaseReference||'').trim().slice(0,100),expectedSupplierDate:f.expectedSupplierDate||'',unitPriceNet:unitPrice};
        if(newData)tx.set(newRef,{...newData,active:true,createdByUid:user.uid,createdAt:nowAt,serverAt:serverTimestamp()});
        const items=snap.data().items.map(i=>i.id===iid?{...i,...supplier,status:'zamowione',orderedAt:nowAt,orderedByUid:user.uid}:i);
        tx.update(ref,{items,updatedAt:nowAt,updatedByUid:user.uid});
      });
      try{await logAndNotify(target,'status','order',oid,`Zakup od firmy ${newData?.name||chosen?.name} · ${String(f.purchaseReference||'').trim().slice(0,60)}`,recipients(target,'transport',[],branchOf(order(target,oid)?.items.find(i=>i.id===iid)||{})))}catch(e){notifyFailure(e)}
    }else if(form.id==='project-baseline-form'){
      if(!admin)throw Error('Tylko administrator może ustawić stan początkowy.');const val=Number(f.baselineEstimatePct);if(!Number.isFinite(val)||val<0||val>100||!String(f.reason||'').trim())throw Error('Podaj procent 0–100 i uzasadnienie.');await updateDoc(pidDoc(form.dataset.pid),{baselineEstimatePct:val,baselineEstimateReason:String(f.reason).trim().slice(0,800),baselineEstimateByUid:user.uid,baselineEstimateAt:serverTimestamp(),updatedAt:nowAt});
    }else if(form.id==='bulk-baseline-form'){
      if(!admin)throw Error('Brak uprawnień.');if(String(f.confirm).trim()!=='POTWIERDZAM')throw Error('Wpisz POTWIERDZAM.');if(!String(f.reason||'').trim())throw Error('Podaj uzasadnienie.');
      const target=form.dataset.pid;const filtered=(bucket.get(target)?.materials||[]).filter(m=>(f.branch==='all'||branchOf(m)===f.branch)&&(!f.phase||String(m.phase||'')===f.phase)&&n(m.approvedQty)>0&&n(m.baselineDeliveredQty)===0&&!m.manualStatus&&!(m.rfiStatus&&/RFI|DO POTWIERDZENIA|ROZBIEŻN|KONFLIKT/i.test(m.rfiStatus)));
      if(!filtered.length)throw Error('Brak nowych pozycji do aktualizacji w wybranym zakresie.');
      if(!confirm(`Potwierdź zmianę ${filtered.length} pozycji materiałowych na budowie ${prName(target)}. Te dane wpłyną na procent zatowarowania. Kontynuować?`))return;
      for(let start=0;start<filtered.length;start+=18){const batch=writeBatch(firestore);for(const m of filtered.slice(start,start+18)){const manualQty=f.status==='zrealizowana'?Math.max(0,n(m.approvedQty)-receivedQty(target,m.id)):0;batch.update(entityDoc(target,'materials',m.id),{manualStatus:f.status,baselineDeliveredQty:manualQty,baselineReason:String(f.reason).trim().slice(0,900),baselineUpdatedByUid:user.uid,baselineUpdatedAt:serverTimestamp(),updatedAt:nowAt});const ev=doc(sub(target,'events'));batch.set(ev,{projectId:target,actorUid:user.uid,actor:profile.name||labels[role],kind:'status',targetType:'material',targetId:m.id,text:`Uzgodnienie stanu początkowego: ${f.status} (${manualQty} ${m.unit}). ${String(f.reason).slice(0,100)}`,createdAt:nowAt,serverAt:serverTimestamp()})}await batch.commit()}
      toast(`Zapisano ${filtered.length} pozycji stanu początkowego.`);
    }else if(form.id==='manual-material-form'){
      if(!admin)throw Error('Tylko administrator może ręcznie zatwierdzić stan materiałowy.');const mid=form.dataset.id,projectId=form.dataset.pid,m=mat(projectId,mid);if(!m)throw Error('Nie znaleziono materiału.');const qty=Number(f.baselineDeliveredQty),plan=n(m.approvedQty),delivered=receivedQty(projectId,mid),status=f.manualStatus;
      if(!['oczekuje','realizowana','zrealizowana','pominieta'].includes(status)||!Number.isFinite(qty)||qty<0||qty>plan||!String(f.reason||'').trim())throw Error('Nieprawidłowy stan, ilość lub brak uzasadnienia.');
      if(status==='pominieta'&&qty!==0)throw Error('Dla pozycji pominiętej wpisz ilość 0.');
      if(status==='zrealizowana'&&qty+delivered<plan-0.000001)throw Error('Nie można oznaczyć „Zrealizowana”, jeśli potwierdzona ilość jest niższa od planu. Wybierz „Realizowana” lub uzupełnij ilość.');
      if(qty+delivered>plan+0.000001)throw Error('Suma ręcznie potwierdzona + odebrana przekracza zatwierdzoną ilość. Sprawdź wpis, aby nie dublować odbiorów.');
      await updateDoc(entityDoc(projectId,'materials',mid),{manualStatus:status,baselineDeliveredQty:qty,baselineReason:String(f.reason).trim().slice(0,900),baselineUpdatedByUid:user.uid,baselineUpdatedAt:serverTimestamp(),updatedAt:nowAt});
      try{await logAndNotify(projectId,'status','material',mid,`Administrator: ${status}; stan początkowy ${qty} ${m.unit}. ${String(f.reason).slice(0,110)}`,recipients(projectId,'transport'))}catch(e){notifyFailure(e)}
    }else if(form.id==='new-project-form'){
      await addDoc(collection(firestore,'projects'),{name:f.name.trim(),address:f.address.trim(),managerLabel:'',memberUids:[],managerAssignments:[],createdByUid:user.uid,createdAt:nowAt});
    }else if(form.id==='manager-assignment-form'){
      if(!admin)throw Error('Tylko administrator przypisuje kierowników.');
      const worker=personnel.find(x=>x.uid===f.uid);
      if(!worker||worker.role!=='kierownik'||worker.active!==true)throw Error('Wybierz aktywnego kierownika z listy.');
      if(!['sanitarna','budowlana','elektryczna','wszystkie'].includes(f.branch)||!['glowny','zastepstwo'].includes(f.kind))throw Error('Nieprawidłowa branża albo rodzaj przypisania.');
      if(f.fromDate&&f.toDate&&f.fromDate>f.toDate)throw Error('Data końca zastępstwa jest wcześniejsza niż data początku.');
      const assignment={uid:f.uid,branch:f.branch,kind:f.kind,fromDate:f.fromDate||'',toDate:f.toDate||''};
      await runTransaction(firestore,async tx=>{
        const ref=pidDoc(form.dataset.pid),snap=await tx.get(ref);if(!snap.exists())throw Error('Nie znaleziono budowy.');
        const before=projectAssignments(snap.data());
        if(before.length>=35)throw Error('Maksymalnie 35 przypisań kierowników na budowę.');
        if(before.some(a=>a.uid===assignment.uid&&a.branch===assignment.branch&&a.kind===assignment.kind&&a.fromDate===assignment.fromDate&&a.toDate===assignment.toDate))throw Error('Takie przypisanie już istnieje.');
        const assignments=[...before,assignment];
        tx.update(ref,{managerAssignments:assignments,memberUids:[...new Set(assignments.map(a=>a.uid))],updatedAt:nowAt});
      });
    }else if(form.id==='import-form'){
      const file=$('excel-file')?.files?.[0];let items=[],stats=null;
      if(file){const result=await readMaterialWorkbook(file);items=result.items;stats=result.stats}
      else{
        for(const line of String(f.rows||'').trim().split(/\r?\n/).filter(Boolean)){
          const parts=line.split(line.includes('\t')?'\t':';').map(x=>x.trim());const q=numericExcel(parts[1]);
          if(!parts[0]||!(q>0)||!parts[2])throw Error('Błędny wiersz: '+line);
          items.push({name:parts[0].slice(0,180),baseQty:q,approvedQty:q,unit:parts[2].slice(0,20),source:(parts[3]||'Przedmiar').slice(0,50),branch:'budowlana',excelStatus:'brak'});
        }
      }
      if(!items.length)throw Error('Brak materiałów do importu.');
      if(items.length>600)throw Error('Maksymalnie 600 pozycji w jednym imporcie.');
      const confirmed=admin&&f.confirmBaseline==='yes',updateExisting=confirmed&&f.updateExisting==='yes';
      if(f.updateExisting==='yes'&&!confirmed)throw Error('Aktualizacja istniejących stanów wymaga potwierdzenia stanu historycznego.');
      // Przed zapisem importer wymaga świadomego zatwierdzenia raportu z pliku.
      if(file){const msg=`Excel: ${items.length} pozycji, ${stats.services} usług/odpadów wyłączonych, ${stats.missing} brakujących ilości oraz ${stats.suspect} podejrzanych wartości w kolumnie dostarczonej. Stan historyczny potwierdzony: ${confirmed?'TAK':'NIE'}. Kontynuować import?`;if(!window.confirm(msg))return;}
      const existing=bucket.get(pid)?.materials||[];
      let added=0,skipped=0,updated=0,untouched=0;const toCreate=[],toUpdate=[];
      for(const item of items){
        const same=existing.find(m=>item.externalId?m.externalId===item.externalId:(m.name||'').trim().toLowerCase()===item.name.toLowerCase()&&m.unit===item.unit);
        const status=String(item.excelStatus||'brak');const plan=n(item.approvedQty);
        let manualStatus='oczekuje',baselineQty=0;
        if(confirmed){
          if(status==='zrealizowany'&&plan>0){manualStatus='zrealizowana';baselineQty=plan}
          else if(status==='pominiety'){manualStatus='pominieta'}
          else if(status==='w realizacji'||status==='czesciowo'){manualStatus='realizowana'}
        }
        const evidence=confirmed?`Stan historyczny zadeklarowany przez administratora na podstawie pliku ${file?.name||'Excel'} (status: ${status}); wymaga dokumentów/inwentaryzacji.`:'';
        const newBaseline={manualStatus,baselineDeliveredQty:baselineQty,baselineReason:evidence,baselineUpdatedByUid:confirmed?user.uid:'',
          ...(confirmed?{baselineUpdatedAt:serverTimestamp()}:{})};
        if(same){
          if(!updateExisting){skipped++;continue}
          if(n(same.approvedQty)!==plan||n(same.baselineDeliveredQty)>0||same.baselineUpdatedAt||receivedQty(pid,same.id)>0){untouched++;continue}
          const data={...newBaseline,updatedAt:nowAt};
          toUpdate.push([entityDoc(pid,'materials',same.id),data]);continue;
        }
        const key=item.externalId?'IMP_'+item.externalId.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65):'IMP_'+crypto.randomUUID();
        // Dla nowego materiału "status w pliku" zapisujemy oddzielnie od stanu
        // potwierdzonego na budowie i NIE sumujemy ilości odebranych z Excela,
        // jeśli status jest "W realizacji", "Do zamówienia" lub "Pominięty".
        toCreate.push([doc(sub(pid,'materials'),key),{...item,...newBaseline,projectId:pid,createdAt:nowAt,serverAt:serverTimestamp()}]);
      }
      for(let pos=0;pos<toCreate.length;pos+=35){const batch=writeBatch(firestore);toCreate.slice(pos,pos+35).forEach(([ref,obj])=>batch.set(ref,obj));await batch.commit();added+=Math.min(35,toCreate.length-pos)}
      for(let pos=0;pos<toUpdate.length;pos+=35){const batch=writeBatch(firestore);toUpdate.slice(pos,pos+35).forEach(([ref,obj])=>batch.update(ref,obj));await batch.commit();updated+=Math.min(35,toUpdate.length-pos)}
      toast(`Import: dodano ${added}, zaktualizowano ${updated}, pominięto ${skipped}, bez zmian z powodu historii/ilości ${untouched}.`);
    }else if(form.id==='order-form'){

      const rows=[...form.querySelectorAll('.order-row')];if(!rows.length)throw Error('Dodaj co najmniej jedną pozycję.');const items=[],changeRequests=[];
      for(const rEl of rows){const r=Object.fromEntries(FormDataFromRow(rEl));const manual=r.entryMode==='manual';const material=mat(pid,manual?r.linkedMaterialId:r.materialId);const qty=n(r.qty);const typed=String(r.typedName||'').trim();const intent=r.intent==='qty'?'qty':r.intent==='new'?'new':!material?'new':'standard';
        if(!(qty>0)||!r.due||!r.delivery)throw Error('Podaj prawidłową ilość, termin i miejsce dostawy przy każdej pozycji.');
        if(manual&&!typed)throw Error('Wpisz nazwę materiału.');
        if(!manual&&!material)throw Error('Wybierz materiał z listy.');
        if(intent==='qty'&&!material)throw Error('Zmiana ilości wymaga powiązania z materiałem przedmiaru.');
        if(intent==='new'&&!manual)throw Error('Dla nowego materiału lub zmiany parametrów wybierz „Wpisz ręcznie” i podaj właściwą nazwę.');
        if(intent!=='standard'){
          if(!String(r.reason||'').trim())throw Error('Zmiana wymaga uzasadnienia.');
          changeRequests.push({kind:intent,materialId:intent==='qty'?material.id:'',oldQty:intent==='qty'?n(material.approvedQty):0,newQty:qty,newName:intent==='new'?(typed||(material?.name||'')):'',unit:material?.unit||'szt.',branch:r.branch||'budowlana',reason:String(r.reason||'').trim().slice(0,1000),due:r.due,priority:r.priority,delivery:r.delivery});continue;
        }
        if(material.manualStatus==='pominieta')throw Error(`${material.name}: materiał oznaczony jako pominięty. Zmień status przed zamówieniem.`);
        if(!(n(material.approvedQty)>0)||/RFI|DO POTWIERDZENIA|ROZBIEŻN|KONFLIKT/i.test(material.rfiStatus||''))throw Error(`${material.name}: wymagana weryfikacja RFI / ilości przed zakupem.`);
        const previously=(bucket.get(pid)?.orders||[]).flatMap(o=>o.items).filter(i=>i.materialId===material.id).reduce((s,i)=>s+n(i.qty),0);
        const thisTime=items.filter(i=>i.materialId===material.id).reduce((s,i)=>s+n(i.qty),0);
        if(previously+thisTime+qty>n(material.approvedQty))throw Error(`${material.name}: przekroczona ilość zatwierdzona. Zmień rodzaj pozycji na „Zmiana ilości”, podaj docelową łączną ilość i uzasadnienie.`);
        items.push({id:'OI-'+crypto.randomUUID().slice(0,10),materialId:material.id,name:material.name,requestedName:manual?typed:'',branch:branchOf(material),unit:material.unit,qty,due:r.due,delivery:r.delivery.slice(0,200),priority:r.priority,status:'zgloszone'});
      }
      if(!items.length&&!changeRequests.length)throw Error('Nie znaleziono pozycji.');
      if(items.length){const newRef=doc(sub(pid,'orders'));await setDoc(newRef,{projectId:pid,reference:'Z-'+Date.now().toString(36).toUpperCase(),items,notes:String(f.notes||'').slice(0,900),createdByUid:user.uid,createdBy:profile.name||labels[role],createdAt:nowAt,serverAt:serverTimestamp()});try{await logAndNotify(pid,'new_order','order',newRef.id,'Nowe zapotrzebowanie materiałowe',recipients(pid,'order',[],[...new Set(items.map(i=>i.branch))].length===1?items[0].branch:'all'))}catch(e){notifyFailure(e)}}
      for(const req of changeRequests){const cref=doc(sub(pid,'changes'));await setDoc(cref,{projectId:pid,...req,status:'oczekuje_zaop',createdByUid:user.uid,createdBy:profile.name||labels[role],createdAt:nowAt,serverAt:serverTimestamp()});try{await logAndNotify(pid,'new_change','change',cref.id,'Nowe zgłoszenie zmiany z formularza zamówienia',recipients(pid,'change',[],req.branch||'all'))}catch(e){notifyFailure(e)}}
      toast(`Zapisano: ${items.length} pozycji do realizacji, ${changeRequests.length} zgłoszeń zmian.`);
    }else if(form.id==='change-form'){
      let m=f.kind==='qty'?mat(pid,f.materialId):null;if(f.kind==='qty'&&!m)throw Error('Wybierz materiał do zmiany.');if(f.kind==='new'&&!f.newName.trim())throw Error('Wpisz nazwę nowego materiału.');if(!(n(f.newQty)>0))throw Error('Podaj prawidłową ilość.');
      const chRef=doc(sub(pid,'changes'));await setDoc(chRef,{projectId:pid,kind:f.kind,materialId:m?.id||'',oldQty:m?n(m.approvedQty):0,newQty:n(f.newQty),newName:f.kind==='new'?f.newName.trim().slice(0,160):'',unit:m?.unit||f.unit||'szt.',branch:f.kind==='qty'?branchOf(m):(f.branch||'budowlana'),reason:f.reason.trim(),status:'oczekuje_zaop',createdByUid:user.uid,createdBy:profile.name||labels[role],createdAt:nowAt,serverAt:serverTimestamp()});
      try{await logAndNotify(pid,'new_change','change',chRef.id,'Nowe zgłoszenie zmiany materiałowej',recipients(pid,'change',[],f.kind==='qty'?branchOf(m):(f.branch||'budowlana')))}catch(e){notifyFailure(e)}
    }else if(form.id==='transport-form'){
      const info=availableOrderItems(pid).find(x=>x.id===f.orderItemId);if(!info)throw Error('Brak dostępnej pozycji zamówienia.');if(!(n(f.qty)>0)||n(f.qty)>info.available)throw Error('Ilość wywozu przekracza dostępne zamówienie.');
      const trRef=doc(sub(pid,'shipments'));await setDoc(trRef,{projectId:pid,orderId:info.orderId,orderItemId:info.id,materialId:info.materialId,material:info.material,unit:info.unit,qty:n(f.qty),driver:f.driver.trim(),from:f.from.trim(),destination:f.destination.trim(),plannedDate:f.plannedDate,deliveryDate:f.deliveryDate,notes:String(f.notes||''),status:'zaplanowany',createdByUid:user.uid,createdAt:nowAt,serverAt:serverTimestamp()});
      try{await logAndNotify(pid,'shipment','transport',trRef.id,'Zaplanowano transport materiałów',recipients(pid,'transport',[],branchOf(mat(pid,info.materialId)||{})))}catch(e){notifyFailure(e)}
    }else if(form.id==='stock-form'){
      if(!(n(f.qty)>0))throw Error('Ilość musi być większa od zera.');await addDoc(sub(pid,'stock'),{projectId:pid,material:f.material.trim(),qty:n(f.qty),unit:f.unit.trim(),date:f.date,note:f.note||'',createdByUid:user.uid,createdAt:nowAt});
    }else if(form.id==='comment-form'){
      const text=String(f.text||'').trim();if(!text)throw Error('Wpisz komentarz.');
      const targetPid=form.dataset.pid,targetType=form.dataset.target,targetId=form.dataset.id;
      const cRef=doc(sub(targetPid,'comments')),eventRef=doc(sub(targetPid,'events'));const batch=writeBatch(firestore);
      batch.set(cRef,{projectId:targetPid,targetType,targetId,text,authorUid:user.uid,author:profile.name||labels[role],createdAt:nowAt,serverAt:serverTimestamp()});
      batch.set(eventRef,{projectId:targetPid,actorUid:user.uid,actor:profile.name||labels[role],kind:'comment',targetType,targetId,text:text.slice(0,240),createdAt:nowAt,serverAt:serverTimestamp()});
      const kind=boss?'board-comment':role==='kierownik'?'manager-comment':role==='magazyn'?'warehouse-comment':'buyer-comment';
      const speciality=targetBranch(targetPid,targetType,targetId);
      const ids=[...new Set(recipients(targetPid,kind,[...roleMentions(text,targetPid,speciality),f.mentionUid].filter(Boolean),speciality))];
      for(const uid of ids.slice(0,8)){batch.set(doc(collection(firestore,'users',uid,'notifications')),{projectId:targetPid,eventId:eventRef.id,eventType:'comment',targetType,targetId,text:text.slice(0,240),fromUid:user.uid,fromName:profile.name||labels[role],createdAt:nowAt,serverAt:serverTimestamp(),readAt:null});}
      await batch.commit();
    }else if(form.id==='warehouse-receive-form'){
      const [oid,iid]=form.dataset.id.split('|');const r=entityDoc(form.dataset.pid,'orders',oid);const q=n(f.qty);if(!(q>0))throw Error('Wpisz przyjętą ilość.');const key=doc(sub(form.dataset.pid,'stock'));await runTransaction(firestore,async tx=>{const sn=await tx.get(r);if(!sn.exists())throw Error('Nie znaleziono zamówienia.');const i=sn.data().items.find(i=>i.id===iid);if(!i||!['zamowione','magazyn_czesciowo'].includes(i.status)||q>n(i.qty)-n(i.warehouseReceivedQty))throw Error('Ilość przekracza możliwe przyjęcie.');const after=n(i.warehouseReceivedQty)+q;tx.update(r,{items:sn.data().items.map(it=>it.id===iid?{...it,warehouseReceivedQty:after,status:after>=n(it.qty)?'magazyn_przyjete':'magazyn_czesciowo',warehouseLastAt:nowAt,warehouseLocation:f.location.trim()}:it),updatedAt:nowAt,updatedByUid:user.uid});tx.set(key,{projectId:form.dataset.pid,material:i.name,materialId:i.materialId,qty:q,unit:i.unit,date:today(),note:'Przyjęcie: '+f.location.trim(),createdByUid:user.uid,createdAt:nowAt,serverAt:serverTimestamp()});});
      try{await logAndNotify(form.dataset.pid,'status','order',oid,'Magazyn potwierdził przyjęcie materiału',recipients(form.dataset.pid,'transport'))}catch(e){notifyFailure(e)}
    }else if(form.id==='receive-form'){
      const ref=entityDoc(form.dataset.pid,'shipments',form.dataset.id),s=shipment(form.dataset.pid,form.dataset.id),qty=n(f.receivedQty);
      if(!s||s.status!=='dotarl'||qty<0||qty>n(s.qty))throw Error('Nieprawidłowa ilość do odbioru.');if(qty<n(s.qty)&&!f.discrepancy?.trim())throw Error('Podaj przyczynę braków lub uszkodzeń.');
      await updateDoc(ref,{status:qty===n(s.qty)?'odebrany':'czesciowy',receivedQty:qty,discrepancy:String(f.discrepancy||'').slice(0,800),receivedAt:nowAt,receivedServerAt:serverTimestamp(),receivedByUid:user.uid});
      try{await logAndNotify(form.dataset.pid,'status','transport',form.dataset.id,qty===n(s.qty)?'Dostawa odebrana w całości':'Dostawa częściowa / zgłoszone braki',recipients(form.dataset.pid,'transport'))}catch(e){notifyFailure(e)}
    }else if(form.id==='attachment-form'){
      const targetPid=form.dataset.pid, file=$('tp-attach-file')?.files?.[0],url=String(f.link||'').trim();if(!file&&!url)throw Error('Wybierz plik lub wpisz link.');if(file&&url)throw Error('Wybierz plik albo link, nie oba naraz.');if(url&&!url.startsWith('https://'))throw Error('Link musi zaczynać się od https://');
      const dataUrl=file?await compressFile(file):'',ref=doc(sub(targetPid,'attachments'));
      await setDoc(ref,{projectId:targetPid,targetType:form.dataset.target,targetId:form.dataset.id,stage:f.stage,description:String(f.description||'').slice(0,240),filename:file?file.name.slice(0,140):'Link do dokumentu',mime:file?(file.type.startsWith('image/')?'image/jpeg':'application/pdf'):'text/url',kind:file?'file':'link',dataUrl,url:file?'':url,author:profile.name||labels[role],authorUid:user.uid,createdAt:nowAt,serverAt:serverTimestamp()});
      toast('Załącznik zapisany.');attachmentForm(targetPid,form.dataset.target,form.dataset.id);return;
    }else if(form.id==='user-form'){
      await setDoc(doc(firestore,'users',f.uid.trim()),{name:f.name.trim(),role:f.role,active:true,createdAt:nowAt});
    }else if(form.id==='user-edit-form'){
      await updateDoc(doc(firestore,'users',form.dataset.uid),{name:f.name.trim(),role:f.role,active:f.active==='true'});
    }else return;
    close();toast('Zapisano we wspólnej bazie Firestore.');render();
  }
  function FormDataFromRow(row){return [...row.querySelectorAll('[name]')].map(el=>[el.name,el.value])}
  async function step(a,pid,id){const stamp=now();
    if(a==='review-change'){
      await updateDoc(entityDoc(pid,'changes',id),{status:'oczekuje_zarzad',reviewedAt:stamp,reviewedBy:profile.name||labels[role],reviewedByUid:user.uid});
      try{await logAndNotify(pid,'status','change',id,'Zmiana materiałowa czeka na decyzję zarządu',recipients(pid,'change'))}catch(e){notifyFailure(e)}
    }else if(a==='approve-change'||a==='reject-change'){
      const isApproved=a==='approve-change',c=change(pid,id);if(!c||c.status!=='oczekuje_zarzad')throw Error('Ta zmiana nie oczekuje już na decyzję.');
      const cRef=entityDoc(pid,'changes',id),mRef=c.kind==='qty'?entityDoc(pid,'materials',c.materialId):doc(sub(pid,'materials'));
      await runTransaction(firestore,async tx=>{
        const cs=await tx.get(cRef);if(!cs.exists()||cs.data().status!=='oczekuje_zarzad')throw Error('Decyzja została już podjęta.');
        let ms=null;if(isApproved&&c.kind==='qty'){ms=await tx.get(mRef);if(!ms.exists())throw Error('Nie znaleziono materiału.');if(n(ms.data().approvedQty)!==n(c.oldQty))throw Error('Ilość została zmieniona od czasu zgłoszenia. Sprawdź wniosek.');}
        tx.update(cRef,{status:isApproved?'zatwierdzona':'odrzucona',decidedAt:stamp,approvedBy:profile.name||labels[role],approvedByUid:user.uid,decidedServerAt:serverTimestamp()});
        if(isApproved){if(c.kind==='qty')tx.update(mRef,{approvedQty:n(c.newQty),approvedVia:id,updatedAt:stamp});else tx.set(mRef,{projectId:pid,name:c.newName,unit:c.unit,baseQty:0,approvedQty:n(c.newQty),source:'Dodatkowe',branch:c.branch||'budowlana',approvedVia:id,createdAt:stamp})}
      });
      try{await logAndNotify(pid,'status','change',id,isApproved?'Zarząd zatwierdził zmianę materiałową':'Zarząd odrzucił zmianę materiałową',recipients(pid,'transport'))}catch(e){notifyFailure(e)}
    }else if(a==='accept-order'||a==='mark-ordered'){
      const [oid,iid]=id.split('|'),ref=entityDoc(pid,'orders',oid);const isAccept=a==='accept-order',from=isAccept?'zgloszone':'zaakceptowane',to=isAccept?'zaakceptowane':'zamowione';
      await runTransaction(firestore,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw Error('Brak zamówienia.');const entry=snap.data().items.find(i=>i.id===iid);if(!entry||entry.status!==from)throw Error('Pozycja ma już inny status.');const items=snap.data().items.map(i=>i.id===iid?{...i,status:to,...(isAccept?{acceptedAt:stamp}:{orderedAt:stamp})}:i);tx.update(ref,{items,updatedAt:stamp,updatedByUid:user.uid});});
      try{await logAndNotify(pid,'status','order',oid,isAccept?'Zapotrzebowanie zaakceptowane':'Zaopatrzenie zamówiło materiał',recipients(pid,'transport',[],branchOf(order(pid,oid)?.items?.find(i=>i.id===iid)||{})))}catch(e){notifyFailure(e)}
    }else if(a==='dispatch'){
      const s=shipment(pid,id);if(!s||s.status!=='zaplanowany')throw Error('Transport nie oczekuje na wydanie.');
      await updateDoc(entityDoc(pid,'shipments',id),{status:'wydany',actualDate:today(),dispatchedAt:stamp,dispatchedServerAt:serverTimestamp(),dispatchedByUid:user.uid});
      try{await logAndNotify(pid,'status','transport',id,'Transport wyruszył w drogę',recipients(pid,'transport',[],branchOf(mat(pid,s.materialId)||{})))}catch(e){notifyFailure(e)}
    }else if(a==='arrive'){
      const s=shipment(pid,id);if(!s||s.status!=='wydany')throw Error('Transport nie jest obecnie w drodze.');
      await updateDoc(entityDoc(pid,'shipments',id),{status:'dotarl',arrivedAt:stamp,arrivedServerAt:serverTimestamp(),arrivedByUid:user.uid});
      try{await logAndNotify(pid,'status','transport',id,'Transport dotarł na budowę',recipients(pid,'transport',[],branchOf(mat(pid,s.materialId)||{})))}catch(e){notifyFailure(e)}
    }
    close();toast('Zapisano zmianę statusu.');render();
  }
  function download(){const data={exportedAt:now(),role,projects,materials:list('materials'),orders:list('orders'),changes:list('changes'),shipments:list('shipments'),stock:list('stock'),comments:list('comments'),events:list('events'),suppliers:(buyer||boss)?suppliers:[]};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`TaskPoint-eksport-${today()}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}

  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-tab],[data-action]');if(!el)return;
    if(el.dataset.tab){current=el.dataset.tab;selected='all';activity=admin||boss?'all':'active';render();return}
    const {action:a,pid,id}=el.dataset;
    try{
      if(a==='close')return close();
      if(a==='new-project')return projectForm();
      if(a==='project-baseline')return projectBaselineForm(pid);
      if(a==='bulk-baseline')return bulkBaselineForm(pid);
      if(a==='manual-material')return manualMaterialForm(pid,id);
      if(a==='assign-project')return assignForm(pid);
      if(a==='remove-manager'){
        if(!admin)throw Error('Brak uprawnień.');
        const pos=Number(id),p=mineProject(pid),a=projectAssignments(p)[pos];if(!a)throw Error('Nie znaleziono przypisania.');
        if(!confirm(`Usunąć przypisanie: ${personnel.find(u=>u.uid===a.uid)?.name||a.uid} / ${specialities[a.branch]||a.branch}?`))return;
        await runTransaction(firestore,async tx=>{const ref=pidDoc(pid),snap=await tx.get(ref);if(!snap.exists())throw Error('Nie znaleziono budowy.');const arr=projectAssignments(snap.data());
          const i=arr.findIndex(x=>JSON.stringify(x)===JSON.stringify(a));if(i<0)throw Error('Przypisanie zostało już zmienione. Odśwież widok.');arr.splice(i,1);tx.update(ref,{managerAssignments:arr,memberUids:[...new Set(arr.map(x=>x.uid))],updatedAt:now()})});
        toast('Usunięto przypisanie.');close();return;
      }
      if(a==='focus-project'){selected=pid;current='materials';return render()}
      if(a==='new-material')return materialsForm();
      if(a==='new-order')return orderForm();
      if(a==='new-change')return changeForm();
      if(a==='new-transport')return shipmentForm();
      if(a==='new-stock')return stockForm();
      if(a==='new-user')return profileForm();
      if(a==='new-supplier')return supplierForm();
      if(a==='supplier-detail')return supplierForm(id);
      if(a==='purchase-open')return purchaseForm(pid,id);
      if(a==='user-detail')return userDetail(id);
      if(a==='order-detail')return orderDetail(pid,id);
      if(a==='change-detail')return changeDetail(pid,id);
      if(a==='shipment-detail')return shipmentDetail(pid,id);
      if(a==='stock-detail')return stockDetail(pid,id);
      if(a==='attachments-open'){const parts=id.split('|');return attachmentForm(pid,parts[0],parts.slice(1).join('|'))}
      if(a==='open-file')return await openFile(pid,id);
      if(a==='receive-form')return receiveForm(pid,id);
      if(a==='warehouse-receive')return receiveWarehouseForm(pid,id);
      if(a==='notice-open'){const notice=notices.find(v=>v.id===id);if(!notice)return;await updateDoc(doc(firestore,'users',user.uid,'notifications',id),{readAt:serverTimestamp()});if(notice.targetType==='order')return orderDetail(notice.projectId,notice.targetId);if(notice.targetType==='change')return changeDetail(notice.projectId,notice.targetId);if(notice.targetType==='transport')return shipmentDetail(notice.projectId,notice.targetId);current='notifications';return render()}
      if(a==='goto-orders'){current='orders';return render()}
      if(a==='add-row'){const pid=$('f-project')?.value;$('order-rows').insertAdjacentHTML('beforeend',orderRow(pid));refreshOrderRows();return}
      if(a==='remove-row'){const x=el.closest('.order-row');if($('order-rows').children.length<=1)return toast('Zostaw co najmniej jeden materiał.');x.remove();return}
      if(a==='export')return download();
      if(['review-change','approve-change','reject-change','accept-order','mark-ordered','dispatch','arrive'].includes(a))return await step(a,pid,id);
    }catch(err){error(err)}
  });
  document.addEventListener('submit',async e=>{if(!e.target.id)return;e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]');if(button)button.disabled=true;try{await submitForm(form)}catch(err){error(err)}finally{if(button)button.disabled=false}});
  document.addEventListener('change',async e=>{
    if(e.target.id==='project-filter'){selected=e.target.value;render();return}
    if(e.target.id==='activity-filter'){activity=e.target.value;render();return}
    if(e.target.id==='branch-filter'){branchFilter=e.target.value;render();return}
    if(e.target.id==='tp-purchase-supplier'){const node=$('tp-purchase-new');if(node)node.hidden=e.target.value!=='__new__';return}
    if(e.target.id==='excel-file'){const el=e.target;const preview=$('excel-preview');if(!preview)return;if(!el.files[0]){preview.textContent='';return}preview.textContent='Analizuję nagłówki i statusy…';try{preview.innerHTML=importPreview(await readMaterialWorkbook(el.files[0]))}catch(err){preview.textContent='Nie można przygotować podglądu: '+err.message}return}
    if(e.target.id==='f-project'){
      const pid=e.target.value;
      if($('order-rows')){$('order-rows').innerHTML=orderRow(pid);refreshOrderRows()}
      if($('change-material'))$('change-material').innerHTML=opt(orderRows(pid));
      if($('transport-item')){$('transport-item').innerHTML=opt(availableOrderItems(pid).map(i=>[i.id,`${i.material} · ${i.available} ${i.unit} · ${i.orderRef}`]));const dest=document.querySelector('[name=destination]');if(dest)dest.value=prName(pid)}
    }
    if(e.target.closest('.order-row')){if(e.target.name==='branch')e.target.closest('.order-row').dataset.branchManual='yes';refreshOrderRows();return}
    if(e.target.id==='change-kind'){const wrap=$('new-material-wrap'),m=$('change-material');if(wrap)wrap.hidden=e.target.value!=='new';if(m)m.closest('.field').hidden=e.target.value==='new'}
  });
  document.addEventListener('input',e=>{if(e.target.name!=='typedName'||!e.target.closest('.order-row'))return;const row=e.target.closest('.order-row'),pid=$('f-project')?.value,box=row.querySelector('.tp-hints');if(!box)return;const guesses=suggested(pid,e.target.value);box.textContent=guesses.length?'Możliwe odpowiedniki z przedmiaru: '+guesses.map(x=>x.m.name).join(' • '):'Brak pewnego podobnego materiału. Zweryfikuj parametry techniczne.';});
  $('banner-close').addEventListener('click',()=>$('banner')?.remove());
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))close()});
  $('role-display').textContent=labels[role];
  connectProjects();render();
}
