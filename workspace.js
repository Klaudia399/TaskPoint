/* TaskPoint 0.7 collaborative BETA. Roles enforced by FIRESTORE-RULES-0.7.txt.
   No file uploads, automatic system push, financial settlement, or accounting features. */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, setDoc, getDoc, query, where,
  runTransaction, getDocs
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

export function mountWorkspace({db:firestore,user,profile}) {
  const role=profile.role;
  const admin=role==='admin', buyer=admin||role==='zaopatrzenie';
  const boss=admin||role==='dyrektor'||role==='prezes';
  const warehouse=admin||role==='magazyn';
  const manager=admin||role==='kierownik';
  const staff=role!=='kierownik';
  const labels={admin:'Administrator',kierownik:'Kierownik budowy',zaopatrzenie:'Zaopatrzeniowiec',magazyn:'Magazyn',dyrektor:'Dyrektor',prezes:'Prezes'};
  const kinds={oczekuje_zaop:'Weryfikacja zaopatrzenia',oczekuje_zarzad:'Do akceptacji zarządu',zatwierdzona:'Zatwierdzona',odrzucona:'Odrzucona',zgloszone:'Zgłoszone',zamowione:'Zamówione',zaplanowany:'Zaplanowany',wydany:'Wydany',odebrany:'Odebrany'};
  const nav=[['dashboard','⌂','Pulpit'],['projects','▥','Budowy'],['materials','▤','Materiały'],['orders','▣','Zamówienia'],['changes','✓','Akceptacje'],['transport','🚚','Transport'],['stock','▦','Magazyn'],['docs','▧','Dokumenty'],...(admin?[['users','♙','Użytkownicy']]:[])];
  let current='dashboard',selected='all',projectUnsubs=new Map(),usersUnsub=null,projects=[],personnel=[],noticeError='',live=false;
  let bucket=new Map();
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Number(v)||0;
  const now=()=>new Date().toISOString();
  const today=()=>new Date().toISOString().slice(0,10);
  const fmt=v=>v?new Date((String(v).length===10?v+'T12:00:00':v)).toLocaleDateString('pl-PL'):'—';
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
  const vstatus=(s)=>`<span class="chip ${s==='zatwierdzona'||s==='odebrany'?'green':s==='odrzucona'?'red':s==='oczekuje_zarzad'?'purple':'blue'}">${esc(kinds[s]||s)}</span>`;
  const btn=(a,text,pid='',id='',klass='')=>`<button class="btn ${klass}" data-action="${a}" data-pid="${esc(pid)}" data-id="${esc(id)}">${text}</button>`;
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
        bucket.set(p.id,{materials:[],orders:[],changes:[],shipments:[],stock:[],comments:[]});
        const off=['materials','orders','changes','shipments','stock','comments'].map(name=>onSnapshot(sub(p.id,name),s=>{
          if(!bucket.has(p.id))return;
          bucket.get(p.id)[name]=s.docs.map(x=>({id:x.id,...x.data()}));render();
        },err=>{noticeError=`Nie udało się wczytać ${name} dla ${p.name}: ${err.code||err.message}`;render()}));
        projectUnsubs.set(p.id,off);
      }
      if(selected!=='all'&&!known.has(selected))selected='all';
      $('connection-label').textContent='Synchronizacja włączona';render();
    },err=>{noticeError=`Nie udało się wczytać listy budów: ${err.code||err.message}`;$('connection-label').textContent='Błąd dostępu';render()});
    if(admin){usersUnsub=onSnapshot(collection(firestore,'users'),snap=>{personnel=snap.docs.map(x=>({uid:x.id,...x.data()}));render()},err=>{noticeError=`Nie udało się wczytać użytkowników: ${err.code||err.message}`;render()})}
  }

  function render(){
    $('role-display').textContent=labels[role];$('avatar').textContent=labels[role].slice(0,1);
    $('side-nav').innerHTML=nav.map(([id,icon,name])=>`<button data-tab="${id}" class="${id===current?'active':''}"><span class="nav-icon">${icon}</span>${name}</button>`).join('');
    const mobile=['dashboard','orders','changes','transport','stock'];
    $('mobile-nav').innerHTML=nav.filter(([id])=>mobile.includes(id)).map(([id,icon,name])=>`<button data-tab="${id}" class="${id===current?'active':''}"><b>${icon}</b>${name}</button>`).join('');
    const handler={dashboard,projects:pageProjects,materials:pageMaterials,orders:pageOrders,changes:pageChanges,transport:pageTransport,stock:pageStock,docs:pageDocs,users:pageUsers,settings:pageSettings}[current]||dashboard;
    $('page').innerHTML=(noticeError?`<div class="warn-banner">${esc(noticeError)}</div>`:'')+(live?handler():blank('Łączenie ze wspólną bazą Firebase…'));
  }
  function projectFilter(){return `<div class="v7-bar"><label class="v7-meta" for="project-filter">Budowa</label><select id="project-filter">${pick(selected)}</select></div>`}
  function dashboard(){const o=withP(list('orders')),s=withP(list('shipments')),c=withP(list('changes'));
    return section('Dzień dobry!','Wspólna baza Firestore — informacje aktualizują się na zalogowanych urządzeniach.',
      (admin?btn('new-project','＋ Nowa budowa','','','primary'):'')+(manager?btn('new-order','＋ Zapotrzebowanie','','','primary'):''))+
    `<div class="stats">${row('Aktywne budowy',projects.length,'🏗')}${row('Zamówienia',o.length,'▣')}${row('Transporty',s.length,'🚚')}${row('Do akceptacji',c.filter(x=>x.status==='oczekuje_zarzad').length,'✓')}</div>`+
    `<div class="grid2"><div class="card"><div class="card-header"><h2>Ostatnie zamówienia</h2>${btn('goto-orders','Zobacz wszystkie')}</div><div class="v7-list">${o.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,5).map(x=>`<div class="v7-flex"><div><strong>${esc(x.reference||x.id)}</strong> · ${esc(prName(x.projectId))}<div class="meta">${x.items.length} pozycji · ${fmt(x.createdAt)}</div></div>${btn('order-detail','Szczegóły',x.projectId,x.id)}</div>`).join('')||blank('Nie ma jeszcze zamówień')}</div></div>`+
    `<div class="card"><div class="card-header"><h2>Centrum uwagi</h2></div><div class="v7-list"><div>Do weryfikacji zaopatrzenia: <b>${c.filter(x=>x.status==='oczekuje_zaop').length}</b></div><div>Do decyzji zarządu: <b>${c.filter(x=>x.status==='oczekuje_zarzad').length}</b></div><div>Transporty zaplanowane: <b>${s.filter(x=>x.status==='zaplanowany').length}</b></div><div>Transporty do odbioru: <b>${s.filter(x=>x.status==='wydany').length}</b></div></div></div></div>`+
    `<p class="helper">Uwaga: to są liczniki w aplikacji, a nie powiadomienia systemowe push. Dokumenty i historyczne dane lokalne nie są synchronizowane.</p>`;
  }
  function pageProjects(){return section('Budowy','Wszyscy widzą tylko budowy, do których mają dostęp.',admin?btn('new-project','＋ Dodaj budowę','','','primary'):'')+`<div class="project-grid">${projects.map(p=>`<div class="project"><div class="building">🏗</div><h3>${esc(p.name)}</h3><small>${esc(p.address||'Brak adresu')}</small><div class="meta">Kierownik: ${esc(p.managerLabel||'Nieprzypisany')}</div><div class="item-detail"><span>${(bucket.get(p.id)?.materials||[]).length} materiałów</span><span>${(bucket.get(p.id)?.orders||[]).length} zamówień</span></div><div class="actions" style="margin-top:14px">${btn('focus-project','Otwórz materiały',p.id)}${admin?btn('assign-project','Przypisz kierownika',p.id):''}</div></div>`).join('')||blank(admin?'Dodaj pierwszą budowę.':'Brak przypisanych budów. Administrator musi przydzielić Cię do budowy.')}</div>`}
  function pageMaterials(){const items=withP(list('materials'));return section('Lista materiałowa','Ilości pierwotne pozostają zapisane obok zmian zaakceptowanych przez zarząd.',buyer?btn('new-material','＋ Dodaj / importuj','','','primary'):'')+projectFilter()+`<div class="table-card v7-table-scroll"><table><thead><tr><th>Budowa / materiał</th><th>Pierwotnie</th><th>Zatwierdzono</th><th>Zamówiono</th><th>Odebrano</th><th>Źródło</th></tr></thead><tbody>${items.map(m=>{const orders=(bucket.get(m.projectId)?.orders||[]);const all=orders.flatMap(o=>o.items).filter(i=>i.materialId===m.id);const received=(bucket.get(m.projectId)?.shipments||[]).filter(s=>s.materialId===m.id&&s.status==='odebrany').reduce((sum,s)=>sum+n(s.qty),0);return `<tr><td><strong>${esc(m.name)}</strong><div class="meta">${esc(prName(m.projectId))}</div></td><td>${n(m.baseQty)} ${esc(m.unit)}</td><td>${n(m.approvedQty)} ${esc(m.unit)} ${n(m.approvedQty)!==n(m.baseQty)?'<span class="v7-flag">ZMIANA</span>':''}</td><td>${all.reduce((sum,i)=>sum+n(i.qty),0)} ${esc(m.unit)}</td><td>${received} ${esc(m.unit)}</td><td>${m.source==='Dodatkowe'?'<span class="v7-flag">DODATKOWE</span>':esc(m.source)}</td></tr>`}).join('')}</tbody></table></div>${items.length?'':blank('Brak materiałów. Zaopatrzeniowiec może dodać listę materiałową.')}`}
  function pageOrders(){const items=withP(list('orders')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return section('Zamówienia','Każda pozycja ma własną datę potrzebnej dostawy, miejsce i priorytet.',manager?btn('new-order','＋ Nowe zapotrzebowanie','','','primary'):'')+projectFilter()+`<div class="card-list">${items.map(o=>`<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(o.reference||o.id)} · ${esc(prName(o.projectId))}</div><div class="item-sub">${esc(o.createdBy||'Kierownik')} · ${fmt(o.createdAt)}</div></div><span class="chip blue">${o.items.length} poz.</span></div><div class="item-detail">${o.items.map(i=>`<span>${esc(i.name)}: ${n(i.qty)} ${esc(i.unit)}, ${fmt(i.due)} — ${esc(i.priority)}</span>`).join('')}</div><div class="item-foot">${btn('order-detail','Szczegóły / komentarze',o.projectId,o.id)}</div></div>`).join('')||blank('Brak zamówień. Kierownik może utworzyć pierwsze zapotrzebowanie.')}</div>`}
  function pageChanges(){const items=withP(list('changes')).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));return section('Zmiany i akceptacje','Zaopatrzenie weryfikuje; decyzję podejmuje jeden dyrektor lub prezes.',manager?btn('new-change','＋ Zgłoś zmianę','','','primary'):'')+projectFilter()+`<div class="card-list">${items.map(c=>`<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(c.kind==='new'?c.newName:(mat(c.projectId,c.materialId)?.name||'Zmiana ilości'))}</div><div class="item-sub">${esc(prName(c.projectId))} · ${fmt(c.createdAt)} · ${esc(c.createdBy)}</div></div>${vstatus(c.status)}</div><div class="item-detail"><span>Pierwotnie: ${n(c.oldQty)}</span><span>Wnioskowano: ${n(c.newQty)} ${esc(c.unit)}</span></div><p class="small">${esc(c.reason)}</p><div class="item-foot"><span class="meta">${c.approvedBy?`Decyzja: ${esc(c.approvedBy)}`:''}</span><div class="row-actions">${btn('change-detail','Szczegóły',c.projectId,c.id)}${buyer&&c.status==='oczekuje_zaop'?btn('review-change','Przekaż zarządowi',c.projectId,c.id,'primary'):''}${boss&&c.status==='oczekuje_zarzad'?btn('approve-change','Zatwierdź',c.projectId,c.id,'green'):''}${boss&&c.status==='oczekuje_zarzad'?btn('reject-change','Odrzuć',c.projectId,c.id,'danger'):''}</div></div></div>`).join('')||blank('Brak zgłoszonych zmian.')}</div>`}
  function pageTransport(){const data=withP(list('shipments')).sort((a,b)=>String(a.plannedDate).localeCompare(String(b.plannedDate)));return section('Transport materiałów','Magazyn wskazuje termin wywozu, kierowcę i miejsce dostawy.',warehouse?btn('new-transport','＋ Zaplanuj transport','','','primary'):'')+projectFilter()+`<div class="card-list">${data.map(s=>`<div class="item-card"><div class="item-top"><div><div class="item-name">${esc(s.material)} — ${n(s.qty)} ${esc(s.unit)}</div><div class="item-sub">${esc(prName(s.projectId))} · Kierowca: ${esc(s.driver)}</div></div>${vstatus(s.status)}</div><div class="item-detail"><span>Wywóz: ${fmt(s.plannedDate)}</span><span>Dostawa: ${fmt(s.deliveryDate)}</span><span>${esc(s.from)} → ${esc(s.destination)}</span></div><div class="item-foot">${btn('shipment-detail','Szczegóły / komentarze',s.projectId,s.id)}<div class="row-actions">${warehouse&&s.status==='zaplanowany'?btn('dispatch','Potwierdź wydanie',s.projectId,s.id,'primary'):''}${manager&&s.status==='wydany'?btn('receive','Potwierdź odbiór',s.projectId,s.id,'green'):''}</div></div></div>`).join('')||blank('Brak transportów.')}</div>`}
  function pageStock(){const rows=withP(list('stock'));return section('Magazyn','Przyjęcia na stan — testowy rejestr, jeszcze nie pełna ewidencja ERP.',warehouse?btn('new-stock','＋ Przyjęcie na stan','','','primary'):'')+projectFilter()+`<div class="table-card"><table><thead><tr><th>Materiał</th><th>Budowa</th><th>Ilość</th><th>Data</th><th>Uwagi</th></tr></thead><tbody>${rows.map(s=>`<tr><td><strong>${esc(s.material)}</strong></td><td>${esc(prName(s.projectId))}</td><td>${n(s.qty)} ${esc(s.unit)}</td><td>${fmt(s.date)}</td><td>${esc(s.note)}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':blank('Brak przyjęć magazynowych.')}`}
  function pageDocs(){return section('Dokumenty i WZ','Moduł dokumentów jest zaplanowany na kolejny etap.')+`<div class="card"><h2>W tej wersji nie przesyłamy jeszcze plików</h2><p>Zdjęcia i PDF wymagają oddzielnego, bezpiecznego przechowywania, uprawnień oraz archiwizacji. Nie zapisujemy plików w Firestore jako dużych tekstów.</p><p class="helper">Do zamówień i transportów można już dodawać wspólne komentarze.</p></div>`}
  function pageUsers(){if(!admin)return blank('Tylko administrator zarządza profilami.');return section('Konta i uprawnienia','Najpierw utwórz konto w Firebase Authentication → Users, potem dodaj jego UID tutaj.',btn('new-user','＋ Dodaj profil użytkownika','','','primary'))+`<div class="card"><div class="v7-list">${personnel.map(u=>`<div class="v7-flex"><div><b>${esc(u.name||u.uid)}</b><div class="meta">${esc(u.uid)} · ${esc(labels[u.role]||u.role)} · ${u.active?'Aktywny':'Nieaktywny'}</div></div>${btn('user-detail','Edytuj profil','',u.uid)}</div>`).join('')||blank('Nie ma jeszcze profili')}</div></div>`}
  function pageSettings(){return section('Ustawienia i eksport','Zachowaj kopię testowych danych i monitoruj limity darmowego planu.')+`<div class="grid2"><div class="card"><h2>Eksport danych</h2><p>Możesz pobrać kopię bieżących danych, do których masz dostęp. Plik JSON pozostanie na Twoim urządzeniu.</p>${btn('export','Pobierz eksport JSON','','','primary')}</div><div class="card"><h2>Stan wdrożenia</h2><p class="small">Wersja 0.7 używa Firestore dla budów, materiałów, zamówień, zatwierdzeń, magazynu i transportów. Nie importuje historii z localStorage.</p><p class="small">Brak systemowych powiadomień push, wgrywania zdjęć i plików WZ, rozliczeń finansowych oraz automatycznych kopii zapasowych.</p></div></div>`}

  function projectChoice(){return `<div class="field full"><label>Budowa</label><select name="projectId" id="f-project" required>${pick(projects[0]?.id,false)}</select></div>`}
  function projectForm(){modal('Nowa budowa',`<form id="new-project-form" class="form-grid">${f('name','Nazwa budowy','','text','maxlength="120"')}${f('address','Adres / lokalizacja','','text','maxlength="200"')}${f('managerLabel','Kierownik — etykieta (opcjonalnie)','','text','maxlength="100"')}<div class="field full"><button class="btn primary" type="submit">Utwórz budowę</button></div></form>`)}
  function assignForm(pid){const p=projects.find(x=>x.id===pid);modal('Przypisz kierowników',`<p class="small">Budowa: <b>${esc(p.name)}</b>. Wpisz UID kont kierowników, oddzielając je przecinkami. Użytkownik musi mieć aktywny profil z rolą kierownik.</p><form id="assign-form" data-pid="${esc(pid)}" class="form-grid"><div class="field full"><label>UID kierowników (rozdziel przecinkiem)</label><textarea name="members" rows="3">${esc((p.memberUids||[]).join(', '))}</textarea></div><div class="field full"><button class="btn primary" type="submit">Zapisz przypisania</button></div></form>`)}
  function materialsForm(){if(!requireProject())return;modal('Materiały i import z Excela',`<p class="small muted">Wklej z Excela jeden materiał w wierszu. Kolumny: nazwa; ilość; jednostka; źródło. Można użyć separatora TAB.</p><form id="import-form" class="form-grid">${projectChoice()}<div class="field full"><label>Lista materiałów</label><textarea name="rows" rows="8" required placeholder="Rura PVC 110; 100; mb; Przedmiar&#10;Kolano PVC 110; 30; szt.; Projekt"></textarea></div><div class="field full"><button class="btn primary" type="submit">Zapisz listę w Firestore</button></div></form>`)}
  function orderRows(pid){return (bucket.get(pid)?.materials||[]).map(m=>[m.id,`${m.name} · limit ${m.approvedQty} ${m.unit}`])}
  function orderRow(pid){const items=orderRows(pid);return `<div class="v7-form-row order-row"><div class="wide"><label>Materiał</label><select name="materialId" required>${opt(items)}</select></div><div><label>Ilość</label><input type="number" name="qty" min="0.001" step="any" required></div><div><label>Termin potrzebnej dostawy</label><input type="date" name="due" min="${today()}" required></div><div><label>Priorytet</label><select name="priority">${opt([['niski','Niski'],['standard','Standardowy'],['wysoki','Wysoki'],['krytyczny','Krytyczny']],'standard')}</select></div><div class="wide"><label>Miejsce dostawy</label><input name="delivery" value="Bezpośrednio na budowę" maxlength="200" required></div><button class="btn danger remove" type="button" data-action="remove-row">Usuń</button></div>`}
  function orderForm(){if(!requireProject())return;const pid=projects[0].id;if(!orderRows(pid).length){toast('Brak materiałów. Zaopatrzeniowiec musi najpierw wgrać listę.');return}
    modal('Nowe zapotrzebowanie',`<form id="order-form" class="form-grid">${projectChoice()}<div class="field full"><label>Uwagi do całego zamówienia</label><textarea name="notes" maxlength="900"></textarea></div><div class="field full"><div class="v7-flex"><h3>Pozycje zamówienia</h3><button type="button" class="btn" data-action="add-row">＋ Materiał</button></div><div id="order-rows">${orderRow(pid)}</div></div><div class="field full"><button class="btn primary" type="submit">Wyślij zapotrzebowanie</button></div></form>`)}
  function changeForm(){if(!requireProject())return;const pid=projects[0].id;modal('Zmiana materiałowa',`<form class="form-grid" id="change-form">${projectChoice()}<div class="field"><label>Rodzaj zmiany</label><select name="kind" id="change-kind">${opt([['qty','Zmiana ilości'],['new','Nowy materiał']])}</select></div><div class="field"><label>Materiał</label><select name="materialId" id="change-material">${opt(orderRows(pid))}</select></div><div class="field" id="new-material-wrap" hidden><label>Nazwa dodatkowego materiału</label><input name="newName" maxlength="160"></div>${f('newQty','Wnioskowana ilość','','number','min="0.001" step="any"')}<div class="field"><label>Jednostka nowej pozycji</label><input name="unit" value="szt." maxlength="20"></div><div class="field full"><label>Uzasadnienie zmiany</label><textarea name="reason" maxlength="1200" required></textarea></div><div class="field full"><button class="btn primary" type="submit">Wyślij do zaopatrzenia</button></div></form>`)}
  function availableOrderItems(pid){return (bucket.get(pid)?.orders||[]).flatMap(o=>o.items.map(i=>{
    const used=(bucket.get(pid)?.shipments||[]).filter(s=>s.orderItemId===i.id).reduce((total,s)=>total+n(s.qty),0);
    return {id:i.id,orderId:o.id,materialId:i.materialId,material:i.name,unit:i.unit,available:n(i.qty)-used,orderRef:o.reference||o.id};
  })).filter(i=>i.available>0)}
  function shipmentForm(){if(!requireProject())return;const pid=projects[0].id;modal('Zlecenie transportu',`<form id="transport-form" class="form-grid">${projectChoice()}<div class="field full"><label>Pozycja z zamówienia</label><select id="transport-item" name="orderItemId">${opt(availableOrderItems(pid).map(i=>[i.id,`${i.material} · ${i.available} ${i.unit} dostępne · ${i.orderRef}`]))}</select></div>${f('qty','Ilość do wywozu','','number','step="any" min="0.001"')}${f('driver','Kierowca','','text','maxlength="90"')}${f('from','Miejsce załadunku','Magazyn główny','','maxlength="200"')}${f('destination','Miejsce dostawy',prName(pid),'text','maxlength="200"')}${f('plannedDate','Data wywozu',today(),'date')}${f('deliveryDate','Planowana data dostawy',today(),'date')}<div class="field full"><label>Uwagi do kierowcy</label><textarea name="notes" maxlength="800"></textarea></div><div class="field full"><button class="btn primary" type="submit">Zapisz transport</button></div></form>`)}
  function stockForm(){if(!requireProject())return;modal('Przyjęcie magazynowe',`<form id="stock-form" class="form-grid">${projectChoice()}${f('material','Nazwa materiału','','text','maxlength="160"')}${f('qty','Ilość','','number','min="0.001" step="any"')}${f('unit','Jednostka','szt.','','maxlength="20"')}${f('date','Data przyjęcia',today(),'date')}<div class="field full"><label>Uwagi</label><textarea name="note" maxlength="800"></textarea></div><div class="field full"><button class="btn primary" type="submit">Zapisz przyjęcie</button></div></form>`)}
  function comments(pid,targetType,targetId){const listComments=(bucket.get(pid)?.comments||[]).filter(x=>x.targetType===targetType&&x.targetId===targetId).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    return `<div class="comments"><h3>Komentarze</h3>${listComments.map(c=>`<div class="comment">${esc(c.text)}<small>${esc(c.author)} · ${fmt(c.createdAt)}</small></div>`).join('')||'<p class="helper">Brak komentarzy.</p>'}<form id="comment-form" data-pid="${esc(pid)}" data-target="${esc(targetType)}" data-id="${esc(targetId)}"><div class="field"><label>Dodaj komentarz</label><textarea name="text" maxlength="1500" required></textarea></div><button class="btn primary" type="submit">Dodaj komentarz</button></form></div>`}
  function orderDetail(pid,id){const o=order(pid,id);if(!o)return;modal('Zamówienie '+(o.reference||id),`<p class="small">${esc(prName(pid))} · ${esc(o.createdBy)} · ${fmt(o.createdAt)}</p><p>${esc(o.notes||'')}</p><div class="v7-table-scroll"><table><thead><tr><th>Materiał</th><th>Ilość</th><th>Termin</th><th>Priorytet</th><th>Dostawa</th><th>Status</th></tr></thead><tbody>${o.items.map(i=>`<tr><td>${esc(i.name)}</td><td>${n(i.qty)} ${esc(i.unit)}</td><td>${fmt(i.due)}</td><td>${esc(i.priority)}</td><td>${esc(i.delivery)}</td><td>${vstatus(i.status||'zgloszone')}${buyer&&i.status!=='zamowione'?` ${btn('mark-ordered','Oznacz jako zamówione',pid,o.id+'|'+i.id)}`:''}</td></tr>`).join('')}</tbody></table></div>${comments(pid,'order',id)}`)}
  function changeDetail(pid,id){const c=change(pid,id);if(!c)return;modal('Zmiana materiałowa',`<p><strong>${esc(c.kind==='new'?c.newName:(mat(pid,c.materialId)?.name||'Materiał'))}</strong> · ${esc(prName(pid))}</p>${vstatus(c.status)}<p>Wnioskowano: <b>${n(c.newQty)} ${esc(c.unit)}</b>; poprzednio: ${n(c.oldQty)}</p><p>${esc(c.reason)}</p>${c.approvedBy?`<p class="small">Decyzja: ${esc(c.approvedBy)} · ${fmt(c.decidedAt)}</p>`:''}${comments(pid,'change',id)}`)}
  function shipmentDetail(pid,id){const s=shipment(pid,id);if(!s)return;modal('Transport materiałów',`<p><b>${esc(s.material)} — ${n(s.qty)} ${esc(s.unit)}</b></p>${vstatus(s.status)}<p class="small">Kierowca: ${esc(s.driver)}<br>Załadunek: ${esc(s.from)}<br>Dostawa: ${esc(s.destination)}<br>Wywóz: ${fmt(s.plannedDate)}<br>Termin dostawy: ${fmt(s.deliveryDate)}</p><p>${esc(s.notes||'')}</p>${comments(pid,'transport',id)}`)}
  function profileForm(){modal('Nowy profil pracownika',`<p class="small">Najpierw utwórz konto pracownika w Firebase Authentication → Users. UID musi być skopiowany dokładnie z tego konta.</p><form id="user-form" class="form-grid">${f('uid','UID z Firebase Authentication','','text','minlength="6" maxlength="128"')}${f('name','Imię i nazwisko / etykieta','','text','maxlength="100"')}<div class="field"><label>Rola</label><select name="role">${opt(Object.entries(labels))}</select></div><div class="field full"><button type="submit" class="btn primary">Utwórz profil</button></div></form>`)}
  function userDetail(uid){const p=personnel.find(x=>x.uid===uid);if(!p)return;modal('Edytuj profil',`<p class="small">UID: ${esc(uid)}</p><form id="user-edit-form" data-uid="${esc(uid)}" class="form-grid">${f('name','Imię i nazwisko',p.name||'','','maxlength="100"')}<div class="field"><label>Rola</label><select name="role">${opt(Object.entries(labels),p.role)}</select></div><div class="field"><label>Konto</label><select name="active">${opt([['true','Aktywne'],['false','Zablokowane']],String(p.active))}</select></div><div class="field full"><button class="btn primary" type="submit">Zapisz profil</button></div></form>`)}

  async function submitForm(form){const fdata=new FormData(form),f=Object.fromEntries(fdata.entries()),pid=f.projectId,nowAt=now();
    if(form.id==='new-project-form'){
      await addDoc(collection(firestore,'projects'),{name:f.name.trim(),address:f.address.trim(),managerLabel:f.managerLabel.trim(),memberUids:[],createdByUid:user.uid,createdAt:nowAt});
    }else if(form.id==='assign-form'){
      const uidList=[...new Set(String(f.members||'').split(',').map(x=>x.trim()).filter(Boolean))];
      for(const uid of uidList){const userProfile=personnel.find(x=>x.uid===uid);if(!userProfile||userProfile.role!=='kierownik'||!userProfile.active)throw new Error(`UID ${uid} nie ma aktywnego profilu kierownika.`)}
      await updateDoc(pidDoc(form.dataset.pid),{memberUids:uidList,updatedAt:nowAt});
    }else if(form.id==='import-form'){
      const lines=f.rows.trim().split(/\r?\n/),items=[];
      for(const line of lines){const split=line.includes('\t')?'\t':';',parts=line.split(split).map(x=>x.trim().replace(/^"|"$/g,''));const q=Number(String(parts[1]||'').replace(',','.'));if(parts.length<3||!parts[0]||!(q>0))throw new Error('Błędna linia: '+line);
        items.push({projectId:pid,name:parts[0].slice(0,180),baseQty:q,approvedQty:q,unit:(parts[2]||'szt.').slice(0,20),source:(parts[3]||'Przedmiar').slice(0,50),createdAt:nowAt})}
      if(items.length>80)throw Error('Maksymalnie 80 pozycji na jeden import testowy.');
      for(const item of items)await addDoc(sub(pid,'materials'),item);
    }else if(form.id==='order-form'){
      const rows=[...form.querySelectorAll('.order-row')];if(!rows.length)throw Error('Dodaj co najmniej jedną pozycję.');
      const items=[];
      for(const row of rows){const r=Object.fromEntries(FormDataFromRow(row));const material=mat(pid,r.materialId),qty=n(r.qty);if(!material||!(qty>0)||!r.due||!r.delivery)throw Error('Wybierz materiał, ilość, termin i miejsce dostawy.');
        const previously=(bucket.get(pid)?.orders||[]).flatMap(o=>o.items).filter(i=>i.materialId===material.id).reduce((s,i)=>s+n(i.qty),0);
        const thisTime=items.filter(i=>i.materialId===material.id).reduce((s,i)=>s+n(i.qty),0);
        if(previously+thisTime+qty>n(material.approvedQty))throw Error(`${material.name}: brak zatwierdzonej ilości. Zgłoś zmianę.`);
        items.push({id:'OI-'+crypto.randomUUID().slice(0,10),materialId:material.id,name:material.name,unit:material.unit,qty,due:r.due,delivery:r.delivery.slice(0,200),priority:r.priority,status:'zgloszone'});
      }
      await addDoc(sub(pid,'orders'),{projectId:pid,reference:'Z-'+Date.now().toString(36).toUpperCase(),items,notes:String(f.notes||'').slice(0,900),createdByUid:user.uid,createdBy:profile.name||labels[role],createdAt:nowAt});
    }else if(form.id==='change-form'){
      let m=f.kind==='qty'?mat(pid,f.materialId):null;if(f.kind==='qty'&&!m)throw Error('Wybierz materiał do zmiany.');if(f.kind==='new'&&!f.newName.trim())throw Error('Wpisz nazwę nowego materiału.');if(!(n(f.newQty)>0))throw Error('Podaj prawidłową ilość.');
      await addDoc(sub(pid,'changes'),{projectId:pid,kind:f.kind,materialId:m?.id||'',oldQty:m?n(m.approvedQty):0,newQty:n(f.newQty),newName:f.kind==='new'?f.newName.trim().slice(0,160):'',unit:m?.unit||f.unit||'szt.',reason:f.reason.trim(),status:'oczekuje_zaop',createdByUid:user.uid,createdBy:profile.name||labels[role],createdAt:nowAt});
    }else if(form.id==='transport-form'){
      const info=availableOrderItems(pid).find(x=>x.id===f.orderItemId);if(!info)throw Error('Brak dostępnej pozycji zamówienia.');if(!(n(f.qty)>0)||n(f.qty)>info.available)throw Error('Ilość wywozu przekracza dostępne zamówienie.');
      await addDoc(sub(pid,'shipments'),{projectId:pid,orderId:info.orderId,orderItemId:info.id,materialId:info.materialId,material:info.material,unit:info.unit,qty:n(f.qty),driver:f.driver.trim(),from:f.from.trim(),destination:f.destination.trim(),plannedDate:f.plannedDate,deliveryDate:f.deliveryDate,notes:String(f.notes||''),status:'zaplanowany',createdByUid:user.uid,createdAt:nowAt});
    }else if(form.id==='stock-form'){
      if(!(n(f.qty)>0))throw Error('Ilość musi być większa od zera.');await addDoc(sub(pid,'stock'),{projectId:pid,material:f.material.trim(),qty:n(f.qty),unit:f.unit.trim(),date:f.date,note:f.note||'',createdByUid:user.uid,createdAt:nowAt});
    }else if(form.id==='comment-form'){
      await addDoc(sub(form.dataset.pid,'comments'),{projectId:form.dataset.pid,targetType:form.dataset.target,targetId:form.dataset.id,text:String(f.text).trim(),authorUid:user.uid,author:profile.name||labels[role],createdAt:nowAt});
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
    }else if(a==='approve-change'||a==='reject-change'){
      const isApproved=a==='approve-change',c=change(pid,id);if(!c||c.status!=='oczekuje_zarzad')throw Error('Ta zmiana nie oczekuje już na decyzję.');
      const cRef=entityDoc(pid,'changes',id),mRef=c.kind==='qty'?entityDoc(pid,'materials',c.materialId):doc(sub(pid,'materials'));
      await runTransaction(firestore,async tx=>{
        const cs=await tx.get(cRef);if(!cs.exists()||cs.data().status!=='oczekuje_zarzad')throw Error('Decyzja została już podjęta.');
        let ms=null;if(isApproved&&c.kind==='qty'){ms=await tx.get(mRef);if(!ms.exists())throw Error('Nie znaleziono materiału.');if(n(ms.data().approvedQty)!==n(c.oldQty))throw Error('Ilość została zmieniona od czasu zgłoszenia. Sprawdź wniosek.');}
        tx.update(cRef,{status:isApproved?'zatwierdzona':'odrzucona',decidedAt:stamp,approvedBy:profile.name||labels[role],approvedByUid:user.uid});
        if(isApproved){if(c.kind==='qty')tx.update(mRef,{approvedQty:n(c.newQty),approvedVia:id,updatedAt:stamp});else tx.set(mRef,{projectId:pid,name:c.newName,unit:c.unit,baseQty:0,approvedQty:n(c.newQty),source:'Dodatkowe',approvedVia:id,createdAt:stamp})}
      });
    }else if(a==='mark-ordered'){
      const [oid,iid]=id.split('|');const ref=entityDoc(pid,'orders',oid);
      await runTransaction(firestore,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw Error('Brak zamówienia.');const items=snap.data().items.map(i=>i.id===iid?{...i,status:'zamowione'}:i);tx.update(ref,{items,updatedAt:stamp,updatedByUid:user.uid})});
    }else if(a==='dispatch'){
      await updateDoc(entityDoc(pid,'shipments',id),{status:'wydany',actualDate:today(),dispatchedByUid:user.uid});
    }else if(a==='receive'){
      await updateDoc(entityDoc(pid,'shipments',id),{status:'odebrany',receivedAt:stamp,receivedByUid:user.uid});
    }
    close();toast('Zapisano zmianę statusu.');render();
  }
  function download(){const data={exportedAt:now(),role,projects,materials:list('materials'),orders:list('orders'),changes:list('changes'),shipments:list('shipments'),stock:list('stock'),comments:list('comments')};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`TaskPoint-eksport-${today()}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}

  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-tab],[data-action]');if(!el)return;
    if(el.dataset.tab){current=el.dataset.tab;selected='all';render();return}
    const {action:a,pid,id}=el.dataset;
    try{
      if(a==='close')return close();
      if(a==='new-project')return projectForm();
      if(a==='assign-project')return assignForm(pid);
      if(a==='focus-project'){selected=pid;current='materials';return render()}
      if(a==='new-material')return materialsForm();
      if(a==='new-order')return orderForm();
      if(a==='new-change')return changeForm();
      if(a==='new-transport')return shipmentForm();
      if(a==='new-stock')return stockForm();
      if(a==='new-user')return profileForm();
      if(a==='user-detail')return userDetail(id);
      if(a==='order-detail')return orderDetail(pid,id);
      if(a==='change-detail')return changeDetail(pid,id);
      if(a==='shipment-detail')return shipmentDetail(pid,id);
      if(a==='goto-orders'){current='orders';return render()}
      if(a==='add-row'){const pid=$('f-project')?.value;if(!orderRows(pid).length)return toast('Brak materiałów dla tej budowy.');$('order-rows').insertAdjacentHTML('beforeend',orderRow(pid));return}
      if(a==='remove-row'){const x=el.closest('.order-row');if($('order-rows').children.length<=1)return toast('Zostaw co najmniej jeden materiał.');x.remove();return}
      if(a==='export')return download();
      if(['review-change','approve-change','reject-change','mark-ordered','dispatch','receive'].includes(a))return await step(a,pid,id);
    }catch(err){error(err)}
  });
  document.addEventListener('submit',async e=>{if(!e.target.id)return;e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]');if(button)button.disabled=true;try{await submitForm(form)}catch(err){error(err)}finally{if(button)button.disabled=false}});
  document.addEventListener('change',e=>{
    if(e.target.id==='project-filter'){selected=e.target.value;render();return}
    if(e.target.id==='f-project'){
      const pid=e.target.value;
      if($('order-rows'))$('order-rows').innerHTML=orderRow(pid);
      if($('change-material'))$('change-material').innerHTML=opt(orderRows(pid));
      if($('transport-item')){$('transport-item').innerHTML=opt(availableOrderItems(pid).map(i=>[i.id,`${i.material} · ${i.available} ${i.unit} · ${i.orderRef}`]));const dest=document.querySelector('[name=destination]');if(dest)dest.value=prName(pid)}
    }
    if(e.target.id==='change-kind'){const wrap=$('new-material-wrap'),m=$('change-material');if(wrap)wrap.hidden=e.target.value!=='new';if(m)m.closest('.field').hidden=e.target.value==='new'}
  });
  $('banner-close').addEventListener('click',()=>$('banner')?.remove());
  $('modal').addEventListener('click',e=>{if(e.target===$('modal'))close()});
  $('role-display').textContent=labels[role];
  connectProjects();render();
}
