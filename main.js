// 简单本地状态
const state = {
    sending: false,
    currentApp: "chat", // chat | moments | diary
    currentScreen: "home", // home | chat | settings
    moments: [], // 朋友圈列表
    diary: [], // 日记列表
    // 多个角色（好友）和多个用户人设
    chars: [], // {id, name, persona}
    userProfiles: [], // {id, name, persona}
    currentCharId: null,
    currentUserProfileId: null,
    // AI 记忆
    memoryEnabled: false,
    memoryEvery: 20,
    memorySummary: "",
    memorySinceLastSummary: 0,
    // 按好友分组的会话记录：{ [charId]: { messages: [{role, content, time}], unread } }
    sessions: {},
    // 自动朋友圈/日记：记录上一次自动生成时该会话的消息条数，避免重复触发
    lastAutoMomentMsgCount: 0,
    lastAutoDiaryMsgCount: 0,
    // 当前正在编辑的用户人设 ID（用于“我”的人设编辑）
    editingUserProfileId: null,
};

function $(id) {
    return document.getElementById(id);
}

function isAvatarUrl(value) {
    if (!value) return false;
    const v = String(value).trim();
    if (!v) return false;
    return /^https?:\/\//i.test(v) || v.startsWith("data:image");
}

function syncDiscoverAvatar() {
    const currentUser = state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
    const name = currentUser?.name || "我";
    const avatar = currentUser?.avatar || "";
    const entryAvatar = $("discoverMomentsAvatar");
    const headerAvatar = $("momentsProfileAvatar");
    const headerName = $("momentsProfileName");
    if (headerName) headerName.textContent = name;

    function fillAvatarBox(box) {
        if (!box) return;
        box.innerHTML = "";
        const raw = avatar && String(avatar).trim();
        if (raw && isAvatarUrl(raw)) {
            const img = document.createElement("img");
            img.src = raw;
            img.alt = name;
            box.appendChild(img);
        } else {
            box.textContent = (raw || name || "?").charAt(0);
        }
    }

    fillAvatarBox(entryAvatar);
    fillAvatarBox(headerAvatar);
}

function loadSettings() {
    try {
        const raw = localStorage.getItem("aiChatSettings");
        if (!raw) return;
        const cfg = JSON.parse(raw);

        // 多角色与多用户人设
        if (Array.isArray(cfg.chars)) state.chars = cfg.chars;
        if (Array.isArray(cfg.userProfiles)) state.userProfiles = cfg.userProfiles;
        if (cfg.currentCharId) state.currentCharId = cfg.currentCharId;
        if (cfg.currentUserProfileId) state.currentUserProfileId = cfg.currentUserProfileId;

        // 聊天记录 / 朋友圈 / 日记
        if (cfg.sessions && typeof cfg.sessions === "object") state.sessions = cfg.sessions;
        if (Array.isArray(cfg.moments)) state.moments = cfg.moments;
        if (Array.isArray(cfg.diary)) state.diary = cfg.diary;
        if (typeof cfg.lastAutoMomentMsgCount === "number")
            state.lastAutoMomentMsgCount = cfg.lastAutoMomentMsgCount;
        if (typeof cfg.lastAutoDiaryMsgCount === "number")
            state.lastAutoDiaryMsgCount = cfg.lastAutoDiaryMsgCount;

        // AI 记忆 / 开关类配置
        if (typeof cfg.memoryEnabled === "boolean") state.memoryEnabled = cfg.memoryEnabled;
        if (typeof cfg.memoryEvery === "number") state.memoryEvery = cfg.memoryEvery;
        if (typeof cfg.memorySummary === "string") state.memorySummary = cfg.memorySummary;
        if (typeof cfg.autoMoments === "boolean") {
            const el = $("autoMoments");
            if (el) el.checked = cfg.autoMoments;
        }
        if (typeof cfg.autoDiary === "boolean") {
            const el = $("autoDiary");
            if (el) el.checked = cfg.autoDiary;
        }
        const memEnabledEl = $("memoryEnabled");
        if (memEnabledEl) memEnabledEl.checked = !!cfg.memoryEnabled;
        const memEveryEl = $("memoryEvery");
        if (memEveryEl && typeof cfg.memoryEvery === "number") {
            memEveryEl.value = String(cfg.memoryEvery);
        }

        // 接口配置
        if (cfg.baseUrl) $("baseUrl").value = cfg.baseUrl;
        if (cfg.model) {
            // 兼容旧版本存储的 model 字段，写入自定义模型输入框
            $("modelCustom").value = cfg.model;
        }
        if (cfg.modelSelected) {
            const select = $("modelSelect");
            const opt = document.createElement("option");
            opt.value = cfg.modelSelected;
            opt.textContent = cfg.modelSelected;
            select.appendChild(opt);
            select.value = cfg.modelSelected;
        }
        if (Array.isArray(cfg.modelList)) {
            const select = $("modelSelect");
            select.innerHTML = "";
            cfg.modelList.forEach((m) => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });
            if (cfg.modelSelected && cfg.modelList.includes(cfg.modelSelected)) {
                select.value = cfg.modelSelected;
            }
        }
        if (cfg.apiKey) $("apiKey").value = cfg.apiKey;

        // 渲染基于状态的数据
        renderCharList();
        renderUserProfileList();
        renderMoments();
        renderDiary();
        syncSelectors();
        syncDiscoverAvatar();
    } catch (e) {
        console.warn("加载本地设置失败", e);
    }
}

function internalSaveSettings(showAlert) {
    const select = $("modelSelect");
    const selectedModel = select.value || "";
    const cfg = {
        chars: state.chars,
        userProfiles: state.userProfiles,
        currentCharId: state.currentCharId,
        currentUserProfileId: state.currentUserProfileId,
        sessions: state.sessions,
        moments: state.moments,
        diary: state.diary,
        lastAutoMomentMsgCount: state.lastAutoMomentMsgCount,
        lastAutoDiaryMsgCount: state.lastAutoDiaryMsgCount,
        autoMoments: $("autoMoments") ? $("autoMoments").checked : false,
        autoDiary: $("autoDiary") ? $("autoDiary").checked : false,
        memoryEnabled: $("memoryEnabled") ? $("memoryEnabled").checked : false,
        memoryEvery: (function () {
            const v = $("memoryEvery") ? parseInt($("memoryEvery").value, 10) : 0;
            if (!Number.isFinite(v) || v <= 0) return state.memoryEvery || 20;
            return v;
        })(),
        memorySummary: state.memorySummary,
        baseUrl: $("baseUrl").value.trim() || "https://api.openai.com/v1",
        model: $("modelCustom").value.trim(),
        modelSelected: selectedModel,
        modelList: Array.from(select.options).map((o) => o.value),
        apiKey: $("apiKey").value.trim(),
    };
    localStorage.setItem("aiChatSettings", JSON.stringify(cfg));
    if (showAlert) {
        alert("已保存到本地（仅当前浏览器可见）");
    }
}

