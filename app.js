const API_ORIGIN = "https://bjapi.afreecatv.com";
const MAX_COMMENT_PAGES = 30;
const MAX_REPLY_PAGES = 15;

const form = document.querySelector("#searchForm");
const postUrlInput = document.querySelector("#postUrl");
const keywordInput = document.querySelector("#keyword");
const includeRepliesInput = document.querySelector("#includeReplies");
const serviceStatus = document.querySelector("#serviceStatus");
const summaryGrid = document.querySelector("#summaryGrid");
const totalComments = document.querySelector("#totalComments");
const matchedComments = document.querySelector("#matchedComments");
const checkedPages = document.querySelector("#checkedPages");
const emptyState = document.querySelector("#emptyState");
const resultList = document.querySelector("#resultList");
const clearButton = document.querySelector("#clearButton");
const resultTemplate = document.querySelector("#resultTemplate");
const themeToggle = document.querySelector("#themeToggle");
const themeLabel = document.querySelector("#themeLabel");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const THEME_STORAGE_KEY = "chuntaverse-theme";

initTheme();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = form.querySelector("button[type='submit']");
  const postUrl = postUrlInput.value.trim();
  const keyword = normalize(keywordInput.value);
  const includeReplies = includeRepliesInput.checked;

  if (!keyword) {
    setError("검색어를 입력해 주세요.");
    keywordInput.focus();
    return;
  }

  let post;
  try {
    post = parsePostUrl(postUrl);
  } catch (error) {
    setError(error.message);
    postUrlInput.focus();
    return;
  }

  resetResults();
  setLoading(true);
  button.disabled = true;

  try {
    const results = await searchComments(post, keyword, includeReplies);
    renderResults(results);
    setStatus("완료");
  } catch (error) {
    setError(error.message || "댓글을 불러오지 못했습니다.");
  } finally {
    setLoading(false);
    button.disabled = false;
  }
});

clearButton.addEventListener("click", () => {
  form.reset();
  resetResults();
  setStatus("대기");
  postUrlInput.focus();
});

resultList.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const button = event.target.closest("[data-copy-link]");
  if (!button) {
    return;
  }

  const link = button.dataset.copyLink;
  if (!link) {
    return;
  }

  try {
    await copyText(link);
    showCopyState(button, "복사됨");
  } catch {
    showCopyState(button, "복사 실패");
  }
});

themeToggle?.addEventListener("change", () => {
  applyTheme(themeToggle.checked ? "dark" : "light", true);
});

function initTheme() {
  const initialTheme =
    document.documentElement.dataset.theme === "light" ? "light" : "dark";
  applyTheme(initialTheme, false);
}

function applyTheme(theme, shouldStore) {
  document.documentElement.dataset.theme = theme;

  if (themeToggle) {
    themeToggle.checked = theme === "dark";
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "다크 모드 전환" : "라이트 모드 전환",
    );
  }

  if (themeLabel) {
    themeLabel.textContent = theme === "dark" ? "다크 모드" : "라이트 모드";
  }

  themeColorMeta?.setAttribute("content", theme === "dark" ? "#17191d" : "#f9f9f9");

  if (shouldStore) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is optional.
    }
  }
}

function parsePostUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("게시글 주소 형식을 확인해 주세요.");
  }

  const path = url.pathname.split("/").filter(Boolean);
  const postIndex = path.findIndex((part) => part.toLowerCase() === "post");
  const titleIndex = path.findIndex((part) => part.toLowerCase() === "title");
  const markerIndex = postIndex >= 0 ? postIndex : titleIndex;

  if (markerIndex < 1 || !path[markerIndex + 1]) {
    throw new Error("주소에서 방송국 아이디와 글 번호를 찾지 못했습니다.");
  }

  const bjId = path[markerIndex - 1];
  const titleNo = path[markerIndex + 1].replace(/\D/g, "");

  if (!bjId || !titleNo) {
    throw new Error("게시글 주소에 글 번호가 포함되어 있어야 합니다.");
  }

  const canonicalPostUrl = `https://bj.afreecatv.com/${encodeURIComponent(
    bjId,
  )}/post/${titleNo}`;

  return { bjId, titleNo, canonicalPostUrl };
}

async function searchComments(post, keyword, includeReplies) {
  const matches = [];
  let page = 1;
  let lastPage = 1;
  let checkedCommentPages = 0;
  let checkedReplyPages = 0;
  let checkedItems = 0;

  do {
    const payload = await fetchJson(commentUrl(post, page));
    const comments = Array.isArray(payload.data) ? payload.data : [];
    checkedItems += comments.length;
    checkedCommentPages += 1;

    for (const comment of comments) {
      if (matchesAuthor(comment, keyword)) {
        matches.push(toResultItem(comment, post, "댓글"));
      }

      if (includeReplies && Number(comment.c_comment_cnt) > 0) {
        const replyBundle = await fetchReplies(post, comment.p_comment_no, keyword);
        checkedReplyPages += replyBundle.checkedPages;
        checkedItems += replyBundle.checkedItems;
        matches.push(...replyBundle.matches);
      }
    }

    lastPage = Number(payload.meta?.last_page || 1);
    page += 1;
  } while (page <= lastPage && page <= MAX_COMMENT_PAGES);

  return {
    total: checkedItems,
    checkedPages: checkedCommentPages + checkedReplyPages,
    truncated: lastPage > MAX_COMMENT_PAGES,
    matches,
  };
}

