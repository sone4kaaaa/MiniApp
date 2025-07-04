Telegram.WebApp.ready();

let tgUserId = null; 

// Если открыто внутри Telegram WebApp
if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
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
    lessonsCompleted: 0,       // от 0 до 30
    testsCompleted: 0,         // от 0 до 9 (промежуточные)
    finalTestsCompleted: 0,    // от 0 до 3 (итоговые)
    testResults: {}
  };
window.completedItems = new Set();


/* ----- ФУНКЦИИ ДЛЯ FIRESTORE ----- */
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
    const params = new URLSearchParams(window.location.search);
    return params.get('user_id') || "guest10";
}

function restoreUnlockItem(modulePath, fileName) {
    const container = document.querySelector(`.lessons-container[data-module="${modulePath}"]`);
    if (!container) return;
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

    // разблокируем «следующую» кнопку по порядку
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
    for (const uid of window.completedItems) {
        const [modulePath, fileName] = uid.split("-");
        // Разблокируем текущий урок/тест
        restoreUnlockItem(modulePath, fileName);
    }
}

function unlockItem(modulePath, fileName) {
    const container = document.querySelector(`.lessons-container[data-module="${modulePath}"]`);
    if (!container) return;
  
    const btn = container.querySelector(`[data-lesson="${fileName}"], [data-test="${fileName}"]`);
    if (!btn) return;
  
    btn.disabled = false;
    btn.classList.remove('locked', 'disabled');
}

function lockAllButFirstLesson() {
    // Блокируем ВСЕ уроки и тесты 
    const allLessonButtons = document.querySelectorAll('.lesson-button, .test-button');
    allLessonButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('locked', 'disabled');
    });
    // Разблокируем только первый урок 
    const module1Container = document.querySelector('.lessons-container[data-module="module1"]');
    if (module1Container) {
        const firstLesson = module1Container.querySelector('[data-lesson="lesson1.html"]');
        if (firstLesson) {
            firstLesson.disabled = false;
            firstLesson.classList.remove('locked','disabled');
        }
    }
}

function unlockItemsByStats() {
    const { lessonsCompleted, testsCompleted, finalTestsCompleted } = window.userStats;
    if (window.userStats.lessonsCompleted >= 30 &&
        window.userStats.testsCompleted >= 9 &&
        window.userStats.finalTestsCompleted >= 3
    ) {
        const allButtons = document.querySelectorAll(
          '.lesson-button, .test-button, .final-test-btn, #module2-btn, #module3-btn'
        );
        allButtons.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('locked', 'disabled');
        });
        return;
    }

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
   
    const maxLessonUnlocked = lessonsCompleted + 1;
    const lessonButtons = document.querySelectorAll('.lesson-button');
    lessonButtons.forEach(btn => {
        const mod = btn.dataset.module; 
        
        // Если это module2, но finalTestsCompleted < 1 => всё заблокировано
        if (mod === 'module2' && window.userStats.finalTestsCompleted < 1) {
            btn.disabled = true;
            btn.classList.add('locked','disabled');
            return; 
        }
        // Если это module3, но finalTestsCompleted < 2 => всё заблокировано
        if (mod === 'module3' && window.userStats.finalTestsCompleted < 2) {
            btn.disabled = true;
            btn.classList.add('locked','disabled');
            return;
        }
        let localProgress = 0;
        let totalLessons = 10;
        
        if (mod === 'module1') {
            localProgress = Math.min(window.userStats.lessonsCompleted, 10);
        } else if (mod === 'module2') {
            localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 10, 0), 10);
        } else if (mod === 'module3') {
            localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 20, 0), 10);
        }
        const match = (btn.dataset.lesson || '').match(/lesson(\d+)\.html$/i);
        if (!match) {
            return;
        }
        const lessonNum = parseInt(match[1], 10);

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
            
            const allButtons = document.querySelectorAll(
              '.lesson-button, .test-button, .final-test-btn, #module2-btn, #module3-btn'
            );
    
            allButtons.forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('locked', 'disabled');
            });
        }
    });
  
    const testButtons = document.querySelectorAll('.test-button');
    testButtons.forEach(btn => {
        // Узнаём, к какому модулю относится тест
        const modulePath = btn.dataset.module; 
        
        // проверяем, «открыт» ли модуль вообще
        if (modulePath === 'module2' && window.userStats.finalTestsCompleted < 1) {
          btn.disabled = true;
          btn.classList.add('locked','disabled');
          return; 
        }
        if (modulePath === 'module3' && window.userStats.finalTestsCompleted < 2) {
          btn.disabled = true;
          btn.classList.add('locked','disabled');
          return; 
        }
      
        // Если модуль разрешён, парсим номер теста из файла (test1.html => 1)
        const file = btn.dataset.test || '';
        const m = file.match(/test(\d+)\.html$/i);
        if (!m) return;
        const testNum = parseInt(m[1], 10); // 1..9
      
        // Считаем «локальный прогресс» (сколько уроков реально прошли в этом модуле)
        let localProgress = 0;
        if (modulePath === 'module1') {
          localProgress = Math.min(window.userStats.lessonsCompleted, 10);
        } else if (modulePath === 'module2') {
          localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 10, 0), 10);
        } else if (modulePath === 'module3') {
          localProgress = Math.min(Math.max(window.userStats.lessonsCompleted - 20, 0), 10);
        }
        const requiredLessons = testNum * 3; 
    
        if (localProgress >= requiredLessons) {
          btn.disabled = false;
          btn.classList.remove('locked','disabled');
        } else {
          btn.disabled = true;
          btn.classList.add('locked','disabled');
        }
    });
  
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
 * @param {string} type 
 * @param {string} modulePath 
 * @param {string} fileName 
 */
