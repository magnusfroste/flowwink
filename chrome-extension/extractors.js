// ============================================
// Smart Content Extractors
// Site-specific + generic fallback extraction
// Inspired by Claude Code / Bardeen patterns
// ============================================

const Extractors = (() => {

  // ---- Site-specific extractors ----

  const SITE_EXTRACTORS = {
    linkedin: {
      match: (host) => host.includes("linkedin.com"),
      extract: () => {
        // Profile page
        const profileName = document.querySelector("h1.text-heading-xlarge, .pv-top-card h1")?.innerText?.trim();
        const profileHeadline = document.querySelector(".text-body-medium.break-words, .pv-top-card .text-body-medium")?.innerText?.trim();

        // Feed posts — get the most recent visible post
        const posts = document.querySelectorAll(
          "div.feed-shared-update-v2, div[data-urn*='activity'], article.relative"
        );

        // Single post page
        const singlePost = document.querySelector(
          ".feed-shared-update-v2__description, .update-components-text, .break-words .tvm-parent-container"
        );

        // Activity/post detail
        const activityText = document.querySelector(
          "[data-ad-preview='message'], .feed-shared-text__text-view, .update-components-text__text-view"
        );

        let content = "";
        let title = document.title;

        if (singlePost || activityText) {
          // We're on a single post page
          content = (singlePost || activityText)?.innerText?.trim() || "";
          const author = document.querySelector(".update-components-actor__name, .feed-shared-actor__name")?.innerText?.trim();
          if (author) title = `Post by ${author}`;
        } else if (posts.length > 0) {
          // Feed or profile activity — grab top posts
          const extracted = [];
          const limit = Math.min(posts.length, 5);
          for (let i = 0; i < limit; i++) {
            const post = posts[i];
            const text = post.querySelector(
              ".feed-shared-text__text-view, .update-components-text__text-view, .break-words"
            )?.innerText?.trim();
            const author = post.querySelector(
              ".update-components-actor__name, .feed-shared-actor__name"
            )?.innerText?.trim();
            if (text) {
              extracted.push(`[${author || "Unknown"}]: ${text}`);
            }
          }
          content = extracted.join("\n\n---\n\n");
        } else if (profileName) {
          // Profile page without visible posts
          const about = document.querySelector("#about ~ div .pv-shared-text-with-see-more, .pv-about__summary-text, section.pv-about-section .pv-about__summary-text")?.innerText?.trim();
          const experience = Array.from(document.querySelectorAll(".pvs-list__paged-list-item, .pv-entity__summary-info")).slice(0, 5).map(el => el.innerText?.trim()).filter(Boolean).join("\n");
          title = `LinkedIn Profile: ${profileName}`;
          content = [
            profileName,
            profileHeadline,
            about ? `\nAbout:\n${about}` : "",
            experience ? `\nExperience:\n${experience}` : ""
          ].filter(Boolean).join("\n");
        }

        return { title, content: content || fallbackExtract() };
      }
    },

    twitter: {
      match: (host) => host.includes("x.com") || host.includes("twitter.com"),
      extract: () => {
        // Single tweet
        const tweetText = document.querySelector(
          "[data-testid='tweetText']"
        )?.innerText?.trim();

        const author = document.querySelector(
          "[data-testid='User-Name'] a"
        )?.innerText?.trim();

        if (tweetText) {
          return {
            title: author ? `Tweet by ${author}` : document.title,
            content: tweetText
          };
        }

        // Timeline — grab visible tweets
        const tweets = document.querySelectorAll("[data-testid='tweet']");
        const extracted = [];
        const limit = Math.min(tweets.length, 10);
        for (let i = 0; i < limit; i++) {
          const text = tweets[i].querySelector("[data-testid='tweetText']")?.innerText?.trim();
          const name = tweets[i].querySelector("[data-testid='User-Name']")?.innerText?.trim();
          if (text) extracted.push(`[${name || ""}]: ${text}`);
        }

        return {
          title: document.title,
          content: extracted.join("\n\n---\n\n") || fallbackExtract()
        };
      }
    },

    youtube: {
      match: (host) => host.includes("youtube.com"),
      extract: () => {
        const videoTitle = document.querySelector(
          "h1.ytd-watch-metadata yt-formatted-string, h1.title"
        )?.innerText?.trim();
        const channel = document.querySelector(
          "#channel-name yt-formatted-string a, ytd-channel-name yt-formatted-string"
        )?.innerText?.trim();
        const description = document.querySelector(
          "#description-inner, ytd-text-inline-expander .ytd-text-inline-expander"
        )?.innerText?.trim();
        const transcript = document.querySelector(
          "ytd-transcript-segment-list-renderer"
        )?.innerText?.trim();

        return {
          title: videoTitle || document.title,
          content: [
            videoTitle,
            channel ? `Channel: ${channel}` : "",
            description ? `\nDescription:\n${description}` : "",
            transcript ? `\nTranscript:\n${transcript.substring(0, 6000)}` : ""
          ].filter(Boolean).join("\n")
        };
      }
    },

    github: {
      match: (host) => host.includes("github.com"),
      extract: () => {
        // README
        const readme = document.querySelector(
          "#readme article, .markdown-body"
        )?.innerText?.trim();
        // Issue / PR
        const issueTitle = document.querySelector(
          ".js-issue-title, .gh-header-title"
        )?.innerText?.trim();
        const issueBody = document.querySelector(
          ".comment-body .markdown-body"
        )?.innerText?.trim();
        // Repo description
        const repoDesc = document.querySelector(
          ".f4.my-3, [itemprop='about']"
        )?.innerText?.trim();

        let content = "";
        let title = document.title;

        if (issueTitle) {
          title = issueTitle;
          content = issueBody || "";
        } else if (readme) {
          content = readme.substring(0, 8000);
        } else if (repoDesc) {
          content = repoDesc;
        }

        return { title, content: content || fallbackExtract() };
      }
    },

    reddit: {
      match: (host) => host.includes("reddit.com"),
      extract: () => {
        const postTitle = document.querySelector(
          "h1, [data-testid='post-title']"
        )?.innerText?.trim();
        const postBody = document.querySelector(
          "[data-testid='post-content'], .Post .RichTextJSON-root, shreddit-post"
        )?.innerText?.trim();

        const comments = Array.from(
          document.querySelectorAll("[data-testid='comment'] .RichTextJSON-root, shreddit-comment .md")
        ).slice(0, 10).map(el => el.innerText?.trim()).filter(Boolean);

        return {
          title: postTitle || document.title,
          content: [
            postBody,
            comments.length ? `\nTop Comments:\n${comments.join("\n\n")}` : ""
          ].filter(Boolean).join("\n\n")
        };
      }
    }
  };

  // ---- Smart generic extraction (Claude-inspired) ----

  function fallbackExtract() {
    // Priority-based selector system
    const SELECTORS = [
      "article[role='main']",
      "main article",
      "article",
      "[role='main']",
      "main",
      ".post-content",
      ".article-content",
      ".entry-content",
      "#content",
      ".content",
    ];

    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const text = cleanText(el);
        if (text.length > 100) return text;
      }
    }

    // Last resort: largest text block heuristic
    return findLargestTextBlock();
  }

  function findLargestTextBlock() {
    const candidates = document.querySelectorAll("div, section, article");
    let best = null;
    let bestLen = 0;

    candidates.forEach(el => {
      // Skip nav, header, footer, sidebar
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") || "";
      const cls = el.className || "";
      if (
        ["nav", "header", "footer", "aside"].includes(tag) ||
        ["navigation", "banner", "contentinfo", "complementary"].includes(role) ||
        /nav|menu|sidebar|footer|header|cookie|banner/i.test(cls)
      ) return;

      const text = el.innerText || "";
      if (text.length > bestLen && text.length > 200) {
        bestLen = text.length;
        best = text;
      }
    });

    return (best || document.body?.innerText || "").substring(0, 8000);
  }

  function cleanText(el) {
    // Remove script/style/nav/footer content
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, nav, footer, header, aside, [role='navigation'], [role='banner']").forEach(n => n.remove());
    return (clone.innerText || "").substring(0, 8000).trim();
  }

  // ---- Public API ----

  function extract() {
    const host = location.hostname;

    // Try selected text first
    const sel = window.getSelection()?.toString()?.trim();
    if (sel && sel.length > 20) {
      return { title: document.title, content: sel, method: "selection" };
    }

    // Try site-specific extractor
    for (const [name, extractor] of Object.entries(SITE_EXTRACTORS)) {
      if (extractor.match(host)) {
        try {
          const result = extractor.extract();
          if (result.content && result.content.length > 50) {
            return { ...result, method: name };
          }
        } catch (e) {
          console.warn(`[SignalCapture] ${name} extractor failed:`, e);
        }
      }
    }

    // Fallback
    return {
      title: document.title,
      content: fallbackExtract(),
      method: "generic"
    };
  }

  return { extract };
})();
