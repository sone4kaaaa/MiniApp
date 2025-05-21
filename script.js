Telegram.WebApp.ready();


let tgUserId = null; // Будем хранить user_id от Telegram

// Если открыто внутри Telegram WebApp:
if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
    // Пытаемся получить данные initDataUnsafe
    const initData = Telegram.WebApp.initDataUnsafe || {};
    if (initData.user && initData.user.id) {
        tgUserId = String(initData.user.id);
        console.log('Запущено в Telegram WebApp, user_id =', tgUserId);
    } else {
        console.log('Нет initData.user.id в Telegram WebApp!');
    }
} else {
    console.log('Не в Telegram WebApp, возможно в браузере.');
}

// Фолбек: если tgUserId всё ещё null, возьмём ?user_id=... из URL
if (!tgUserId) {
    const params = new URLSearchParams(window.location.search);
    tgUserId = params.get('user_id') || 'guest10';
}
console.log('Итоговый userId =', tgUserId);



/* ----- ИНИЦИАЛИЗАЦИЯ FIREBASE ----- */
const firebaseConfig = {
    apiKey: "AIzaSyA6JL5JlJktik0k_3D_0vMl4fCD-E_7560",
    authDomain: "miniappenglish.firebaseapp.com",
    projectId: "miniappenglish",
    storageBucket: "miniappenglish.firebasestorage.app",
    messagingSenderId: "643117676341",
    appId: "1:643117676341:web:1b351a0ed7b7230f10fe7c",
    measurementId: "G-M0GLSY5FC5"
};
  
// Инициализация firebase (compat):
firebase.initializeApp(firebaseConfig);

// Получаем доступ к Firestore
const db = firebase.firestore();

/* ----- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ----- */
window.userStats = {
    modulesCompleted: 0,       // возможно, нужно или нет — по желанию
    lessonsCompleted: 0,       // от 0 до 30
    testsCompleted: 0,         // от 0 до 9 (промежуточные)
    finalTestsCompleted: 0,    // от 0 до 3 (итоговые)
  };
window.completedItems = new Set();

/* ----- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ FIRESTORE ----- */
async function loadUserDataFromServer(userId) {
    try {
      const docRef = db.collection("user_progress").doc(userId);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const savedData = docSnap.data();
        console.log("Данные пользователя:", savedData);
        
        if (savedData.userStats) {
          window.userStats = savedData.userStats;
        }
        if (savedData.completedItems) {
          window.completedItems = new Set(savedData.completedItems);
        }
      } else {
        console.log("Документ для этого userId не найден в Firestore.");
      }
    } catch (error) {
      console.error("Ошибка при загрузке данных из Firestore:", error);
    }
}

async function saveUserDataToServer(userId) {
    try {
      const docRef = db.collection("user_progress").doc(userId);
      const dataToSave = {
        userStats: window.userStats,
        completedItems: Array.from(window.completedItems),
      };
      await docRef.set(dataToSave, { merge: true });
      console.log("Прогресс сохранён:", dataToSave);
    } catch (error) {
      console.error("Ошибка при сохранении данных в Firestore:", error);
    }
}

/* ----- ЛОГИКА ПОЛУЧЕНИЯ user_id И СТАРТОВОЙ ЗАГРУЗКИ ----- */
function getTelegramUserId() {
    // Пробуем вытащить user_id из query-параметров
    const params = new URLSearchParams(window.location.search);
    return params.get('user_id') || "guest10";
}

function restoreUnlockItem(modulePath, fileName) {
    const container = document.querySelector(`.lessons-container[data-module="${modulePath}"]`);
    if (!container) return;

    // Находим саму кнопку
    const currentBtn = container.querySelector(
        `[data-lesson="${fileName}"], [data-test="${fileName}"]`
    );
    if (!currentBtn) return;

    // Разблокируем текущую кнопку
    currentBtn.disabled = false;
    currentBtn.classList.remove('locked', 'disabled');

    // Если это lesson10 => разблокируем финальный тест в этом модуле
    if (fileName.includes('lesson10.html')) {
        unlockFinalTestInModule(modulePath);
    }
    // Если это finaltest => разблокируем следующий модуль
    if (fileName.includes('finaltest')) {
        unlockNextModule(modulePath);
    }

    // А теперь разблокируем «следующую» кнопку по порядку
    const order = parseInt(currentBtn.dataset.order, 10);
    const nextOrder = order + 1;
    const nextBtn = container.querySelector(`[data-order="${nextOrder}"]`);
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.classList.remove('locked', 'disabled');
    }
}

function restoreUnlockedItems() {
    // Перебираем все UID из completedItems
    // Пример UID: "module1-lesson3.html"
    for (const uid of window.completedItems) {
        const [modulePath, fileName] = uid.split("-");

        // Разблокируем текущий урок/тест
        restoreUnlockItem(modulePath, fileName);
    }
}


  
  // Допустим, делаем функцию unlockItem(...)
function unlockItem(modulePath, fileName) {
    const container = document.querySelector(`.lessons-container[data-module="${modulePath}"]`);
    if (!container) return;
  
    const btn = container.querySelector(`[data-lesson="${fileName}"], [data-test="${fileName}"]`);
    if (!btn) return;
  
    btn.disabled = false;
    btn.classList.remove('locked', 'disabled');
}

function lockAllButFirstLesson() {
    // 1) Блокируем ВСЕ уроки и тесты (все кнопки .lesson-button и .test-button)
    const allLessonButtons = document.querySelectorAll('.lesson-button, .test-button');
    allLessonButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('locked', 'disabled');
    });
    // 2) Разблокируем только первый урок module1 => lesson1.html
    const module1Container = document.querySelector('.lessons-container[data-module="module1"]');
    if (module1Container) {
        const firstLesson = module1Container.querySelector('[data-lesson="lesson1.html"]');
        if (firstLesson) {
            firstLesson.disabled = false;
            firstLesson.classList.remove('locked','disabled');
        }
    }
}



/* ===== Примерная функция: разблокировать кнопки на основании userStats ===== */
function unlockItemsByStats() {
    const { lessonsCompleted, testsCompleted, finalTestsCompleted } = window.userStats;
    if (window.userStats.lessonsCompleted >= 30 &&
        window.userStats.testsCompleted >= 9 &&
        window.userStats.finalTestsCompleted >= 3
    ) {
        // Разблокируем все кнопки (какие хотите)
        const allButtons = document.querySelectorAll(
          '.lesson-button, .test-button, .final-test-btn, #module2-btn, #module3-btn'
        );
        allButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('locked', 'disabled');
        });
        
        // После этого выходим, чтобы дальше не сработали никакие «else { disabled = true }»
        return;
    }
    // 1. Модули
    // Модуль1 (id="module1-btn") всегда открыт (или открыт по умолчанию)
    // Модуль2 открывается, если finalTestsCompleted >= 1 (значит пройден итоговый тест модуля1)
    // Модуль3 открывается, если finalTestsCompleted >= 2
    const module2Btn = document.getElementById('module2-btn');
    const module3Btn = document.getElementById('module3-btn');
    if (module2Btn) {
      module2Btn.disabled = (finalTestsCompleted < 1);
      module2Btn.classList.toggle('disabled', finalTestsCompleted < 1);
    }
    if (module3Btn) {
      module3Btn.disabled = (finalTestsCompleted < 2);
      module3Btn.classList.toggle('disabled', finalTestsCompleted < 2);
    }
  
    // 2. Уроки
    // Например, у нас 30 уроков. Урок N доступен, если N <= lessonsCompleted+1
    // (т.е. «следующий» после уже пройденных, и все предыдущие).
   
    const maxLessonUnlocked = lessonsCompleted + 1;
    const lessonButtons = document.querySelectorAll('.lesson-button');
    lessonButtons.forEach(btn => {
        const mod = btn.dataset.module; // "module1", "module2", "module3"
        
        // 1) Если это module2, но finalTestsCompleted < 1 => всё заблокировано
        if (mod === 'module2' && window.userStats.finalTestsCompleted < 1) {
            btn.disabled = true;
            btn.classList.add('locked','disabled');
            return; 
        }
        // 2) Если это module3, но finalTestsCompleted < 2 => всё заблокировано
        if (mod === 'module3' && window.userStats.finalTestsCompleted < 2) {
            btn.disabled = true;
            btn.classList.add('locked','disabled');
            return;
        }

        // Если дошли сюда, значит модуль «открыт». Теперь решаем, сколько уроков в нём разблокировать.
        // Для module1 можно брать lessonsCompleted (0..10).
        // Для module2 – нужно вычесть 10 (если у вас один общий счётчик).
        // Для module3 – вычесть 20 и т.д.

        let localProgress = 0;
        let totalLessons = 10;
        
        if (mod === 'module1') {
            // У нас общий lessonsCompleted, но мы берем min(lessonsCompleted, 10).
            localProgress = Math.min(window.userStats.lessonsCompleted, 10);
        } else if (mod === 'module2') {
            // Отсекаем первые 10 уроков, которые относятся к module1
            // localProgress = (общийLessons - 10), но не меньше 0, не больше 10
            localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 10, 0), 10);
        } else if (mod === 'module3') {
            localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 20, 0), 10);
        }

        // Определяем номер урока
        const match = (btn.dataset.lesson || '').match(/lesson(\d+)\.html$/i);
        if (!match) {
            // Может быть тест, тогда отдельная логика
            return;
        }
        const lessonNum = parseInt(match[1], 10);

        // Если lessonNum <= localProgress + 1 => разблокируем
        if (lessonNum <= localProgress + 1) {
            btn.disabled = false;
            btn.classList.remove('locked','disabled');
        } else {
            btn.disabled = true;
            btn.classList.add('locked','disabled');
        }
        if (window.userStats.lessonsCompleted >= 30 &&
            window.userStats.testsCompleted >= 9 &&
            window.userStats.finalTestsCompleted >= 3) {
            
            // Селектор подбирайте под все свои кнопки:
            const allButtons = document.querySelectorAll(
              '.lesson-button, .test-button, .final-test-btn, #module2-btn, #module3-btn'
            );
    
            allButtons.forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('locked', 'disabled');
            });
        }
    });
  
    // 3. Промежуточные тесты (test1.html, test2.html, ... test9.html)
    // Пусть testN доступен, если lessonsCompleted >= 3*N
    const testButtons = document.querySelectorAll('.test-button');
    testButtons.forEach(btn => {
        // 1) Узнаём, к какому модулю относится тест
        const modulePath = btn.dataset.module; // "module1", "module2", "module3"
        
        // 2) Сначала проверяем, «открыт» ли модуль вообще
        //    (finalTestsCompleted < 1 => module2 закрыт, < 2 => module3 закрыт)
        if (modulePath === 'module2' && window.userStats.finalTestsCompleted < 1) {
          btn.disabled = true;
          btn.classList.add('locked','disabled');
          return; // даже не смотрим testNum
        }
        if (modulePath === 'module3' && window.userStats.finalTestsCompleted < 2) {
          btn.disabled = true;
          btn.classList.add('locked','disabled');
          return; 
        }
      
        // 3) Если модуль разрешён, парсим номер теста из файла (test1.html => 1)
        const file = btn.dataset.test || '';
        const m = file.match(/test(\d+)\.html$/i);
        if (!m) return;
        const testNum = parseInt(m[1], 10); // 1..9
      
        // 4) Считаем «локальный прогресс» (сколько уроков реально прошли в этом модуле)
        //    Если у вас один общий lessonsCompleted:
        let localProgress = 0;
        if (modulePath === 'module1') {
          localProgress = Math.min(window.userStats.lessonsCompleted, 10);
        } else if (modulePath === 'module2') {
          localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 10, 0), 10);
        } else if (modulePath === 'module3') {
          localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 20, 0), 10);
        }
      
        // 5) Сколько уроков нужно пройти, чтобы открыть тест testNum?
        //    Например, если testNum=1, пусть требуется 3 урока.
        const requiredLessons = testNum * 3; 
      
        // 6) Сравниваем
        if (localProgress >= requiredLessons) {
          btn.disabled = false;
          btn.classList.remove('locked','disabled');
        } else {
          btn.disabled = true;
          btn.classList.add('locked','disabled');
        }
    });
  
    // 4. Итоговые тесты
    // finalTestBtns: .final-test-btn[data-module="module1"], etc.
    // Модуль1: итоговый тест доступен, если lessonsCompleted >= 10
    // Модуль2: итоговый тест доступен, если lessonsCompleted >= 20
    // Модуль3: итоговый тест доступен, если lessonsCompleted >= 30
    const finalTest1 = document.querySelector('.final-test-btn[data-module="module1"]');
    const finalTest2 = document.querySelector('.final-test-btn[data-module="module2"]');
    const finalTest3 = document.querySelector('.final-test-btn[data-module="module3"]');
  
    if (finalTest1) {
      const canOpen1 = (lessonsCompleted >= 10);
      finalTest1.disabled = !canOpen1;
      finalTest1.classList.toggle('disabled', !canOpen1);
    }
    if (finalTest2) {
      const canOpen2 = (lessonsCompleted >= 20);
      finalTest2.disabled = !canOpen2;
      finalTest2.classList.toggle('disabled', !canOpen2);
    }
    if (finalTest3) {
      const canOpen3 = (lessonsCompleted >= 30);
      finalTest3.disabled = !canOpen3;
      finalTest3.classList.toggle('disabled', !canOpen3);
    }
}


