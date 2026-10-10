/* TaskPoint 0.6 — Firebase Authentication + read-only Firestore profile verification.
   Shared business data NOT implemented. Browser UI is NOT a security boundary.
   Server access MUST be controlled by Firestore Rules. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBIwzdOGlDQ6zon7bMiQ8ez-9EmYhL-jME',
  authDomain: 'taskpoint-a210d.firebaseapp.com',
  projectId: 'taskpoint-a210d',
  storageBucket: 'taskpoint-a210d.firebasestorage.app',
  messagingSenderId: '538962087097',
  appId: '1:538962087097:web:14cbc495e1b8534d8d9f68',
  measurementId: 'G-4VGX16Q1W5'
};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
const firestore=getFirestore(app);
const roles=new Set(['admin','kierownik','zaopatrzenie','magazyn','dyrektor','prezes']);
const form=document.getElementById('login-form');
const info=document.getElementById('auth-message');
const submit=form.querySelector('[type=submit]');
const accessLogout=document.getElementById('access-logout');
let injected=false;
let checkCounter=0;

function message(value, kind='') { info.className='auth-message '+kind;info.textContent=value; }
const friendly={
  'auth/invalid-credential':'Nieprawidłowy e-mail lub hasło.',
  'auth/user-disabled':'To konto zostało wyłączone.',
  'auth/too-many-requests':'Zbyt wiele prób. Spróbuj ponownie później.',
  'auth/network-request-failed':'Błąd połączenia. Sprawdź internet.',
  'auth/unauthorized-domain':'Dodaj klaudia399.github.io w Firebase Authentication → Settings → Authorized domains.',
  'auth/invalid-email':'Wpisz poprawny adres e-mail.',
  'permission-denied':'Nie udało się odczytać profilu. Sprawdź opublikowane reguły Firestore.',
  'unavailable':'Brak połączenia z bazą danych. Sprawdź internet.'
};
const errorText=e=>friendly[e?.code]||'Błąd Firebase: '+(e?.code||'nieznany')+'.';

form.addEventListener('submit',async ev=>{
  ev.preventDefault();submit.disabled=true;message('Trwa logowanie…');
  try{await signInWithEmailAndPassword(auth,document.getElementById('login-email').value.trim(),document.getElementById('login-password').value);document.getElementById('login-password').value='';}
  catch(e){message(errorText(e),'error');}
  finally{submit.disabled=false;}
});
document.getElementById('reset-password').addEventListener('click',async()=>{
  const email=document.getElementById('login-email').value.trim();
  if(!email){message('Najpierw podaj adres e-mail.','error');return;}
  try{await sendPasswordResetEmail(auth,email);message('Jeżeli konto istnieje, sprawdź skrzynkę pocztową.','success');}
  catch(e){message(errorText(e),'error');}
});
async function logOut(){try{await signOut(auth);location.reload();}catch{message('Nie udało się wylogować. Spróbuj ponownie.','error');}}
document.getElementById('auth-logout').addEventListener('click',logOut);
accessLogout.addEventListener('click',logOut);

onAuthStateChanged(auth, async user=>{
  const check=++checkCounter;
  document.body.classList.remove('authenticated');
  if(!user){accessLogout.hidden=true;message('Zaloguj się, aby otworzyć aplikację.');return;}
  accessLogout.hidden=false;
  message('Weryfikuję profil i uprawnienia konta…');
  try{
    const snapshot=await getDoc(doc(firestore,'users',user.uid));
    if(check!==checkCounter)return;
    if(!snapshot.exists()) {message('Konto nie ma jeszcze profilu w kolekcji users. Skontaktuj się z administratorem.','error');return;}
    const profile=snapshot.data();
    if(profile.active!==true){message('Dostęp zablokowany: konto jest nieaktywne.','error');return;}
    if(!roles.has(profile.role)){message('Nieprzypisana rola użytkownika. Administrator musi ją ustawić.','error');return;}
    if(injected&&window.TASKPOINT_UID!==user.uid){location.reload();return;}
    window.TASKPOINT_UID=user.uid;
    window.TASKPOINT_EMAIL=user.email;
    window.TASKPOINT_ROLE=profile.role;
    document.body.classList.add('authenticated');
    if(!injected){
      injected=true;
      const script=document.createElement('script');script.src='./app.js';
      script.onerror=()=>{document.body.classList.remove('authenticated');message('Nie udało się wczytać aplikacji. Odśwież stronę.','error');};
      document.body.appendChild(script);
    }
  }catch(e){if(check===checkCounter)message(errorText(e),'error');}
},e=>message(errorText(e),'error'));