async function fetchReplies(post, parentCommentNo, keyword) {
  const matches = [];
  let page = 1;
  let checkedPages = 0;
  let checkedItems = 0;
  let hasNext = true;

  while (hasNext && page <= MAX_REPLY_PAGES) {
    const payload = await fetchJson(replyUrl(post, parentCommentNo, page));
    const replies = Array.isArray(payload.data) ? payload.data : [];
    checkedPages += 1;
    checkedItems += replies.length;

    for (const reply of replies) {
      if (matchesAuthor(reply, keyword)) {
        matches.push(toResultItem(reply, post, "답글"));
      }
    }

    const lastPage = Number(payload.meta?.last_page || 1);
    hasNext = replies.length > 0 && page < lastPage;
    page += 1;
  }

  return { checkedPages, checkedItems, matches };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`댓글 API 응답을 확인해 주세요. (${response.status})`);
  }

  return response.json();
}

function commentUrl(post, page) {
  const url = new URL(
    `/api/${encodeURIComponent(post.bjId)}/title/${post.titleNo}/comment`,
    API_ORIGIN,
  );
  url.searchParams.set("page", String(page));
  return url.toString();
}

function replyUrl(post, parentCommentNo, page) {
  const url = new URL(
    `/api/${encodeURIComponent(post.bjId)}/title/${post.titleNo}/comment/${parentCommentNo}/reply`,
    API_ORIGIN,
  );
  url.searchParams.set("page", String(page));
  return url.toString();
}

function matchesAuthor(item, keyword) {
  const id = normalize(item.user_id);
  const nick = normalize(item.user_nick);
  return id.includes(keyword) || nick.includes(keyword);
}

function toResultItem(item, post, type) {
  const isReply = type === "답글";
  const anchor = isReply ? `reply_noti${item.c_comment_no}` : `comment_noti${item.p_comment_no}`;

  return {
    author: `${item.user_nick || "이름 없음"} (${item.user_id || "-"})`,
    type,
    date: item.reg_date || "",
    comment: stripHtml(item.comment || ""),
    profileImage: normalizeProfileImage(item.profile_image),
    link: `${post.canonicalPostUrl}#${anchor}`,
  };
}

function renderResults(results) {
  resultList.replaceChildren();
  emptyState.hidden = results.matches.length > 0;
  summaryGrid.hidden = false;
  totalComments.textContent = String(results.total);
  matchedComments.textContent = String(results.matches.length);
  checkedPages.textContent = results.truncated
    ? `${results.checkedPages}+`
    : String(results.checkedPages);

  if (results.matches.length === 0) {
    emptyState.hidden = false;
    emptyState.querySelector("p").textContent = "일치하는 댓글을 찾지 못했습니다.";
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const result of results.matches) {
    const row = resultTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector("[data-field='author']").textContent = result.author;
    row.querySelector("[data-field='type']").textContent = result.type;
    row.querySelector("[data-field='date']").textContent = result.date;
    row.querySelector("[data-field='comment']").textContent = result.comment;
    row.querySelector("[data-field='link']").href = result.link;
    row.querySelector("[data-field='copy']").dataset.copyLink = result.link;

    const avatar = row.querySelector("[data-field='avatar']");
    if (result.profileImage) {
      avatar.src = result.profileImage;
      avatar.alt = `${result.author} 프로필 이미지`;
      avatar.addEventListener("error", () => {
        avatar.hidden = true;
      }, { once: true });
    } else {
      avatar.hidden = true;
    }

    fragment.append(row);
  }

  resultList.append(fragment);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed");
    }
  } finally {
    textarea.remove();
  }
}

function showCopyState(button, label) {
  const originalLabel = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = originalLabel;
  button.textContent = label;
  button.classList.toggle("is-copied", label === "복사됨");

  window.setTimeout(() => {
    button.textContent = originalLabel;
    button.classList.remove("is-copied");
  }, 1400);
}

function resetResults() {
  resultList.replaceChildren();
  summaryGrid.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector("p").textContent =
    "게시글 주소와 작성자를 입력하면 결과가 여기에 표시됩니다.";
}

function setLoading(isLoading) {
  if (isLoading) {
    setStatus("검색 중", "is-loading");
  }
}

function setStatus(label, className = "") {
  serviceStatus.className = `status-pill ${className}`.trim();
  serviceStatus.textContent = label;
}

function setError(message) {
  setStatus("오류", "is-error");
  emptyState.hidden = false;
  summaryGrid.hidden = true;
  resultList.replaceChildren();
  emptyState.querySelector("p").textContent = message;
}

function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("ko-KR");
}

function normalizeProfileImage(value) {
  const imageUrl = String(value || "").trim();

  if (!imageUrl) {
    return "";
  }

  if (imageUrl.startsWith("//")) {
    return `https:${imageUrl}`;
  }

  if (imageUrl.startsWith("http://")) {
    return imageUrl.replace("http://", "https://");
  }

  if (imageUrl.startsWith("https://")) {
    return imageUrl;
  }

  return "";
}

function stripHtml(value) {
  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent || element.innerText || "";
}