/**
 * Функция, когда пользователь «завершает» урок или тест.
 * @param {string} type - 'lesson' | 'test' | 'final'
 * @param {string} modulePath - например, 'module1'
 * @param {string} fileName - например, 'lesson3.html' или 'test1.html'
 */
function finishLessonOrTest(type, modulePath, fileName) {
    // Создаём уникальный идентификатор для конкретного урока/теста
    const uid = `${modulePath}-${fileName}`;

    // Проверяем, не было ли уже добавлено в completedItems
    if (window.completedItems.has(uid)) {
      // Если уже есть — это значит, что статистику мы уже обновляли, повторно инкрементить не нужно
      console.log("Этот урок/тест уже отмечен как завершён:", uid);
      return;
    }

    // Добавляем в Set (теперь он считается пройденным)
    window.completedItems.add(uid);

    // В зависимости от типа — инкрементируем соответствующий счётчик.
    // Но обязательно делаем «зажим» (clamp), чтобы не превышало максимальных значений.
    if (type === 'lesson') {
      window.userStats.lessonsCompleted = Math.min(window.userStats.lessonsCompleted + 1, 30);
    } else if (type === 'test') {
      window.userStats.testsCompleted = Math.min(window.userStats.testsCompleted + 1, 9);
    } else if (type === 'final') {
      window.userStats.finalTestsCompleted = Math.min(window.userStats.finalTestsCompleted + 1, 3);
      // Если хотите одновременно засчитывать завершение модуля:
      // window.userStats.modulesCompleted = ... (по желанию)
    }

    // Теперь сохраняем обновлённые данные в Firestore
    saveUserDataToServer(window.userId);

    // Вызов лирики разблокировок
    unlockItemsByStats();
}



