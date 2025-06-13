function createBackButton() {
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
        document.getElementById('module2-list')?.classList.remove('hidden');
    };
    return button;
}

document.addEventListener("DOMContentLoaded", () => {
    const lessonContainer = document.querySelector(".lesson-container");
    if (lessonContainer) {
        const backBtn = createBackButton();
        lessonContainer.prepend(backBtn);
    }
});
