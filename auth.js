/* TaskPoint beta 0.5 — Firebase Authentication only.
   Authenticated user DOES NOT grant business-data permissions.
   Firestore security rules must stay deny-all until robust role rules are deployed. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';

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
const form=document.getElementById('login-form');
const info=document.getElementById('auth-message');
const submit=form.querySelector('[type=submit]');
let injected=false;

function message(value, kind='') {
  info.className='auth-message '+kind;
  info.textContent=value;
}
const friendly={
  'auth/invalid-credential':'Nieprawidłowy e-mail lub hasło.',
  'auth/user-disabled':'To konto zostało wyłączone.',
  'auth/too-many-requests':'Zbyt wiele prób. Spróbuj ponownie później.',
  'auth/network-request-failed':'Błąd połączenia. Sprawdź internet.',
  'auth/unauthorized-domain':'Domena nie jest uprawniona. Dodaj klaudia399.github.io do Firebase Authentication → Settings → Authorized domains.',
  'auth/invalid-email':'Wpisz poprawny adres e-mail.'
};
const errorText=err=>friendly[err?.code]||'Nie udało się połączyć z Firebase. Spróbuj ponownie. ('+(err?.code||'błąd')+')';

form.addEventListener('submit', async ev=>{
  ev.preventDefault();
  submit.disabled=true;
  message('Trwa logowanie…');
  try {await signInWithEmailAndPassword(auth,document.getElementById('login-email').value.trim(),document.getElementById('login-password').value);form.password.value='';}
  catch(err){message(errorText(err),'error');}
  finally{submit.disabled=false;}
});

document.getElementById('reset-password').addEventListener('click',async()=>{
  const email=document.getElementById('login-email').value.trim();
  if(!email){message('Najpierw podaj adres e-mail.','error');return;}
  try{await sendPasswordResetEmail(auth,email);message('Jeżeli konto istnieje, sprawdź skrzynkę pocztową.','success');}
  catch(err){message(errorText(err),'error');}
});

document.getElementById('auth-logout').addEventListener('click',async()=>{
  try{await signOut(auth);location.reload();}
  catch(err){alert('Nie udało się wylogować. Spróbuj ponownie.');}
});

onAuthStateChanged(auth,user=>{
  if(!user){document.body.classList.remove('authenticated');message('Zaloguj się, aby otworzyć wersję demonstracyjną.');return;}
  if(injected && window.TASKPOINT_UID !== user.uid){location.reload();return;}
  window.TASKPOINT_UID=user.uid;
  window.TASKPOINT_EMAIL=user.email;
  document.body.classList.add('authenticated');
  if(!injected){
    injected=true;
    const script=document.createElement('script');script.src='./app.js';
    script.onerror=()=>alert('Nie udało się wczytać pulpitu. Odśwież stronę.');
    document.body.appendChild(script);
  }
},err=>message(errorText(err),'error'));
