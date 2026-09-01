(() => {
    "use strict";

    const STATES = new Map();
    const VALID_SIZES = [25, 50, 60, 100, 200];
    const DEFAULT_SIZE = 60;
    const DEBOUNCE_MS = 180;

    function root() {
        return (typeof gradioApp === "function" && gradioApp()) || document;
    }

    function stateFor(tab) {
        if (!STATES.has(tab)) {
            const stored = parseInt(localStorage.getItem("enp_page_size_v11") || "", 10);
            STATES.set(tab, {
                page: 1,
                pages: 1,
                pageSize: VALID_SIZES.includes(stored) ? stored : DEFAULT_SIZE,
                search: "",
                folder: "",
                busy: false,
                seq: 0,
                timer: null,
                initialLoaded: false,
            });
        }
        return STATES.get(tab);
    }

    function cardsFor(tab) {
        return root().querySelector(`#${CSS.escape(tab)}_lora_cards`) ||
               root().querySelector(`#${CSS.escape(tab)}_loras_cards`);
    }

    function toolbarFor(tab) {
        const r = root();
        return r.querySelector(`#${CSS.escape(tab)}_lora_controls`) ||
               r.querySelector(`#${CSS.escape(tab)}_loras_controls`);
    }

    function pagerId(tab) { return `enp_${tab}_lora_pager`; }
    function pagerFor(tab) {
        return document.getElementById(pagerId(tab)) ||
               root().querySelector(`#${CSS.escape(pagerId(tab))}`);
    }

    function isVisible(el) {
        if (!el || !(el instanceof Element)) return false;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 10 && rect.height > 8;
    }

    function findSearchInput(tab) {
        // Neo's Extra Networks search box is part of the native controls row.
        // Prefer that exact toolbar so unrelated prompt/style inputs are never selected.
        const toolbar = toolbarFor(tab);
        if (toolbar) {
            const inputs = Array.from(toolbar.querySelectorAll("input, textarea"));
            const visible = inputs.find(isVisible);
            if (visible) return visible;
            if (inputs.length) return inputs[0];
        }

        // Conservative fallback for Neo variants where the input is wrapped just
        // outside the controls element. Keep the search limited to the LoRA page.
        const area = root().querySelector(`#${CSS.escape(tab)}_lora`) ||
                     root().querySelector(`#${CSS.escape(tab)}_loras`);
        if (!area) return null;
        return Array.from(area.querySelectorAll("input, textarea")).find(el => {
            const info = `${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
            const val = String(el.value || "");
            return /search|filter|検索/.test(info) || /^lora(?:[\\/]|$)/i.test(val.trim());
        }) || null;
    }

    function ensureToolbarGrid(toolbar) {
        if (!toolbar) return;
        // A1111/Neo uses one flexible search column followed by min-content tool buttons.
        // Civitai Helper also extends this grid when it adds its refresh button.
        // Recalculate from the actual direct children so both extensions coexist.
        try {
            const direct = Array.from(toolbar.children).filter(el => {
                const cs = getComputedStyle(el);
                return cs.display !== "none";
            });
            const toolCols = Math.max(4, direct.length - 1);
            toolbar.style.gridTemplateColumns = `minmax(0, auto) repeat(${toolCols}, min-content)`;
        } catch (_) {}
    }

    function mountPager(tab, pager) {
        const toolbar = toolbarFor(tab);
        if (!toolbar) return false;

        // Prefer immediately after Civitai Helper's refresh button when present.
        // Otherwise append to the same native toolbar. No fixed/absolute positioning.
        const chRefresh = root().querySelector(`#${CSS.escape(tab)}_lora_ch_refresh`) ||
                          root().querySelector(`#${CSS.escape(tab)}_loras_ch_refresh`);
        if (chRefresh && chRefresh.parentElement === toolbar) {
            if (chRefresh.nextSibling !== pager) chRefresh.after(pager);
        } else if (pager.parentElement !== toolbar) {
            toolbar.appendChild(pager);
        }

        pager.classList.remove("enp-pager-floating", "enp-pager-fallback");
        pager.classList.add("enp-pager-integrated");
        pager.style.position = "static";
        pager.style.left = "";
        pager.style.top = "";
        pager.style.right = "";
        pager.style.bottom = "";
        pager.style.zIndex = "";
        pager.style.display = "inline-flex";
        ensureToolbarGrid(toolbar);
        return true;
    }

    function createPager(tab) {
        const cards = cardsFor(tab);
        if (!cards) return null;

        let pager = pagerFor(tab);
        if (!pager) {
            const st = stateFor(tab);
            pager = document.createElement("div");
            pager.id = pagerId(tab);
            pager.className = "enp-pager enp-pager-toolbar enp-pager-integrated";
            pager.dataset.enpTab = tab;
            pager.innerHTML = `
                <button type="button" class="enp-btn enp-prev" title="前のページ">◀</button>
                <div class="enp-page-wrap">
                    <button type="button" class="enp-page-label enp-page-jump-btn" title="ページを選択" aria-haspopup="menu" aria-expanded="false"><b>1</b> / 1 ▾</button>
                    <div class="enp-page-menu" role="menu" hidden></div>
                </div>
                <button type="button" class="enp-btn enp-next" title="次のページ">▶</button>
                <div class="enp-size-wrap">
                    <button type="button" class="enp-size-btn" title="1ページの表示件数" aria-haspopup="menu" aria-expanded="false">${st.pageSize} ▾</button>
                    <div class="enp-size-menu" role="menu" hidden>
                        ${VALID_SIZES.map(n => `<button type="button" class="enp-size-option" data-size="${n}" role="menuitem">${n}</button>`).join("")}
                    </div>
                </div>
                <span class="enp-total" title="現在の対象LoRA総数">?件</span>`;
            wirePager(tab, pager);
        }

        if (!mountPager(tab, pager)) {
            // Do not float elsewhere. Wait until Neo creates the native toolbar.
            pager.style.display = "none";
            return pager;
        }
        return pager;
    }

    function updatePager(tab, data) {
        const pager = createPager(tab);
        if (!pager) return;
        const st = stateFor(tab);
        st.page = data.page;
        st.pages = data.pages;
        st.pageSize = data.page_size;
        const label = pager.querySelector(".enp-page-label");
        if (label) label.innerHTML = `<b>${data.page}</b> / ${data.pages} ▾`;
        buildPageMenu(tab, pager, data.page, data.pages);
        const total = pager.querySelector(".enp-total");
        if (total) {
            total.textContent = `${data.total}件`;
            total.title = `${st.folder ? `選択フォルダ: ${displayFolder(st.folder)} / ` : ""}対象LoRA ${data.total}件`;
        }
        const prev = pager.querySelector(".enp-prev");
        const next = pager.querySelector(".enp-next");
        if (prev) prev.disabled = data.page <= 1;
        if (next) next.disabled = data.page >= data.pages;
        const sizeBtn = pager.querySelector(".enp-size-btn");
        if (sizeBtn) sizeBtn.textContent = `${data.page_size} ▾`;
    }


    function pageNumbers(current, total) {
        if (total <= 12) return Array.from({length: total}, (_, i) => i + 1);
        const keep = new Set([1, 2, total - 1, total]);
        for (let p = current - 2; p <= current + 2; p++) {
            if (p >= 1 && p <= total) keep.add(p);
        }
        return Array.from(keep).sort((a, b) => a - b);
    }

    function buildPageMenu(tab, pager, current, total) {
        const menu = pager.querySelector(".enp-page-menu");
        if (!menu) return;
        const nums = pageNumbers(current, total);
        let last = 0;
        const html = [];
        for (const n of nums) {
            if (last && n > last + 1) {
                html.push('<div class="enp-page-gap" aria-hidden="true">…</div>');
            }
            html.push(`<button type="button" class="enp-page-option${n === current ? " is-current" : ""}" data-page="${n}" role="menuitem" ${n === current ? 'aria-current="page"' : ''}>${n}</button>`);
            last = n;
        }
        menu.innerHTML = html.join("");
        menu.querySelectorAll(".enp-page-option").forEach(btn => {
            btn.addEventListener("click", e => {
                e.preventDefault(); e.stopPropagation();
                const target = parseInt(btn.dataset.page || "", 10);
                if (!Number.isFinite(target)) return;
                closePageMenu(pager);
                refresh(tab, target);
            });
        });
    }

    function closePageMenu(pager) {
        const btn = pager?.querySelector(".enp-page-jump-btn");
        const menu = pager?.querySelector(".enp-page-menu");
        if (!btn || !menu) return;
        menu.hidden = true;
        btn.setAttribute("aria-expanded", "false");
    }

    function displayFolder(path) {
        const s = String(path || "").replaceAll("\\", "/").replace(/\/+$/, "");
        if (!s) return "all";
        const parts = s.split("/").filter(Boolean);
        return parts.slice(-2).join("/") || s;
    }

    async function refresh(tab, requestedPage = 1) {
        const cards = cardsFor(tab);
        if (!cards) return;
        createPager(tab);
        const st = stateFor(tab);
        const seq = ++st.seq;
        st.busy = true;
        cards.classList.add("enp-loading");
        const params = new URLSearchParams({
            tabname: tab,
            page_num: String(requestedPage),
            page_size: String(st.pageSize),
            search: st.search || "",
            folder: st.folder || "",
        });
        try {
            const r = await fetch(`/sd_extra_networks_pagination/lora?${params.toString()}`, {cache: "no-store"});
            const data = await r.json();
            if (seq !== st.seq) return;
            if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
            cards.innerHTML = data.html;
            st.initialLoaded = true;
            updatePager(tab, data);
            try {
                if (typeof window.setupAllResizeHandles === "function") window.setupAllResizeHandles();
            } catch (_) {}
            document.dispatchEvent(new CustomEvent("enp:lora-page-changed", {detail: {tab, data}}));
        } catch (e) {
            console.error("[Extra Networks Pagination]", e);
            cards.innerHTML = `<div class="enp-error">LoRAページの取得に失敗しました: ${String(e.message || e)}</div>`;
        } finally {
            if (seq === st.seq) {
                st.busy = false;
                cards.classList.remove("enp-loading");
            }
        }
    }

    function delayedRefresh(tab) {
        const st = stateFor(tab);
        st.page = 1;
        clearTimeout(st.timer);
        st.timer = setTimeout(() => refresh(tab, 1), DEBOUNCE_MS);
    }

    function wirePager(tab, pager) {
        if (pager.dataset.enpWired === "1") return;
        pager.dataset.enpWired = "1";
        const st = stateFor(tab);
        pager.querySelector(".enp-prev")?.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            refresh(tab, Math.max(1, st.page - 1));
        });
        pager.querySelector(".enp-next")?.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            refresh(tab, Math.min(st.pages, st.page + 1));
        });
        const pageBtn = pager.querySelector(".enp-page-jump-btn");
        const pageMenu = pager.querySelector(".enp-page-menu");
        pageBtn?.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            if (!pageMenu) return;
            const opening = pageMenu.hidden;
            pageMenu.hidden = !opening;
            pageBtn.setAttribute("aria-expanded", opening ? "true" : "false");
            if (opening) {
                const sizeMenuOpen = pager.querySelector(".enp-size-menu");
                const sizeButton = pager.querySelector(".enp-size-btn");
                if (sizeMenuOpen) sizeMenuOpen.hidden = true;
                if (sizeButton) sizeButton.setAttribute("aria-expanded", "false");
            }
        });
        const sizeBtn = pager.querySelector(".enp-size-btn");
        const sizeMenu = pager.querySelector(".enp-size-menu");
        const closeSizeMenu = () => {
            if (!sizeMenu || !sizeBtn) return;
            sizeMenu.hidden = true;
            sizeBtn.setAttribute("aria-expanded", "false");
        };
        sizeBtn?.addEventListener("click", e => {
            e.preventDefault(); e.stopPropagation();
            if (!sizeMenu) return;
            const opening = sizeMenu.hidden;
            sizeMenu.hidden = !opening;
            sizeBtn.setAttribute("aria-expanded", opening ? "true" : "false");
        });
        sizeMenu?.querySelectorAll(".enp-size-option").forEach(btn => {
            btn.addEventListener("click", e => {
                e.preventDefault(); e.stopPropagation();
                const v = parseInt(btn.dataset.size || "", 10);
                if (!VALID_SIZES.includes(v)) return;
                st.pageSize = v;
                st.page = 1;
                localStorage.setItem("enp_page_size_v11", String(v));
                closeSizeMenu();
                refresh(tab, 1);
            });
        });
        document.addEventListener("click", e => {
            if (!pager.contains(e.target)) {
                closeSizeMenu();
                closePageMenu(pager);
            }
        }, {passive: true});
    }

    function wireSearch(tab) {
        const input = findSearchInput(tab);
        if (!input || input.dataset.enpSearchWired === "1") return;
        input.dataset.enpSearchWired = "1";
        const sync = () => {
            const st = stateFor(tab);
            if ((input.value || "") === st.search) return;
            st.search = input.value || "";
            delayedRefresh(tab);
        };
        input.addEventListener("input", sync);
        input.addEventListener("change", sync);
    }

    function inferTabFromElement(el) {
        let node = el;
        for (let i = 0; node && i < 14; i++, node = node.parentElement) {
            const id = String(node.id || "").toLowerCase();
            if (id.includes("txt2img") && (id.includes("lora") || id.includes("extra_network"))) return "txt2img";
            if (id.includes("img2img") && (id.includes("lora") || id.includes("extra_network"))) return "img2img";
        }
        return null;
    }

    function folderElementFromEvent(event) {
        const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
        for (const node of path) {
            if (!(node instanceof Element)) continue;
            const candidate = node.closest?.("[data-path]") || null;
            if (!candidate) continue;
            const cls = String(candidate.className || "").toLowerCase();
            if (cls.includes("tree-list-content-file")) continue;
            if (cls.includes("dir") || cls.includes("folder") || cls.includes("tree-list-content-dir") || cls.includes("extra-network-dir")) {
                return candidate;
            }
            const text = (candidate.textContent || "").trim().toLowerCase();
            if (text === "all") return candidate;
        }
        return null;
    }

    function installGlobalFolderCapture() {
        if (window.__enpFolderCaptureV11) return;
        window.__enpFolderCaptureV11 = true;
        root().addEventListener("click", event => {
            const el = folderElementFromEvent(event);
            if (!el) return;
            const tab = inferTabFromElement(el);
            if (!tab || !cardsFor(tab)) return;
            let raw = el.getAttribute("data-path");
            if (raw == null) raw = "";
            const text = (el.textContent || "").trim().toLowerCase();
            if (text === "all" || raw === "all" || raw === ".") raw = "";
            const st = stateFor(tab);
            st.folder = raw;
            st.page = 1;
            setTimeout(() => refresh(tab, 1), 40);
        }, true);
    }

    function initTab(tab) {
        const cards = cardsFor(tab);
        if (!cards) return;
        createPager(tab);
        wireSearch(tab);
        const st = stateFor(tab);
        if (!st.initialLoaded) refresh(tab, 1);
    }

    function initAll() {
        initTab("txt2img");
        initTab("img2img");
        installGlobalFolderCapture();
    }

    let booted = false;
    let maintenanceTimer = null;

    function safeInitAll() {
        try {
            initAll();
        } catch (e) {
            console.warn("[Extra Networks Pagination] UI init retry:", e);
        }
    }

    function boot() {
        if (booted) return;
        booted = true;

        // Do not use a subtree MutationObserver here. Moving the pager into
        // Neo's toolbar is itself a DOM mutation and can create a feedback
        // loop during Gradio startup. A few delayed passes are sufficient to
        // catch Neo's asynchronously-created Extra Networks UI.
        safeInitAll();
        [300, 800, 1600, 3000, 6000].forEach(ms => setTimeout(safeInitAll, ms));

        // Low-frequency maintenance catches UI reloads without interfering
        // with Gradio's own render cycle.
        maintenanceTimer = setInterval(safeInitAll, 2500);
        
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once: true});
    else boot();
})();
