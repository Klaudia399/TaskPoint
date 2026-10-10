# TaskPoint BETA 0.9 — aktualizacja pilotażowa

**Ta wersja to pilotaż do testów. Nie jest certyfikowanym ani audytowanym produkcyjnym systemem zamówień.**

## Przypisywanie kilku kierowników do jednej budowy

- **Budowy → Kierownicy i zastępstwa:** administrator dodaje wielu kierowników do tej samej inwestycji, z branżą Budowlana, Sanitarna, Elektryczna albo Wszystkie branże. Jedna osoba może być przypisana do kilku branż.
- Przy dodawaniu kierownika można oznaczyć **Zastępstwo** i wpisać daty od–do. Użytkownik musi mieć aktywny profil o roli `kierownik`.
- Gdy powiadomienie dotyczy jednoznacznie jednej branży, trafia do aktualnie przypisanych kierowników tej branży; komentarze dotyczące całego zamówienia wielobranżowego mogą trafić do wszystkich kierowników inwestycji. Zarząd i zaopatrzenie zachowują ustalone zasady powiadomień.
- **Ważne ograniczenie 0.9:** data końcowa steruje informacjami i kierowaniem nowych powiadomień, ale nie wyłącza automatycznie dostępu Firebase. Po zakończeniu zastępstwa administrator musi kliknąć „Usuń przypisanie”. Kierownicy przypisani do tej samej budowy mają jeszcze dostęp do informacji ze wszystkich jej branż — filtr branżowy nie stanowi osobnego zabezpieczenia.
- Dotychczasowe przypisania zapisane tylko w `memberUids` są widoczne jako „Wszystkie branże”; po dodaniu pierwszego przypisania zostaną zachowane. Nie trzeba usuwać istniejących kont ani budów.

## Co nowego

- Zamówienia: filtr branży **Sanitarna / Budowlana / Elektryczna** (widok pozycji także w zamówieniach mieszanych).
- W formularzu zapotrzebowania: **wybierz z przedmiaru albo wpisz nazwę ręcznie**. Pojawiają się podpowiedzi podobnych nazw; to sugestie językowe, nie potwierdzenie równoważności technicznej. Użytkownik może wskazać powiązaną pozycję z listy.
- W tym samym formularzu: **zwykła pozycja / zmiana ilości / nowy materiał lub inne parametry**. Dla zmiany ilości podaje się nową ŁĄCZNĄ ilość, a nie przyrost. Zmiany trafiają do kolejki zaopatrzenie → zarząd i **nie tworzą zamówienia przed akceptacją**. Po akceptacji dodatkowej pozycji należy złożyć jej zamówienie na zatwierdzoną ilość.
- Dla każdej budowy: **zatowarowanie materiałowe**, rozliczane na podstawie odebranej ilości + ilości potwierdzonej ręcznie jako znajdującej się na budowie przed wdrożeniem, podzielone przez zatwierdzoną ilość (limit 100% na pozycję). Procent budowy to średnia realizacji pozycji, a nie suma jednostek nieporównywalnych (sztuk, mb, m³). Pozycje pominięte nie wchodzą do mianownika. Pozycje bez ustalonej ilości są pokazane osobno i również nie są uwzględniane.
- Administrator: **Ustaw status / stan** przy każdym materiale (Oczekuje, Realizowana, Zrealizowana ręcznie, Pominięta) i ilość już na budowie, uzasadnienie oraz zapis kto/kiedy.
- Administrator: **Stan początkowy inwestycji**: szacowane ogólne zaawansowanie (%) i uzasadnienie — to metryka INFORMACYJNA, celowo oddzielona od zatowarowania.
- Administrator: **Uzupełnij wiele materiałów** według branży/etapu, po świadomym potwierdzeniu, z pominięciem wcześniejszych korekt i konfliktów/RFI. Nie używaj szacunków jako potwierdzonych odbiorów!
- Zachowano istniejące logowanie Firebase, współdzielone zamówienia, WZ / małe zdjęcia, komentarze @, transport, potwierdzenia przyjazdu, historię i powiadomienia wewnętrzne. Wcześniej uruchomiony skrypt e-mail w Google Apps Script pozostaje osobną usługą; nie trzeba go ponownie instalować.

