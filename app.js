const API_ORIGIN = "https://bjapi.afreecatv.com";
const MAX_COMMENT_PAGES = 30;
const MAX_REPLY_PAGES = 15;
const CHAENNA_POST_URL = "https://www.sooplive.com/station/chaenna02/post/196058089";

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
const fanBoardButton = document.querySelector("#fanBoardButton");
const chaennaPresetButton = document.querySelector("#chaennaPresetButton");
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

chaennaPresetButton?.addEventListener("click", () => {
  postUrlInput.value = CHAENNA_POST_URL;
  postUrlInput.dispatchEvent(new Event("input", { bubbles: true }));
  showPresetState(chaennaPresetButton);
  setStatus("입력됨");
  keywordInput.focus();
});

fanBoardButton?.addEventListener("click", async () => {
  const postUrl = postUrlInput.value.trim();
  const keyword = keywordInput.value.trim();

  if (!postUrl) {
    setError("게시글 주소를 입력해 주세요.");
    postUrlInput.focus();
    return;
  }

  if (!keyword) {
    setError("검색어를 입력해 주세요.");
    keywordInput.focus();
    return;
  }

  try {
    parsePostUrl(postUrl);
  } catch (error) {
    setError(error.message);
    postUrlInput.focus();
    return;
  }

  try {
    await copyText(buildFanBoardScript(postUrl, keyword, includeRepliesInput.checked));
    showCopyState(fanBoardButton, "코드 복사됨");
    setStatus("복사됨");
    showMessage(
      "애청자 게시판용 코드를 복사했습니다. SOOP 게시글 페이지에서 개발자 도구 Console에 붙여넣으면 댓글 링크를 선택해 복사할 수 있습니다.",
    );
  } catch {
    showCopyState(fanBoardButton, "복사 실패");
    setError("코드를 클립보드에 복사하지 못했습니다.");
  }
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
    profileImages: profileImageCandidates(item),
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
    if (result.profileImages.length > 0) {
      let imageIndex = 0;
      avatar.src = result.profileImages[imageIndex];
      avatar.alt = `${result.author} 프로필 이미지`;
      avatar.addEventListener("error", () => {
        imageIndex += 1;
        if (result.profileImages[imageIndex]) {
          avatar.src = result.profileImages[imageIndex];
          return;
        }

        avatar.hidden = true;
      });
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
  button.classList.toggle("is-copied", label === "복사됨" || label === "코드 복사됨");

  window.setTimeout(() => {
    button.textContent = originalLabel;
    button.classList.remove("is-copied");
  }, 1400);
}

function showPresetState(button) {
  const originalLabel = button.querySelector("span")?.textContent || "챈나룽";
  button.classList.add("is-filled");

  window.setTimeout(() => {
    button.classList.remove("is-filled");
    const label = button.querySelector("span");
    if (label) {
      label.textContent = originalLabel;
    }
  }, 900);
}

function buildFanBoardScript(postUrl, keyword, includeReplies) {
  return `(${fanBoardConsoleRunner.toString()})(${JSON.stringify({
    includeReplies,
    keyword,
    postUrl,
  })});`;
}

function fanBoardConsoleRunner(config) {
  const MAX_COMMENT_PAGES = 50;
  const MAX_REPLY_PAGES = 20;
  const API_ORIGIN = "https://chapi.sooplive.com/api";

  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase("ko-KR");

  const stripHtml = (value) => {
    const element = document.createElement("div");
    element.innerHTML = value || "";
    return element.textContent || element.innerText || "";
  };

  const normalizeImage = (value) => {
    const imageUrl = String(value || "").trim();
    if (!imageUrl) return "";
    if (imageUrl.startsWith("//")) return `https:${imageUrl}`;
    if (imageUrl.startsWith("http://")) return imageUrl.replace("http://", "https://");
    if (imageUrl.startsWith("https://")) return imageUrl;
    return "";
  };

  const parsePost = (value) => {
    const url = new URL(value, window.location.href);
    const path = url.pathname.split("/").filter(Boolean);
    let bjId = "";
    let titleNo = "";

    if (path[0] === "station" && path[1] && path[2] === "post" && path[3]) {
      bjId = path[1];
      titleNo = path[3].replace(/\D/g, "");
    } else {
      const postIndex = path.findIndex((part) => part.toLowerCase() === "post");
      const titleIndex = path.findIndex((part) => part.toLowerCase() === "title");
      const markerIndex = postIndex >= 0 ? postIndex : titleIndex;
      bjId = markerIndex >= 1 ? path[markerIndex - 1] : "";
      titleNo = markerIndex >= 0 && path[markerIndex + 1] ? path[markerIndex + 1].replace(/\D/g, "") : "";
    }

    if (!bjId || !titleNo) {
      throw new Error("게시글 주소에서 방송국 아이디와 글 번호를 찾지 못했습니다.");
    }

    return {
      bjId,
      titleNo,
      url: `https://ch.sooplive.co.kr/${encodeURIComponent(bjId)}/post/${titleNo}`,
    };
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json();

    if (!response.ok || payload.code) {
      throw new Error(payload.message || `댓글 API 응답 오류 (${response.status})`);
    }

    return payload;
  };

  const commentUrl = (post, page) => {
    const url = new URL(
      `${API_ORIGIN}/${encodeURIComponent(post.bjId)}/title/${post.titleNo}/comment`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "reg_date");
    url.searchParams.set("p_comment_no", "");
    url.searchParams.set("c_comment_no", "");
    url.searchParams.set("p_highlight_no", "");
    url.searchParams.set("c_highlight_no", "");
    return url.toString();
  };

  const replyUrl = (post, parentCommentNo, page) => {
    const url = new URL(
      `${API_ORIGIN}/${encodeURIComponent(post.bjId)}/title/${post.titleNo}/comment/${parentCommentNo}/reply`,
    );
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "reg_date");
    return url.toString();
  };

  const matchesAuthor = (item, searchKeyword) => {
    const userId = normalize(item.user_id);
    const userNick = normalize(item.user_nick);
    return userId.includes(searchKeyword) || userNick.includes(searchKeyword);
  };

  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("아래 링크를 복사해 주세요.", text);
    }
  };

  const closeExistingLayer = () => {
    document.querySelector("#chuntaverseFanBoardLayer")?.remove();
  };

  const renderLayer = (matches) => {
    closeExistingLayer();

    if (matches.length === 0) {
      alert("검색된 댓글이 없습니다.");
      return;
    }

    const layer = document.createElement("div");
    layer.id = "chuntaverseFanBoardLayer";
    layer.style.cssText = [
      "position:fixed",
      "inset:24px",
      "z-index:2147483647",
      "padding:18px",
      "overflow:auto",
      "border:3px solid #61ffec",
      "border-radius:8px",
      "background:#17191d",
      "color:#f9f9f9",
      "box-shadow:0 24px 80px rgba(0,0,0,.45)",
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;";

    const title = document.createElement("strong");
    title.textContent = `천타버스 댓글 검색 결과 (${matches.length})`;
    title.style.cssText = "font-size:18px;";

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "닫기";
    closeButton.style.cssText =
      "min-height:38px;padding:0 14px;border:1px solid #3f3f3f;border-radius:6px;background:#101216;color:#f9f9f9;font-weight:800;cursor:pointer;";
    closeButton.addEventListener("click", closeExistingLayer);

    header.append(title, closeButton);
    layer.append(header);

    const list = document.createElement("div");
    list.style.cssText = "display:grid;gap:10px;";

    for (const item of matches) {
      const row = document.createElement("button");
      row.type = "button";
      row.style.cssText = [
        "display:grid",
        "grid-template-columns:44px 1fr",
        "gap:10px",
        "width:100%",
        "padding:12px",
        "border:1px solid #3f3f3f",
        "border-left:4px solid #61ffec",
        "border-radius:8px",
        "background:#101216",
        "color:#f9f9f9",
        "text-align:left",
        "cursor:pointer",
      ].join(";");

      const avatar = document.createElement("img");
      avatar.src = item.profileImage;
      avatar.alt = "";
      avatar.style.cssText = "width:44px;height:44px;border-radius:50%;object-fit:cover;background:#202328;";
      avatar.addEventListener("error", () => {
        avatar.style.display = "none";
        row.style.gridTemplateColumns = "1fr";
      });

      const body = document.createElement("div");
      const meta = document.createElement("div");
      meta.textContent = `${item.author} · ${item.type} · ${item.date || ""}`;
      meta.style.cssText = "margin-bottom:6px;color:#61ffec;font-weight:800;";

      const comment = document.createElement("div");
      comment.textContent = item.comment;
      comment.style.cssText = "white-space:pre-wrap;line-height:1.55;";

      const hint = document.createElement("div");
      hint.textContent = "클릭하면 하이라이트 댓글 링크가 복사됩니다.";
      hint.style.cssText = "margin-top:8px;color:rgba(249,249,249,.58);font-size:12px;";

      body.append(meta, comment, hint);
      row.append(avatar, body);
      row.addEventListener("click", async () => {
        await copyText(item.link);
        row.style.borderColor = "#61ffec";
        hint.textContent = "복사되었습니다.";
      });

      list.append(row);
    }

    layer.append(list);
    document.body.append(layer);
  };

  const run = async () => {
    const post = parsePost(config.postUrl);
    const searchKeyword = normalize(config.keyword);
    const matches = [];

    const addMatch = (item, type) => {
      const isReply = type === "답글";
      matches.push({
        author: `${item.user_nick || "이름 없음"} (${item.user_id || "-"})`,
        comment: stripHtml(item.comment || ""),
        date: item.reg_date || "",
        link: `${post.url}#${isReply ? "reply_noti" : "comment_noti"}${isReply ? item.c_comment_no : item.p_comment_no}`,
        profileImage: normalizeImage(item.profile_image),
        type,
      });
    };

    const firstPage = await fetchJson(commentUrl(post, 1));
    const lastPage = Math.min(Number(firstPage.meta?.last_page || 1), MAX_COMMENT_PAGES);

    const handleComments = async (comments) => {
      for (const comment of comments) {
        if (matchesAuthor(comment, searchKeyword)) {
          addMatch(comment, "댓글");
        }

        if (config.includeReplies && Number(comment.c_comment_cnt) > 0) {
          let replyPage = 1;
          let replyLastPage = 1;

          do {
            const repliesPayload = await fetchJson(replyUrl(post, comment.p_comment_no, replyPage));
            replyLastPage = Math.min(Number(repliesPayload.meta?.last_page || 1), MAX_REPLY_PAGES);

            for (const reply of repliesPayload.data || []) {
              if (matchesAuthor(reply, searchKeyword)) {
                addMatch(reply, "답글");
              }
            }

            replyPage += 1;
          } while (replyPage <= replyLastPage);
        }
      }
    };

    await handleComments(firstPage.data || []);

    for (let page = 2; page <= lastPage; page += 1) {
      const payload = await fetchJson(commentUrl(post, page));
      await handleComments(payload.data || []);
    }

    renderLayer(matches);
  };

  run().catch((error) => {
    alert(`애청자 게시판 댓글 검색을 완료하지 못했습니다.\n${error.message || error}`);
  });
}

function showMessage(message) {
  resultList.replaceChildren();
  summaryGrid.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector("p").textContent = message;
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

function profileImageCandidates(item) {
  const userId = String(item.user_id || "").trim();
  const candidates = [
    normalizeProfileImage(item.profile_image),
    profileImageFromUserId(userId),
  ].filter(Boolean);

  return [...new Set(candidates)];
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

function profileImageFromUserId(userId) {
  if (!userId) {
    return "";
  }

  const normalizedId = userId.toLowerCase();
  const prefix = normalizedId.slice(0, 2);

  if (prefix.length < 2) {
    return "";
  }

  return `https://profile.img.sooplive.co.kr/LOGO/${prefix}/${encodeURIComponent(
    normalizedId,
  )}/${encodeURIComponent(normalizedId)}.jpg`;
}

function stripHtml(value) {
  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent || element.innerText || "";
}