function saveSettings() {
    internalSaveSettings(true);
}

function saveSettingsSilent() {
    internalSaveSettings(false);
}

// 渲染角色（好友）和用户人设相关 UI
function renderCharList() {
    const list = $("charList");
    if (!list) return;
    list.innerHTML = "";
    state.chars.forEach((c) => {
        const li = document.createElement("li");
        li.className = "contact-item";
        const main = document.createElement("div");
        main.className = "contact-main";
        const name = document.createElement("div");
        name.className = "contact-name";
        name.textContent = c.name || "未命名好友";
        const persona = document.createElement("div");
        persona.className = "contact-persona";
        persona.textContent = c.persona || "(未填写人设)";
        main.appendChild(name);
        main.appendChild(persona);

        const actions = document.createElement("div");
        actions.className = "list-actions";
        const btnUse = document.createElement("button");
        btnUse.className = "btn secondary";
        btnUse.textContent = "设为当前";
        btnUse.addEventListener("click", () => {
            state.currentCharId = c.id;
            syncSelectors();
            saveSettings();
        });
        const btnDel = document.createElement("button");
        btnDel.className = "btn secondary";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            state.chars = state.chars.filter((x) => x.id !== c.id);
            if (state.currentCharId === c.id) state.currentCharId = null;
            renderCharList();
            syncSelectors();
            saveSettings();
        });
        actions.appendChild(btnUse);
        actions.appendChild(btnDel);

        li.appendChild(main);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

function renderUserProfileList() {
    const list = $("userProfileList");
    if (!list) return;
    list.innerHTML = "";
    state.userProfiles.forEach((p) => {
        const li = document.createElement("li");
        li.className = "profile-item";
        const avatarWrap = document.createElement("div");
        avatarWrap.className = "profile-avatar";
        const avatarRaw = p.avatar && String(p.avatar).trim();
        if (avatarRaw && isAvatarUrl(avatarRaw)) {
            const img = document.createElement("img");
            img.src = avatarRaw;
            img.alt = p.name || "头像";
            avatarWrap.appendChild(img);
        } else if (avatarRaw) {
            avatarWrap.textContent = avatarRaw.charAt(0);
        } else {
            avatarWrap.textContent = (p.name || "?").charAt(0);
        }
        const main = document.createElement("div");
        main.className = "profile-main";
        const name = document.createElement("div");
        name.className = "profile-name";
        name.textContent = p.name || "未命名人设";
        const persona = document.createElement("div");
        persona.className = "profile-persona";
        persona.textContent = p.persona || "(未填写人设)";
        main.appendChild(name);
        main.appendChild(persona);

        const actions = document.createElement("div");
        actions.className = "list-actions";
        const btnUse = document.createElement("button");
        btnUse.className = "btn secondary";
        btnUse.textContent = "设为当前";
        btnUse.addEventListener("click", () => {
            state.currentUserProfileId = p.id;
            syncSelectors();
            syncDiscoverAvatar();
            saveSettings();
        });
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn secondary";
        btnEdit.textContent = "编辑";
        btnEdit.addEventListener("click", () => {
            state.editingUserProfileId = p.id;
            const nameInput = $("newUserName");
            const avatarInput = $("newUserAvatar");
            const personaInput = $("newUserPersona");
            if (nameInput) nameInput.value = p.name || "";
            if (avatarInput) avatarInput.value = p.avatar || "";
            if (personaInput) personaInput.value = p.persona || "";
            const btn = $("addUserProfileBtn");
            if (btn && !btn.dataset.originalText) {
                btn.dataset.originalText = btn.textContent || "";
            }
            if (btn) btn.textContent = "保存人设修改";
        });
        const btnDel = document.createElement("button");
        btnDel.className = "btn secondary";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            state.userProfiles = state.userProfiles.filter((x) => x.id !== p.id);
            if (state.currentUserProfileId === p.id) state.currentUserProfileId = null;
            renderUserProfileList();
            syncSelectors();
            syncDiscoverAvatar();
            saveSettings();
        });
        actions.appendChild(btnUse);
        actions.appendChild(btnEdit);
        actions.appendChild(btnDel);

        li.appendChild(avatarWrap);
        li.appendChild(main);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

function syncSelectors() {
    const charSelect = $("chatCharSelect");
    const userSelect = $("chatUserProfileSelect");
    if (charSelect) {
        charSelect.innerHTML = "";
        state.chars.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.name || "未命名好友";
            charSelect.appendChild(opt);
        });
        if (state.currentCharId && state.chars.some((c) => c.id === state.currentCharId)) {
            charSelect.value = state.currentCharId;
        } else if (state.chars[0]) {
            state.currentCharId = state.chars[0].id;
            charSelect.value = state.currentCharId;
        }
    }
    if (userSelect) {
        userSelect.innerHTML = "";
        state.userProfiles.forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || "未命名人设";
            userSelect.appendChild(opt);
        });
        if (
            state.currentUserProfileId &&
            state.userProfiles.some((p) => p.id === state.currentUserProfileId)
        ) {
            userSelect.value = state.currentUserProfileId;
        } else if (state.userProfiles[0]) {
            state.currentUserProfileId = state.userProfiles[0].id;
            userSelect.value = state.currentUserProfileId;
        }
    }
}

// 获取当前好友 ID（没有就用第一个）
function getCurrentCharId() {
    if (state.currentCharId) return state.currentCharId;
    if (state.chars[0]) return state.chars[0].id;
    return null;
}

// 获取某个好友的会话对象
function getSession(charId, createIfMissing = false) {
    if (!charId) return null;
    let s = state.sessions[charId];
    if (!s && createIfMissing) {
        s = { messages: [], unread: 0 };
        state.sessions[charId] = s;
    }
    return s || null;
}

// 获取当前好友的消息数组
function getCurrentMessages(createIfMissing = false) {
    const id = getCurrentCharId();
    const s = getSession(id, createIfMissing);
    if (!s) return [];
    return s.messages;
}

