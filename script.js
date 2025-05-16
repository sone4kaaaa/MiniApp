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
    // Подбираем корректные ответы под реальные вопросы
    const answers = {
        tq1: 'thank you',       // Q1: "Спасибо" -> "thank you"
        tq2: 'are',             // Q2: "They ___ students." -> "are"
        tq3: 'am',              // Q3: "I ___ happy." -> "am"
        tq4: 'доброе утро',     // Q4: "Good morning" in Russian -> "доброе утро" 
                                //   (или "dobroe utro" — на ваше усмотрение)
        tq5: 'is',              // Q5: "She ___ a doctor." -> "is"
        tq6: 'are',             // Q6: "They ___ here." -> "are"
        tq7: 'goodbye',         // Q7: "До свидания" -> "goodbye"
        tq8: 'am',              // Q8: "I ___ a student." -> "am"
        tq9: 'is',              // Q9: "He ___ a teacher." -> "is"
        tq10: 'excuse me'       // Q10: "Извините" -> "excuse me"
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
            q1: 'hello',
            q2: 'is',
            q3: 'have',
            q4: 'i do not understand',
            q5: 'bought',
            q6: 'goes',
            q7: 'how are you?',
            q8: 'have',
            q9: 'was',
            q10: 'sorry, i am late'
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
    window.checkTest3 = function() {
        // Подбираем ответы в соответствии с вопросами в HTML
        const answers = {
            q1: 'he should have come yesterday', 
            q2: 'had known',
            q3: 'should have',
            q4: 'if i were rich, i would be traveling around the world.',
            q5: 'might have',
            q6: 'would have',
            q7: 'i could have helped if i had known.',
            q8: 'could have',
            q9: 'must have',
            q10: "if they hadn't been late, they would have caught the train."
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
        // Теперь ответы соответствуют реальному содержимому finaltest.html
        const answers = {
            // 1) "If I ___ (to know) about your plan..." => "had known"
            q1: 'had known',
            // 2) "Я должен был предупредить тебя, но забыл." => перфектный модальный
            q2: 'i should have warned you, but i forgot.',
            // 3) "Never ___ (I / to see) such an incredible performance." => "have I seen"
            q3: 'have i seen',
            // 4) "It is crucial that he ___ (to finish) the project..." => "finish"
            q4: 'finish',
            // 5) "What I need is some rest."
            q5: 'what i need is some rest',
            // 6) смешанное условие: "If she ___ here now..."
            // (в вашем примере: "were")
            q6: 'were',
            // 7) "Had I known the truth, I ___ differently." => "would have acted"
            q7: 'would have acted',
            // 8) "Если бы она не опоздала, она бы помогала нам сейчас"
            // Ожидается: "if she hadn’t been late, she would be helping us now"
            q8: 'if she hadn’t been late, she would be helping us now',
            // 9) "She must have been very tired."
            q9: 'she must have been very tired',
            // 10) "The boss insists that she ___ (to attend) the meeting" => "attend"
            q10: 'attend'
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

            // Добавим "допустимые ответы" для некоторых вопросов
            if (key === 'q2') {
                // Вопрос 2: "I should have warned you, but I forgot." — несколько способов
                const acceptableAnswers = [
                    'i should have warned you, but i forgot.',
                    'i should have warned you but i forgot.',
                    'i should have warned you but forgot.',
                    'i should have warned you but i forgot'
                ];
                if (acceptableAnswers.includes(userAnswer)) {
                    correctAnswer = userAnswer; // Принимаем как верный
                } else {
                    correctAnswer = 'incorrect';
                }
            } else if (key === 'q5') {
                // Вопрос 5: "What I need is some rest." — без/с точкой
                const acceptableAnswers = [
                    'what i need is some rest',
                    'what i need is some rest.'
                ];
                if (acceptableAnswers.includes(userAnswer)) {
                    correctAnswer = userAnswer;
                } else {
                    correctAnswer = 'incorrect';
                }
            } else if (key === 'q8') {
                // Вопрос 8: "If she hadn’t been late, she would be helping us now."
                // Добавим все популярные варианты (прямой апостроф, наклонный апостроф, бэктик)
                const acceptableAnswers = [
                    "if she hadn't been late, she would be helping us now",
                    "if she hadn’t been late, she would be helping us now",
                    "if she hadn`t been late, she would be helping us now"
                ];
                if (acceptableAnswers.includes(userAnswer)) {
                    correctAnswer = userAnswer;
                } else {
                    correctAnswer = 'incorrect';
                }
            } else if (key === 'q9') {
                // Вопрос 9: "She must have been very tired." — без/с точкой
                const acceptableAnswers = [
                    'she must have been very tired',
                    'she must have been very tired.'
                ];
                if (acceptableAnswers.includes(userAnswer)) {
                    correctAnswer = userAnswer;
                } else {
                    correctAnswer = 'incorrect';
                }
            }

            // Окончательная проверка
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
    // -------------------------------------------------------------
    //  ДОБАВЛЕННЫЙ КОД ДЛЯ РАБОТЫ ЗАДАНИЙ (Quiz + Matching)
    // -------------------------------------------------------------

    /**
     * Глобальная функция: проверка квиза (заполнение пропусков).
     * Вызывается из HTML-урока через onclick="checkQuiz()".
     */
    window.checkQuiz = function() {
        // Ищем заголовок урока
        const lessonHeader = lessonDetails.querySelector('h2');
        if (!lessonHeader) return;
        const lessonTitle = lessonHeader.textContent || '';

        // Объект "правильных ответов" в зависимости от урока
        let answers = {};

        if (lessonTitle.includes('Урок 1')) {
            // Пример ответов для Урока 1
            answers = {
                q1: 'zebra',
                q2: 'tiger',
                q3: 'dog',
                q4: 'cat',
                q5: 'owl'
            };
        } else if (lessonTitle.includes('Урок 2')) {
            // Пример ответов для Урока 2
            answers = {
                q1: 'are',
                q2: 'is',
                q3: 'am'
            };
        } else if (lessonTitle.includes('Урок 3')) {
            // Пример ответов для Урока 3
            // (корректируйте под реальные задания)
            answers = {
                q1: 'brushes',
                q2: 'go',
                q3: 'have'
            };
        }

        let score = 0;
        const total = Object.keys(answers).length;

        // Проверяем каждое поле
        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            const userAnswer = input.value.trim().toLowerCase();
            // Если пользовательский ответ совпал с правильным:
            if (userAnswer === answers[key]) {
                score++;
                input.style.borderColor = '#28a745'; // зеленый
            } else {
                input.style.borderColor = '#dc3545'; // красный
            }
        }

        // Ищем блок с feedback
        const feedback = document.getElementById('quiz-feedback');
        if (!feedback) return;

        // Выводим результат
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
     * Глобальная функция: проверка сопоставления (Matching).
     * Вызывается из HTML-урока через onclick="checkMatching()".
     */
    window.checkMatching = function() {
        // Ищем заголовок урока
        const lessonHeader = lessonDetails.querySelector('h2');
        if (!lessonHeader) return;
        const lessonTitle = lessonHeader.textContent || '';

        // Объект правильных сопоставлений
        let matches = {};

        if (lessonTitle.includes('Урок 1')) {
            // Пример сопоставлений для Урока 1
            matches = {
                match1: '1',
                match2: '3',
                match3: '2',
                match4: '1',
                match5: '3',
                match6: '1',
                match7: '2',
                match8: '1'
            };
        } else if (lessonTitle.includes('Урок 2')) {
            // Пример сопоставлений для Урока 2
            matches = {
                match1: '1',
                match2: '1',
                match3: '1'
            };
        } else if (lessonTitle.includes('Урок 3')) {
            // Пример сопоставлений для Урока 3
            matches = {
                match1: '1',
                match2: '1',
                match3: '1'
            };
        } else if (lessonTitle.includes('Урок 4')) {
            // Пример сопоставлений для Урока 4
            matches = {
                match1: '3',
                match2: '2',
                match3: '2'
            };
        }

        let score = 0;
        const total = Object.keys(matches).length;

        for (const key in matches) {
            const select = document.getElementById(key);
            if (!select) continue;

            const userValue = select.value;
            if (userValue === matches[key]) {
                score++;
                select.style.borderColor = '#28a745'; // зеленый
            } else {
                select.style.borderColor = '#dc3545'; // красный
            }
        }

        // Ищем блок с результатом
        const feedback = document.getElementById('matching-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все сопоставления правильные.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных сопоставлений: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };


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

        const feedback = document.getElementById('quiz1-feedback');
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
     * Функции для урока 4
     */

    window.checkQuiz1 = function() {
        const answers = {
            q1: 'am writing',
            q2: 'are cooking',
            q3: 'is swimming'
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

        const feedback = document.getElementById('quiz1-feedback');
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
            match1: '3', // Talk on the phone -> Разговаривать по телефону
            match2: '2', // Watch -> Смотреть
            match3: '2'  // Type -> Печатать
        };

        let score = 0;
        let total = 3;

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

    window.checkMatching4 = function() {
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
        let total = 3;

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
     * Функции для урока 5
     */

    window.checkFirstConditional = function() {
        let score = 0;
        let total = 2;

        const userQ1 = document.getElementById('q1').value.trim().toLowerCase().replace(/\./g,'');
        const userQ2 = document.getElementById('q2').value.trim().toLowerCase().replace(/\./g,'');

        // Проверка q1
        if (userQ1.includes('if it rains') && userQ1.includes('i will stay at home')) {
            score++;
            document.getElementById('q1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('q1').style.border = '2px solid #dc3545';
        }

        // Проверка q2
        if (userQ2.includes('if you call me') && userQ2.includes('i will help you')) {
            score++;
            document.getElementById('q2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('q2').style.border = '2px solid #dc3545';
        }

        const fb = document.getElementById('firstcond-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Все ${total} примеров First Conditional верны.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}. Проверьте формулировки ещё раз.`;
        }
    };

    window.checkSecondCondMatching = function() {
        const correct = { 's2-1': '1', 's2-2': '1' };
        let score = 0;
        let total = 2;

        for (let key in correct) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === correct[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const fb = document.getElementById('secondcond-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Превосходно! Second Conditional использован правильно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkErrorCorrection = function() {
        let score = 0;
        let total = 2;

        const e1 = document.getElementById('e1').textContent.trim().toLowerCase();
        const e2 = document.getElementById('e2').textContent.trim().toLowerCase();

        // Правильный вариант (пример): "If I see him, I will say hello."
        if (e1.includes('if i see him') && e1.includes('i will say hello')) {
            score++;
            document.getElementById('e1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e1').style.border = '2px solid #dc3545';
        }

        // Правильный вариант (пример): "If you call me tomorrow, I will help you."
        if (e2.includes('if you call me tomorrow') && e2.includes('i will help you')) {
            score++;
            document.getElementById('e2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e2').style.border = '2px solid #dc3545';
        }

        const fb = document.getElementById('error-feedback');
        fb.style.display = 'block';

        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Отличная работа! Все ошибки исправлены корректно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Исправлено верно: ${score} из ${total}. Проверьте логику условных предложений.`;
        }
    };

    /**
     * Функции для урока 6
     */

    window.checkQuizSecond = function() {
        // Правильные ответы
        // 1) were, would tell
        // 2) had, would travel
        let correct = [
            { id: 's1', answers: ['were', 'would tell'] },
            { id: 's2', answers: ['had', 'would travel'] }
        ];

        let score = 0;

        correct.forEach(item => {
            let user = document.getElementById(item.id).value.toLowerCase().replace(/\./g,'').trim();
            // Удаляем запятые и точки, чтобы максимально дать пользователю шанс
            user = user.replace(/,/g,'');
            // Проверяем каждую часть ответа
            let isCorrect = item.answers.every(ans => user.includes(ans));
            if (isCorrect) {
                score++;
                document.getElementById(item.id).style.border = '2px solid #28a745';
            } else {
                document.getElementById(item.id).style.border = '2px solid #dc3545';
            }
        });

        const feedback = document.getElementById('feedback-second');
        feedback.style.display = 'block';
        if (score === correct.length) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все ответы в задании 1 верны.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${correct.length}. Исправьте неточности.`;
        }
    };

    window.checkQuizThird = function() {
        // Правильные ответы:
        // 1) had left, would have arrived
        // 2) had known, would have helped
        let correct = [
            { id: 't1', answers: ['had left', 'would have arrived'] },
            { id: 't2', answers: ['had known', 'would have helped'] }
        ];

        let score = 0;

        correct.forEach(item => {
            let user = document.getElementById(item.id).value.toLowerCase().replace(/\./g,'').trim();
            user = user.replace(/,/g,'');
            // Проверяем каждую часть ответа
            let isCorrect = item.answers.every(ans => user.includes(ans));
            if (isCorrect) {
                score++;
                document.getElementById(item.id).style.border = '2px solid #28a745';
            } else {
                document.getElementById(item.id).style.border = '2px solid #dc3545';
            }
        });

        const feedback = document.getElementById('feedback-third');
        feedback.style.display = 'block';
        if (score === correct.length) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все ответы в задании 2 верны.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${correct.length}. Попробуйте ещё раз.`;
        }
    };

    window.checkMatching6 = function() {
        // 1) If I won the lottery -> I would buy a new car. (2-й тип)
        // 2) If we had stayed at the hotel -> we wouldn't have slept in the car. (3-й тип)
        const answers = {
            m1: '2', // I would buy a new car. (2-й тип)
            m2: '1'  // we wouldn't have slept in the car. (3-й тип)
        };

        let score = 0;
        let total = 2;

        for (let key in answers) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === answers[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('match-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все сопоставления правильные.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Верных сопоставлений: ${score} из ${total}. Исправьте ошибки.`;
        }
    };

    window.checkRadio = function() {
        // 1) If they had called me, I ____ them. -> would have helped (3-й тип)
        // 2) If he ____ more polite, people would like him more. -> were (2-й тип)
        const correct = {
            r1: 'would have helped',
            r2: 'were'
        };
        let score = 0;
        let total = Object.keys(correct).length;

        // r1
        const radios1 = document.getElementsByName('r1');
        let userAnswer1 = '';
        radios1.forEach(radio => {
            if (radio.checked) userAnswer1 = radio.value;
        });
        if (userAnswer1 === correct.r1) score++;

        // r2
        const radios2 = document.getElementsByName('r2');
        let userAnswer2 = '';
        radios2.forEach(radio => {
            if (radio.checked) userAnswer2 = radio.value;
        });
        if (userAnswer2 === correct.r2) score++;

        const feedback = document.getElementById('radio-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Превосходно! Все ответы в задании 4 верны (${score}/${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkDragAndDrop = function() {
        // Правильная фраза: "if i had studied harder, i would have passed the exam"
        const dropZone = document.getElementById('drop-zone');
        const words = Array.from(dropZone.querySelectorAll('.draggable')).map(el => el.textContent.toLowerCase());
        let userSentence = words.join(' ').replace(/,\s*/g, ', '); // сохраняем запятые

        const correct = "if i had studied harder, i would have passed the exam";
        const feedback = document.getElementById('drag-feedback');
        feedback.style.display = 'block';

        if (userSentence === correct) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Замечательно! Предложение собрано верно.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Не совсем так. Получилось: "${userSentence}". Попробуйте другой порядок.`;
        }
    };

    window.checkRewriting = function() {
        // Примеры правильных ответов:
        // 1) If I had a car, I would drive you to the station.
        // 2) If she had studied enough, she would have passed the test.
        let user1 = document.getElementById('rw1').value.trim().toLowerCase();
        let user2 = document.getElementById('rw2').value.trim().toLowerCase();

        let score = 0;
        let total = 2;

        // Проверяем первое предложение
        if (user1.includes("if i had a car") && (user1.includes("would drive") || user1.includes("would drive you"))) {
            score++;
            document.getElementById('rw1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('rw1').style.border = '2px solid #dc3545';
        }

        // Проверяем второе предложение
        if (user2.includes("if she had studied enough") && (user2.includes("would have passed") || user2.includes("would have passed the test"))) {
            score++;
            document.getElementById('rw2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('rw2').style.border = '2px solid #dc3545';
        }

        const feedback = document.getElementById('rewriting-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Вы показали понимание условных конструкций.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Исправлено верно: ${score} из ${total}. Можете попробовать улучшить формулировки.`;
        }
    };

    // -------------------------------------------------------------
    //  ДОБАВЛЕННЫЙ КОД ДЛЯ РАБОТЫ ЗАДАНИЙ (Quiz + Matching)
    // -------------------------------------------------------------

    /**
     * Глобальная функция: проверка квиза (заполнение пропусков).
     * Вызывается из HTML-урока через onclick="checkQuiz()".
     */
    window.checkQuiz = function() {
        // Ищем заголовок урока
        const lessonHeader = lessonDetails.querySelector('h2');
        if (!lessonHeader) return;
        const lessonTitle = lessonHeader.textContent || '';

        // Объект "правильных ответов" в зависимости от урока
        let answers = {};

        if (lessonTitle.includes('Урок 1')) {
            // Пример ответов для Урока 1
            answers = {
                q1: 'is',
                q2: 'are',
                q3: 'am'
            };
        } else if (lessonTitle.includes('Урок 2')) {
            // Пример ответов для Урока 2
            answers = {
                q1: 'are',
                q2: 'is',
                q3: 'am'
            };
        } else if (lessonTitle.includes('Урок 3')) {
            // Пример ответов для Урока 3
            // (корректируйте под реальные задания)
            answers = {
                q1: 'brushes',
                q2: 'go',
                q3: 'have'
            };
        }

        let score = 0;
        const total = Object.keys(answers).length;

        // Проверяем каждое поле
        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            const userAnswer = input.value.trim().toLowerCase();
            // Если пользовательский ответ совпал с правильным:
            if (userAnswer === answers[key]) {
                score++;
                input.style.borderColor = '#28a745'; // зеленый
            } else {
                input.style.borderColor = '#dc3545'; // красный
            }
        }

        // Ищем блок с feedback
        const feedback = document.getElementById('quiz-feedback');
        if (!feedback) return;

        // Выводим результат
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
     * Глобальная функция: проверка сопоставления (Matching).
     * Вызывается из HTML-урока через onclick="checkMatching()".
     */
    window.checkMatching = function() {
        // Ищем заголовок урока
        const lessonHeader = lessonDetails.querySelector('h2');
        if (!lessonHeader) return;
        const lessonTitle = lessonHeader.textContent || '';

        // Объект правильных сопоставлений
        let matches = {};

        if (lessonTitle.includes('Урок 1')) {
            // Пример сопоставлений для Урока 1
            matches = {
                match1: '1',
                match2: '1',
                match3: '1'
            };
        } else if (lessonTitle.includes('Урок 2')) {
            // Пример сопоставлений для Урока 2
            matches = {
                match1: '1',
                match2: '1',
                match3: '1'
            };
        } else if (lessonTitle.includes('Урок 3')) {
            // Пример сопоставлений для Урока 3
            matches = {
                match1: '1',
                match2: '1',
                match3: '1'
            };
        } else if (lessonTitle.includes('Урок 4')) {
            // Пример сопоставлений для Урока 4
            matches = {
                match1: '3',
                match2: '2',
                match3: '2'
            };
        }

        let score = 0;
        const total = Object.keys(matches).length;

        for (const key in matches) {
            const select = document.getElementById(key);
            if (!select) continue;

            const userValue = select.value;
            if (userValue === matches[key]) {
                score++;
                select.style.borderColor = '#28a745'; // зеленый
            } else {
                select.style.borderColor = '#dc3545'; // красный
            }
        }

        // Ищем блок с результатом
        const feedback = document.getElementById('matching-feedback');
        if (!feedback) return;

        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все сопоставления правильные.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных сопоставлений: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };
    
    // Добавление остальных функций для уроков 4, 5 и 6
    /**
     * Функции для урока 4
     */
    window.checkQuiz1 = function() {
        const answers = {
            q1: 'am writing',
            q2: 'are cooking',
            q3: 'is swimming'
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

        const feedback = document.getElementById('quiz1-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
        }
    };

    window.checkMatching4 = function() {
        const matches = {
            match1: '3', // Talk on the phone -> Разговаривать по телефону
            match2: '2', // Watch -> Смотреть
            match3: '2'  // Type -> Печатать
        };

        let score = 0;
        let total = 3;

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
     * Функции для урока 5
     */
    window.checkFirstConditional = function() {
        let score = 0;
        let total = 2;

        const userQ1 = document.getElementById('q1').value.trim().toLowerCase().replace(/\./g,'');
        const userQ2 = document.getElementById('q2').value.trim().toLowerCase().replace(/\./g,'');

        // Проверка q1
        if (userQ1.includes('if it rains') && userQ1.includes('i will stay at home')) {
            score++;
            document.getElementById('q1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('q1').style.border = '2px solid #dc3545';
        }

        // Проверка q2
        if (userQ2.includes('if you call me') && userQ2.includes('i will help you')) {
            score++;
            document.getElementById('q2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('q2').style.border = '2px solid #dc3545';
        }

        const fb = document.getElementById('firstcond-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Все ${total} примеров First Conditional верны.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}. Проверьте формулировки ещё раз.`;
        }
    };

    window.checkSecondCondMatching = function() {
        const correct = { 's2-1': '1', 's2-2': '1' };
        let score = 0;
        let total = 2;

        for (let key in correct) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === correct[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const fb = document.getElementById('secondcond-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Превосходно! Second Conditional использован правильно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkErrorCorrection = function() {
        let score = 0;
        let total = 2;

        const e1 = document.getElementById('e1').textContent.trim().toLowerCase();
        const e2 = document.getElementById('e2').textContent.trim().toLowerCase();

        // Правильный вариант (пример): "If I see him, I will say hello."
        if (e1.includes('if i see him') && e1.includes('i will say hello')) {
            score++;
            document.getElementById('e1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e1').style.border = '2px solid #dc3545';
        }

        // Правильный вариант (пример): "If you call me tomorrow, I will help you."
        if (e2.includes('if you call me tomorrow') && e2.includes('i will help you')) {
            score++;
            document.getElementById('e2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e2').style.border = '2px solid #dc3545';
        }

        const fb = document.getElementById('error-feedback');
        fb.style.display = 'block';

        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Отличная работа! Все ошибки исправлены корректно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Исправлено верно: ${score} из ${total}. Проверьте логику условных предложений.`;
        }
    };

    /**
     * Функции для урока 6
     */
    window.checkQuizSecond = function() {
        // Правильные ответы
        // 1) were, would tell
        // 2) had, would travel
        let correct = [
            { id: 's1', answers: ['were', 'would tell'] },
            { id: 's2', answers: ['had', 'would travel'] }
        ];

        let score = 0;

        correct.forEach(item => {
            let user = document.getElementById(item.id).value.toLowerCase().replace(/\./g,'').trim();
            // Удаляем запятые и точки, чтобы максимально дать пользователю шанс
            user = user.replace(/,/g,'');
            // Проверяем каждую часть ответа
            let isCorrect = item.answers.every(ans => user.includes(ans));
            if (isCorrect) {
                score++;
                document.getElementById(item.id).style.border = '2px solid #28a745';
            } else {
                document.getElementById(item.id).style.border = '2px solid #dc3545';
            }
        });

        const feedback = document.getElementById('feedback-second');
        feedback.style.display = 'block';
        if (score === correct.length) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все ответы в задании 1 верны.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${correct.length}. Исправьте неточности.`;
        }
    };

    window.checkQuizThird = function() {
        // Правильные ответы:
        // 1) had left, would have arrived
        // 2) had known, would have helped
        let correct = [
            { id: 't1', answers: ['had left', 'would have arrived'] },
            { id: 't2', answers: ['had known', 'would have helped'] }
        ];

        let score = 0;

        correct.forEach(item => {
            let user = document.getElementById(item.id).value.toLowerCase().replace(/\./g,'').trim();
            user = user.replace(/,/g,'');
            // Проверяем каждую часть ответа
            let isCorrect = item.answers.every(ans => user.includes(ans));
            if (isCorrect) {
                score++;
                document.getElementById(item.id).style.border = '2px solid #28a745';
            } else {
                document.getElementById(item.id).style.border = '2px solid #dc3545';
            }
        });

        const feedback = document.getElementById('feedback-third');
        feedback.style.display = 'block';
        if (score === correct.length) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все ответы в задании 2 верны.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${correct.length}. Попробуйте ещё раз.`;
        }
    };

    window.checkMatching6 = function() {
        // 1) If I won the lottery -> I would buy a new car. (2-й тип)
        // 2) If we had stayed at the hotel -> we wouldn't have slept in the car. (3-й тип)
        const answers = {
            m1: '2', // I would buy a new car. (2-й тип)
            m2: '1'  // we wouldn't have slept in the car. (3-й тип)
        };

        let score = 0;
        let total = 2;

        for (let key in answers) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === answers[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const feedback = document.getElementById('match-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все сопоставления правильные.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Верных сопоставлений: ${score} из ${total}. Исправьте ошибки.`;
        }
    };

    window.checkRadio = function() {
        // 1) If they had called me, I ____ them. -> would have helped (3-й тип)
        // 2) If he ____ more polite, people would like him more. -> were (2-й тип)
        const correct = {
            r1: 'would have helped',
            r2: 'were'
        };
        let score = 0;
        let total = Object.keys(correct).length;

        // r1
        const radios1 = document.getElementsByName('r1');
        let userAnswer1 = '';
        radios1.forEach(radio => {
            if (radio.checked) userAnswer1 = radio.value;
        });
        if (userAnswer1 === correct.r1) score++;

        // r2
        const radios2 = document.getElementsByName('r2');
        let userAnswer2 = '';
        radios2.forEach(radio => {
            if (radio.checked) userAnswer2 = radio.value;
        });
        if (userAnswer2 === correct.r2) score++;

        const feedback = document.getElementById('radio-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = `Превосходно! Все ответы в задании 4 верны (${score}/${total}).`;
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    window.checkDragAndDrop = function() {
        // Правильная фраза: "if i had studied harder, i would have passed the exam"
        const dropZone = document.getElementById('drop-zone');
        const words = Array.from(dropZone.querySelectorAll('.draggable')).map(el => el.textContent.toLowerCase());
        let userSentence = words.join(' ').replace(/,\s*/g, ', '); // сохраняем запятые

        const correct = "if i had studied harder, i would have passed the exam";
        const feedback = document.getElementById('drag-feedback');
        feedback.style.display = 'block';

        if (userSentence === correct) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Замечательно! Предложение собрано верно.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Не совсем так. Получилось: "${userSentence}". Попробуйте другой порядок.`;
        }
    };

    window.checkRewriting = function() {
        // Примеры правильных ответов:
        // 1) If I had a car, I would drive you to the station.
        // 2) If she had studied enough, she would have passed the test.
        let user1 = document.getElementById('rw1').value.trim().toLowerCase();
        let user2 = document.getElementById('rw2').value.trim().toLowerCase();

        let score = 0;
        let total = 2;

        // Проверяем первое предложение
        if (user1.includes("if i had a car") && (user1.includes("would drive") || user1.includes("would drive you"))) {
            score++;
            document.getElementById('rw1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('rw1').style.border = '2px solid #dc3545';
        }

        // Проверяем второе предложение
        if (user2.includes("if she had studied enough") && (user2.includes("would have passed") || user2.includes("would have passed the test"))) {
            score++;
            document.getElementById('rw2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('rw2').style.border = '2px solid #dc3545';
        }

        const feedback = document.getElementById('rewriting-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Вы показали понимание условных конструкций.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Исправлено верно: ${score} из ${total}. Можете попробовать улучшить формулировки.`;
        }
    };

    /**
     * Функция для обработки кнопки "Назад"
     * Если вы хотите добавить универсальную обработку кнопок "Назад",
     * можно использовать делегирование событий или добавить отдельные обработчики.
     */

    // -------------------------------------------------------------
    //  ДОБАВЛЕННЫЙ КОД ЗАКАНЧИВАЕТСЯ ЗДЕСЬ
    // -------------------------------------------------------------

    // -------------------------------------------------------------
    //  ДОБАВЛЕННЫЙ КОД ДЛЯ РАБОТЫ ЗАДАНИЙ УРОКА 10
    // -------------------------------------------------------------

    /************************************************************
     * Урок 10: Advanced Grammar — Inversion, Subjunctive, Emphatic Structures
     ************************************************************/

    /**
     * Задание 1: Subjunctive / Inversion
     */
    window.checkSubjunctiveInversion = function() {
        const correct = {
            q1: 'be',
            q2: 'have i seen',
            q3: 'were'
        };
        let score = 0;
        let total = 3;

        for (let key in correct) {
            let val = document.getElementById(key).value.trim().toLowerCase();
            // Удаляем точки
            val = val.replace(/\./g,'');
            if (val === correct[key]) {
                score++;
                document.getElementById(key).style.border = '2px solid #28a745';
            } else {
                document.getElementById(key).style.border = '2px solid #dc3545';
            }
        }

        const fb = document.getElementById('subj-inv-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Отлично! Сослагательное наклонение и инверсия применены верно.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Вы ответили верно на ${score} из ${total}. Проверьте ответы.`;
        }
    };

    /**
     * Задание 2: Сопоставьте инверсию
     */
    window.checkInversionMatch = function() {
        // inv1 -> "We rarely meet" (1)
        // inv2 -> "He knew little about the truth" (2)
        const correct = { inv1: '1', inv2: '2' };
        let score = 0;
        let total = 2;

        for (let key in correct) {
            const val = document.getElementById(key).value;
            if (val === correct[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const fb = document.getElementById('inversion-match-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Все сопоставления верны (${score}/${total}). Отличная работа.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верно: ${score} из ${total}. Исправьте ошибки.`;
        }
    };

    /**
     * Задание 3: Radio Quiz (Cleft types)
     */
    window.checkCleftRadio = function() {
        const correct = { r1: 'It-cleft', r2: 'What-cleft' };
        let score = 0;
        let total = 2;

        // r1
        let user1 = '';
        document.getElementsByName('r1').forEach(radio => {
            if (radio.checked) user1 = radio.value;
        });
        if (user1 === correct.r1) score++;

        // r2
        let user2 = '';
        document.getElementsByName('r2').forEach(radio => {
            if (radio.checked) user2 = radio.value;
        });
        if (user2 === correct.r2) score++;

        const fb = document.getElementById('cleft-radio-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Замечательно! Оба ответа (${score}/${total}) верны.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте снова.`;
        }
    };

    /**
     * Задание 4: Drag & Drop (Inversion)
     */
    window.checkInversionDrag = function() {
        // "Hardly had we started when the lights went out."
        const dropZone = document.getElementById('drop-zone');
        const words = Array.from(dropZone.querySelectorAll('.draggable')).map(w => w.textContent.toLowerCase());
        const userSentence = words.join(' ').trim();
        const correctSentence = "hardly had we started when the lights went out.";

        const fb = document.getElementById('inversion-drag-feedback');
        fb.style.display = 'block';

        if (userSentence === correctSentence) {
            fb.className = 'feedback success';
            fb.textContent = 'Отлично! Инверсия в предложении оформлена корректно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Получилось: "${userSentence}". Попробуйте другой порядок.`;
        }
    };

    /**
     * Задание 5: Исправьте ошибки (Subjunctive, Inversion)
     */
    window.checkSubjInversionErrors = function() {
        // 1) It is crucial that he leave at 7 AM.
        // 2) Never have I seen such dedication.
        // 3) If I were you, I'd apply for the position.
        let e1Val = document.getElementById('e1').textContent.trim().toLowerCase();
        let e2Val = document.getElementById('e2').textContent.trim().toLowerCase();
        let e3Val = document.getElementById('e3').textContent.trim().toLowerCase();

        let score = 0;
        let total = 3;

        // Проверка 1
        if (e1Val.includes("it is crucial that he leave")) {
            score++;
            document.getElementById('e1').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e1').style.border = '2px solid #dc3545';
        }

        // Проверка 2
        if (e2Val.includes("never have i seen")) {
            score++;
            document.getElementById('e2').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e2').style.border = '2px solid #dc3545';
        }

        // Проверка 3
        if (e3Val.includes("if i were you")) {
            score++;
            document.getElementById('e3').style.border = '2px solid #28a745';
        } else {
            document.getElementById('e3').style.border = '2px solid #dc3545';
        }

        const fb = document.getElementById('subj-inv-error-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Отлично! Все ошибки исправлены правильно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Вы исправили верно: ${score} из ${total}. Проверьте ещё раз.`;
        }
    };

    /**
     * Задание 6: Сопоставьте термин с переводом
     */
    window.checkTermMatching = function() {
        // term1: "Subjunctive Mood" -> "Сослагательное наклонение" (1)
        // term2: "Inversion" -> "Инверсия (перестановка слов)" (1)
        const answers = { term1: '1', term2: '1' };
        let score = 0;
        let total = 2;

        for (let key in answers) {
            const userChoice = document.getElementById(key).value;
            if (userChoice === answers[key]) {
                score++;
                document.getElementById(key).style.borderColor = '#28a745';
            } else {
                document.getElementById(key).style.borderColor = '#dc3545';
            }
        }

        const fb = document.getElementById('term-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = 'Замечательно! Вы верно сопоставили термины.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Верных сопоставлений: ${score} из ${total}. Попробуйте ещё раз.`;
        }
    };

    /**
     * Задание 7: Radio Quiz (Mixing Emphatic & Subjunctive)
     */
    window.checkMixRadio = function() {
        // r3 -> 'be'
        // r4 -> 'that'
        const correct = { r3: 'be', r4: 'that' };
        let total = 2;
        let score = 0;

        let user3 = '';
        document.getElementsByName('r3').forEach(radio => {
            if (radio.checked) user3 = radio.value;
        });
        if (user3 === correct.r3) score++;

        let user4 = '';
        document.getElementsByName('r4').forEach(radio => {
            if (radio.checked) user4 = radio.value;
        });
        if (user4 === correct.r4) score++;

        const fb = document.getElementById('mix-radio-feedback');
        fb.style.display = 'block';
        if (score === total) {
            fb.className = 'feedback success';
            fb.textContent = `Превосходно! Все ответы (${score}/${total}) верны.`;
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте снова.`;
        }
    };

    /**
     * Задание 8: Drag & Drop (Emphatic "What" cleft)
     */
    window.checkWhatDrag = function() {
        // "What he really wants is a chance to prove himself."
        const dropZone = document.getElementById('drop-zone2');
        const words = Array.from(dropZone.querySelectorAll('.draggable')).map(w => w.textContent.toLowerCase());
        const userSentence = words.join(' ').trim();
        const correctSentence = "what he really wants is a chance to prove himself.";

        const fb = document.getElementById('what-drag-feedback');
        fb.style.display = 'block';

        if (userSentence === correctSentence) {
            fb.className = 'feedback success';
            fb.textContent = 'Отлично! Cleft-предложение собрано правильно.';
        } else {
            fb.className = 'feedback error';
            fb.textContent = `Получилось: "${userSentence}". Попробуйте другой порядок.`;
        }
    };

    /**
     * Инициализация Drag & Drop для урока 10
     */
    function initializeLesson10() {
        // --- Задание 4 ---
        const dragItems1 = document.querySelectorAll('.draggable1');
        const dropZone1 = document.getElementById('drop-zone');
    
        dragItems1.forEach(item => {
            // Запоминаем, где слово лежало изначально
            item.dataset.originParent = item.parentElement.id;
    
            item.addEventListener('dragstart', function(e) {
                // Указываем, что переносим по "id"
                e.dataTransfer.setData('text/plain', e.target.id);
                e.dataTransfer.effectAllowed = 'move';
                // Ставим флажок: "ещё не упало"
                item.dataset.dropped = "false";
                e.target.style.opacity = '0.4';
            });
    
            item.addEventListener('dragend', function(e) {
                e.target.style.opacity = '1';
                // Если dropped осталось "false", значит уронили мимо drop-zone
                if (item.dataset.dropped === "false") {
                    // Возвращаем в родной контейнер
                    const origin = document.getElementById(item.dataset.originParent);
                    origin.appendChild(item);
                }
            });
        });
    
        dropZone1.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            dropZone1.classList.add('dragover');
        });
    
        dropZone1.addEventListener('dragleave', function(e) {
            dropZone1.classList.remove('dragover');
        });
    
        dropZone1.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone1.classList.remove('dragover');
            // Получаем id
            const id = e.dataTransfer.getData('text/plain');
            const draggedElement = document.getElementById(id);
            // Помечаем, что упал успешно
            draggedElement.dataset.dropped = "true";
            dropZone1.appendChild(draggedElement);
        });
    
        // --- Задание 8 ---
        const dragItems2 = document.querySelectorAll('.draggable2');
        const dropZone2 = document.getElementById('drop-zone2');
    
        dragItems2.forEach(item => {
            // Запоминаем родительский контейнер
            item.dataset.originParent = item.parentElement.id;
    
            item.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text/plain', e.target.id);
                e.dataTransfer.effectAllowed = 'move';
                item.dataset.dropped = "false";
                e.target.style.opacity = '0.4';
            });
    
            item.addEventListener('dragend', function(e) {
                e.target.style.opacity = '1';
                // Если флажок не установился -> возвращаем обратно
                if (item.dataset.dropped === "false") {
                    const origin = document.getElementById(item.dataset.originParent);
                    origin.appendChild(item);
                }
            });
        });
    
        dropZone2.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            dropZone2.classList.add('dragover');
        });
    
        dropZone2.addEventListener('dragleave', function(e) {
            dropZone2.classList.remove('dragover');
        });
    
        dropZone2.addEventListener('drop', function(e) {
            e.preventDefault();
            dropZone2.classList.remove('dragover');
            const id = e.dataTransfer.getData('text/plain');
            const draggedElement = document.getElementById(id);
            draggedElement.dataset.dropped = "true";
            dropZone2.appendChild(draggedElement);
        });
    }

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

    /**
     * Функция проверки Итогового теста для Модуля 2
     * (см. finaltest2.html)
     */
    window.checkFinalTest2 = function() {
        // Составляем объект ответов: ключи соответствуют ID (q21, q22, ...)
        const answers = {
            q21: 'if i had known in advance, i would have prepared',
            q22: 'have i heard',
            q23: 'arrive',
            q24: 'what i want is some peace and quiet',
            q25: 'would have left',
            q26: 'had been',
            q27: 'he should have arrived earlier',
            q28: 'had realized',
            q29: 'must have had',
            q210: 'it was her kindness that impressed me the most'
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const input = document.getElementById(key);
            if (!input) continue;

            let userAnswer = input.value.trim().toLowerCase();
            // Снимем финальные точки, если они есть
            userAnswer = userAnswer.replace(/\.+$/, '');
            let correctAnswer = answers[key].toLowerCase();

            // При необходимости добавляем "acceptableAnswers" для вариантов
            if (key === 'q27') {
                // Допустим, принимаем "He must have arrived earlier."
                // или "He should have arrived earlier."
                const accept = [
                    'he should have arrived earlier',
                    'he must have arrived earlier'
                ];
                if (accept.includes(userAnswer)) {
                    correctAnswer = userAnswer; 
                } else {
                    correctAnswer = 'incorrect';
                }
            } 
            else if (key === 'q24') {
                // "What I want is some peace and quiet."
                // Принимаем вариант с точкой?
                const accept = [
                    'what i want is some peace and quiet',
                    'what i want is some peace and quiet.'
                ];
                if (accept.includes(userAnswer)) {
                    correctAnswer = userAnswer;
                } else {
                    correctAnswer = 'incorrect';
                }
            }

            // Проверка совпадения
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
            q1: 'had finished',             // #1 If she ___ her work early...
            q2: 'will have been living',    // #2 By this time next year, I ___
            q3: 'had + been + глагол-ing',  // #3 Past Perfect Continuous
            q4: 'they have been building the bridge since 2018 and it\'s still not finished', 
                                            // #4 (упростим проверку, можно более гибко)
            q5: 'had known',                // #5 If I ___ about the traffic...
            q6: 'has been working',         // #6 She ___ (тут Present Perfect Continuous)
            q7: 'will have finished',       // #7 By the time you arrive, we ___
            q8: 'she had been reading the book when i called', 
                                            // #8 Convert to Past Perf. Continuous
            q9: 'had left',                 // #9 If they ___ earlier...
            q10: 'will have been studying'  // #10 By the end of this month, I ___
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
     * Тест 2 (Модуль 2): Phrasal Verbs and Idiomatic Expressions
     * ID вопросов: q1..q10 (каждый свой)
     */
    window.checkTest2 = function() {
        const answers = {
            q1: 'take care of someone/something', // #1 look after
            q2: 'give away',                      // #2 She decided to ___
            q3: 'dogs',                           // #3 It's raining cats and ___
            q4: 'to initiate conversation',       // #4 break the ice
            q5: 'wind down',                      // #5 After a long day, he likes to ___
            q6: 'fix up',                         // #6 I need to ___ my car
            q7: 'reveal a secret',                // #7 spill the beans
            q8: 'tear down',                      // #8 They decided to ___ the old building
            q9: 'blue',                           // #9 once in a ___ moon
            q10: 'reject an offer'                // #10 turn down
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const userEl = document.getElementById(key);
            if (!userEl) continue;
            let userAnswer = userEl.value.trim().toLowerCase();
            // Снимем точку или вопросительный знак, если есть
            userAnswer = userAnswer.replace(/[.?!]+$/, '');

            let correctAnswer = answers[key].toLowerCase();

            // Для фразовых глаголов можно допустить варианты (например, 'give away' vs 'giveaway'),
            // но в примере всё строго :)
            if (userAnswer === correctAnswer) {
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
     * Тест 3 (Модуль 2): Advanced Conditional Structures
     * ID вопросов: q1..q10 (каждый свой)
     */
    window.checkTest3 = function() {
        const answers = {
            q1: 'had',            // #1 If I ___ (had) more time
            q2: 'had known',      // #2 If they ___ about the traffic...
            q3: 'if he had exercised, he wouldn\'t be out of shape now', 
                                // #3 Mixed cond: didn't exercise -> out of shape now
            q4: 'should',         // #4 If you ___ see her
            q5: 'were',           // #5 If I ___ (were) you
            q6: 'had studied',    // #6 If she ___ harder
            q7: 'if they had invested in stocks, they would be wealthy now',
                                // #7 Mixed cond
            q8: 'might',          // #8 If he ___ come to the meeting
            q9: 'had left',       // #9 If you ___ earlier
            q10: 'had known'      // #10 If I ___ about the concert, I would be attending
        };

        let score = 0;
        const total = Object.keys(answers).length;

        for (const key in answers) {
            const userEl = document.getElementById(key);
            if (!userEl) continue;
            let userAnswer = userEl.value.trim().toLowerCase();
            userAnswer = userAnswer.replace(/\.+$/, '');

            let correctAnswer = answers[key].toLowerCase();

            // Можно допустить варианты с апострофом etc.
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

    window.checkIdioms = function() {
        // Массив или объект с "правильными" ответами
        const answers = {
            ie1: "don't spill the beans",
            ie2: "once in a blue moon",
            ie3: "under the weather"
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


    window.checkPhrasalVerbs = function() {
        const answers = {
            pe1: "don't spill the beans", // Пример (можно менять под реальную задачу)
            pe2: "turn down",
            pe3: "turn down"
        };
    
        let score = 0;
        const total = Object.keys(answers).length;
    
        // 1) Проверка поля pe1
        let user1 = document.getElementById('pe1').value.trim().toLowerCase();
        // Удаляем финальную точку
        user1 = user1.replace(/\.+$/, '');
        if (user1 === answers.pe1) {
            score++;
            document.getElementById('pe1').style.borderColor = '#28a745';
        } else {
            document.getElementById('pe1').style.borderColor = '#dc3545';
        }
    
        // 2) Проверка поля pe2
        let user2 = document.getElementById('pe2').value.trim().toLowerCase();
        user2 = user2.replace(/\.+$/, '');
        if (user2 === answers.pe2) {
            score++;
            document.getElementById('pe2').style.borderColor = '#28a745';
        } else {
            document.getElementById('pe2').style.borderColor = '#dc3545';
        }
    
        // 3) Проверка селекта pe3
        let user3 = document.getElementById('pe3').value;
        if (user3 === answers.pe3) {
            score++;
            document.getElementById('pe3').style.borderColor = '#28a745';
        } else {
            document.getElementById('pe3').style.borderColor = '#dc3545';
        }
    
        const feedback = document.getElementById('phrasal-verbs-feedback');
        feedback.style.display = 'block';
        if (score === total) {
            feedback.className = 'feedback success';
            feedback.textContent = 'Отлично! Все ответы верны.';
        } else {
            feedback.className = 'feedback error';
            feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
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