// AI assistant chat widget.
// Set WORKER_URL to your deployed Cloudflare Worker URL (see assistant/README.md).
// While it is empty, the widget stays hidden so the site works without it.
const WORKER_URL = "https://rough-brook-2e0a.muhammedustaomeroglu2.workers.dev";

(function () {
    if (!WORKER_URL) {
        console.info("AI assistant disabled: set WORKER_URL in js/assistant.js");
        return;
    }

    const GREETING =
        "Hi! I'm Muhammed's AI assistant. Ask me about his research, his background, or how to get in touch.";
    const SUGGESTIONS = [
        "What is RET?",
        "How can I collaborate with him?",
        "What is his ICML 2025 paper about?",
    ];
    const OFFLINE_MESSAGE =
        "I couldn't reach my brain (the server). Please try again in a moment, or email mustaome@andrew.cmu.edu.";

    // Conversation history sent to the Worker: [{role: "user"|"model", text}]
    const messages = [];
    let busy = false;

    // ---------- DOM ----------
    const root = document.createElement("div");
    root.className = "ai-root";
    root.innerHTML = `
        <button type="button" class="ai-launcher" aria-label="Open AI assistant">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10 1.5l1.9 4.6 4.6 1.9-4.6 1.9L10 14.5 8.1 9.9 3.5 8l4.6-1.9L10 1.5z"/>
                <path d="M16.5 12.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"/>
            </svg>
            Ask my AI
        </button>
        <section class="ai-panel" role="dialog" aria-label="AI assistant" hidden>
            <header class="ai-head">
                <div>
                    <h2 class="ai-title">Ask about my research</h2>
                    <p class="ai-sub">AI assistant &middot; answers may be imperfect</p>
                </div>
                <button type="button" class="ai-close" aria-label="Close assistant">&times;</button>
            </header>
            <div class="ai-log" aria-live="polite"></div>
            <div class="ai-chips"></div>
            <form class="ai-form">
                <input class="ai-input" type="text" maxlength="1000"
                       placeholder="Type a question&hellip;" aria-label="Your question" autocomplete="off">
                <button type="submit" class="ai-send" aria-label="Send">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M2.9 10L2 3.2c0-.6.6-1 1.1-.8l14.4 6.7c.6.3.6 1.1 0 1.4L3.1 17.2c-.5.2-1.1-.2-1.1-.8L2.9 10zm1.7-.8h5.9c.4 0 .8.4.8.8s-.4.8-.8.8H4.6l-.6 4.5L15.5 10 4 4.7l.6 4.5z"/>
                    </svg>
                </button>
            </form>
        </section>`;
    document.body.appendChild(root);

    const launcher = root.querySelector(".ai-launcher");
    const panel = root.querySelector(".ai-panel");
    const closeBtn = root.querySelector(".ai-close");
    const log = root.querySelector(".ai-log");
    const chips = root.querySelector(".ai-chips");
    const form = root.querySelector(".ai-form");
    const input = root.querySelector(".ai-input");

    // ---------- rendering ----------
    function escapeHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Escape, then allow markdown links, bare URLs, and **bold**.
    function renderText(s) {
        let html = escapeHtml(s);
        html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener">$1</a>');
        html = html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,
            '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
        html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        return html.replace(/\n/g, "<br>");
    }

    function addBubble(role, text) {
        const div = document.createElement("div");
        div.className = "ai-msg ai-msg-" + role;
        div.innerHTML = renderText(text);
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    function setTyping(on) {
        let t = log.querySelector(".ai-typing");
        if (on && !t) {
            t = document.createElement("div");
            t.className = "ai-msg ai-msg-model ai-typing";
            t.innerHTML = "<span></span><span></span><span></span>";
            log.appendChild(t);
            log.scrollTop = log.scrollHeight;
        } else if (!on && t) {
            t.remove();
        }
    }

    // ---------- chat ----------
    async function send(question) {
        const text = question.trim();
        if (!text || busy) return;
        busy = true;
        chips.hidden = true;
        input.value = "";
        addBubble("user", text);
        messages.push({ role: "user", text });
        setTyping(true);
        let answer = OFFLINE_MESSAGE;
        try {
            const r = await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: messages.slice(-8) }),
            });
            if (r.ok) {
                const data = await r.json();
                if (data.answer) answer = data.answer;
            }
        } catch (e) {
            // keep OFFLINE_MESSAGE
        }
        setTyping(false);
        addBubble("model", answer);
        messages.push({ role: "model", text: answer });
        busy = false;
        input.focus();
    }

    // ---------- open / close ----------
    function openPanel() {
        panel.hidden = false;
        launcher.hidden = true;
        requestAnimationFrame(() => panel.classList.add("ai-open"));
        if (!log.childElementCount) {
            addBubble("model", GREETING);
            SUGGESTIONS.forEach((q) => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "ai-chip";
                b.textContent = q;
                b.addEventListener("click", () => send(q));
                chips.appendChild(b);
            });
        }
        input.focus();
    }

    function closePanel() {
        panel.classList.remove("ai-open");
        panel.hidden = true;
        launcher.hidden = false;
    }

    launcher.addEventListener("click", openPanel);
    closeBtn.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !panel.hidden) closePanel();
    });
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        send(input.value);
    });
})();
