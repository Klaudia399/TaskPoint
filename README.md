# TaskPoint BETA 0.9.3 — filtr statusu

**Nowość:** lista **Materiały** i **Zamówienia** mają osobne filtry „Status”, które można łączyć z filtrami Budowa i Branża. W materiałach filtry korzystają ze statusu z Excela z pierwszeństwem zatwierdzonej ręcznej korekty administratora. Procent fizycznego zatowarowania pozostaje niezależny od statusu deklarowanego w Excelu. W Zamówieniach filtr statusu działa na **pozycjach** zamówienia, więc zamówienie mieszane pokazuje tylko pasujące pozycje. Filtr nie zmienia danych, nie nadpisuje statusów i nie wpływa na istniejący skrypt powiadomień.

**Aktualizacja:** nowe reguły Firebase **nie są potrzebne**; pozostaw opublikowane reguły 0.9.2. Zachowaj eksport danych na wszelki wypadek. Na GitHubie w istniejącym repozytorium TaskPoint wgraj osiem plików strony (index.html, auth.js, workspace.js, styles.css, sw.js, manifest.webmanifest, icon-192.png, icon-512.png), a następnie Commit changes. Po publikacji sprawdź w incognito. Pozostaw istniejący projekt Firebase bez zmian.

**Test:** Materiały → wybierz budowę Kazimierzów → branża Sanitarna → Status „Do zamówienia”; po zmianie na „W realizacji” tabela powinna pokazać inne pozycje. Zamówienia → wybierz status „Zamówione u dostawcy”, połącz z branżą i sprawdź, czy widoczne są tylko pasujące pozycje zamówień. Brak pozycji powinien dać komunikat „Brak ... w tym filtrze”.

---

# TaskPoint BETA 0.9.2 — aktualizacja pilotażowa

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
2. Firebase Console → Firestore Database → Rules. Wklej **całość** pliku `FIRESTORE-RULES-0.9.2.txt`, kliknij Publish. **Nie pozostawiaj reguł domyślnie otwartych.** Jeśli pojawi się błąd, wstrzymaj aktualizację.
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


## Nowość 0.9.2 — baza dostawców

- Nowa zakładka **Dostawcy** dla administratora, zaopatrzeniowca oraz zarządu (zarząd tylko odczyt).
- Kartoteka wspólna dla wszystkich budów: nazwa firmy, NIP, branża, miejscowość, osoba kontaktowa, telefon, e-mail, uwagi.
- W szczegółach zamówienia na pozycji **Zaakceptowane** kliknij **Zamówione u dostawcy**. Wybierz istniejącą firmę lub opcję **Dodaj nową firmę**.
- W tej samej operacji zapisywany jest dostawca (jeśli nowy) i przypisanie go do pozycji zamówienia, numer zamówienia u dostawcy i deklarowany termin dostawy.
- Jedno zamówienie może obejmować pozycje kupione u różnych dostawców; snapshot nazwy i NIP pozostanie na pozycji zamówienia także po późniejszej zmianie kartoteki.
- Uwaga: jest to wersja **BETA**. Zanim użyjesz realnych danych firmowych, przetestuj reguły dostępu, bezpieczeństwo edycji zamówień i tworzenie dostawców na osobnych kontach. Nie wpisuj jeszcze poufnych cen i warunków handlowych.
- Bazę dostawców można wyeksportować w pliku JSON przez Ustawienia i eksport (role z dostępem).
- Import dostawców z Excela oraz automatyczna identyfikacja istniejących dostawców to odrębny, przyszły moduł.

### Instalacja aktualizacji
1. Zachowaj kopię eksportu danych w BETA 0.9.
2. W Firebase wklej nowy plik **FIRESTORE-RULES-0.9.2.txt** i kliknij Publish.
3. Na GitHubie wgraj osiem plików aplikacji (index.html, auth.js, workspace.js, styles.css, sw.js, manifest.webmanifest, icon-192.png, icon-512.png), zastępując dotychczasowe.
4. Po wdrożeniu sprawdź w incognito: widoczność Dostawców, dodanie nowej firmy i zakup pozycji u dostawcy.
5. Dane starych zamówień pozostają w bazie, bez uzupełnionych dostawców; uzupełniamy ich przy nowych zakupach.


## Wersja 0.9.2 — bezpieczny import poprawionego pliku Kazimierzów
- Kolumny są rozpoznawane po **nagłówkach**, nie numerach — dotyczy nowej kolumny Status (K) oraz Ilość dostarczona (L).
- Statusy historyczne są zachowane jako osobne pole `excelStatus`; nie są mylone z jakościowym `rfiStatus`. Zachowane ID M-xxx, branża, priorytet, RFI i źródło.
- Z pliku „Kazimierzów poprawiony(1).xlsx” rozpoznajemy 402 pozycji, w tym 3 usługi/odpady wyłączone z materiałów: 399 propozycji do importu.
- **Ostrzeżenie krytyczne:** w arkuszu kolumna „Ilość dostarczona” równa się „Ilość do zamówienia” dla 387 wierszy, także „Do zamówienia” i „Pominięty”. Dane te są niespójne. Nie zaliczamy ich do fizycznego zatowarowania dla „W realizacji”, „Do zamówienia” ani „Pominięty”.
- Import domyślnie **NIE** potwierdza fizycznego stanu na budowie. Administrator może włączyć jawne potwierdzenie historycznych pozycji „Zrealizowany”, o ile rzeczywiście znajdują się na budowie, oraz wyłączenie „Pominięty”. Dla pozycji z pustą ilością postęp pozostaje do ustalenia.
- Duplikaty po ID są domyślnie pomijane. Administrator może dodatkowo wybrać aktualizację stanów już istniejących, ale nie nadpiszemy pozycji z potwierdzonym odbiorem, wcześniejszą ręczną korektą ani z inną zatwierdzoną ilością.
- Import tylko do testów. Użyj kopii pliku pozbawionej poufnych danych, najlepiej na testowej budowie. Przed wdrożeniem produkcyjnym niezbędna jest kontrola uprawnień i niezależna kopia bezpieczeństwa.
- Baza dostawców z wersji 0.9.1 pozostaje bez zmian — można przypisywać firmy przy zakupie danej pozycji.
- Wgranie na GitHub: osiem plików strony, a w Firebase opublikuj reguły **FIRESTORE-RULES-0.9.2.txt**. Nie wgrywaj pliku reguł na GitHub.
