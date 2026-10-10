/* TaskPoint 0.8: Firebase Authentication + server-verified user profile */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut,sendPasswordResetEmail} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const firebaseConfig={apiKey:'AIzaSyBIwzdOGlDQ6zon7bMiQ8ez-9EmYhL-jME',authDomain:'taskpoint-a210d.firebaseapp.com',projectId:'taskpoint-a210d',storageBucket:'taskpoint-a210d.firebasestorage.app',messagingSenderId:'538962087097',appId:'1:538962087097:web:14cbc495e1b8534d8d9f68',measurementId:'G-4VGX16Q1W5'};
const firebase=initializeApp(firebaseConfig);const auth=getAuth(firebase);const db=getFirestore(firebase);
const roles=new Set(['admin','kierownik','zaopatrzenie','magazyn','dyrektor','prezes']);
const form=document.getElementById('login-form'),msg=document.getElementById('auth-message');
let loaded=false,lastUid=null;
function message(text,error=false){msg.textContent=text;msg.className='auth-message '+(error?'error':'')}
function niceError(e){return ({'auth/invalid-credential':'Nieprawidłowy e-mail lub hasło.','auth/user-disabled':'Konto wyłączone.','auth/too-many-requests':'Zbyt wiele prób logowania.','permission-denied':'Dostęp do profilu zablokowany przez reguły Firestore.','unavailable':'Brak połączenia z bazą.'})[e?.code]||`Błąd: ${e?.code||e?.message||'nieznany'}`}
form.addEventListener('submit',async e=>{e.preventDefault();const btn=form.querySelector('button[type=submit]');btn.disabled=true;message('Logowanie…');try{await signInWithEmailAndPassword(auth,document.getElementById('login-email').value.trim(),document.getElementById('login-password').value);document.getElementById('login-password').value=''}catch(err){message(niceError(err),true)}finally{btn.disabled=false}});
document.getElementById('reset-password').addEventListener('click',async()=>{let email=document.getElementById('login-email').value.trim();if(!email)return message('Podaj adres e-mail.',true);try{await sendPasswordResetEmail(auth,email);message('Jeśli konto istnieje, sprawdź pocztę.')}catch(e){message(niceError(e),true)}});
async function logout(){await signOut(auth);location.reload()};document.getElementById('auth-logout').addEventListener('click',logout);document.getElementById('access-logout').addEventListener('click',logout);
onAuthStateChanged(auth,async user=>{
 document.body.classList.remove('authenticated');
 if(!user){document.getElementById('access-logout').hidden=true;message('Zaloguj się na swoje konto.');return}
 document.getElementById('access-logout').hidden=false;
 message('Sprawdzam profil i uprawnienia…');
 try{
  const snap=await getDoc(doc(db,'users',user.uid));
  if(!snap.exists()||snap.data().active!==true||!roles.has(snap.data().role))return message('Brak aktywnego profilu pracownika. Skontaktuj się z administratorem.',true);
  if(loaded && lastUid!==user.uid)return location.reload();
  lastUid=user.uid;document.body.classList.add('authenticated');
  if(!loaded){loaded=true;const {mountWorkspace}=await import('./workspace.js?v=8');mountWorkspace({db,user,profile:snap.data(),logout})}
 }catch(e){document.body.classList.remove('authenticated');message(niceError(e),true)}
});