// 渲染会话列表
function renderConversationList() {
    const listEl = $("conversationList");
    if (!listEl) return;
    listEl.innerHTML = "";
    state.chars.forEach((c) => {
        const session = getSession(c.id, false);
        const msgs = session ? session.messages : [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        const item = document.createElement("div");
        item.className = "conversation-item" + (c.id === getCurrentCharId() ? " active" : "");
        item.addEventListener("click", () => {
            state.currentCharId = c.id;
            syncSelectors();
            renderMessages();
            renderConversationList();
            updateChatDetailTitle();
            switchScreen("chat");
            switchWechatView("chatDetail");
        });

        const avatar = document.createElement("div");
        avatar.className = "conversation-avatar";
        const avatarRaw = c.avatar && String(c.avatar).trim();
        if (avatarRaw && isAvatarUrl(avatarRaw)) {
            const img = document.createElement("img");
            img.src = avatarRaw;
            img.alt = c.name || "头像";
            img.className = "conversation-avatar-img";
            avatar.appendChild(img);
        } else {
            const avatarText = (avatarRaw || c.name || "?").charAt(0);
            avatar.textContent = avatarText;
        }

        const main = document.createElement("div");
        main.className = "conversation-main";
        const top = document.createElement("div");
        top.className = "conversation-title-row";
        const name = document.createElement("div");
        name.className = "conversation-name";
        name.textContent = c.name || "未命名好友";
        const time = document.createElement("div");
        time.className = "conversation-time";
        if (last && last.time) {
            const d = new Date(last.time);
            time.textContent = d.toTimeString().slice(0, 5);
        }
        top.appendChild(name);
        top.appendChild(time);

        const preview = document.createElement("div");
        preview.className = "conversation-preview";
        if (last && last.content) preview.textContent = last.content.replace(/\s+/g, " ");
        else preview.textContent = c.persona ? c.persona.slice(0, 24) + "…" : "(还没有聊天)";

        main.appendChild(top);
        main.appendChild(preview);

        item.appendChild(avatar);
        item.appendChild(main);
        listEl.appendChild(item);
    });
}

function renderMessages() {
    const listEl = $("chatList");
    listEl.innerHTML = "";

    const msgs = getCurrentMessages();

    msgs.forEach((msg) => {
        if (msg.role !== "user" && msg.role !== "assistant") return;
        const item = document.createElement("div");
        item.className = `chat-item ${msg.role}`;

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = msg.content;

        item.appendChild(bubble);
        listEl.appendChild(item);
    });

    // 滚动到底部
    listEl.scrollTop = listEl.scrollHeight;
}

function updateChatDetailTitle() {
    const titleEl = $("chatDetailName");
    if (!titleEl) return;
    const id = getCurrentCharId();
    const currentChar = state.chars.find((c) => c.id === id) || null;
    titleEl.textContent = currentChar?.name || "聊天";
}

function renderMoments() {
    const listEl = $("momentsList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const getAuthorInfo = (item) => {
        const type = item.authorType || "char";
        const id = item.authorId || getCurrentCharId();
        if (type === "user") {
            const u = state.userProfiles.find((p) => p.id === id) ||
                state.userProfiles.find((p) => p.id === state.currentUserProfileId) ||
                null;
            return {
                name: u?.name || "我",
                avatar: u?.avatar || "",
                type,
            };
        }
        const c = state.chars.find((ch) => ch.id === id) || null;
        return {
            name: c?.name || "好友",
            avatar: c?.avatar || "",
            type,
        };
    };

    state.moments.forEach((item, index) => {
        const author = getAuthorInfo(item);
        const wrap = document.createElement("div");
        wrap.className = "feed-item";

        // 头部：头像 + 名字 + 时间
        const header = document.createElement("div");
        header.className = "feed-header";

        const avatarBox = document.createElement("div");
        avatarBox.className = "feed-avatar";
        const rawAvatar = author.avatar && String(author.avatar).trim();
        if (rawAvatar && isAvatarUrl(rawAvatar)) {
            const img = document.createElement("img");
            img.src = rawAvatar;
            img.alt = author.name;
            avatarBox.appendChild(img);
        } else {
            avatarBox.textContent = (rawAvatar || author.name || "?").charAt(0);
        }

        const metaBox = document.createElement("div");
        metaBox.className = "feed-meta-box";
        const nameEl = document.createElement("div");
        nameEl.className = "feed-author-name";
        nameEl.textContent = author.name;
        const timeEl = document.createElement("div");
        timeEl.className = "feed-meta";
        timeEl.textContent = item.time || "";
        metaBox.appendChild(nameEl);
        metaBox.appendChild(timeEl);

        header.appendChild(avatarBox);
        header.appendChild(metaBox);
        wrap.appendChild(header);

        // 正文
        const content = document.createElement("div");
        content.className = "feed-content";
        content.textContent = item.content;
        wrap.appendChild(content);

        // 点赞 / 评论信息
        const likesLine = document.createElement("div");
        likesLine.className = "feed-likes";
        const likedNames = [];
        if (item.likedByUser) likedNames.push("我");
        if (Array.isArray(item.likedByChars)) {
            item.likedByChars.forEach((cid) => {
                const ch = state.chars.find((c) => c.id === cid);
                if (ch && ch.name) likedNames.push(ch.name);
            });
        }
        if (likedNames.length) {
            likesLine.textContent = "♥ " + likedNames.join("，");
            wrap.appendChild(likesLine);
        }

        const commentsBox = document.createElement("div");
        commentsBox.className = "feed-comments";
        if (Array.isArray(item.comments)) {
            item.comments.forEach((cmt) => {
                const info = getAuthorInfo({
                    authorType: cmt.fromType,
                    authorId: cmt.fromId,
                });
                const row = document.createElement("div");
                row.className = "feed-comment-row";
                row.textContent = `${info.name}：${cmt.content}`;
                commentsBox.appendChild(row);
            });
        }
        if (commentsBox.childNodes.length) {
            wrap.appendChild(commentsBox);
        }

        // 操作按钮：我赞 / 我评 / TA赞 / TA评
        const actions = document.createElement("div");
        actions.className = "feed-actions";

        const btnLikeUser = document.createElement("button");
        btnLikeUser.className = "feed-action-btn";
        btnLikeUser.textContent = item.likedByUser ? "取消点赞" : "我赞";
        btnLikeUser.addEventListener("click", () => toggleMomentLikeAsUser(index));

        const btnCommentUser = document.createElement("button");
        btnCommentUser.className = "feed-action-btn";
        btnCommentUser.textContent = "我评";
        btnCommentUser.addEventListener("click", () => addUserCommentToMoment(index));

        const btnLikeChar = document.createElement("button");
        btnLikeChar.className = "feed-action-btn";
        btnLikeChar.textContent = "TA赞";
        btnLikeChar.addEventListener("click", () => toggleMomentLikeAsChar(index));

        const btnCommentChar = document.createElement("button");
        btnCommentChar.className = "feed-action-btn";
        btnCommentChar.textContent = "TA评";
        btnCommentChar.addEventListener("click", () => addCharCommentToMoment(index));

        actions.appendChild(btnLikeUser);
        actions.appendChild(btnCommentUser);
        actions.appendChild(btnLikeChar);
        actions.appendChild(btnCommentChar);
        wrap.appendChild(actions);

        listEl.appendChild(wrap);
    });

    listEl.scrollTop = listEl.scrollHeight;
}

function renderDiary() {
    const listEl = $("diaryList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const getAuthorInfo = (item) => {
        const type = item.authorType || "char";
        const id = item.authorId || getCurrentCharId();
        if (type === "user") {
            const u = state.userProfiles.find((p) => p.id === id) ||
                state.userProfiles.find((p) => p.id === state.currentUserProfileId) ||
                null;
            return {
                name: u?.name || "我",
                type,
            };
        }
        const c = state.chars.find((ch) => ch.id === id) || null;
        return {
            name: c?.name || "好友",
            type,
        };
    };

    state.diary.forEach((item) => {
        const wrap = document.createElement("div");
        wrap.className = "feed-item";

        const author = getAuthorInfo(item);

        const header = document.createElement("div");
        header.className = "feed-header";
        const nameEl = document.createElement("div");
        nameEl.className = "feed-author-name";
        nameEl.textContent = `${author.name} 的日记`;
        const timeEl = document.createElement("div");
        timeEl.className = "feed-meta";
        timeEl.textContent = item.time || "";
        header.appendChild(nameEl);
        header.appendChild(timeEl);
        wrap.appendChild(header);

        const content = document.createElement("div");
        content.className = "feed-content";
        content.textContent = item.content;
        wrap.appendChild(content);

        listEl.appendChild(wrap);
    });

    listEl.scrollTop = listEl.scrollHeight;
}

function addMessage(role, content) {
    const msgs = getCurrentMessages(true);
    msgs.push({ role, content, time: Date.now() });
    renderMessages();
    renderConversationList();
    saveSettingsSilent();
}

function switchApp(app) {
    state.currentApp = app;
    const panelMap = {
        chat: "panelChat",
        moments: "panelMoments",
        diary: "panelDiary",
    };
    const tabMap = {
        chat: "tabChat",
        moments: "tabMoments",
        diary: "tabDiary",
    };

    Object.keys(panelMap).forEach((key) => {
        const el = $(panelMap[key]);
        if (!el) return;
        if (key === app) {
            el.classList.add("panel-active");
        } else {
            el.classList.remove("panel-active");
        }
    });

    Object.keys(tabMap).forEach((key) => {
        const el = $(tabMap[key]);
        if (!el) return;
        if (key === app) {
            el.classList.add("active");
        } else {
            el.classList.remove("active");
        }
    });
}

function switchScreen(screen) {
    state.currentScreen = screen;
    const map = {
        home: "screenHome",
        chat: "screenChat",
        settings: "screenSettings",
    };
    Object.keys(map).forEach((key) => {
        const el = $(map[key]);
        if (!el) return;
        if (key === screen) {
            el.classList.add("active");
        } else {
            el.classList.remove("active");
        }
    });

    const titleEl = $("phoneTitle");
    const headerEl = $("phoneHeader");
    if (titleEl) {
        switch (screen) {
            case "chat":
                titleEl.textContent = "微信";
                break;
            case "settings":
                titleEl.textContent = "设置";
                break;
            default:
                titleEl.textContent = "主屏幕";
        }
    }
    // 非主屏幕时显示头部返回按钮
    if (headerEl) {
        if (screen === "home") {
            headerEl.classList.remove("with-back");
        } else {
            headerEl.classList.add("with-back");
        }
    }
}

function switchWechatView(view) {
    const viewMap = {
        home: "wechatPageHome",
        chatDetail: "wechatPageChat",
        contacts: "wechatPageContacts",
        discover: "wechatPageDiscover",
        me: "wechatPageMe",
    };

    const tabMap = {
        home: "wechatTabHome",
        contacts: "wechatTabContacts",
        discover: "wechatTabDiscover",
        me: "wechatTabMe",
    };

    Object.keys(viewMap).forEach((k) => {
        const el = $(viewMap[k]);
        if (!el) return;
        if (k === view) el.classList.add("active");
        else el.classList.remove("active");
    });

    // 聊天详情页属于“微信”Tab，底部仍高亮“微信”
    let activeTabKey = "home";
    if (view === "contacts") activeTabKey = "contacts";
    else if (view === "discover") activeTabKey = "discover";
    else if (view === "me") activeTabKey = "me";

    Object.keys(tabMap).forEach((k) => {
        const el = $(tabMap[k]);
        if (!el) return;
        if (k === activeTabKey) el.classList.add("active");
        else el.classList.remove("active");
    });
}

function setSending(sending) {
    state.sending = sending;
    const sendBtn = $("sendBtn");
    const askBtn = $("askBtn");
    const retryBtn = $("retryBtn");
    if (sendBtn) sendBtn.disabled = sending;
    if (askBtn) {
        askBtn.disabled = sending;
        askBtn.textContent = sending ? "AI 回复中…" : "让 AI 回复";
    }
    if (retryBtn) retryBtn.disabled = sending;
}

function extractAIContent(data) {
    try {
        if (!data) return "";
        if (data.choices && data.choices[0]) {
            const ch = data.choices[0];
            if (ch.message && typeof ch.message.content === "string") {
                return ch.message.content;
            }
            if (typeof ch.text === "string") {
                return ch.text;
            }
        }
        if (typeof data.content === "string") return data.content;
        if (typeof data.result === "string") return data.result;
        const s = JSON.stringify(data);
        return s.length > 400 ? s.slice(0, 400) + "..." : s;
    } catch (e) {
        console.warn("解析 AI 返回内容出错", e);
        return "";
    }
}

function splitIntoSegments(text) {
    if (!text) return [];
    const raw = String(text);
    // 按空行拆分成多段，让 AI 一次回复在界面上显示为多条气泡
    const parts = raw.split(/\r?\n\s*\r?\n/);
    return parts.map((p) => p.trim()).filter((p) => p);
}

function getLastUserMessage() {
    const msgs = getCurrentMessages(false);
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "user") return msgs[i];
    }
    return null;
}

