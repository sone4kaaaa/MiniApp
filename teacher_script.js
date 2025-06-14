    const firebaseConfig = {
      apiKey: "AIzaSyA6JL5JlJktik0k_3D_0vMl4fCD-E_7560",
      authDomain: "miniappenglish.firebaseapp.com",
      projectId: "miniappenglish",
      storageBucket: "miniappenglish.appspot.com",
      messagingSenderId: "643117676341",
      appId: "1:643117676341:web:1b351a0ed7b7230f10fe7c",
      measurementId: "G-M0GLSY5FC5"
    };
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();

    const userListDiv = document.getElementById('user-list');
    const searchInput = document.getElementById('search-input');
    const noResultDiv = document.getElementById('no-result');
    const userBlocks = {};

    async function loadAllUsers() {
      try {
        const snapshot = await db.collection('user_progress').get();
        snapshot.forEach(doc => {
          const userId = doc.id;
          addUserItem(userId);
        });
      } catch (e) {
        console.error('Ошибка при загрузке пользователей:', e);
      }
    }

    function addUserItem(userId) {
      const userBlock = document.createElement('div');
      userBlock.classList.add('teacher-user-block');
      userBlock.setAttribute('data-user-id', userId);

      const userItem = document.createElement('div');
      userItem.classList.add('teacher-user-item');
      userItem.textContent = userId;
      userBlock.appendChild(userItem);

      const userDetails = document.createElement('div');
      userDetails.classList.add('teacher-user-details');
      userBlock.appendChild(userDetails);

      userItem.addEventListener('click', () => {
        toggleDetails(userId, userDetails);
      });

      userListDiv.appendChild(userBlock);
      userBlocks[userId] = userBlock;
    }

    async function toggleDetails(userId, userDetailsDiv) {
      const isVisible = userDetailsDiv.classList.contains('visible');
      if (isVisible) {
        userDetailsDiv.classList.remove('visible');
        return;
      }
      userDetailsDiv.classList.add('visible');

      try {
        const docRef = db.collection('user_progress').doc(userId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
          userDetailsDiv.innerHTML = `<p>Нет данных для user_id: ${userId}</p>`;
          return;
        }

        const data = docSnap.data();
        const { userStats } = data || {};

        if (userStats) {
          const { lessonsCompleted = 0, testsCompleted = 0, finalTestsCompleted = 0, testResults = {} } = userStats;

          let statsHtml = `
            <p><strong>UserID:</strong> ${userId}</p>
            <p><strong>Уроков завершено:</strong> ${lessonsCompleted}</p>
            <p><strong>Промежуточных тестов:</strong> ${testsCompleted}</p>
            <p><strong>Итоговых тестов:</strong> ${finalTestsCompleted}</p>
            <hr>
          `;

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

          for (const module in modules) {
            statsHtml += `<p><strong>${module.replace('module', 'Модуль ')}</strong></p><ul>`;
            for (const line of modules[module]) {
              statsHtml += `<li>${line}</li>`;
            }
            statsHtml += `</ul>`;
          }

          userDetailsDiv.innerHTML = statsHtml;
        } else {
          userDetailsDiv.innerHTML = `<p>Нет userStats для ${userId}</p>`;
        }
      } catch (e) {
        console.error(e);
        userDetailsDiv.innerHTML = `<p>Ошибка при загрузке статистики для ${userId}</p>`;
      }
    }

    function filterUsers(query) {
      const normalizedQuery = query.trim().toLowerCase();

      if (normalizedQuery === "") {
        Object.values(userBlocks).forEach(block => block.style.display = 'block');
        noResultDiv.classList.remove('visible');
        return;
      }

      const matchedBlock = userBlocks[normalizedQuery];
      if (matchedBlock) {
        Object.values(userBlocks).forEach(block => {
          block.style.display = block === matchedBlock ? 'block' : 'none';
        });
        noResultDiv.classList.remove('visible');
      } else {
        Object.values(userBlocks).forEach(block => block.style.display = 'none');
        noResultDiv.classList.add('visible');
      }
    }

    searchInput.addEventListener('input', (e) => {
      filterUsers(e.target.value);
    });

    loadAllUsers();