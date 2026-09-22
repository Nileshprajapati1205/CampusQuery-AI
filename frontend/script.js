/* =========================================================
   CampusQuery AI — script.js
   Modular, vanilla JS. Sections:
     1. State & storage
     2. DOM references
     3. View switching + mobile drawer
     4. Chat: rendering, sending, history
     5. AI INTEGRATION LAYER (mock — replace with real API)
     6. Documents
     7. Saved answers
     8. Settings
     9. Init
   ========================================================= */

(function () {
  "use strict";

  /* ===================== 1. STATE & STORAGE ===================== */

  const STORAGE_KEYS = {
    chats: "cqai_chats",           // all chat sessions for this browser session
    activeChat: "cqai_active_chat",
    saved: "cqai_saved_answers",
    theme: "cqai_theme",
    notifications: "cqai_notifications"
  };

  /** In-memory app state, backed by sessionStorage/localStorage where noted. */
  const state = {
    chats: sanitizeChats(loadJSON(sessionStorage, STORAGE_KEYS.chats, [])),   // [{id, title, messages: [{role, html, source, id}]}]
    activeChatId: sessionStorage.getItem(STORAGE_KEYS.activeChat) || null,
    savedAnswers: sanitizeSavedAnswers(loadJSON(localStorage, STORAGE_KEYS.saved, [])),
    documents: buildMockDocuments(),
    documentFilter: "all",
    documentQuery: ""
  };

  function loadJSON(store, key, fallback) {
    try {
      const raw = store.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      // Corrupted storage guard: if we expected an array, don't hand back
      // something else (an object, a string, null) that later array
      // operations (.find, .unshift, .filter) would throw on.
      if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
      return parsed;
    } catch (err) {
      return fallback;
    }
  }

  function sanitizeChats(chats) {
    if (!Array.isArray(chats)) return [];
    return chats.filter(
      (c) => c && typeof c.id === "string" && Array.isArray(c.messages)
    );
  }

  function sanitizeSavedAnswers(items) {
    if (!Array.isArray(items)) return [];
    return items.filter((a) => a && typeof a.id === "string" && typeof a.messageId === "string");
  }
  function saveChats() { sessionStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(state.chats)); }
  function saveActiveChat() {
    if (state.activeChatId) sessionStorage.setItem(STORAGE_KEYS.activeChat, state.activeChatId);
    else sessionStorage.removeItem(STORAGE_KEYS.activeChat);
  }
  function saveSavedAnswers() { localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(state.savedAnswers)); }

  function uid() { return Math.random().toString(36).slice(2, 10); }

  /* ===================== 2. DOM REFERENCES ===================== */

  const dom = {
    hamburgerBtn: document.getElementById("hamburgerBtn"),
    sidebarCloseBtn: document.getElementById("sidebarCloseBtn"),
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    navItems: document.querySelectorAll(".nav-item"),
    views: document.querySelectorAll(".view"),

    newChatBtn: document.getElementById("newChatBtn"),
    clearChatBtn: document.getElementById("clearChatBtn"),
    chatHistoryList: document.getElementById("chatHistoryList"),
    chatHistoryEmpty: document.getElementById("chatHistoryEmpty"),

    chatScroll: document.getElementById("chatScroll"),
    welcomeScreen: document.getElementById("welcomeScreen"),
    exampleGrid: document.getElementById("exampleGrid"),
    messages: document.getElementById("messages"),

    composerForm: document.getElementById("composerForm"),
    messageInput: document.getElementById("messageInput"),
    sendBtn: document.getElementById("sendBtn"),
    attachBtn: document.getElementById("attachBtn"),
    micBtn: document.getElementById("micBtn"),

    documentSearch: document.getElementById("documentSearch"),
    filterChips: document.getElementById("filterChips"),
    documentGrid: document.getElementById("documentGrid"),
    documentEmptyNote: document.getElementById("documentEmptyNote"),

    savedList: document.getElementById("savedList"),
    savedEmptyState: document.getElementById("savedEmptyState"),

    themeSegmented: document.getElementById("themeSegmented"),
    notificationsToggle: document.getElementById("notificationsToggle"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),

    toast: document.getElementById("toast")
  };

  /* ===================== 3. VIEW SWITCHING + MOBILE DRAWER ===================== */

  function switchView(viewName) {
    dom.navItems.forEach((btn) => {
      const active = btn.dataset.view === viewName;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    dom.views.forEach((section) => section.classList.toggle("is-active", section.dataset.viewPanel === viewName));
    closeSidebar();
    if (viewName === "documents") renderDocuments();
    if (viewName === "saved") renderSavedAnswers();
  }

  dom.navItems.forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  function openSidebar() {
    dom.sidebar.classList.add("is-open");
    dom.sidebarOverlay.classList.add("is-visible");
    dom.hamburgerBtn.setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    dom.sidebar.classList.remove("is-open");
    dom.sidebarOverlay.classList.remove("is-visible");
    dom.hamburgerBtn.setAttribute("aria-expanded", "false");
  }
  dom.hamburgerBtn.addEventListener("click", openSidebar);
  dom.sidebarCloseBtn.addEventListener("click", closeSidebar);
  dom.sidebarOverlay.addEventListener("click", closeSidebar);

  /* ===================== 4. CHAT: RENDERING, SENDING, HISTORY ===================== */

  function getActiveChat() {
    return state.chats.find((c) => c.id === state.activeChatId) || null;
  }

  function ensureActiveChat() {
    let chat = getActiveChat();
    if (!chat) {
      chat = { id: uid(), title: "New conversation", messages: [] };
      state.chats.unshift(chat);
      state.activeChatId = chat.id;
      saveChats();
      saveActiveChat();
    }
    return chat;
  }

  function renderChatHistoryList() {
    dom.chatHistoryList.innerHTML = "";
    if (state.chats.length === 0) {
      dom.chatHistoryEmpty.hidden = false;
      return;
    }
    dom.chatHistoryEmpty.hidden = true;
    state.chats.forEach((chat) => {
      const btn = document.createElement("button");
      btn.className = "history-item" + (chat.id === state.activeChatId ? " is-active" : "");
      btn.textContent = chat.title;
      btn.addEventListener("click", () => {
        state.activeChatId = chat.id;
        saveActiveChat();
        renderActiveChat();
        renderChatHistoryList();
        switchView("chat");
      });
      dom.chatHistoryList.appendChild(btn);
    });
  }

  function renderActiveChat() {
    const chat = getActiveChat();
    dom.messages.innerHTML = "";
    const hasMessages = chat && chat.messages.length > 0;
    dom.welcomeScreen.style.display = hasMessages ? "none" : "flex";
    if (!hasMessages) return;
    chat.messages.forEach((msg) => appendMessageToDOM(msg));
    scrollChatToBottom();
  }

  function scrollChatToBottom() {
    dom.chatScroll.scrollTop = dom.chatScroll.scrollHeight;
  }

  function appendMessageToDOM(msg) {
    const wrapper = document.createElement("div");
    wrapper.className = "message message--" + msg.role;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = msg.html;

    if (msg.role === "ai" && msg.source) {
      const sourceBlock = document.createElement("div");
      sourceBlock.className = "source-block";
      sourceBlock.innerHTML =
        '<span class="source-label">Source</span>' +
        '<button class="source-chip" type="button">📄 ' + escapeHTML(msg.source.doc) +
        (msg.source.page ? " · Page " + escapeHTML(String(msg.source.page)) : "") +
        "</button>";
      sourceBlock.querySelector(".source-chip").addEventListener("click", () => {
        switchView("documents");
        dom.documentSearch.value = msg.source.doc;
        state.documentQuery = msg.source.doc.toLowerCase();
        renderDocuments();
      });
      bubble.appendChild(sourceBlock);
    }

    if (msg.role === "ai") {
      const actions = document.createElement("div");
      actions.className = "bubble-actions";
      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "bubble-action";
      const alreadySaved = state.savedAnswers.some((a) => a.messageId === msg.id);
      saveBtn.textContent = alreadySaved ? "★ Saved" : "☆ Save answer";
      if (alreadySaved) saveBtn.classList.add("is-saved");
      saveBtn.addEventListener("click", () => {
        toggleSaveAnswer(msg);
        renderActiveChat();
      });
      actions.appendChild(saveBtn);
      bubble.appendChild(actions);
    }

    wrapper.appendChild(bubble);
    dom.messages.appendChild(wrapper);
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function addMessage(role, html, source) {
    const chat = ensureActiveChat();
    const msg = { id: uid(), role, html, source: source || null };
    chat.messages.push(msg);
    if (role === "user" && chat.title === "New conversation") {
      chat.title = html.replace(/<[^>]+>/g, "").slice(0, 42);
    }
    saveChats();
    dom.welcomeScreen.style.display = "none";
    appendMessageToDOM(msg);
    scrollChatToBottom();
    renderChatHistoryList();
    return msg;
  }

  function showTypingIndicator() {
    const wrapper = document.createElement("div");
    wrapper.className = "message message--ai";
    wrapper.id = "typingIndicator";
    wrapper.innerHTML =
      '<div class="bubble typing-bubble"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
    dom.messages.appendChild(wrapper);
    scrollChatToBottom();
  }
  function hideTypingIndicator() {
    const el = document.getElementById("typingIndicator");
    if (el) el.remove();
  }

  async function handleSend(text) {
    const trimmed = text.trim();
    if (!trimmed || dom.messageInput.disabled) return;

    addMessage("user", escapeHTML(trimmed));
    dom.messageInput.value = "";
    autoGrowTextarea();
    updateSendButtonState();

    dom.messageInput.disabled = true;
    dom.sendBtn.disabled = true;

    showTypingIndicator();
    try {
      const response = await sendMessageToAI(trimmed);
      addMessage("ai", response.html, response.source);
    } catch (err) {
      addMessage(
        "ai",
        '<p>Something went wrong while reaching CampusQuery AI. Please try again in a moment.</p>'
      );
    } finally {
      hideTypingIndicator();
      dom.messageInput.disabled = false;
      updateSendButtonState();
      dom.messageInput.focus();
    }
  }

  dom.composerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSend(dom.messageInput.value);
  });

  dom.messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(dom.messageInput.value);
    }
  });

  dom.messageInput.addEventListener("input", () => {
    autoGrowTextarea();
    updateSendButtonState();
  });

  function autoGrowTextarea() {
    dom.messageInput.style.height = "auto";
    dom.messageInput.style.height = Math.min(dom.messageInput.scrollHeight, 160) + "px";
  }
  function updateSendButtonState() {
    dom.sendBtn.disabled = dom.messageInput.value.trim().length === 0;
  }

  dom.exampleGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".example-card");
    if (!card) return;
    dom.messageInput.value = card.dataset.question;
    updateSendButtonState();
    autoGrowTextarea();
    dom.messageInput.focus();
  });

  dom.newChatBtn.addEventListener("click", () => {
    state.activeChatId = null;
    saveActiveChat();
    renderActiveChat();
    renderChatHistoryList();
    switchView("chat");
    dom.messageInput.focus();
  });

  dom.clearChatBtn.addEventListener("click", () => {
    const chat = getActiveChat();
    if (!chat || chat.messages.length === 0) return;
    chat.messages = [];
    chat.title = "New conversation";
    saveChats();
    renderActiveChat();
    renderChatHistoryList();
    showToast("Conversation cleared");
  });

  dom.attachBtn.addEventListener("click", () => {
    showToast("Document upload isn't wired up in this preview yet");
  });
  dom.micBtn.addEventListener("click", () => {
    showToast("Voice input isn't wired up in this preview yet");
  });

  /* ===================== 5. AI INTEGRATION LAYER (MOCK) =====================
     Replace the body of sendMessageToAI() with a real request to your
     Flask / RAG / LLM backend. Keep the same signature and return shape:
       Promise<{ html: string, source: { doc: string, page: number } | null }>
     so the rest of the frontend needs no changes.
     ========================================================================= */

  const MOCK_KNOWLEDGE_BASE = [
    {
      keywords: ["exam form", "exam submission", "form deadline", "exam deadline"],
      source: { doc: "Examination Notice.pdf", page: 2 },
      html:
        "<p>Your examination form must be submitted by <span class=\"date-highlight\">25 September 2026</span>.</p>" +
        "<p>Late submissions with a fine are accepted until <strong>30 September 2026</strong>. Forms can be submitted through the student portal under <strong>Exams &rarr; Form Submission</strong>.</p>"
    },
    {
      keywords: ["timetable", "exam schedule", "exam dates"],
      source: { doc: "Exam Timetable - Odd Semester.pdf", page: 1 },
      html:
        "<h4>Latest exam timetable</h4>" +
        "<ul>" +
        "<li><strong>Data Structures</strong> — <span class=\"date-highlight\">3 Nov 2026</span>, 10:00 AM</li>" +
        "<li><strong>Operating Systems</strong> — <span class=\"date-highlight\">6 Nov 2026</span>, 10:00 AM</li>" +
        "<li><strong>Database Systems</strong> — <span class=\"date-highlight\">9 Nov 2026</span>, 2:00 PM</li>" +
        "</ul>"
    },
    {
      keywords: ["admission", "documents required", "admission documents"],
      source: { doc: "Admission Guidelines 2026.pdf", page: 4 },
      html:
        "<p>For admission you'll need to submit:</p>" +
        "<ul>" +
        "<li>10th and 12th mark sheets</li>" +
        "<li>Transfer certificate</li>" +
        "<li>Migration certificate (if applicable)</li>" +
        "<li>4 passport-size photographs</li>" +
        "<li>Category certificate, if claiming reservation</li>" +
        "</ul>"
    },
    {
      keywords: ["semester start", "semester begin", "classes start"],
      source: { doc: "Academic Calendar 2026-27.pdf", page: 1 },
      html: "<p>The new semester begins on <span class=\"date-highlight\">1 December 2026</span>. Orientation for new students is held the week before, from 24 November.</p>"
    },
    {
      keywords: ["attendance"],
      source: { doc: "College Rules & Regulations.pdf", page: 7 },
      html:
        "<p>You're required to maintain <strong>75% attendance</strong> in each subject to be eligible to sit for the semester exam.</p>" +
        "<p>Students below 75% but above 65% may apply for condonation through the department office, subject to a valid reason.</p>"
    },
    {
      keywords: ["circular", "notice"],
      source: { doc: "General Circular - September 2026.pdf", page: 1 },
      html: "<p>The most recent circular announces a change in library hours: the library will now stay open until <span class=\"date-highlight\">8:00 PM</span> on weekdays.</p>"
    }
  ];

  const FALLBACK_RESPONSE_HTML =
    "<p>I couldn't find anything specific about that in the available college documents yet.</p>" +
    "<p>Try asking about exam schedules, admission requirements, attendance rules, or important dates — or check the <strong>Documents</strong> section for the full list of what I can search.</p>";

  /**
   * sendMessageToAI(message)
   * MOCK implementation — swap this out for a real fetch() call, e.g.:
   *
   *   async function sendMessageToAI(message) {
   *     const res = await fetch("/api/query", {
   *       method: "POST",
   *       headers: { "Content-Type": "application/json" },
   *       body: JSON.stringify({ message, chatId: state.activeChatId })
   *     });
   *     if (!res.ok) throw new Error("Request failed");
   *     return await res.json(); // { html, source }
   *   }
   */
  function sendMessageToAI(message) {
    const lower = message.toLowerCase();
    const match = MOCK_KNOWLEDGE_BASE.find((entry) =>
      entry.keywords.some((kw) => lower.includes(kw))
    );

    return new Promise((resolve) => {
      const delay = 600 + Math.random() * 700;
      setTimeout(() => {
        if (match) resolve({ html: match.html, source: match.source });
        else resolve({ html: FALLBACK_RESPONSE_HTML, source: null });
      }, delay);
    });
  }

  /* ===================== 6. DOCUMENTS ===================== */

  function buildMockDocuments() {
    return [
      { id: "d1", name: "Examination Notice.pdf", type: "notice", uploadDate: "18 Sep 2026", pages: 4 },
      { id: "d2", name: "Exam Timetable - Odd Semester.pdf", type: "exam", uploadDate: "15 Sep 2026", pages: 2 },
      { id: "d3", name: "Admission Guidelines 2026.pdf", type: "notice", uploadDate: "02 Aug 2026", pages: 12 },
      { id: "d4", name: "Academic Calendar 2026-27.pdf", type: "notice", uploadDate: "20 Jul 2026", pages: 3 },
      { id: "d5", name: "College Rules & Regulations.pdf", type: "circular", uploadDate: "10 Jul 2026", pages: 18 },
      { id: "d6", name: "General Circular - September 2026.pdf", type: "circular", uploadDate: "19 Sep 2026", pages: 1 },
      { id: "d7", name: "Annual Tech Fest - Schedule.pdf", type: "event", uploadDate: "12 Sep 2026", pages: 5 },
      { id: "d8", name: "Assignment Guidelines - CS301.pdf", type: "notice", uploadDate: "05 Sep 2026", pages: 2 }
    ];
  }

  function renderDocuments() {
    const filtered = state.documents.filter((doc) => {
      const matchesFilter = state.documentFilter === "all" || doc.type === state.documentFilter;
      const matchesQuery = doc.name.toLowerCase().includes(state.documentQuery);
      return matchesFilter && matchesQuery;
    });

    dom.documentGrid.innerHTML = "";
    dom.documentEmptyNote.hidden = filtered.length !== 0;

    filtered.forEach((doc) => {
      const card = document.createElement("article");
      card.className = "doc-card";
      card.innerHTML =
        '<div class="doc-card__top">' +
        '<div class="doc-card__icon">PDF</div>' +
        '<div>' +
        '<div class="doc-card__name">' + escapeHTML(doc.name) + "</div>" +
        '<div class="doc-card__meta">' + capitalize(doc.type) + " &middot; " + doc.pages + " pages</div>" +
        "</div>" +
        "</div>" +
        '<div class="doc-card__details">' +
        "<span>Uploaded: " + doc.uploadDate + "</span>" +
        "</div>" +
        '<button class="doc-card__view-btn" type="button">View document</button>';
      card.querySelector(".doc-card__view-btn").addEventListener("click", () => {
        showToast("Opening \"" + doc.name + "\" isn't wired up in this preview yet");
      });
      dom.documentGrid.appendChild(card);
    });
  }

  function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

  dom.documentSearch.addEventListener("input", (e) => {
    state.documentQuery = e.target.value.toLowerCase();
    renderDocuments();
  });

  dom.filterChips.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;
    state.documentFilter = chip.dataset.filter;
    dom.filterChips.querySelectorAll(".filter-chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    renderDocuments();
  });

  /* ===================== 7. SAVED ANSWERS ===================== */

  function toggleSaveAnswer(msg) {
    const existingIndex = state.savedAnswers.findIndex((a) => a.messageId === msg.id);
    if (existingIndex > -1) {
      state.savedAnswers.splice(existingIndex, 1);
      showToast("Removed from saved answers");
      saveSavedAnswers();
      return;
    }

    const chat = getActiveChat();
    if (!chat) return;

    const msgIndex = chat.messages.findIndex((m) => m.id === msg.id);
    let question = "Question";
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (chat.messages[i].role === "user") {
        question = stripHTML(chat.messages[i].html);
        break;
      }
    }

    state.savedAnswers.unshift({
      id: uid(),
      messageId: msg.id,
      question: question,
      answerPreview: stripHTML(msg.html).slice(0, 140),
      source: msg.source,
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    });
    showToast("Answer saved");
    saveSavedAnswers();
  }

  function stripHTML(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }

  function renderSavedAnswers() {
    dom.savedList.innerHTML = "";
    dom.savedEmptyState.classList.toggle("is-visible", state.savedAnswers.length === 0);

    state.savedAnswers.forEach((item) => {
      const card = document.createElement("article");
      card.className = "saved-card";
      card.innerHTML =
        '<div class="saved-card__q">' + escapeHTML(item.question) + "</div>" +
        '<div class="saved-card__a">' + escapeHTML(item.answerPreview) + (item.answerPreview.length >= 140 ? "…" : "") + "</div>" +
        '<div class="saved-card__footer">' +
        "<span>" + item.date + (item.source ? " &middot; 📄 " + escapeHTML(item.source.doc) : "") + "</span>" +
        '<button class="saved-card__remove" type="button">Remove</button>' +
        "</div>";
      card.querySelector(".saved-card__remove").addEventListener("click", () => {
        state.savedAnswers = state.savedAnswers.filter((a) => a.id !== item.id);
        saveSavedAnswers();
        renderSavedAnswers();
        renderActiveChat();
        showToast("Removed from saved answers");
      });
      dom.savedList.appendChild(card);
    });
  }

  /* ===================== 8. SETTINGS ===================== */

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    dom.themeSegmented.querySelectorAll(".segmented__btn").forEach((btn) => {
      const active = btn.dataset.theme === theme;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", String(active));
    });
  }

  dom.themeSegmented.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented__btn");
    if (!btn) return;
    applyTheme(btn.dataset.theme);
  });

  dom.notificationsToggle.addEventListener("click", () => {
    const isOn = dom.notificationsToggle.classList.toggle("is-on");
    dom.notificationsToggle.setAttribute("aria-checked", String(isOn));
    localStorage.setItem(STORAGE_KEYS.notifications, isOn ? "on" : "off");
    showToast(isOn ? "Notifications turned on" : "Notifications turned off");
  });

  dom.clearHistoryBtn.addEventListener("click", () => {
    state.chats = [];
    state.activeChatId = null;
    saveChats();
    saveActiveChat();
    renderActiveChat();
    renderChatHistoryList();
    showToast("Chat history cleared");
  });

  /* ===================== TOAST ===================== */

  let toastTimer = null;
  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 2400);
  }

  /* ===================== 9. INIT ===================== */

  function init() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || "light";
    applyTheme(savedTheme);

    const notifState = localStorage.getItem(STORAGE_KEYS.notifications);
    if (notifState === "off") {
      dom.notificationsToggle.classList.remove("is-on");
      dom.notificationsToggle.setAttribute("aria-checked", "false");
    }

    if (state.activeChatId && !getActiveChat()) state.activeChatId = null;

    renderActiveChat();
    renderChatHistoryList();
    renderDocuments();
    updateSendButtonState();
  }

  init();
})();