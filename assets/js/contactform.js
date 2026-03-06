// Melkapow custom behavior (kept out of template main.js)
(function () {
  "use strict";

  var turnstileState = {
    ok: false,
    hadError: false,
    errorShown: false,
    lastError: null,
    autoRetryCount: 0,
    autoRetryLimit: 2,
    autoRetryLocked: false,
    lastAutoRetryAt: 0
  };

  var TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  var TURNSTILE_SCRIPT_ID = "melkapowTurnstileScript";
  var turnstileScriptPromise = null;

  var turnstileWatchdogId = null;
  var turnstileWidgetId = null;
  var turnstileFrameObserver = null;
  var patchedTurnstileFrames = typeof WeakSet === "function" ? new WeakSet() : null;

  function isEmbedded() {
    try {
      return window.self !== window.top;
    } catch (_) {
      return true;
    }
  }

  function loadTurnstileScript() {
    if (window.turnstile && typeof window.turnstile.render === "function") return Promise.resolve(true);
    if (turnstileScriptPromise) return turnstileScriptPromise;

    turnstileScriptPromise = new Promise(function (resolve, reject) {
      var existing = document.getElementById(TURNSTILE_SCRIPT_ID);
      var script = existing;

      if (script && script.getAttribute("data-loaded") === "true") {
        resolve(true);
        return;
      }

      var done = false;
      var timeoutId = null;

      function cleanup() {
        if (!script) return;
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
      }

      function finish(ok, err) {
        if (done) return;
        done = true;
        if (timeoutId) clearTimeout(timeoutId);
        cleanup();
        if (ok) resolve(true);
        else reject(err || new Error("turnstile-load-failed"));
      }

      function onLoad() {
        try { script.setAttribute("data-loaded", "true"); } catch (_) { /* ignore */ }
        finish(true);
      }

      function onError() {
        finish(false, new Error("turnstile-load-failed"));
      }

      if (!script) {
        script = document.createElement("script");
        script.id = TURNSTILE_SCRIPT_ID;
        script.src = TURNSTILE_SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.referrerPolicy = "no-referrer";
      }

      script.addEventListener("load", onLoad);
      script.addEventListener("error", onError);

      timeoutId = setTimeout(function () {
        finish(false, new Error("turnstile-timeout"));
      }, 15000);

      if (!existing) {
        (document.head || document.documentElement).appendChild(script);
      } else if (window.turnstile && typeof window.turnstile.render === "function") {
        // Turnstile is already available (likely loaded elsewhere); resolve immediately.
        finish(true);
      }
    }).catch(function (err) {
      turnstileScriptPromise = null;
      throw err;
    });

    return turnstileScriptPromise;
  }

  function clearTurnstileWatchdog() {
    if (!turnstileWatchdogId) return;
    clearTimeout(turnstileWatchdogId);
    turnstileWatchdogId = null;
  }

  function scheduleTurnstileWatchdog(form) {
    clearTurnstileWatchdog();
    if (!form) return;
    if (turnstileState.autoRetryLocked) return;

    turnstileWatchdogId = setTimeout(function () {
      if (window.location.hash !== "#contact") return;
      if (!isTurnstileConfigured(form)) return;

      var tokenEl = form.querySelector('input[name="cf-turnstile-response"]');
      var token = tokenEl ? String(tokenEl.value || "").trim() : "";
      if (turnstileState.ok || token) return;

      if (!turnstileState.hadError && !turnstileState.errorShown) {
        if (isEmbedded()) {
          setStatus(
            "Captcha may not work inside an embedded/preview frame. Open this site in a normal browser tab and try again."
          );
        } else {
          setStatus(
            "Captcha is taking too long to verify. If it stays stuck, try refreshing the page or disabling blockers/privacy protections for this site."
          );
        }
      }

      autoRetryTurnstile(form, "watchdog");
    }, 12000);
  }

  function resetTurnstileState() {
    turnstileState.ok = false;
    turnstileState.hadError = false;
    turnstileState.errorShown = false;
    turnstileState.lastError = null;
    turnstileState.autoRetryCount = 0;
    turnstileState.autoRetryLocked = false;
    turnstileState.lastAutoRetryAt = 0;
  }

  function getTurnstileContainer(form) {
    if (!form) return null;
    return form.querySelector(".cf-turnstile");
  }

  function clearTurnstileToken(form) {
    if (!form) return;
    var inputs = form.querySelectorAll('input[name="cf-turnstile-response"]');
    if (!inputs || !inputs.length) return;
    inputs.forEach(function (input) {
      try {
        input.value = "";
      } catch (_) {
        // ignore
      }
    });
  }

  function disconnectTurnstileFrameObserver() {
    if (!turnstileFrameObserver) return;
    try {
      turnstileFrameObserver.disconnect();
    } catch (_) {
      // ignore
    }
    turnstileFrameObserver = null;
  }

  function ensureSandboxAllowsScripts(iframe) {
    if (!iframe || iframe.nodeType !== 1) return;

    if (patchedTurnstileFrames) {
      if (patchedTurnstileFrames.has(iframe)) return;
      patchedTurnstileFrames.add(iframe);
    } else if (iframe.__melkapowSandboxPatched) {
      return;
    } else {
      iframe.__melkapowSandboxPatched = true;
    }

    var sandbox = iframe.getAttribute("sandbox");
    if (sandbox == null) return;

    var flags = String(sandbox)
      .split(/\s+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    if (flags.indexOf("allow-scripts") !== -1) return;
    flags.push("allow-scripts");

    try {
      iframe.setAttribute("sandbox", flags.join(" "));
    } catch (_) {
      // ignore
    }
  }

  function observeTurnstileFrames(container) {
    disconnectTurnstileFrameObserver();
    if (!container || typeof MutationObserver === "undefined") return;

    // Patch any frames already present.
    var existing = container.querySelectorAll("iframe");
    if (existing && existing.length) {
      for (var i = 0; i < existing.length; i += 1) {
        ensureSandboxAllowsScripts(existing[i]);
      }
    }

    turnstileFrameObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.type === "attributes" && m.target && m.target.tagName === "IFRAME") {
          ensureSandboxAllowsScripts(m.target);
          return;
        }

        if (!m.addedNodes || !m.addedNodes.length) return;
        for (var i = 0; i < m.addedNodes.length; i += 1) {
          var node = m.addedNodes[i];
          if (!node || node.nodeType !== 1) return;

          if (node.tagName === "IFRAME") {
            ensureSandboxAllowsScripts(node);
            return;
          }

          if (node.querySelectorAll) {
            var frames = node.querySelectorAll("iframe");
            if (frames && frames.length) {
              for (var j = 0; j < frames.length; j += 1) {
                ensureSandboxAllowsScripts(frames[j]);
              }
            }
          }
        }
      });
    });

    try {
      turnstileFrameObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["sandbox"]
      });
    } catch (_) {
      disconnectTurnstileFrameObserver();
    }
  }

  function removeTurnstileWidget(form) {
    var container = getTurnstileContainer(form);

    disconnectTurnstileFrameObserver();

    if (window.turnstile && typeof window.turnstile.remove === "function" && turnstileWidgetId) {
      try {
        window.turnstile.remove(turnstileWidgetId);
      } catch (_) {
        // ignore
      }
    }

    turnstileWidgetId = null;

    if (container) {
      // In case the previous render left DOM behind (or user has cached old auto-render).
      container.innerHTML = "";
    }

    clearTurnstileToken(form);
  }

  function renderTurnstile(form) {
    if (!form) return false;
    if (!window.turnstile || typeof window.turnstile.render !== "function") return false;

    var container = getTurnstileContainer(form);
    if (!container) return false;

    // Only render once the container is visible (Turnstile can break if rendered while hidden).
    if (!container.getClientRects || container.getClientRects().length === 0) return false;

    var sitekey = String(container.getAttribute("data-sitekey") || "").trim();
    if (!sitekey || sitekey === "YOUR_TURNSTILE_SITE_KEY") return false;

    // Always render fresh when opening the Contact page.
    removeTurnstileWidget(form);

    try {
      turnstileWidgetId = window.turnstile.render(container, {
        sitekey: sitekey,
        retry: "never",
        callback: window.melkapowTurnstileOk,
        "error-callback": window.melkapowTurnstileError,
        "expired-callback": window.melkapowTurnstileExpired
      });
      observeTurnstileFrames(container);
      return true;
    } catch (_) {
      turnstileWidgetId = null;
      return false;
    }
  }

  function rerenderTurnstile(form) {
    if (!form) return;

    // If Contact isn't active, keep the widget removed (avoids background retries).
    if (window.location.hash !== "#contact") {
      removeTurnstileWidget(form);
      return;
    }

    // If we've already retried and it's still failing, stop the auto loop.
    if (turnstileState.autoRetryLocked) return;

    var tries = 0;
    var maxTries = 20;

    function attempt() {
      if (window.location.hash !== "#contact") return;

      var rendered = renderTurnstile(form);
      if (rendered) return;

      tries += 1;
      if (tries >= maxTries) return;
      setTimeout(attempt, 250);
    }

    setTimeout(attempt, 200);
  }

  function lockAutoRetries(form) {
    turnstileState.autoRetryLocked = true;
    clearTurnstileWatchdog();

    var rawCode = turnstileState.lastError ? String(turnstileState.lastError) : "";
    var codeNum = parseInt(rawCode, 10);
    var suffix = rawCode ? " (" + rawCode + ")" : "";
    var sitekey = "";
    try {
      var container = getTurnstileContainer(form);
      sitekey = container ? String(container.getAttribute("data-sitekey") || "").trim() : "";
    } catch (_) {}

    if (isFinite(codeNum) && codeNum === 110200) {
      setStatus(
        "Captcha error" +
          suffix +
          ". This domain isn't authorized for this Turnstile widget" +
          (sitekey ? " (sitekey " + sitekey + ")" : "") +
          ". Add " +
          location.hostname +
          " to the widget's allowed hostnames (exact match; no https://, no path; no wildcards), then refresh. Auto-retry paused."
      );
    } else {
      setStatus(
        "Captcha error" +
          suffix +
          ". Auto-retry paused. Leave the Contact page and come back (or refresh) to try again."
      );
    }

    // Keep the current widget visible so the user can see the error state.
    // We only stop our own rerender loop.
    if (form && window.location.hash === "#contact") {
      try { observeTurnstileFrames(getTurnstileContainer(form)); } catch (_) {}
    }
  }

  function autoRetryTurnstile(form, reason) {
    if (!form) return;
    if (window.location.hash !== "#contact") return;
    if (!isTurnstileConfigured(form)) return;
    if (turnstileState.autoRetryLocked) return;

    var limit = parseInt(turnstileState.autoRetryLimit, 10);
    if (!isFinite(limit) || limit < 0) limit = 0;

    if ((parseInt(turnstileState.autoRetryCount, 10) || 0) >= limit) {
      lockAutoRetries(form);
      return;
    }

    var now = Date.now ? Date.now() : new Date().getTime();
    var last = parseInt(turnstileState.lastAutoRetryAt, 10) || 0;
    // Avoid rapid loops if the error callback fires repeatedly.
    if (now - last < 900) return;
    turnstileState.lastAutoRetryAt = now;

    turnstileState.autoRetryCount = (parseInt(turnstileState.autoRetryCount, 10) || 0) + 1;

    // Always render fresh; Turnstile can get stuck in a verifying loop.
    rerenderTurnstile(form);

    // Keep one watchdog per attempt (and stop once we hit the limit).
    if (turnstileState.autoRetryCount < limit) scheduleTurnstileWatchdog(form);
  }

  window.melkapowTurnstileOk = function () {
    turnstileState.ok = true;
    turnstileState.hadError = false;
    turnstileState.lastError = null;
    turnstileState.errorShown = false;
    turnstileState.autoRetryCount = 0;
    turnstileState.autoRetryLocked = false;
    clearTurnstileWatchdog();
    setStatus("");
  };

  window.melkapowTurnstileError = function (code) {
    turnstileState.ok = false;
    turnstileState.hadError = true;
    var codeText = code ? String(code) : "";
    turnstileState.lastError = codeText || "error";
    var codeNum = parseInt(codeText, 10);

    if (!turnstileState.errorShown) {
      turnstileState.errorShown = true;
      var suffix = codeText ? " (" + codeText + ")" : "";
      var sitekey = "";
      try {
        var form = document.getElementById("contactForm");
        var container = form ? getTurnstileContainer(form) : null;
        sitekey = container ? String(container.getAttribute("data-sitekey") || "").trim() : "";
      } catch (_) {}
      setStatus(
        "Captcha error" +
          suffix +
          ". If this is a domain authorization issue, add " +
          location.hostname +
          " to the Turnstile widget's allowed hostnames" +
          (sitekey ? " (sitekey " + sitekey + ")" : "") +
          " and refresh."
      );
    }

    // 110xxx are configuration errors (e.g. 110200 = domain not authorized).
    // Retrying won't fix config issues, so stop immediately and leave the error visible
    // until the user navigates away (or explicitly resets).
    if (isFinite(codeNum) && Math.floor(codeNum / 1000) === 110) {
      lockAutoRetries(document.getElementById("contactForm"));
      return true;
    }

    if (window.location.hash === "#contact") {
      setTimeout(function () {
        if (window.location.hash !== "#contact") return;
        autoRetryTurnstile(document.getElementById("contactForm"), "error");
      }, 900);
    }

    return true;
  };

  window.melkapowTurnstileExpired = function () {
    turnstileState.ok = false;
    clearTurnstileWatchdog();
  };

  function getApiBase() {
    var base = window.MELKAPOW_API_BASE;
    if (typeof base === "string" && base.trim()) return base.replace(/\/+$/, "");
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "http://127.0.0.1:8000";
    return "";
  }

  function getStatusEl() {
    return document.getElementById("contactStatus");
  }

  function setStatus(message) {
    var el = getStatusEl();
    if (!el) return;
    var next = message || "";
    if (el.textContent === next) return;
    el.textContent = next;
  }

  function isTurnstileConfigured(form) {
    var el = form.querySelector(".cf-turnstile");
    if (!el) return false;
    var key = el.getAttribute("data-sitekey") || "";
    return !!key && key !== "YOUR_TURNSTILE_SITE_KEY";
  }

  function resetTurnstile() {
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      try {
        if (turnstileWidgetId) window.turnstile.reset(turnstileWidgetId);
        else window.turnstile.reset();
      } catch (_) {
        // ignore
      }
    }
  }

  function ensureTurnstileWhenContactOpens() {
    // Only work while #contact is active (avoids background retries).
    if (window.location.hash !== "#contact") return;

    var form = document.getElementById("contactForm");
    if (!form) return;

    resetTurnstileState();
    clearTurnstileWatchdog();
    setStatus("");

    if (!isTurnstileConfigured(form)) {
      removeTurnstileWidget(form);
      return;
    }

    loadTurnstileScript()
      .then(function () {
        if (window.location.hash !== "#contact") return;
        rerenderTurnstile(form);
        scheduleTurnstileWatchdog(form);
      })
      .catch(function () {
        if (window.location.hash !== "#contact") return;
        setStatus(
          isEmbedded()
            ? "Captcha can't load inside an embedded/preview frame. Open this site in a normal browser tab and try again."
            : "Captcha couldn't load. If you use blockers/privacy protections, allow challenges.cloudflare.com and refresh."
        );
      });
  }

  function initContactSubmit() {
    var form = document.getElementById("contactForm");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      setStatus("");

      var apiBase = getApiBase();
      if (!apiBase) {
        setStatus("Contact form isn't configured yet.");
        return;
      }

      var formData = new FormData(form);
      var name = String(formData.get("name") || "").trim();
      var email = String(formData.get("email") || "").trim();
      var message = String(formData.get("message") || "").trim();
      var website = String(formData.get("website") || "").trim();
      var token = String(formData.get("cf-turnstile-response") || "").trim();

      if (!name || !email || !message) {
        setStatus("Please fill out name, email, and message.");
        return;
      }

      if (website) {
        setStatus("Invalid submission.");
        return;
      }

      if (isTurnstileConfigured(form) && !token) {
        if (typeof window.turnstile === "undefined") {
          setStatus(
            isEmbedded()
              ? "Captcha can't load inside an embedded/preview frame. Open this site in a normal browser tab and try again."
              : "Loading captcha… If it never appears, try disabling blockers/privacy protections and refresh."
          );

          loadTurnstileScript()
            .then(function () {
              if (window.location.hash !== "#contact") return;
              rerenderTurnstile(form);
              scheduleTurnstileWatchdog(form);
            })
            .catch(function () {
              if (window.location.hash !== "#contact") return;
              setStatus(
                isEmbedded()
                  ? "Captcha can't load inside an embedded/preview frame. Open this site in a normal browser tab and try again."
                  : "Captcha couldn't load. If you use blockers/privacy protections, allow challenges.cloudflare.com and refresh."
              );
            });
          return;
        }

        // Ensure we have a rendered widget (the Contact article starts hidden),
        // and recover if a previous reset left it stuck/unclickable.
        rerenderTurnstile(form);

        if (window.turnstile && typeof window.turnstile.reset === "function") {
          // If Turnstile is stuck verifying/unclickable, nudging a reset here usually fixes it.
          resetTurnstile();
          scheduleTurnstileWatchdog(form);
        }

        if (turnstileState.hadError && !turnstileState.errorShown) {
          turnstileState.errorShown = true;
          setStatus("Captcha isn't configured for this domain (" + location.hostname + "). Check your Turnstile allowed hostnames.");
        } else {
          setStatus("Please complete the captcha.");
        }
        return;
      }

      var submitBtn = form.querySelector('input[type="submit"]');
      var originalLabel = submitBtn ? submitBtn.value : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.value = "Sending...";
      }

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = null;
      if (controller) {
        timeoutId = setTimeout(function () {
          try { controller.abort(); } catch (_) { /* ignore */ }
        }, 20000);
      }

      fetch(apiBase + "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          email: email,
          message: message,
          website: website || null,
          turnstile_token: token || null
        }),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () { return {}; })
            .then(function (data) {
              if (!res.ok) {
                var msg = (data && data.detail) ? String(data.detail) : "Send failed.";
                throw new Error(msg);
              }
              return data;
            });
        })
        .then(function () {
          setStatus("Message sent. Thank you!");
          var messageEl = form.querySelector("#message");
          if (messageEl) messageEl.value = "";

          var websiteEl = form.querySelector("#website");
          if (websiteEl) websiteEl.value = "";

          resetTurnstileState();
          clearTurnstileWatchdog();
          setTimeout(function () {
            rerenderTurnstile(form);
          }, 250);
        })
        .catch(function (err) {
          var msg = err && err.message ? String(err.message) : "";
          if (err && err.name === "AbortError") {
            setStatus("Request timed out. Please try again.");
            return;
          }
          if (msg.toLowerCase().includes("failed to fetch")) {
            var isLoopbackApi =
              apiBase.indexOf("http://127.0.0.1") === 0 ||
              apiBase.indexOf("http://localhost") === 0;

            var isLanApi = /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(apiBase);

            if (isLoopbackApi) {
              setStatus(
                "Can't reach the contact server at " +
                  apiBase +
                  ". If " +
                  apiBase +
                  "/api/health loads in a tab but this still fails, it's usually a CORS/origin mismatch (your site is " +
                  location.origin +
                  ")."
              );
            } else if (isLanApi) {
              setStatus(
                "Can't reach the contact server at " +
                  apiBase +
                  ". If you're testing on a phone, start the API with `--host 0.0.0.0` and confirm port 8000 is reachable on this network."
              );
            } else {
              setStatus("Network error. Please try again in a moment.");
            }
            return;
          }

          if (msg.toLowerCase().includes("captcha")) {
            resetTurnstileState();
            clearTurnstileWatchdog();
            setTimeout(function () {
              rerenderTurnstile(form);
            }, 250);
          } else if (token && isTurnstileConfigured(form)) {
            // Turnstile tokens are single-use; refresh after any submission attempt that used one.
            resetTurnstileState();
            clearTurnstileWatchdog();
            setTimeout(function () {
              rerenderTurnstile(form);
            }, 250);
          }

          setStatus(msg || "Send failed.");
        })
        .finally(function () {
          if (timeoutId) clearTimeout(timeoutId);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.value = originalLabel || "Send Message";
          }
        });
    });

    form.addEventListener("reset", function () {
      setTimeout(function () {
        resetTurnstileState();
        clearTurnstileWatchdog();
        if (window.location.hash === "#contact") rerenderTurnstile(form);
        else removeTurnstileWidget(form);
        setStatus("");
      }, 0);
    });
  }

  // ----- Contact form reset when leaving #contact -----
  function resetContactIfLeaving(prevHash, nextHash) {
    if (prevHash !== "#contact") return;      // only if we are leaving contact
    if (nextHash === "#contact") return;      // still on contact, do nothing

    var form = document.querySelector("#contact form");
    if (!form) return;

    clearTurnstileWatchdog();

    // tiny delay so it doesn't fight the template hide animation
    setTimeout(function () {
      form.reset();
    }, 150);
  }

  // Track hash transitions
  var lastHash = window.location.hash || "";

  window.addEventListener("hashchange", function () {
    var nextHash = window.location.hash || "";
    resetContactIfLeaving(lastHash, nextHash);
    lastHash = nextHash;

    if (nextHash === "#contact") ensureTurnstileWhenContactOpens();
  });

  // Also reset on load if contact isn't active (keeps it clean if user had stale inputs cached)
  window.addEventListener("load", function () {
    var currentHash = window.location.hash || "";
    if (currentHash !== "#contact") {
      var form = document.querySelector("#contact form");
      if (form) {
        removeTurnstileWidget(form);
        form.reset();
      }
    } else {
      ensureTurnstileWhenContactOpens();
    }
  });

  initContactSubmit();


})();
