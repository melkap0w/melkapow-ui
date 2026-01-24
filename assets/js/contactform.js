// Melkapow custom behavior (kept out of template main.js)
(function () {
  "use strict";

  var turnstileState = {
    ok: false,
    hadError: false,
    errorShown: false,
    lastError: null
  };

  function resetTurnstileState() {
    turnstileState.ok = false;
    turnstileState.hadError = false;
    turnstileState.errorShown = false;
    turnstileState.lastError = null;
  }

  window.melkapowTurnstileOk = function () {
    turnstileState.ok = true;
    turnstileState.hadError = false;
    turnstileState.lastError = null;
    turnstileState.errorShown = false;
  };

  window.melkapowTurnstileError = function (code) {
    turnstileState.ok = false;
    turnstileState.hadError = true;
    turnstileState.lastError = code || "error";

    if (!turnstileState.errorShown) {
      turnstileState.errorShown = true;
      setStatus("Captcha isn't configured for this domain (" + location.hostname + "). Check your Turnstile allowed hostnames.");
    }
  };

  window.melkapowTurnstileExpired = function () {
    turnstileState.ok = false;
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
        window.turnstile.reset();
      } catch (_) {
        // ignore
      }
    }
  }

  function retryTurnstileWhenContactOpens() {
    // Only retry while #contact is active (avoids background retries).
    if (window.location.hash !== "#contact") return;

    resetTurnstileState();
    setStatus("");

    // The template animates articles in/out; wait a beat so the widget isn't reset while hidden.
    var tries = 0;

    function attempt() {
      if (window.location.hash !== "#contact") return;

      if (window.turnstile && typeof window.turnstile.reset === "function") {
        resetTurnstile();
        return;
      }

      tries += 1;
      if (tries >= 4) return;
      setTimeout(attempt, 350);
    }

    setTimeout(attempt, 350);
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
          setStatus("Captcha couldn't load on this page. Check your Turnstile sitekey/domain.");
        } else if (turnstileState.hadError && !turnstileState.errorShown) {
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

      fetch(apiBase + "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          email: email,
          message: message,
          website: website || null,
          turnstile_token: token || null
        })
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
          form.reset();
          resetTurnstile();
        })
        .catch(function (err) {
          var msg = err && err.message ? String(err.message) : "";
          if (msg.toLowerCase().includes("failed to fetch")) {
            if (apiBase.indexOf("http://127.0.0.1") === 0 || apiBase.indexOf("http://localhost") === 0) {
              setStatus(
                "Can't reach the contact server at " +
                  apiBase +
                  ". If " +
                  apiBase +
                  "/api/health loads in a tab but this still fails, it's usually a CORS/origin mismatch (your site is " +
                  location.origin +
                  ")."
              );
            } else {
              setStatus("Network error. Please try again in a moment.");
            }
            return;
          }
          setStatus(msg || "Send failed.");
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.value = originalLabel || "Send Message";
          }
        });
    });
  }

  // ----- Contact form reset when leaving #contact -----
  function resetContactIfLeaving(prevHash, nextHash) {
    if (prevHash !== "#contact") return;      // only if we are leaving contact
    if (nextHash === "#contact") return;      // still on contact, do nothing

    var form = document.querySelector("#contact form");
    if (!form) return;

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

    if (nextHash === "#contact") retryTurnstileWhenContactOpens();
  });

  // Also reset on load if contact isn't active (keeps it clean if user had stale inputs cached)
  window.addEventListener("load", function () {
    var currentHash = window.location.hash || "";
    if (currentHash !== "#contact") {
      var form = document.querySelector("#contact form");
      if (form) form.reset();
    } else {
      retryTurnstileWhenContactOpens();
    }
  });

  initContactSubmit();


})();
