import math
import os
import threading
from typing import Any

from modules import script_callbacks, shared, ui_extra_networks

EXT_NAME = "Forge Extra Networks Pagination"
LORA_PAGE_NAMES = {"lora", "loras"}
DEFAULT_PAGE_SIZE = 60
VALID_PAGE_SIZES = (25, 50, 60, 100, 200)
_PATCHED = False
_LOCK = threading.RLock()
_ORIGINAL_CREATE_CARD_VIEW_HTML = None


def _is_lora_page(page) -> bool:
    vals = {
        str(getattr(page, "name", "")).strip().lower(),
        str(getattr(page, "extra_networks_tabname", "")).strip().lower(),
        str(getattr(page, "title", "")).strip().lower(),
    }
    return bool(vals & LORA_PAGE_NAMES)


def _patched_create_card_view_html(self, tabname: str, *, none_message):
    """Render only the first page, but keep Neo's native cards container untouched.

    The pager itself is inserted by JS as a sibling of the native
    `<tab>_lora_cards` container. This is important because Neo expects the
    native card elements to remain direct children of that container.
    """
    if not _is_lora_page(self):
        return _ORIGINAL_CREATE_CARD_VIEW_HTML(self, tabname, none_message=none_message)

    items = list(getattr(self, "items", {}).values())
    if not items:
        return _ORIGINAL_CREATE_CARD_VIEW_HTML(self, tabname, none_message=none_message)

    subset = items[:DEFAULT_PAGE_SIZE]
    return "".join(self.create_item_html(tabname, item, self.card_tpl) for item in subset)


def _norm(s: Any) -> str:
    return str(s or "").replace("\\", "/").strip().lower().rstrip("/")


def _allowed_roots(page):
    roots = []
    for root in page.allowed_directories_for_previews():
        try:
            roots.append(os.path.abspath(root))
        except Exception:
            pass
    return roots


def _relative_paths(page, filename: str):
    if not filename:
        return []
    try:
        filename_abs = os.path.abspath(filename)
    except Exception:
        return []
    out = []
    for root_abs in _allowed_roots(page):
        try:
            common = os.path.commonpath([root_abs, filename_abs])
            if os.path.normcase(common) != os.path.normcase(root_abs):
                continue
            rel = os.path.relpath(filename_abs, root_abs).replace("\\", "/")
            out.append(rel)
            # Neo's tree can include the root folder name as part of data-path.
            out.append(os.path.basename(root_abs).replace("\\", "/") + "/" + rel)
        except Exception:
            continue
    return out


def _folder_candidates(page, folder: str):
    raw = _norm(folder)
    if not raw or raw in {"all", "."}:
        return []
    values = {raw.lstrip("/")}
    # Convert absolute selected paths to relative forms for every LoRA root.
    try:
        abs_folder = os.path.abspath(folder)
        for root in _allowed_roots(page):
            try:
                common = os.path.commonpath([root, abs_folder])
                if os.path.normcase(common) == os.path.normcase(root):
                    rel = os.path.relpath(abs_folder, root).replace("\\", "/")
                    if rel == ".":
                        values.add("")
                    else:
                        values.add(_norm(rel).lstrip("/"))
                        values.add(_norm(os.path.basename(root) + "/" + rel).lstrip("/"))
            except Exception:
                pass
    except Exception:
        pass
    return [x for x in values if x not in {"", ".", "all"}]


def _folder_match(page, item: dict, folder: str) -> bool:
    raw = _norm(folder)
    if not raw or raw in {"all", "."}:
        return True

    filename = item.get("filename", "")
    fn = _norm(filename)

    # Absolute tree data-path: direct prefix test is the most reliable.
    try:
        if os.path.isabs(str(folder)):
            f_abs = os.path.normcase(os.path.abspath(filename))
            d_abs = os.path.normcase(os.path.abspath(folder))
            try:
                if os.path.commonpath([f_abs, d_abs]) == d_abs:
                    return True
            except Exception:
                pass
    except Exception:
        pass

    rels = [_norm(x).lstrip("/") for x in _relative_paths(page, filename)]
    candidates = _folder_candidates(page, folder)
    for cand in candidates:
        c = cand.strip("/")
        if any(r == c or r.startswith(c + "/") for r in rels):
            return True
        if f"/{c}/" in f"/{fn}/":
            return True

    # Search terms are useful for custom LoRA roots and aliases.
    for term in item.get("search_terms", []) or []:
        t = _norm(term).strip("/")
        for cand in candidates:
            c = cand.strip("/")
            if t == c or t.startswith(c + "/"):
                return True
    return False


