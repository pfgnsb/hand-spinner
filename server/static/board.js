const DRAG_THRESHOLD = 8;

const board = document.querySelector(".board");
let drag = null;

function createWork(id, title) {
  const work = document.createElement("article");
  work.className = "work";
  work.dataset.id = String(id);
  work.draggable = false;

  const heading = document.createElement("h3");
  heading.className = "work-title";
  heading.textContent = title;

  const actions = document.createElement("div");
  actions.className = "work-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.dataset.action = "edit";
  editButton.textContent = "編集";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.dataset.action = "delete";
  deleteButton.textContent = "削除";

  actions.append(editButton, deleteButton);
  work.append(heading, actions);
  return work;
}

function workTitle(work) {
  const heading = work.querySelector(".work-title");
  if (heading) {
    return heading.textContent;
  }
  const input = work.querySelector(".work-title-input");
  return input ? input.value : "";
}

function showTitle(work, title) {
  const heading = document.createElement("h3");
  heading.className = "work-title";
  heading.textContent = title;
  const input = work.querySelector(".work-title-input");
  if (input) {
    input.replaceWith(heading);
    return;
  }
  const current = work.querySelector(".work-title");
  if (current) {
    current.replaceWith(heading);
  }
}

async function finishEdit(work, commit) {
  const input = work.querySelector(".work-title-input");
  if (!input || input.dataset.closing === "1") {
    return;
  }
  input.dataset.closing = "1";
  const nextTitle = input.value.trim();
  const previous = input.dataset.previous;
  if (!commit || !nextTitle || nextTitle === previous) {
    showTitle(work, previous);
    return;
  }
  const response = await fetch(`/works/${work.dataset.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nextTitle }),
  });
  showTitle(work, response.ok ? nextTitle : previous);
}

function beginEdit(work) {
  if (work.querySelector(".work-title-input")) {
    return;
  }
  const heading = work.querySelector(".work-title");
  const input = document.createElement("input");
  input.className = "work-title-input";
  input.type = "text";
  input.value = heading.textContent;
  input.dataset.previous = heading.textContent;
  input.setAttribute("aria-label", "作品の名前");
  heading.replaceWith(input);
  input.focus();
  input.select();
}

board.addEventListener("submit", async (event) => {
  const form = event.target.closest(".adder");
  if (!form) {
    return;
  }
  event.preventDefault();
  const input = form.querySelector("input");
  const error = form.querySelector(".adder-error");
  const title = input.value.trim();
  if (!title) {
    error.hidden = false;
    return;
  }
  const state = form.closest(".state");
  const response = await fetch("/works", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state_id: Number(state.dataset.id), name: title }),
  });
  if (!response.ok) {
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const created = await response.json();
  state.querySelector(".works").append(createWork(created.id, created.name));
  input.value = "";
});

board.addEventListener("input", (event) => {
  const form = event.target.closest(".adder");
  if (!form || !event.target.value.trim()) {
    return;
  }
  form.querySelector(".adder-error").hidden = true;
});

board.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !board.contains(button)) {
    return;
  }
  const work = button.closest(".work");
  if (button.dataset.action === "edit") {
    beginEdit(work);
    return;
  }
  const title = workTitle(work);
  if (!window.confirm(`「${title}」を削除しますか？`)) {
    return;
  }
  const response = await fetch(`/works/${work.dataset.id}`, { method: "DELETE" });
  if (response.ok) {
    work.remove();
  }
});

board.addEventListener("focusout", (event) => {
  const input = event.target.closest(".work-title-input");
  if (!input) {
    return;
  }
  window.setTimeout(() => {
    if (!input.isConnected) {
      return;
    }
    finishEdit(input.closest(".work"), true);
  }, 0);
});

board.addEventListener("keydown", (event) => {
  const input = event.target.closest(".work-title-input");
  if (!input) {
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    finishEdit(input.closest(".work"), true);
  }
  if (event.key === "Escape") {
    event.preventDefault();
    finishEdit(input.closest(".work"), false);
  }
});

function clearDrag() {
  if (!drag) {
    return;
  }
  drag.work.classList.remove("is-dragging");
  const line = document.querySelector(".drop-line");
  if (line) {
    line.remove();
  }
  drag = null;
}

function findDrop(clientX, clientY) {
  const states = [...document.querySelectorAll(".state")];
  let state = states.find((element) => {
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right;
  });
  if (!state) {
    state = states
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        return { element, distance: Math.abs(clientX - center) };
      })
      .sort((left, right) => left.distance - right.distance)[0].element;
  }
  const works = [...state.querySelectorAll(".work")].filter((element) => element !== drag.work);
  let position = works.length;
  for (let index = 0; index < works.length; index += 1) {
    const rect = works[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      position = index;
      break;
    }
  }
  return { state, position };
}

function showDropLine(target) {
  const currentState = drag.work.closest(".state");
  const currentIndex = [...currentState.querySelectorAll(".work")].indexOf(drag.work);
  let line = document.querySelector(".drop-line");
  if (target.state === currentState && target.position === currentIndex) {
    if (line) {
      line.remove();
    }
    return;
  }
  if (!line) {
    line = document.createElement("div");
    line.className = "drop-line";
  }
  const works = [...target.state.querySelectorAll(".work")].filter((element) => element !== drag.work);
  target.state.querySelector(".works").insertBefore(line, works[target.position] || null);
}

board.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  if (event.target.closest("button, input, textarea, select, a, label")) {
    return;
  }
  const work = event.target.closest(".work");
  if (!work || !board.contains(work) || work.querySelector(".work-title-input")) {
    return;
  }
  event.preventDefault();
  work.setPointerCapture(event.pointerId);
  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    work,
    started: false,
  };
});

board.addEventListener("dragstart", (event) => {
  event.preventDefault();
});

window.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const distanceX = event.clientX - drag.startX;
  const distanceY = event.clientY - drag.startY;
  if (!drag.started) {
    if (distanceX * distanceX + distanceY * distanceY < DRAG_THRESHOLD * DRAG_THRESHOLD) {
      return;
    }
    drag.started = true;
    drag.work.classList.add("is-dragging");
  }
  event.preventDefault();
  showDropLine(findDrop(event.clientX, event.clientY));
}, { passive: false });

window.addEventListener("pointerup", async (event) => {
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }
  const current = drag;
  if (!current.started) {
    clearDrag();
    return;
  }
  const target = findDrop(event.clientX, event.clientY);
  clearDrag();
  const works = [...target.state.querySelectorAll(".work")].filter((element) => element !== current.work);
  target.state.querySelector(".works").insertBefore(current.work, works[target.position] || null);
  const response = await fetch(`/works/${current.work.dataset.id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state_id: Number(target.state.dataset.id),
      index: target.position,
    }),
  });
  if (!response.ok) {
    window.location.reload();
  }
});

window.addEventListener("pointercancel", () => {
  clearDrag();
});