function hasEndConversationIntent(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    const keywords = [
        "结束",
        "收工",
        "下班",
        "睡觉",
        "晚安",
        "今天先这样",
        "今天就到这",
        "今天就到这里",
        "今天先到这",
        "先这样",
        "就到这里吧",
    ];
    return keywords.some((k) => t.includes(k));
}

function hasDiaryIntent(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    const diaryWords = ["写日记", "记日记", "来一篇日记", "生成日记"];
    return diaryWords.some((k) => t.includes(k));
}

function hasMomentIntent(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    const momentWords = ["发朋友圈", "写朋友圈", "来一条朋友圈", "生成朋友圈"];
    return momentWords.some((k) => t.includes(k));
}

async function maybeAutoGenerate() {
    const autoMomentsEl = $("autoMoments");
    const autoDiaryEl = $("autoDiary");
    const autoMoments = autoMomentsEl ? autoMomentsEl.checked : false;
    const autoDiary = autoDiaryEl ? autoDiaryEl.checked : false;

    if (!autoMoments && !autoDiary) return;

    const msgs = getCurrentMessages(false);
    if (!msgs.length) return;

    const lastUser = getLastUserMessage();
    if (!lastUser || !lastUser.content) return;

    const msgCount = msgs.length;

    // 只有当对话有新增消息、且最近一条用户消息表现出“结束/收工”或明显提到日记/朋友圈时，才尝试自动生成
    const endIntent = hasEndConversationIntent(lastUser.content);
    const diaryIntent = hasDiaryIntent(lastUser.content);
    const momentIntent = hasMomentIntent(lastUser.content);

    if (autoMoments && (endIntent || momentIntent) && msgCount > state.lastAutoMomentMsgCount) {
        state.lastAutoMomentMsgCount = msgCount;
        generateMoment(true).catch((e) => console.warn("自动生成朋友圈失败", e));
    }

    if (autoDiary && (endIntent || diaryIntent) && msgCount > state.lastAutoDiaryMsgCount) {
        state.lastAutoDiaryMsgCount = msgCount;
        generateDiary(true).catch((e) => console.warn("自动生成日记失败", e));
    }
}