document.addEventListener('DOMContentLoaded', async () => {

    const userId = getTelegramUserId();
    window.userId = userId
    console.log("Запущено для userId:", userId);

    await loadUserDataFromServer(userId);
    console.log('Загруженные userStats:', window.userStats);

    // Инициализация уроков
    populateLessons('module1', 10, 3);
    populateLessons('module2', 10, 3);
    populateLessons('module3', 10, 3);

    //lockAllButFirstLesson();

    
    

    const userIdDisplayEl = document.getElementById("user-id-display");
    

    

    


    const moduleButtons = document.querySelectorAll('.button[id$="-btn"]');
    const mainButtons = document.getElementById('main-buttons');
    const moduleMenus = document.querySelectorAll('.buttons.hidden[id$="-menu"]');
    const backToMainBtns = document.querySelectorAll('.back-button[id^="back-to-main"]');
    const lessonsListContainers = document.querySelectorAll('.lessons-container.hidden[data-module]');
    const backToModuleBtns = document.querySelectorAll('.back-button[id^="back-to-module"]');
    const lessonContent = document.getElementById('lesson-content');
    const lessonDetails = document.getElementById('lesson-details');
    const appHeader = document.getElementById('app-header');


    
    

    


    

    

    // --- Функции-помощники ---
    
    function getNextModule(modulePath) {
        const modules = ['module1', 'module2', 'module3'];
        const i = modules.indexOf(modulePath);
        if (i === -1 || i === modules.length - 1) return null;
        return modules[i + 1];
    }

    function unlockFinalTestInModule(modulePath) {
        const finalBtn = document.querySelector(`.final-test-btn[data-module="${modulePath}"]`);
        if (finalBtn) {
            finalBtn.disabled = false;
            finalBtn.classList.remove('disabled');
        }
    }

    function unlockNextModule(modulePath) {
        const nextModule = getNextModule(modulePath);
        if (nextModule) {
            const nextModuleBtn = document.getElementById(`${nextModule}-btn`);
            if (nextModuleBtn) {
                nextModuleBtn.disabled = false;
                nextModuleBtn.classList.remove('disabled');
            }
        }
    }

    /**
     * Разблокировать следующий элемент (следующий урок/тест) — НО без автоклика!
     * completedFile: 'lesson3.html' или 'test1.html'
     */
    

    // --- Создание кнопки «Тест N» ---
    function createTestElement(testNumber, modulePath) {
        const btn = document.createElement('button');
        btn.textContent = `Тест ${testNumber}`;
        // Изначально блокируем
        btn.classList.add('test-button', 'locked', 'disabled');
        btn.dataset.test = `test${testNumber}.html`;
        btn.dataset.module = modulePath;
        // Порядок для сортировки
        btn.dataset.order = testNumber * 2;
    
        // Важно: изначально disabled
        btn.disabled = true;
    
        btn.addEventListener('click', () => {
            if (btn.disabled) return; // нажимать нельзя, пока заблокирован
    
            const file = btn.dataset.test;
            fetch(`modules/${modulePath}/${file}`)
                .then(r => {
                    if (!r.ok) throw new Error('Network error');
                    return r.text();
                })
                .then(html => loadContent(html, modulePath))
                .catch(e => {
                    console.error('Ошибка:', e);
                    alert('Не удалось загрузить тест.');
                });
        });
        return btn;
    }

    // --- Количество уроков ---
    function getTotalLessons(modulePath) {
        const data = { module1: 10, module2: 10, module3: 10 };
        return data[modulePath] || 0;
    }

    // --- Уроков на один тест (3) ---
    function getTestsPerModule(modulePath) {
        const data = { module1: 3, module2: 3, module3: 3 };
        return data[modulePath] || 3;
    }

    // --- Кнопка «Далее» (на уроке) ---
    function addNextLessonButton(currentLessonNumber, modulePath) {
        const exists = lessonDetails.querySelector('.next-lesson-btn');
        if (exists) return;

        const btn = document.createElement('button');
        btn.classList.add('next-lesson-btn', 'submit-btn');

        // Если это 10-й урок => «Перейти к итоговому тесту»
        if (currentLessonNumber === getTotalLessons(modulePath)) {
            btn.textContent = 'Перейти к итоговому тесту';
            btn.addEventListener('click', () => {
                // Для модуля 2 используем finaltest2.html
                // Для модуля 3 используем finaltest3.html
                // Для остальных — finaltest.html
                let finalFile = 'finaltest.html';
                if (modulePath === 'module2') {
                    finalFile = 'finaltest2.html';
                } else if (modulePath === 'module3') {
                    finalFile = 'finaltest3.html';
                }

                finishLessonOrTest('lesson', modulePath, `lesson${currentLessonNumber}.html`);
    
                fetch(`modules/${modulePath}/${finalFile}`)
                    .then(r => {
                        if (!r.ok) throw new Error('Network');
                        return r.text();
                    })
                    .then(html => {
                        loadContent(html, modulePath);
                        // Разблокируем итоговый тест (т.к. пользователь дошёл до 10 урока)
                        
                    })
                    .catch(e => console.error(e));
            });
        } else {
            // Не последний урок
            const tpm = getTestsPerModule(modulePath);
            // Если currentLessonNumber % tpm === 0 => пора на тест
            if (currentLessonNumber % tpm === 0) {
                const testNumber = currentLessonNumber / tpm;
                btn.textContent = 'Перейти к тесту';
                btn.addEventListener('click', () => {
                    const testFile = `test${testNumber}.html`;
                    // 1) Разблокируем следующий элемент (т.к. урок пройден)
                    finishLessonOrTest('lesson', modulePath, `lesson${currentLessonNumber}.html`);
                    // 2) Загружаем тест
                    fetch(`modules/${modulePath}/${testFile}`)
                        .then(r => {
                            if (!r.ok) throw new Error('Network');
                            return r.text();
                        })
                        .then(html => {
                            loadContent(html, modulePath);
                        })
                        .catch(e => console.error(e));
                });
            } else {
                // Обычный урок => «Далее» (загружаем сразу следующий урок)
                btn.textContent = 'Далее';
                btn.addEventListener('click', () => {
                    // 1) Разблокируем следующий элемент
                    finishLessonOrTest('lesson', modulePath, `lesson${currentLessonNumber}.html`);

                    // 2) Сразу загружаем следующий урок
                    const nextLessonFile = `lesson${currentLessonNumber + 1}.html`;
                    fetch(`modules/${modulePath}/${nextLessonFile}`)
                        .then(r => {
                            if (!r.ok) throw new Error('Network error');
                            return r.text();
                        })
                        .then(html => {
                            loadContent(html, modulePath);
                        })
                        .catch(e => {
                       
                           
                        });
                });
            }
        }

        const sections = lessonDetails.querySelectorAll('.section');
        if (sections.length > 0) {
            sections[sections.length - 1].insertAdjacentElement('afterend', btn);
        } else {
            lessonDetails.appendChild(btn);
        }
    }

    // --- Кнопка «Далее» после теста ---
    function addNextTestButton(currentTestNumber, modulePath) {
        const existingNextBtn = lessonDetails.querySelector('.next-test-btn');
        if (existingNextBtn) return;
    
        const nextBtn = document.createElement('button');
        nextBtn.classList.add('next-test-btn', 'submit-btn');
        nextBtn.textContent = 'Далее';
    
        // Формула следующего урока: (текущий тест N) => следующий урок = 3*N + 1
        const nextLessonNumber = currentTestNumber * getTestsPerModule(modulePath) + 1;
    
        nextBtn.addEventListener('click', () => {
            // Считаем, что пользователь «завершил» этот тест:
            const completedTestFile = `test${currentTestNumber}.html`;
            finishLessonOrTest('test', modulePath, `test${currentTestNumber}.html`);
    
            // Сразу грузим следующий урок 
            const nextLessonFile = `lesson${nextLessonNumber}.html`;
            fetch(`modules/${modulePath}/${nextLessonFile}`)
                .then(r => {
                    if (!r.ok) throw new Error('Network error');
                    return r.text();
                })
                .then(html => {
                    loadContent(html, modulePath);
                })
                .catch(e => {
                   
                });
        });
    
        // Добавляем кнопку «Далее» под контентом
        const allSections = lessonDetails.querySelectorAll('.section');
        if (allSections.length > 0) {
            const lastSection = allSections[allSections.length - 1];
            lastSection.insertAdjacentElement('afterend', nextBtn);
        } else {
            lessonDetails.appendChild(nextBtn);
        }
    }

    // --- Загрузка контента (урок или тест) ---
    function loadContent(html, modulePath) {
        lessonDetails.innerHTML = html;
        mainButtons.classList.add('hidden');
        moduleMenus.forEach(m => m.classList.add('hidden'));
        lessonsListContainers.forEach(c => c.classList.add('hidden'));
        lessonContent.classList.remove('hidden');
        appHeader.classList.add('hidden');

        // Определяем, тест это или урок
        if (html.includes('Тест') || html.includes('Test')) {
            // Парсим номер (Тест 1, Тест 2...)
            const re = /Тест\s+(\d+)/i;
            const match = html.match(re);
            if (match && match[1]) {
                const testNum = parseInt(match[1], 10);
                addNextTestButton(testNum, modulePath);
            }
            // Итоговый тест?
            if (html.includes('Итоговый тест') || html.includes('finaltest.html')) {
                addFinishButton(modulePath);
            }
        } else {
            // Это урок
            const re = /Урок\s+(\d+)/i;
            const match = html.match(re);
            if (match && match[1]) {
                const lessonNum = parseInt(match[1], 10);
                addNextLessonButton(lessonNum, modulePath);
                // Урок 10 => возможно, инициализация DnD
                if (lessonNum === 10) {
                    initializeLesson10();
                }
            }
        }
    }

    // --- Кнопка «Закончить» (итоговый тест) ---
    function addFinishButton(modulePath) {
        const quizDiv = lessonDetails.querySelector('.quiz');
        if (!quizDiv) return;
        if (quizDiv.querySelector('.finish-btn')) return;

        const btn = document.createElement('button');
        btn.classList.add('finish-btn');
        btn.textContent = 'Закончить';

        // Стили (вынести в CSS при желании)
        btn.style.width = '100%'; 
        btn.style.marginTop = '20px';
        btn.style.backgroundColor = '#17a2b8';
        btn.style.color = '#fff';
        btn.style.borderRadius = '10px';
        btn.style.fontSize = '18px';

        btn.addEventListener('click', () => {
            // Скрываем контент
            lessonContent.classList.add('hidden');
            lessonDetails.innerHTML = '';
            appHeader.classList.remove('hidden');
            // Показываем меню текущего модуля
            document.getElementById(`${modulePath}-menu`).classList.remove('hidden');
            // Разблокируем следующий модуль
            unlockNextModule(modulePath);
        });

        const feedbackDiv = quizDiv.querySelector('.feedback');
        if (feedbackDiv) {
            feedbackDiv.insertAdjacentElement('afterend', btn);
        } else {
            quizDiv.appendChild(btn);
        }
    }

    // --- populateLessons: создаём уроки и промежуточные тесты (блокируем все кроме первого урока) ---
    function populateLessons(modulePath, totalLessons, testsPerModule) {
        const container = document.querySelector(`.lessons-container[data-module="${modulePath}"]`);
        if (!container) return;
        const backBtn = container.querySelector(`#back-to-module${modulePath.slice(-1)}`);
        let order = 1;
    
        for (let i = 1; i <= totalLessons; i++) {
            const lessonBtn = document.createElement('button');
            lessonBtn.textContent = `Урок ${i}`;
            // Изначально блокируем
            lessonBtn.classList.add('lesson-button', 'locked', 'disabled');
            lessonBtn.dataset.lesson = `lesson${i}.html`;
            lessonBtn.dataset.module = modulePath;
            lessonBtn.dataset.order = order;
    
            // Только Урок №1 разблокирован:
            if (i === 1) {
                lessonBtn.disabled = false;
                lessonBtn.classList.remove('locked', 'disabled');
            } else {
                lessonBtn.disabled = true;
            }
    
            lessonBtn.addEventListener('click', () => {
                if (lessonBtn.disabled) return;
                const file = lessonBtn.dataset.lesson;
                fetch(`modules/${modulePath}/${file}`)
                    .then(r => {
                        if (!r.ok) throw new Error('Network error');
                        return r.text();
                    })
                    .then(html => loadContent(html, modulePath))
                    .catch(e => {
                        
                    });
            });
    
            container.insertBefore(lessonBtn, backBtn);
            order++;
    
            // После каждого 3-го урока (testsPerModule = 3), но не после 10-го
            if (i % testsPerModule === 0 && i < totalLessons) {
                const testNumber = i / testsPerModule;
                const testEl = createTestElement(testNumber, modulePath);
                testEl.dataset.order = order;
                container.insertBefore(testEl, backBtn);
                order++;
            }
        }
    }

    

    // Кнопки модулей => показываем меню
    moduleButtons.forEach(b => {
        b.addEventListener('click', () => {
          const mp = b.id.replace('-btn', '');
          mainButtons.classList.add('hidden');
          moduleMenus.forEach(mm => {
            mm.classList.add('hidden');
            if (mm.id === `${mp}-menu`) mm.classList.remove('hidden');
          });
          // Обновляем индикатор текущего модуля:
          document.getElementById('current-module').textContent =
            mp.replace('module', 'Модуль ');
        });
    });

    // Кнопка «Назад к списку модулей»
    backToMainBtns.forEach(b => {
        b.addEventListener('click', () => {
          moduleMenus.forEach(m => m.classList.add('hidden'));
          mainButtons.classList.remove('hidden');
          // Сбросим отображение текущего модуля:
          document.getElementById('current-module').textContent = "";
        });
      });

    // Кнопка «Уроки»
    const lessonsBtns = document.querySelectorAll('.lessons-btn');
    lessonsBtns.forEach(b => {
        b.addEventListener('click', () => {
            const mp = b.dataset.module;
            moduleMenus.forEach(m => m.classList.add('hidden'));
            lessonsListContainers.forEach(c => {
                c.classList.toggle('hidden', c.dataset.module !== mp);
            });
            lessonContent.classList.add('hidden');
            lessonDetails.innerHTML = '';
        });
    });

    // Кнопка «Назад к меню модуля»
    backToModuleBtns.forEach(b => {
        b.addEventListener('click', () => {
            const n = b.id.replace('back-to-module', '');
            const mp = `module${n}`;
            lessonsListContainers.forEach(c => c.classList.add('hidden'));
            moduleMenus.forEach(m => {
                if (m.id === `${mp}-menu`) m.classList.remove('hidden');
            });
            lessonContent.classList.add('hidden');
            lessonDetails.innerHTML = '';
        });
    });

    // Делаем loadContent доступной глобально
    window.loadContent = loadContent;

    /**
     * Функция проверки Теста 1
     */
    window.checkTest = function() {
    const answers = {
        tq1: 'dog',       
        tq2: 'мяч',             
        tq3: '/e/',              
        tq4: 'eight',                   
        tq5: 'xylophone',             
        tq6: '/kæt/',             
        tq7: 'zero,one,two,three',         
        tq8: 'hat'       
    };

    let score = 0;
    const total = Object.keys(answers).length;

    for (const key in answers) {
        const input = document.getElementById(key);
        if (!input) continue;

        // Считываем ответ
        const userAnswer = input.value.trim().toLowerCase();
        const correctAnswer = answers[key].toLowerCase();

        if (userAnswer === correctAnswer) {
            score++;
            // Подсветим зелёным
            input.style.borderColor = '#28a745';
        } else {
            // Подсветим красным
            input.style.borderColor = '#dc3545';
        }
    }

    // Отображаем результат
    const feedback = document.getElementById('test-feedback');
    if (!feedback) return;

    feedback.style.display = 'block';
    if (score === total) {
        feedback.className = 'feedback success';
        feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
    } else {
        feedback.className = 'feedback error';
        feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
    }
    };

    /**
     * Функция проверки Теста 2
     */
    window.checkTest2 = function() {
        const answers = {
            q1: 'purple',
            q2: 'yours',
            q3: 'us',
            q4: 'sister',
            q5: 'an',
            q6: 'the',
            q7: 'light blue',
            q8: 'родители',
            q9: 'my',
            q10: 'a'
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            let userAnswer = '';
            if (input.tagName.toLowerCase() === 'select') {
                userAnswer = input.value.trim().toLowerCase();
            } else {
                userAnswer = input.value.trim().toLowerCase();
            }

            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                input.style.borderColor = '#28a745'; // зеленый
            } else {
                input.style.borderColor = '#dc3545'; // красный
            }
        }

        const feedback = document.getElementById('test2-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    /**
     * Функция проверки Теста 3
     */
    window.checkTest03 = function() {
        const answers = {
            q1: 'am', 
            q2: 'are',
            q3: 'cities',
            q4: 'pets',
            q5: 'books',
            q6: 'girls’',
            q7: 'is',
            q8: 'good morning',
            q9: 'horses',
            q10: "is"
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            // Считываем ответ пользователя
            let userAnswer = input.value.trim().toLowerCase();
            // Удалим финальную точку, если она есть, чтобы не мешала проверке
            userAnswer = userAnswer.replace(/\.+$/, '');
            
            // Правильный ответ
            let correctAnswer = answers[key].toLowerCase();
            // Аналогично, если хотите, убираем у правильного ответа финальную точку
            correctAnswer = correctAnswer.replace(/\.+$/, '');

            // Проверка точного совпадения
            if (userAnswer === correctAnswer) {
                score++;
                input.style.borderColor = '#28a745'; // Зеленый
            } else {
                input.style.borderColor = '#dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('test3-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    /**
     * Функция проверки Итогового теста (finaltest.html)
     */
    window.checkFinalTest = function() {
        const answers = {
            q1: 'twelve',
            q2: 'money',
            q3: 'summer',
            q4: 'an apple',
            q5: 'is',
            q6: 'autumn',
            q7: 'книги мальчика',
            q8: 'cat',
            q9: 'mine',
            q10: 'a book'
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            let userAnswer = '';
            if (input.tagName.toLowerCase() === 'select') {
                userAnswer = input.value.trim().toLowerCase();
            } else {
                userAnswer = input.value.trim().toLowerCase();
            }

            let correctAnswer = answers[key].toLowerCase();


            if (userAnswer === correctAnswer && correctAnswer !== 'incorrect') {
                score++;
                input.style.borderColor = '#28a745'; // зеленый
            } else {
                input.style.borderColor = '#dc3545'; // красный
            }
        }

        const feedback = document.getElementById('finaltest-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Превосходно! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    // Добавление кнопки "Итоговый тест" для каждого модуля
   
    const finalTestButtons = document.querySelectorAll('.final-test-btn');
    finalTestButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('disabled');
        btn.addEventListener('click', () => {
            const modulePath = btn.dataset.module;
            let testFile = 'finaltest.html';  // По умолчанию для module1
            if (modulePath === 'module2') {
                testFile = 'finaltest2.html';
            } else if (modulePath === 'module3') {
                testFile = 'finaltest3.html';
            }

            fetch(`modules/${modulePath}/${testFile}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.text();
                })
                .then(data => {
                    loadContent(data, modulePath);
                })
                .catch(error => {
                    console.error('Ошибка при загрузке итогового теста:', error);
                    alert('Не удалось загрузить итоговый тест. Попробуйте позже.');
                });
        });
    });

    unlockItemsByStats();


    window.checkQuiz01 = function() {
        const answers = {
            q1: 'zebra',
            q2: 'tiger',
            q3: 'dog',
            q4: 'cat',
            q5: 'owl'
        };

        let score = 0;
        let total = Object.keys(answers).length;

        for (let key in answers) {
            const userAnswer = document.getElementById(key).value.trim().toLowerCase();
            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745'; // Зеленый
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };

    window.checkMatching01 = function() {
        const matches = {
            match1: '1',
            match2: '3',
            match3: '2',
            match4: '1',
            match5: '3',
            match6: '1',
            match7: '2',
            match8: '1'
        };

        let score = 0;
        let total = Object.keys(matches).length;

        for (let key in matches) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === matches[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('matching-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Все верно! Отличная работа.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };
    /**
 * --- ИГРЫ ---
 */

// ---------- Игра: Соедини цифру и слово ----------
const numberWords = [
    "zero", "one", "two", "three", "four", "five",
    "six", "seven", "eight", "nine", "ten", "eleven", "twelve"
];

/**
 * Функция перемешивания массива
 * @param {Array} array - Массив для перемешивания
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

/**
 * Функция генерации игры "Соедини цифру и слово"
 */
window.generateMatchingGame = function(){
    const container = document.getElementById('matching-game');
    if (!container) return; // Если контейнер не найден — выходим

    let html = '';

    // Создаём массив чисел от 0 до 12 и перемешиваем
    const numbers = Array.from({ length: 13 }, (_, i) => i);
    shuffleArray(numbers);

    numbers.forEach(i => {
        html += `
            <div class="matching-item" id="match-${i}">
                <label class="match-number match-color-${i}">${i}</label>
                <select>
                    <option value="">выбери</option>
                    ${numberWords.map(word => `<option value="${word}">${word}</option>`).join('')}
                </select>
            </div>
        `;
    });

    container.innerHTML = html;
};

/**
 * Функция проверки игры "Соедини цифру и слово"
 */
window.checkMatching = function() {
    for (let i = 0; i <= 12; i++) {
        const item = document.querySelector(`#match-${i}`);
        if (!item) continue; // Если элемента нет — пропускаем

        const select = item.querySelector('select');
        const selected = select.value;
        const correct = numberWords[i];

        // Изменяем цвет в зависимости от правильности ответа
        item.style.backgroundColor = selected === correct ? "#d4edda" : "#f8d7da";
    }
};


// ---------- Игра: Угадай число по аудио ----------
const maxNumber = 12;
let correctNumber = 0;

/**
 * Функция генерации случайного числа
 * @param {number} max - Максимальное значение
 * @param {Array} exclude - Массив чисел для исключения
 */
function getRandomInt(max, exclude = []) {
    let num;
    do {
        num = Math.floor(Math.random() * max);
    } while (exclude.includes(num));
    return num;
}

/**
 * Функция воспроизведения случайного аудио и генерации ответов
 */
window.playRandomAudio = function() {
    correctNumber = getRandomInt(maxNumber + 1);
    const audioHTML = `
        <audio controls autoplay>
            <source src="./assets/audios/en_num_${correctNumber.toString().padStart(2, '0')}.mp3" type="audio/mp3">
            Ваш браузер не поддерживает аудио.
        </audio>
    `;
    document.getElementById('audio-player').innerHTML = audioHTML;
    generateAnswerButtons();
    document.getElementById('result').style.display = 'none';
};

/**
 * Функция генерации кнопок для ответа
 */
function generateAnswerButtons() {
    const answers = [correctNumber];
    while (answers.length < 3) {
        const rand = getRandomInt(maxNumber + 1, answers);
        answers.push(rand);
    }

    // Перемешиваем
    answers.sort(() => Math.random() - 0.5);

    const buttonsHTML = answers.map(num => `
        <button onclick="checkAnswer(${num})" class="submit-btn">${num}</button>
    `).join('');

    document.getElementById('answer-buttons').innerHTML = buttonsHTML;
}

/**
 * Функция проверки выбранного ответа
 * @param {number} selectedNumber - Число, выбранное пользователем
 */
window.checkAnswer = function(selectedNumber) {
    const resultDiv = document.getElementById('result');
    resultDiv.style.display = 'block';

    if (selectedNumber === correctNumber) {
        resultDiv.className = 'feedback success';
        resultDiv.innerHTML = `✅ Молодец! Это <strong>${correctNumber}</strong>!<br><button onclick="playRandomAudio()" class="submit-btn">Следующее число ▶️</button>`;
    } else {
        resultDiv.className = 'feedback error';
        resultDiv.innerHTML = `❌ Это не <strong>${selectedNumber}</strong>. Попробуй ещё раз!`;
    }
};

    window.checkQuiz03 = function() {
    const form = document.getElementById('transcription-quiz');
    const feedback = document.getElementById('quiz-feedback');

    if (!form || !feedback) {
        console.error('Не найдены элементы формы или блока с обратной связью');
        return;
    }

    const formData = new FormData(form);
    let score = 0;
    const total = 6;

    // Сброс подсветки у всех меток
    const allLabels = form.querySelectorAll('label');
    allLabels.forEach(label => {
        label.classList.remove('correct-answer', 'wrong-answer');
    });

    // Проверка каждой группы радиокнопок
    for (let i = 1; i <= total; i++) {
        // Важно: шаблонные строки для селектора
        const radios = form.querySelectorAll(`input[name="q${i}"]`);
        const selectedValue = formData.get(`q${i}`);

        if (selectedValue !== null) {
            radios.forEach(radio => {
                if (radio.checked) {
                    if (radio.value === "1") {
                        radio.parentElement.classList.add('correct-answer');
                        score++;
                    } else {
                        radio.parentElement.classList.add('wrong-answer');
                    }
                }
            });
        }
    }

    feedback.style.display = 'block';
    if (score === total) {
        feedback.className = 'feedback success';
        feedback.textContent = 'Отлично! Все ответы верны!';
    } else {
        feedback.className = 'feedback error';
        feedback.textContent = `Вы набрали ${score} из ${total}. Попробуйте ещё раз!`;
    }
};
    window.checkQuiz05 = function() {
    const form = document.getElementById('transcription-quiz');
    const feedback = document.getElementById('quiz-feedback');
    const formData = new FormData(form);
    let score = 0;
    const total = 6;

    // Сброс подсветки у всех меток
    const allLabels = form.querySelectorAll('label');
    allLabels.forEach(label => {
        label.classList.remove('correct-answer', 'wrong-answer');
    });

    // Проверка каждого вопроса
    for (let i = 1; i <= total; i++) {
        const radios = form.querySelectorAll(`input[name="q${i}"]`);
        const selectedValue = formData.get(`q${i}`);

        if (selectedValue !== null) {
            radios.forEach(radio => {
                if (radio.checked) {
                    if (radio.value === "1") {
                        radio.parentElement.classList.add('correct-answer');
                        score++;
                    } else {
                        radio.parentElement.classList.add('wrong-answer');
                    }
                }
            });
        }
    }

    // Вывод результата
    feedback.style.display = 'block';
    if (score === total) {
        feedback.className = 'feedback success';
        feedback.innerText = 'Отлично! Все ответы верны!';
    } else {
        feedback.className = 'feedback error';
        feedback.innerText = `Вы набрали ${score} из ${total}. Попробуйте ещё раз!`;
    }
};
    window.initMatchingGame = function () {
        const pairs = [
        ["Father", "отец"],
        ["Mother", "мать"],
        ["Brother", "брат"],
        ["Sister", "сестра"],
        ["Grandmother", "бабушка"],
        ["Grandfather", "дедушка"],
        ["Wife", "жена"],
        ["Husband", "муж"],
        ["Son", "сын"],
        ["Daughter", "дочь"]
    ];
    const startBtn = document.getElementById('startBtn');
    startBtn.style.display = 'none';
    const cards = [];
    const gameContainer = document.getElementById("matching-game");

    // Создание карточек и перемешивание
    pairs.forEach(([eng, rus]) => {
        cards.push({ text: eng, pair: rus });
        cards.push({ text: rus, pair: eng });
    });

    // Перемешать массив
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    shuffle(cards);

    let flippedCards = [];
    let lockBoard = false;

    function createCard(cardObj) {
        const card = document.createElement("div");
        card.className = "card";
        card.textContent = "";
        card.dataset.text = cardObj.text;
        card.dataset.pair = cardObj.pair;

        card.addEventListener("click", function () {
            if (lockBoard || card.classList.contains("flipped") || card.classList.contains("matched")) return;

            card.classList.add("flipped");
            card.textContent = card.dataset.text;
            flippedCards.push(card);

            if (flippedCards.length === 2) {
                lockBoard = true;
                const [first, second] = flippedCards;

                if (first.dataset.text === second.dataset.pair || first.dataset.pair === second.dataset.text) {
                    first.classList.add("matched");
                    second.classList.add("matched");
                    flippedCards = [];
                    lockBoard = false;
                } else {
                    setTimeout(() => {
                        first.classList.remove("flipped");
                        second.classList.remove("flipped");
                        first.textContent = "";
                        second.textContent = "";
                        flippedCards = [];
                        lockBoard = false;
                    }, 1000);
                }
            }
        });

        return card;
    }

    cards.forEach(cardObj => {
        gameContainer.appendChild(createCard(cardObj));
    });
    };

    window.checkQuiz06 = function () {
        const answers = ["an", "a", "the", "an", "a", "an", "the", "an", "a", "the"];
        let correct = 0;

        for (let i = 0; i < answers.length; i++) {
            const input = document.getElementById("q" + (i + 1));
            const userInput = input.value.trim().toLowerCase();

            if (userInput === answers[i]) {
                input.style.border = "2px solid green";
                correct++;
            } else {
                input.style.border = "2px solid red";
            }
        }

        const feedback = document.getElementById("articles-feedback");
        feedback.style.display = "block";

        if (correct === answers.length) {
            feedback.className = "feedback success";
            feedback.innerText = "Умничка! Все ответы правильные 🎉";
        } else {
            feedback.className = "feedback error";
            feedback.innerText = `Правильных ответов: ${correct} из 10. Попробуй ещё раз!`;
        }
    };
    
    window.initMemoryGame = function () {
          (function(){
            const gameContainer = document.getElementById('memory-game');
            const resultDiv = document.getElementById('memory-result');
            const startBtn = document.getElementById('startBtn');
            startBtn.style.display = 'none';
            const pairs = [
            {id: 1, word: 'Ram', img: 'https://i.pinimg.com/736x/9c/41/93/9c41933a38c7c9edd31424df47cd6861.jpg'},
            {id: 2, word: 'Fox', img: 'https://avatars.mds.yandex.net/i?id=f7bfe4f6b5d56075fcf4942b0bad0b8be30a699d-10115282-images-thumbs&n=13'}, 
            {id: 3, word: 'Rabbit', img: 'https://avatars.mds.yandex.net/i?id=6c2b61033d5b0bfa57fd56b9e583469e_l-5288839-images-thumbs&n=13'},
            {id: 4, word: 'Bird', img: 'https://avatars.mds.yandex.net/i?id=b44db42ae67a1088b76dd423793e40ab_l-4306607-images-thumbs&ref=rim&n=13&w=2305&h=2560'},
            {id: 5, word: 'Elephant', img: 'https://avatars.mds.yandex.net/i?id=1fa52a6e74759c17b5a6f127c3e6ef8ef5b4d9ac-5680887-images-thumbs&n=13'},
            {id: 6, word: 'Wolf', img: 'https://avatars.mds.yandex.net/i?id=527a62ce8b275f99cb44147bdac558393fa0f8da-4766550-images-thumbs&n=13'},
            {id: 7, word: 'Duck', img: 'https://i.pinimg.com/736x/14/3c/a1/143ca1e1a42e1336b8376cbea1863ab7.jpg'},
            {id: 8, word: 'Horse', img: 'https://avatars.mds.yandex.net/i?id=e5a660a7c01fcbb66a7b6be983435992_l-10126215-images-thumbs&n=13'}
            ];

            let cards = [];
            pairs.forEach(p => {
            cards.push({type: 'word', id: p.id, content: p.word});
            cards.push({type: 'img', id: p.id, content: p.img});
            });

            // Перемешиваем
            function shuffle(arr) {
            for(let i = arr.length -1; i>0; i--){
                let j = Math.floor(Math.random()*(i+1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
            }
            cards = shuffle(cards);

            // Создаем карточки DOM
            gameContainer.innerHTML = '';
            cards.forEach((card, i) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'memory-card';
            cardEl.dataset.id = card.id;
            cardEl.dataset.type = card.type;
            cardEl.dataset.index = i;
            cardEl.style.width = '120px';
            cardEl.style.height = '150px';
            cardEl.style.border = '2px solid #666';
            cardEl.style.borderRadius = '10px';
            cardEl.style.backgroundColor = '#fff';
            cardEl.style.display = 'flex';
            cardEl.style.alignItems = 'center';
            cardEl.style.justifyContent = 'center';
            cardEl.style.cursor = 'pointer';
            cardEl.style.userSelect = 'none';
            cardEl.style.fontSize = '18px';
            cardEl.style.fontWeight = 'bold';
            cardEl.style.textAlign = 'center';
            cardEl.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
            cardEl.style.transition = 'transform 0.3s';
            cardEl.style.position = 'relative';

            // Скрытое содержимое (фронт и бэк)
            const front = document.createElement('div');
            front.className = 'front-face';
            front.style.position = 'absolute';
            front.style.width = '100%';
            front.style.height = '100%';
            front.style.backfaceVisibility = 'hidden';
            front.style.borderRadius = '10px';
            front.style.backgroundColor = '#89e66f';
            front.style.display = 'flex';
            front.style.alignItems = 'center';
            front.style.justifyContent = 'center';
            front.style.fontSize = '24px';
            front.textContent = '?';

            const back = document.createElement('div');
            back.className = 'back-face';
            back.style.position = 'absolute';
            back.style.width = '100%';
            back.style.height = '100%';
            back.style.backfaceVisibility = 'hidden';
            back.style.borderRadius = '10px';
            back.style.backgroundColor = '#fff';
            back.style.display = 'flex';
            back.style.alignItems = 'center';
            back.style.justifyContent = 'center';
            back.style.transform = 'rotateY(180deg)';

            if(card.type === 'word'){
                back.textContent = card.content;
                back.style.fontSize = '20px';
                back.style.fontWeight = 'bold';
                back.style.color = '#1e6a05';
                back.style.padding = '10px';
            } else {
                const img = document.createElement('img');
                img.src = card.content;
                img.alt = 'animal';
                img.style.maxWidth = '80px';
                img.style.maxHeight = '80px';
                back.appendChild(img);
            }

            cardEl.style.transformStyle = 'preserve-3d';
            cardEl.style.transition = 'transform 0.5s';
            cardEl.appendChild(front);
            cardEl.appendChild(back);
            gameContainer.appendChild(cardEl);
            });

            let flippedCards = [];
            let matchedCount = 0;
            const totalPairs = pairs.length;

            gameContainer.addEventListener('click', e => {
            const clicked = e.target.closest('.memory-card');
            if (!clicked) return;
            if (flippedCards.includes(clicked)) return;
            if (clicked.classList.contains('matched')) return;
            if (flippedCards.length === 2) return;

            flipCard(clicked);

            flippedCards.push(clicked);

            if (flippedCards.length === 2){
                const [card1, card2] = flippedCards;
                if (card1.dataset.id === card2.dataset.id && card1.dataset.type !== card2.dataset.type) {
                // Пара найдена
                card1.classList.add('matched');
                card2.classList.add('matched');
                matchedCount++;
                flippedCards = [];

                if(matchedCount === totalPairs){
                    resultDiv.textContent = '🎉 Поздравляем! Вы нашли все пары!';
                }
                } else {
                // Не пара, переворачиваем обратно через секунду
                setTimeout(() => {
                    flipCard(card1);
                    flipCard(card2);
                    flippedCards = [];
                }, 1000);
                }
            }
            });

            function flipCard(card) {
            if(card.style.transform === 'rotateY(180deg)'){
                card.style.transform = 'rotateY(0deg)';
            } else {
                card.style.transform = 'rotateY(180deg)';
            }
            }
        })();
    };
window.initShoppingCartGame = function () {
    const correctItems = ["Milk", "Carrot", "Sausage", "Cake", "Cucumber", "Rice"];
    const items = document.querySelectorAll('.draggable-item');
    const cart = document.getElementById('cart');
    const feedback = document.getElementById('feedback');
    const startBtn = document.getElementById('startBtn');
    const checkBtn = document.getElementById('checkBtn');
    const clearBtn = document.getElementById('clearBtn');
    const itemsContainer = document.getElementById('items');

    if (!startBtn || !cart || !items.length) return;

    let selectedItems = [];

    // Игра стартует сразу
    let gameStarted = true;

    // Скрываем кнопку старт сразу
    startBtn.style.display = 'none';

    // Показываем кнопки Проверить и Очистить сразу
    checkBtn.style.display = 'inline-block';
    clearBtn.style.display = 'inline-block';

    // Активируем контейнер с товарами сразу
    itemsContainer.style.pointerEvents = 'auto';
    itemsContainer.style.opacity = '1';

    feedback.innerText = '';
    feedback.style.display = 'none';

    items.forEach(item => {
        item.addEventListener('click', () => {
            if (!gameStarted) return;
            const clone = item.cloneNode(true);
            clone.classList.add("in-cart");
            cart.appendChild(clone);
            selectedItems.push(item.textContent);
        });
    });

    window.checkCart = function () {
    const cartItems = Array.from(cart.querySelectorAll('.in-cart')).map(el => el.textContent);
    let correctCount = 0;
    let extraItems = [];

    // Подсчёт правильных и лишних товаров
    cartItems.forEach(item => {
        if (correctItems.includes(item)) {
            correctCount++;
        } else {
            extraItems.push(item);
        }
    });

    feedback.style.display = 'block';

    if (correctCount === correctItems.length && extraItems.length === 0 && cartItems.length === correctItems.length) {
        feedback.className = "feedback success";
        feedback.innerText = "Молодец! Всё верно ✅";
    } else if (extraItems.length > 0) {
        feedback.className = "feedback error";
        feedback.innerText = `В корзине лишние товары: ${extraItems.join(', ')}. Попробуй снова!`;
    } else {
        feedback.className = "feedback error";
        feedback.innerText = `Правильных: ${correctCount} из ${correctItems.length}. Попробуй снова!`;
    }
};


    window.clearCart = function () {
        cart.innerHTML = `<p><strong>Shopping Cart:</strong> (Нажимай на продукты)</p>`;
        selectedItems = [];
        feedback.style.display = 'none';
    };
};
    window.checkQuiz08 = function() {
        const answers = {
            q1: 'is',
            q2: 'are',
            q3: 'am'
        };

        let score = 0;
        let total = Object.keys(answers).length;

        for (let key in answers) {
            const userAnswer = document.getElementById(key).value.trim().toLowerCase();
            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745'; // Зеленый
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };

    window.checkMatching08 = function() {
        const matches = {
            match1: '1',
            match2: '2',
            match3: '1'
        };

        let score = 0;
        let total = Object.keys(matches).length;

        for (let key in matches) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === matches[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('matching-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Все верно! Отличная работа.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkQuiz2_4 = function() {
        const answers = {
            q1: 'Are',
            q2: 'Is',
            q3: 'am'
        };

        let score = 0;
        let total = Object.keys(answers).length;

        for (let key in answers) {
            const userAnswer = document.getElementById(key).value.trim().toLowerCase();
            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745'; // Зеленый
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };

    window.checkMatching2_4 = function() {
        const matches = {
            match1: '1',
            match2: '2',
            match3: '1'
        };

        let score = 0;
        let total = Object.keys(matches).length;

        for (let key in matches) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === matches[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('matching-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Все верно! Отличная работа.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkQuiz2_2 = function() {
        const answers = {
            q1: 'run',
            q2: 'swim',
            q3: 'dance',
            q4: 'read'
        };

        let score = 0;
        let total = Object.keys(answers).length;

        for (let key in answers) {
            const userAnswer = document.getElementById(key).value.trim().toLowerCase();
            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745'; // Зеленый
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };
    window.checkQuiz2_3 = function() {
        const answers = {
            q1: 'dress,socks,shoes',
            q2: 'T-shirt,shorts,shorts,shoes',
            q3: 'dress,socks,shoes',
            q4: 'T-shirt,pants,shoes'
        };

        let score = 0;
        let total = Object.keys(answers).length;

        for (let key in answers) {
            const userAnswer = document.getElementById(key).value.trim().toLowerCase();
            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745'; // Зеленый
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };

    /**
 * Функция добавляет кнопку "Закончить" в конец .quiz (для итогового теста)
 * @param {string} modulePath - путь текущего модуля, например "module1"
 */
    function addFinishButton(modulePath) {
        const quizDiv = lessonDetails.querySelector('.quiz');
        if (!quizDiv) return;
    
        if (quizDiv.querySelector('.finish-btn')) return;
        const finishBtn = document.createElement('button');
        finishBtn.classList.add('finish-btn');
        finishBtn.textContent = 'Закончить';
    
        // Стилизация (можно вынести в CSS)
        finishBtn.style.marginTop = '20px';
        finishBtn.style.width = '100%';
        finishBtn.style.backgroundColor = '#17a2b8';
        finishBtn.style.color = '#fff';
        finishBtn.style.border = 'none';
        finishBtn.style.borderRadius = '10px';
        finishBtn.style.fontSize = '18px';
        finishBtn.style.padding = '10px';
        finishBtn.style.cursor = 'pointer';
        finishBtn.style.transition = 'background-color 0.3s ease';
    
        finishBtn.addEventListener('click', () => {
            // Скрываем контент, возвращаемся в меню текущего модуля
            lessonContent.classList.add('hidden');
            lessonDetails.innerHTML = '';
            appHeader.classList.remove('hidden');
            document.getElementById(`${modulePath}-menu`).classList.remove('hidden');

            finishLessonOrTest('final', modulePath, 'finaltest.html');
    
            // Разблокируем следующий модуль
            unlockNextModule(modulePath);
        });
    
        const feedbackDiv = quizDiv.querySelector('.feedback');
        if (feedbackDiv) {
            feedbackDiv.insertAdjacentElement('afterend', finishBtn);
        } else {
            quizDiv.appendChild(finishBtn);
        }
    }

    window.checkFinalTest2 = function() {
        const answers = {
            q21: 'lemon',
            q22: 'I like to run, swim and dance',
            q23: 'T-shirt,shorts,shoes',
            q24: '2',
            q25: 'I have got a sister',
            q26: '1',
            q27: '3',
            q28: '2',
            q29: 'January',
            q210: 'Mouth'
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            let userAnswer = input.value.trim().toLowerCase();
            userAnswer = userAnswer.replace(/\.+$/, '');
            let correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer && correctAnswer !== 'incorrect') {
                score++;
                input.style.borderColor = '#28a745';
            } else {
                input.style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('finaltest2-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    /**
     * Тест 1 (Модуль 2): Advanced Verb Tenses
     * ID вопросов: q1..q10 (каждый свой)
     */
    window.checkTest1 = function() {
        // Правильные ответы
        const answers = {
            q1: 'морковь',                   
            q2: 'banana',                    
            q3: 'tomato',                  
            q4: 'apple',                     
            q5: 'run',                       
            q6: 'drink tea',                    
            q7: 'boots',                 
            q8: 'hat',                      
            q9: 'cucumber',                 
            q10: 'eat'                       
        };


        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const userEl = document.getElementById(key);
            if (!userEl) continue; // на случай опечаток
            // Считываем ответ
            let userAnswer = userEl.value.trim().toLowerCase();
            // Удалим финальную точку, если есть
            userAnswer = userAnswer.replace(/\.+$/, '');

            let correctAnswer = answers[key].toLowerCase();

            // Можно добавить "варианты ответов" для тех вопросов, где допускаются синонимы
            // if (key === 'q4') { ... }

            // Проверяем точное совпадение (или делаем более гибко)
            if (userAnswer === correctAnswer) {
                score++;
                userEl.style.borderColor = '#28a745'; // зеленый
            } else {
                userEl.style.borderColor = '#dc3545'; // красный
            }
        }

        // Показываем результат
        const feedback = document.getElementById('test1-feedback');
        if (feedback) {
            feedback.style.display = 'block';
            if (score === total) {
                feedback.className = 'feedback success';
                feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
            } else {
                feedback.className = 'feedback error';
                feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
            }
        }
    };


    /**
     * Тест 2 (Модуль 2)
     */
window.checkTest22 = function() {
    const answers = { 
        q1: 'Have you got a brother?',                       
        q2: 'have',                                          
        q3: 'Has',                                           
        q4: "She hasn't got a dog.",                         
        q5: 'bread with butter',                             
        q6: 'We have got oranges.',                          
        q7: 'How old are you?',                             
        q8: 'Where',                                         
        q9: "He hasn't got a brother.",                      
        q10: 'tea and coffee'                                
    };

    let score = 0;
    const total = Object.keys(answers).length;

    for (const key in answers) {
        const userEl = document.getElementById(key);
        if (!userEl) continue;

        const correctAnswer = answers[key];

        let userAnswer;
        if (userEl.tagName.toLowerCase() === 'select') {
            // Для select — сравниваем как есть (без изменения регистра и пунктуации)
            userAnswer = userEl.value;
        } else {
            // Для input — обрезаем лишние пробелы и приводим к нижнему регистру
            userAnswer = userEl.value.trim().toLowerCase();
            userAnswer = userAnswer.replace(/[.?!]+$/, '');
        }

        let correctToCompare = correctAnswer;
        if (userEl.tagName.toLowerCase() !== 'select') {
            correctToCompare = correctToCompare.toLowerCase().replace(/[.?!]+$/, '');
        }

        if (userAnswer === correctToCompare) {
            score++;
            userEl.style.borderColor = '#28a745';
        } else {
            userEl.style.borderColor = '#dc3545';
        }
    }

    const feedback = document.getElementById('test2-feedback');
    if (feedback) {
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    }
};


    /**
     * Тест 3 (Модуль 2)
     */
    window.checkTest2_3 = function() {
    const answers = {
        q1: 'new year',          
        q2: 'teen',        
        q3: 'wednesday',         
        q4: 'december',       
        q5: "baker's",           
        q6: 'costumes',          
        q7: 'ty',            
        q8: 'cafe',              
        q9: 'september',         
        q10: 'fireworks'         
    };

    let score = 0;
    const total = Object.keys(answers).length;

    for (const key in answers) {
        const userEl = document.getElementById(key);
        if (!userEl) continue;
        let userAnswer = userEl.value.trim().toLowerCase();
        userAnswer = userAnswer.replace(/\.+$/, '');

        let correctAnswer = answers[key].toLowerCase();

        if (userAnswer === correctAnswer) {
            score++;
            userEl.style.borderColor = '#28a745';
        } else {
            userEl.style.borderColor = '#dc3545'; 
        }
    }

    const feedback = document.getElementById('test3-feedback');
    if (feedback) {
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    }
};


    window.checkQuiz2_5 = function() {
        // Массив или объект с "правильными" ответами
        const answers = {
            ie1: "have got",
            ie2: "has not got",
            ie3: "Has she got a brother?"
        };
    
        let score = 0;
        let total = Object.keys(answers).length;
    
        // 1) Проверка поля ie1
        let user1 = document.getElementById('ie1').value.trim().toLowerCase();
        if (user1 === answers.ie1) {
            score++;
            document.getElementById('ie1').style.borderColor = '#28a745';
        } else {
            document.getElementById('ie1').style.borderColor = '#dc3545';
        }
    
        // 2) Проверка поля ie2
        let user2 = document.getElementById('ie2').value.trim().toLowerCase();
        if (user2 === answers.ie2) {
            score++;
            document.getElementById('ie2').style.borderColor = '#28a745';
        } else {
            document.getElementById('ie2').style.borderColor = '#dc3545';
        }
    
        // 3) Проверка селекта ie3
        let user3 = document.getElementById('ie3').value;
        if (user3 === answers.ie3) {
            score++;
            document.getElementById('ie3').style.borderColor = '#28a745';
        } else {
            document.getElementById('ie3').style.borderColor = '#dc3545';
        }
    
        const feedback = document.getElementById('idioms-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все ответы верны.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkQuiz2_9 = function() {
        const answers = {
            q1: 'twenty two',
            q2: 'thirty eight',
            q3: 'forty six',
            q4: 'sixty three',
            q5: 'ninety one'
        };

        let score = 0;
        let total = Object.keys(answers).length;

        for (let key in answers) {
            const userAnswer = document.getElementById(key).value.trim().toLowerCase();
            const correctAnswer = answers[key].toLowerCase();

            if (userAnswer === correctAnswer) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745'; // Зеленый
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545'; // Красный
            }
        }

        const feedback = document.getElementById('quiz-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };

    // Функция проверки итогового теста для Модуля 3
    window.checkFinalTest3 = function() {
        // Правильные ответы
        const answers = {
            q31: 'realized', 
            q32: 'had started',
            q33: 'did we expect',
            q34: 'what is crucial now is your determination',
            q35: 'it is honesty that i need more than anything',
            q36: 'be',
            q37: 'would have spoken',
            q38: 'must have done',
            q39: 'hadn’t forgotten',  // принимаем варианты апострофа: hadn’t / hadn't
            q310: 'what i really want is a bit of peace'
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            // Считываем ответ
            let userAnswer = '';
            if (input.tagName.toLowerCase() === 'select') {
                userAnswer = input.value.trim().toLowerCase();
            } else {
                userAnswer = input.value.trim().toLowerCase();
            }

            // Удаляем точки/апострофы, если хотите (или добавляйте "acceptableAnswers")
            userAnswer = userAnswer.replace(/\.+$/, '');

            let correctAnswer = answers[key].toLowerCase();

            // Добавим варианты, если нужно
            // Если q39: hadn’t / hadn't
            if (key === 'q39') {
                const variants = [
                    'hadn’t forgotten',
                    "hadn't forgotten"
                ];
                if (variants.includes(userAnswer)) {
                    correctAnswer = userAnswer;
                } else {
                    correctAnswer = 'incorrect';
                }
            }
            
            // Проверка
            if (userAnswer === correctAnswer && correctAnswer !== 'incorrect') {
                score++;
                input.style.borderColor = '#28a745';
            } else {
                input.style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('finaltest3-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Превосходно! Все ответы верны (${score} из ${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.initBodyGuessGame = function () {
  const quizData = [
    { img: "https://media.baamboozle.com/uploads/images/153453/1603748867_187492", answer: "Arm", options: ["Leg", "Hand", "Arm", "Foot"] },
    { img: "https://www.clipartmax.com/png/full/70-705132_boy-face-head-smile-young-png-image-cartoon-man-face.png", answer: "Head", options: ["Head", "Hair", "Back", "Ear"] },
    { img: "https://i.pinimg.com/originals/9c/6c/c9/9c6cc908efa14dcea2d081f91c73ea0d.png", answer: "Mouth", options: ["Nose", "Mouth", "Eyes", "Teeth"] },
    { img: "https://bumper-stickers.ru/34160-thickbox_default/glaza.jpg", answer: "Eyes", options: ["Cheeks", "Eyes", "Fingers", "Hair"] },
    { img: "https://media.baamboozle.com/uploads/images/369062/1634708215_27059.png", answer: "Leg", options: ["Hand", "Leg", "Foot", "Arm"] },
    { img: "https://img.meddoclab.ru/img/46/e6/46e636797e30b436b09b13e37c68f249.jpg", answer: "Tooth", options: ["Mouth", "Tooth", "Nose", "Ear"] },
  ];

  let currentQuestion = 0;
  let correctAnswered = false;

  function shuffleImg(array) {
    return array.sort(() => Math.random() - 0.5);
  }

  function showQuestion() {
    const startBtn = document.getElementById('startBtn');
    startBtn.style.display = 'none';
    const bodyImg = document.getElementById('question-image');
    bodyImg.style.display = 'block';
    correctAnswered = false;
    const question = quizData[currentQuestion];
    document.getElementById("body-image").src = question.img;
    const optionsContainer = document.getElementById("options");
    optionsContainer.innerHTML = "";

    const shuffledOptions = shuffleImg([...question.options]);
    shuffledOptions.forEach(option => {
      const btn = document.createElement("button");
      btn.textContent = option;
      btn.className = "submit-btn";
      btn.onclick = () => checkAnswerBody(btn, option, question.answer);
      optionsContainer.appendChild(btn);
    });
  }

  function checkAnswerBody(button, selected, correct) {
    if (correctAnswered) return;

    if (selected === correct) {
      button.style.backgroundColor = "#28a745"; // зелёный
      correctAnswered = true;

      // блокируем все кнопки
      const allButtons = document.querySelectorAll("#options button");
      allButtons.forEach(btn => btn.disabled = true);

      setTimeout(() => {
        currentQuestion++;
        if (currentQuestion >= quizData.length) {
          document.getElementById("game-container").innerHTML = "<h4>Игра завершена! Молодец!</h4>";
        } else {
          showQuestion();
        }
      }, 1000);
    } else {
      button.style.backgroundColor = "#dc3545"; // красный
      button.disabled = true; // нельзя нажимать на уже выбранную неправильную
    }
  }

  showQuestion();
};


    /******************************************************************************
     *            ФУНКЦИИ ДЛЯ ПРОВЕРКИ ТЕСТОВ МОДУЛЯ 3
     ******************************************************************************/

    // === Тест 1: Advanced Grammar Test (test1.html) ===
    window.checkAdvancedGrammarTest1 = function() {
        // Пример правильных ответов (корректируйте на свои):
        // Задание 1: tg1, tg2
        // "If she _______ (have) more time, she _______ (travel) abroad."
        // "The report _______ (submit) by the end of the day."
        // Пусть будет:
        // tg1: "had, would travel"
        // tg2: "must be submitted" (либо "should be submitted", в зависимости от ваших условий)

        const correctAnswers = {
            tg1: ["had, would travel", "had would travel"], 
            tg2: ["must be submitted", "should be submitted", "is to be submitted"] // можно несколько вариантов
        };

        let score = 0;
        let total = 2;

        // tg1
        let user1 = document.getElementById('tg1').value.trim().toLowerCase();
        // Удаляем лишние точки/запятые
        user1 = user1.replace(/[.,]+$/g, '');
        // Проверяем, входит ли ответ в массив допустимых
        if (correctAnswers.tg1.map(a => a.toLowerCase()).includes(user1)) {
            score++;
            document.getElementById('tg1').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg1').style.borderColor = '#dc3545';
        }

        // tg2
        let user2 = document.getElementById('tg2').value.trim().toLowerCase();
        user2 = user2.replace(/[.,]+$/g, '');
        if (correctAnswers.tg2.map(a => a.toLowerCase()).includes(user2)) {
            score++;
            document.getElementById('tg2').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg2').style.borderColor = '#dc3545';
        }

        // Показываем результат
        const fb = document.getElementById('advancedgrammartest1-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkSentenceTransformationTest1 = function() {
        // Задание 2 (test1.html): Преобразование предложений
        // "The experiment was conducted by the research team."
        // "They have finished the project."
        // "If I were the manager, I would implement new policies."

        // Примерные "правильные" варианты (подстраивайтесь под вашу логику)
        const correctAnswers = {
            tg_rw1: "the research team conducted the experiment",
            tg_rw2: "the project has been finished by them",
            tg_rw3: "if i were the manager, i would implement new policies"
        };

        let score = 0;
        let total = 3;

        // 1)
        let user1 = document.getElementById('tg_rw1').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user1 === correctAnswers.tg_rw1) {
            score++;
            document.getElementById('tg_rw1').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg_rw1').style.borderColor = '#dc3545';
        }

        // 2)
        let user2 = document.getElementById('tg_rw2').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user2 === correctAnswers.tg_rw2) {
            score++;
            document.getElementById('tg_rw2').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg_rw2').style.borderColor = '#dc3545';
        }

        // 3)
        let user3 = document.getElementById('tg_rw3').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user3 === correctAnswers.tg_rw3) {
            score++;
            document.getElementById('tg_rw3').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg_rw3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('sentencetransformationtest1-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Замечательно! Предложения преобразованы верно.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Правильных ответов: ${score} из ${total}. Проверьте ещё раз.`;
        }
    };

    window.checkModalVerbsTest1 = function() {
        // Задание 3 (test1.html): Модальные глаголы
        // tg_modal1 => "can"
        // tg_modal2 => "must"
        // tg_modal3 => "could"

        let correct = {
            tg_modal1: 'can',
            tg_modal2: 'must',
            tg_modal3: 'could'
        };

        let score = 0;
        let total = 3;

        // 1
        let user1 = document.getElementById('tg_modal1').value;
        if (user1 === correct.tg_modal1) {
            score++;
            document.getElementById('tg_modal1').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg_modal1').style.borderColor = '#dc3545';
        }

        // 2
        let user2 = document.getElementById('tg_modal2').value;
        if (user2 === correct.tg_modal2) {
            score++;
            document.getElementById('tg_modal2').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg_modal2').style.borderColor = '#dc3545';
        }

        // 3
        let user3 = document.getElementById('tg_modal3').value;
        if (user3 === correct.tg_modal3) {
            score++;
            document.getElementById('tg_modal3').style.borderColor = '#28a745';
        } else {
            document.getElementById('tg_modal3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('modalverbs_test1-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Модальные глаголы выбраны верно.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    // === Тест 2: Advanced Structures Test (test2.html) ===
    window.checkAdvancedStructuresTest2 = function() {
        // ... аналогичная логика
        // as1, as2
        const correct = {
            as1: ["it was he", "it was my teacher", "it was john"], // пример
            as2: ["rarely", "seldom"] // пример
        };

        let score = 0;
        let total = 2;

        let user1 = document.getElementById('as1').value.trim().toLowerCase();
        let user2 = document.getElementById('as2').value.trim().toLowerCase();

        // Проверка as1
        if (correct.as1.some(ans => ans === user1)) {
            score++;
            document.getElementById('as1').style.borderColor = '#28a745';
        } else {
            document.getElementById('as1').style.borderColor = '#dc3545';
        }
        // Проверка as2
        if (correct.as2.includes(user2)) {
            score++;
            document.getElementById('as2').style.borderColor = '#28a745';
        } else {
            document.getElementById('as2').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('advancedstructures_test2-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Все пропуски заполнены верно.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkSentenceTransformationTest2 = function() {
        // as_rw1, as_rw2, as_rw3
        // и т.д.
        // Логика аналогична предыдущему
        // ...

        let correct = {
            as_rw1: "never has she visited paris",
            as_rw2: "all they have is one goal",
            as_rw3: "if he had studied harder, he would pass the exam"
        };

        let score = 0;
        let total = 3;

        // 1
        let user1 = document.getElementById('as_rw1').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user1 === correct.as_rw1) {
            score++;
            document.getElementById('as_rw1').style.borderColor = '#28a745';
        } else {
            document.getElementById('as_rw1').style.borderColor = '#dc3545';
        }

        // 2
        let user2 = document.getElementById('as_rw2').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user2 === correct.as_rw2) {
            score++;
            document.getElementById('as_rw2').style.borderColor = '#28a745';
        } else {
            document.getElementById('as_rw2').style.borderColor = '#dc3545';
        }

        // 3
        let user3 = document.getElementById('as_rw3').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user3 === correct.as_rw3) {
            score++;
            document.getElementById('as_rw3').style.borderColor = '#28a745';
        } else {
            document.getElementById('as_rw3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('sentencetransformationtest2-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Все предложения преобразованы верно.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}.`;
        }
    };

    window.checkModalVerbsTest2 = function() {
        // as_modal1, as_modal2, as_modal3
        // ...
        let correct = {
            as_modal1: 'must',
            as_modal2: 'can',
            as_modal3: ['had, would get', 'had would get']  // или т.д.
        };

        let score = 0;
        let total = 3;

        // 1
        let user1 = document.getElementById('as_modal1').value;
        if (user1.toLowerCase() === correct.as_modal1) {
            score++;
            document.getElementById('as_modal1').style.borderColor = '#28a745';
        } else {
            document.getElementById('as_modal1').style.borderColor = '#dc3545';
        }

        // 2
        let user2 = document.getElementById('as_modal2').value;
        if (user2.toLowerCase() === correct.as_modal2) {
            score++;
            document.getElementById('as_modal2').style.borderColor = '#28a745';
        } else {
            document.getElementById('as_modal2').style.borderColor = '#dc3545';
        }

        // 3
        let user3 = document.getElementById('as_modal3').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        // Можно проверить массив acceptableAnswers
        if (correct.as_modal3.includes(user3)) {
            score++;
            document.getElementById('as_modal3').style.borderColor = '#28a745';
        } else {
            document.getElementById('as_modal3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('modalverbs_test2-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Замечательно! Все модальные формы верны.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}.`;
        }
    };

    // === Тест 3: Comprehensive Grammar Test (test3.html) ===
    window.checkComprehensiveGrammarTest = function() {
        // cg1, cg2, cg3
        // ...
        let correct = {
            cg1: ['she needs', 'she need'],  // Скажем, "she needs"
            cg2: ['were, would take', 'were would take'], 
            cg3: ['must have', 'should have', 'could have']
        };

        let score = 0;
        let total = 3;

        // 1
        let user1 = document.getElementById('cg1').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (correct.cg1.includes(user1)) {
            score++;
            document.getElementById('cg1').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg1').style.borderColor = '#dc3545';
        }

        // 2
        let user2 = document.getElementById('cg2').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (correct.cg2.includes(user2)) {
            score++;
            document.getElementById('cg2').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg2').style.borderColor = '#dc3545';
        }

        // 3
        let user3 = document.getElementById('cg3').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (correct.cg3.includes(user3)) {
            score++;
            document.getElementById('cg3').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('comprehensivegrammar-test-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Все ответы в Задании 1 верны.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkSentenceTransformationTest3 = function() {
        // cg_rw1, cg_rw2, cg_rw3
        // ...
        let correct = {
            cg_rw1: 'rarely has she visited museums',
            cg_rw2: 'all they have is one goal',
            cg_rw3: 'if he had studied harder, he would pass the exam'
        };

        let score = 0;
        let total = 3;

        // ...
        let user1 = document.getElementById('cg_rw1').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user1 === correct.cg_rw1) {
            score++;
            document.getElementById('cg_rw1').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg_rw1').style.borderColor = '#dc3545';
        }

        let user2 = document.getElementById('cg_rw2').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user2 === correct.cg_rw2) {
            score++;
            document.getElementById('cg_rw2').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg_rw2').style.borderColor = '#dc3545';
        }

        let user3 = document.getElementById('cg_rw3').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (user3 === correct.cg_rw3) {
            score++;
            document.getElementById('cg_rw3').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg_rw3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('sentencetransformationtest3-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Отлично! Предложения преобразованы верно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}.`;
        }
    };

    window.checkModalVerbsTest3 = function() {
        // cg_modal1, cg_modal2, cg_modal3
        // ...
        let correct = {
            cg_modal1: 'could',
            cg_modal2: 'can',
            cg_modal3: ['had, would get', 'had would get']
        };

        let score = 0;
        let total = 3;

        // 1
        let user1 = document.getElementById('cg_modal1').value.toLowerCase();
        if (user1 === correct.cg_modal1) {
            score++;
            document.getElementById('cg_modal1').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg_modal1').style.borderColor = '#dc3545';
        }

        // 2
        let user2 = document.getElementById('cg_modal2').value.toLowerCase();
        if (user2 === correct.cg_modal2) {
            score++;
            document.getElementById('cg_modal2').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg_modal2').style.borderColor = '#dc3545';
        }

        // 3
        let user3 = document.getElementById('cg_modal3').value.trim().toLowerCase().replace(/[.,]+$/g, '');
        if (correct.cg_modal3.includes(user3)) {
            score++;
            document.getElementById('cg_modal3').style.borderColor = '#28a745';
        } else {
            document.getElementById('cg_modal3').style.borderColor = '#dc3545';
        }

        const fb = document.getElementById('modalverbs_test3-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Отлично! С модальными глаголами всё в порядке.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}.`;
        }
    };

    const statsBtn = document.getElementById('stats-btn');
    statsBtn.addEventListener('click', showStats);

    const statsCloseBtn = document.getElementById('stats-close-btn');
    statsCloseBtn.addEventListener('click', function() {
        // 1) Прячем окно статистики
        document.getElementById('stats-modal').classList.add('hidden');
        // 2) Показываем главный экран с модулями
        mainButtons.classList.remove('hidden');
        // 3) А все возможные экраны уроков/тестов/меню модулей скрываем
        moduleMenus.forEach(m => m.classList.add('hidden'));
        lessonsListContainers.forEach(c => c.classList.add('hidden'));
        lessonContent.classList.add('hidden');
        document.getElementById('current-module').textContent = "";
    });
    

    function showStats() {
        // Добавляем finalTestsCompleted
        const { modulesCompleted, lessonsCompleted, testsCompleted, finalTestsCompleted } = window.userStats;
        
        // 1) Находим нашу модалку и контент
        const statsModal = document.getElementById('stats-modal');
        const statsContent = document.getElementById('stats-content');
    
        // 2) Формируем HTML (примерный вариант)
        statsContent.innerHTML = `
            <h3>Моя статистика</h3>
            <p>Уроков завершено: ${lessonsCompleted} / 30</p>
            <p>Промежуточных тестов пройдено: ${testsCompleted} / 9</p>
            <p>Итоговых тестов пройдено: ${finalTestsCompleted} / 3</p>
        `;
        
        // 3) Показываем модальное окно
        statsModal.classList.remove('hidden');
    }

    unlockItemsByStats();

    restoreUnlockedItems();
    
});