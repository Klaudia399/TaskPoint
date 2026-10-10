# TaskPoint BETA 0.8

TASKPOINT BETA 0.8 — OBIEG MATERIAŁÓW / WSPÓLNE DANE FIREBASE
===========================================================

PILOTAŻ / DANE TESTOWE — NIE ZASTĘPUJE SYSTEMU PRODUKCYJNEGO

ETAPY JEDNEJ POZYCJI
1. Lista z przedmiaru / projektu (zaopatrzenie importuje XLSX)
2. Kierownik składa zapotrzebowanie (ilość, termin, miejsce i priorytet)
3. Zaopatrzenie akceptuje -> zamawia u dostawcy; po zakupie znika z jego aktywnych
4. Magazyn potwierdza przyjętą ilość i miejsce składowania, także częściowo
5. Magazyn planuje transport (data, kierowca, budowa) i wydaje towar
6. Kierownik klika "Transport dotarł" — zapisuje się data i godzina
7. Kierownik potwierdza odbiór i faktyczną ilość oraz ewentualne braki
8. Po zakończeniu zadanie przechodzi z listy Aktywne do Zakończone dla odpowiedniej roli.

POZOSTAŁE FUNKCJE
- Zdjęcia z telefonu, małe PDF (do 120 KB) oraz linki do większych dokumentów
  na zamówieniu, pozycji materiałowej, zmianie, magazynie lub transporcie;
  zdjęcie jest kompresowane i zapisywane w Firestore (pilotaż).
- Komentarze z datą/godziną, wzmianki @Magazyn/@Kierownik i wybór pracownika.
- Powiadomienia wewnątrz aplikacji (nie systemowy push, nie SMS/WhatsApp).
  Komentarz zarządu powiadamia kierownika przypisanej budowy oraz zaopatrzenie.
- Bezpośredni import Excel XLSX/XLS/CSV przez bibliotekę SheetJS z publicznego CDN.
  Obsługiwany format to 01_ZAPOTRZEBOWANIE z pliku "Kazimierzów".
  Pomijane są usługi/odpady; ID M-001 itd. zapobiega duplikatom.
  Stare ilości nie są nadpisywane: różnice wymagają osobnego procesu zatwierdzenia.
  RFI/konflikty w danych powinny zostać wyjaśnione przed zamówieniem.

DARMOWE LIMITY: Firebase Spark + Firestore; duże pliki i pełne archiwum WZ
będą wymagały innego rozwiązania (np. zabezpieczony Google Drive).
ŻADNEGO PŁATNEGO BLAZE ANI KARTY PŁATNICZEJ.

KROK 1
Przy obecnym działającym TaskPoint 0.7 pobierz eksport JSON (Ustawienia i eksport).
Nie usuwaj istniejących dokumentów, nie kasuj bazy ani repozytorium.

KROK 2 — NOWE REGUŁY FIRESTORE
Firebase Console -> Firestore Database -> Rules.
Otwórz FIRESTORE-RULES-0.8.txt, skopiuj CAŁĄ zawartość i opublikuj.
Uwaga: reguły wymagają przetestowania odrębnych kont i statusów na danych testowych.
Wstrzymaj pracę jeśli Firebase wyświetla błąd uprawnień lub publikacji.

KROK 3 — AKTUALIZUJ PLIKI GITHUB
Repozytorium: https://github.com/Klaudia399/TaskPoint
Add file -> Upload files -> wybierz:
 index.html, auth.js, workspace.js, styles.css, sw.js,
 manifest.webmanifest, icon-192.png, icon-512.png
Kliknij Commit changes. Nie wgrywaj ZIP i pliku reguł do publicznej strony.

KROK 4 — TESTUJ (najlepiej na kontach testowych)
1) Najpierw otwórz stronę w incognito: https://klaudia399.github.io/TaskPoint/
2) Zaloguj jako administrator.
3) Materiały -> Dodaj / importuj -> wgraj przykładowy XLSX.
4) Zamówienia -> dodaj 1 pozycję, sprawdź statusy.
5) Zaznacz Akceptuj i Zamówione u dostawcy.
6) Magazyn -> z zakładki Zamówienia potwierdź przyjęcie.
7) Transport -> utwórz zlecenie, wskaż datę i kierowcę, kliknij Wydanie.
8) Zaloguj jako kierownik -> Transport dotarł -> Potwierdź odbiór.
9) Dodaj komentarz z @Magazyn, sprawdź odbiorcę w Powiadomienia.
10) Dodaj testowe zdjęcie w zakładce załączników.

WAŻNE OGRANICZENIA PILOTAŻU
- Powiadomienia tylko wewnątrz aplikacji, bez systemowego push.
- Działania i przesyłanie powiadomień wymagają połączenia internetowego.
- Firestore nie jest archiwum dużych skanów/zdjęć.
- Sam kod i reguły nie były przetestowane na rzeczywistym projekcie Firebase.
- Zanim użyjesz danych firmowych: audyt uprawnień, ilości, duplikatów,
  transakcyjności, kopii zapasowych i ochrony danych (RODO).
- Praca offline/synchronizacja konfliktów nie są w pełni obsługiwane.