async function maybeSummarizeMemory() {
    if (!$("memoryEnabled") || !$("memoryEnabled").checked) {
        state.memoryEnabled = false;
        state.memorySinceLastSummary = 0;
        return;
    }
    state.memoryEnabled = true;
    const everyInput = $("memoryEvery");
    let every = state.memoryEvery || 20;
    if (everyInput) {
        const v = parseInt(everyInput.value, 10);
        if (Number.isFinite(v) && v > 0) every = v;
    }
    state.memoryEvery = every;
    if (state.memorySinceLastSummary < every) return;

    // 收集最近一段对话，让模型做一次简要总结
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const customModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model = customModel || selectedModel || "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
    if (!apiKey) return;

    const historyPairs = getCurrentMessages(false).filter(
        (m) => m.role === "user" || m.role === "assistant"
    );
    if (!historyPairs.length) return;
    const tail = historyPairs.slice(-40);
    const text = tail
        .map((m) => (m.role === "user" ? "用户" : "助手") + ": " + m.content)
        .join("\n");

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            "你是一个总结助手，请把下面的聊天记录整理成一段简要记忆，提取出用户长期偏好、重要背景信息和未完成的待办，用简短的中文要点列出来。不要输出和原聊天无关的内容。",
                    },
                    { role: "user", content: text },
                ],
                max_tokens: 512,
                temperature: 0.3,
                stream: false,
            }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const summary = extractAIContent(data);
        if (summary && summary.trim()) {
            state.memorySummary = summary.trim();
            state.memorySinceLastSummary = 0;
            // 顺便静默持久化一下摘要
	    saveSettingsSilent();
        }
    } catch (e) {
        console.warn("总结记忆失败", e);
    }
}