## Krótki test obsady kierowników

1. **Użytkownicy**: załóż osobne konta Firebase Authentication i profile `Kierownik budowy` (dla sanitarnego, budowlanego i elektrycznego).
2. **Budowy → Kierownicy i zastępstwa**: wybierz nazwisko z listy, branżę i typ Kierownik/Zastępstwo. Możesz dodać więcej niż jedną osobę dla tej samej inwestycji oraz więcej niż jednego kierownika jednej branży.
3. Otwórz budowę i sprawdź listę przypisań. Potem dodaj komentarz do jednoznacznie sanitarnego zamówienia i sprawdź powiadomienia kierownika sanitarnego.
4. Zastępstwo można ograniczyć datą dla powiadomień, **ale po zakończeniu usuń przypisanie**, żeby odebrać dostęp do Firebase. Kierownicy jednej budowy mają na razie wgląd we wszystkie branże jej danych.

## Aktualizacja na MacBooku

1. **Zrób eksport JSON** z bieżącej TaskPoint 0.8 (Ustawienia i eksport), jako kopię bezpieczeństwa dostępną ręcznie. Nie kasuj danych Firestore ani repozytorium.
2. Firebase Console → Firestore Database → Rules. Wklej **całość** pliku `FIRESTORE-RULES-0.9.txt`, kliknij Publish. **Nie pozostawiaj reguł domyślnie otwartych.** Jeśli pojawi się błąd, wstrzymaj aktualizację.
3. GitHub: istniejące repozytorium `Klaudia399/TaskPoint` → `Add file` → `Upload files` → wgraj z tej paczki **index.html, auth.js, workspace.js, styles.css, sw.js, manifest.webmanifest, icon-192.png, icon-512.png**. Zastąp odpowiadające im pliki, kliknij `Commit changes`.
4. Sprawdź stronę `https://klaudia399.github.io/TaskPoint/` najpierw w incognito. W zwykłej przeglądarce PWA może potrzebować odświeżenia pamięci Service Worker. Pliku reguł Firebase nie wgrywaj na GitHub.
5. **Test danych:** na budowie testowej dodaj materiały, ustaw ręczny stan częściowy (np. 7/10 szt.), sprawdź wskaźnik 70%; następnie test statusu Pominięta i zgłoszenie nowego materiału z formularza zamówienia. Sprawdź odczyt na innym urządzeniu.

## Ograniczenia i ostrożność

- Nadal wymagane: testy realnych uprawnień na kilku kontach, walidacji danych i poprawności procesów przy równoczesnych zapisach. Reguły mogą wymagać poprawek po testach — **nie używaj poufnych danych ani nie traktuj wyniku jako podstawy rozliczeń**.
- Dane w tej wersji pozostają w Twoim istniejącym projekcie Firebase Spark, w ramach limitów. Nie przechodź na plan Blaze bez decyzji o kosztach.
- Wskaźnik nie jest procentem finansowego ani robót budowlanych zaawansowania; to postęp listy materiałów. Korekty ręczne nie są dokumentem odbioru. Dla już prowadzonych inwestycji uzupełniaj je na podstawie inwentaryzacji i dokumentów.
- Lista RFI / ilości zerowe wymaga wyjaśnienia. Szacunek postępu początkowego jest oznaczony inaczej niż zatowarowanie.
- Powiadomienia aplikacyjne i automatyczna poczta (jeśli skonfigurowana osobno) nadal mają dotychczasowe ograniczenia; systemowych natywnych push z ikoną TaskPoint nie dodano w tej paczce.
- Pliki WZ/zdjęcia w Firestore są limitowane rozmiarem; większe dokumenty podłączaj bezpiecznym linkiem. GitHub Pages jest publiczny — **nigdy nie wgrywaj do niego haseł ani kluczy kont usługowych**.