def _search_haystack(page, item: dict) -> str:
    parts = [
        item.get("name", ""),
        item.get("filename", ""),
        item.get("description", ""),
        " ".join(str(x) for x in (item.get("search_terms", []) or [])),
    ]
    parts.extend(_relative_paths(page, item.get("filename", "")))
    # Neo item metadata can contain None (for example description).
    # Convert every search field safely before joining.
    return _norm(" ".join(str(x) for x in parts if x is not None))


def _search_match(page, item: dict, query: str) -> bool:
    query = _norm(query)
    if not query:
        return True
    haystack = _search_haystack(page, item)
    positive = []
    negative = []
    for token in query.split():
        if token.startswith("-") and len(token) > 1:
            negative.append(token[1:].strip('"'))
        else:
            positive.append(token.strip('"'))
    return all(t in haystack for t in positive if t) and not any(t in haystack for t in negative if t)


def _sort_value(item: dict, field: str):
    keys = item.get("sort_keys", {}) or {}
    key = (field or "name").lower()
    aliases = {
        "date created": "date_created",
        "date modified": "date_modified",
        "path": "path",
        "name": "name",
    }
    key = aliases.get(key, key)
    if key in keys:
        return keys.get(key)
    if key == "path":
        return str(item.get("filename", "")).lower()
    return str(item.get("name", "")).lower()


def _current_default_sort():
    raw = str(getattr(shared.opts, "extra_networks_card_order_field", "Name") or "Name").lower()
    field = {
        "name": "name",
        "path": "path",
        "date created": "date_created",
        "date modified": "date_modified",
    }.get(raw, "name")
    direction = str(getattr(shared.opts, "extra_networks_card_order", "Ascending") or "Ascending").lower()
    return field, direction.startswith("desc")


def _find_lora_page():
    for page in getattr(ui_extra_networks, "extra_pages", []):
        if _is_lora_page(page):
            return page
    return None


def _ensure_items(page):
    if getattr(page, "items", None):
        return
    items_list = list(page.list_items())
    page.items = {x["name"]: x for x in items_list}
    for item in page.items.values():
        if "user_metadata" not in item:
            page.read_user_metadata(item)


def _api_page(
    tabname: str = "txt2img",
    page_num: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    search: str = "",
    folder: str = "",
    sort_field: str = "",
    sort_desc: bool = False,
):
    from fastapi.responses import JSONResponse

    with _LOCK:
        page = _find_lora_page()
        if page is None:
            return JSONResponse({"ok": False, "error": "LoRA page is not available yet."}, status_code=503)
        try:
            _ensure_items(page)
        except Exception as exc:
            return JSONResponse({"ok": False, "error": f"Failed to build LoRA index: {exc}"}, status_code=500)

        items = [
            item for item in page.items.values()
            if _folder_match(page, item, folder) and _search_match(page, item, search)
        ]

        if not sort_field:
            sort_field, reverse = _current_default_sort()
        else:
            reverse = bool(sort_desc)
        try:
            items.sort(key=lambda x: _sort_value(x, sort_field), reverse=reverse)
        except Exception:
            pass

        try:
            page_size = int(page_size)
        except Exception:
            page_size = DEFAULT_PAGE_SIZE
        if page_size not in VALID_PAGE_SIZES:
            page_size = DEFAULT_PAGE_SIZE

        total = len(items)
        pages = max(1, math.ceil(total / page_size))
        try:
            page_num = int(page_num)
        except Exception:
            page_num = 1
        page_num = max(1, min(page_num, pages))
        start = (page_num - 1) * page_size
        subset = items[start:start + page_size]

        html = "".join(page.create_item_html(tabname, item, page.card_tpl) for item in subset)
        if not html and total == 0:
            html = '<div class="enp-no-results">該当するLoRAはありません。</div>'

        return JSONResponse({
            "ok": True,
            "html": html,
            "page": page_num,
            "pages": pages,
            "page_size": page_size,
            "total": total,
            "folder": folder,
            "search": search,
        })


def _on_app_started(_demo, app):
    app.add_api_route(
        "/sd_extra_networks_pagination/lora",
        _api_page,
        methods=["GET"],
        name="sd_extra_networks_pagination_lora_v11",
    )


def _patch():
    global _PATCHED, _ORIGINAL_CREATE_CARD_VIEW_HTML
    if _PATCHED:
        return
    _ORIGINAL_CREATE_CARD_VIEW_HTML = ui_extra_networks.ExtraNetworksPage.create_card_view_html
    ui_extra_networks.ExtraNetworksPage.create_card_view_html = _patched_create_card_view_html
    _PATCHED = True
    print(f"[{EXT_NAME}] v11 enabled - LoRA pagination {DEFAULT_PAGE_SIZE}/page")


_patch()
script_callbacks.on_app_started(_on_app_started)