async function sendToAI() {
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const customModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model = customModel || selectedModel || "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
        const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
        const currentUser =
		state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
        const roleName = currentChar?.name || "AI 助手";
        const rolePersona = currentChar?.persona || "";
        const userName = currentUser?.name || "";
        const userPersona = currentUser?.persona || "";

    if (!apiKey) {
        alert("请先填写 API Key");
        return;
    }

    setSending(true);

    // 构造 messages 列表
    const messages = [];
    // 如果有历史总结记忆，先给模型一段说明
    if (state.memorySummary && state.memorySummary.trim()) {
        messages.push({
            role: "system",
            content:
                "以下是你和用户之前多轮对话的摘要记忆，请在回答时参考这些要点，让对话更加连贯，但不要逐字重复它们：\n" +
                state.memorySummary,
        });
    }
    if (rolePersona) {
        messages.push({
            role: "system",
            content: `你现在扮演一名名为「${roleName}」的 AI 助手，正在通过一个类似微信的在线聊天界面和用户对话。请始终以自然、友好的聊天语气回答。下面是你的详细人设设定：${rolePersona}`,
        });
    }
    if (userName || userPersona) {
        let up = "用户信息：";
        if (userName) up += `昵称为「${userName}」。`;
        if (userPersona) up += `用户人设：${userPersona}`;
        messages.push({ role: "system", content: up });
    }
    const history = getCurrentMessages(false);
    for (const msg of history) {
        if (msg.role === "user" || msg.role === "assistant") {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    // 先渲染一个“思考中”占位
    const msgsRef = getCurrentMessages(true);
    const thinkingIndex = msgsRef.length;
    addMessage("assistant", "正在思考…");

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                // 为兼容部分第三方 OpenAI 接口，显式给出一些常见参数
                // 提高 max_tokens，减少被截断的概率（具体上限受平台和模型限制）
                max_tokens: 2048,
                temperature: 0.7,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 原始返回:", data);

        if (Array.isArray(data.choices)) {
            if (data.choices.length === 0) {
                msgsRef[thinkingIndex] = {
                    role: "assistant",
                    content:
                        "接口返回的 choices 为空，后端没有生成任何回复。\n" +
                        "请到你使用的平台（例如 linkapi.ai）检查：\n" +
                        "1）API Key 是否有该模型的权限/余额；\n" +
                        "2）是否需要在平台控制台里先创建应用或绑定模型；\n" +
                        "3）参考平台提供的 curl/Postman 示例，看是否有额外必填参数。",
                };
                renderMessages();
                return;
            }

            const contents = data.choices.map((ch) => {
                if (ch.message && typeof ch.message.content === "string") return ch.message.content;
                if (typeof ch.text === "string") return ch.text;
                return "";
            });

            const tooShort = data.choices.some(
                (ch) => ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
            );

            const segments = contents
                .flatMap((c) => splitIntoSegments(c))
                .filter((s) => s && s.trim());

            const first = (segments[0] || "").trim() || "(AI 没有返回文本内容)";
            let firstContent = first;
            if (tooShort) {
                firstContent += "\n\n(提示：本次回复可能因为长度上限被截断，如果经常这样，可以在模型平台上提高单次输出上限，或让问题更具体一些。)";
            }
            msgsRef[thinkingIndex] = { role: "assistant", content: firstContent, time: Date.now() };
            for (let i = 1; i < segments.length; i++) {
                const c = (segments[i] || "").trim();
                if (c) {
                    addMessage("assistant", c);
                }
            }
            renderMessages();
		state.memorySinceLastSummary += 1;
		await maybeAutoGenerate();
		await maybeSummarizeMemory();
            return;
        }

        let content = extractAIContent(data);
        if (!content || !String(content).trim()) {
            content = "(AI 没有返回文本内容，请检查浏览器控制台中的原始返回，以及你所用平台的接口文档)";
        }
        const segments = splitIntoSegments(content);
        if (!segments.length) {
            msgsRef[thinkingIndex] = { role: "assistant", content, time: Date.now() };
            renderMessages();
            return;
        }
        msgsRef[thinkingIndex] = { role: "assistant", content: segments[0], time: Date.now() };
        for (let i = 1; i < segments.length; i++) {
            addMessage("assistant", segments[i]);
        }
        renderMessages();
		state.memorySinceLastSummary += 1;
		await maybeAutoGenerate();
		await maybeSummarizeMemory();
    } catch (err) {
        console.error(err);
        msgsRef[thinkingIndex] = {
            role: "assistant",
            content: `出错了：${err.message || err}`,
        };
        renderMessages();
    } finally {
        setSending(false);
    }
}

async function generateMoment(fromAuto = false) {
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const customModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model = customModel || selectedModel || "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
        const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
        const currentUser =
		state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
        const roleName = currentChar?.name || "AI 助手";
        const rolePersona = currentChar?.persona || "";
        const userName = currentUser?.name || "";
        const userPersona = currentUser?.persona || "";
    const hint = $("momentHint").value.trim();

    if (!apiKey) {
        if (!fromAuto) alert("请先填写 API Key");
        return;
    }

    const btn = $("genMomentBtn");
    const oldText = btn.textContent;
    if (!fromAuto) {
        btn.disabled = true;
        btn.textContent = "生成中…";
    }

    try {
        const messages = [];
        if (rolePersona) {
            messages.push({
                role: "system",
                content: `你现在扮演一名名为「${roleName}」的角色，请以第一人称在朋友圈发一条动态，内容和语气要符合下面的人设：${rolePersona}。只输出朋友圈正文，不要解释。`,
            });
        }
        if (userName || userPersona) {
            let up = "用户信息：";
            if (userName) up += `昵称为「${userName}」。`;
            if (userPersona) up += `用户人设：${userPersona}`;
            messages.push({ role: "system", content: up });
        }
        if (state.moments.length) {
            const history = state.moments
                .slice(-3)
                .map((m, i) => `${i + 1}. ${m.content}`)
                .join("\n");
            messages.push({
                role: "system",
                content: `以下是你之前发过的部分朋友圈，用于保持风格连贯：\n${history}`,
            });
        }
        if (hint) {
            messages.push({ role: "user", content: `请根据这个提示写一条新的朋友圈：${hint}` });
        } else {
            messages.push({
                role: "user",
                content: "请随意写一条今天的朋友圈动态，只输出正文。",
            });
        }

        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                // 提高上限，减少被截断概率（仍受平台和模型限制）
                max_tokens: 2048,
                temperature: 0.8,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 朋友圈返回:", data);
        let content = extractAIContent(data);
        if (!content || !content.trim()) {
            content = "(AI 没有生成朋友圈内容)";
        }
        let tooShort = false;
        if (Array.isArray(data.choices)) {
            tooShort = data.choices.some(
                (ch) => ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
            );
        }
        if (tooShort) {
            content +=
                "\n\n(提示：这条朋友圈可能因为长度上限被截断，如果经常这样，可以在模型平台上提高输出上限，或把提示写得更具体一点。)";
        }
        const authorId = getCurrentCharId();
        state.moments.push({
            id: "moment_" + Date.now(),
            authorType: "char",
            authorId,
            content,
            time: new Date().toLocaleString(),
            likedByUser: false,
            likedByChars: [],
            comments: [],
        });
        renderMoments();
        $("momentHint").value = "";
        saveSettingsSilent();
        saveSettingsSilent();
    } catch (err) {
        console.error(err);
        if (!fromAuto) alert(`生成朋友圈失败：${err.message || err}`);
    } finally {
        if (!fromAuto) {
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }
}

async function generateDiary(fromAuto = false) {
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const customModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model = customModel || selectedModel || "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
        const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
        const currentUser =
		state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
        const roleName = currentChar?.name || "AI 助手";
        const rolePersona = currentChar?.persona || "";
        const userName = currentUser?.name || "";
        const userPersona = currentUser?.persona || "";
    const hint = $("diaryHint").value.trim();

    if (!apiKey) {
        if (!fromAuto) alert("请先填写 API Key");
        return;
    }

    const btn = $("genDiaryBtn");
    const oldText = btn.textContent;
    if (!fromAuto) {
        btn.disabled = true;
        btn.textContent = "生成中…";
    }

    try {
        const messages = [];
        if (rolePersona) {
            messages.push({
                role: "system",
                content: `你现在扮演一名名为「${roleName}」的角色，请用第一人称写一篇今天的日记，内容和语气要符合下面的人设：${rolePersona}。可以包含当天发生的事情和心情，只输出日记正文。`,
            });
        }
        if (userName || userPersona) {
            let up = "用户信息：";
            if (userName) up += `昵称为「${userName}」。`;
            if (userPersona) up += `用户人设：${userPersona}`;
            messages.push({ role: "system", content: up });
        }
        if (state.diary.length) {
            const history = state.diary
                .slice(-3)
                .map((m, i) => `${i + 1}. ${m.content}`)
                .join("\n---\n");
            messages.push({
                role: "system",
                content: `以下是你之前写过的部分日记，用于保持风格连贯：\n${history}`,
            });
        }
        if (hint) {
            messages.push({ role: "user", content: `今天的关键词是：${hint}。请写一篇对应的日记。` });
        } else {
            messages.push({
                role: "user",
                content: "请随意写一篇今天的日记，只输出正文。",
            });
        }

        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                // 提高上限，减少被截断概率
                max_tokens: 2048,
                temperature: 0.7,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 日记返回:", data);
        let content = extractAIContent(data);
        if (!content || !content.trim()) {
            content = "(AI 没有生成日记内容)";
        }
        let tooShort = false;
        if (Array.isArray(data.choices)) {
            tooShort = data.choices.some(
                (ch) => ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
            );
        }
        if (tooShort) {
            content +=
                "\n\n(提示：这篇日记可能因为长度上限被截断，如果经常这样，可以在模型平台上提高输出上限，或把提示写得更具体一点。)";
        }
        const authorId = getCurrentCharId();
        state.diary.push({
            id: "diary_" + Date.now(),
            authorType: "char",
            authorId,
            content,
            time: new Date().toLocaleString(),
        });
        renderDiary();
        $("diaryHint").value = "";
        saveSettingsSilent();
        saveSettingsSilent();
    } catch (err) {
        console.error(err);
        if (!fromAuto) alert(`生成日记失败：${err.message || err}`);
    } finally {
        if (!fromAuto) {
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }
}

async function fetchModels() {
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const apiKey = $("apiKey").value.trim();

    if (!apiKey) {
        alert("请先填写 API Key");
        return;
    }

    const btn = $("fetchModelsBtn");
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "拉取中…";

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const list = Array.isArray(data.data)
            ? data.data
                  .map((m) => m.id || m.name || "")
                  .filter((s) => typeof s === "string" && s.trim())
            : [];

        if (!list.length) {
            alert("没有从接口中解析到模型列表，请检查返回结构。");
            return;
        }

        const select = $("modelSelect");
        select.innerHTML = "";
        list.forEach((id) => {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = id;
            select.appendChild(opt);
        });

        // 默认选第一个
        select.value = list[0];

        // 同步保存到本地
        saveSettings();
    } catch (err) {
        console.error(err);
        alert(`拉取模型失败：${err.message || err}`);
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

function ensureMomentStructure(item) {
    if (!item) return;
    if (!("authorType" in item)) {
        item.authorType = "char";
    }
    if (!("authorId" in item)) {
        item.authorId = getCurrentCharId();
    }
    if (!Array.isArray(item.comments)) {
        item.comments = [];
    }
    if (!Array.isArray(item.likedByChars)) {
        item.likedByChars = [];
    }
    if (typeof item.likedByUser !== "boolean") {
        item.likedByUser = false;
    }
}

function toggleMomentLikeAsUser(index) {
    const m = state.moments[index];
    if (!m) return;
    ensureMomentStructure(m);
    m.likedByUser = !m.likedByUser;
    renderMoments();
    saveSettingsSilent();
}

function toggleMomentLikeAsChar(index) {
    const m = state.moments[index];
    if (!m) return;
    const cid = getCurrentCharId();
    if (!cid) {
        alert("请先在微信里添加并选择一个好友");
        return;
    }
    ensureMomentStructure(m);
    const list = m.likedByChars;
    const pos = list.indexOf(cid);
    if (pos === -1) list.push(cid);
    else list.splice(pos, 1);
    renderMoments();
    saveSettingsSilent();
}

function addUserCommentToMoment(index) {
    const m = state.moments[index];
    if (!m) return;
    ensureMomentStructure(m);
    const text = window.prompt("输入你想说的话：");
    if (!text || !text.trim()) return;
    const fromId = state.currentUserProfileId;
    m.comments.push({
        fromType: "user",
        fromId,
        content: text.trim(),
        time: Date.now(),
    });
    renderMoments();
    saveSettingsSilent();
}

async function addCharCommentToMoment(index) {
    const m = state.moments[index];
    if (!m) return;
    const cid = getCurrentCharId();
    const currentChar = state.chars.find((c) => c.id === cid) || null;
    if (!cid || !currentChar) {
        alert("请先在微信里添加并选择一个好友");
        return;
    }
    ensureMomentStructure(m);

    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const customModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model = customModel || selectedModel || "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
    if (!apiKey) {
        alert("请先在设置里填写 API Key");
        return;
    }

    const roleName = currentChar.name || "AI 好友";
    const rolePersona = currentChar.persona || "";

    const btnText = "TA评";

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            `你现在扮演名为「${roleName}」的朋友，请针对下面这条朋友圈内容，写一句很简短、自然的中文评论，像真实好友在朋友圈里回复那样，最多 30 个字。` +
                            (rolePersona ? ` 角色人设：${rolePersona}` : ""),
                    },
                    {
                        role: "user",
                        content: m.content,
                    },
                ],
                max_tokens: 64,
                temperature: 0.8,
                stream: false,
            }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const text = extractAIContent(data) || "好有意思～";
        m.comments.push({
            fromType: "char",
            fromId: cid,
            content: text.trim(),
            time: Date.now(),
        });
        renderMoments();
        saveSettingsSilent();
    } catch (err) {
        console.error(err);
        alert(`生成评论失败：${err.message || err}`);
    }
}