function finishLessonOrTest(type, modulePath, fileName) {
    // Создаём уникальный идентификатор для конкретного урока/теста
    const uid = `${modulePath}-${fileName}`;

    // Проверяем, не было ли уже добавлено в completedItems
    if (window.completedItems.has(uid)) {
      console.log("Этот урок/тест уже отмечен как завершён:", uid);
      return;
    }

    // Добавляем в Set (теперь он считается пройденным)
    window.completedItems.add(uid);

    if (type === 'lesson') {
      window.userStats.lessonsCompleted = Math.min(window.userStats.lessonsCompleted + 1, 30);
    } else if (type === 'test') {
      window.userStats.testsCompleted = Math.min(window.userStats.testsCompleted + 1, 9);
    } else if (type === 'final') {
      window.userStats.finalTestsCompleted = Math.min(window.userStats.finalTestsCompleted + 1, 3);
    }

    // сохраняем обновлённые данные в Firestore
    saveUserDataToServer(window.userId);
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

    function createTestElement(testNumber, modulePath) {
        const btn = document.createElement('button');
        btn.textContent = `Тест ${testNumber}`;
        // Изначально блокируем
        btn.classList.add('test-button', 'locked', 'disabled');
        btn.dataset.test = `test${testNumber}.html`;
        btn.dataset.module = modulePath;
        // Порядок для сортировки
        btn.dataset.order = testNumber * 2;
    
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
    
    function createBackButton(modulePath) {
    const button = document.createElement("button");
    button.className = "back-button";
    button.innerHTML = `
        <img class="back-icon" src="https://cdn-icons-png.flaticon.com/512/93/93634.png" alt="Back">
        Назад
    `;

    button.onclick = function () {
        document.getElementById('lesson-content')?.classList.add('hidden');
        document.getElementById('lesson-details').innerHTML = '';
        document.getElementById('app-header')?.classList.remove('hidden');

        ['module1-list', 'module2-list', 'module3-list'].forEach(id => {
            document.getElementById(id)?.classList.add('hidden');
        });

        if (modulePath.includes('module1')) {
            document.getElementById('module1-list')?.classList.remove('hidden');
        } else if (modulePath.includes('module2')) {
            document.getElementById('module2-list')?.classList.remove('hidden');
        } else if (modulePath.includes('module3')) {
            document.getElementById('module3-list')?.classList.remove('hidden');
        }
    };

    return button;
}

    // --- Загрузка контента (урок или тест) ---
function loadContent(html, modulePath) {
    lessonDetails.innerHTML = html;
    mainButtons.classList.add('hidden');
    moduleMenus.forEach(m => m.classList.add('hidden'));
    lessonsListContainers.forEach(c => c.classList.add('hidden'));
    lessonContent.classList.remove('hidden');
    appHeader.classList.add('hidden');

    const lessonContainer = document.querySelector(".lesson-container");
    if (lessonContainer) {
        const backBtn = createBackButton(modulePath); 
        lessonContainer.prepend(backBtn);
    }

    // Проверяем тип контента
    if (html.includes('Тест') || html.includes('Test')) {
        const re = /Тест\s+(\d+)/i;
        const match = html.match(re);
        if (match && match[1]) {
            const testNum = parseInt(match[1], 10);
            addNextTestButton(testNum, modulePath);
        }
        if (html.includes('Итоговый тест') || html.includes('finaltest.html')) {
            addFinishButton(modulePath);
        }
    } else {
        const re = /Урок\s+(\d+)/i;
        const match = html.match(re);
        if (match && match[1]) {
            const lessonNum = parseInt(match[1], 10);
            addNextLessonButton(lessonNum, modulePath);
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

        btn.style.width = '100%'; 
        btn.style.marginTop = '20px';
        btn.style.backgroundColor = '#17a2b8';
        btn.style.color = '#fff';
        btn.style.borderRadius = '10px';
        btn.style.fontSize = '18px';

        btn.addEventListener('click', () => {
            lessonContent.classList.add('hidden');
            lessonDetails.innerHTML = '';
            appHeader.classList.remove('hidden');
            document.getElementById(`${modulePath}-menu`).classList.remove('hidden');
            unlockNextModule(modulePath);
        });

        const feedbackDiv = quizDiv.querySelector('.feedback');
        if (feedbackDiv) {
            feedbackDiv.insertAdjacentElement('afterend', btn);
        } else {
            quizDiv.appendChild(btn);
        }
    }

    // создаём уроки и промежуточные тесты (блокируем все кроме первого урока) ---
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
    
            // Только Урок №1 разблокирован
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

    window.loadContent = loadContent;



/* ----- ПРОВЕРКА ПРОМЕЖУТОЧНЫХ ТЕСТОВ ----- */
    /**
 * Универсальная функция проверки теста
 * @param {Object} answers 
 * @param {string} feedbackId 
 */
function checkTest(answers, feedbackId, testId = '') {
    let score = 0;
    const total = Object.keys(answers).length;

    for (const key in answers) {
        const input = document.getElementById(key);
        if (!input) continue;

        let userAnswer = input.value.trim();
        const isSelect = input.tagName.toLowerCase() === 'select';

        if (!isSelect) {
            userAnswer = userAnswer.toLowerCase().replace(/[.?!]+$/, '');
        }

        let correctAnswers = answers[key];
        if (!Array.isArray(correctAnswers)) {
            correctAnswers = [correctAnswers];
        }

        // Приводим все правильные ответы к нужному виду
        const normalizedCorrectAnswers = correctAnswers.map(ans => {
            return isSelect ? ans : ans.toLowerCase().replace(/[.?!]+$/, '');
        });

        if (normalizedCorrectAnswers.includes(userAnswer)) {
            score++;
            input.style.borderColor = '#28a745'; // зелёный
        } else {
            input.style.borderColor = '#dc3545'; // красный
        }
    }

    const feedback = document.getElementById(feedbackId);
    if (!feedback) return;

    feedback.style.display = 'block';
    if (score === total) {
        feedback.className = 'feedback success';
        feedback.textContent = `Отлично! Все ответы верны (${score} из ${total}).`;
    } else {
        feedback.className = 'feedback error';
        feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуй ещё раз.`;
    }

    // Сохраняем статистику
    const userId = getTelegramUserId?.();
    if (testId && userId) {
        window.userStats.testResults = window.userStats.testResults || {};
        window.userStats.testResults[testId] = { correct: score, total };
        saveUserDataToServer(userId);
    }
}

window.checkTest1 = function () {
    const answers = {
        tq1: 'dog',
        tq2: 'мяч',
        tq3: '/e/',
        tq4: 'eight',
        tq5: 'xylophone',
        tq6: '/kæt/',
        tq7: ["zero,one,two,three", "zero, one, two, three"],
        tq8: 'hat'
    };
    checkTest(answers, 'test-feedback', 'module1.test1');
};

window.checkTest2 = function () {
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
    checkTest(answers, 'test2-feedback', 'module1.test2');
};

window.checkTest3 = function () {
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
    checkTest(answers, 'test3-feedback', 'module1.test3');
};

window.checkTest1_2 = function () {
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
    checkTest(answers, 'test12-feedback', 'module2.test1');
};

window.checkTest2_2 = function () {
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
    checkTest(answers, 'test22-feedback', 'module2.test2');
};

window.checkTest3_2 = function () {
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
    checkTest(answers, 'test32-feedback', 'module2.test3');
};
            
window.checkTest1_3 = function () {
    const answers = {
        q1: 'I play football every Sunday.',          
        q2: 'I like singing',        
        q3: 'is',         
        q4: 'watches',       
        q5: "Когда подлежащее — he, she, it.",           
        q6: 'Swimming',          
        q7: 'There is',            
        q8: "There aren't",              
        q9: 'Do you eat meat?',         
        q10: 'Does'
    };
    checkTest(answers, 'test13-feedback', 'module3.test1');
};       

window.checkTest2_3 = function () {
    const answers = {
        q1: 'Living room',          
        q2: 'I am crazy about skiing',     
        q3: 'Are you interested in music?',         
        q4: 'What time is it?',       
        q5: "In the bedroom",           
        q6: 'Sofa',          
        q7: 'I am bad at cycling',            
        q8: "I am not good at playing the piano",              
        q9: 'Table',         
        q10: 'Cozy'
    };
    checkTest(answers, 'test23-feedback', 'module3.test2');
};  

window.checkTest3_3 = function () {
    const answers = {
        q1: 'taller',          
        q2: ['the coldest', "coldest"],       
        q3: 'She is dancing now',         
        q4: 'We are reading',       
        q5: "Is he playing football now?",           
        q6: 'It is the baddest idea',          
        q7: '-er',            
        q8: "Good → the best",              
        q9: 'singing',         
        q10: 'than' 
    };
    checkTest(answers, 'test33-feedback', 'module3.test3');
};  



/* ----- ПРОВЕРКА ИТОГОВЫХ ТЕСТОВ ----- */
/**
 * Универсальная функция проверки финального теста
 * @param {Object} answers1 
 * @param {string} feedbackId1 
 */
function checkFinalTestGeneric(answers1, feedbackId1, testId = '') {
    let score = 0;
    const total = Object.keys(answers1).length;

    for (const key in answers1) {
        const input = document.getElementById(key);
        if (!input) continue;

        let userAnswer = '';
        const isSelect = input.tagName.toLowerCase() === 'select';

        if (isSelect) {
            userAnswer = input.value.trim().toLowerCase();
        } else {
            userAnswer = input.value.trim().toLowerCase().replace(/\.+$/, '');
        }

        let correctAnswers = answers1[key];

        // Преобразуем одиночный ответ в массив
        if (!Array.isArray(correctAnswers)) {
            correctAnswers = [correctAnswers];
        }

        // Нормализуем все варианты
        const normalizedCorrect = correctAnswers.map(ans =>
            isSelect ? ans.trim().toLowerCase() : ans.trim().toLowerCase().replace(/\.+$/, '')
        );

        if (normalizedCorrect.includes(userAnswer) && !normalizedCorrect.includes('incorrect')) {
            score++;
            input.style.borderColor = '#28a745'; // Зелёный
        } else {
            input.style.borderColor = '#dc3545'; // Красный
        }
    }

    const feedback = document.getElementById(feedbackId1);
    if (!feedback) return;

    feedback.style.display = 'block';
    if (score === total) {
        feedback.className = 'feedback success';
        feedback.textContent = `Превосходно! Все ответы верны (${score} из ${total}).`;
    } else {
        feedback.className = 'feedback error';
        feedback.textContent = `Правильных ответов: ${score} из ${total}. Попробуйте ещё раз.`;
    }

    // Сохраняем статистику
    const userId = getTelegramUserId?.();
    if (testId && userId) {
        window.userStats.testResults = window.userStats.testResults || {};
        window.userStats.testResults[testId] = { correct: score, total };
        saveUserDataToServer(userId);
    }
}


window.checkFinalTest = function () {
    const answers1 = {
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
    checkFinalTestGeneric(answers1, 'finaltest-feedback', 'module1.finaltest');
};

window.checkFinalTest2 = function () {
    const answers1 = {
        q21: 'lemon',
        q22: ['I like to run, swim and dance', 'I like to run,swim and dance', 'I like to run, to swim and to dance', 'I like to run,to swim and to dance'],
        q23: ["T-shirt, shorts, shoes", "T-shirt,shorts,shoes"],
        q24: '2',
        q25: 'I have got a sister',
        q26: '1',
        q27: '3',
        q28: '2',
        q29: 'January',
        q210: 'Mouth'
    };
    checkFinalTestGeneric(answers1, 'finaltest2-feedback', 'module2.finaltest');
};

window.checkFinalTest3 = function () {
    const answers1 = {
        q31: 'She plays piano every day.',
        q32: 'I have got a red pen.',
        q33: 'Сейчас половина восьмого',
        q34: 'Are they drawing right now?',
        q35: 'is',
        q36: 'There is a kitchen in my house.',
        q37: 'I am interested in playing football.',
        q38: 'taller',
        q39: 'This is the most beautiful park.',
        q310: 'I like painting.'
    };
    checkFinalTestGeneric(answers1, 'finaltest3-feedback', 'module3.finaltest');
};

    // Добавление кнопки "Итоговый тест" для каждого модуля
    const finalTestButtons = document.querySelectorAll('.final-test-btn');
    finalTestButtons.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('disabled');
        btn.addEventListener('click', () => {
            const modulePath = btn.dataset.module;
            let testFile = 'finaltest.html';  
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



/* ----- ПРОВЕРКА КВИЗОВ В УРОКАХ ----- */
window.checkQuiz = function(config) {
    const {
        answers,
        feedbackId = 'quiz-feedback',
        exact = false,
        matchIds = null,
        allowAnyOrder = false 
    } = config;

    let score = 0;
    const keys = matchIds || Object.keys(answers);
    const total = keys.length;

    keys.forEach((key) => {
        const element = document.getElementById(key);
        if (!element) return;

        let userValue = element.value.trim();
        const expected = answers[key];
        const correctValues = Array.isArray(expected) ? expected : [expected];

        let isCorrect = false;

        for (let correct of correctValues) {
            let u = userValue;
            let c = correct;

            if (!exact) {
                u = u.toLowerCase();
                c = c.toLowerCase();
            }

            if (allowAnyOrder) {
                const uArr = u.split(',').map(s => s.trim()).sort();
                const cArr = c.split(',').map(s => s.trim()).sort();
                if (JSON.stringify(uArr) === JSON.stringify(cArr)) {
                    isCorrect = true;
                    break;
                }
            } else {
                if (u === c) {
                    isCorrect = true;
                    break;
                }
            }
        }

        if (isCorrect) {
            score++;
            element.style.border = '2px solid #28a745';
        } else {
            element.style.border = '2px solid #dc3545';
        }
    });

    const feedback = document.getElementById(feedbackId);
    if (!feedback) return;

    feedback.style.display = 'block';

    if (score === total) {
        feedback.className = 'feedback success';
        feedback.textContent = `Отличная работа! Все ${total} ответов правильные.`;
    } else {
        feedback.className = 'feedback error';
        feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте исправить ошибки.`;
    }
};

window.checkQuiz01 = function () {
    checkQuiz({
        answers: {
            q1: 'zebra',
            q2: 'tiger',
            q3: 'dog',
            q4: 'cat',
            q5: 'owl'
        }
    });
};

window.checkQuiz06 = function () {
    checkQuiz({
        answers: {
            q1: 'an',
            q2: 'a',
            q3: 'the',
            q4: 'an',
            q5: 'a',
            q6: 'an',
            q7: 'the',
            q8: 'an',
            q9: 'a',
            q10: 'the'
        },
        feedbackId: 'articles-feedback'
    });
};

window.checkQuiz08 = function () {
    checkQuiz({
        answers: {
            q1: 'is',
            q2: 'are',
            q3: 'am'
        }
    });
};

window.checkQuiz2_2 = function () {
    checkQuiz({
        answers: {
            q1: 'run',
            q2: 'swim',
            q3: 'dance',
            q4: 'read'
        }
    });
};
window.checkQuiz2_4 = function () {
    checkQuiz({
        answers: {
            q1: 'Are',
            q2: 'Is',
            q3: 'am'
        },
        exact: true
    });
};

window.checkQuiz2_5 = function () {
    checkQuiz({
        answers: {
            ie1: "have got",
            ie2: ["hasn't got", "has not got"],
            ie3: "Has she got a brother?"
        },
        feedbackId: 'idioms-feedback',
        exact: true,
        allowAnyOrder: true
    });
};

window.checkQuiz2_3 = function () {
    checkQuiz({
        answers: {
            q1: ['dress,socks,shoes', 'dress, socks, shoes'],
            q2: ['T-shirt,shorts,socks,shoes', 'T-shirt, shorts, socks, shoes'],
            q3: ['dress,socks,shoes', 'dress, socks, shoes'],
            q4: ['T-shirt,pants,shoes', 'T-shirt, pants, shoes']
        },
        exact: false,
        allowAnyOrder: true
    });
};


window.checkQuiz2_9 = function () {
    checkQuiz({
        answers: {
            q1: 'twenty two',
            q2: 'thirty eight',
            q3: 'forty six',
            q4: 'sixty three',
            q5: 'ninety one'
        }
    });
};

window.checkQuiz3_1 = function () {
    checkQuiz({
        answers: {
            q1: 'playing soccer',
            q2: 'watching movies',
            q3: 'play the piano',
            q4: 'go hiking',
            q5: 'play an instrument',
            q6: 'piano'
        }
    });
};
window.checkQuiz3_10 = function () {
    checkQuiz({
        answers: {
            q1: 'i have got a blue backpack',
            q2: 'teacher is in the classroom',
            q3: 'i have got a red ruler'
        }
    });
};


/* ----- ПРОВЕРКА МЭТЧЕЙ В УРОКАХ ----- */
window.checkMatchingUniversal = function(matches, feedbackId = 'matching-feedback') {
    let score = 0;
    let total = Object.keys(matches).length;

    for (let key in matches) {
        const input = document.getElementById(key);
        const userChoice = input.value.trim();

        if (userChoice === matches[key]) {
            score++;
            input.style.borderColor = '#28a745'; 
        } else {
            input.style.borderColor = '#dc3545'; 
        }
    }

    const feedback = document.getElementById(feedbackId);
    feedback.style.display = 'block';

    if (score === total) {
        feedback.className = 'feedback success';
        feedback.textContent = 'Все верно! Отличная работа.';
    } else {
        feedback.className = 'feedback error';
        feedback.textContent = `Вы ответили верно на ${score} из ${total}. Попробуйте ещё раз.`;
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
    window.checkMatchingUniversal(matches);
};

window.checkMatching08 = function() {
    const matches = {
        match1: '1',
        match2: '2',
        match3: '1'
    };
    window.checkMatchingUniversal(matches);
};

window.checkMatching2_4 = function() {
    const matches = {
        match1: '1',
        match2: '2',
        match3: '1'
    };
    window.checkMatchingUniversal(matches);
};

window.checkMatching3_5 = function() {
    const matches = {
        match1: '2',
        match2: '2',
        match3: '1',
        match4: '1',
        match5: '1'
    };
    window.checkMatchingUniversal(matches);
};




/* ----- ИГРЫ ----- */


// ---------- Игра: Соедини цифру и слово ----------
const numberWords = [
    "zero", "one", "two", 
    "three", "four", "five",
    "six", "seven", "eight", 
    "nine", "ten", "eleven", 
    "twelve"
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

    window.checkQuizRadio = function() {
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
    



/* ----- ИГРА КАРТОЧКИ СЕМЬЯ ----- */
    window.initMatchingGame = function () {
        const pairs = [
        ["Father", "отец"],
        ["Mother", "мать"],
        ["Brother", "брат"],
        ["Sister", "сестра"],
        ["Grandmother", "бабушка"],
        ["Grandfather", "дедушка"]
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



    /* ----- ИГРА КАРТОЧКИ ЖИВОТНЫХ ----- */
    window.initMemoryGame = function () {
          (function(){
            const gameContainer = document.getElementById('memory-game');
            const resultDiv = document.getElementById('memory-result');
            const startBtn = document.getElementById('startBtn');
            startBtn.style.display = 'none';
            
            const pairs = [
            {id: 1, word: 'Fox', img: './assets/images/fox.png'}, 
            {id: 2, word: 'Rabbit', img: './assets/images/rabbit.png'},
            {id: 3, word: 'Elephant', img: './assets/images/elephant.png'},
            {id: 4, word: 'Wolf', img: './assets/images/wolf.png'}
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



/* ----- ИГРА ШОППИНГ ----- */
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



/* ----- ИГРА ЧАСТИ ТЕЛА ----- */
    window.initBodyGuessGame = function () {
  const quizData = [
    { img: "./assets/images/arm.png", answer: "Arm", options: ["Leg", "Hand", "Arm", "Foot"] },
    { img: "./assets/images/head.png", answer: "Head", options: ["Head", "Hair", "Back", "Ear"] },
    { img: "./assets/images/mouth.png", answer: "Mouth", options: ["Nose", "Mouth", "Eyes", "Teeth"] },
    { img: "./assets/images/eyes.png", answer: "Eyes", options: ["Cheeks", "Eyes", "Fingers", "Hair"] },
    { img: "./assets/images/leg.png", answer: "Leg", options: ["Hand", "Leg", "Foot", "Arm"] },
    { img: "./assets/images/tooth.png", answer: "Tooth", options: ["Mouth", "Tooth", "Nose", "Ear"] },
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
      button.style.backgroundColor = "#28a745";
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
      button.style.backgroundColor = "#dc3545"; 
      button.disabled = true; 
    }
  }

  showQuestion();
};

    

    const statsBtn = document.getElementById('stats-btn');
    statsBtn.addEventListener('click', showStats);

    const statsCloseBtn = document.getElementById('stats-close-btn');
    statsCloseBtn.addEventListener('click', function() {
        // 1) Прячем окно статистики
        document.getElementById('stats-modal').classList.add('hidden');
        // 2) Показываем главный экран с модулями
        mainButtons.classList.remove('hidden');
        // 3) все возможные экраны уроков/тестов/меню модулей скрываем
        moduleMenus.forEach(m => m.classList.add('hidden'));
        lessonsListContainers.forEach(c => c.classList.add('hidden'));
        lessonContent.classList.add('hidden');
        document.getElementById('current-module').textContent = "";
    });
    

    function showStats() {
        const { lessonsCompleted, testsCompleted, finalTestsCompleted, testResults = {} } = window.userStats;

        const statsModal = document.getElementById('stats-modal');
        const statsContent = document.getElementById('stats-content');

        // Группируем тесты по модулям
        const modules = {};

        for (const testId in testResults) {
            const [module, test] = testId.split('.');
            if (!modules[module]) {
                modules[module] = [];
            }

            const result = testResults[testId];

            let testLabel = '';
            const finalMatch = test.match(/^finaltest(\d*)$/);
            const regularMatch = test.match(/^test(\d+)$/);

            if (finalMatch) {
                testLabel = 'итоговый тест';
            } else if (regularMatch) {
                testLabel = `тест ${regularMatch[1]}`;
            } else {
                testLabel = test; 
            }

            modules[module].push(`- ${testLabel}: правильных ответов ${result.correct} из ${result.total}`);
        }

        let statsHtml = `
            <h3>Моя статистика</h3>
            <p>Уроков завершено: ${lessonsCompleted} / 30</p>
            <p>Промежуточных тестов пройдено: ${testsCompleted} / 9</p>
            <p>Итоговых тестов пройдено: ${finalTestsCompleted} / 3</p>
            <hr>
        `;

        for (const module in modules) {
            statsHtml += `<p><strong>${module.replace('module', 'Модуль ')}</strong></p><ul>`;
            for (const line of modules[module]) {
                statsHtml += `<li>${line}</li>`;
            }
            statsHtml += `</ul>`;
        }

        statsContent.innerHTML = statsHtml;
        statsModal.classList.remove('hidden');
    }

    unlockItemsByStats();

    restoreUnlockedItems();
    
});