function openChatProfileOverlay() {
    const overlay = $("chatProfileOverlay");
    if (!overlay) return;

    const currentId = getCurrentCharId();
    const currentChar = state.chars.find((c) => c.id === currentId) || null;

    const nameInput = $("chatEditName");
    const avatarInput = $("chatEditAvatar");
    const personaInput = $("chatEditPersona");
    if (nameInput) nameInput.value = currentChar?.name || "";
    if (avatarInput) avatarInput.value = (currentChar?.avatar && String(currentChar.avatar)) || "";
    if (personaInput) personaInput.value = currentChar?.persona || "";

    const userSelect = $("chatEditUserProfile");
    if (userSelect) {
        userSelect.innerHTML = "";
        state.userProfiles.forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || "未命名人设";
            userSelect.appendChild(opt);
        });
        if (
            state.currentUserProfileId &&
            state.userProfiles.some((p) => p.id === state.currentUserProfileId)
        ) {
            userSelect.value = state.currentUserProfileId;
        } else if (state.userProfiles[0]) {
            state.currentUserProfileId = state.userProfiles[0].id;
            userSelect.value = state.currentUserProfileId;
        }
    }

    overlay.classList.add("active");
}

function closeChatProfileOverlay() {
    const overlay = $("chatProfileOverlay");
    if (!overlay) return;
    overlay.classList.remove("active");
}

function saveChatProfileFromOverlay() {
    const currentId = getCurrentCharId();
    if (!currentId) {
        alert("请先添加并选择一个好友");
        return;
    }

    const nameInput = $("chatEditName");
    const avatarInput = $("chatEditAvatar");
    const personaInput = $("chatEditPersona");
    const userSelect = $("chatEditUserProfile");

    const name = nameInput ? nameInput.value.trim() : "";
    const avatar = avatarInput ? avatarInput.value.trim() : "";
    const persona = personaInput ? personaInput.value.trim() : "";

    const idx = state.chars.findIndex((c) => c.id === currentId);
    if (idx >= 0) {
        const ch = state.chars[idx];
        ch.name = name || ch.name || "未命名好友";
        ch.avatar = avatar;
        ch.persona = persona;
    }

    if (userSelect && userSelect.value) {
        state.currentUserProfileId = userSelect.value;
    }

    renderCharList();
    renderConversationList();
    syncSelectors();
    updateChatDetailTitle();
    syncDiscoverAvatar();
    saveSettings();
    closeChatProfileOverlay();
}

function handleSend() {
    if (state.sending) return;
    const input = $("userInput");
    const text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    input.value = "";
}

function removeLastAssistantReply() {
    let idx = -1;
    const msgs = getCurrentMessages(false);
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
            idx = i;
            break;
        }
    }
    if (idx === -1) return false;
    const id = getCurrentCharId();
    const session = getSession(id, true);
    session.messages = msgs.slice(0, idx);
    renderMessages();
    renderConversationList();
    saveSettingsSilent();
    return true;
}

function handleAskAI() {
    if (state.sending) return;
    // 至少要有一条用户消息再让 AI 回复
    const hasUser = getCurrentMessages(false).some((m) => m.role === "user");
    if (!hasUser) {
        alert("请先发送一条或多条消息，再让 AI 回复。");
        return;
    }
    sendToAI();
}

function handleRetry() {
    if (state.sending) return;
    if (!removeLastAssistantReply()) {
        alert("还没有 AI 回复，暂时不能重说。");
        return;
    }
    // 删除上一轮 AI 回复后，基于当前对话历史重新让 AI 回答
    sendToAI();
}

window.addEventListener("DOMContentLoaded", () => {
    loadSettings();

    function bind(id, event, handler) {
        const el = $(id);
        if (!el) {
            console.warn("未找到元素:", id);
            return;
        }
        el.addEventListener(event, handler);
    }

    bind("saveSettingsBtn", "click", saveSettings);
    bind("sendBtn", "click", handleSend);
    bind("fetchModelsBtn", "click", fetchModels);
    bind("askBtn", "click", handleAskAI);
    bind("retryBtn", "click", handleRetry);
    bind("genMomentBtn", "click", () => generateMoment(false));
    bind("genDiaryBtn", "click", () => generateDiary(false));
    bind("userMomentBtn", "click", () => {
        const text = ("" + ($("momentHint")?.value || "")).trim();
        if (!text) {
            alert("先写点想发的内容吧～");
            return;
        }
        const authorId = state.currentUserProfileId;
        state.moments.push({
            id: "moment_" + Date.now(),
            authorType: "user",
            authorId,
            content: text,
            time: new Date().toLocaleString(),
            likedByUser: false,
            likedByChars: [],
            comments: [],
        });
        if ($("momentHint")) $("momentHint").value = "";
        renderMoments();
        saveSettingsSilent();
    });
    bind("wechatTabHome", "click", () => switchWechatView("home"));
    bind("wechatTabContacts", "click", () => switchWechatView("contacts"));
    bind("wechatTabDiscover", "click", () => switchWechatView("discover"));
    bind("wechatTabMe", "click", () => switchWechatView("me"));

    const userInputEl = $("userInput");
    if (userInputEl) {
        userInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    	});
    }

    switchApp("chat");
    switchScreen("home");
    bind("iconWechat", "click", () => {
        switchScreen("chat");
        // 每次从主屏进入微信，都回到会话列表首页
        switchWechatView("home");
    });
    bind("iconSettings", "click", () => switchScreen("settings"));
    bind("btnHome", "click", () => switchScreen("home"));
    bind("btnHeaderBack", "click", () => {
        switchWechatView("home");
        switchScreen("home");
    });
    bind("chatBackBtn", "click", () => switchWechatView("home"));
    bind("chatProfileBtn", "click", openChatProfileOverlay);
    bind("chatProfileCancelBtn", "click", closeChatProfileOverlay);
    bind("chatProfileSaveBtn", "click", saveChatProfileFromOverlay);
    // 发现页：在首页和朋友圈/日记之间切换
    bind("discoverMomentsEntry", "click", () => {
        const home = $("discoverHome");
        const moments = $("discoverMoments");
        if (home && moments) {
            home.classList.remove("active");
            moments.classList.add("active");
        }
    });
    bind("discoverDiaryEntry", "click", () => {
        const home = $("discoverHome");
        const diary = $("discoverDiary");
        if (home && diary) {
            home.classList.remove("active");
            diary.classList.add("active");
        }
    });
    bind("momentsBackBtn", "click", () => {
        const home = $("discoverHome");
        const moments = $("discoverMoments");
        if (home && moments) {
            moments.classList.remove("active");
            home.classList.add("active");
        }
    });
    bind("diaryBackBtn", "click", () => {
        const home = $("discoverHome");
        const diary = $("discoverDiary");
        if (home && diary) {
            diary.classList.remove("active");
            home.classList.add("active");
        }
    });

    // 添加好友
    bind("addCharBtn", "click", () => {
        const name = ("" + ($("newCharName")?.value || "")).trim();
        const persona = ("" + ($("newCharPersona")?.value || "")).trim();
        if (!name && !persona) {
            alert("请至少填写好友昵称或人设");
            return;
        }
        const id = "char_" + Date.now();
        state.chars.push({ id, name: name || "未命名好友", persona });
        state.currentCharId = id;
        if ($("newCharName")) $("newCharName").value = "";
        if ($("newCharPersona")) $("newCharPersona").value = "";
        renderCharList();
        syncSelectors();
        renderConversationList();
        saveSettings();
    });

    // 添加用户人设
    bind("addUserProfileBtn", "click", () => {
        const name = ("" + ($("newUserName")?.value || "")).trim();
        const avatar = ("" + ($("newUserAvatar")?.value || "")).trim();
        const persona = ("" + ($("newUserPersona")?.value || "")).trim();
        if (!name && !persona) {
            alert("请至少填写昵称或人设内容");
            return;
        }
        const btn = $("addUserProfileBtn");
        if (state.editingUserProfileId) {
            // 编辑已有的人设
            const idx = state.userProfiles.findIndex(
                (p) => p.id === state.editingUserProfileId
            );
            if (idx >= 0) {
                const p = state.userProfiles[idx];
                p.name = name || p.name || "未命名人设";
                p.avatar = avatar;
                p.persona = persona;
            }
            state.currentUserProfileId = state.editingUserProfileId;
            state.editingUserProfileId = null;
        } else {
            // 新增人设
            const id = "user_" + Date.now();
			state.userProfiles.push({ id, name: name || "未命名人设", persona, avatar });
			state.currentUserProfileId = id;
        }
        if ($("newUserName")) $("newUserName").value = "";
        if ($("newUserAvatar")) $("newUserAvatar").value = "";
        if ($("newUserPersona")) $("newUserPersona").value = "";
        if (btn && btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
        renderUserProfileList();
        syncSelectors();
        syncDiscoverAvatar();
        saveSettings();
    });

    // 下拉切换当前好友 / 人设
    const charSelect = $("chatCharSelect");
    if (charSelect) {
        charSelect.addEventListener("change", () => {
            state.currentCharId = charSelect.value || null;
            saveSettings();
        });
    }
    const userSelect = $("chatUserProfileSelect");
    if (userSelect) {
        userSelect.addEventListener("change", () => {
            state.currentUserProfileId = userSelect.value || null;
            syncDiscoverAvatar();
            saveSettings();
        });
    }

    // 如果本地还没有任何好友或人设，给一个默认示例
    if (!state.chars.length) {
        state.chars.push({
            id: "char_default",
            name: "测试兔兔",
            persona: "你是一个可爱的测试兔兔，语气活泼，会帮助我测试小手机的功能。",
        });
        state.currentCharId = "char_default";
    }
    if (!state.userProfiles.length) {
        state.userProfiles.push({
            id: "user_default",
            name: "窝窝",
            persona: "一个正在折腾小手机项目的程序员。",
            avatar: "",
        });
        state.currentUserProfileId = "user_default";
    }
    renderCharList();
    renderUserProfileList();
    syncSelectors();
	renderConversationList();
        updateChatDetailTitle();
	// 默认进入微信 Tab 的首页
	switchWechatView("home");
});
